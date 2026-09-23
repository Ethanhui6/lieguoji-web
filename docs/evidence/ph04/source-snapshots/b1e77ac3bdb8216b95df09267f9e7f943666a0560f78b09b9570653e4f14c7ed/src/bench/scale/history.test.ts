import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, digestFixture, digestScaleValue } from './fixture';
import { appendScaleHistory, branchScaleHistory, createScaleHistory, seekScaleHistory, validateScaleHistory, verifyScaleHistory } from './history';
import type { ScaleFixture, ScaleHistory, ScaleTransaction } from './types';

let base: ScaleFixture, timeline: ScaleHistory, final: ScaleFixture, hashes: string[];
const noWait = { yieldTask: async () => {} };
beforeAll(async () => {
  base = await createFixture({ seed: 'structure-history', scenario: 'archipelago', geoProfile: 'basic', entityProfile: 'basic' }, noWait);
  timeline = await createScaleHistory(base, 'scale-unit-source'); final = base; hashes = [await digestFixture(base)];
  for (let i = 0; i < 65; i++) {
    const input: ScaleTransaction = i === 2 ? { type: 'elevation', cellIds: [base.entities.cities[0].cellId], delta: 0.1 } : i === 3 ? { type: 'administration', regionId: 0, adminId: base.entities.regions[1].initialAdminId } : { type: 'structure-batch', count: 1 };
    const result = await appendScaleHistory(timeline, final, input); timeline = result.history; final = result.fixture; hashes.push(timeline.entries.at(-1)!.afterHash);
  }
}, 60000);

describe('PH03 independent deterministic structural history', () => {
  it('records same-batch edits and crosses 32/64 checkpoints with full replay equality', async () => {
    expect(timeline.entries).toHaveLength(65); expect(timeline.checkpoints.map(item => item.seq)).toEqual([32, 64]);
    expect(timeline.entries[2].input.type).toBe('elevation'); expect(timeline.entries[3].input.type).toBe('administration');
    expect(final.state.batch).toBe(63); expect(final.state.revision).toBe(65);
    const verified = await verifyScaleHistory(timeline, noWait);
    expect(verified.hash).toBe(hashes[65]); expect(verified.entries).toBe(65);
    for (const seq of [0, 1, 3, 31, 32, 33, 63, 64, 65]) expect(await digestFixture(await seekScaleHistory(timeline, seq, noWait))).toBe(hashes[seq]);
  }, 60000);

  it('branches independently and source bytes remain unchanged', async () => {
    const sourceHash = await digestScaleValue(timeline), branch = await branchScaleHistory(timeline, 32, 'scale-unit-branch', noWait);
    expect(branch.history.parent).toEqual({ runId: timeline.runId, seq: 32, hash: hashes[32] });
    const changed = await appendScaleHistory(branch.history, branch.fixture, { type: 'structure-batch', count: 2 });
    expect(changed.fixture.state.batch).toBe(branch.fixture.state.batch + 2);
    expect(await digestScaleValue(timeline)).toBe(sourceHash);
    expect(changed.history.entries).toHaveLength(1); expect(timeline.entries).toHaveLength(65);
    expect(validateScaleHistory({ ...branch.history, parent: { ...branch.history.parent!, hash: '0'.repeat(64) } })).toBe(false);
  }, 60000);

  it('detects corrupt input/checkpoints/current state and leaves original history intact', async () => {
    const source = await digestScaleValue(timeline);
    const broken = structuredClone(timeline); broken.entries[0].input = { type: 'structure-batch', count: 2 };
    await expect(verifyScaleHistory(broken, noWait)).rejects.toThrow('重算结果');
    const checkpoint = structuredClone(timeline); checkpoint.checkpoints[0].state.grain[0] += 1;
    await expect(seekScaleHistory(checkpoint, 32, noWait)).rejects.toThrow('检查点');
    const stale = structuredClone(final); stale.state.grain[0] += 1;
    await expect(appendScaleHistory(timeline, stale, { type: 'structure-batch', count: 1 })).rejects.toThrow('末尾不一致');
    await expect(appendScaleHistory(timeline, final, { type: 'structure-batch', count: -1 })).rejects.toThrow();
    expect(validateScaleHistory({ ...timeline, version: 2 })).toBe(false);
    expect(await digestScaleValue(timeline)).toBe(source);
  }, 30000);

  it('records an explicit undo transaction and rejects invalid seek/cancellation', async () => {
    const initial = await createScaleHistory(base, 'scale-unit-undo');
    const edited = await appendScaleHistory(initial, base, { type: 'elevation', cellIds: [0], delta: 0.2 });
    const undone = await appendScaleHistory(edited.history, edited.fixture, { type: 'restore-state', state: edited.undo.before });
    expect(undone.fixture.state.elevationOverrides).toEqual(base.state.elevationOverrides);
    expect((await verifyScaleHistory(undone.history, noWait)).hash).toBe(await digestFixture(undone.fixture));
    await expect(seekScaleHistory(timeline, 66, noWait)).rejects.toThrow('序号');
    const controller = new AbortController(); controller.abort();
    await expect(seekScaleHistory(timeline, 31, { ...noWait, signal: controller.signal })).rejects.toThrow('取消');
  }, 30000);
});
