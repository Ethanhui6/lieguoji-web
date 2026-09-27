import { afterAll, describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createNaturalRelief, FINE_WORLD_RELIEF_SCALE } from './src/world/generation/detail-natural-relief';
import { createNaturalRelief as createBaseline } from './baseline/detail-natural-relief';
import { createOrographyField, OROGRAPHY_LIMITS, type OrographyChain } from './src/world/generation/detail-orography';

const q = (v: number) => Math.round(v * 256);
const control = { yieldControl: async () => {} };
const evidence: Record<string, unknown> = {};
afterAll(() => writeFileSync('.autopilot/ph06/fine-world-relief-staging/measurements.json', JSON.stringify(evidence, null, 2)));
function worldInput(size: 128 | 256 | 512) {
  const centersQ = new Int32Array(size ** 2 * 2), land = new Uint8Array(size ** 2), coastDistanceQ = new Uint16Array(size ** 2);
  const radius = (x: number, y: number) => Math.hypot((x - 2048) / 1640, (y - 2048) / 1100);
  const isLand = (xQ: number, yQ: number) => radius(xQ / 256, yQ / 256) < 1;
  for (let id = 0; id < land.length; id++) {
    const x = (id % size + .5) * 4096 / size, y = (Math.floor(id / size) + .5) * 4096 / size;
    centersQ.set([q(x), q(y)], id * 2);
    const r = radius(x, y);
    if (r < 1) { land[id] = 1; coastDistanceQ[id] = Math.min(65535, q((1 - r) * 1100)); }
  }
  return { seed: 9811, size, centersQ, land, coastDistanceQ, reliefMeters: 2400, shelfWidthWorld: 112, heightPlanning: 'fine-world' as const, isLand };
}
type Relief = Awaited<ReturnType<typeof createNaturalRelief>>;
function highSection(relief: Relief) {
  const curve = relief.curves.find(c => c.group === 0)!;
  const peak = curve.profile.filter(p => p.kind === 'peak')[1];
  const point = curve.points.reduce((best, p) => Math.abs(p.arc - peak.arcQ) < Math.abs(best.arc - peak.arcQ) ? p : best);
  const samples = Array.from({ length: 241 }, (_, i) => {
    const offset = (i - 120) * 2;
    return relief.physicalHeight(Math.round(point.xQ - point.ty * q(offset)), Math.round(point.yQ + point.tx * q(offset)), true, q(120), -6000);
  });
  const maximum = Math.max(...samples), background = Math.min(...samples), halfway = background + (maximum - background) / 2;
  return { maximum, background, halfWidth: samples.filter(v => v >= halfway).length * 2, samples, point };
}

