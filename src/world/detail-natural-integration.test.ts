import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGenerationDraft, isDetailCoastDocument, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from './atlas-format';
import { type NaturalDetailRecipe, type AddNaturalDetailRecipe } from './generation-contract';
import { AtlasGenerationSession, generationPreviewDigest, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';
import { NATURAL_DETAIL_GENERATOR_FINGERPRINT, ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT, DETAIL_SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { generateDetailShapeAtlas } from './generation/detail-shape-adapter';
import { generateAddNaturalDetailAtlas } from './generation/detail-shape-natural-add-adapter';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { buildDetailCoastSurface, pickDetailCoastSurface } from './detail-coast-geometry';
import { sampleDetailCoastCoverage } from './detail-coast-field';
import { getCellLayerSlot } from './model';

const fast = { yieldTask: async () => {} }, world = { kind: 'world' } as const, api = getAtlasStorage(4), command = () => `edit-${crypto.randomUUID()}`;
const parameters = (x = 1000) => ({ pointsQ: [[x, 1000], [x + 192, 1000], [x + 192, 1192], [x, 1192]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastStructureWorld: 16, coastRoughnessWorld: 4, reliefMeters: 1800, shelfWidthWorld: 64, islandChainCount: 0, islandsPerChain: 3 });
const firstRecipe = (): NaturalDetailRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 2, fingerprint: NATURAL_DETAIL_GENERATOR_FINGERPRINT }, seed: 'natural-v2-actual-empty', parameters: parameters() });
const addRecipe = (x = 1700): AddNaturalDetailRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'add-detail-landmass', version: 2, fingerprint: ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT }, seed: 'natural-v2-next-land', parameters: parameters(x) });
function detail(data: AtlasDocument): AtlasDetailCoastDocument { if (!isDetailCoastDocument(data)) throw new Error('expected v4'); return data; }
const confirmation = (p: GenerationPreviewInfo) => ({ candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest });
async function commit(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null, selected?: PreparedAtlasReplacement) {
  const prep = await api.prepareAtlasCommit({ candidateId: selected?.candidateId ?? crypto.randomUUID(), commandId: selected?.commandId ?? command(), manifest: data.manifest, expectedRoot: root }, fast), blocks = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let start = 0; start < blocks.length; start += 16) await api.stageAtlasBlocks(prep.preparationId, blocks.slice(start, start + 16), fast);
  return api.commitAtlasPreparation(prep.preparationId, fast);
}
async function restore(id: string) {
  const handle = await api.openAtlasDraft(id, fast); if (!handle) throw new Error('missing saved world');
  const data: AtlasDetailCoastDocument = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const block of page.locks ?? []) data.locks.set(`lock:${block.bx}:${block.by}`, block); for (const tile of page.detailCoast ?? []) data.detailCoast.set(`coast:${tile.bx}:${tile.by}`, tile); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return data;
}
async function field(data: AtlasDetailCoastDocument) { const measured = await extractDetailCoastBase(data, fast); return { tiles: data.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(measured.size, measured.centersQ, measured.elevationsMeters) }; }
function compareExistingLand(before: Awaited<ReturnType<typeof field>>, after: Awaited<ReturnType<typeof field>>) {
  // A bounded window covers the entire first source contour plus its 20-world
  // envelope. Every source cell that contains old land compares actual pieces.
  for (let row = 486; row < 610; row += 4) {
    const rect = { column: 486, row, columns: 124, rows: 4 }, a = buildDetailCoastSurface(before, rect), b = buildDetailCoastSurface(after, rect);
    for (let index = 0; index < a.cells.length; index++) {
      const cell = a.cells[index], x = cell.column, y = cell.row;
      if ([sampleDetailCoastCoverage(before.tiles, x, y), sampleDetailCoastCoverage(before.tiles, x + 1, y), sampleDetailCoastCoverage(before.tiles, x, y + 1), sampleDetailCoastCoverage(before.tiles, x + 1, y + 1)].some(value => value >= 0)) expect(b.cells[index]).toEqual(cell);
    }
  }
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
describe('natural first and additive v2 through existing private save protocol', () => {
  it('starts from actual -100 m ocean, persists regional sea floor and v2 land, adds without changing old pieces/remote sea, restores and undoes', async () => {
    const empty = await createGenerationDraft({ size: 128, name: '真实空海自然大陆', seed: 'natural-empty' }, fast, 4);
    for (const block of empty.blocks.values()) if (block.layer === 'elevation') expect(block.values.every(value => value === -100)).toBe(true);
    const initial = await commit(empty), original = await api.exportAtlasRawBackup(empty.manifest.draftId), owner = await OwnedAtlasSession.open(empty, initial.rootDigest, fast), session = new AtlasGenerationSession(owner);
    const p1 = await session.preview(command(), 0, initial.rootDigest, firstRecipe(), world, fast);
    expect(p1.summary.detailNatural?.outlineEdgeTests).toBeGreaterThan(0); expect(p1.summary.detailShape).toBeUndefined(); expect(p1.summary.detailNatural?.oceanBaseProfile).toBe('natural-ocean-base-v1');
    expect(await generationPreviewDigest(p1)).toBe(p1.previewDigest); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original);
    const first = detail((await session.confirm(confirmation(p1), fast)).data), firstField = await field(first), farSea = pickDetailCoastSurface(firstField, { x: 3501, y: 3501 });
    expect(farSea?.land).toBe(false); expect(farSea!.height).toBeLessThan(-1000);
    const farSamples = [[3500, 3500], [3300, 600], [600, 3300]].map(([x, y]) => { const slot = getCellLayerSlot(first, 'elevation', Math.floor(y / 32) * 128 + Math.floor(x / 32)); return slot.block.values[slot.slot]; });
    expect(new Set(farSamples).size).toBeGreaterThan(1); expect(farSamples.every(height => height < -1000)).toBe(true);
    expect(first.manifest.generation.lastApplied?.recipe).toEqual(firstRecipe());
    const r1 = await commit(first, initial.root, p1); owner.publishReplacement(p1.candidateId, r1); session.published(p1.candidateId);
    const p2 = await session.preview(command(), 1, r1.rootDigest, addRecipe(), world, fast), second = detail((await session.confirm(confirmation(p2), fast)).data), secondField = await field(second);
    expect(p2.summary.detailNaturalAdd?.generated.outlineEdgeTests).toBeGreaterThan(0); expect(p2.summary.detailNaturalAdd?.addedLandAreaTwiceQ2).toBeGreaterThan(0); expect(p2.summary.detailAdd).toBeUndefined();
    compareExistingLand(firstField, secondField); expect(pickDetailCoastSurface(secondField, { x: 3501, y: 3501 })).toEqual(farSea);
    expect(pickDetailCoastSurface(secondField, { x: 1800, y: 1100 })?.land).toBe(true);
    const r2 = await commit(second, r1.root, p2); owner.publishReplacement(p2.candidateId, r2); session.published(p2.candidateId); expect(await restore(empty.manifest.draftId)).toEqual(second);
    const undo = await owner.prepareReplacementUndo(command(), fast); if (!undo) throw new Error('missing natural additive undo');
    const undone = detail(await owner.replacementDocumentAsync(undo.candidateId, fast)), receipt = await commit(undone, r2.root, undo); owner.publishReplacement(undo.candidateId, receipt);
    expect(undone.blocks).toEqual(first.blocks); expect(undone.detailCoast).toEqual(first.detailCoast); expect(undone.manifest.generation.lastApplied).toEqual(first.manifest.generation.lastApplied); expect(await restore(empty.manifest.draftId)).toEqual(undone);
  }, 30000);

  it('permits explicit v2 addition to a verified v1 landscape and rejects overlap without regenerating its shallow remote sea', async () => {
    const empty = await createGenerationDraft({ size: 128, name: '保留早期配方地图', seed: 'old-preserved' }, fast, 4), p = parameters();
    const old = (await generateDetailShapeAtlas({ base: empty, recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: 'old-v1-preserved', parameters: { pointsQ: p.pointsQ, coastRoughnessWorld: p.coastRoughnessWorld, reliefMeters: p.reliefMeters, shelfWidthWorld: p.shelfWidthWorld, islandChainCount: 0, islandsPerChain: 3 } } }, fast)).data;
    const source = structuredClone(old), before = await field(old), next = await generateAddNaturalDetailAtlas({ base: old, recipe: addRecipe() }, fast), after = await field(next.data);
    compareExistingLand(before, after); expect(pickDetailCoastSurface(after, { x: 3501, y: 3501 })).toEqual(pickDetailCoastSurface(before, { x: 3501, y: 3501 }));
    expect(pickDetailCoastSurface(after, { x: 3501, y: 3501 })!.height).toBe(-100);
    await expect(generateAddNaturalDetailAtlas({ base: old, recipe: addRecipe(1050) }, fast)).rejects.toThrow(/接触|重叠|距离带过近/); expect(old).toEqual(source);
  }, 30000);
});
