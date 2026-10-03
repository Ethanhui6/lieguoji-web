import { FIELD_Q, hashAt, integerSqrt, noiseQ12 } from './seed';
import type { DetailShapeControl } from './detail-shape';
import { createMassifField } from './terrain-massif';

type Point = { xQ: number; yQ: number };
export interface OrographySection { leftReachQ: number; rightReachQ: number; leftShoulderQ: number; rightShoulderQ: number }
export interface OrographyAnchor extends Point { widthQ: number; peakQ: number; section?: OrographySection }
export interface OrographyChain {
  group: number; leeQ: number; seed: number; sampleStepQ: number;
  /** Omitted retains existing coarse-compatible/local cross sections. */
  crossSection?: 'fine-world' | 'fine-tree';
  landform?: 'area-v2';
  parentGroup?: number;
  /** Group zero is the trunk. A fine-tree branch can explicitly name an
   * earlier parent; legacy branches continue to attach only to the trunk. */
  anchors: readonly OrographyAnchor[];
}
type Probe = Point & { tx: number; ty: number; arc: number };
type ArcAnchor = OrographyAnchor & { arc: number };
export interface OrographyProfilePoint { arcQ: number; strength: number; widthScale: number; kind: 'end' | 'peak' | 'saddle' }
type Run = { group: number; leeQ: number; seed: number; sampleStepQ: number; crossSection?: 'fine-world' | 'fine-tree'; points: Probe[]; anchors: ArcAnchor[]; length: number; parentRun?: number; parentHeight: number; rootPeak: number; profile: OrographyProfilePoint[] };
type Span = {
  a: Point; b: Point; widthQ: number; peakQ: number; group: number;
  widthAQ: number; widthBQ: number; peakAQ: number; peakBQ: number; leeQ: number;
  run: number; arcAQ: number; arcBQ: number;
};
type Support = Point & { tx: number; ty: number; alongQ: number; widthQ: number; crestQ: number; foothillShare: number; valleyOffset: number; peakQ: number; weight: number; leeQ: number; valleyDepth: number; valleySide: number; run: number; arc: number; section?: OrographySection };
type Ends = { first: Probe; last: Probe; fadeQ: number; branch: boolean };
const WORLD_Q = 4096 * 256, BUCKET_Q = 64 * 256, FINE_BUCKET_Q = 32 * 256;
export const OROGRAPHY_LIMITS = { chains: 3, anchors: 17, spans: 14, nodes: 4096, indexReferences: 262144, bucketCandidates: 192, curveProbePoints: 131072 } as const;
export const OROGRAPHY_UNION = { power: 64, epsilonQ: 1e-6, maximumRuns: 10 } as const;
export const FINE_TREE_OROGRAPHY_LIMITS = Object.freeze({ chains: 5, anchors: 19, uniqueVertices: 15, spans: 14 } as const);
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const blend = (a: number, b: number, t: number) => a + (b - a) * smooth(t);
const compact = (value: number) => { const q = 1 - value * value; return q > 0 ? q * q * q : 0; };
const length = (a: Point, b: Point) => integerSqrt((a.xQ - b.xQ) ** 2 + (a.yQ - b.yQ) ** 2);
const same = (a: Point, b: Point) => a.xQ === b.xQ && a.yQ === b.yQ;

/** Stable C1 nonnegative union with an explicit, small overlap uplift cap. */
export function combineOrographyMasses(masses: ArrayLike<number>): number {
  if (masses.length > OROGRAPHY_UNION.maximumRuns) throw new Error('山系合成超出曲链预算。');
  let scale: number = OROGRAPHY_UNION.epsilonQ;
  for (let i = 0; i < masses.length; i++) {
    const mass = masses[i]; if (!Number.isFinite(mass) || mass < 0) throw new Error('山系合成高度无效。');
    scale = Math.max(scale, mass);
  }
  let powerSum = (OROGRAPHY_UNION.epsilonQ / scale) ** OROGRAPHY_UNION.power;
  for (let i = 0; i < masses.length; i++) powerSum += (masses[i] / scale) ** OROGRAPHY_UNION.power;
  return scale * powerSum ** (1 / OROGRAPHY_UNION.power) - OROGRAPHY_UNION.epsilonQ;
}

