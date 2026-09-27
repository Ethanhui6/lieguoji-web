import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasWorkerRuntime } from './atlas.worker';
import { createGenerationDraft, type AtlasDetailCoastDocument } from './atlas-format';
import { encodeBlock, blockKey } from './model';
import { encodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { encodeDetailCoastTile, hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastTile } from './detail-coast-types';
import { ATLAS_STORAGE_PAGE_BYTES, getAtlasStorage, type AtlasStoredRoot } from './storage';
import { decodeAtlasPacket } from './protocol';

// Exercise the real Worker persistence boundary with synthetic valid content.
// Direct access here avoids rerunning the natural generation kernel; this is
// not evidence for packet transport, GPU rendering or real browser timing.
type Active = Parameters<AtlasWorkerRuntime['persist']>[0];
const api = getAtlasStorage(4), fast = { yieldTask: async () => {} }, encoder = new TextEncoder();
type Content = Parameters<typeof api.stageAtlasBlocks>[1][number];
let fixture: AtlasDetailCoastDocument;
const command = () => `edit-${crypto.randomUUID()}`;
function active(): Active {
  return { id: 1, control: new AbortController(), durable: false, sequence: 0, started: performance.now(),
    timing: { startedAt: 0, endedAt: 0, requestDecodeMs: 0, packetEncodeSendMs: 0, ownedPreparation: null, storageCall: null, ownedYields: [], acknowledgements: [], storageTimings: [], partialReasons: [] } };
}
function items(data: AtlasDetailCoastDocument): Content[] { return [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()]; }
function itemRecord(block: Content) {
  return block.format === 'lieguoji-detail-coast-tile'
    ? { key: detailCoastKey(block.bx, block.by), bytes: encodeDetailCoastTile(block) }
    : block.format === 'lieguoji-atlas-cell-locks'
      ? { key: lockKey(block.bx, block.by), bytes: encodeAtlasCellLockBlock(block) }
      : { key: blockKey(block.layer, block.bx, block.by), bytes: encodeBlock(block) };
}
function pageBytes(id: string, page: Content[]) {
  return page.reduce((sum, block) => { const value = itemRecord(block); return sum + value.bytes.length + encoder.encode(value.key).length + 128; }, encoder.encode(id).length);
}
async function seed(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null) {
  const prepared = await api.prepareAtlasCommit({ commandId: command(), candidateId: crypto.randomUUID(), manifest: data.manifest, expectedRoot: root }, fast), all = items(data);
  // Fixture setup uses small independent pages, not the Worker algorithm under test.
  for (let i = 0; i < all.length; i += 32) await api.stageAtlasBlocks(prepared.preparationId, all.slice(i, i + 32), fast);
  return api.commitAtlasPreparation(prepared.preparationId, fast);
}
async function seedPair() {
  const first = await seed(fixture), prior = structuredClone(fixture); prior.manifest.revision = 1;
  const current = await seed(prior, first.root), candidate = structuredClone(prior); candidate.manifest.revision = 2;
  candidate.manifest.name = '分页后的独立候选';
  return { current, candidate, before: await api.exportAtlasRawBackup(fixture.manifest.draftId) };
}
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, seed: 'worker-page-account', name: '混合大小细海岸分页' }, fast, 4);
  const lock = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 0, by: 0, flags: new Uint8Array(1024) };
  lock.flags[0] = 3;
  fixture.locks.set(lockKey(0, 0), lock); fixture.manifest.constraints.lockRefs.push({ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) });
  for (let index = 0; index < 100; index++) {
    const bx = index % 10, by = Math.floor(index / 10), count = detailCoastOwnerLayout(bx, by).count;
    const tile: DetailCoastTile = index % 7 === 6
      ? { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' }
      : { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ: new Int16Array(count).fill(256), elevationMeters: new Int16Array(count).fill(500) };
    fixture.detailCoast.set(detailCoastKey(bx, by), tile); fixture.manifest.detailCoast.refs.push({ bx, by, hash: await hashDetailCoastTile(tile) });
  }
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => vi.restoreAllMocks());

