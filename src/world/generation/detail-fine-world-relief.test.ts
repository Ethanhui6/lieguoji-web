import { describe, it, expect, vi } from 'vitest';
import { createNaturalRelief, FINE_WORLD_RELIEF_SCALE } from './detail-natural-relief';
import { createNaturalRelief as createBaseline } from './test-fixtures/preview18-relief/detail-natural-relief';
import { createOrographyField, OROGRAPHY_LIMITS, FINE_TREE_OROGRAPHY_LIMITS, type OrographyChain } from './detail-orography';
import * as orographyModule from './detail-orography';
import { seedHash } from './seed';

const q = (v: number) => Math.round(v * 256);
const control = { yieldControl: async () => {} };
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

/** Independent query oracle: enumerate every real support, bypassing all
 * production buckets, and combine unnormalized run powers directly. */
function exhaustiveFineHeight(field: Awaited<ReturnType<typeof createOrographyField>>, xQ: number, yQ: number) {
  const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
  const compact = (v: number) => Math.abs(v) < 1 ? (1 - v * v) ** 3 : 0;
  const masses = field.ends.map(() => 0);
  for (const n of field.supports) {
    const dx = xQ - n.xQ, dy = yQ - n.yQ, transverse = -dx * n.ty + dy * n.tx;
    let shape: number;
    if (n.section) {
      // Independent direct evaluation of actual tree side data; no production
      // contribution/union helper or spatial index is called by this oracle.
      const reach = transverse < 0 ? n.section.leftReachQ : n.section.rightReachQ;
      const shoulderShare = (transverse < 0 ? n.section.leftShoulderQ : n.section.rightShoulderQ) / 4096;
      shape = (1 - shoulderShare) * compact(transverse / n.crestQ) + shoulderShare * compact(transverse / reach);
    } else {
      const factor = 1 + .15 * n.leeQ * (2 * ease(.5 + 2 * transverse / n.widthQ) - 1);
      const shoulder = transverse / (n.widthQ * factor), crest = transverse / (n.crestQ * factor);
      const cut = n.valleyDepth * compact((shoulder - n.valleySide * n.valleyOffset) / .14);
      shape = (1 - n.foothillShare) * compact(crest) + n.foothillShare * compact(shoulder) * (1 - cut);
    }
    const along = (dx * n.tx + dy * n.ty) / n.alongQ;
    const end = field.ends[n.run];
    const start = (xQ - end.first.xQ) * end.first.tx + (yQ - end.first.yQ) * end.first.ty;
    const finish = (end.last.xQ - xQ) * end.last.tx + (end.last.yQ - yQ) * end.last.ty;
    masses[n.run] += n.peakQ * compact(along) * shape * n.weight
      * ease(start / end.fadeQ + Number(end.branch)) * ease(finish / end.fadeQ);
  }
  const maximum = Math.max(0, ...masses);
  return maximum >= 1e-3 ? masses.reduce((sum, value) => sum + value ** 64, 0) ** (1 / 64) - 1e-6
    : 1e-6 * ((1 + masses.reduce((sum, value) => sum + (value / 1e-6) ** 64, 0)) ** (1 / 64) - 1);
}