function tangents(points: readonly Point[]): Point[] {
  const axis = Math.abs(points.at(-1)!.xQ - points[0].xQ) >= Math.abs(points.at(-1)!.yQ - points[0].yQ) ? 'xQ' : 'yQ';
  const direction = Math.sign(points.at(-1)![axis] - points[0][axis]);
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const divisor = i === 0 || i === points.length - 1 ? 1 : 2;
    let xQ = (b.xQ - a.xQ) / divisor, yQ = (b.yQ - a.yQ) / divisor;
    const cap = 1.25 * Math.min(i ? length(a, p) : Infinity, i + 1 < points.length ? length(p, b) : Infinity), magnitude = Math.hypot(xQ, yQ);
    if (magnitude > cap) { xQ *= cap / magnitude; yQ *= cap / magnitude; }
    const back = (p[axis] - a[axis]) * direction, forward = (b[axis] - p[axis]) * direction, component = (axis === 'xQ' ? xQ : yQ) * direction;
    if ((i === 0 || back > 0) && (i === points.length - 1 || forward > 0) && component > 0) {
      const componentCap = 2.5 * Math.min(i ? back : Infinity, i + 1 < points.length ? forward : Infinity);
      if (component > componentCap) { xQ *= componentCap / component; yQ *= componentCap / component; }
    }
    return { xQ, yQ };
  });
}
function hermite(a: Point, b: Point, ta: Point, tb: Point, t: number) {
  const t2 = t * t, t3 = t2 * t;
  const coordinate = (av: number, bv: number, at: number, bt: number) => (2 * t3 - 3 * t2 + 1) * av + (t3 - 2 * t2 + t) * at + (-2 * t3 + 3 * t2) * bv + (t3 - t2) * bt;
  const derivative = (av: number, bv: number, at: number, bt: number) => (6 * t2 - 6 * t) * av + (3 * t2 - 4 * t + 1) * at + (-6 * t2 + 6 * t) * bv + (3 * t2 - 2 * t) * bt;
  let tx = derivative(a.xQ, b.xQ, ta.xQ, tb.xQ), ty = derivative(a.yQ, b.yQ, ta.yQ, tb.yQ), norm = Math.hypot(tx, ty);
  if (norm < 1e-9) { tx = b.xQ - a.xQ; ty = b.yQ - a.yQ; norm = Math.hypot(tx, ty); }
  return { xQ: Math.round(coordinate(a.xQ, b.xQ, ta.xQ, tb.xQ)), yQ: Math.round(coordinate(a.yQ, b.yQ, ta.yQ, tb.yQ)), tx: tx / norm, ty: ty / norm };
}

/** Continuous physical ridge envelope. Every interval joins a peak, saddle or
 * foothill; no baseline gaps between three predetermined isolated events. */
