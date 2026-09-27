import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, isDetailCoastDocument, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument, type DetailShapeRecipe, type ShapeRecipe } from './atlas-format';
import { encodeBlock } from './model';
import { hashDetailCoastTile } from './detail-coast-codec';
import { summarizeDetailCoast } from './detail-coast-geometry';
import { lockKey } from './generation-locks';
import { AtlasGenerationSession, generationPreviewDigest, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const fast = { yieldTask: async () => {} }, api = getAtlasStorage(4), world = { kind: 'world' } as const;
const command = () => `edit-${crypto.randomUUID()}`;
const recipe = (): DetailShapeRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: 'actual-v4-session',
  parameters: { pointsQ: [[1200, 1200], [1300, 1200], [1300, 1300], [1260, 1300], [1260, 1240], [1230, 1240], [1230, 1300], [1200, 1300]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 5, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 } });
let empty: AtlasDetailCoastDocument;
beforeAll(async () => { empty = await createGenerationDraft({ size: 128, seed: 'v4-session-fixture', name: '第四版真实生成保存' }, fast, 4); }, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
function detail(data: AtlasDocument): AtlasDetailCoastDocument { if (!isDetailCoastDocument(data)) throw new Error('expected v4 candidate'); return data; }
function confirmation(preview: GenerationPreviewInfo) { return { candidateId: preview.candidateId, commandId: preview.commandId, previewDigest: preview.previewDigest, expectedRevision: preview.baseRevision, expectedRootDigest: preview.baseRootDigest }; }
async function commit(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null, selected?: PreparedAtlasReplacement) {
  const prep = await api.prepareAtlasCommit({ candidateId: selected?.candidateId ?? crypto.randomUUID(), commandId: selected?.commandId ?? command(), manifest: data.manifest, expectedRoot: root }, fast), contents = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let start = 0; start < contents.length; start += 16) await api.stageAtlasBlocks(prep.preparationId, contents.slice(start, start + 16), fast);
  return api.commitAtlasPreparation(prep.preparationId, fast);
}
async function restore() {
  const handle = await api.openAtlasDraft(empty.manifest.draftId, fast); if (!handle) throw new Error('missing v4 persisted fixture');
  const data: AtlasDetailCoastDocument = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const lock of page.locks ?? []) data.locks.set(lockKey(lock.bx, lock.by), lock); for (const tile of page.detailCoast ?? []) data.detailCoast.set(`coast:${tile.bx}:${tile.by}`, tile); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return data;
}