describe('Worker full persistence obeys the existing encoded 512 KiB page boundary', () => {
  it('stages mixed fine/coarse/lock content exactly once within real byte limits and keeps the prior root until commit', async () => {
    const original = await seed(fixture), candidate = structuredClone(fixture); candidate.manifest.revision = 1;
    const before = await api.exportAtlasRawBackup(fixture.manifest.draftId), originalStage = api.stageAtlasBlocks, pages: Content[][] = [], ids: string[] = [];
    vi.spyOn(api, 'stageAtlasBlocks').mockImplementation(async (id, page, control) => {
      expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
      expect(pageBytes(id, page)).toBeLessThanOrEqual(ATLAS_STORAGE_PAGE_BYTES);
      pages.push(page); ids.push(id);
      return originalStage(id, page, control);
    });
    const checkpoints: number[] = [], runtime = new AtlasWorkerRuntime(bytes => {
      const { header } = decodeAtlasPacket(bytes), body = header.body as { stage?: string; completed?: number };
      if (header.type === 'progress' && body.stage === '编码不可变草稿页') checkpoints.push(body.completed!);
    }), state = active();
    try {
      const receipt = await runtime['persist'](state, candidate, command(), crypto.randomUUID(), original.root);
      expect(state.durable).toBe(true); expect(receipt.root.backupManifest).toBe(original.manifestDigest);
      expect(pages.length).toBeGreaterThan(1); expect(pages.length).toBeLessThan(Math.ceil(items(candidate).length / 8));
      expect(pages.some(page => page.length > 32)).toBe(true); expect(checkpoints.length).toBeGreaterThan(0);
      const expected = items(candidate).map(itemRecord), actual = pages.flat().map(itemRecord);
      expect(actual).toEqual(expected); expect(new Set(actual.map(item => item.key)).size).toBe(expected.length);
      for (let i = 0; i < pages.length - 1; i++) expect(pageBytes(ids[i], [...pages[i], pages[i + 1][0]])).toBeGreaterThan(ATLAS_STORAGE_PAGE_BYTES);
      expect(encodeDetailCoastTile(candidate.detailCoast.get('coast:0:0')!).length).toBe(4372);
      expect(encodeDetailCoastTile(candidate.detailCoast.get('coast:1:1')!).length).toBe(4112);
      const restored = await api.openAtlasDraft(candidate.manifest.draftId, fast);
      expect(restored?.manifest).toEqual(candidate.manifest); expect(restored?.root).toEqual(receipt.root);
    } finally { runtime.close(); }
  }, 30000);

  it('cancels at a real packing task boundary before staging and preserves both existing root versions', async () => {
    const { current, candidate, before } = await seedPair(), state = active(), staged = vi.spyOn(api, 'stageAtlasBlocks'), committed = vi.spyOn(api, 'commitAtlasPreparation'), receiptLookup = vi.spyOn(api, 'findAtlasReceipt');
    let taskDelivered = false;
    const runtime = new AtlasWorkerRuntime(bytes => {
      const { header } = decodeAtlasPacket(bytes), body = header.body as { stage?: string; completed?: number };
      if (header.type === 'progress' && body.stage === '编码不可变草稿页' && body.completed === 16) {
        setTimeout(() => { taskDelivered = true; state.control.abort(); }, 0);
      }
    });
    try {
      await expect(runtime['persist'](state, candidate, command(), crypto.randomUUID(), current.root)).rejects.toMatchObject({ name: 'AbortError' });
      expect(taskDelivered).toBe(true); expect(staged).not.toHaveBeenCalled(); expect(committed).not.toHaveBeenCalled(); expect(state.durable).toBe(false);
      expect(receiptLookup).toHaveBeenCalledTimes(1); expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
    } finally { runtime.close(); }
  }, 30000);

  it('retains a failed staged page without publishing or rotating backup and allows the same command to finish once', async () => {
    const { current, candidate, before } = await seedPair(), originalStage = api.stageAtlasBlocks, commit = vi.spyOn(api, 'commitAtlasPreparation'), lookup = vi.spyOn(api, 'findAtlasReceipt');
    let calls = 0;
    vi.spyOn(api, 'stageAtlasBlocks').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('synthetic second page failure');
      return originalStage(...args);
    });
    const runtime = new AtlasWorkerRuntime(() => {}), state = active(), commandId = command(), candidateId = crypto.randomUUID();
    try {
      await expect(runtime['persist'](state, candidate, commandId, candidateId, current.root)).rejects.toThrow('synthetic second page failure');
      expect(calls).toBe(2); expect(commit).not.toHaveBeenCalled(); expect(lookup).toHaveBeenCalledTimes(1); expect(state.durable).toBe(false);
      expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
      const receipt = await runtime['persist'](active(), candidate, commandId, candidateId, current.root);
      expect(commit).toHaveBeenCalledTimes(1); expect(receipt.revision).toBe(2); expect(receipt.root.backupManifest).toBe(current.manifestDigest);
      expect((await api.openAtlasDraft(fixture.manifest.draftId, fast))?.root).toEqual(receipt.root);
    } finally { runtime.close(); }
  }, 30000);

  it('recovers an already durable page commit by matching command receipt without a second publication', async () => {
    const { current, candidate } = await seedPair(), originalCommit = api.commitAtlasPreparation, lookup = vi.spyOn(api, 'findAtlasReceipt');
    const commit = vi.spyOn(api, 'commitAtlasPreparation').mockImplementation(async (...args) => { await originalCommit(...args); throw new Error('synthetic lost full completion'); });
    const runtime = new AtlasWorkerRuntime(() => {}), state = active(), commandId = command(), candidateId = crypto.randomUUID();
    try {
      const receipt = await runtime['persist'](state, candidate, commandId, candidateId, current.root);
      expect(state.durable).toBe(true); expect(commit).toHaveBeenCalledTimes(1); expect(lookup).toHaveBeenCalledTimes(1);
      expect(receipt).toMatchObject({ commandId, candidateId, revision: 2, committed: true });
      expect(receipt.root.backupManifest).toBe(current.manifestDigest); expect((await api.openAtlasDraft(fixture.manifest.draftId, fast))?.root).toEqual(receipt.root);
    } finally { runtime.close(); }
  }, 30000);
});
