import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { AtlasWorkerRuntime } from './atlas.worker';
import { createGenerationDraft, isDetailCoastDocument, type AtlasDetailCoastDocument } from './atlas-format';
import { hashDetailCoastTile, encodeDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastTile } from './detail-coast-types';
import { getAtlasStorage } from './storage';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket } from './protocol';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { validateDetailShapeRecipe, validateShapeRecipe, type DetailShapeRecipe, type ShapeRecipe } from './generation-contract';
import { encodeBlock } from './model';

type Fault = 'count' | 'index' | 'key' | 'hash' | 'duplicate' | null;
class LoopWorker {
  static instances: LoopWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  fault: Fault = null;
  packets: { type: string; length: number }[] = [];
  private firstDetail?: Uint8Array;
  private runtime = new AtlasWorkerRuntime((bytes, transfer) => {
    if (this.closed) return;
    const { header, payload } = decodeAtlasPacket(bytes);
    this.packets.push({ type: header.type, length: bytes.length });
    let copy = structuredClone(bytes, { transfer });
    if (this.fault === 'count' && header.type === 'begin') {
      copy = encodeAtlasPacket({ ...header, body: { ...header.body as object, detailCoastCount: 0 } });
    }
    if (header.type === 'detail-coast') {
      const body = header.body as { index: number; key: string };
      if (this.fault === 'index') copy = encodeAtlasPacket({ ...header, body: { ...body, index: body.index + 1 } }, payload);
      if (this.fault === 'key') copy = encodeAtlasPacket({ ...header, body: { ...body, key: 'coast:63:63' } }, payload);
      if (this.fault === 'hash') { const altered = payload.slice(); altered[altered.length - 1] ^= 1; copy = encodeAtlasPacket(header, altered); }
      if (this.fault === 'duplicate' && this.firstDetail) copy = encodeAtlasPacket({ ...header, body: { index: 0, key: 'coast:0:0' } }, this.firstDetail);
      if (!this.firstDetail) this.firstDetail = payload.slice();
    }
    queueMicrotask(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); });
  });
  constructor() { LoopWorker.instances.push(this); }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const copy = structuredClone(bytes, { transfer });
    queueMicrotask(() => { if (!this.closed) this.runtime.receive(copy); });
  }
  terminate() { if (!this.closed) { this.closed = true; this.runtime.close(); } }
}
const fast = { yieldTask: async () => {} };
const clients: AtlasClient[] = [];
let fixture: AtlasDetailCoastDocument;
function client() { const value = new AtlasClient({ format: 4 }); clients.push(value); return value; }
async function storeFixture() {
  const database = getAtlasStorage(4), data = structuredClone(fixture);
  const prepared = await database.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: null }, fast);
  const items = [...data.blocks.values(), ...data.detailCoast.values()];
  for (let i = 0; i < items.length; i += 8) await database.stageAtlasBlocks(prepared.preparationId, items.slice(i, i + 8), fast);
  return database.commitAtlasPreparation(prepared.preparationId, fast);
}
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '细海岸传输合成图', seed: 'detail-transport' }, fast, 4);
  const count = detailCoastOwnerLayout(0, 0).count, coverageQ = new Int16Array(count), elevationMeters = new Int16Array(count);
  for (let i = 0; i < count; i++) { coverageQ[i] = i % 2 ? 127 : -255; elevationMeters[i] = i % 2 ? 340 : -1250; }
  const tiles: DetailCoastTile[] = [
    { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples', coverageQ, elevationMeters },
    { format: 'lieguoji-detail-coast-tile', version: 1, bx: 1, by: 1, mode: 'land' },
  ];
  for (const tile of tiles) { fixture.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile); fixture.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) }); }
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); LoopWorker.instances = []; vi.stubGlobal('Worker', LoopWorker); });
afterEach(async () => { clients.splice(0).forEach(value => value.close()); await new Promise(resolve => setTimeout(resolve, 0)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('v4 fine coast through actual Worker, framed packets and isolated IndexedDB', () => {
  it('generates the registered fine recipe through actual Worker preview, durable confirmation and a fresh complete third-stream restore', async () => {
    const c = client(), initial = await c.create({ size: 128, seed: 'fine-worker-generation', name: '真实细海岸Worker生成' }), api = getAtlasStorage(4), before = await api.exportAtlasRawBackup(initial.head.draftId);
    const recipe: DetailShapeRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: 'fine-worker-real-outline',
      parameters: { pointsQ: [[1200, 1200], [1300, 1200], [1300, 1300], [1260, 1300], [1260, 1240], [1230, 1240], [1230, 1300], [1200, 1300]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 5, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 } };
    expect(validateDetailShapeRecipe(recipe)).toBe(true);
    const preview = await c.previewGeneration(recipe);
    if (!isDetailCoastDocument(preview.data)) throw new Error('Expected real v4 generation candidate');
    const candidate = structuredClone(preview.data), count = candidate.manifest.detailCoast.refs.length;
    expect(count).toBeGreaterThan(0); expect(candidate.detailCoast.size).toBe(count); expect(preview.preview.recipe).toEqual(recipe); expect(preview.preview.summary.landAreaQ2).toBeGreaterThan(0);
    expect(preview.preview.summary.detailShape?.componentBasis).toBe('coarse-center-4-neighbor'); expect(candidate.manifest.generation.lastApplied?.recipe).toEqual(recipe);
    expect(c.current!.head.revision).toBe(0); expect(await api.exportAtlasRawBackup(initial.head.draftId)).toEqual(before);
    const worker = LoopWorker.instances.at(-1)!; expect(worker.packets.filter(packet => packet.type === 'detail-coast')).toHaveLength(count);
    const confirmed = await c.confirmGeneration(); expect(confirmed.head.revision).toBe(1); expect(confirmed.data).toEqual(candidate);
    for (const [key, block] of initial.data.blocks) if (block.layer !== 'elevation') expect(encodeBlock(confirmed.data.blocks.get(key)!)).toEqual(encodeBlock(block));
    const fresh = client(), restored = await fresh.restore(initial.head.draftId); expect(restored.head.rootDigest).toBe(confirmed.head.rootDigest); expect(restored.data).toEqual(candidate);
    if (!isDetailCoastDocument(restored.data)) throw new Error('Expected restored fine authority');
    for (const ref of restored.data.manifest.detailCoast.refs) expect(await hashDetailCoastTile(restored.data.detailCoast.get(detailCoastKey(ref.bx, ref.by))!)).toBe(ref.hash);
    expect((await api.openAtlasDraft(initial.head.draftId))!.manifest.generation.lastApplied?.recipe).toEqual(recipe);
    const packets = LoopWorker.instances.flatMap(item => item.packets); expect(packets.filter(packet => packet.type === 'detail-coast')).toHaveLength(3 * count); expect(packets.every(packet => packet.length <= ATLAS_PACKET_LIMIT)).toBe(true);
    for (const format of [1, 2, 3] as const) expect(await getAtlasStorage(format).openAtlasDraft(initial.head.draftId)).toBeNull();
  }, 40000);

  it('creates an explicit v4 domain and refuses unsupported old mutation/copy paths without changing its root', async () => {
    const c = client(), initial = await c.create({ size: 128, seed: 'empty-detail-world', name: '空白细海岸' });
    expect(isDetailCoastDocument(initial.data)).toBe(true);
    expect((await getAtlasStorage(4).openAtlasDraft(initial.head.draftId))?.root.domain).toBe('atlas-draft-v4');
    for (const format of [1, 2, 3] as const) expect(await getAtlasStorage(format).openAtlasDraft(initial.head.draftId)).toBeNull();
    const before = await getAtlasStorage(4).exportAtlasRawBackup(initial.head.draftId);
    await expect(c.edit({ elevation: { ids: new Uint32Array([0]), values: new Int32Array([200]) } }, '不支持的旧编辑')).rejects.toThrow('旧局部增量');
    await expect(c.fork()).rejects.toThrow('副本转换尚未实现');
    await expect(c.generationCopy()).rejects.toThrow('副本转换尚未实现');
    const recipe: ShapeRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: 'old-shape', parameters: { pointsQ: [{ xQ: 256 * 500, yQ: 256 * 500 }, { xQ: 256 * 1500, yQ: 256 * 500 }, { xQ: 256 * 1500, yQ: 256 * 1500 }], coastRoughnessWorld: 48, coastWavelengthWorld: 160, reliefMeters: 3000, shelfWidthWorld: 128 } };
    expect(validateShapeRecipe(recipe)).toBe(true);
    await expect(c.previewGeneration(recipe)).rejects.toThrow('旧生成器不能');
    expect(await getAtlasStorage(4).exportAtlasRawBackup(initial.head.draftId)).toEqual(before);
    expect((await c.restore(initial.head.draftId)).head.rootDigest).toBe(initial.head.rootDigest);
  }, 30000);

  it('restores real fine tiles, isolates public buffers, and preserves fine bytes through pure-lock preview, commit, undo and backup', async () => {
    await storeFixture(); const c = client(), initial = await c.restore(fixture.manifest.draftId);
    if (!isDetailCoastDocument(initial.data)) throw new Error('Expected v4 fixture');
    expect(initial.data).toEqual(fixture);
    const original = fixture.detailCoast.get('coast:0:0')!, exposed = initial.data.detailCoast.get('coast:0:0')!;
    if (exposed.mode !== 'samples') throw new Error('Expected sampled tile');
    exposed.coverageQ.fill(1); exposed.elevationMeters.fill(11999); initial.data.detailCoast.clear();
    const preview = await c.previewConstraints({ column: 2, row: 2, columns: 1, rows: 1 }, 3, 'set');
    if (!isDetailCoastDocument(preview.data)) throw new Error('Expected v4 preview');
    expect(encodeDetailCoastTile(preview.data.detailCoast.get('coast:0:0')!)).toEqual(encodeDetailCoastTile(original));
    const candidate = preview.data.detailCoast.get('coast:0:0')!;
    if (candidate.mode === 'samples') candidate.elevationMeters.fill(-100);
    const confirmed = await c.confirmConstraints();
    if (!isDetailCoastDocument(confirmed.data)) throw new Error('Expected v4 committed state');
    expect(confirmed.data.detailCoast).toEqual(fixture.detailCoast); expect(confirmed.head.revision).toBe(1);
    const backup = await client().restore(fixture.manifest.draftId, 'backup');
    expect(backup.head.readOnly).toBe(true); expect(backup.data).toEqual(fixture);
    const undone = await c.undo();
    expect(undone.head.revision).toBe(2); expect(isDetailCoastDocument(undone.data) && undone.data.detailCoast).toEqual(fixture.detailCoast);
    expect((await client().restore(fixture.manifest.draftId)).data).toEqual(undone.data);
    const packets = LoopWorker.instances.flatMap(worker => worker.packets);
    expect(packets.filter(packet => packet.type === 'detail-coast').length).toBeGreaterThanOrEqual(12);
    expect(packets.every(packet => packet.length <= ATLAS_PACKET_LIMIT)).toBe(true);
  }, 40000);

  it.each(['count', 'index', 'key', 'hash', 'duplicate'] as const)('rejects %s tampering before exposing a partial v4 view and retains durable storage', async fault => {
    const receipt = await storeFixture(), before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    const c = client(), worker = LoopWorker.instances.at(-1)!; worker.fault = fault;
    await expect(c.restore(fixture.manifest.draftId)).rejects.toThrow();
    expect(c.current).toBeNull(); expect(worker.closed).toBe(true);
    expect((await getAtlasStorage(4).openAtlasDraft(fixture.manifest.draftId))?.root.rootDigest).toBe(receipt.rootDigest);
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  }, 30000);
});
