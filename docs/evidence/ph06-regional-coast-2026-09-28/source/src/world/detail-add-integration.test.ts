import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, isDetailCoastDocument, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from './atlas-format';
import { generationCanonical, validateGenerationRecipe, type AddDetailRecipe, type DetailShapeRecipe } from './generation-contract';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { AtlasGenerationSession, generationPreviewDigest, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, ADD_DETAIL_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { generateDetailShapeAtlas } from './generation/detail-shape-adapter';
import { generateAddDetailAtlas } from './generation/detail-shape-add-adapter';
import { encodeDetailCoastTile } from './detail-coast-codec';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { pickDetailCoastSurface } from './detail-coast-geometry';

const fast = { yieldTask: async () => {} }, world = { kind: 'world' } as const, api = getAtlasStorage(4), command = () => `edit-${crypto.randomUUID()}`;
function parameters(x = 1200) { return { pointsQ: [[x, 1200], [x + 64, 1200], [x + 64, 1264], [x, 1264]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 0, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 }; }
function firstRecipe(): DetailShapeRecipe { return { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: 'add-session-first', parameters: parameters() }; }
function addRecipe(x = 1500): AddDetailRecipe { return { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'add-detail-landmass', version: 1, fingerprint: ADD_DETAIL_GENERATOR_FINGERPRINT }, seed: 'add-session-next', parameters: parameters(x) }; }
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
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const block of page.locks ?? []) data.locks.set(lockKey(block.bx, block.by), block); for (const tile of page.detailCoast ?? []) data.detailCoast.set(`coast:${tile.bx}:${tile.by}`, tile); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return { data, root: handle.root };
}
let empty: AtlasDetailCoastDocument, first: AtlasDetailCoastDocument;
beforeAll(async () => { empty = await createGenerationDraft({ size: 128, name: '追加大陆真实事务样例', seed: 'additive-integration' }, fast, 4); first = (await generateDetailShapeAtlas({ base: empty, recipe: firstRecipe() }, fast)).data; }, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe('independent additive recipe through actual private session and storage', () => {
  it('confirms first and second land, restores all bytes, previews a third and undoes only the second', async () => {
    const initial = await commit(empty), owner = await OwnedAtlasSession.open(empty, initial.rootDigest, fast), session = new AtlasGenerationSession(owner);
    const p1 = await session.preview(command(), 0, initial.rootDigest, firstRecipe(), world, fast), c1 = detail((await session.confirm(confirmation(p1), fast)).data), r1 = await commit(c1, initial.root, p1);
    owner.publishReplacement(p1.candidateId, r1); session.published(p1.candidateId);
    const prior = await api.exportAtlasRawBackup(empty.manifest.draftId), p2 = await session.preview(command(), 1, r1.rootDigest, addRecipe(), world, fast);
    expect(p2.summary.detailAdd?.addedLandAreaTwiceQ2).toBeGreaterThan(0); expect(await generationPreviewDigest(p2)).toBe(p2.previewDigest);
    expect(owner.snapshot()).toEqual(c1); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(prior);
    await expect(session.confirm({ ...confirmation(p2), previewDigest: '0'.repeat(64) }, fast)).rejects.toThrow('未绑定');
    const c2 = detail((await session.confirm(confirmation(p2), fast)).data); expect(c2.manifest.generation.lastApplied?.recipe.generator.id).toBe('add-detail-landmass');
    const r2 = await commit(c2, r1.root, p2); owner.publishReplacement(p2.candidateId, r2); session.published(p2.candidateId);
    const reopened = await restore(empty.manifest.draftId); expect(reopened.data).toEqual(c2);
    const measured = await extractDetailCoastBase(reopened.data, fast), field = { tiles: reopened.data.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(measured.size, measured.centersQ, measured.elevationsMeters) };
    expect(pickDetailCoastSurface(field, { x: 1230, y: 1230 })?.land).toBe(true); expect(pickDetailCoastSurface(field, { x: 1530, y: 1230 })?.land).toBe(true);
    const p3 = await session.preview(command(), 2, r2.rootDigest, addRecipe(1800), world, fast); session.discard(p3.candidateId); expect(owner.snapshot()).toEqual(c2);
    const undo = await owner.prepareReplacementUndo(command(), fast); if (!undo) throw new Error('missing additive undo');
    const undone = detail(await owner.replacementDocumentAsync(undo.candidateId, fast)), undoReceipt = await commit(undone, r2.root, undo); owner.publishReplacement(undo.candidateId, undoReceipt);
    expect(undone.detailCoast).toEqual(c1.detailCoast); expect(undone.blocks).toEqual(c1.blocks); expect(undone.manifest.generation.lastApplied).toEqual(c1.manifest.generation.lastApplied); expect(undone.manifest.revision).toBe(3);
    expect((await restore(empty.manifest.draftId)).data).toEqual(undone);
  }, 30000);

  it('derives complete true locks, preserves a locked old continent and rejects overlap without source writes', async () => {
    const locked = cloneAtlasDocument(first), ids = new Uint8Array(1024), cell = 38 * 128 + 38; ids[(38 % 32) * 32 + 38 % 32] = 3;
    const block = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 1, by: 1, flags: ids };
    locked.locks.set(lockKey(1, 1), block); locked.manifest.constraints.lockRefs = [{ bx: 1, by: 1, hash: await hashAtlasCellLockBlock(block) }];
    await verifyAtlasDocument(locked, fast); const original = generationCanonical(locked.manifest), beforeTiles = [...locked.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]);
    const added = await generateAddDetailAtlas({ base: locked, recipe: addRecipe() }, fast); await verifyAtlasDocument(added.data, fast);
    expect(added.data.locks).toEqual(locked.locks); expect(added.data.manifest.catalogs).toEqual(locked.manifest.catalogs); expect(cell).toBe(4902);
    await expect(generateAddDetailAtlas({ base: locked, recipe: addRecipe(1220) }, fast)).rejects.toThrow(/接触|重叠|锁/);
    expect(generationCanonical(locked.manifest)).toBe(original); expect([...locked.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)])).toEqual(beforeTiles);
  }, 30000);

  it('retains preview cancellation, CAS rejection and old-format execution boundaries', async () => {
    const receipt = await commit(first), owner = await OwnedAtlasSession.open(first, receipt.rootDigest, fast), session = new AtlasGenerationSession(owner), raw = await api.exportAtlasRawBackup(first.manifest.draftId);
    const controller = new AbortController(); let reached = false;
    await expect(session.preview(command(), 0, receipt.rootDigest, addRecipe(), world, { ...fast, signal: controller.signal, onProgress: progress => { if (progress.stage === '核验追加大陆细场摘要') { reached = true; controller.abort(); } } })).rejects.toThrow();
    expect(reached).toBe(true); expect(session.pending).toBeNull(); expect(owner.replacementPending).toBe(false); expect(await api.exportAtlasRawBackup(first.manifest.draftId)).toEqual(raw);
    const p = await session.preview(command(), 0, receipt.rootDigest, addRecipe(), world, fast), candidate = detail((await session.confirm(confirmation(p), fast)).data);
    const concurrent = cloneAtlasDocument(first); concurrent.manifest.revision++; concurrent.manifest.name = '已由另一标签页保存'; const latest = await commit(concurrent, receipt.root);
    await expect(commit(candidate, receipt.root, p)).rejects.toThrow('CAS'); expect((await restore(first.manifest.draftId)).root).toEqual(latest.root); session.discard(p.candidateId);
    const old = await createGenerationDraft({ size: 128, name: '旧版仍隔离', seed: 'old-add-rejected' }, fast, 3), oldOwner = await OwnedAtlasSession.open(old, receipt.rootDigest, fast);
    await expect(new AtlasGenerationSession(oldOwner).preview(command(), 0, receipt.rootDigest, addRecipe(), world, fast)).rejects.toThrow('旧版本');
    expect(validateGenerationRecipe({ ...addRecipe(), generator: { ...addRecipe().generator, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT } })).toBe(false);
  }, 30000);
});