describe('fine world relief physical planning', () => {
  it('keeps all three ranges on the small writer rectangle and queries every fine-index boundary without losing supports', async () => {
    const input = worldInput(128);
    input.seed = seedHash('explicit-fine-new-land'); input.reliefMeters = 2200; input.shelfWidthWorld = 96;
    input.isLand = (xQ, yQ) => xQ > q(1024) && xQ < q(1664) && yQ > q(1024) && yQ < q(1536);
    input.land.fill(0); input.coastDistanceQ.fill(0);
    for (let id = 0; id < input.land.length; id++) {
      const xQ = input.centersQ[id * 2], yQ = input.centersQ[id * 2 + 1];
      if (input.isLand(xQ, yQ)) {
        input.land[id] = 1;
        input.coastDistanceQ[id] = Math.min(65535, xQ - q(1024), q(1664) - xQ, yQ - q(1024), q(1536) - yQ);
      }
    }
    let actual: Awaited<ReturnType<typeof createOrographyField>> | undefined;
    const original = orographyModule.createOrographyField;
    const spy = vi.spyOn(orographyModule, 'createOrographyField').mockImplementationOnce(async (...args) => {
      actual = await original(...args); return actual;
    });
    try {
      const relief = await createNaturalRelief(input, 2048, control);
      expect(relief.summary.ridgeGroups).toBe(3);
      expect(relief.curveStats.rejectedBranches).toBe(0);
    } finally { spy.mockRestore(); }
    expect(actual).toBeDefined();
    const field = actual!;
    expect(field.curves).toHaveLength(3);
    expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(OROGRAPHY_LIMITS.bucketCandidates);
    expect(field.stats.indexReferences).toBeLessThanOrEqual(OROGRAPHY_LIMITS.indexReferences);
    // Include exact 32-world bucket edges/corners and the adjacent Q8 values;
    // the all-support oracle never performs a bucket lookup.
    for (let y = 992; y <= 1568; y += 32) for (let x = 992; x <= 1696; x += 32) for (const delta of [-1, 0, 1]) {
      const xQ = q(x) + delta, yQ = q(y) + delta, sample = field.sample(xQ, yQ);
      expect(sample.massQ).toBeCloseTo(exhaustiveFineHeight(field, xQ, yQ), 7);
      expect(sample.kernelTests).toBeLessThanOrEqual(OROGRAPHY_LIMITS.bucketCandidates);
    }
    for (const [x, y] of [[0, 0], [4096, 0], [0, 4096], [4096, 4096]]) expect(field.sample(q(x), q(y)).massQ).toBe(0);
  });

  it('keeps the same real ridge tree and measured crest scale across 128, 256 and 512 coarse grids', async () => {
    const measures: ReturnType<typeof highSection>[] = [];
    const graphs: NonNullable<Relief['rangeTree']>['graph'][] = [];
    for (const size of [128, 256, 512] as const) {
      const relief = await createNaturalRelief(worldInput(size), 2048, control);
      expect(relief.summary.scaleMode).toBe('world');
      expect(relief.rangeTree).toBeDefined();
      const graph = relief.rangeTree!.graph;
      // At least the previous three real groups, with every planned tree arm
      // accepted; the exact layout must also survive coarse-grid changes.
      expect(relief.summary.ridgeGroups).toBeGreaterThanOrEqual(3);
      expect(relief.summary.ridgeGroups).toBeLessThanOrEqual(FINE_TREE_OROGRAPHY_LIMITS.chains);
      expect(relief.summary.ridgeGroups).toBe(graph.length);
      expect(relief.curveStats.rejectedBranches).toBe(0);
      graphs.push(graph);
      expect(relief.curveStats.supportNodes).toBeLessThanOrEqual(OROGRAPHY_LIMITS.nodes);
      expect(relief.curveStats.maximumBucketCandidates).toBeLessThanOrEqual(OROGRAPHY_LIMITS.bucketCandidates);
      expect(relief.summary.maximumRidgeWidthWorld).toBeLessThanOrEqual(FINE_WORLD_RELIEF_SCALE.maximumShoulderWidthWorld * 1.15);
      measures.push(highSection(relief));
    }
    expect(graphs[1]).toEqual(graphs[0]); expect(graphs[2]).toEqual(graphs[0]);
    const widths = measures.map(m => m.halfWidth), peaks = measures.map(m => m.maximum);
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.25);
    expect(Math.max(...peaks) / Math.min(...peaks)).toBeLessThan(1.25);
    expect(Math.max(...widths)).toBeLessThan(60);
    expect(Math.min(...peaks)).toBeGreaterThan(1500);
  });

  it('changes actual fine heights and broad shoulders, beyond only lowering the minimum width', async () => {
    const input = worldInput(128), before = await createBaseline(input, 2048, control), after = await createNaturalRelief(input, 2048, control);
    const oldMeasure = highSection(before), nextMeasure = highSection(after);
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
      const root = branch.points[0], planned = relief.rangeTree!.graph.find(c => c.group === branch.group);
      expect(planned?.parentGroup).toBeDefined();
      expect(planned!.parentGroup).toBeLessThan(branch.group);
      const parent = relief.curves.find(c => c.group === planned!.parentGroup);
      expect(parent).toBeDefined();
      expect(parent!.points.some(p => p.xQ === root.xQ && p.yQ === root.yQ)).toBe(true);
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
