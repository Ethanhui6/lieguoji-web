import { describe, expect, it } from 'vitest';
import { combineOrographyMasses, createOrographyField, OROGRAPHY_LIMITS, OROGRAPHY_UNION, type OrographyChain } from './detail-orography';
import { createNaturalRelief } from './detail-natural-relief';

const q = (world: number) => world * 256;
const control = { yieldControl: async () => {} };
const ease = (v: number) => { const t = Math.min(1, Math.max(0, v)); return 3 * t ** 2 - 2 * t ** 3; };
const ribbon = (parts = 2): OrographyChain => ({ group: 0, seed: 9811, leeQ: 1, sampleStepQ: q(2),
  anchors: Array.from({ length: parts + 1 }, (_, i) => ({ xQ: q(400 + 1600 * i / parts), yQ: q(1000), widthQ: q(128), peakQ: 4096 })) });
const fork = (): OrographyChain => ({ group: 1, seed: 9811, leeQ: 1, sampleStepQ: q(2), anchors: [
  { xQ: q(1200), yQ: q(1000), widthQ: q(100), peakQ: 4096 },
  { xQ: q(1240), yQ: q(1220), widthQ: q(90), peakQ: 4096 },
  { xQ: q(1300), yQ: q(1450), widthQ: q(80), peakQ: 4096 },
  { xQ: q(1350), yQ: q(1700), widthQ: q(64), peakQ: 4096 },
] });
type Field = Awaited<ReturnType<typeof createOrographyField>>;
function atArc(points: Field['curves'][number]['points'], arc: number) {
  let index = 1; while (index + 1 < points.length && points[index].arc < arc) index++;
  const a = points[index - 1], b = points[index], t = (arc - a.arc) / (b.arc - a.arc), tx = a.tx + (b.tx - a.tx) * t, ty = a.ty + (b.ty - a.ty) * t, n = Math.hypot(tx, ty);
  return { xQ: a.xQ + (b.xQ - a.xQ) * t, yQ: a.yQ + (b.yQ - a.yQ) * t, tx: tx / n, ty: ty / n };
}
/** Independent all-support path: no production bucket or contribution helper. */
function exhaustive(field: Field, xQ: number, yQ: number, uncut = false) {
  const masses = field.ends.map(() => 0);
  for (const node of field.supports) {
    const dx = xQ - node.xQ, dy = yQ - node.yQ, u = (dx * node.tx + dy * node.ty) / node.alongQ, v = -dx * node.ty + dy * node.tx;
    const factor = 1 + .15 * node.leeQ * (2 * ease(.5 + 2 * v / node.widthQ) - 1);
    const c = v / (node.crestQ * factor), f = v / (node.widthQ * factor), hollow = (f - .48 * node.valleySide) / .14;
    if (Math.abs(u) >= 1 || Math.abs(f) >= 1) continue;
    const core = Math.abs(c) < 1 ? .76 * (1 - c * c) ** 3 : 0;
    const cut = !uncut && Math.abs(hollow) < 1 ? node.valleyDepth * (1 - hollow * hollow) ** 3 : 0;
    const transverse = core + .24 * (1 - f * f) ** 3 * (1 - cut);
    const end = field.ends[node.run], start = (xQ - end.first.xQ) * end.first.tx + (yQ - end.first.yQ) * end.first.ty;
    const finish = (end.last.xQ - xQ) * end.last.tx + (end.last.yQ - yQ) * end.last.ty;
    masses[node.run] += node.peakQ * (1 - u * u) ** 3 * transverse * node.weight
      * ease(start / end.fadeQ + Number(end.branch)) * ease(finish / end.fadeQ);
  }
  // The fixture stays below overflow for direct powers. This deliberately
  // differs from the production maximum-normalized numerical implementation.
  const maximum = Math.max(0, ...masses);
  const value = maximum >= 1e-3 ? masses.reduce((sum, mass) => sum + mass ** 64, 0) ** (1 / 64) - 1e-6
    : 1e-6 * ((1 + masses.reduce((sum, mass) => sum + (mass / 1e-6) ** 64, 0)) ** (1 / 64) - 1);
  return { value, masses };
}
function patchInput(local = false) {
  const size = 128, centersQ = new Int32Array(size * size * 2), land = new Uint8Array(size * size), coastDistanceQ = new Uint16Array(size * size);
  const isLand = (xQ: number, yQ: number) => xQ >= q(1280) && xQ <= q(1984) && yQ >= q(1280) && yQ <= q(1728);
  for (let id = 0; id < land.length; id++) {
    const xQ = q(id % size * 32 + 16), yQ = q(Math.floor(id / size) * 32 + 16); centersQ.set([xQ, yQ], id * 2);
    if (isLand(xQ, yQ)) { land[id] = 1; coastDistanceQ[id] = 32767; }
  }
  return { seed: 9811, size: size as 128, centersQ, land, coastDistanceQ, reliefMeters: 2400, shelfWidthWorld: 112,
    scaleMode: local ? 'local' as const : 'world' as const, isLand };
}