describe('fine world relief physical planning candidate', () => {
  it('keeps measured crest scale stable across 128, 256 and 512 coarse grids while allowing different anchors', async () => {
    const measures: ReturnType<typeof highSection>[] = [];
    for (const size of [128, 256, 512] as const) {
      const relief = await createNaturalRelief(worldInput(size), 2048, control);
      expect(relief.summary.scaleMode).toBe('world');
      expect(relief.summary.ridgeGroups).toBe(3);
      expect(relief.curveStats.supportNodes).toBeLessThanOrEqual(OROGRAPHY_LIMITS.nodes);
      expect(relief.curveStats.maximumBucketCandidates).toBeLessThanOrEqual(OROGRAPHY_LIMITS.bucketCandidates);
      expect(relief.summary.maximumRidgeWidthWorld).toBeLessThanOrEqual(FINE_WORLD_RELIEF_SCALE.maximumShoulderWidthWorld * 1.15);
      measures.push(highSection(relief));
      evidence[`size${size}`] = { summary: relief.summary, stats: relief.curveStats, measured: measures.at(-1) };
    }
    const widths = measures.map(m => m.halfWidth), peaks = measures.map(m => m.maximum);
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.25);
    expect(Math.max(...peaks) / Math.min(...peaks)).toBeLessThan(1.25);
    expect(Math.max(...widths)).toBeLessThan(60);
    expect(Math.min(...peaks)).toBeGreaterThan(1500);
  });

  it('changes actual fine heights and broad shoulders, beyond only lowering the minimum width', async () => {
    const input = worldInput(128), before = await createBaseline(input, 2048, control), after = await createNaturalRelief(input, 2048, control);
    const oldMeasure = highSection(before), nextMeasure = highSection(after);
    evidence.beforeAfter128 = { oldMeasure, nextMeasure };
    expect(after.summary.maximumRidgeWidthWorld).toBeLessThan(before.summary.maximumRidgeWidthWorld * .8);
    expect(nextMeasure.halfWidth).toBeLessThan(oldMeasure.halfWidth * .65);
    expect(nextMeasure.maximum - nextMeasure.background).toBeGreaterThan(1500);
    expect(nextMeasure.samples).not.toEqual(oldMeasure.samples);
    // Interior fine-node elevations differ even on one old coarse cell.
    const fineHeights = Array.from({ length: 17 }, (_, i) => after.physicalHeight(q(2048 + i * 2), q(2200), true, q(120), -6000));
    expect(new Set(fineHeights).size).toBeGreaterThan(4);
  });

  it('retains true land probes, positive fine crest continuity, attached branches and unchanged sea answers', async () => {
    const input = worldInput(256), relief = await createNaturalRelief(input, 2048, control), baseline = await createBaseline(input, 2048, control);
    const trunk = relief.curves.find(c => c.group === 0)!;
    const firstPeak = trunk.profile.find(p => p.kind === 'peak')!.arcQ, lastPeak = trunk.profile.filter(p => p.kind === 'peak').at(-1)!.arcQ;
    for (const point of trunk.points) {
      expect(input.isLand(point.xQ, point.yQ)).toBe(true);
      if (point.arc >= firstPeak && point.arc <= lastPeak) expect(relief.physicalHeight(point.xQ, point.yQ, true, q(120), -6000)).toBeGreaterThan(600);
    }
    for (const branch of relief.curves.filter(c => c.group !== 0)) {
      const root = branch.points[0];
      expect(trunk.points.some(p => p.xQ === root.xQ && p.yQ === root.yQ)).toBe(true);
      expect(branch.rootPeakQ).toBeGreaterThan(0);
      expect(branch.rootPeakQ).toBeLessThan(branch.parentHeightQ);
      for (const p of branch.points) expect(input.isLand(p.xQ, p.yQ)).toBe(true);
    }
    for (const distance of [0, 1, 8, 24, 64, 120]) {
      const sea = relief.physicalHeight(q(160), q(300), false, q(distance), -6000);
      expect(sea).toBeLessThan(0);
      expect(sea).toBe(baseline.physicalHeight(q(160), q(300), false, q(distance), -6000));
    }
    expect(relief.physicalHeight(q(408), q(2048), true, 0, -6000)).toBe(0);
  });

  it('preserves local-mode heights exactly and continues to cancel during real land probing', async () => {
    const input = { ...worldInput(128), scaleMode: 'local' as const, heightPlanning: undefined };
    const before = await createBaseline(input, 2048, control), after = await createNaturalRelief(input, 2048, control);
    expect(after.summary).toEqual(before.summary);
    for (let y = 1400; y <= 2600; y += 24) for (let x = 700; x <= 3400; x += 24) {
      expect(after.physicalHeight(q(x), q(y), input.isLand(q(x), q(y)), q(120), -6000)).toBe(before.physicalHeight(q(x), q(y), input.isLand(q(x), q(y)), q(120), -6000));
    }
    const aborter = new AbortController(); let realProbes = 0;
    await expect(createNaturalRelief(worldInput(128), 64, { signal: aborter.signal, yieldControl: control.yieldControl,
      onProgress: (phase, done) => { if (phase === 'probe-branching-land' && done > 0) { realProbes = done; aborter.abort(); } }
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(realProbes).toBeGreaterThan(0);
    evidence.cancelledAfterLandProbes = realProbes;
  });

  it('keeps the unflagged world path byte-for-byte numerical equivalent and rejects local misuse', async () => {
    const input = { ...worldInput(128), heightPlanning: undefined };
    const before = await createBaseline(input, 2048, control), after = await createNaturalRelief(input, 2048, control);
    expect(after.summary).toEqual(before.summary);
    expect(after.ridges).toEqual(before.ridges);
    expect(after.curves).toEqual(before.curves);
    for (let y = 1200; y <= 2800; y += 32) for (let x = 700; x <= 3400; x += 32) {
      expect(after.physicalHeight(q(x), q(y), input.isLand(q(x), q(y)), q(120), -6000)).toBe(before.physicalHeight(q(x), q(y), input.isLand(q(x), q(y)), q(120), -6000));
    }
    await expect(createNaturalRelief({ ...worldInput(128), scaleMode: 'local' }, 128, control)).rejects.toThrow('世界细高程规划模式');
  });

  it('rejects sea-crossing fine ridges and retains bounded actual-support density', async () => {
    const chain: OrographyChain = { group: 0, seed: 9811, leeQ: 1, sampleStepQ: q(2), crossSection: 'fine-world', anchors: [
      { xQ: q(600), yQ: q(1000), widthQ: q(80), peakQ: 4096 },
      { xQ: q(1400), yQ: q(1000), widthQ: q(80), peakQ: 4096 },
      { xQ: q(2200), yQ: q(1000), widthQ: q(80), peakQ: 4096 }
    ] };
    const field = await createOrographyField([chain], (xQ) => xQ < q(1700) || xQ > q(1712), 128, control);
    expect(field.stats.rejectedSpans).toBe(1);
    expect(field.curves).toHaveLength(1);
    expect(field.sample(q(1706), q(1000)).massQ).toBe(0);
    expect(field.stats.landProbes).toBeLessThanOrEqual(OROGRAPHY_LIMITS.curveProbePoints);
    expect(field.stats.indexReferences).toBeLessThanOrEqual(OROGRAPHY_LIMITS.indexReferences);
    await expect(createOrographyField([{ ...chain, sampleStepQ: q(32) }], () => true, 128, control)).rejects.toThrow('山系细高程规划模式');
  });
});