export function planOrographyProfile(seed: number, lengthQ: number): OrographyProfilePoint[] {
  if (!Number.isInteger(seed) || !Number.isFinite(lengthQ) || lengthQ <= 0) throw new Error('山带纵向尺度无效。');
  const peaks = lengthQ < 384 * 256 ? 1 : Math.max(2, Math.min(4, Math.round(lengthQ / (420 * 256))));
  const gaps = Array.from({ length: peaks + 1 }, (_, i) => i === 0 || i === peaks
    ? .5 + (hashAt(seed, 7290, i, 0) % 301) / 1000 : .85 + (hashAt(seed, 7290, i, 0) % 1101) / 1000);
  const sum = gaps.reduce((total, value) => total + value, 0), positions: number[] = []; let distance = 0;
  for (let i = 0; i < peaks; i++) { distance += gaps[i]; positions.push(lengthQ * distance / sum); }
  const profile: OrographyProfilePoint[] = [{ arcQ: 0, strength: .24, widthScale: .7, kind: 'end' }];
  for (let i = 0; i < peaks; i++) {
    if (i) profile.push({ arcQ: positions[i - 1] + (positions[i] - positions[i - 1]) * (.36 + (hashAt(seed, 7292, i, 0) % 281) / 1000),
      strength: .32 + (hashAt(seed, 7293, i, 0) % 101) / 1000, widthScale: .88 + (hashAt(seed, 7294, i, 0) % 121) / 1000, kind: 'saddle' });
    profile.push({ arcQ: positions[i], strength: .91 + (hashAt(seed, 7291, i, 0) % 91) / 1000,
      widthScale: .82 + (hashAt(seed, 7295, i, 0) % 181) / 1000, kind: 'peak' });
  }
  profile.push({ arcQ: lengthQ, strength: .24, widthScale: .7, kind: 'end' });
  return profile;
}
function profileAt(run: Run, arc: number) {
  let index = 1; while (index + 1 < run.profile.length && run.profile[index].arcQ < arc) index++;
  const a = run.profile[index - 1], b = run.profile[index], t = (arc - a.arcQ) / (b.arcQ - a.arcQ);
  return { strength: blend(a.strength, b.strength, t), widthScale: blend(a.widthScale, b.widthScale, t) };
}
function profile(run: Run, arc: number): number {
  if (run.crossSection === 'fine-tree') {
    const value = profileAt(run, arc).strength * FIELD_Q;
    return run.group ? run.rootPeak * value / Math.max(1, run.anchors[0].peakQ) : value;
  }
  if (run.group) return run.rootPeak * (1 - .74 * smooth(arc / run.length));
  return Math.max(...run.anchors.map(p => p.peakQ)) * profileAt(run, arc).strength;
}
const widthScaleAt = (run: Run, arc: number) => run.crossSection === 'fine-tree' ? 1 : run.group ? 1 - .08 * smooth(arc / run.length) : profileAt(run, arc).widthScale;
function endpointWeight(ends: Ends, xQ: number, yQ: number) {
  const start = (xQ - ends.first.xQ) * ends.first.tx + (yQ - ends.first.yQ) * ends.first.ty;
  const finish = (ends.last.xQ - xQ) * ends.last.tx + (ends.last.yQ - yQ) * ends.last.ty;
  // A branch extends only one small gate behind its attachment, into its trunk.
  // Its root height is below that trunk. A free trunk endpoint always fades to 0.
  return smooth((start + (ends.branch ? ends.fadeQ : 0)) / ends.fadeQ) * smooth(finish / ends.fadeQ);
}
function endFadeOf(run: Run) {
  return Math.min(run.length / 3, Math.max(Math.min(...run.anchors.map(a => a.widthQ)) * .5, run.length * .08));
}
function endsOf(run: Run): Ends {
  return { first: run.points[0], last: run.points.at(-1)!, fadeQ: endFadeOf(run) / 2, branch: run.group !== 0 };
}
function contribution(node: Support, xQ: number, yQ: number): number {
  const dx = xQ - node.xQ, dy = yQ - node.yQ, along = (dx * node.tx + dy * node.ty) / node.alongQ;
  if (Math.abs(along) >= 1) return 0;
  const across = -dx * node.ty + dy * node.tx;
  if (node.section) {
    const reach = across < 0 ? node.section.leftReachQ : node.section.rightReachQ;
    const shoulder = (across < 0 ? node.section.leftShoulderQ : node.section.rightShoulderQ) / FIELD_Q;
    // Both one-sided sections meet with equal value and zero derivative at
    // the actual crest. The differing reaches/shoulders are planned terrain.
    const shape = (1 - shoulder) * compact(across / node.crestQ) + shoulder * compact(across / reach);
    return node.peakQ * compact(along) * shape * node.weight;
  }
  const signed = Math.max(-1, Math.min(1, across / (node.widthQ / 4))), side = signed * (1.5 - .5 * signed * signed);
  const sideWidth = 1 + .15 * node.leeQ * side, width = node.widthQ * sideWidth, crest = node.crestQ * sideWidth;
  if (Math.abs(across) >= width) return 0;
  const foothill = node.foothillShare * compact(across / width);
  // A finite branch-side hollow lowers the real foothill field. It does not
  // draw a river, carve below the supplied background or claim drainage.
  const hollow = node.valleyDepth * compact((across / width - node.valleySide * node.valleyOffset) / .14);
  const crossSection = (1 - node.foothillShare) * compact(across / crest) + foothill * (1 - hollow);
  // Separable ribbon: along support does not squeeze the transverse section
  // into an ellipse. Both compact edges, side width and gates are at least C1.
  return node.peakQ * compact(along) * crossSection * node.weight;
}

/** Real geographic relief with bounded geometry, query and cancellation work.
 * All source capture precedes the first callback; diagnostics are copies.
 * Existing coast, storage, Hbase and local-lock kernels are deliberately absent. */
