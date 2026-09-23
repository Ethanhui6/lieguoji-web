import { describe, expect, it } from 'vitest';
import { byteSize, cellAt, cellCenter, cellPolygon, createFixture, digestFixture, OCEAN, SCALE_BUDGETS, validateFixture } from './fixture';
import type { ScaleOptions, ScaleProfile, ScaleScenario } from './types';

const options: ScaleOptions = { seed: 'ph03-invariants', scenario: 'continent', geoProfile: 'basic', entityProfile: 'basic' };
const noWait = { yieldTask: async () => {} };

describe('PH03 deterministic joined synthetic fixtures', () => {
  it('generates each exact geo tier and scene with a complete joined entity profile', async () => {
    for (const profile of ['basic', 'standard', 'extended'] as ScaleProfile[]) for (const scenario of ['continent', 'archipelago', 'mountains'] as ScaleScenario[]) {
      const f = await createFixture({ ...options, geoProfile: profile, entityProfile: profile, scenario }, noWait);
      expect(validateFixture(f)).toBe(true);
      expect(f.counts).toMatchObject(SCALE_BUDGETS[profile]);
      expect(f.counts.samples).toBe(profile === 'basic' ? 16384 : profile === 'standard' ? 65536 : 262144);
      expect(f.entities.administration.filter(item => item.leaf)).toHaveLength(f.counts.regions);
      expect(new Set(f.entities.nations.map(nation => nation.depth))).toEqual(new Set([1, 2, 3, 4]));
      expect(f.counts.adminParents).toBe(f.counts.nations / 4 * 6);
      expect(f.atlas.width).toBe(4096); expect(f.atlas.height).toBe(4096);
      expect(f.limitations.join('')).toContain('尚未测量');
      for (const city of f.entities.cities) expect(f.atlas.regionByCell[city.cellId]).toBe(city.regionId);
    }
  }, 30000);

  it('separates geographic density from entities, and reproduces seed bytes', async () => {
    const a = await createFixture(options, noWait), b = await createFixture(options, noWait);
    expect(await digestFixture(a)).toBe(await digestFixture(b));
    const independent = await createFixture({ ...options, geoProfile: 'basic', entityProfile: 'extended' }, noWait);
    expect(independent.counts.samples).toBe(16384); expect(independent.entities.people).toHaveLength(32768);
    expect(independent.counts.regions).toBe(4096); expect(validateFixture(independent)).toBe(true);
    const highGeo = await createFixture({ ...options, geoProfile: 'extended', entityProfile: 'basic' }, noWait);
    expect(highGeo.entities.groups).toHaveLength(4096); expect(highGeo.counts.samples).toBe(262144);
  }, 20000);

  it('has shared crack-free vertices, stable picking, and explicit ocean references', async () => {
    const f = await createFixture(options, noWait), columns = f.atlas.columns;
    for (const cell of [0, 129, 8094, 16383]) {
      expect(cellAt(f, cellCenter(f, cell))).toBe(cell);
      if (cell % columns < columns - 1) { const a = cellPolygon(f, cell), b = cellPolygon(f, cell + 1); expect(a[1]).toEqual(b[0]); expect(a[2]).toEqual(b[3]); }
      if (cell + columns < f.counts.samples) { const a = cellPolygon(f, cell), b = cellPolygon(f, cell + columns); expect(a[3]).toEqual(b[0]); expect(a[2]).toEqual(b[1]); }
    }
    expect(cellAt(f, { x: -1, y: 20 })).toBeUndefined();
    for (let i = 0; i < f.atlas.land.length; i++) if (!f.atlas.land[i]) expect(f.atlas.regionByCell[i]).toBe(OCEAN);
  });

  it('rejects malformed topology and foreign entity references, including typed bytes', async () => {
    const f = await createFixture(options, noWait);
    const original = await digestFixture(f), cases = [
      (x: typeof f) => { x.entities.people[0].familyId = 999999; },
      (x: typeof f) => { x.entities.cities[0].cellId = 0; },
      (x: typeof f) => { x.atlas.vertexX[2] = NaN; },
      (x: typeof f) => { x.state.grain[0] = -1; },
      (x: typeof f) => { x.entities.administration[0].parentId = 0; },
    ];
    for (const mutate of cases) { const copy = structuredClone(f); mutate(copy); expect(validateFixture(copy)).toBe(false); await expect(digestFixture(copy)).rejects.toThrow(); }
    const typedMutation = structuredClone(f); typedMutation.atlas.moisture[500] = 0.314159;
    expect(validateFixture(typedMutation)).toBe(true); expect(await digestFixture(typedMutation)).not.toBe(original);
    const metadataMutation = structuredClone(f); metadataMutation.entities.people[0].name = '合成姓名变更';
    expect(await digestFixture(metadataMutation)).not.toBe(original);
    expect(await digestFixture(f)).toBe(original);
  });

  it('cancels at a cooperative generation boundary and keeps caller options untouched', async () => {
    const controller = new AbortController(), input = { ...options };
    await expect(createFixture(input, { signal: controller.signal, onProgress: () => controller.abort(), yieldTask: async () => {} })).rejects.toThrow('取消');
    expect(input).toEqual(options);
    expect(byteSize(new Uint8Array([1, 2, 3]))).toBeGreaterThan(3);
    expect(byteSize('中文')).toBe(8);
    expect(validateFixture({ format: 'lieguoji-scale-fixture', version: 2 })).toBe(false);
    const valid = await createFixture(options, noWait);
    expect(validateFixture({ ...valid, unknownFutureField: true })).toBe(false);
  });
});
