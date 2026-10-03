import { SEED_TERRAIN_GENERATOR_ID, validSeedTerrainRequest, type SeedTerrainRequest } from './recovered-terrain/contract';
import type { SeedTerrainPreview, SeedTerrainTransferHeader } from './seed-terrain-wire';
import { seedTerrainRequestDigest } from './seed-terrain-wire';
import { TerrainImportClient } from './terrain-import-bridge';
import { TERRAIN_IMPORT_MAX_BYTES, importExact, importHash, terrainInputDigest } from './terrain-import-wire';
import { decodeAtlasPacket, encodeAtlasPacket, type AtlasProgress } from './protocol';
import type { AtlasCommitReceipt } from './storage-types';

type Pending = { id: number; sequence: number; requestDigest: string; resolve: (value: { bytes: Uint8Array; sourceSha256: string }) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>; incoming?: { header: SeedTerrainTransferHeader; bytes: Uint8Array; offset: number } };

/** Sequential generation, then the existing verified import/atomic save path. */
export class SeedTerrainClient {
  private generator?: Worker;
  private importer?: TerrainImportClient;
  private pending?: Pending;
  private receiveQueue = Promise.resolve();
  private closed = false;
  private busy = false;
  private ready = false;
  private controller = new AbortController();
  constructor(private options: { onProgress?: (progress: AtlasProgress) => void; timeoutMs?: number } = {}) {}
  close() {
    if (this.closed) return; this.closed = true; this.controller.abort();
    this.releaseGenerator(); this.importer?.close(); this.importer = undefined; this.ready = false;
    if (this.pending) { const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.reject(new DOMException('生成预览已取消。', 'AbortError')); }
  }
  cancel() { this.close(); }
  private releaseGenerator() { this.generator?.terminate(); this.generator = undefined; }
  private fail(error: Error) {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
    this.close();
  }
  async preview(request: SeedTerrainRequest, options: { name: string }): Promise<SeedTerrainPreview> {
    if (this.closed || this.busy || this.ready || !validSeedTerrainRequest(request) || !options || typeof options.name !== 'string' || !options.name.trim() || options.name.trim().length > 80 || [...options.name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('请输入有效的世界名称、种子和模板。');
    const owned = { ...request }, name = options.name.trim(); this.busy = true;
    try {
      const requestDigest = await seedTerrainRequestDigest(owned); this.controller.signal.throwIfAborted();
      const source = await this.generate(owned, requestDigest); this.controller.signal.throwIfAborted();
      // No generator and importer run concurrently, and the source never needs a download.
      this.options.onProgress?.({ stage: '准备可编辑山海', completed: 0, total: 1 });
      const importer = new TerrainImportClient(this.options); this.importer = importer;
      const terrain = await importer.preview(source.bytes, { name, size: 128 }); this.controller.signal.throwIfAborted();
      if (terrain.identity.sourceSha256 !== source.sourceSha256 || terrain.summary.sourceSha256 !== source.sourceSha256) throw new Error('生成来源与转换预览不一致。');
      this.ready = true;
      return { terrain, generation: { generatorId: SEED_TERRAIN_GENERATOR_ID, fingerprint: __SEED_TERRAIN_FINGERPRINT__, request: owned, requestDigest, sourceSha256: source.sourceSha256 } };
    } catch (error) { this.close(); throw error; }
    finally { this.busy = false; }
  }
  async confirm(): Promise<AtlasCommitReceipt> {
    if (this.closed || this.busy || !this.ready || !this.importer) throw new Error('没有完整可确认的新世界预览。');
    const importer = this.importer; this.busy = true;
    try { const receipt = await importer.confirm(); this.ready = false; return receipt; }
    finally { this.busy = false; }
  }
  private generate(request: SeedTerrainRequest, requestDigest: string) {
    this.generator = new Worker(new URL('./seed-terrain.worker.ts', import.meta.url), { type: 'module' });
    this.generator.onmessage = event => { this.receiveQueue = this.receiveQueue.then(() => this.receive(event.data)).catch(error => this.fail(error instanceof Error ? error : new Error('生成地形接收失败。'))); };
    this.generator.onerror = () => this.fail(new Error('生成线程中断，未保存新世界。'));
    this.generator.onmessageerror = () => this.fail(new Error('生成地形传输中断。'));
    return new Promise<{ bytes: Uint8Array; sourceSha256: string }>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('生成地形超时，未保存新世界。')), this.options.timeoutMs ?? 120000);
      this.pending = { id: 1, sequence: 0, requestDigest, resolve, reject, timer };
      const bytes = encodeAtlasPacket({ version: 1, id: 1, type: 'request', body: { operation: 'generate', request } });
      try { this.generator!.postMessage(bytes, [bytes.buffer]); } catch (error) { this.fail(error instanceof Error ? error : new Error('无法启动生成线程。')); }
    });
  }
  private validHeader(body: unknown, requestDigest: string): body is SeedTerrainTransferHeader {
    return importExact(body, ['generatorId', 'fingerprint', 'requestDigest', 'sourceSha256', 'byteLength']) && body.generatorId === SEED_TERRAIN_GENERATOR_ID
      && body.fingerprint === __SEED_TERRAIN_FINGERPRINT__ && body.requestDigest === requestDigest && importHash(body.sourceSha256)
      && typeof body.byteLength === 'number' && Number.isSafeInteger(body.byteLength) && body.byteLength >= 2 && body.byteLength <= TERRAIN_IMPORT_MAX_BYTES;
  }
  private async receive(input: unknown) {
    if (this.closed || !this.generator) return;
    const { header, payload } = decodeAtlasPacket(input), pending = this.pending;
    if (!pending || header.id !== pending.id) throw new Error('生成地形响应身份不一致。');
    clearTimeout(pending.timer); pending.timer = setTimeout(() => this.fail(new Error('生成地形接收超时。')), this.options.timeoutMs ?? 120000);
    if (header.type === 'progress') {
      if (payload.length || !importExact(header.body, ['stage', 'completed', 'total']) || typeof header.body.stage !== 'string' || header.body.stage.length > 160 || typeof header.body.completed !== 'number' || typeof header.body.total !== 'number' || !Number.isFinite(header.body.completed) || !Number.isFinite(header.body.total) || header.body.completed < 0 || header.body.total < header.body.completed) throw new Error('生成进度格式无效。');
      this.options.onProgress?.(header.body as unknown as AtlasProgress); return;
    }
    if (header.type === 'error') {
      if (payload.length || !importExact(header.body, ['message']) || typeof header.body.message !== 'string') throw new Error('生成错误响应无效。');
      throw new Error(header.body.message);
    }
    if (header.type === 'complete') {
      const incoming = pending.incoming;
      if (payload.length || !incoming || incoming.offset !== incoming.bytes.length || !this.validHeader(header.body, pending.requestDigest) || header.body.sourceSha256 !== incoming.header.sourceSha256 || header.body.byteLength !== incoming.bytes.length) throw new Error('生成地形未完整接收。');
      const digest = await terrainInputDigest(incoming.bytes); this.controller.signal.throwIfAborted();
      if (this.pending !== pending || digest !== incoming.header.sourceSha256) throw new Error('生成地形内容摘要不一致。');
      this.pending = undefined; clearTimeout(pending.timer); this.releaseGenerator();
      pending.resolve({ bytes: incoming.bytes, sourceSha256: digest }); return;
    }
    if (header.sequence !== pending.sequence++) throw new Error('生成地形分片顺序无效。');
    if (header.type === 'begin') {
      if (pending.incoming || payload.length || !this.validHeader(header.body, pending.requestDigest)) throw new Error('生成地形预览头部无效。');
      pending.incoming = { header: { ...header.body }, bytes: new Uint8Array(header.body.byteLength), offset: 0 };
    } else if (header.type === 'delta') {
      const incoming = pending.incoming;
      if (!incoming || !importExact(header.body, ['offset']) || header.body.offset !== incoming.offset || !payload.length || incoming.offset + payload.length > incoming.bytes.length) throw new Error('生成地形分片重复、缺失或超限。');
      incoming.bytes.set(payload, incoming.offset); incoming.offset += payload.length;
      this.options.onProgress?.({ stage: '接收生成山海', completed: incoming.offset, total: incoming.bytes.length });
    } else throw new Error('未知生成地形响应。');
    const ack = encodeAtlasPacket({ version: 1, id: pending.id, type: 'ack', sequence: header.sequence });
    this.generator.postMessage(ack, [ack.buffer]);
  }
}
