import { describe, expect, it } from 'vitest';
import { createNaturalCoastArcPlan, NATURAL_COAST_PLAN_LIMITS } from './detail-natural-outline';
import { createNaturalCoastArcPlan as previousPlan } from '../../../baseline/detail-natural-outline';
import { FIELD_Q, noiseQ12, roundRatio } from './seed';

const q = (value: number) => value * 256, control = { yieldControl: async () => {} };
const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
describe('regional coast observable profiles', () => {
  it('gives broad bays, narrower capes and locally concentrated roughness on three seeds and two continent perimeters', async () => {
    for (const seed of [7391, 7392, 98317]) for (const perimeter of [2541, 5200]) {
      const plan = await createNaturalCoastArcPlan({ seed, perimeterQ: q(perimeter), structureWorld: 96 }, 128, control);
      const bays: number[] = [], capes: number[] = [], quiet: number[] = [], fractured: number[] = [];
      for (const region of plan.regions) {
        let effective = 0; const detail: number[] = [];
        for (let distance = q(2); distance < region.lengthQ; distance += q(2)) {
          const arc = region.startQ + distance, structural = plan.sample(arc);
          if (region.kind === 'bay' ? structural < -.35 * FIELD_Q : structural > .35 * FIELD_Q) effective += 2;
          if (distance >= region.lengthQ * .2 && distance <= region.lengthQ * .8) {
            // Fixed world-space queries, never UI pixels or source point index.
            detail.push(96 * structural / FIELD_Q + 32 * plan.sampleDetail(arc, q(500) + distance, q(937), 32) / FIELD_Q);
          }
        }
        if (region.kind === 'bay') bays.push(effective); if (region.kind === 'cape') capes.push(effective);
        const changes = detail.slice(1).map((value, i) => value - detail[i]);
        if (region.kind === 'quiet') quiet.push(rms(changes)); if (region.kind === 'fractured') fractured.push(rms(changes));
      }
      expect(bays.filter(width => width > 0).length).toBeGreaterThanOrEqual(2);
      expect(capes.filter(width => width > 0).length).toBeGreaterThanOrEqual(2);
      expect(median(bays)).toBeGreaterThan(1.4 * median(capes));
      expect(median(fractured)).toBeGreaterThan(2 * median(quiet));
      const around = Array.from({ length: 2048 }, (_, i) => plan.sample(perimeter * 256 * i / 2048));
      const shifted = around.reduce((sum, value, i) => sum + Math.abs(value - around[(i + 512) % around.length]), 0) / around.length;
      expect(shifted).toBeGreaterThan(.15 * FIELD_Q);
      expect(plan.stats.features).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.features);
      expect(plan.stats.references).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.references);
      expect(plan.stats.maximumCandidates).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.candidates);
    }
  });

  it('bounds the final 8-world contribution, stays continuous across regions and privately owns its plan', async () => {
    const input = { seed: 7391, perimeterQ: q(2541), structureWorld: 96 }, plan = await createNaturalCoastArcPlan(input, 64, control);
    const replay = await createNaturalCoastArcPlan(input, 512, control); expect(plan.features).toEqual(replay.features); expect(plan.regions).toEqual(replay.regions);
    for (const region of plan.regions) for (const at of [region.startQ, region.startQ + region.lengthQ]) {
      const before = plan.sampleDetail(at - 1, q(707), q(1117), 64), after = plan.sampleDetail(at + 1, q(707), q(1117), 64);
      expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
    }
    const fractured = plan.regions.find(region => region.kind === 'fractured')!, arc = fractured.startQ + fractured.lengthQ / 2;
    for (const amplitude of [3, 16, 32, 64]) for (let x = 0; x <= 128; x += 2) {
      const u = q(x + 707), v = q(1117), weight = Math.min(.65, 2 / amplitude), mediumWeight = Math.min(1 - weight, 6 / amplitude), slowWeight = Math.min(1 - weight - mediumWeight, 24 / amplitude);
      const medium = noiseQ12(input.seed, 7341, u, v, q(24)), slow = noiseQ12(input.seed, 7340, u, v, q(96)), result = plan.sampleDetail(arc, u, v, amplitude);
      const isolatedFine = (result - mediumWeight * medium - slowWeight * slow) / FIELD_Q * amplitude;
      expect(Math.abs(isolatedFine)).toBeLessThanOrEqual(2 + amplitude / (2 * FIELD_Q));
      expect(Math.abs(mediumWeight * medium / FIELD_Q * amplitude)).toBeLessThanOrEqual(6);
      expect(Math.abs(slowWeight * slow / FIELD_Q * amplitude)).toBeLessThanOrEqual(24);
      expect(Math.abs(result)).toBeLessThanOrEqual(FIELD_Q);
    }
    const original = plan.sampleDetail(arc, q(120), q(700), 32); fractured.kind = 'quiet'; plan.features[0].amplitudeQ = 0;
    expect(plan.sampleDetail(arc, q(120), q(700), 32)).toBe(original);
    expect(plan.sampleDetail(0, q(120), q(700), 32)).toBe(plan.sampleDetail(input.perimeterQ, q(120), q(700), 32));
  });

  it('preserves exact former small-island and structure-zero behavior instead of forcing continental detail', async () => {
    for (const perimeter of [64, 160, 760, 2047]) for (const structureWorld of [0, 16, 96, 160]) {
      const input = { seed: 7391, perimeterQ: q(perimeter), structureWorld }, current = await createNaturalCoastArcPlan(input, 64, control), old = await previousPlan(input, 64, control);
      expect(current.features).toEqual(old.features); expect(current.stats).toEqual(old.stats); expect(current.regions).toHaveLength(0);
      for (let arc = 0; arc < input.perimeterQ; arc += q(13)) {
        expect(current.sample(arc)).toBe(old.sample(arc));
        expect(current.sampleDetail(arc, arc, q(971), 32)).toBe(roundRatio(3 * noiseQ12(input.seed, 7113, arc, q(971), q(48)) + noiseQ12(input.seed, 7114, arc, q(971), q(12)), 4));
      }
    }
    const zero = await createNaturalCoastArcPlan({ seed: 7391, perimeterQ: q(5200), structureWorld: 0 }, 64, control);
    expect(zero.regions).toHaveLength(0); expect(zero.sample(q(1100))).toBe(0);
  });
});
