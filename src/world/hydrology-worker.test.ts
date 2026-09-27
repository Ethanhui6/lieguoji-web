import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { AtlasWorkerRuntime } from './atlas.worker';
import { createGenerationDraft, isDetailCoastDocument, type AtlasDetailCoastDocument } from './atlas-format';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastOwnerLayout, type DetailCoastSampleTile } from './detail-coast-types';
import { hashAtlasCellLockBlock } from './generation-locks';
import type { AtlasCellLockBlock } from './generation-contract';
import { getAtlasStorage } from './storage';
import type { AtlasStoredRoot } from './storage-types';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket, type AtlasOperation } from './protocol';
import type { HydrologyTrace } from './hydrology-trace';

class HydrologyWorker {
  static instances: HydrologyWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  packets: { direction: string; type: string; bytes: number; body: unknown }[] = [];
  requestFault?: (operation: AtlasOperation) => AtlasOperation;
  responseFault?: (trace: HydrologyTrace) => HydrologyTrace;
  lateResponse = false;
  runtime = new AtlasWorkerRuntime((bytes, transfer) => {
    const { header } = decodeAtlasPacket(bytes); this.packets.push({ direction: 'out', type: header.type, bytes: bytes.length, body: header.body });
    let copy = structuredClone(bytes, { transfer });
    const body = header.body as { operation?: string; trace?: HydrologyTrace };
    if (header.type === 'complete' && body.operation === 'hydrology-analyze') {
      if (this.lateResponse) queueMicrotask(() => this.onmessage?.({ data: encodeAtlasPacket({ ...header, id: header.id - 1, body: { ...body, trace: { ...body.trace, version: 999 } } }) } as MessageEvent));
      if (this.responseFault) copy = encodeAtlasPacket({ ...header, body: { ...body, trace: this.responseFault(structuredClone(body.trace!)) } });
    }
    queueMicrotask(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); });
  });
  constructor() { HydrologyWorker.instances.push(this); }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const { header, payload } = decodeAtlasPacket(bytes); this.packets.push({ direction: 'in', type: header.type, bytes: bytes.length, body: header.body });
    let copy = structuredClone(bytes, { transfer });
    if (this.requestFault && header.type === 'request') copy = encodeAtlasPacket({ ...header, body: this.requestFault(header.body as AtlasOperation) }, payload);
    queueMicrotask(() => { if (!this.closed) this.runtime.receive(copy); });
  }
  terminate() { if (!this.closed) { this.closed = true; this.runtime.close(); } }
}
const fast = { yieldTask: async () => {} }, clients: AtlasClient[] = [];
const rectangle = { originColumn: 4, originRow: 4, columns: 10, rows: 10 }, sourceNode = { column: 6, row: 8 };
let fixture: AtlasDetailCoastDocument;
function client(options: ConstructorParameters<typeof AtlasClient>[0] = {}) { const c = new AtlasClient({ format: 4, ...options }); clients.push(c); return c; }
async function storeFixture(expectedRoot: AtlasStoredRoot | null = null) {
  const manifest = structuredClone(fixture.manifest); if (expectedRoot) manifest.revision = expectedRoot.revision + 1;
  const db = getAtlasStorage(4), prepared = await db.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest, expectedRoot }, fast);
  const blocks = [...fixture.blocks.values(), ...fixture.locks.values(), ...fixture.detailCoast.values()];
  for (let i = 0; i < blocks.length; i += 8) await db.stageAtlasBlocks(prepared.preparationId, blocks.slice(i, i + 8), fast);
  return db.commitAtlasPreparation(prepared.preparationId, fast);
}
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '水文通信合成地形', seed: 'ph07-hydrology-transport' }, fast, 4);
  const layout = detailCoastOwnerLayout(0, 0), tile: DetailCoastSampleTile = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples',
    coverageQ: new Int16Array(layout.count), elevationMeters: new Int16Array(layout.count) };
  for (let i = 0; i < layout.count; i++) { const x = i % layout.width; tile.coverageQ[i] = x < 12 ? 100 : -100; tile.elevationMeters[i] = x < 12 ? 1000 - x * 20 : -100; }
  fixture.detailCoast.set('coast:0:0', tile); fixture.manifest.detailCoast.refs = [{ bx: 0, by: 0, hash: await hashDetailCoastTile(tile) }];
  const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) }; lock.flags[0] = 3;
  fixture.locks.set('lock:0:0', lock); fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }];
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); HydrologyWorker.instances = []; vi.stubGlobal('Worker', HydrologyWorker); });
afterEach(async () => { clients.splice(0).forEach(c => c.close()); await new Promise(resolve => setTimeout(resolve, 0)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PH07 read-only hydrology over real Worker packets and persisted v4 terrain', () => {
  it('uses private saved fine heights despite mutated UI buffers, ignores late packets, and never writes a root or backup', async () => {
    const receipt = await storeFixture(), api = getAtlasStorage(4), before = await api.exportAtlasRawBackup(fixture.manifest.draftId);
    const c = client(), view = await c.restore(fixture.manifest.draftId), worker = HydrologyWorker.instances.at(-1)!; worker.lateResponse = true;
    if (!isDetailCoastDocument(view.data)) throw new Error('Expected v4');
    const tile = view.data.detailCoast.get('coast:0:0')!; if (tile.mode === 'samples') { tile.coverageQ.fill(-100); tile.elevationMeters.fill(-100); }
    const trace = await c.analyzeHydrology(rectangle, sourceNode);
    expect(trace.path).toEqual([6, 7, 8, 9, 10, 11].map(column => ({ column, row: 8 })));
    expect(trace).toMatchObject({ terminal: 'ocean', partial: true, coastPointQ: { xQ: 11 * 512 + 256, yQ: 8 * 512 } });
    expect(trace.source).toMatchObject({ revision: 0, rootDigest: receipt.rootDigest, manifestDigest: receipt.manifestDigest });
    expect(c.current).toBe(view); expect(c.head?.revision).toBe(0); expect(c.head?.undoCount).toBe(0);
    expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
    expect(worker.packets.filter(p => p.type === 'progress').some(p => (p.body as { stage: string }).stage.startsWith('水文计算：'))).toBe(true);
    expect(worker.packets.every(p => p.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
    expect(await client().restore(fixture.manifest.draftId)).toMatchObject({ head: { rootDigest: receipt.rootDigest, revision: 0, hasBackup: false } });
  });
  it('cancels a running kernel through the same task channel and can analyze again without a commit', async () => {
    await storeFixture(); let cancelled = false;
    const c = client({ onProgress: p => { if (!cancelled && p.stage === '水文计算：capture') { cancelled = true; c.cancel(); } } });
    await c.restore(fixture.manifest.draftId); const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    await expect(c.analyzeHydrology(rectangle, sourceNode)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true); expect((await c.analyzeHydrology(rectangle, sourceNode)).terminal).toBe('ocean');
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it.each(['head', 'unknown-field', 'outside'] as const)('Worker rejects %s request corruption independently of client input checks', async fault => {
    await storeFixture(); const c = client(); await c.restore(fixture.manifest.draftId); const worker = HydrologyWorker.instances.at(-1)!;
    worker.requestFault = operation => {
      if (operation.type !== 'hydrology-analyze') return operation;
      if (fault === 'head') return { ...operation, expected: { ...operation.expected, revision: operation.expected.revision + 1 } };
      if (fault === 'outside') return { ...operation, sourceNode: { column: 0, row: 0 } };
      return { ...operation, save: true } as AtlasOperation;
    };
    await expect(c.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow();
    expect(c.head?.revision).toBe(0); expect(worker.closed).toBe(false); worker.requestFault = undefined;
    expect((await c.analyzeHydrology(rectangle, sourceNode)).terminal).toBe('ocean');
  });
  it.each(['head', 'locks', 'jump', 'future'] as const)('bridge rejects %s response corruption without publishing a flow result or changing the saved map', async fault => {
    await storeFixture(); const c = client(); const view = await c.restore(fixture.manifest.draftId), worker = HydrologyWorker.instances.at(-1)!;
    const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    worker.responseFault = trace => {
      if (fault === 'head') trace.source.rootDigest = 'f'.repeat(64);
      if (fault === 'locks') trace.source.lockSetDigest = 'f'.repeat(64);
      if (fault === 'jump') trace.path.splice(1, 1);
      if (fault === 'future') Object.assign(trace, { version: 2 });
      return trace;
    };
    await expect(c.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow();
    expect(c.current).toBe(view); expect(worker.closed).toBe(true);
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('rejects a pending constraint preview in client and Worker, then resumes after discard', async () => {
    await storeFixture(); const c = client(); await c.restore(fixture.manifest.draftId);
    const selected = { column: 0, row: 0, columns: 1, rows: 1 };
    await c.previewConstraints(selected, 1, 'clear');
    await expect(c.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow('预览');
    // Bypass only the client preflight in this request: the actual Worker must
    // still enforce its pending-candidate rule before reading the saved head.
    const worker = HydrologyWorker.instances.at(-1)!, head = c.head!;
    worker.runtime.receive(encodeAtlasPacket({ version: 1, id: 9999, type: 'request', body: { type: 'hydrology-analyze', atlasFormat: 4, expected: { draftId: head.draftId, revision: head.revision, manifestDigest: head.manifestDigest, rootDigest: head.rootDigest }, rectangle, sourceNode } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(worker.packets.some(p => p.type === 'error' && (p.body as { message: string }).message.includes('区域锁预览'))).toBe(true);
    await c.discardConstraints();
    expect((await c.analyzeHydrology(rectangle, sourceNode)).terminal).toBe('ocean');
  });
  it('rejects a read-only backup in client and Worker without rewriting either stored slot', async () => {
    const first = await storeFixture(); await storeFixture(first.root);
    const api = getAtlasStorage(4), before = await api.exportAtlasRawBackup(fixture.manifest.draftId);
    const backup = client(); const view = await backup.restore(fixture.manifest.draftId, 'backup');
    await expect(backup.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow('可编辑');
    const worker = HydrologyWorker.instances.at(-1)!, head = view.head;
    worker.runtime.receive(encodeAtlasPacket({ version: 1, id: 9999, type: 'request', body: { type: 'hydrology-analyze', atlasFormat: 4, expected: { draftId: head.draftId, revision: head.revision, manifestDigest: head.manifestDigest, rootDigest: head.rootDigest }, rectangle, sourceNode } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(worker.packets.some(p => p.type === 'error' && (p.body as { message: string }).message.includes('只读'))).toBe(true);
    expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('blocks overlap and rejects old formats explicitly', async () => {
    await storeFixture(); const c = client(); await c.restore(fixture.manifest.draftId);
    const first = c.analyzeHydrology(rectangle, sourceNode); await expect(c.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow('尚未完成'); await first;
    const old = client({ format: 1 }); await old.create({ size: 128, name: '旧格式水文拒绝', seed: 'old-hydrology' });
    await expect(old.analyzeHydrology(rectangle, sourceNode)).rejects.toThrow('第四版');
  });
});
