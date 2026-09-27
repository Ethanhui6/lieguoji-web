import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createNaturalRelief } from './src/world/generation/detail-natural-relief';
import { planFineRangeTree, FINE_RANGE_TREE_LIMITS } from './src/world/generation/fine-range-tree';
import { createOrographyField, OROGRAPHY_LIMITS, FINE_TREE_OROGRAPHY_LIMITS } from './src/world/generation/detail-orography';
import { createNaturalRelief as oldRelief } from '../../../src/world/generation/test-fixtures/preview18-relief/detail-natural-relief';
import { seedHash } from '../../../src/world/generation/seed';

const q = (v: number) => Math.round(v * 256), control = { yieldControl: async () => {} };
const ellipse = (xQ: number, yQ: number) => ((xQ / 256 - 2048) / 1640) ** 2 + ((yQ / 256 - 2048) / 1100) ** 2 < 1;
const rectangle = (xQ: number, yQ: number) => xQ > q(1024) && xQ < q(1664) && yQ > q(1024) && yQ < q(1536);
const evidence: Record<string, unknown> = {};
afterAll(() => writeFileSync('.autopilot/ph06/natural-ranges-staging/measurements.json', JSON.stringify(evidence, null, 2)));
function naturalInput(size: 128 | 256 | 512, seed = 9811, isLand = ellipse) {
  const centersQ = new Int32Array(size ** 2 * 2), land = new Uint8Array(size ** 2), coastDistanceQ = new Uint16Array(size ** 2);
  for (let id = 0; id < land.length; id++) {
    const xQ = q((id % size + .5) * 4096 / size), yQ = q((Math.floor(id / size) + .5) * 4096 / size);
    centersQ.set([xQ, yQ], id * 2); if (isLand(xQ, yQ)) { land[id] = 1; coastDistanceQ[id] = 32767; }
  }
  return { seed, size, centersQ, land, coastDistanceQ, reliefMeters: 2400, shelfWidthWorld: 96, heightPlanning: 'fine-world' as const, isLand };
}
type Field = Awaited<ReturnType<typeof createOrographyField>>;
function exhaustive(field: Field, x: number, y: number, onlyRun?: number) {
  const cubic = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
  const bump = (v: number) => Math.abs(v) < 1 ? (1 - v * v) ** 3 : 0;
  const runs = field.ends.map(() => 0);
  for (const n of field.supports) {
    const dx = x - n.xQ, dy = y - n.yQ, across = -dx * n.ty + dy * n.tx;
    const s = n.section!;
    const reach = across < 0 ? s.leftReachQ : s.rightReachQ, shoulder = (across < 0 ? s.leftShoulderQ : s.rightShoulderQ) / 4096;
    const end = field.ends[n.run], start = ((x - end.first.xQ) * end.first.tx + (y - end.first.yQ) * end.first.ty) / end.fadeQ;
    const finish = ((end.last.xQ - x) * end.last.tx + (end.last.yQ - y) * end.last.ty) / end.fadeQ;
    runs[n.run] += n.peakQ * bump((dx * n.tx + dy * n.ty) / n.alongQ) * n.weight
      * ((1 - shoulder) * bump(across / n.crestQ) + shoulder * bump(across / reach)) * cubic(start + Number(end.branch)) * cubic(finish);
  }
  if (onlyRun !== undefined) return runs[onlyRun];
  return Math.max(...runs, 0) >= 1e-3 ? runs.reduce((sum, h) => sum + h ** 64, 0) ** (1 / 64) - 1e-6
    : 1e-6 * ((1 + runs.reduce((sum, h) => sum + (h / 1e-6) ** 64, 0)) ** (1 / 64) - 1);
}
const atArc = (curve: Field['curves'][number], arc: number) => curve.points.reduce((best, p) => Math.abs(p.arc - arc) < Math.abs(best.arc - arc) ? p : best);