async function createRibbonOrographyField(rawChains: readonly OrographyChain[], isLand: (xQ: number, yQ: number) => boolean, batch: number, control?: DetailShapeControl) {
  if (!Number.isInteger(batch) || batch < 64 || batch > 2048 || rawChains.length > FINE_TREE_OROGRAPHY_LIMITS.chains) throw new Error('山系工作预算无效。');
  const tree = rawChains.length > 0 && rawChains.every(c => c.crossSection === 'fine-tree');
  if (!tree && rawChains.some(c => c.crossSection === 'fine-tree')) throw new Error('细脊树不能与其他山系规划混合。');
  const chainLimit = tree ? FINE_TREE_OROGRAPHY_LIMITS.chains : OROGRAPHY_LIMITS.chains;
  const anchorLimit = tree ? FINE_TREE_OROGRAPHY_LIMITS.anchors : OROGRAPHY_LIMITS.anchors;
  if (rawChains.length > chainLimit) throw new Error('山系工作预算无效。');
  // Reject oversized source arrays before copying their contents. The normal
  // planner already respects these caps; helper callers get the same bound.
  if (rawChains.reduce((sum, c) => sum + c.anchors.length, 0) > anchorLimit || rawChains.some(c => c.anchors.length > (tree ? c.group ? 3 : 7 : c.group ? 4 : 9))) throw new Error('山系锚点预算无效。');
  const chains = rawChains.map(c => ({ group: c.group, leeQ: c.leeQ, seed: c.seed, sampleStepQ: c.sampleStepQ, crossSection: c.crossSection, parentGroup: c.parentGroup,
    anchors: c.anchors.map(p => ({ ...p, ...(p.section ? { section: { ...p.section } } : {}) })) }));
  if (chains.reduce((sum, c) => sum + c.anchors.length, 0) > anchorLimit || chains.some((c, i) => c.group !== i)) throw new Error('山系主支关系或锚点预算无效。');
  if (tree && new Set(chains.flatMap(c => c.anchors.map(p => `${p.xQ}:${p.yQ}`))).size > FINE_TREE_OROGRAPHY_LIMITS.uniqueVertices) throw new Error('细山系唯一节点超出预算。');
  for (const chain of chains) {
    if (chain.crossSection !== undefined && chain.crossSection !== 'fine-world' && chain.crossSection !== 'fine-tree' || chain.crossSection !== undefined && chain.sampleStepQ !== 512) throw new Error('山系细高程规划模式无效。');
    if (tree && chain.group && (!Number.isInteger(chain.parentGroup) || chain.parentGroup! < 0 || chain.parentGroup! >= chain.group)) throw new Error('细山系父子关系无效。');
    if (![-1, 1].includes(chain.leeQ) || !Number.isInteger(chain.seed) || !Number.isInteger(chain.sampleStepQ) || chain.sampleStepQ < 512 || chain.sampleStepQ > 32 * 256 || chain.anchors.length > (chain.group ? 4 : 9)) throw new Error('山系锚点或采样规格无效。');
    for (const p of chain.anchors) if (![p.xQ, p.yQ, p.widthQ, p.peakQ].every(Number.isInteger) || p.xQ < 0 || p.yQ < 0 || p.xQ > WORLD_Q || p.yQ > WORLD_Q || p.widthQ < 4 * 256 || p.widthQ > 512 * 256 || p.peakQ < 0 || p.peakQ > FIELD_Q) throw new Error('山系私有锚点无效。');
    if (tree) for (const p of chain.anchors) {
      const s = p.section;
      if (!s || !Object.values(s).every(Number.isInteger) || s.leftReachQ < 4 * 256 || s.rightReachQ < 4 * 256 || s.leftReachQ > 512 * 256 || s.rightReachQ > 512 * 256
        || s.leftShoulderQ < 0 || s.rightShoulderQ < 0 || s.leftShoulderQ > FIELD_Q || s.rightShoulderQ > FIELD_Q) throw new Error('细山系左右侧坡无效。');
    }
  }
  let work = 0, probes = 0, rejectedSpans = 0, rejectedBranches = 0;
  const checkpoint = async (phase: string, completed: number, total: number) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, completed, total); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted();
  };
  const runs: Run[] = [], spans: Span[] = [];
  await checkpoint('plan-branching-orography', 0, chains.length);
  for (const chain of chains) {
    const anchors = chain.anchors.filter((p, i, all) => i === 0 || !same(p, all[i - 1]));
    if (anchors.length < 2) continue;
    const parent = chain.group ? runs.find(r => r.group === (chain.parentGroup ?? 0) && r.points.some(p => same(p, anchors[0]))) : undefined;
    if (chain.group && !parent) { rejectedBranches++; continue; }
    const parentArc = parent?.points.find(p => same(p, anchors[0]))?.arc ?? 0;
    // A surviving trunk point may be the true endpoint of a sea-cut run. Its
    // stored profile alone says nothing about the endpoint gate. Connections
    // are restricted to the fully faded-in interior with a live actual gate.
    if (parent && (parentArc < endFadeOf(parent) || parent.length - parentArc < endFadeOf(parent)
      || endpointWeight(endsOf(parent), anchors[0].xQ, anchors[0].yQ) < .5)) { rejectedBranches++; continue; }
    const tangent = tangents(anchors), pendingRuns: Run[] = [], pendingSpans: Span[] = []; let run: Run | undefined, failed = false;
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i], ta = tangent[i - 1], tb = tangent[i];
      const c1 = { xQ: a.xQ + ta.xQ / 3, yQ: a.yQ + ta.yQ / 3 }, c2 = { xQ: b.xQ - tb.xQ / 3, yQ: b.yQ - tb.yQ / 3 };
      const bound = 3 * Math.max(Math.hypot(c1.xQ - a.xQ, c1.yQ - a.yQ), Math.hypot(c2.xQ - c1.xQ, c2.yQ - c1.yQ), Math.hypot(b.xQ - c2.xQ, b.yQ - c2.yQ));
      const count = Math.max(1, Math.ceil(bound / 256)), points: Probe[] = []; let clear = true;
      for (let j = 0; j <= count; j++) {
        const point = hermite(a, b, ta, tb, j / count);
        if (++probes > OROGRAPHY_LIMITS.curveProbePoints) throw new Error('山系真实陆地探针超出有界预算。');
        if (point.xQ < 0 || point.yQ < 0 || point.xQ > WORLD_Q || point.yQ > WORLD_Q || !isLand(point.xQ, point.yQ)) { clear = false; break; }
        points.push({ ...point, arc: 0 });
        if (++work % batch === 0) await checkpoint('probe-branching-land', probes, OROGRAPHY_LIMITS.curveProbePoints);
      }
      if (!clear) { rejectedSpans++; run = undefined; failed = true; if (chain.group) break; continue; }
      if (!run) {
        run = { group: chain.group, leeQ: chain.leeQ, seed: chain.seed, sampleStepQ: chain.sampleStepQ, crossSection: chain.crossSection, points: [], anchors: [{ ...a, arc: 0 }], length: 0,
          parentRun: parent ? runs.indexOf(parent) : undefined, parentHeight: 0, rootPeak: 0, profile: [] };
        pendingRuns.push(run);
      }
      const arcAQ = run.length;
      for (const point of points) {
        const previous = run.points.at(-1); if (previous && same(previous, point)) continue;
        if (previous) run.length += length(previous, point);
        point.arc = run.length; run.points.push(point);
      }
      run.anchors.push({ ...b, arc: run.length });
      pendingSpans.push({ a: { xQ: a.xQ, yQ: a.yQ }, b: { xQ: b.xQ, yQ: b.yQ }, group: chain.group, leeQ: chain.leeQ,
        widthQ: Math.max(a.widthQ, b.widthQ), peakQ: Math.max(a.peakQ, b.peakQ), widthAQ: a.widthQ, widthBQ: b.widthQ, peakAQ: a.peakQ, peakBQ: b.peakQ,
        run: runs.length + pendingRuns.length - 1, arcAQ, arcBQ: run.length });
    }
    // No detached continuation of a branch beyond a rejected inlet crossing.
    if (chain.group && failed) { rejectedBranches++; continue; }
    for (const r of pendingRuns) {
      r.profile = r.crossSection === 'fine-tree' ? r.anchors.map((a, i, all) => ({ arcQ: a.arc, strength: a.peakQ / FIELD_Q, widthScale: 1,
        kind: i === 0 || i + 1 === all.length ? 'end' : a.peakQ >= all[i - 1].peakQ && a.peakQ >= all[i + 1].peakQ ? 'peak' : 'saddle' }))
        : r.group ? [] : planOrographyProfile(r.seed, r.length);
      runs.push(r);
    }
    spans.push(...pendingSpans);
    if (spans.length > OROGRAPHY_LIMITS.spans) throw new Error('山系实际曲段超出预算。');
    if (runs.length > OROGRAPHY_UNION.maximumRuns) throw new Error('山系有效曲链超出预算。');
  }
  const nodes: Support[] = [], ends: Ends[] = [];
  let attachmentSupportTests = 0;
  for (const [runId, run] of runs.entries()) {
    if (!run.length || run.points.length < 2) continue;
    if (run.parentRun !== undefined) {
      const root = run.points[0], gate = endpointWeight(ends[run.parentRun], root.xQ, root.yQ); let height = 0;
      // Parent runs precede branches. Query their already-built real supports,
      // with the same gate, before setting the child's declining crest. At
      // most two legacy or four tree attachments scan at most 4096 nodes each,
      // never per fine elevation node.
      for (const node of nodes) {
        if (++attachmentSupportTests > OROGRAPHY_LIMITS.nodes * (tree ? 4 : 2)) throw new Error('山系连接高程核验超出预算。');
        if (node.run === run.parentRun) height += contribution(node, root.xQ, root.yQ) * gate;
        if (++work % batch === 0) await checkpoint('verify-branch-attachment-height', attachmentSupportTests, OROGRAPHY_LIMITS.nodes * (tree ? 4 : 2));
      }
      if (!(height > 0) || !Number.isFinite(height)) throw new Error('支脊缺少有效的主脊实际连接高程。');
      run.parentHeight = height; run.rootPeak = .82 * Math.min(FIELD_Q, height);
    }
    const narrowest = Math.min(...run.anchors.map(a => a.widthQ)) * (run.group ? .92 : .7), along = .35 * narrowest;
    const count = Math.max(1, Math.ceil(run.length / Math.max(256, along / 4))), ds = run.length / count;
    if (nodes.length + count > OROGRAPHY_LIMITS.nodes) throw new Error('山系高度节点超出有界预算。');
    const endFade = endFadeOf(run);
    ends[runId] = endsOf(run);
    const endProfile = (arc: number) => smooth(Math.min(run.group ? Infinity : arc, run.length - arc) / endFade);
    for (const span of spans.filter(s => s.run === runId)) {
      const a = run.anchors.find(p => p.arc === span.arcAQ)!, b = run.anchors.find(p => p.arc === span.arcBQ)!;
      span.widthAQ = a.widthQ * widthScaleAt(run, a.arc); span.widthBQ = b.widthQ * widthScaleAt(run, b.arc); span.widthQ = Math.max(span.widthAQ, span.widthBQ);
      span.peakAQ = profile(run, span.arcAQ) * endProfile(span.arcAQ); span.peakBQ = profile(run, span.arcBQ) * endProfile(span.arcBQ);
      span.peakQ = Math.max(span.peakAQ, span.peakBQ, profile(run, (span.arcAQ + span.arcBQ) / 2));
    }
    let pointIndex = 1, anchorIndex = 1;
    for (let index = 0; index < count; index++) {
      const arc = (index + .5) * ds;
      while (pointIndex + 1 < run.points.length && run.points[pointIndex].arc < arc) pointIndex++;
      while (anchorIndex + 1 < run.anchors.length && run.anchors[anchorIndex].arc < arc) anchorIndex++;
      const pa = run.points[pointIndex - 1], pb = run.points[pointIndex], t = (arc - pa.arc) / (pb.arc - pa.arc);
      const a = run.anchors[anchorIndex - 1], b = run.anchors[anchorIndex], u = (arc - a.arc) / (b.arc - a.arc);
      let tx = pa.tx + (pb.tx - pa.tx) * t, ty = pa.ty + (pb.ty - pa.ty) * t, norm = Math.hypot(tx, ty);
      if (norm < 1e-9) { tx = pb.xQ - pa.xQ; ty = pb.yQ - pa.yQ; norm = Math.hypot(tx, ty); }
      tx /= norm; ty /= norm;
      const widthQ = blend(a.widthQ, b.widthQ, u) * widthScaleAt(run, arc), alongQ = .35 * widthQ, fraction = arc / run.length;
      // Broad regional ranges have wide shoulders which survive 16-world
      // Hbase sampling. Small/local spurs retain the original narrow crest
      // and low foothill relationship, with a smooth transition in metres.
      const landformScale = smooth((widthQ - 128 * 256) / (128 * 256));
      // Fine world ranges keep broad low foothills but a narrower, physically
      // sampled crest. Smooth seeded width variation changes actual heights;
      // the land-probed centreline and support budget remain unchanged.
      const fine = run.crossSection === 'fine-world' || run.crossSection === 'fine-tree';
      const variation = run.crossSection === 'fine-world' ? noiseQ12(run.seed, 7300, Math.round(arc), 0, 64 * 256) / FIELD_Q : 0;
      const crestQ = fine ? Math.max(3 * run.sampleStepQ, Math.min(40 * 256, widthQ * (.17 + .025 * variation)))
        : Math.min(widthQ * .62, Math.max(1.5 * run.sampleStepQ, widthQ * (.24 + .22 * landformScale)));
      const section = run.crossSection === 'fine-tree' ? {
        leftReachQ: blend(a.section!.leftReachQ, b.section!.leftReachQ, u), rightReachQ: blend(a.section!.rightReachQ, b.section!.rightReachQ, u),
        leftShoulderQ: blend(a.section!.leftShoulderQ, b.section!.leftShoulderQ, u), rightShoulderQ: blend(a.section!.rightShoulderQ, b.section!.rightShoulderQ, u),
      } : undefined;
      nodes.push({ xQ: pa.xQ + (pb.xQ - pa.xQ) * t, yQ: pa.yQ + (pb.yQ - pa.yQ) * t, tx, ty, widthQ,
        crestQ: Math.min(widthQ * .62, crestQ), alongQ, ...(section ? { section } : {}),
        foothillShare: fine ? .18 : .24 + .18 * landformScale, valleyOffset: fine ? .46 : .48 + .16 * landformScale,
        peakQ: profile(run, arc) * endProfile(arc), weight: 35 * ds / (32 * alongQ), leeQ: run.leeQ,
        valleyDepth: run.group ? .98 * 16 * fraction * fraction * (1 - fraction) ** 2 : 0, valleySide: run.leeQ, run: runId, arc });
      if (++work % batch === 0) await checkpoint('sample-branching-ribbons', nodes.length, OROGRAPHY_LIMITS.nodes);
    }
  }
  // A 64-world bucket over-collects narrow fine supports at main/branch joins.
  // Split only the fine-world index: geometry, contribution order and query /
  // reference limits stay unchanged. This uses at most 128^2 bucket slots
  // (legacy/local: 64^2); the bounded extra array overhead is not zero.
  const bucketQ = chains.some(chain => chain.crossSection === 'fine-world' || chain.crossSection === 'fine-tree') ? FINE_BUCKET_Q : BUCKET_Q;
  const bucketCount = WORLD_Q / bucketQ;
  const buckets: number[][] = Array.from({ length: bucketCount ** 2 }, () => []); let references = 0, maximumBucketCandidates = 0;
  for (const [id, node] of nodes.entries()) {
    const width = node.section ? Math.max(node.section.leftReachQ, node.section.rightReachQ, node.crestQ) : node.widthQ * 1.15;
    const rx = Math.abs(node.tx) * node.alongQ + Math.abs(node.ty) * width, ry = Math.abs(node.ty) * node.alongQ + Math.abs(node.tx) * width;
    const left = Math.max(0, Math.floor((node.xQ - rx) / bucketQ)), right = Math.min(bucketCount - 1, Math.floor((node.xQ + rx) / bucketQ));
    const top = Math.max(0, Math.floor((node.yQ - ry) / bucketQ)), bottom = Math.min(bucketCount - 1, Math.floor((node.yQ + ry) / bucketQ));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (node.section) {
        // A tree support is a rotated finite ribbon. Its axis-aligned box
        // includes empty corners, which must not consume the query budget.
        // Separating-axis projections reject only buckets outside the full
        // left/crest/right support rectangle; touching buckets stay included.
        const dx = (x + .5) * bucketQ - node.xQ, dy = (y + .5) * bucketQ - node.yQ;
        const radius = (Math.abs(node.tx) + Math.abs(node.ty)) * bucketQ / 2;
        const along = dx * node.tx + dy * node.ty, across = -dx * node.ty + dy * node.tx;
        const leftReach = Math.max(node.section.leftReachQ, node.crestQ), rightReach = Math.max(node.section.rightReachQ, node.crestQ);
        const rounding = 8 * Number.EPSILON * Math.max(1, Math.abs(dx), Math.abs(dy), node.alongQ, leftReach, rightReach, radius);
        if (Math.abs(along) > node.alongQ + radius + rounding || across + radius < -leftReach - rounding
          || across - radius > rightReach + rounding) continue;
      }
      const bucket = buckets[y * bucketCount + x]; bucket.push(id); maximumBucketCandidates = Math.max(maximumBucketCandidates, bucket.length);
      if (++references > OROGRAPHY_LIMITS.indexReferences || bucket.length > OROGRAPHY_LIMITS.bucketCandidates) throw new Error('山系局部密度超出有界查询预算。');
    }
    if (++work % batch === 0) await checkpoint('index-branching-orography', id + 1, nodes.length);
  }
  const spatial = buckets.map(bucket => Uint16Array.from(bucket)), masses = new Float64Array(runs.length), gates = new Float64Array(runs.length);
  const sample = (xQ: number, yQ: number) => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || yQ < 0 || xQ > WORLD_Q || yQ > WORLD_Q) throw new Error('山系查询坐标无效。');
    const bucket = spatial[Math.min(bucketCount - 1, Math.floor(yQ / bucketQ)) * bucketCount + Math.min(bucketCount - 1, Math.floor(xQ / bucketQ))];
    masses.fill(0);
    for (let run = 0; run < runs.length; run++) gates[run] = endpointWeight(ends[run], xQ, yQ);
    for (const id of bucket) { const node = nodes[id]; masses[node.run] += contribution(node, xQ, yQ) * gates[node.run]; }
    // Regularized L64 union is monotone in every nonnegative run: adding a
    // weaker branch cannot cut a notch in its parent. Its maximum uplift is
    // n^(1/64)-1 (<3.67% for all 10 possible runs; <1.09% for two equal runs).
    // Normalize only for numerical stability; the max cancels algebraically,
    // so this is not a hard-max geometry seam. Epsilon makes zero smooth too.
    return { massQ: combineOrographyMasses(masses), kernelTests: bucket.length };
  };
  await checkpoint('index-branching-orography', nodes.length, nodes.length);
  const stats = { curveRuns: runs.length, supportNodes: nodes.length, indexReferences: references, maximumBucketCandidates, landProbes: probes, attachmentSupportTests, rejectedSpans, rejectedBranches, acceptedSpans: spans.length };
  return { sample, stats, spans: spans.map(span => ({ ...span, a: { ...span.a }, b: { ...span.b } })), supports: nodes.map(node => ({ ...node, ...(node.section ? { section: { ...node.section } } : {}) })),
    ends: ends.map(end => ({ ...end, first: { ...end.first }, last: { ...end.last } })),
    curves: runs.map(run => ({ group: run.group, points: run.points.map(point => ({ ...point })), profile: run.profile.map(point => ({ ...point })), rootPeakQ: run.rootPeak, parentHeightQ: run.parentHeight })) };
}

