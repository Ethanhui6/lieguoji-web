import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, digestFixture, elevationAt, validateFixture } from './fixture';
import { applyTransaction, groupNation, undoTransaction } from './kernels';
import type { ScaleFixture, ScaleTransaction } from './types';

let base: ScaleFixture;
beforeAll(async () => { base = await createFixture({ seed: 'structure-kernels', scenario: 'mountains', geoProfile: 'basic', entityProfile: 'basic' }, { yieldTask: async () => {} }); });

describe('PH03 pure structure transactions', () => {
  it('edits local elevations, preserves shared geometry, and undoes through a new revision', async () => {
    const hash = await digestFixture(base), cell = base.entities.cities[0].cellId;
    const result = applyTransaction(base, { type: 'elevation', cellIds: [cell], delta: 0.05 });
    expect(elevationAt(result.fixture, cell)).toBeCloseTo(elevationAt(base, cell) + 0.05);
    expect(result.fixture.atlas).toBe(base.atlas); expect(result.fixture.entities).toBe(base.entities);
    const undone = undoTransaction(result.fixture, result.undo).fixture;
    expect(undone.state.elevationOverrides).toEqual(base.state.elevationOverrides);
    expect(undone.state.revision).toBe(2); expect(validateFixture(undone)).toBe(true);
    expect(await digestFixture(base)).toBe(hash);
    expect(() => undoTransaction(undone, result.undo)).toThrow('过期');
  });

  it('reassigns a real region while city/group/person links follow its current administration', () => {
    const region = base.entities.cities[0].regionId, prior = groupNation(base, 0);
    const target = base.entities.administration.find(admin => admin.leaf && admin.nationId !== prior)!;
    const next = applyTransaction(base, { type: 'administration', regionId: region, adminId: target.id }).fixture;
    expect(groupNation(next, 0)).toBe(target.nationId); expect(groupNation(base, 0)).toBe(prior);
    expect(next.entities.people[0].groupId).toBe(0); expect(next.entities.cities[0].regionId).toBe(region);
    expect(validateFixture(next)).toBe(true);
  });

  it('runs deterministic non-negative grain batches without claiming population simulation', async () => {
    const a = applyTransaction(base, { type: 'structure-batch', count: 3 });
    let b = base; for (let i = 0; i < 3; i++) b = applyTransaction(b, { type: 'structure-batch', count: 1 }).fixture;
    expect(a.fixture.state.grain).toEqual(b.state.grain);
    expect(a.fixture.state.population).toEqual(base.state.population);
    expect(a.fixture.state.batch).toBe(3); expect(a.summary).toContain('尚未测量完整社会规则');
    const empty = structuredClone(base); empty.state.grain.fill(0);
    const scarce = applyTransaction(empty, { type: 'structure-batch', count: 32 }).fixture;
    expect(scarce.state.grain.every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    expect(await digestFixture(applyTransaction(base, { type: 'structure-batch', count: 3 }).fixture)).toBe(await digestFixture(a.fixture));
  });

  it('rejects failed edits without mutating source bytes', async () => {
    const before = await digestFixture(base);
    const invalid: ScaleTransaction[] = [
      { type: 'elevation', cellIds: [999999], delta: 0.1 },
      { type: 'elevation', cellIds: [1, 1], delta: 0.1 },
      { type: 'administration', regionId: 0, adminId: -1 },
      { type: 'structure-batch', count: 33 },
      { type: 'restore-state', state: { ...base.state, grain: new Float64Array(1) } },
    ];
    for (const input of invalid) expect(() => applyTransaction(base, input)).toThrow();
    expect(await digestFixture(base)).toBe(before);
  });
});
