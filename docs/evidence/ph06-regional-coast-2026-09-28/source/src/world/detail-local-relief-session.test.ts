import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGenerationDraft, decodeAtlasManifest, encodeAtlasManifest, isDetailCoastDocument, validateAtlasManifest, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument, type LocalDetailReliefRecipe } from './atlas-format';
import { createAtlasDraft, encodeBlock } from './model';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';
import { validateGenerationOperation, validateLocalDetailReliefRecipe } from './generation-contract';
import { AtlasGenerationSession, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';
import { LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT, DETAIL_SHAPE_GENERATOR_FINGERPRINT, ADD_DETAIL_GENERATOR_FINGERPRINT, NATURAL_DETAIL_GENERATOR_FINGERPRINT, ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const fast = { yieldTask: async () => {} }, api = getAtlasStorage(4);
const scope = { kind: 'cell-rectangle', column: 38, row: 38, columns: 16, rows: 16, transitionCells: 2 } as const;
const recipe = (): LocalDetailReliefRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1,
  generator: { id: 'local-detail-relief', version: 1, fingerprint: LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT },
  seed: 'local-relief-session', parameters: { reliefMeters: 2600 } });
const command = () => `edit-${crypto.randomUUID()}`;
const confirmation = (p: GenerationPreviewInfo) => ({ candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest });
function detail(data: AtlasDocument): AtlasDetailCoastDocument { if (!isDetailCoastDocument(data)) throw new Error('Expected detailed candidate'); return data; }
let base: AtlasDetailCoastDocument;
beforeAll(async () => {
  base = await createGenerationDraft({ size: 128, seed: 'local-relief-fixture', name: '测试用已有大陆' }, fast, 4);
  // Real supported implicit-land tiles. Coarse Hbase remains the generated
  // ocean fixture; materializing these tiles must retain their clamped old heights.
  for (let by = 16; by < 32; by++) for (let bx = 16; bx < 32; bx++) {
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' } as const;
    base.detailCoast.set(detailCoastKey(bx, by), tile);
    base.manifest.detailCoast.refs.push({ bx, by, hash: await hashDetailCoastTile(tile) });
  }
  await verifyAtlasDocument(base, fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
async function commit(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null, chosen?: PreparedAtlasReplacement) {
  const prepared = await api.prepareAtlasCommit({ candidateId: chosen?.candidateId ?? crypto.randomUUID(), commandId: chosen?.commandId ?? command(), manifest: data.manifest, expectedRoot: root }, fast);
  const all = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let start = 0; start < all.length; start += 16) await api.stageAtlasBlocks(prepared.preparationId, all.slice(start, start + 16), fast);
  return api.commitAtlasPreparation(prepared.preparationId, fast);
}
async function restored() {
  const handle = await api.openAtlasDraft(base.manifest.draftId, fast); if (!handle) throw new Error('Missing durable world');
  const data: AtlasDetailCoastDocument = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const b of page.blocks) data.blocks.set(`${b.layer}:${b.bx}:${b.by}`, b); for (const b of page.locks ?? []) data.locks.set(`lock:${b.bx}:${b.by}`, b); for (const b of page.detailCoast ?? []) data.detailCoast.set(detailCoastKey(b.bx, b.by), b); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return data;
}

describe('local detailed relief contract and durable candidate', () => {
  it('requires a bounded local transition and rejects world scope, future code, surplus parameters and unsupported versions', () => {
    const r = recipe(); expect(validateGenerationOperation(r, scope, base.manifest.spec)).toBe(true);
    for (const invalid of [{ kind: 'world' }, { ...scope, transitionCells: 0 }, { ...scope, column: 127 }, { ...scope, rows: 1 }]) expect(validateGenerationOperation(r, invalid, base.manifest.spec)).toBe(false);
    for (const invalid of [{ ...r, generator: { ...r.generator, fingerprint: '0'.repeat(64) } }, { ...r, generator: { ...r.generator, version: 2 } }, { ...r, parameters: { ...r.parameters, mountainRanges: 3 } }, { ...r, parameters: { reliefMeters: 0 } }, { ...r, seed: '' }]) expect(validateLocalDetailReliefRecipe(invalid)).toBe(false);
    const parameters = { pointsQ: [[600, 600], [1000, 600], [1000, 1000], [600, 1000]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 0, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 };
    for (const [id, version, fingerprint] of [['shape-detail-landmass', 1, DETAIL_SHAPE_GENERATOR_FINGERPRINT], ['add-detail-landmass', 1, ADD_DETAIL_GENERATOR_FINGERPRINT], ['shape-detail-landmass', 2, NATURAL_DETAIL_GENERATOR_FINGERPRINT], ['add-detail-landmass', 2, ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT]] as const) {
      const oldRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id, version, fingerprint }, seed: 'old-world-only', parameters: { ...parameters, ...(version === 2 ? { coastStructureWorld: 96 } : {}) } };
      expect(validateGenerationOperation(oldRecipe, { kind: 'world' }, base.manifest.spec)).toBe(true);
      expect(validateGenerationOperation(oldRecipe, scope, base.manifest.spec)).toBe(false);
    }
  });
  it('keeps old formats isolated from the new operation', async () => {
    for (const format of [1, 2, 3] as const) {
      const options = { size: 128 as const, seed: 'old-isolation', name: '旧格式保护' };
      const old = format === 1 ? await createAtlasDraft(options, fast) : await createGenerationDraft(options, fast, format), owned = await OwnedAtlasSession.open(old, 'a'.repeat(64), fast);
      await expect(new AtlasGenerationSession(owned).preview(command(), 0, 'a'.repeat(64), recipe(), scope, fast)).rejects.toThrow(/创世|旧版本/);
      expect(validateAtlasManifest({ ...old.manifest, revision: 1, generation: { format: 'lieguoji-atlas-generation', version: 1, lastApplied: { recipe: recipe(), scope, baseManifestDigest: '1'.repeat(64), baseRootDigest: '2'.repeat(64), baseRevision: 0, lockSetDigest: '3'.repeat(64), appliedRevision: 1 } } })).toBe(false);
      expect(owned.snapshot()).toEqual(old);
    }
  }, 30000);
  it('persists actual fine heights only after bound confirmation, restores exact provenance and undoes complete terrain', async () => {
    const first = await commit(base), original = await api.exportAtlasRawBackup(base.manifest.draftId), owned = await OwnedAtlasSession.open(base, first.rootDigest, fast), generation = new AtlasGenerationSession(owned);
    const preview = await generation.preview(command(), 0, first.rootDigest, recipe(), scope, fast);
    expect(owned.snapshot()).toEqual(base); expect(await api.exportAtlasRawBackup(base.manifest.draftId)).toEqual(original);
    expect(preview.summary.changedCellCount).toBe(0); expect(preview.summary.detailLocalRelief!.changedFineNodeCount).toBeGreaterThan(0);
    expect(preview.summary.detailLocalRelief!.raisedFineNodeCount + preview.summary.detailLocalRelief!.loweredFineNodeCount).toBe(preview.summary.detailLocalRelief!.changedFineNodeCount);
    await expect(generation.confirm({ ...confirmation(preview), previewDigest: '0'.repeat(64) }, fast)).rejects.toThrow('未绑定');
    const candidate = detail((await generation.confirm(confirmation(preview), fast)).data);
    for (const [key, block] of base.blocks) expect(encodeBlock(candidate.blocks.get(key)!)).toEqual(encodeBlock(block));
    expect(candidate.locks).toEqual(base.locks);
    expect(candidate.manifest.generation.lastApplied).toMatchObject({ recipe: recipe(), scope, baseRevision: 0, appliedRevision: 1 });
    expect(decodeAtlasManifest(encodeAtlasManifest(candidate.manifest))).toEqual(candidate.manifest);
    const receipt = await commit(candidate, first.root, preview); owned.publishReplacement(preview.candidateId, receipt); generation.published(preview.candidateId);
    expect(await restored()).toEqual(candidate); expect(generation.pending).toBeNull();
    const undo = await owned.prepareReplacementUndo(command(), fast); if (!undo) throw new Error('Missing whole terrain undo');
    const undoneData = detail(await owned.replacementDocumentAsync(undo.candidateId, fast)), undone = await commit(undoneData, receipt.root, undo); owned.publishReplacement(undo.candidateId, undone);
    const after = await restored(); expect(after.blocks).toEqual(base.blocks); expect(after.detailCoast).toEqual(base.detailCoast); expect(after.manifest.generation.lastApplied).toBeNull(); expect(after.manifest.revision).toBe(2);
  }, 60000);
});
