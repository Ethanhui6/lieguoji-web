import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, verifyAtlasDocument, type AtlasGenerationDocument } from './atlas-format';
import { getCellLayerSlot, getVertexSlot, hashBlock } from './model';
import { cellVertexIds } from './topology';
import { assertAtlasLocksPreserved, assertAtlasReplacementLocksPreserved, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { assertDetailCoastCellProtection, assertOwnedDetailCoastLocksPreserved, detailCoastCellGeometrySignature } from './detail-coast-locks';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastNodeOwner, detailCoastOwnerLayout, type DetailCoastField, type DetailCoastSampleTile } from './detail-coast-types';
import { buildDetailCoastSurface } from './detail-coast-geometry';
import { OwnedAtlasSession } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';

const fast = { yieldTask: async () => {} }, lockedId = 20 * 128 + 20;
let empty: AtlasGenerationDocument<4>;
beforeAll(async () => {
  empty = await createGenerationDraft({ size: 128, seed: 'fine-lock-actual-pieces', name: '真实细海岸锁合成检验' }, fast, 4);
  for (const block of empty.blocks.values()) {
    if (block.layer === 'elevation') block.values.fill(-1000);
    if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
      const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % 129 * 32 * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / 129) * 32 * 256;
    }
  }
  await bind(empty);
}, 30000);
function samples(bx: number, by: number): DetailCoastSampleTile {
  const { count } = detailCoastOwnerLayout(bx, by);
  return { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ: new Int16Array(count).fill(-512), elevationMeters: new Int16Array(count).fill(-1000) };
}
function node(data: AtlasGenerationDocument<4>, x: number, y: number, coverage: number, elevation: number) {
  const owner = detailCoastNodeOwner(x, y); let tile = data.detailCoast.get(owner.key);
  if (!tile) { tile = samples(owner.bx, owner.by); data.detailCoast.set(owner.key, tile); }
  if (tile.mode !== 'samples') throw new Error('Synthetic node requires sampled owner.');
  tile.coverageQ[owner.slot] = coverage; tile.elevationMeters[owner.slot] = elevation;
}
function coarse(data: AtlasGenerationDocument<4>, id: number, elevation: number) { const slot = getCellLayerSlot(data, 'elevation', id); slot.block.values[slot.slot] = elevation; }
async function bind(data: AtlasGenerationDocument<4>) {
  for (const ref of data.manifest.blockRefs) ref.hash = await hashBlock(data.blocks.get(ref.key)!);
  data.manifest.constraints.lockRefs = await Promise.all([...data.locks.values()].sort((a, b) => a.by * 16 + a.bx - b.by * 16 - b.bx).map(async block => ({ bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) })));
  data.manifest.detailCoast.refs = await Promise.all([...data.detailCoast.values()].sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx).map(async tile => ({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) })));
  return data;
}
async function base(flags: 1 | 2 | 3 = 1) {
  const data = cloneAtlasDocument(empty), values = new Uint8Array(1024); values[20 * 32 + 20] = flags;
  data.locks.set(lockKey(0, 0), { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: values });
  return bind(data);
}
function next(data: AtlasGenerationDocument<4>) { const copy = cloneAtlasDocument(data); copy.manifest.revision++; return copy; }
async function ready(data: AtlasGenerationDocument<4>) { await bind(data); await verifyAtlasDocument(data, fast); return data; }
async function save(data: AtlasGenerationDocument<4>, root: AtlasStoredRoot | null = null) {
  const api = getAtlasStorage(4), prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, fast);
  const contents = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let offset = 0; offset < contents.length; offset += 16) await api.stageAtlasBlocks(prep.preparationId, contents.slice(offset, offset + 16), fast);
  return api.commitAtlasPreparation(prep.preparationId, fast);
}

