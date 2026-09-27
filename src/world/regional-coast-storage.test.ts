import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createGenerationDraft, isDetailCoastDocument, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from './atlas-format';
import { AtlasGenerationSession, type GenerationPreviewInfo } from './generation-session';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { getAtlasStorage, type AtlasStoredRoot } from './storage';
import type { NaturalDetailRecipe, AddNaturalDetailRecipe } from './generation-contract';
import { NATURAL_DETAIL_GENERATOR_FINGERPRINT, ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { encodeDetailCoastTile } from './detail-coast-codec';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { buildDetailCoastSurface } from './detail-coast-geometry';

const fast = { yieldTask: async () => {} }, api = getAtlasStorage(4), world = { kind: 'world' } as const;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const command = () => `edit-${crypto.randomUUID()}`;
function detail(data: AtlasDocument): AtlasDetailCoastDocument { if (!isDetailCoastDocument(data)) throw new Error('expected actual v4'); return data; }
const recipe = (add: boolean): NaturalDetailRecipe | AddNaturalDetailRecipe => {
  const x = add ? 2400 : 1000, y = add ? 2300 : 1000;
  const common = { format: 'lieguoji-atlas-recipe' as const, version: 1 as const, seed: add ? 'regional-second-saved-land' : 'regional-first-saved-land',
    parameters: { pointsQ: [[x, y], [x + 640, y], [x + 672, y + 272], [x + 568, y + 480], [x + 224, y + 544], [x - 48, y + 320]].map(([px, py]) => ({ xQ: px * 256, yQ: py * 256 })),
      coastStructureWorld: 96, coastRoughnessWorld: 32, reliefMeters: 2400, shelfWidthWorld: 128, islandChainCount: 0, islandsPerChain: 3 } };
  return add ? { ...common, generator: { id: 'add-detail-landmass', version: 2, fingerprint: ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT } }
    : { ...common, generator: { id: 'shape-detail-landmass', version: 2, fingerprint: NATURAL_DETAIL_GENERATOR_FINGERPRINT } };
};
async function commit(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null, selected?: PreparedAtlasReplacement) {
  const prep = await api.prepareAtlasCommit({ candidateId: selected?.candidateId ?? crypto.randomUUID(), commandId: selected?.commandId ?? command(), manifest: data.manifest, expectedRoot: root }, fast);
  const blocks = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let start = 0; start < blocks.length; start += 16) await api.stageAtlasBlocks(prep.preparationId, blocks.slice(start, start + 16), fast);
  return api.commitAtlasPreparation(prep.preparationId, fast);
}
async function restore(id: string) {
  const handle = await api.openAtlasDraft(id, fast); if (!handle) throw new Error('missing actual saved root');
  const data: AtlasDetailCoastDocument = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, fast); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const block of page.locks ?? []) data.locks.set(`lock:${block.bx}:${block.by}`, block); for (const tile of page.detailCoast ?? []) data.detailCoast.set(`coast:${tile.bx}:${tile.by}`, tile); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return data;
}
const confirmation = (p: GenerationPreviewInfo) => ({ candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest });
async function field(data: AtlasDetailCoastDocument) { const base = await extractDetailCoastBase(data, fast); return { tiles: data.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters) }; }

describe('regional candidate through actual private transaction and IndexedDB', () => {
  it('previews without writing, saves/restores exact terrain, cancels active work and preserves the first continent when adding another', async () => {
    globalThis.indexedDB = new IDBFactory();
    const empty = await createGenerationDraft({ size: 128, name: '区域海岸候选测试库', seed: 'regional-only-test-db' }, fast, 4), initial = await commit(empty);
    const emptyBytes = await api.exportAtlasRawBackup(empty.manifest.draftId), owner = await OwnedAtlasSession.open(empty, initial.rootDigest, fast), session = new AtlasGenerationSession(owner);
    const first = await session.preview(command(), 0, initial.rootDigest, recipe(false), world, fast);
    expect(await api.exportAtlasRawBackup(empty.manifest.draftId)).toEqual(emptyBytes);
    const candidate = detail((await session.confirm(confirmation(first), fast)).data), receipt = await commit(candidate, initial.root, first);
    owner.publishReplacement(first.candidateId, receipt); session.published(first.candidateId);
    const saved = await restore(empty.manifest.draftId); expect(saved).toEqual(candidate);
    const firstHashes = new Map([...saved.detailCoast].map(([key, tile]) => [key, hash(encodeDetailCoastTile(tile))]));
    const firstBytes = await api.exportAtlasRawBackup(saved.manifest.draftId), controller = new AbortController(); let reached = false;
    await expect(session.preview(command(), 1, receipt.rootDigest, recipe(true), world, { ...fast, signal: controller.signal, onProgress: progress => {
      if (progress.stage.includes('plan-natural-coast-features') && progress.completed > 0) { reached = true; controller.abort(); }
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(await api.exportAtlasRawBackup(saved.manifest.draftId)).toEqual(firstBytes);
    const second = await session.preview(command(), 1, receipt.rootDigest, recipe(true), world, fast), added = detail((await session.confirm(confirmation(second), fast)).data);
    const beforeField = await field(saved), afterField = await field(added);
    for (let row = 420; row < 848; row += 4) {
      const rectangle = { column: 396, row, columns: 512, rows: 4 };
      expect(buildDetailCoastSurface(afterField, rectangle)).toEqual(buildDetailCoastSurface(beforeField, rectangle));
    }
    for (const [key, digest] of firstHashes) expect(hash(encodeDetailCoastTile(added.detailCoast.get(key)!))).toBe(digest);
    const nextReceipt = await commit(added, receipt.root, second); owner.publishReplacement(second.candidateId, nextReceipt); session.published(second.candidateId);
    expect(await restore(saved.manifest.draftId)).toEqual(added);
  }, 120000);
});
