import { decodeAtlasManifest, hashAtlasManifest, verifyAtlasDocument } from './atlas-format';
import { blockKey, decodeBlock } from './model';
import { decodeAtlasCellLockBlock, lockKey } from './generation-locks';
import { decodeDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';
import type { AtlasDetailCoastDocument } from './generation-contract';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, type AtlasPacket, type AtlasProgress } from './protocol';
import { getAtlasStorage } from './storage';
import type { AtlasCommitReceipt } from './storage-types';
import { TERRAIN_IMPORT_MAX_BYTES, importExact, importHash, importObject, validTerrainImportSummary, terrainInputDigest, type TerrainImportHeader, type TerrainImportIdentity, type TerrainImportPreview } from './terrain-import-wire';

type Incoming = { header: TerrainImportHeader; bytes: Uint8Array; offset: number; data?: AtlasDetailCoastDocument; receivedBytes: number };
type Pending = { id: number; operation: string; sequence: number; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; incoming?: Incoming };
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Bounded transport and independently verified receiver; candidate authority stays in the Worker. */
export class TerrainImportClient {
  private worker: Worker;
  private serial = 0;
  private pending?: Pending;
  private queue = Promise.resolve();
  private closed = false;
  private busy = false;
  private controller = new AbortController();
  private source?: { digest: string; bytes: number };
  private identity?: TerrainImportIdentity;
  constructor(private options: { onProgress?: (progress: AtlasProgress) => void; timeoutMs?: number } = {}) {
    this.worker = new Worker(new URL('./terrain-import.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => { this.queue = this.queue.then(() => this.receive(event.data)).catch(error => this.fail(error instanceof Error ? error : new Error('导入消息验证失败。'))); };
    this.worker.onerror = () => this.fail(new Error('地形导入线程中断；确认过的提交将按原回执核对。'));
    this.worker.onmessageerror = () => this.fail(new Error('地形导入传输失败。'));
  }
  close() { this.fail(new DOMException('地形导入已关闭。', 'AbortError')); }
  cancel() { if (this.pending) this.send(this.pending.id, 'cancel'); }
  private fail(error: Error) {
    if (this.closed) return; this.closed = true; this.controller.abort(); this.worker.terminate();
    if (this.pending) { const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.reject(error); }
  }
  private send(id: number, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    const bytes = encodeAtlasPacket({ version: 1, id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    this.worker.postMessage(bytes, [bytes.buffer]);
  }
  private request(operation: string, fields: object = {}, payload?: Uint8Array): Promise<unknown> {
    if (this.closed || this.pending) return Promise.reject(new Error('导入线程不可用或仍有操作进行中。'));
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('导入操作超时，请重新打开草稿目录核对保存状态。')), this.options.timeoutMs ?? 120000);
      this.pending = { id, operation, sequence: 0, resolve, reject, timer };
      try { this.send(id, 'request', { operation, ...fields }, payload); } catch (error) { this.fail(error instanceof Error ? error : new Error('导入请求失败。')); }
    });
  }
  async preview(bytes: Uint8Array, options: { name: string; size?: 128 | 256 | 512 }): Promise<TerrainImportPreview> {
    if (this.busy || this.identity || !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > TERRAIN_IMPORT_MAX_BYTES) throw new Error('请先取消已有预览，并选择 12 MiB 以内的地形文件。');
    this.busy = true; const owned = bytes.slice();
    try {
      this.source = { digest: await terrainInputDigest(owned), bytes: owned.length }; this.controller.signal.throwIfAborted();
      const begin = await this.request('begin', { bytes: owned.length, name: options.name, size: options.size ?? 128 });
      if (!importExact(begin, ['operation', 'offset']) || begin.operation !== 'begin' || begin.offset !== 0) throw new Error('导入起始确认无效。');
      for (let offset = 0; offset < owned.length; offset += ATLAS_FRAGMENT_BYTES) {
        const chunk = owned.slice(offset, offset + ATLAS_FRAGMENT_BYTES), ack = await this.request('chunk', { offset }, chunk);
        if (!importExact(ack, ['operation', 'offset']) || ack.operation !== 'chunk' || ack.offset !== offset + chunk.length) throw new Error('导入分片确认不连续。');
        this.options.onProgress?.({ stage: '读取本地地形文件', completed: ack.offset as number, total: owned.length });
      }
      return await this.request('end') as TerrainImportPreview;
    } catch (error) { this.identity = undefined; this.fail(error instanceof Error ? error : new Error('导入失败。')); throw error; }
    finally { this.busy = false; }
  }
  async discard(): Promise<void> {
    if (this.busy) throw new Error('请先取消进行中的导入。');
    this.identity = undefined; this.source = undefined;
    if (!this.closed) await this.request('discard');
  }
  async confirm(): Promise<AtlasCommitReceipt> {
    if (this.busy || !this.identity) throw new Error('没有经过完整校验的待确认地形。');
    const identity = { ...this.identity }; this.busy = true;
    try {
      let response: unknown, failure: unknown;
      try { response = await this.request('confirm', identity); } catch (error) { failure = error; }
      // Never infer cancellation from a lost reply and never retry with a fresh command.
      const receipt = await getAtlasStorage(4).findAtlasReceipt(identity.draftId, identity.commandId);
      if (!receipt || !receipt.committed || receipt.baseRoot !== null || receipt.candidateId !== identity.candidateId || receipt.manifestDigest !== identity.manifestDigest || receipt.draftId !== identity.draftId || receipt.commandId !== identity.commandId || receipt.root.domain !== 'atlas-draft-v4') throw failure ?? new Error('导入提交未取得有效回执，未切换当前草稿。');
      if (response !== undefined && (!importObject(response) || response.operation !== 'confirm' || !importObject(response.receipt) || response.receipt.rootDigest !== receipt.rootDigest)) throw new Error('导入响应与持久回执不一致，请从草稿目录恢复。');
      this.identity = undefined; this.source = undefined; return receipt;
    } finally { this.busy = false; }
  }
  private async receive(input: unknown) {
    if (this.closed) return;
    const { header, payload } = decodeAtlasPacket(input), pending = this.pending;
    if (!pending || header.id !== pending.id) throw new Error('导入响应身份不连续。');
    clearTimeout(pending.timer); pending.timer = setTimeout(() => this.fail(new Error('地形导入响应超时。')), this.options.timeoutMs ?? 120000);
    if (header.type === 'progress') {
      if (payload.length || !importExact(header.body, ['stage', 'completed', 'total']) || typeof header.body.stage !== 'string' || !Number.isFinite(header.body.completed) || !Number.isFinite(header.body.total)) throw new Error('导入进度无效。');
      this.options.onProgress?.(header.body as unknown as AtlasProgress); return;
    }
    if (header.type === 'error') {
      if (!importObject(header.body) || typeof header.body.message !== 'string') throw new Error('导入错误响应无效。');
      this.pending = undefined; clearTimeout(pending.timer); const error = new Error(header.body.message); if (header.body.cancelled) error.name = 'AbortError'; pending.reject(error); return;
    }
    if (header.type === 'complete') {
      if (payload.length || !importObject(header.body) || header.body.operation !== pending.operation) throw new Error('导入完成响应不匹配。');
      let result: unknown = header.body;
      if (pending.operation === 'end') {
        const incoming = pending.incoming, data = incoming?.data;
        if (!incoming || !data || incoming.offset !== incoming.bytes.length || data.blocks.size !== incoming.header.blockCount || data.locks.size !== incoming.header.lockCount || data.detailCoast.size !== incoming.header.detailCoastCount) throw new Error('导入候选地图接收不完整。');
        const identity: TerrainImportIdentity = { candidateId: incoming.header.candidateId, commandId: incoming.header.commandId, draftId: incoming.header.draftId, manifestDigest: incoming.header.manifestDigest, sourceSha256: incoming.header.sourceSha256 };
        if (Object.entries(identity).some(([key, value]) => (header.body as Record<string, unknown>)[key] !== value) || data.manifest.draftId !== identity.draftId || data.manifest.revision !== 0 || data.manifest.origin !== null || data.manifest.generation.lastApplied !== null || data.locks.size !== 0) throw new Error('导入候选身份或初始状态无效。');
        await verifyAtlasDocument(data, { signal: this.controller.signal, yieldTask: pause, onProgress: progress => this.options.onProgress?.(progress) });
        if (await hashAtlasManifest(data.manifest) !== identity.manifestDigest) throw new Error('导入候选内容摘要不一致。');
        this.controller.signal.throwIfAborted(); if (this.pending !== pending) throw new Error('地形导入接收已失效。');
        this.identity = identity; result = { data, identity: { ...identity }, summary: structuredClone(incoming.header.summary) } satisfies TerrainImportPreview;
      }
      this.pending = undefined; clearTimeout(pending.timer); pending.resolve(result); return;
    }
    if (pending.operation !== 'end' || header.sequence !== pending.sequence++) throw new Error('地形预览分片顺序无效。');
    if (header.type === 'begin') {
      const body = header.body, source = this.source;
      if (!source || pending.incoming || payload.length || !importExact(body, ['candidateId', 'commandId', 'draftId', 'manifestDigest', 'sourceSha256', 'summary', 'manifestLength', 'blockCount', 'lockCount', 'detailCoastCount']) || !importHash(body.manifestDigest) || body.sourceSha256 !== source.digest || !validTerrainImportSummary(body.summary) || body.summary.sourceSha256 !== source.digest || body.summary.sourceBytes !== source.bytes || typeof body.candidateId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.candidateId) || typeof body.commandId !== 'string' || !/^edit-[a-f0-9-]{36}$/.test(body.commandId) || typeof body.draftId !== 'string' || !/^atlas-[a-f0-9-]{36}$/.test(body.draftId) || !Number.isSafeInteger(body.manifestLength) || (body.manifestLength as number) < 1 || (body.manifestLength as number) > 16 * 1024 * 1024 || !Number.isInteger(body.blockCount) || (body.blockCount as number) < 1 || (body.blockCount as number) > 4096 || body.lockCount !== 0 || !Number.isInteger(body.detailCoastCount) || (body.detailCoastCount as number) < 0 || (body.detailCoastCount as number) > 4096) throw new Error('导入地图预览头部无效。');
      pending.incoming = { header: body as unknown as TerrainImportHeader, bytes: new Uint8Array(body.manifestLength as number), offset: 0, receivedBytes: 0 };
    } else {
      const incoming = pending.incoming; if (!incoming) throw new Error('导入预览缺少头部。');
      incoming.receivedBytes += payload.length; if (incoming.receivedBytes > 128 * 1024 * 1024) throw new Error('导入预览总数据超限。');
      if (header.type === 'manifest') {
        if (incoming.data || !importExact(header.body, ['offset']) || header.body.offset !== incoming.offset || !payload.length || incoming.offset + payload.length > incoming.bytes.length) throw new Error('导入地图清单分片无效。');
        incoming.bytes.set(payload, incoming.offset); incoming.offset += payload.length;
        if (incoming.offset === incoming.bytes.length) {
          const manifest = decodeAtlasManifest(incoming.bytes); if (manifest.version !== 4 || manifest.blockRefs.length !== incoming.header.blockCount || manifest.constraints.lockRefs.length !== incoming.header.lockCount || manifest.detailCoast.refs.length !== incoming.header.detailCoastCount) throw new Error('导入地图清单规格不一致。');
          incoming.data = { manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() };
        }
      } else {
        const data = incoming.data; if (!data || !importExact(header.body, ['key'])) throw new Error('导入地图块缺少有效清单。');
        const key = header.body.key;
        if (header.type === 'block') {
          const block = decodeBlock(payload), actual = blockKey(block.layer, block.bx, block.by);
          if (key !== actual || data.blocks.has(actual) || data.manifest.blockRefs[data.blocks.size]?.key !== actual) throw new Error('导入基础地块重复或顺序错误。'); data.blocks.set(actual, block);
        } else if (header.type === 'lock') {
          const block = decodeAtlasCellLockBlock(payload), actual = lockKey(block.bx, block.by);
          if (key !== actual || data.locks.has(actual)) throw new Error('导入锁块重复或无效。'); data.locks.set(actual, block);
        } else if (header.type === 'detail-coast') {
          const tile = decodeDetailCoastTile(payload), actual = detailCoastKey(tile.bx, tile.by), ref = data.manifest.detailCoast.refs[data.detailCoast.size];
          if (key !== actual || data.detailCoast.has(actual) || !ref || detailCoastKey(ref.bx, ref.by) !== actual) throw new Error('导入细地形块重复或顺序错误。'); data.detailCoast.set(actual, tile);
        } else throw new Error('未知导入预览分片。');
      }
    }
    this.send(header.id, 'ack', undefined, undefined, header.sequence);
  }
}
