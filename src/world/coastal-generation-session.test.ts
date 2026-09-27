import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasDocument, type AtlasGenerationDocument, type GenerationRecipe, type ShapeRecipe } from './atlas-format';
import { encodeBlock, getCellLayerSlot, hashBlock } from './model';
import { cellVertexIds, getVertexPositionQ } from './topology';
import { buildCoastalSurface } from './coastal-surface';
import { coastalCellGeometrySignature } from './coastal-generation';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { LANDFORM_GENERATOR_FINGERPRINT, OCEAN_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { AtlasGenerationSession, generationPreviewDigest, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';

const fast = { yieldTask: async () => {} }, scope = { kind: 'world' } as const, api = getAtlasStorage(3), rootDigest = 'a'.repeat(64);
const commandId = () => `edit-${crypto.randomUUID()}`;
let empty: AtlasGenerationDocument<3>, coast: AtlasGenerationDocument<3>;
const shapeRecipe = (points = [[900, 900], [3000, 1000], [3000, 2900], [1900, 2900], [1900, 1800], [1000, 2100]]): ShapeRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: 'v3-session-real-handdraw',
  parameters: { pointsQ: points.map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 0, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128 },
});
const oceanRecipe: GenerationRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: OCEAN_GENERATOR_FINGERPRINT }, seed: 'v3-real-seafloor', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
function height(data: AtlasDocument, id: number) { const cell = getCellLayerSlot(data, 'elevation', id); return cell.block.values[cell.slot]; }
function elevation(data: AtlasDocument, id: number, value: number) { const cell = getCellLayerSlot(data, 'elevation', id); cell.block.values[cell.slot] = value; }
async function refresh(data: AtlasGenerationDocument) { for (const ref of data.manifest.blockRefs) ref.hash = await hashBlock(data.blocks.get(ref.key)!); }
function v3(data: AtlasDocument): AtlasGenerationDocument<3> {
  if (data.manifest.version !== 3 || !('locks' in data)) throw new Error('expected independent v3 candidate');
  return data as AtlasGenerationDocument<3>;
}
beforeAll(async () => {
  empty = await createGenerationDraft({ size: 128, seed: 'v3-session-actual-jittered-quads', name: '真实第三版生成会话合成地图' }, fast, 3);
  coast = cloneAtlasDocument(empty);
  for (let row = 25; row < 104; row++) for (let col = 24; col < 101; col++) if (col < 68 || row < 65) elevation(coast, row * 128 + col, 1500);
  await refresh(coast);
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
async function commit(data: AtlasGenerationDocument<3>, root: AtlasStoredRoot | null = null, preview?: GenerationPreviewInfo) {
  const prepared = await api.prepareAtlasCommit({ candidateId: preview?.candidateId ?? crypto.randomUUID(), commandId: preview?.commandId ?? commandId(), manifest: data.manifest, expectedRoot: root }, fast);
  const contents = [...data.blocks.values(), ...data.locks.values()];
  for (let start = 0; start < contents.length; start += 16) await api.stageAtlasBlocks(prepared.preparationId, contents.slice(start, start + 16), fast);
  return api.commitAtlasPreparation(prepared.preparationId, fast);
}
async function restore(id: string) {
  const handle = await api.openAtlasDraft(id, fast); if (!handle) throw new Error('missing committed v3 fixture');
  const data: AtlasGenerationDocument<3> = { manifest: handle.manifest, blocks: new Map(), locks: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const lock of page.locks ?? []) data.locks.set(lockKey(lock.bx, lock.by), lock); cursor = page.nextCursor; } while (cursor !== null);
  return data;
}
function clippedArea(data: AtlasGenerationDocument<3>) {
  let land = 0, total = 0;
  // Sum coordinates of the authority's actual pieces, independently of its
  // cached per-cell area fields and the generation summary accumulator.
  for (let start = 0; start < 128 ** 2; start += 128) for (const cell of buildCoastalSurface(data, Array.from({ length: 128 }, (_, index) => start + index)).cells) {
    for (const [onLand, pieces] of [[true, cell.land], [false, cell.sea]] as const) for (const [a, b, c] of pieces) {
      const area = (b.xQ6 - a.xQ6) * (c.yQ6 - a.yQ6) - (b.yQ6 - a.yQ6) * (c.xQ6 - a.xQ6); total += area; if (onLand) land += area;
    }
  }
  return { landAreaQ2: land / 36, worldAreaQ2: total / 36 };
}
function wholeCellArea(data: AtlasGenerationDocument) {
  let landAreaQ2 = 0, worldAreaQ2 = 0;
  for (let id = 0; id < 128 ** 2; id++) {
    const ids = cellVertexIds(data.manifest.spec, id), points = [ids[0], ids[1], ids[3], ids[2]].map(vertex => getVertexPositionQ(data, vertex));
    const area = points.reduce((sum, a, index) => { const b = points[(index + 1) % 4]; return sum + a.xQ * b.yQ - b.xQ * a.yQ; }, 0);
    worldAreaQ2 += area; if (height(data, id) >= 0) landAreaQ2 += area;
  }
  return { landAreaQ2, worldAreaQ2 };
}
function confirm(preview: GenerationPreviewInfo) { return { candidateId: preview.candidateId, commandId: preview.commandId, previewDigest: preview.previewDigest, expectedRevision: preview.baseRevision, expectedRootDigest: preview.baseRootDigest }; }

describe('v3 generation session, real candidates and independent persistent domain', () => {
  it('binds actual clipped areas to a private handdraw preview, explicitly confirms, persists and restores v3 geometry and recipe', async () => {
    const first = await commit(empty), original = await api.exportAtlasRawBackup(empty.manifest.draftId), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session);
    const preview = await generation.preview(commandId(), 0, first.rootDigest, shapeRecipe(), scope, fast), candidate = await generation.confirm(confirm(preview), fast), data = v3(candidate.data);
    expect(session.head.revision).toBe(0); expect(session.snapshot()).toEqual(empty); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original);
    expect(preview.summary).toMatchObject(clippedArea(data)); expect(preview.summary.landAreaQ2).not.toBe(wholeCellArea(data).landAreaQ2);
    expect(preview.summary.worldAreaQ2).toBe(2 * (4096 * 256) ** 2); expect(await generationPreviewDigest(preview)).toBe(preview.previewDigest);
    expect(data.manifest.surface).toEqual({ kind: 'land-mask-fan-v1', coordinateScale: 256 }); expect(data.manifest.generation.lastApplied?.recipe).toEqual(shapeRecipe());
    for (const [key, block] of empty.blocks) if (block.layer !== 'elevation') expect(encodeBlock(data.blocks.get(key)!)).toEqual(encodeBlock(block));
    await expect(generation.confirm({ ...confirm(preview), previewDigest: '0'.repeat(64) }, fast)).rejects.toThrow('未绑定');
    const receipt = await commit(data, first.root, preview); session.publishReplacement(preview.candidateId, receipt); generation.published(preview.candidateId);
    const restored = await restore(empty.manifest.draftId); expect(restored).toEqual(data); expect(clippedArea(restored)).toEqual(clippedArea(data));
    expect((await OwnedAtlasSession.open(restored, receipt.rootDigest, fast)).head.revision).toBe(1);
    expect(await getAtlasStorage(2).listAtlasDrafts()).toEqual([]); expect(generation.pending).toBeNull();
  }, 30000);

  it('leaves v2 whole-cell summaries unchanged for the identical real handdraw generator', async () => {
    const legacy = await createGenerationDraft({ size: 128, seed: empty.manifest.seed, name: '保持第二版解释' }, fast), session = await OwnedAtlasSession.open(legacy, rootDigest, fast), generation = new AtlasGenerationSession(session);
    const preview = await generation.preview(commandId(), 0, rootDigest, shapeRecipe(), scope, fast), candidate = await generation.confirm(confirm(preview), fast);
    if (!('locks' in candidate.data)) throw new Error('missing v2 locks');
    expect(candidate.data.manifest.version).toBe(2); expect('surface' in candidate.data.manifest).toBe(false); expect(preview.summary).toMatchObject(wholeCellArea(candidate.data));
    generation.discard(preview.candidateId); expect(session.snapshot()).toEqual(legacy);
  }, 30000);

  it.each(['local-landforms', 'ocean-floor'] as const)('%s changes real elevations but leaves every clipped shoreline and authoritative area unchanged', async kind => {
    const session = await OwnedAtlasSession.open(coast, rootDigest, fast), generation = new AtlasGenerationSession(session);
    const recipe: GenerationRecipe = kind === 'ocean-floor' ? oceanRecipe : { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'landforms', version: 1, fingerprint: LANDFORM_GENERATOR_FINGERPRINT }, seed: 'v3-real-local-mountains', parameters: { mountainRanges: 2, basins: 1, reliefMeters: 2400 } };
    const selected = kind === 'ocean-floor' ? scope : { kind: 'cell-rectangle' as const, column: 32, row: 32, columns: 64, rows: 64, transitionCells: 8 };
    const preview = await generation.preview(commandId(), 0, rootDigest, recipe, selected, fast), data = v3((await generation.confirm(confirm(preview), fast)).data); let changed = 0;
    for (let start = 0; start < 128 ** 2; start += 128) {
      const ids = Array.from({ length: 128 }, (_, index) => start + index), before = buildCoastalSurface(coast, ids), after = buildCoastalSurface(data, ids);
      expect(after.cells.map(coastalCellGeometrySignature)).toEqual(before.cells.map(coastalCellGeometrySignature));
      for (const id of ids) { expect(height(data, id) >= 0).toBe(height(coast, id) >= 0); if (height(data, id) !== height(coast, id)) changed++; }
    }
    expect(changed).toBeGreaterThan(0); expect(preview.summary.changedCellCount).toBe(changed); expect(preview.summary).toMatchObject(clippedArea(coast));
    if (kind === 'local-landforms') expect(preview.summary.landforms).toMatchObject(clippedArea(coast));
    generation.discard(preview.candidateId); expect(session.snapshot()).toEqual(coast); expect(generation.pending).toBeNull();
  }, 30000);

  it('rejects a real handdraw candidate whose new diagonal neighbor alters an old locked coast, retaining the original session', async () => {
    const base = cloneAtlasDocument(empty), id = 64 * 128 + 64; elevation(base, id, 1000);
    const lock = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 2, by: 2, flags: new Uint8Array(1024) }; lock.flags[0] = 1;
    base.locks.set(lockKey(2, 2), lock); base.manifest.constraints.lockRefs.push({ bx: 2, by: 2, hash: await hashAtlasCellLockBlock(lock) }); await refresh(base);
    const session = await OwnedAtlasSession.open(base, rootDigest, fast), generation = new AtlasGenerationSession(session), source = session.snapshot();
    // A 3x3 new island exceeds the existing generator's tiny-noise removal;
    // its nearest cell is still diagonal to the old protected land sample.
    const recipe = shapeRecipe([[65 * 32, 65 * 32], [68 * 32, 65 * 32], [68 * 32, 68 * 32], [65 * 32, 68 * 32]]);
    await expect(generation.preview(commandId(), 0, rootDigest, recipe, scope, fast)).rejects.toThrow('海岸锁');
    expect(generation.pending).toBeNull(); expect(session.replacementPending).toBe(false); expect(session.snapshot()).toEqual(source);
  }, 30000);

  it('cancels after real generation reaches v3 piece-area auditing without leaving a candidate or publishing any source change', async () => {
    const session = await OwnedAtlasSession.open(empty, rootDigest, fast), generation = new AtlasGenerationSession(session), aborter = new AbortController(); let reached = false;
    await expect(generation.preview(commandId(), 0, rootDigest, oceanRecipe, scope, { ...fast, signal: aborter.signal, onProgress: p => { if (p.stage === '核验实际裁切海岸面积与保护边界') { reached = true; aborter.abort(); } } })).rejects.toThrow();
    expect(reached).toBe(true); expect(generation.pending).toBeNull(); expect(session.replacementPending).toBe(false); expect(session.snapshot()).toEqual(empty);
  }, 30000);
});
