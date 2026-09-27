import { describe, expect, it } from 'vitest';
import { boundCurvedRelief, createCurvedRidgeField, CURVED_RIDGE_LIMITS } from './detail-curved-ridge';
import type { RidgeChain } from './detail-curved-ridge';
import { createNaturalRelief } from './detail-natural-relief';

const q = (world: number) => world * 256;
const control = { yieldControl: async () => {} };
const chain = (): RidgeChain => ({ group: 0, leeQ: 1, anchors: [
  { xQ: q(400), yQ: q(1000), widthQ: q(48), peakQ: 3400 },
  { xQ: q(800), yQ: q(1300), widthQ: q(64), peakQ: 3400 },
  { xQ: q(1200), yQ: q(1000), widthQ: q(48), peakQ: 3400 },
] });
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

describe('actual curved ridge height support', () => {
  it('uses a bent physical curve with a shared interior tangent and no internal end fade', async () => {
    const field = await createCurvedRidgeField([chain()], () => true, 128, control), points = field.curves[0].points;
    const middle = points.findIndex(p => p.xQ === q(800) && p.yQ === q(1300));
    expect(middle).toBeGreaterThan(0);
    const before = points[middle - 1], join = points[middle], after = points[middle + 1];
    expect(Math.abs(before.ty - after.ty)).toBeLessThan(.02);
    expect(join.tx).toBeCloseTo(1, 8); expect(join.ty).toBeCloseTo(0, 8);
    const nearHalf = points.reduce((best, p) => Math.abs(p.xQ - q(600)) < Math.abs(best.xQ - q(600)) ? p : best);
    expect(nearHalf.yQ - q(1150)).toBeGreaterThan(q(10));
    expect(field.sample(join.xQ, join.yQ).massQ).toBeGreaterThan(2500);
    expect(Math.abs(field.sample(join.xQ - 1, join.yQ).massQ - field.sample(join.xQ + 1, join.yQ).massQ)).toBeLessThan(1);
    for (let i = 1; i < points.length; i++) expect(Math.hypot(points[i].xQ - points[i - 1].xQ, points[i].yQ - points[i - 1].yQ)).toBeLessThanOrEqual(q(1) + 2);
  });

  it('fades at real chain endpoints and rejects the rounded endpoint extension', async () => {
    const field = await createCurvedRidgeField([chain()], () => true, 64, control), { first, last } = field.ends[0];
    expect(field.sample(first.xQ, first.yQ).massQ).toBe(0); expect(field.sample(last.xQ, last.yQ).massQ).toBe(0);
    expect(field.sample(first.xQ - q(10) * first.tx, first.yQ - q(10) * first.ty).massQ).toBe(0);
    expect(field.sample(last.xQ + q(10) * last.tx, last.yQ + q(10) * last.ty).massQ).toBe(0);
    const foot = field.sample(first.xQ + q(2) * first.tx, first.yQ + q(2) * first.ty).massQ;
    expect(foot).toBeGreaterThanOrEqual(0); expect(foot).toBeLessThan(1);
    expect(field.spans[0].peakAQ).toBe(0); expect(field.spans.at(-1)!.peakBQ).toBe(0);
    expect(field.spans[0].peakBQ).toBeGreaterThan(0);
  });

  it('keeps real finite slopes continuous through both side-width saturation boundaries', async () => {
    for (const leeQ of [-1, 1]) {
      const field = await createCurvedRidgeField([{ group: 0, leeQ, anchors: [400, 1000, 1600].map(x => ({ xQ: q(x), yQ: q(1000), widthQ: q(64), peakQ: 3400 })) }], () => true, 128, control);
      for (const boundary of [-16, 16]) {
        const height = (delta: number) => field.sample(q(1000), q(1000 + boundary + delta)).massQ, center = height(0);
        const slopeGap = (step: number) => {
          const left = (center - height(-step)) / step, right = (height(step) - center) / step;
          expect(Math.abs(left)).toBeGreaterThan(10); expect(Math.abs(right)).toBeGreaterThan(10);
          return Math.abs(right - left);
        };
        // In the live support (not its zero border), one-sided finite slopes
        // must converge as the probe shrinks to one Q8 coordinate unit. A
        // clamped-linear side width retains a nonzero jump at this location.
        const coarse = slopeGap(1), fine = slopeGap(1 / 256);
        expect(fine).toBeLessThan(.1); expect(fine).toBeLessThan(coarse / 64);
      }
    }
  });

  it('checks the actual curved path against land, even when both straight chords are land', async () => {
    let offChordProbes = 0;
    const isLand = (xQ: number, yQ: number) => {
      const chordY = xQ <= q(800) ? q(1000) + .75 * (xQ - q(400)) : q(1300) - .75 * (xQ - q(800));
      const allowed = yQ <= chordY + q(2); if (!allowed) offChordProbes++; return allowed;
    };
    const field = await createCurvedRidgeField([chain()], isLand, 64, control);
    expect(offChordProbes).toBe(2); expect(field.stats.rejectedSpans).toBe(2);
    expect(field.stats.acceptedSpans).toBe(0); expect(field.sample(q(800), q(1300)).massQ).toBe(0);
  });

  it('places peaks and saddles on total arc length rather than inventing peaks at inserted curve joins', async () => {
    const straight = (parts: number): RidgeChain => ({ group: 0, leeQ: 1, profileSeed: 9811,
      anchors: Array.from({ length: parts + 1 }, (_, i) => ({ xQ: q(400 + 1200 * i / parts), yQ: q(1000), widthQ: q(64), peakQ: 4096 })) });
    const sparse = await createCurvedRidgeField([straight(2)], () => true, 128, control), split = await createCurvedRidgeField([straight(4)], () => true, 512, control);
    const values: number[] = [];
    for (let x = 450; x <= 1550; x += 4) {
      const a = sparse.sample(q(x), q(1000)).massQ;
      expect(a).toBeCloseTo(split.sample(q(x), q(1000)).massQ, 6); values.push(a);
    }
    const peaks = values.slice(1, -1).filter((value, i) => value > values[i] && value > values[i + 2]);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...values) - Math.min(...values.slice(25, -25))).toBeGreaterThan(1500);
  });

  it('matches an independent all-support oracle at bucket edges and bounds every actual query', async () => {
    const field = await createCurvedRidgeField([chain()], () => true, 128, control);
    // Exhaustive oracle deliberately does not use the production index or its
    // query helper: every support is evaluated for every chosen query.
    const exhaustive = (xQ: number, yQ: number) => field.supports.reduce((sum, n) => {
      const dx = xQ - n.xQ, dy = yQ - n.yQ, along = (dx * n.tx + dy * n.ty) / n.alongQ;
      const cross = -dx * n.ty + dy * n.tx;
      // Independent equivalent form: remap ordinary smoothstep from [0,1]
      // back to [-1,1], instead of calling the production odd polynomial.
      const side = 2 * smooth(.5 + 2 * cross / n.widthQ) - 1;
      const width = n.widthQ * (1 + .15 * n.leeQ * side), r2 = along * along + (cross / width) ** 2;
      if (r2 >= 1) return sum;
      const end = field.ends[n.run], start = (xQ - end.first.xQ) * end.first.tx + (yQ - end.first.yQ) * end.first.ty;
      const finish = (end.last.xQ - xQ) * end.last.tx + (end.last.yQ - yQ) * end.last.ty;
      return sum + n.peakQ * (1 - r2) ** 3 * n.weight * smooth(start / end.fadeQ) * smooth(finish / end.fadeQ);
    }, 0);
    let tested = 0;
    for (let x = 320; x <= 1280; x += 64) for (let y = 960; y <= 1408; y += 64) for (const offset of [-1, 0, 1]) {
      const actual = field.sample(q(x) + offset, q(y));
      expect(actual.massQ).toBeCloseTo(exhaustive(q(x) + offset, q(y)), 7);
      expect(actual.kernelTests).toBeLessThanOrEqual(CURVED_RIDGE_LIMITS.bucketCandidates); tested++;
    }
    expect(tested).toBe(384); expect(field.stats.supportNodes).toBeLessThanOrEqual(CURVED_RIDGE_LIMITS.nodes);
    expect(field.stats.indexReferences).toBeLessThanOrEqual(CURVED_RIDGE_LIMITS.indexReferences);
  });

  it('keeps private copied geometry and deterministic sampling across work batches, and aborts without source writes', async () => {
    const input = chain(), original = structuredClone(input);
    let first = true;
    const a = await createCurvedRidgeField([input], () => true, 64, { ...control, onProgress: () => { if (first) { first = false; input.anchors[1].xQ = 0; } } });
    const b = await createCurvedRidgeField([original], () => true, 512, control);
    expect(a.spans).toEqual(b.spans); expect(a.supports).toEqual(b.supports);
    const sample = a.sample(q(800), q(1300)); a.supports[0].peakQ = 0; a.curves[0].points[0].xQ = 0; a.ends[0].first.xQ = 0;
    expect(a.sample(q(800), q(1300))).toEqual(sample);
    const controller = new AbortController(), untouched = chain(), snapshot = structuredClone(untouched);
    await expect(createCurvedRidgeField([untouched], () => true, 64, { ...control, signal: controller.signal, onProgress: phase => { if (phase === 'probe-continuous-land-ridges') controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(untouched).toEqual(snapshot);
  });

  it('has continuous bounded relief compression without a flat high plateau', () => {
    expect(boundCurvedRelief(0)).toBe(0); expect(boundCurvedRelief(3072)).toBe(3072);
    expect(Math.abs(boundCurvedRelief(3072 + .01) - boundCurvedRelief(3072 - .01))).toBeLessThan(.021);
    expect(boundCurvedRelief(8192)).toBeGreaterThan(boundCurvedRelief(4096)); expect(boundCurvedRelief(8192)).toBeLessThan(4096);
  });
});

function localFixture(withLand = true) {
  const size = 128 as const, centersQ = new Int32Array(size ** 2 * 2), land = new Uint8Array(size ** 2), coastDistanceQ = new Uint16Array(size ** 2);
  for (let id = 0; id < land.length; id++) {
    const x = id % size * 32 + 16, y = Math.floor(id / size) * 32 + 16; centersQ.set([q(x), q(y)], id * 2);
    if (withLand && x >= 1280 && x <= 1984 && y >= 1280 && y <= 1728) { land[id] = 1; coastDistanceQ[id] = 32767; }
  }
  return { seed: 9811, size, centersQ, land, coastDistanceQ, reliefMeters: 3200, shelfWidthWorld: 64, isLand: () => true };
}

describe('natural relief local scale and actual old-height background', () => {
  it('reduces local ridge groups and widths to the eligible land span while preserving the original five-argument API', async () => {
    const input = localFixture(), world = await createNaturalRelief(input, 512, control), local = await createNaturalRelief({ ...input, scaleMode: 'local' }, 512, control);
    expect(world.summary.scaleMode).toBe('world'); expect(local.summary.scaleMode).toBe('local');
    expect(local.summary.ridgeGroups).toBe(1); expect(local.summary.ridgeGroups).toBeLessThan(world.summary.ridgeGroups);
    expect(local.summary.maximumRidgeWidthWorld).toBeLessThan(world.summary.maximumRidgeWidthWorld / 2);
    expect(local.ridges.some(r => r.peakQ > 0)).toBe(true);
    expect(world.physicalHeight(q(1600), q(1500), true, 32767, -3000)).toBeGreaterThan(0);
    expect(local.summary.maximumBucketCandidates).toBeLessThanOrEqual(CURVED_RIDGE_LIMITS.bucketCandidates);
    for (const curve of local.curves) for (let i = 1; i < curve.points.length; i++) expect(curve.points[i].arc).toBeGreaterThan(curve.points[i - 1].arc);
  });

  it('uses supplied real background instead of inventing lowlands, retains shore taper and leaves sea behavior unchanged', async () => {
    const relief = await createNaturalRelief({ ...localFixture(false), scaleMode: 'local' }, 512, control);
    expect(relief.ridges).toHaveLength(0);
    expect(relief.physicalHeight(q(1600), q(1500), true, 32767, -3000, 731)).toBe(731);
    expect(relief.physicalHeight(q(1600), q(1500), true, 0, -3000, 731)).toBe(0);
    const tapered = relief.physicalHeight(q(1600), q(1500), true, q(2), -3000, 731);
    expect(tapered).toBeGreaterThanOrEqual(0); expect(tapered).toBeLessThan(731);
    expect(relief.physicalHeight(q(1600), q(1500), false, 32767, -3000, 731)).toBe(-3000);
    expect(() => relief.physicalHeight(q(1600), q(1500), true, 32767, -3000, NaN)).toThrow('背景无效');
  });
});