describe('v4 exact private generation preview, durable receipt and restore', () => {
  it('binds real fine area and recipe, keeps preview private, confirms exact identity, restores bytes and undoes the full candidate', async () => {
    const first = await commit(empty), original = await api.exportAtlasRawBackup(empty.manifest.draftId), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session);
    const preview = await generation.preview(command(), 0, first.rootDigest, recipe(), world, fast);
    expect(session.snapshot()).toEqual(empty); expect(session.head.revision).toBe(0); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original); expect(await generationPreviewDigest(preview)).toBe(preview.previewDigest);
    await expect(generation.confirm({ ...confirmation(preview), previewDigest: '0'.repeat(64) }, fast)).rejects.toThrow('未绑定');
    await expect(generation.confirm({ ...confirmation(preview), expectedRevision: 1 }, fast)).rejects.toThrow('未绑定');
    const selected = await generation.confirm(confirmation(preview), fast), data = detail(selected.data), area = await summarizeDetailCoast(data.detailCoast, { yieldControl: fast.yieldTask });
    expect(preview.summary.landAreaQ2).toBe(area.landAreaTwiceQ2); expect(preview.summary.worldAreaQ2).toBe(area.totalAreaTwiceQ2); expect(data.manifest.generation.lastApplied).toMatchObject({ recipe: recipe(), scope: world, baseManifestDigest: first.manifestDigest, baseRootDigest: first.rootDigest, baseRevision: 0, appliedRevision: 1 });
    for (const [key, block] of empty.blocks) if (block.layer !== 'elevation') expect(encodeBlock(data.blocks.get(key)!)).toEqual(encodeBlock(block));
    const publicTile = [...data.detailCoast.values()].find(tile => tile.mode === 'samples')!; if (publicTile.mode !== 'samples') throw new Error('missing real samples'); const changedSlot = publicTile.coverageQ.findIndex(value => value !== 0); expect(changedSlot).toBeGreaterThanOrEqual(0); publicTile.coverageQ[changedSlot] = 0; publicTile.elevationMeters[changedSlot] = 0;
    const pristine = detail((await generation.confirm(confirmation(preview), fast)).data); await verifyAtlasDocument(pristine, fast);
    const receipt = await commit(pristine, first.root, preview); session.publishReplacement(preview.candidateId, receipt); generation.published(preview.candidateId);
    const restored = await restore(); expect(restored).toEqual(pristine); expect(generation.pending).toBeNull(); expect((await OwnedAtlasSession.open(restored, receipt.rootDigest, fast)).head.revision).toBe(1);
    for (const ref of restored.manifest.detailCoast.refs) expect(await hashDetailCoastTile(restored.detailCoast.get(`coast:${ref.bx}:${ref.by}`)!)).toBe(ref.hash);
    const undo = await session.prepareReplacementUndo(command(), fast); if (!undo) throw new Error('missing full undo'); const undoData = detail(await session.replacementDocumentAsync(undo.candidateId, fast)), undone = await commit(undoData, receipt.root, undo); session.publishReplacement(undo.candidateId, undone);
    expect(undoData.detailCoast.size).toBe(0); expect(undoData.manifest.generation.lastApplied).toBeNull(); expect(undoData.manifest.revision).toBe(2); expect((await restore()).blocks).toEqual(empty.blocks); expect(await getAtlasStorage(2).listAtlasDrafts()).toEqual([]); expect(await getAtlasStorage(3).listAtlasDrafts()).toEqual([]);
  }, 30000);

  it('discards a completed preview and cancels actual fine hashing without a partial candidate or DB write', async () => {
    const first = await commit(empty), original = await api.exportAtlasRawBackup(empty.manifest.draftId), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session);
    const preview = await generation.preview(command(), 0, first.rootDigest, recipe(), world, fast); generation.discard(preview.candidateId); expect(generation.pending).toBeNull(); expect(session.replacementPending).toBe(false);
    const aborter = new AbortController(); let reached = false;
    await expect(generation.preview(command(), 0, first.rootDigest, recipe(), world, { ...fast, signal: aborter.signal, onProgress(value) { if (value.stage === '核验细大陆权威细场摘要') { reached = true; aborter.abort(); } } })).rejects.toThrow();
    expect(reached).toBe(true); expect(session.snapshot()).toEqual(empty); expect(session.replacementPending).toBe(false); expect(generation.pending).toBeNull(); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original);
  }, 30000);

  it('rejects old recipes in v4 and rejects the new fine recipe in both old generation formats', async () => {
    const first = await commit(empty), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session), fine = recipe();
    const old: ShapeRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: fine.seed, parameters: { pointsQ: fine.parameters.pointsQ, coastRoughnessWorld: 0, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128 } };
    await expect(generation.preview(command(), 0, first.rootDigest, old, world, fast)).rejects.toThrow('第四版');
    for (const format of [2, 3] as const) { const data = await createGenerationDraft({ size: 128, seed: 'old', name: '旧档拒绝细场' }, fast, format), oldSession = await OwnedAtlasSession.open(data, first.rootDigest, fast); await expect(new AtlasGenerationSession(oldSession).preview(command(), 0, first.rootDigest, fine, world, fast)).rejects.toThrow('旧版本'); expect(oldSession.snapshot()).toEqual(data); }
    expect(session.snapshot()).toEqual(empty);
  });

  it('refuses a second mainland after the persisted first generation and leaves all fine references untouched', async () => {
    const first = await commit(empty), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session), preview = await generation.preview(command(), 0, first.rootDigest, recipe(), world, fast), data = detail((await generation.confirm(confirmation(preview), fast)).data), receipt = await commit(data, first.root, preview); session.publishReplacement(preview.candidateId, receipt); generation.published(preview.candidateId);
    const original = await api.exportAtlasRawBackup(empty.manifest.draftId);
    await expect(generation.preview(command(), 1, receipt.rootDigest, recipe(), world, fast)).rejects.toThrow('空世界'); expect(session.snapshot()).toEqual(data); expect(generation.pending).toBeNull(); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original);
  }, 30000);

  it('keeps final storage CAS authoritative if another full candidate commits after the preview', async () => {
    const first = await commit(empty), session = await OwnedAtlasSession.open(empty, first.rootDigest, fast), generation = new AtlasGenerationSession(session), preview = await generation.preview(command(), 0, first.rootDigest, recipe(), world, fast), selected = detail((await generation.confirm(confirmation(preview), fast)).data);
    const concurrent = cloneAtlasDocument(empty); concurrent.manifest.revision++; concurrent.manifest.name = '另一个已确认版本'; const accepted = await commit(concurrent, first.root), original = await api.exportAtlasRawBackup(empty.manifest.draftId);
    await expect(commit(selected, first.root, preview)).rejects.toThrow('CAS'); expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(original); expect((await api.openAtlasDraft(empty.manifest.draftId, fast))!.root).toEqual(accepted.root); generation.discard(preview.candidateId); expect(session.snapshot()).toEqual(empty);
  }, 30000);
});
