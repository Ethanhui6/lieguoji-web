import { createImportedTerrain, parseTerrainImport } from './terrain-import';
import { encodeAtlasManifest, hashAtlasManifest } from './atlas-format';
import { encodeBlock, blockKey, type AtlasControl } from './model';
import { encodeAtlasCellLockBlock, lockKey } from './generation-locks';
import { encodeDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, type AtlasPacket } from './protocol';
import { getAtlasStorage, ATLAS_STORAGE_PAGE_BYTES } from './storage';
import type { AtlasCommitReceipt } from './storage-types';
import { yieldAtlasWorkerTask } from './worker-yield';
import { TERRAIN_IMPORT_MAX_BYTES, importExact, importObject, type TerrainImportPreview } from './terrain-import-wire';

type Active = { id: number; control: AbortController; sequence: number };
type Upload = { bytes: Uint8Array; offset: number; name: string; size: 128 | 256 | 512 };
type Wait = { id: number; sequence: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Separate import authority: no current draft is opened or modified here. */
export class TerrainImportWorkerRuntime {
  private upload?: Upload;
  private candidate?: TerrainImportPreview;
  private active?: Active;
  private waiting?: Wait;
  private closed = false;
  constructor(private send: (bytes: Uint8Array, transfer: Transferable[]) => void) {}
  close() { this.closed = true; this.abort(); this.upload = undefined; this.candidate = undefined; }
  private abort() {
    this.active?.control.abort();
    if (this.waiting) { const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.reject(new DOMException('导入已取消。', 'AbortError')); }
  }
  private post(id: number, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    if (this.closed) return;
    const bytes = encodeAtlasPacket({ version: 1, id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    this.send(bytes, [bytes.buffer]);
  }
  receive(input: unknown) {
    if (this.closed) return;
    let packet: ReturnType<typeof decodeAtlasPacket>;
    try { packet = decodeAtlasPacket(input); } catch { this.abort(); this.upload = undefined; this.candidate = undefined; return; }
    const { header, payload } = packet;
    if (header.type === 'ack') {
      if (this.waiting?.id === header.id && this.waiting.sequence === header.sequence && !payload.length) { const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.resolve(); }
      return;
    }
    if (header.type === 'cancel') { if (this.active?.id === header.id) this.abort(); return; }
    if (header.type !== 'request') return;
    if (this.active) { this.post(header.id, 'error', { message: '请等待当前导入操作结束。' }); return; }
    const active: Active = { id: header.id, control: new AbortController(), sequence: 0 }; this.active = active;
    void this.execute(active, header.body, payload).catch(error => {
      this.upload = undefined; this.candidate = undefined;
      this.post(active.id, 'error', { message: error instanceof Error ? error.message : '地形导入失败。', cancelled: error instanceof Error && error.name === 'AbortError' });
    }).finally(() => { if (this.active === active) this.active = undefined; });
  }
  private control(active: Active): AtlasControl {
    return { signal: active.control.signal, yieldTask: yieldAtlasWorkerTask, onProgress: progress => this.post(active.id, 'progress', progress) };
  }
  private async chunk(active: Active, type: 'begin' | 'manifest' | 'block' | 'lock' | 'detail-coast', body?: unknown, payload?: Uint8Array) {
    active.control.signal.throwIfAborted(); const sequence = active.sequence++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = undefined; reject(new Error('导入预览接收超时，未保存草稿。')); }, 30000);
      this.waiting = { id: active.id, sequence, resolve, reject, timer };
      try { this.post(active.id, type, body, payload, sequence); } catch (error) { clearTimeout(timer); this.waiting = undefined; reject(error); }
    });
  }
  private async execute(active: Active, raw: unknown, payload: Uint8Array) {
    if (!importObject(raw) || !Object.hasOwn(raw, 'operation')) throw new Error('导入操作格式无效。');
    if (raw.operation === 'begin') {
      if (!importExact(raw, ['operation', 'bytes', 'name', 'size']) || payload.length || !Number.isSafeInteger(raw.bytes) || (raw.bytes as number) < 1 || (raw.bytes as number) > TERRAIN_IMPORT_MAX_BYTES || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80 || ![128, 256, 512].includes(raw.size as number)) throw new Error('请选择 12 MiB 以内的地形文件和有效草稿名称。');
      this.candidate = undefined; this.upload = { bytes: new Uint8Array(raw.bytes as number), offset: 0, name: raw.name.trim(), size: raw.size as Upload['size'] };
      this.post(active.id, 'complete', { operation: 'begin', offset: 0 }); return;
    }
    if (raw.operation === 'chunk') {
      const upload = this.upload;
      if (!importExact(raw, ['operation', 'offset']) || !upload || raw.offset !== upload.offset || !payload.length || payload.length > ATLAS_FRAGMENT_BYTES || upload.offset + payload.length > upload.bytes.length) throw new Error('地形文件分片缺失、重复或超限。');
      upload.bytes.set(payload, upload.offset); upload.offset += payload.length;
      this.post(active.id, 'complete', { operation: 'chunk', offset: upload.offset }); return;
    }
    if (payload.length) throw new Error('地形导入操作包含多余数据。');
    if (raw.operation === 'discard') {
      if (!importExact(raw, ['operation'])) throw new Error('取消导入请求无效。');
      this.upload = undefined; this.candidate = undefined; this.post(active.id, 'complete', { operation: 'discard' }); return;
    }
    if (raw.operation === 'end') {
      if (!importExact(raw, ['operation']) || !this.upload || this.upload.offset !== this.upload.bytes.length) throw new Error('地形文件尚未完整接收。');
      const upload = this.upload; this.upload = undefined;
      const parsed = await parseTerrainImport(upload.bytes, this.control(active));
      const { data, summary } = await createImportedTerrain(parsed, { name: upload.name, size: upload.size }, this.control(active));
      active.control.signal.throwIfAborted();
      const identity = { candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, draftId: data.manifest.draftId, manifestDigest: await hashAtlasManifest(data.manifest), sourceSha256: summary.sourceSha256 };
      const candidate: TerrainImportPreview = { data, summary, identity }; this.candidate = candidate;
      const manifest = encodeAtlasManifest(data.manifest);
      await this.chunk(active, 'begin', { ...identity, summary, manifestLength: manifest.length, blockCount: data.blocks.size, lockCount: data.locks.size, detailCoastCount: data.detailCoast.size });
      for (let offset = 0; offset < manifest.length; offset += ATLAS_FRAGMENT_BYTES) await this.chunk(active, 'manifest', { offset }, manifest.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
      for (const ref of data.manifest.blockRefs) await this.chunk(active, 'block', { key: ref.key }, encodeBlock(data.blocks.get(ref.key)!));
      for (const ref of data.manifest.constraints.lockRefs) { const key = lockKey(ref.bx, ref.by); await this.chunk(active, 'lock', { key }, encodeAtlasCellLockBlock(data.locks.get(key)!)); }
      for (const ref of data.manifest.detailCoast.refs) { const key = detailCoastKey(ref.bx, ref.by); await this.chunk(active, 'detail-coast', { key }, encodeDetailCoastTile(data.detailCoast.get(key)!)); }
      active.control.signal.throwIfAborted(); this.post(active.id, 'complete', { operation: 'end', ...identity }); return;
    }
    if (raw.operation === 'confirm') {
      const candidate = this.candidate;
      if (!importExact(raw, ['operation', 'candidateId', 'commandId', 'draftId', 'manifestDigest', 'sourceSha256']) || !candidate || Object.entries(candidate.identity).some(([key, value]) => raw[key] !== value)) throw new Error('导入确认与当前预览不一致，未保存草稿。');
      const receipt = await this.persist(active, candidate);
      this.candidate = undefined; this.post(active.id, 'complete', { operation: 'confirm', receipt }); return;
    }
    throw new Error('未知地形导入操作。');
  }
  private async persist(active: Active, candidate: TerrainImportPreview): Promise<AtlasCommitReceipt> {
    const database = getAtlasStorage(4), control = this.control(active), { data, identity } = candidate;
    try {
      // New independent identity only. No old root, backup or source manifest is accepted.
      const preparation = await database.prepareAtlasCommit({ candidateId: identity.candidateId, commandId: identity.commandId, manifest: data.manifest, expectedRoot: null }, control);
      const blocks = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
      const encoder = new TextEncoder(), base = encoder.encode(preparation.preparationId).length;
      let page: typeof blocks = [], pageBytes = base;
      const stage = async () => { if (page.length) await database.stageAtlasBlocks(preparation.preparationId, page, control); page = []; pageBytes = base; await yieldAtlasWorkerTask(); control.signal?.throwIfAborted(); };
      for (let i = 0; i < blocks.length; i++) {
        control.signal?.throwIfAborted(); const block = blocks[i];
        const item = block.format === 'lieguoji-detail-coast-tile' ? { bytes: encodeDetailCoastTile(block), key: detailCoastKey(block.bx, block.by) } : block.format === 'lieguoji-atlas-cell-locks' ? { bytes: encodeAtlasCellLockBlock(block), key: lockKey(block.bx, block.by) } : { bytes: encodeBlock(block), key: blockKey(block.layer, block.bx, block.by) };
        const cost = item.bytes.length + encoder.encode(item.key).length + 128;
        if (base + cost > ATLAS_STORAGE_PAGE_BYTES) throw new Error('导入草稿块超过安全存储分片上限。');
        if (pageBytes + cost > ATLAS_STORAGE_PAGE_BYTES) await stage();
        page.push(block); pageBytes += cost;
        if (i % 16 === 15) { control.onProgress?.({ stage: '准备独立地形草稿', completed: i + 1, total: blocks.length }); await yieldAtlasWorkerTask(); }
      }
      await stage(); return await database.commitAtlasPreparation(preparation.preparationId, control);
    } catch (error) {
      // A late abort or lost post-commit response is resolved by the original command.
      const receipt = await database.findAtlasReceipt(identity.draftId, identity.commandId).catch(() => null);
      if (receipt?.committed && receipt.candidateId === identity.candidateId && receipt.manifestDigest === identity.manifestDigest && receipt.baseRoot === null) return receipt;
      throw error;
    }
  }
}
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const runtime = new TerrainImportWorkerRuntime((bytes, transfer) => self.postMessage(bytes, { transfer }));
  self.onmessage = event => runtime.receive(event.data);
}