/** Old field body above stays byte-for-byte apart from its local name. The
 * explicit new candidate generates an area field; it does not add more ribbons. */
export async function createOrographyField(rawChains: readonly OrographyChain[], isLand: (xQ: number, yQ: number) => boolean, batch: number, control?: DetailShapeControl) {
  const ribbon = await createRibbonOrographyField(rawChains, isLand, batch, control);
  if (!rawChains.some(chain => chain.landform)) return ribbon;
  if (!rawChains.every(chain => chain.landform === 'area-v2' && chain.crossSection === 'fine-tree')) throw new Error('面状山体候选不能混入旧山系路径。');
  const accepted = new Set(ribbon.spans.flatMap(span => [`${span.a.xQ}:${span.a.yQ}`, `${span.b.xQ}:${span.b.yQ}`]));
  const actualChains = rawChains.filter(chain => ribbon.curves.some(curve => curve.group === chain.group)).map(chain => ({ ...chain,
    anchors: chain.anchors.filter(anchor => accepted.has(`${anchor.xQ}:${anchor.yQ}`)) })).filter(chain => chain.anchors.length >= 2);
  if (!actualChains.length) return ribbon;
  const area = await createMassifField(actualChains, isLand, ribbon.stats.landProbes, OROGRAPHY_LIMITS.curveProbePoints, batch, control);
  return { ...ribbon, sample: area.sample, massif: area, stats: { ...ribbon.stats, landProbes: ribbon.stats.landProbes + area.stats.landProbes } };
}