describe('branching orography from actual height data', () => {
  it('uses nonperiodic physical peak spacing, retaining multiple high-prominence saddles across extra curve joins', async () => {
    const a = await createOrographyField([ribbon(2)], () => true, 64, control), b = await createOrographyField([ribbon(4)], () => true, 512, control);
    const values: number[] = [], xs: number[] = [];
    for (let x = 432; x <= 1968; x += 4) {
      const value = a.sample(q(x), q(1000)).massQ; expect(value).toBeCloseTo(b.sample(q(x), q(1000)).massQ, 6); values.push(value); xs.push(x);
    }
    const peaks = values.flatMap((value, i) => i > 0 && i + 1 < values.length && value > values[i - 1] && value >= values[i + 1] ? [i] : []);
    const prominent = peaks.filter(index => {
      let left = values[index], right = values[index];
      for (let i = index - 1; i >= 0 && values[i] <= values[index]; i--) left = Math.min(left, values[i]);
      for (let i = index + 1; i < values.length && values[i] <= values[index]; i++) right = Math.min(right, values[i]);
      return values[index] - left > 200 && values[index] - right > 200;
    });
    expect(prominent.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values) - Math.min(...values.slice(25, -25))).toBeGreaterThan(1500);
    const gaps = prominent.slice(1).map((index, i) => xs[index] - xs[prominent[i]]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(20);
    expect(a.curves[0].events).toHaveLength(3);
    for (let i = 1; i < a.curves[0].events.length; i++) expect(a.curves[0].events[i].centerQ - a.curves[0].events[i].radiusQ).toBeGreaterThan(a.curves[0].events[i - 1].centerQ + a.curves[0].events[i - 1].radiusQ);
  });

  it('keeps a narrow actual crest over a wider low foothill and fades true trunk endpoints', async () => {
    const field = await createOrographyField([ribbon()], () => true, 128, control), peak = field.curves[0].events[1].centerQ;
    const p = atArc(field.curves[0].points, peak), h = (offset: number) => field.sample(p.xQ, p.yQ + q(offset)).massQ;
    expect(h(0)).toBeGreaterThan(h(32) * 3);
    expect(h(70)).toBeGreaterThan(50); expect(h(150)).toBe(0);
    const { first, last } = field.ends[0];
    expect(field.sample(first.xQ, first.yQ).massQ).toBe(0); expect(field.sample(last.xQ, last.yQ).massQ).toBe(0);
    expect(field.sample(first.xQ - q(10), first.yQ).massQ).toBe(0); expect(field.sample(last.xQ + q(10), last.yQ).massQ).toBe(0);
    expect(field.sample(first.xQ + q(2), first.yQ).massQ).toBeLessThan(1);
  });

  it('attaches below real parent height and never lowers a parent-only cross section when adding a branch', async () => {
    const parentOnly = await createOrographyField([ribbon()], () => true, 128, control), field = await createOrographyField([ribbon(), fork()], () => true, 128, control);
    expect(field.curves).toHaveLength(2);
    const root = field.curves[1].points[0], parent = field.curves[0].points.find(p => p.xQ === root.xQ && p.yQ === root.yQ);
    expect(parent).toBeDefined(); expect(field.curves[1].rootPeakQ).toBeGreaterThan(0); expect(field.curves[1].rootPeakQ).toBeLessThan(4096 * .82);
    expect(field.curves[1].rootPeakQ).toBeLessThan(parentOnly.sample(root.xQ, root.yQ).massQ);
    expect(field.curves[1].rootPeakQ).toBeCloseTo(field.curves[1].parentHeightQ * .82, 7);
    const atRoot = exhaustive(field, root.xQ, root.yQ);
    expect(atRoot.masses[1]).toBeGreaterThan(0); expect(atRoot.masses[1]).toBeLessThan(atRoot.masses[0]);
    let overlapped = 0, weakerCounterexamples = 0;
    for (let y = 984; y <= 1152; y += 8) for (let x = 1136; x <= 1264; x += 8) {
      const actual = field.sample(q(x), q(y)).massQ, oracle = exhaustive(field, q(x), q(y));
      expect(actual).toBeGreaterThanOrEqual(parentOnly.sample(q(x), q(y)).massQ - 1e-8);
      expect(actual).toBeLessThanOrEqual(Math.max(...oracle.masses) * 2 ** (1 / 64) + 1e-8);
      if (oracle.masses.every(value => value > 10)) overlapped++;
      if (oracle.masses[0] > 10 && oracle.masses[1] / oracle.masses[0] >= .5 && oracle.masses[1] / oracle.masses[0] <= .85) weakerCounterexamples++;
    }
    expect(overlapped).toBeGreaterThan(10); expect(weakerCounterexamples).toBeGreaterThan(0);
    const branch = field.supports.filter(node => node.run === 1), beforeEndFade = branch.filter(node => node.arc < field.curves[1].points.at(-1)!.arc * .7);
    for (let i = 1; i < beforeEndFade.length; i++) expect(beforeEndFade[i].peakQ).toBeLessThanOrEqual(beforeEndFade[i - 1].peakQ);
  });

  it('handles the independent 1/.7 depression counterexample and bounds stable monotone union from zero to large masses', () => {
    // Old sum(h^4)/sum(h^3) gives 0.9234 here. The new union must not
    // lower a parent when a weaker branch is introduced.
    expect((1 + .7 ** 4) / (1 + .7 ** 3)).toBeLessThan(.924);
    expect(combineOrographyMasses([1, .7])).toBeGreaterThanOrEqual(combineOrographyMasses([1]));
    expect(combineOrographyMasses([])).toBe(0); expect(combineOrographyMasses([0, 0])).toBe(0);
    expect(OROGRAPHY_UNION).toMatchObject({ power: 64, maximumRuns: 10, epsilonQ: 1e-6 });
    for (const maximum of [1e-100, 1e-9, 1e-6, 1e-3, 1, 4096, 1e100]) {
      let previous = combineOrographyMasses([maximum]);
      for (const fraction of [0, .001, .1, .7, 1]) {
        const value = combineOrographyMasses([maximum, maximum * fraction]);
        expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeGreaterThanOrEqual(previous); expect(value).toBeLessThanOrEqual(maximum * 2 ** (1 / 64)); previous = value;
      }
      expect(combineOrographyMasses(Array(10).fill(maximum))).toBeLessThanOrEqual(maximum * 10 ** (1 / 64));
    }
    // Equal-height crossover remains smooth: no hard-max derivative corner.
    const h = (offset: number) => combineOrographyMasses([1000 + offset, 1000 - offset]), center = h(0);
    const slopeGap = (step: number) => Math.abs((h(step) - center) / step - (center - h(-step)) / step);
    expect(slopeGap(1 / 256)).toBeLessThan(.01); expect(slopeGap(1 / 256)).toBeLessThan(slopeGap(1) / 64);
  });

  it('lowers a finite side valley in actual sampled foothills with a higher outer shoulder', async () => {
    const field = await createOrographyField([ribbon(), fork()], () => true, 128, control), curve = field.curves[1].points;
    const arc = curve.at(-1)!.arc * .55, point = atArc(curve, arc);
    const node = field.supports.filter(n => n.run === 1).reduce((best, n) => Math.abs(n.arc - arc) < Math.abs(best.arc - arc) ? n : best);
    const offset = (fraction: number) => ({ xQ: point.xQ - point.ty * node.widthQ * 1.15 * fraction, yQ: point.yQ + point.tx * node.widthQ * 1.15 * fraction });
    const valley = offset(.48), shoulder = offset(.68), valleyHeight = field.sample(valley.xQ, valley.yQ).massQ;
    expect(valleyHeight).toBeGreaterThanOrEqual(0);
    expect(exhaustive(field, valley.xQ, valley.yQ, true).value - valleyHeight).toBeGreaterThan(40);
    expect(field.sample(shoulder.xQ, shoulder.yQ).massQ - valleyHeight).toBeGreaterThan(10);
    expect(field.sample(point.xQ, point.yQ).massQ).toBeGreaterThan(valleyHeight + 300);
  });

  it('keeps shared curve tangents and finite height slopes continuous at joins and side-width transitions', async () => {
    const source = ribbon(); source.anchors[1].yQ = q(1300);
    const curved = await createOrographyField([source], () => true, 128, control), points = curved.curves[0].points;
    const index = points.findIndex(p => p.xQ === q(1200) && p.yQ === q(1300));
    expect(Math.abs(points[index - 1].ty - points[index + 1].ty)).toBeLessThan(.02);
    expect(points[index].tx).toBeCloseTo(1, 8); expect(points[index].ty).toBeCloseTo(0, 8);
    expect(Math.abs(curved.sample(q(1200) - 1, q(1300)).massQ - curved.sample(q(1200) + 1, q(1300)).massQ)).toBeLessThan(1);
    const straight = await createOrographyField([ribbon()], () => true, 128, control), arc = straight.curves[0].events[1].centerQ, p = atArc(straight.curves[0].points, arc);
    for (const boundary of [-32, 32]) {
      const height = (delta: number) => straight.sample(p.xQ, p.yQ + q(boundary + delta)).massQ, center = height(0);
      const gap = (step: number) => Math.abs((height(step) - center) / step - (center - height(-step)) / step);
      const slope = Math.abs((height(1 / 256) - height(-1 / 256)) * 128);
      expect(slope).toBeGreaterThan(1); expect(gap(1 / 256)).toBeLessThan(.1); expect(gap(1 / 256)).toBeLessThan(gap(1) / 64);
    }
    for (let i = 1; i < points.length; i++) expect(Math.hypot(points[i].xQ - points[i - 1].xQ, points[i].yQ - points[i - 1].yQ)).toBeLessThanOrEqual(q(1) + 2);
  });

  it('rejects actual curved sea crossings and rejects the whole orphan branch beyond a channel', async () => {
    const curved: OrographyChain = { ...ribbon(), anchors: [
      { xQ: q(400), yQ: q(1000), widthQ: q(48), peakQ: 3400 },
      { xQ: q(800), yQ: q(1300), widthQ: q(64), peakQ: 3400 },
      { xQ: q(1200), yQ: q(1000), widthQ: q(48), peakQ: 3400 },
    ] };
    let escaped = 0;
    const chordLand = (xQ: number, yQ: number) => { const chordY = xQ <= q(800) ? q(1000) + .75 * (xQ - q(400)) : q(1300) - .75 * (xQ - q(800)); const land = yQ <= chordY + q(2); if (!land) escaped++; return land; };
    const rejected = await createOrographyField([curved], chordLand, 64, control);
    expect(escaped).toBe(2); expect(rejected.stats.rejectedSpans).toBe(2); expect(rejected.stats.acceptedSpans).toBe(0);
    const channel = await createOrographyField([ribbon(), fork()], (_, yQ) => yQ < q(1250) || yQ > q(1262), 64, control);
    expect(channel.stats.rejectedBranches).toBe(1); expect(channel.curves.every(c => c.group === 0)).toBe(true);
    expect(channel.sample(q(1350), q(1650)).massQ).toBe(0);
  });

  it('rejects a branch at the zero-height true endpoint left by a sea-cut trunk', async () => {
    const land = (xQ: number, yQ: number) => xQ <= q(1250) || yQ >= q(1020);
    const parentOnly = await createOrographyField([ribbon()], land, 64, control), field = await createOrographyField([ribbon(), fork()], land, 64, control);
    // First trunk span survives, second crosses water. The branch itself is
    // all land but starts at the first span's real, zero-gated endpoint.
    expect(parentOnly.curves).toHaveLength(1); expect(parentOnly.curves[0].points.at(-1)).toMatchObject({ xQ: q(1200), yQ: q(1000) });
    expect(parentOnly.sample(q(1200), q(1000)).massQ).toBe(0);
    expect(field.stats.rejectedBranches).toBe(1); expect(field.curves.every(c => c.group === 0)).toBe(true);
    expect(field.supports.every(n => n.run === 0)).toBe(true);
    for (let y = 1000; y <= 1700; y += 25) for (let x = 1150; x <= 1400; x += 25) {
      expect(field.sample(q(x), q(y)).massQ).toBe(parentOnly.sample(q(x), q(y)).massQ);
    }
    expect(field.sample(q(1240), q(1220)).massQ).toBe(0);
  });

  it('matches exhaustive support evaluation across bucket boundaries and retains every original hard work cap', async () => {
    const field = await createOrographyField([ribbon(), fork()], () => true, 128, control);
    for (let i = 0; i < 384; i++) {
      const xQ = q(320 + i * 53 % 1856) + (i % 3 - 1), yQ = q(768 + i * 37 % 1088) + (i % 5 - 2);
      const actual = field.sample(xQ, yQ);
      expect(actual.massQ).toBeCloseTo(exhaustive(field, xQ, yQ).value, 7);
      expect(actual.kernelTests).toBeLessThanOrEqual(192);
    }
    expect(OROGRAPHY_LIMITS).toMatchObject({ nodes: 4096, indexReferences: 262144, bucketCandidates: 192, curveProbePoints: 131072 });
    expect(field.stats.supportNodes).toBeLessThanOrEqual(4096); expect(field.stats.indexReferences).toBeLessThanOrEqual(262144);
    expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(192); expect(field.stats.landProbes).toBeLessThanOrEqual(131072);
    expect(field.stats.acceptedSpans).toBeLessThanOrEqual(14);
    expect(field.stats.attachmentSupportTests).toBeLessThanOrEqual(8192);
  });

  it('captures private anchors before callbacks and returns only disposable diagnostic copies', async () => {
    const original = ribbon(), source = ribbon();
    const expected = await createOrographyField([original], () => true, 512, control);
    let changed = false;
    const field = await createOrographyField([source], () => true, 64, { ...control, onProgress: () => { if (!changed) { changed = true; source.anchors[0].xQ = 0; source.anchors[1].widthQ = q(4); source.seed = 20; } } });
    expect(field.curves).toEqual(expected.curves); expect(field.supports).toEqual(expected.supports);
    const before = field.sample(q(1032), q(1024));
    field.supports[0].peakQ = 0; field.curves[0].points[0].xQ = 0; field.curves[0].events[0].amplitude = 0; field.spans[0].a.xQ = 0;
    expect(field.sample(q(1032), q(1024))).toEqual(before);
  });

  it('cancels at geometry, sampling and index checkpoints without changing the caller source', async () => {
    for (const phase of ['plan-branching-orography', 'probe-branching-land', 'verify-branch-attachment-height', 'sample-branching-ribbons', 'index-branching-orography']) {
      const source = [ribbon(), fork()], before = structuredClone(source), controller = new AbortController();
      await expect(createOrographyField(source, () => true, 64, { ...control, signal: controller.signal,
        onProgress: name => { if (name === phase) controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(source).toEqual(before);
    }
  });

  it('keeps world/local APIs, attached branches, local width reduction and real curve land probes', async () => {
    const world = await createNaturalRelief(patchInput(), 512, control), local = await createNaturalRelief(patchInput(true), 64, control);
    expect(world.summary.ridgeGroups).toBe(3); expect(local.summary.ridgeGroups).toBe(1);
    expect(local.summary.maximumRidgeWidthWorld).toBeLessThan(world.summary.maximumRidgeWidthWorld / 2);
    expect(world.summary.maximumRidgeWidthWorld).toBeGreaterThanOrEqual(128); expect(world.summary.ridgeSegments).toBeLessThanOrEqual(16);
    expect(local.ridges.some(r => r.peakQ > 0)).toBe(true);
    const land = patchInput().isLand;
    for (const result of [world, local]) for (const curve of result.curves) for (let i = 0; i < curve.points.length; i++) {
      expect(land(curve.points[i].xQ, curve.points[i].yQ)).toBe(true);
      if (i) expect(curve.points[i].arc).toBeGreaterThan(curve.points[i - 1].arc);
    }
    for (const branch of world.curves.filter(c => c.group)) expect(world.curves.filter(c => c.group === 0).some(c => c.points.some(p => p.xQ === branch.points[0].xQ && p.yQ === branch.points[0].yQ))).toBe(true);
  });

  it('degrades an empty or very narrow local patch without generating a world-sized range and accepts fractional background metres', async () => {
    const input = patchInput(true); input.land.fill(0); input.coastDistanceQ.fill(0);
    const empty = await createNaturalRelief(input, 512, control);
    expect(empty.ridges).toEqual([]); expect(empty.physicalHeight(q(1600), q(1500), true, 32767, -3000, 731.25)).toBe(731);
    expect(empty.physicalHeight(q(1600), q(1500), true, 0, -3000, 731.25)).toBe(0);
    expect(empty.physicalHeight(q(1600), q(1500), false, 32767, -3000, 731.25)).toBe(-3000);
    expect(() => empty.physicalHeight(q(1600), q(1500), true, 32767, -3000, NaN)).toThrow();
    for (let id = 0; id < input.land.length; id++) if (input.centersQ[id * 2] >= q(1500) && input.centersQ[id * 2] <= q(1700) && input.centersQ[id * 2 + 1] === q(1488)) { input.land[id] = 1; input.coastDistanceQ[id] = 32767; }
    const narrow = await createNaturalRelief(input, 64, control);
    expect(narrow.ridges).toEqual([]); expect(narrow.curveStats.supportNodes).toBe(0);
  });

  it('rejects invalid chain identity and oversized planning input before invoking land callbacks', async () => {
    let probes = 0; const land = () => { probes++; return true; };
    const bad = fork(); bad.group = 0;
    await expect(createOrographyField([ribbon(), bad], land, 64, control)).rejects.toThrow();
    await expect(createOrographyField([ribbon(8), fork(), { ...fork(), group: 2, anchors: [...fork().anchors, { ...fork().anchors[3] }] }], land, 64, control)).rejects.toThrow();
    expect(probes).toBe(0);
  });

  it('rejects oversized anchor arrays before cloning source elements', async () => {
    const anchors = Array(18) as OrographyChain['anchors']; let elementReads = 0;
    Object.defineProperty(anchors, 0, { get: () => { elementReads++; throw new Error('oversized source was copied'); } });
    await expect(createOrographyField([{ ...ribbon(), anchors }], () => true, 64, control)).rejects.toThrow('预算');
    expect(elementReads).toBe(0);
  });
});
