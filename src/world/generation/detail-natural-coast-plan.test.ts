import { describe, expect, it } from 'vitest';
import { createNaturalCoastArcPlan, NATURAL_COAST_PLAN_LIMITS, roundAndIndexNaturalOutline, simplifyNaturalSampling } from './detail-natural-outline';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe } from './detail-shape-natural';
import { pickDetailCoastSurface } from '../detail-coast-geometry';
import { FIELD_Q } from './seed';

const q = (world: number) => world * 256, control = { yieldControl: async () => {} };
const request = () => ({ seed: 7391, perimeterQ: q(2541), structureWorld: 96 });

describe('nonuniform physical coast feature plan', () => {
  it('has unequal widths, biased shoulders, real positive and negative reach and no quarter-perimeter repetition', async () => {
    const plan = await createNaturalCoastArcPlan(request(), 128, control), broad = plan.features.filter(f => f.layer === 'regional');
    expect(broad.length).toBe(3);
    expect(Math.max(...broad.map(f => f.lengthQ)) / Math.min(...broad.map(f => f.lengthQ))).toBeGreaterThan(1.3);
    expect(broad.some(f => Math.abs(f.peakQ / f.lengthQ - .5) > .05)).toBe(true);
    expect(broad.some(f => f.leftShapeQ !== f.rightShapeQ)).toBe(true);
    const values = Array.from({ length: 2048 }, (_, i) => plan.sample(request().perimeterQ * i / 2048));
    expect(Math.max(...values)).toBeGreaterThan(.65 * FIELD_Q); expect(Math.min(...values)).toBeLessThan(-.65 * FIELD_Q);
    const quarterDifference = values.reduce((sum, value, i) => sum + Math.abs(value - values[(i + 512) % values.length]), 0) / values.length;
    expect(quarterDifference).toBeGreaterThan(.15 * FIELD_Q);
    expect(plan.features.some(f => f.layer === 'local' && Math.abs(f.amplitudeQ) < .33 * FIELD_Q)).toBe(true);
  });

  it('matches an exhaustive independent feature oracle at bin boundaries and stays in the requested envelope', async () => {
    const input = request(), plan = await createNaturalCoastArcPlan(input, 64, control);
    const oracle = (arc: number) => {
      let broad = 0, small = 0;
      for (const f of plan.features) {
        const distance = ((arc - f.startQ) % input.perimeterQ + input.perimeterQ) % input.perimeterQ;
        if (distance > f.lengthQ) continue;
        const left = distance <= f.peakQ, t = left ? distance / f.peakQ : (f.lengthQ - distance) / (f.lengthQ - f.peakQ);
        const smooth = 3 * t ** 2 - 2 * t ** 3, shape = (left ? f.leftShapeQ : f.rightShapeQ) / FIELD_Q;
        const height = f.amplitudeQ * ((1 + shape) * smooth - shape * smooth ** 2);
        if (f.layer === 'regional') broad += height; else small += height;
      }
      return broad + small - small * broad ** 2 / FIELD_Q ** 2;
    };
    for (let i = 0; i < NATURAL_COAST_PLAN_LIMITS.bins; i++) for (const offset of [-1, 0, 1]) {
      const arc = input.perimeterQ * i / NATURAL_COAST_PLAN_LIMITS.bins + offset, value = plan.sample(arc);
      expect(value).toBeCloseTo(oracle(arc), 7); expect(Math.abs(value)).toBeLessThanOrEqual(FIELD_Q);
    }
    expect(plan.stats.features).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.features);
    expect(plan.stats.references).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.references);
    expect(plan.stats.maximumCandidates).toBeLessThanOrEqual(NATURAL_COAST_PLAN_LIMITS.candidates);
  });

  it('has no circular seam and keeps finite first slopes continuous at event starts, peaks and ends', async () => {
    const input = request(), plan = await createNaturalCoastArcPlan(input, 128, control);
    expect(plan.sample(0)).toBe(plan.sample(input.perimeterQ)); expect(plan.sample(-1)).toBe(plan.sample(input.perimeterQ - 1));
    for (const f of plan.features) for (const at of [f.startQ, f.startQ + f.peakQ, f.startQ + f.lengthQ]) {
      const center = plan.sample(at), h = 1;
      const left = (center - plan.sample(at - h)) * 256 / h, right = (plan.sample(at + h) - center) * 256 / h;
      expect(Math.abs(left - right)).toBeLessThan(.1);
    }
  });

  it('keeps source ownership and exact seed/batch results without a shared global cache', async () => {
    const input = request(), first = await createNaturalCoastArcPlan(input, 64, { ...control, onProgress: () => { input.seed = 1; input.perimeterQ = q(128); input.structureWorld = 0; } });
    const replay = await createNaturalCoastArcPlan(request(), 512, control);
    expect(first.features).toEqual(replay.features); expect(first.stats).toEqual(replay.stats);
    const at = first.features[0].startQ + first.features[0].peakQ, before = first.sample(at); first.features[0].amplitudeQ = 0;
    expect(first.sample(at)).toBe(before);
    const different = await createNaturalCoastArcPlan({ ...request(), seed: 7392 }, 128, control);
    expect(different.features).not.toEqual(replay.features);
    for (let arc = 0; arc < request().perimeterQ; arc += q(13)) expect(first.sample(arc)).toBe(replay.sample(arc));
  });

  it('is independent of straight gesture sampling density and exactly disables the structural layer at zero', async () => {
    const points = [[1100, 1100], [1900, 1100], [1900, 1740], [1100, 1740]].map(([x, y]) => ({ xQ: q(x), yQ: q(y) }));
    const dense = points.flatMap((a, i) => { const b = points[(i + 1) % points.length]; return Array.from({ length: 8 }, (_, j) => ({ xQ: a.xQ + (b.xQ - a.xQ) * j / 8, yQ: a.yQ + (b.yQ - a.yQ) * j / 8 })); });
    const make = async (raw: typeof points) => {
      const source = await simplifyNaturalSampling(raw, 128, control), outline = await roundAndIndexNaturalOutline({ points: source, caps: source.map(() => q(112)), structureWorld: 96, roughnessWorld: 16, area2: 2 * q(800) * q(640) }, 128, control, { outlineEdgeTests: 0 });
      return createNaturalCoastArcPlan({ ...request(), perimeterQ: outline.perimeter }, 128, control);
    };
    const a = await make(points), b = await make(dense); expect(a.features).toEqual(b.features);
    const zero = await createNaturalCoastArcPlan({ ...request(), structureWorld: 0 }, 64, control);
    expect(zero.features).toHaveLength(0); for (let arc = 0; arc < q(2541); arc += q(11)) expect(zero.sample(arc)).toBe(0);
  });

  it('does not pack full-scale events into a tiny perimeter and rejects out-of-contract structure', async () => {
    const tiny = await createNaturalCoastArcPlan({ ...request(), perimeterQ: q(64) }, 64, control);
    expect(tiny.features).toHaveLength(0); expect(tiny.sample(q(15))).toBe(0);
    const small = await createNaturalCoastArcPlan({ ...request(), perimeterQ: q(160) }, 64, control);
    expect(small.features.length).toBeLessThanOrEqual(2);
    expect(small.features.every(f => Math.abs(f.amplitudeQ) < FIELD_Q / 2)).toBe(true);
    await expect(createNaturalCoastArcPlan({ ...request(), structureWorld: 161 }, 64, control)).rejects.toThrow('参数无效');
  });
});