describe('actual fine range tree candidate', () => {
  it('plans a finite rooted tree with shared real junctions and keeps all accepted curve probes on land', async () => {
    const plan = await planFineRangeTree({ seed: 9811, isLand: ellipse }, 2048, control);
    const field = await createOrographyField(plan.chains, ellipse, 2048, control);
    expect(plan.chains.length).toBeGreaterThanOrEqual(3); expect(plan.chains.length).toBeLessThanOrEqual(5);
    expect(plan.stats.uniqueVertices).toBeLessThanOrEqual(15); expect(plan.stats.spans).toBeLessThanOrEqual(14);
    expect(plan.stats.typedWorkingBytes).toBe(FINE_RANGE_TREE_LIMITS.typedWorkingBytes);
    expect(field.curves.length).toBe(plan.chains.length);
    for (const chain of plan.chains) if (chain.group) {
      expect(chain.parentGroup).toBeLessThan(chain.group);
      expect(plan.chains[chain.parentGroup!].anchors.some(a => a.xQ === chain.anchors[0].xQ && a.yQ === chain.anchors[0].yQ)).toBe(true);
    }
    for (const curve of field.curves) for (const point of curve.points) expect(ellipse(point.xQ, point.yQ)).toBe(true);
    expect(field.stats.supportNodes).toBeLessThanOrEqual(4096); expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(192);
    expect(field.stats.indexReferences).toBeLessThanOrEqual(262144);
    evidence.primary = { graph: plan.graph, chains: plan.chains, planning: plan.stats, field: field.stats };
  });

  it('does not reuse a fixed S bend order or fixed straight branch direction across seeds', async () => {
    const signatures: string[] = [], headings: number[] = []; let curvedArms = 0;
    let firstSeedCurvedArms = 0;
    for (const seed of [9811, 4121, 8219]) {
      const plan = await planFineRangeTree({ seed, isLand: ellipse }, 2048, control), anchors = plan.chains[0].anchors;
      const signs = anchors.slice(1, -1).map((b, i) => { const a = anchors[i], c = anchors[i + 2]; return Math.sign((b.xQ - a.xQ) * (c.yQ - b.yQ) - (b.yQ - a.yQ) * (c.xQ - b.xQ)); });
      signatures.push(signs.filter(Boolean).join(',')); headings.push(Math.atan2(anchors.at(-1)!.yQ - anchors[0].yQ, anchors.at(-1)!.xQ - anchors[0].xQ));
      for (const chain of plan.chains.slice(1)) {
        const [a, b, c] = chain.anchors, bend = Math.abs((b.xQ - a.xQ) * (c.yQ - b.yQ) - (b.yQ - a.yQ) * (c.xQ - b.xQ));
        if (bend > q(32) ** 2) { curvedArms++; if (seed === 9811) firstSeedCurvedArms++; }
      }
    }
    expect(new Set(signatures).size).toBeGreaterThan(1);
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(.15);
    expect(curvedArms).toBeGreaterThanOrEqual(3);
    expect(firstSeedCurvedArms).toBeGreaterThanOrEqual(3);
    evidence.diversity = { signatures, headings, curvedArms, firstSeedCurvedArms };
  });

  it('measures a real land valley below two separate branch ridges and verifies parent connection from actual supports', async () => {
    const plan = await planFineRangeTree({ seed: 9811, isLand: ellipse }, 2048, control);
    const field = await createOrographyField(plan.chains, ellipse, 2048, control), relief = await createNaturalRelief(naturalInput(128), 2048, control);
    for (const chain of plan.chains.slice(1)) {
      const child = field.curves.find(c => c.group === chain.group)!, parentIndex = field.curves.findIndex(c => c.group === chain.parentGroup);
      const root = child.points[0], parentHeight = exhaustive(field, root.xQ, root.yQ, parentIndex);
      expect(child.parentHeightQ).toBeCloseTo(parentHeight, 6);
      expect(child.rootPeakQ).toBeGreaterThan(0); expect(child.rootPeakQ).toBeLessThan(parentHeight);
      expect(field.sample(root.xQ, root.yQ).massQ).toBeGreaterThanOrEqual(parentHeight - 1e-6);
    }
    const branches = field.curves.filter(c => c.group > 0);
    let valley: { ridgeHeights: number[]; valleyHeight: number; distanceWorld: number; samples: { xQ: number; yQ: number; height: number }[] } | undefined;
    for (let a = 0; a < branches.length && !valley; a++) for (let b = a + 1; b < branches.length && !valley; b++) for (const fraction of [.35, .5, .65]) {
      const left = atArc(branches[a], branches[a].points.at(-1)!.arc * fraction), right = atArc(branches[b], branches[b].points.at(-1)!.arc * fraction);
      const distanceWorld = Math.hypot(right.xQ - left.xQ, right.yQ - left.yQ) / 256;
      if (distanceWorld < 96 || distanceWorld > 800) continue;
      const samples = Array.from({ length: 21 }, (_, i) => { const xQ = Math.round(left.xQ + (right.xQ - left.xQ) * i / 20), yQ = Math.round(left.yQ + (right.yQ - left.yQ) * i / 20);
        return { xQ, yQ, height: relief.physicalHeight(xQ, yQ, true, q(120), -5000) }; });
      if (!samples.every(p => ellipse(p.xQ, p.yQ))) continue;
      const ridgeHeights = [samples[0].height, samples.at(-1)!.height], valleyHeight = Math.min(...samples.slice(4, -4).map(p => p.height));
      if (Math.min(...ridgeHeights) > 300 && valleyHeight < Math.min(...ridgeHeights) * .65) valley = { ridgeHeights, valleyHeight, distanceWorld, samples };
    }
    expect(valley).toBeDefined();
    evidence.valleyAndConnection = valley;
  });

  it('has real lower passes between peaks and terrain-driven unequal flank heights', async () => {
    const plan = await planFineRangeTree({ seed: 9811, isLand: ellipse }, 2048, control), field = await createOrographyField(plan.chains, ellipse, 2048, control);
    const main = field.curves.find(c => c.group === 0)!, peaks = main.profile.filter(p => p.kind === 'peak');
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    const low = main.profile.filter(p => p.kind === 'saddle' && p.arcQ > peaks[0].arcQ && p.arcQ < peaks.at(-1)!.arcQ).sort((a, b) => a.strength - b.strength)[0];
    expect(low).toBeDefined();
    const pass = atArc(main, low.arcQ), passHeight = field.sample(pass.xQ, pass.yQ).massQ;
    const highs = [peaks[0], peaks.at(-1)!].map(p => { const at = atArc(main, p.arcQ); return field.sample(at.xQ, at.yQ).massQ; });
    expect(Math.min(...highs) - passHeight).toBeGreaterThan(300);
    const asymmetric = field.supports.filter(n => Math.abs(n.section!.leftReachQ - n.section!.rightReachQ) > q(8) && n.peakQ > 1000);
    expect(asymmetric.length).toBeGreaterThan(3);
    const differences = asymmetric.map(n => {
      const offset = .45 * Math.min(n.section!.leftReachQ, n.section!.rightReachQ);
      return Math.abs(field.sample(n.xQ - n.ty * offset, n.yQ + n.tx * offset).massQ - field.sample(n.xQ + n.ty * offset, n.yQ - n.tx * offset).massQ);
    });
    expect(Math.max(...differences)).toBeGreaterThan(100);
    evidence.structure = { passHeight, highs, asymmetricSupports: asymmetric.length, maximumFlankDifference: Math.max(...differences) };
  });

  it('is deterministic across batches, caller mutation, and coarse simulation resolutions', async () => {
    const input = { seed: 9811, isLand: ellipse };
    const a = await planFineRangeTree(input, 2048, control); let changed = false;
    const b = await planFineRangeTree(input, 64, { yieldControl: async () => { if (!changed) { changed = true; input.seed = 0; input.isLand = () => false; } } });
    expect(b).toEqual(a);
    const heights: number[][] = [];
    for (const size of [128, 256, 512] as const) {
      const relief = await createNaturalRelief(naturalInput(size), 2048, control);
      expect(relief.rangeTree!.graph).toEqual(a.graph);
      heights.push(Array.from({ length: 64 }, (_, i) => relief.physicalHeight(q(1024 + i * 24), q(1900 + i % 3 * 8), true, q(120), -5000)));
    }
    expect(heights[1]).toEqual(heights[0]); expect(heights[2]).toEqual(heights[0]);
  });

  it('keeps coast/sea semantics and rejects real cross-sea curve spans instead of moving the shore', async () => {
    const bay = (x: number, y: number) => ellipse(x, y) && !(x > q(2700) && y > q(1750) && y < q(2000));
    const relief = await createNaturalRelief(naturalInput(128, 9811, bay), 2048, control);
    for (const curve of relief.curves) for (const p of curve.points) expect(bay(p.xQ, p.yQ)).toBe(true);
    const legacyInput = { ...naturalInput(128), heightPlanning: undefined };
    const old = await oldRelief(legacyInput, 2048, control);
    for (const distance of [0, 1, 8, 32, 120]) expect(relief.physicalHeight(q(20), q(20), false, q(distance), -5000)).toBe(old.physicalHeight(q(20), q(20), false, q(distance), -5000));
    expect(relief.physicalHeight(q(400), q(2000), true, 0, -5000)).toBe(0);
    evidence.bay = { planned: relief.rangeTree!.stats, accepted: relief.curveStats };
  });

  it('preserves unflagged world and local values exactly against the independent preview18 oracle', async () => {
    for (const scaleMode of ['world', 'local'] as const) {
      const input = { ...naturalInput(128), heightPlanning: undefined, scaleMode };
      const before = await oldRelief(input, 2048, control), after = await createNaturalRelief(input, 2048, control);
      expect(after.summary).toEqual(before.summary); expect(after.ridges).toEqual(before.ridges); expect(after.curves).toEqual(before.curves);
      for (let y = 1300; y <= 2600; y += 50) for (let x = 800; x <= 3200; x += 50) expect(after.physicalHeight(q(x), q(y), true, q(120), -5000)).toBe(before.physicalHeight(q(x), q(y), true, q(120), -5000));
    }
  });

  it('keeps the real small writer rectangle under unchanged density limits and matches an all-support query oracle', async () => {
    const plan = await planFineRangeTree({ seed: seedHash('explicit-fine-new-land'), isLand: rectangle }, 2048, control);
    const field = await createOrographyField(plan.chains, rectangle, 2048, control);
    expect(field.curves.length).toBeGreaterThanOrEqual(2);
    expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(OROGRAPHY_LIMITS.bucketCandidates);
    expect(field.stats.indexReferences).toBeLessThanOrEqual(OROGRAPHY_LIMITS.indexReferences);
    for (let y = 992; y <= 1568; y += 32) for (let x = 992; x <= 1696; x += 32) for (const d of [-1, 0, 1]) {
      const p = field.sample(q(x) + d, q(y) + d); expect(p.massQ).toBeCloseTo(exhaustive(field, q(x) + d, q(y) + d), 7);
      expect(p.kernelTests).toBeLessThanOrEqual(192);
    }
    evidence.smallRectangle = { planned: plan.stats, accepted: field.stats };
  });

  it('cancels after actual route work and captures all section data before callbacks', async () => {
    const abort = new AbortController(); let work = 0;
    await expect(planFineRangeTree({ seed: 9811, isLand: ellipse }, 64, { signal: abort.signal, yieldControl: control.yieldControl,
      onProgress: (phase, done) => { if (phase === 'route-fine-range-tree' && done > 0) { work = done; abort.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(work).toBeGreaterThan(0);
    const plan = await planFineRangeTree({ seed: 9811, isLand: ellipse }, 2048, control), a = await createOrographyField(plan.chains, ellipse, 2048, control);
    let changed = false;
    const b = await createOrographyField(plan.chains, ellipse, 64, { yieldControl: async () => { if (!changed) { changed = true; plan.chains[0].anchors[0].section!.leftReachQ = 1; } } });
    expect(b.stats).toEqual(a.stats);
    for (let x = 600; x <= 3400; x += 64) expect(b.sample(q(x), q(2048))).toEqual(a.sample(q(x), q(2048)));
    evidence.cancelledAfterEdgeTests = work;
  });

  it('enforces explicit fine-tree caps and rejects parent cycles or mixed modes', async () => {
    const plan = await planFineRangeTree({ seed: 9811, isLand: ellipse }, 2048, control);
    expect(FINE_TREE_OROGRAPHY_LIMITS).toEqual({ chains: 5, anchors: 19, uniqueVertices: 15, spans: 14 });
    const cyclic = structuredClone(plan.chains); cyclic[1].parentGroup = 1;
    await expect(createOrographyField(cyclic, ellipse, 128, control)).rejects.toThrow('父子关系');
    const mixed = structuredClone(plan.chains); mixed[1].crossSection = 'fine-world';
    await expect(createOrographyField(mixed, ellipse, 128, control)).rejects.toThrow('不能与其他');
    await expect(createOrographyField([...plan.chains, ...plan.chains], ellipse, 128, control)).rejects.toThrow('预算');
  });
});