describe('v4 exact fine lock replacement guard', () => {
  it('allows a distant new land tile and distant coarse height while preserving the locked true field', async () => {
    const before = await base(3), after = next(before);
    after.detailCoast.set('coast:50:50', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 50, by: 50, mode: 'land' }); coarse(after, 100 * 128 + 100, 2200); await ready(after);
    const source = cloneAtlasDocument(before), candidate = cloneAtlasDocument(after);
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).resolves.toBeUndefined();
    expect(before).toEqual(source); expect(after).toEqual(candidate);
    expect(() => assertAtlasLocksPreserved(before, after)).toThrow();
  });
  it('rejects changed real coast under mask 1 without locking unrelated heights', async () => {
    const before = await base(1); node(before, 328, 328, 512, 600); await ready(before);
    const heightOnly = next(before); node(heightOnly, 328, 328, 512, 1900); coarse(heightOnly, lockedId, -3000); await ready(heightOnly);
    await expect(assertAtlasReplacementLocksPreserved(before, heightOnly, fast)).resolves.toBeUndefined();
    const coastChanged = next(before); node(coastChanged, 328, 328, 256, 600); await ready(coastChanged);
    await expect(assertAtlasReplacementLocksPreserved(before, coastChanged, fast)).rejects.toThrow('海岸锁');
  });
  it('rejects changed actual sampled height under mask 2', async () => {
    const before = await base(2); node(before, 328, 328, 512, 600); await ready(before);
    const after = next(before); node(after, 328, 328, 512, 601); await ready(after);
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('高程锁');
  });
  it('rebuilds omitted sea Hbase so unchanged fine refs cannot conceal a neighbor height change', async () => {
    const before = await base(2), after = next(before); coarse(after, lockedId + 1, -7000); await ready(after);
    expect(after.manifest.detailCoast).toEqual(before.manifest.detailCoast);
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('高程锁');
  });
  it('rebuilds uniform land Hbase instead of treating a uniform tile as constant height', async () => {
    const before = await base(2); before.detailCoast.set('coast:10:10', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 10, by: 10, mode: 'land' }); await ready(before);
    const after = next(before); coarse(after, lockedId, 6000); await ready(after);
    expect(after.manifest.detailCoast).toEqual(before.manifest.detailCoast);
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('高程锁');
  });
  it('protects touched fine cells and reads their western sparse owner across a tile boundary', async () => {
    const before = await base(1), after = next(before); node(after, 319, 328, 512, 200); await ready(after);
    expect(detailCoastNodeOwner(319, 328).key).toBe('coast:9:10');
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('海岸锁');
  });
  it('uses a deformed true quad rather than the nominal coarse rectangle', async () => {
    const before = await base(1), ids = cellVertexIds(before.manifest.spec, lockedId);
    for (const id of [ids[1], ids[3]]) { const vertex = getVertexSlot(before, id); vertex.block.xyQ[vertex.slot * 2] += 6 * 256; }
    await ready(before); const after = next(before); node(after, 338, 330, 512, 200); await ready(after);
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('海岸锁');
  });
  it('protects an isolated zero-area land point even when piece coordinates and area are identical', async () => {
    const before = await base(1); node(before, 328, 328, -512, -1000); await ready(before);
    const after = next(before); node(after, 328, 328, 0, 0); await ready(after);
    const field = (data: AtlasGenerationDocument<4>): DetailCoastField => ({ tiles: data.detailCoast, sampleBaseElevation: () => -1000 });
    const rect = { column: 328, row: 328, columns: 1, rows: 1 };
    expect(detailCoastCellGeometrySignature(buildDetailCoastSurface(field(before), rect).cells[0])).toEqual(detailCoastCellGeometrySignature(buildDetailCoastSurface(field(after), rect).cells[0]));
    await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).rejects.toThrow('零面积归属');
  });
  it('includes neighboring negative-triangle dependencies of zero-edge shoreline ownership', async () => {
    const before = cloneAtlasDocument(empty); node(before, 100, 100, 0, 0); node(before, 101, 100, 0, 0); await ready(before);
    const after = next(before); node(after, 100, 99, 0, 0); await ready(after);
    const a: DetailCoastField = { tiles: before.detailCoast, sampleBaseElevation: () => -1000 }, b: DetailCoastField = { tiles: after.detailCoast, sampleBaseElevation: () => -1000 };
    const rectangle = { column: 100, row: 100, columns: 1, rows: 1 }, first = buildDetailCoastSurface(a, rectangle).cells[0], second = buildDetailCoastSurface(b, rectangle).cells[0];
    expect(first.land).toEqual(second.land); expect(first.sea).toEqual(second.sea); expect(first.shore).not.toEqual(second.shore);
    expect(() => assertDetailCoastCellProtection(first, second, a, b, 1)).toThrow('岸线');
  });
  it('accepts an equivalent coverage encoding when actual pieces and heights are unchanged', async () => {
    const before = await base(3); node(before, 328, 328, 512, 600); await ready(before);
    const after = next(before);
    for (const tile of after.detailCoast.values()) if (tile.mode === 'samples') for (let index = 0; index < tile.coverageQ.length; index++) tile.coverageQ[index] *= 2;
    await ready(after); await expect(assertAtlasReplacementLocksPreserved(before, after, fast)).resolves.toBeUndefined();
  });
  it('refuses missing or extra fine content instead of interpreting it as implicit sea', async () => {
    const before = await base(); node(before, 328, 328, 512, 600); await ready(before);
    const missing = next(before); missing.detailCoast.clear(); await expect(assertAtlasReplacementLocksPreserved(before, missing, fast)).rejects.toThrow('内容');
    const extra = next(before); extra.detailCoast.set('coast:50:50', samples(50, 50)); await expect(assertAtlasReplacementLocksPreserved(before, extra, fast)).rejects.toThrow('内容');
  });
  it('retains immutable identity, origin, locks and all nonheight coarse layers', async () => {
    const before = await base();
    const foreign = next(before); foreign.manifest.atlasId = `geo-${crypto.randomUUID()}`; await expect(assertAtlasReplacementLocksPreserved(before, foreign, fast)).rejects.toThrow('身份');
    const origin = next(before); origin.manifest.origin = {} as NonNullable<typeof origin.manifest.origin>; await expect(assertAtlasReplacementLocksPreserved(before, origin, fast)).rejects.toThrow('来源');
    const locks = next(before); locks.locks.get(lockKey(0, 0))!.flags[20 * 32 + 20] = 2; await expect(assertAtlasReplacementLocksPreserved(before, locks, fast)).rejects.toThrow('锁内容');
    const geometry = next(before), vertex = getVertexSlot(geometry, cellVertexIds(geometry.manifest.spec, 40 * 128 + 40)[0]); vertex.block.xyQ[vertex.slot * 2]++;
    await ready(geometry); await expect(assertAtlasReplacementLocksPreserved(before, geometry, fast)).rejects.toThrow('粗格几何');
    const member = next(before), slot = getCellLayerSlot(member, 'sim-membership', 0); slot.block.values[slot.slot] = 17;
    await expect(assertAtlasReplacementLocksPreserved(before, member, fast)).rejects.toThrow('粗数据层');
  });
  it('keeps old-format lock behavior and refuses mixed formats at the new async boundary', async () => {
    const old = await createGenerationDraft({ size: 128, seed: 'old-lock-async', name: '旧格式保护' }, fast, 2), copy = cloneAtlasDocument(old);
    copy.manifest.revision++; await expect(assertAtlasReplacementLocksPreserved(old, copy, fast)).resolves.toBeUndefined();
    await expect(assertAtlasReplacementLocksPreserved(empty, copy, fast)).rejects.toThrow('格式');
  });
  it('bounds retained meshes, reports actual checked cells and cancels without mutating either snapshot', async () => {
    const before = await base(1), after = next(before), source = cloneAtlasDocument(before), candidate = cloneAtlasDocument(after);
    const audit = await assertOwnedDetailCoastLocksPreserved(before, after, fast);
    expect(audit.lockedCoarseCells).toBe(1); expect(audit.protectedFineCells).toBe(18 * 18); expect(audit.checkedFineCells).toBe(audit.protectedFineCells);
    expect(audit.maxBuiltFineCells).toBeLessThanOrEqual(4096); expect(audit.checkedDisplayTiles).toBe(4);
    const controller = new AbortController(); let compared = false;
    await expect(assertAtlasReplacementLocksPreserved(before, after, { signal: controller.signal, yieldTask: fast.yieldTask,
      onProgress: progress => { if (progress.stage === '核验真实细海岸片与区域锁') { compared = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(compared).toBe(true); expect(before).toEqual(source); expect(after).toEqual(candidate);
  });
  it('uses the same fine guard in owned replacement and permits restoring the previous locked field', async () => {
    const before = await base(3), owner = await OwnedAtlasSession.open(before, 'a'.repeat(64), fast), after = next(before);
    after.detailCoast.set(detailCoastKey(50, 50), { format: 'lieguoji-detail-coast-tile', version: 1, bx: 50, by: 50, mode: 'land' }); await ready(after);
    const candidate = await owner.prepareReplacement(after, `edit-${crypto.randomUUID()}`, '远方相离大陆', fast);
    owner.publishReplacement(candidate.candidateId, { draftId: before.manifest.draftId, commandId: candidate.commandId, revision: candidate.revision, manifestDigest: candidate.manifestDigest, rootDigest: 'b'.repeat(64) });
    const undo = await owner.prepareReplacementUndo(`edit-${crypto.randomUUID()}`, fast); expect(owner.replacementDocument(undo.candidateId).detailCoast.size).toBe(0);
  });
  it('rechecks the verified private field at final storage commit and leaves current/backup untouched on failure', async () => {
    globalThis.indexedDB = new IDBFactory(); const before = await base(3), saved = await save(before), good = next(before);
    good.detailCoast.set('coast:50:50', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 50, by: 50, mode: 'land' }); await ready(good);
    const published = await save(good, saved.root), bad = next(good); node(bad, 328, 328, 512, 400); await ready(bad);
    await expect(save(bad, published.root)).rejects.toThrow('海岸锁');
    const handle = await getAtlasStorage(4).openAtlasDraft(before.manifest.draftId, fast);
    expect(handle!.root).toEqual(published.root); expect(handle!.manifest).toEqual(good.manifest);
    const backup = await getAtlasStorage(4).openAtlasDraft(before.manifest.draftId, { ...fast, source: 'backup' }); expect(backup!.manifest).toEqual(before.manifest);
  }, 30000);
});