function base(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size ** 2 * 2), heights = new Int32Array(size ** 2).fill(-2400);
  for (let id = 0; id < heights.length; id++) centers.set([q(id % size * 32 + 16), q(Math.floor(id / size) * 32 + 16)], id * 2);
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
function tinyRecipe(): NaturalDetailShapeRecipe {
  return { format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'tiny-no-forced-coast-lobes', coastStructureWorld: 96, coastRoughnessWorld: 0, reliefMeters: 1200, shelfWidthWorld: 64, islandChainCount: 0, islandsPerChain: 3,
    pointsQ: [[1200, 1200], [1216, 1200], [1216, 1216], [1200, 1216]].map(([x, y]) => ({ xQ: q(x), yQ: q(y) })) };
}

describe('natural coast plan actual generator entry', () => {
  it('retains a real tiny island and nearby sea through the actual 2-world coverage pipeline', async () => {
    const result = await generateDetailShapeNatural({ base: base(), recipe: tinyRecipe() }, { ...control, batchWork: 512 });
    const field = { tiles: result.detailCoast, sampleBaseElevation: result.sampleBaseElevation };
    expect(pickDetailCoastSurface(field, { x: 1208, y: 1208 })!.land).toBe(true);
    for (const [x, y] of [[1196, 1208], [1220, 1208], [1208, 1196], [1208, 1220]]) expect(pickDetailCoastSurface(field, { x, y })!.land).toBe(false);
    expect(result.summary.landAreaTwiceQ2).toBeGreaterThan(0);
    expect(result.summary.landAreaTwiceQ2 + result.summary.seaAreaTwiceQ2).toBe(2 * q(4096) ** 2);
  }, 60000);

  it('cancels the actual new planning entry and preserves the original draft buffers and recipe', async () => {
    const input = { base: base(), recipe: tinyRecipe() }, before = new Uint8Array(input.base.elevationsMeters).slice(), recipeBefore = structuredClone(input.recipe), controller = new AbortController(); let reached = false;
    await expect(generateDetailShapeNatural(input, { ...control, batchWork: 64, signal: controller.signal, onProgress: phase => {
      if (phase === 'plan-natural-coast-features') { reached = true; controller.abort(); }
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(new Uint8Array(input.base.elevationsMeters)).toEqual(before); expect(input.recipe).toEqual(recipeBefore); expect(input.base.detailCoast.size).toBe(0);
  }, 60000);
});
