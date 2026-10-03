import { generateTerrainResearch } from './seed-terrain';
import { SEED_TERRAIN_GENERATOR_ID, validSeedTerrainRequest } from './recovered-terrain/contract';
import { seedTerrainRequestDigest, type SeedTerrainTransferHeader } from './seed-terrain-wire';
import { TERRAIN_IMPORT_MAX_BYTES, importExact, terrainInputDigest } from './terrain-import-wire';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, type AtlasPacket } from './protocol';
import { yieldAtlasWorkerTask } from './worker-yield';

type Active = { id: number; sequence: number; controller: AbortController };
type Wait = { id: number; sequence: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Fixed bundled generator only. It has no persistence authority or dynamic code input. */
export class SeedTerrainWorkerRuntime {
  private active?: Active;
  private waiting?: Wait;
  private closed = false;
  constructor(private send: (bytes: Uint8Array, transfer: Transferable[]) => void) {}
  close() {
    this.closed = true; this.active?.controller.abort();
    if (this.waiting) { const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.reject(new DOMException('生成已取消。', 'AbortError')); }
  }
  private post(id: number, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    if (this.closed) return;
    const bytes = encodeAtlasPacket({ version: 1, id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    this.send(bytes, [bytes.buffer]);
  }
  receive(input: unknown) {
    if (this.closed) return;
    let packet: ReturnType<typeof decodeAtlasPacket>;
    try { packet = decodeAtlasPacket(input); } catch { this.close(); return; }
    const { header, payload } = packet;
    if (header.type === 'ack') {
      if (this.waiting?.id === header.id && this.waiting.sequence === header.sequence && !payload.length && header.body === undefined) {
        const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.resolve();
      }
      return;
    }
    if (header.type === 'cancel') { if (this.active?.id === header.id) this.close(); return; }
    if (header.type !== 'request') { this.close(); return; }
    if (this.active) { this.post(header.id, 'error', { message: '当前山海仍在生成。' }); return; }
    if (payload.length || !importExact(header.body, ['operation', 'request']) || header.body.operation !== 'generate' || !validSeedTerrainRequest(header.body.request)) {
      this.post(header.id, 'error', { message: '模板、种子或点网配置无效。' }); return;
    }
    const request = { ...header.body.request }, active: Active = { id: header.id, sequence: 0, controller: new AbortController() }; this.active = active;
    void (async () => {
      const requestDigest = await seedTerrainRequestDigest(request);
      active.controller.signal.throwIfAborted();
      const bytes = await generateTerrainResearch(request, { signal: active.controller.signal, yieldTask: yieldAtlasWorkerTask, onProgress: progress => this.post(active.id, 'progress', progress) });
      active.controller.signal.throwIfAborted();
      if (!(bytes instanceof Uint8Array) || bytes.length < 2 || bytes.length > TERRAIN_IMPORT_MAX_BYTES) throw new Error('生成地形超过传输容量，未创建任何草稿。');
      const sourceSha256 = await terrainInputDigest(bytes);
      const meta: SeedTerrainTransferHeader = { generatorId: SEED_TERRAIN_GENERATOR_ID, fingerprint: __SEED_TERRAIN_FINGERPRINT__, requestDigest, sourceSha256, byteLength: bytes.length };
      await this.chunk(active, 'begin', meta);
      for (let offset = 0; offset < bytes.length; offset += ATLAS_FRAGMENT_BYTES) await this.chunk(active, 'delta', { offset }, bytes.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
      active.controller.signal.throwIfAborted(); this.post(active.id, 'complete', meta);
    })().catch(error => this.post(active.id, 'error', { message: error instanceof Error ? error.message : '生成山海失败。' }))
      .finally(() => { if (this.active === active) this.active = undefined; });
  }
  private async chunk(active: Active, type: 'begin' | 'delta', body: unknown, payload?: Uint8Array) {
    active.controller.signal.throwIfAborted(); const sequence = active.sequence++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = undefined; reject(new Error('生成地形接收超时。')); }, 30000);
      this.waiting = { id: active.id, sequence, resolve, reject, timer };
      try { this.post(active.id, type, body, payload, sequence); } catch (error) { this.waiting = undefined; clearTimeout(timer); reject(error); }
    });
  }
}
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const runtime = new SeedTerrainWorkerRuntime((bytes, transfer) => self.postMessage(bytes, { transfer }));
  self.onmessage = event => runtime.receive(event.data);
}
