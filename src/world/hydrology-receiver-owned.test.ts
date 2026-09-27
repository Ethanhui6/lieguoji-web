import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createGenerationDraft, verifyAtlasDocument } from './atlas-format';
import { getAtlasStorage } from './storage';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout } from './detail-coast-types';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import type { AtlasDetailCoastDocument } from './generation-contract';
import { getCellLayerSlot, hashBlock } from './model';
import { OwnedAtlasSession } from './transactions';
import { extractOwnedHydrologyReceivers, type HydrologyOwnedReceiverRequest } from './hydrology-receiver-owned';
import { RECEIVER_TERMINAL } from './hydrology-boundary';
const fast = { yieldTask: async () => {} };
let fixture: AtlasDetailCoastDocument;
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '真实双页receiver合成地形', seed: 'owned-receiver-two-pages' }, fast, 4);
  for (let id = 0; id < 128 ** 2; id++) { const { block, slot } = getCellLayerSlot(fixture, 'elevation', id); block.values[slot] = 200; }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  for (let bx = 0; bx < 2; bx++) {
    const layout = detailCoastOwnerLayout(bx, 0), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let i = 0; i < layout.count; i++) { const x = layout.startX + i % layout.width; coverageQ[i] = x >= 39 ? -512 : 512; elevationMeters[i] = x >= 39 ? -200 : x === 38 ? 100 : 300; }
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by: 0, mode: 'samples', coverageQ, elevationMeters } as const;
    fixture.detailCoast.set(detailCoastKey(bx, 0), tile); fixture.manifest.detailCoast.refs.push({ bx, by: 0, hash: await hashDetailCoastTile(tile) });
  }
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) } as const;
  lock.flags[0] = 3; fixture.locks.set(lockKey(0, 0), lock); fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }];
  await verifyAtlasDocument(fixture, fast);
}, 30000);
async function setup() {
  const session = await OwnedAtlasSession.open(structuredClone(fixture), 'a'.repeat(64), fast); let active = true;
  const owner = { session, assertCurrent: () => { if (!active) throw Error('receiver owner lease changed'); } };
  const { draftId, revision, manifestDigest, rootDigest } = session.head;
  const request: HydrologyOwnedReceiverRequest = { expected: { draftId, revision, manifestDigest, rootDigest }, cores: [
    { originColumn: 24, originRow: 10, columns: 8, rows: 8 }, { originColumn: 32, originRow: 10, columns: 8, rows: 8 },
  ] };
  return { session, owner, request, detach: () => { active = false; } };
}
describe('true Owned v4 ingress for derived two-page receivers', () => {
  it('routes actual explicit fine nodes across both tile/core boundaries without a geography write', async () => {
    const { session, owner, request } = await setup(), before = session.head, storage = getAtlasStorage(4);
    const prepare = vi.spyOn(storage, 'prepareAtlasCommit'), commit = vi.spyOn(storage, 'commitAtlasPreparation');
    try {
      const result = await extractOwnedHydrologyReceivers(owner, request, fast), r = result.receivers;
      expect(result.pages.map(page => page.stats.explicitFineNodes)).toEqual([100, 100]); expect(result.source.rootBinding).toBe('current-owned-session-head');
      const seam = r.nodeIds.indexOf(12 * 2049 + 31); expect(r.receiverNodeIds[seam]).toBe(12 * 2049 + 32);
      const mouth = r.nodeIds.indexOf(12 * 2049 + 38); expect(r.receiverNodeIds[mouth]).toBe(RECEIVER_TERMINAL.coast); expect(r.contributingSamples[mouth]).toBe(15);
      expect(r.groundMeters[seam]).toBe(300); expect(r.groundMeters[mouth]).toBe(100);
      expect(prepare).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled(); expect(session.head).toEqual(before); expect(await session.snapshotAsync(fast)).toEqual(fixture);
    } finally { prepare.mockRestore(); commit.mockRestore(); }
  });
  it('cancels after receiver work but before publication, then recomputes from the same untouched session', async () => {
    const { session, owner, request } = await setup(), before = session.head, controller = new AbortController(); let reached = false;
    await expect(extractOwnedHydrologyReceivers(owner, request, { ...fast, signal: controller.signal, onProgress: progress => {
      if (progress.stage.endsWith('：receiver-complete')) { expect(progress.completed).toBeGreaterThan(0); reached = true; controller.abort(); }
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(session.head).toEqual(before); expect(await session.snapshotAsync(fast)).toEqual(fixture);
    expect((await extractOwnedHydrologyReceivers(owner, request, fast)).receivers.stats.crossPageReceivers).toBeGreaterThan(0);
  });
  it('rejects a replaced Worker owner and oversized cores before snapshot work', async () => {
    const { session, owner, request, detach } = await setup(), before = session.head, spy = vi.spyOn(session, 'snapshotAsync');
    try {
      await expect(extractOwnedHydrologyReceivers(owner, { ...request, cores: [
        { originColumn: 128, originRow: 128, columns: 129, rows: 128 }, { originColumn: 257, originRow: 128, columns: 128, rows: 128 },
      ] }, fast)).rejects.toThrow('128'); expect(spy).not.toHaveBeenCalled();
      await expect(extractOwnedHydrologyReceivers(owner, request, { ...fast, onProgress: progress => { if (progress.stage === '水文跨页：抽取页' && progress.completed === 1) detach(); } })).rejects.toThrow('lease changed');
      expect(session.head).toEqual(before);
    } finally { spy.mockRestore(); }
  });
});
