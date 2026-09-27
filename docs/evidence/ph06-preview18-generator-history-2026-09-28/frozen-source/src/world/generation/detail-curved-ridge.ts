import { FIELD_Q, hashAt, integerSqrt, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';

type Point = { xQ: number; yQ: number };
export interface CurveAnchor extends Point { widthQ: number; peakQ: number }
export interface RidgeChain { group: number; leeQ: number; anchors: readonly CurveAnchor[]; profileSeed?: number; fitArcWidth?: boolean }
export interface CurvedRidgeSpan {
  a: Point; b: Point; widthQ: number; peakQ: number; group: number;
  widthAQ: number; widthBQ: number; peakAQ: number; peakBQ: number; leeQ: number;
  run: number; arcAQ: number; arcBQ: number;
}
export interface CurvedRidgeStats {
  curveRuns: number; supportNodes: number; indexReferences: number; maximumBucketCandidates: number;
  landProbes: number; rejectedSpans: number; acceptedSpans: number;
}
const WORLD_Q = 4096 * 256, BUCKET_Q = 64 * 256, BUCKETS = 64;
export const CURVED_RIDGE_LIMITS = { nodes: 4096, indexReferences: 262144, bucketCandidates: 192, curveProbePoints: 131072 } as const;
type Probe = Point & { tx: number; ty: number; arc: number };
type ArcAnchor = CurveAnchor & { arc: number };
type Run = { group: number; leeQ: number; profileSeed?: number; fitArcWidth?: boolean; points: Probe[]; anchors: ArcAnchor[]; length: number };
type Support = Point & { tx: number; ty: number; alongQ: number; widthQ: number; peakQ: number; weight: number; leeQ: number; run: number };
type Ends = { first: Probe; last: Probe; fadeQ: number };
const length = (a: Point, b: Point) => integerSqrt((a.xQ - b.xQ) ** 2 + (a.yQ - b.yQ) ** 2);
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const interpolated = (a: number, b: number, t: number) => a + (b - a) * smooth(t);

function tangents(points: readonly Point[]): Point[] {
  const horizontal = Math.abs(points.at(-1)!.xQ - points[0].xQ) >= Math.abs(points.at(-1)!.yQ - points[0].yQ);
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let xQ = (b.xQ - a.xQ) / (i === 0 || i === points.length - 1 ? 1 : 2), yQ = (b.yQ - a.yQ) / (i === 0 || i === points.length - 1 ? 1 : 2);
    const cap = 1.25 * Math.min(i ? length(a, p) : Infinity, i + 1 < points.length ? length(p, b) : Infinity), magnitude = Math.hypot(xQ, yQ);
    if (magnitude > cap) { xQ *= cap / magnitude; yQ *= cap / magnitude; }
    // The planner orders anchors along their long axis. Bound that derivative
    // against both adjacent spans so snapping cannot cause a folded cubic or
    // a near-zero interior speed followed by a sharp turn. The same adjusted
    // derivative is shared by the two adjoining cubics.
    const back = horizontal ? p.xQ - a.xQ : p.yQ - a.yQ, forward = horizontal ? b.xQ - p.xQ : b.yQ - p.yQ;
    const component = horizontal ? xQ : yQ;
    if ((i === 0 || back > 0) && (i === points.length - 1 || forward > 0) && component > 0) {
      const componentCap = 2.5 * Math.min(i ? back : Infinity, i + 1 < points.length ? forward : Infinity);
      if (component > componentCap) { const factor = componentCap / component; xQ *= factor; yQ *= factor; }
    }
    return { xQ, yQ };
  });
}
/** Shared endpoint derivatives make each chain C1 before Q8 sampling. The
 * samples are real height support, never a decorative shoreline/renderer path. */
function hermite(a: Point, b: Point, ta: Point, tb: Point, t: number) {
  const t2 = t * t, t3 = t2 * t;
  const coordinate = (av: number, bv: number, at: number, bt: number) => (2 * t3 - 3 * t2 + 1) * av + (t3 - 2 * t2 + t) * at + (-2 * t3 + 3 * t2) * bv + (t3 - t2) * bt;
  const derivative = (av: number, bv: number, at: number, bt: number) => (6 * t2 - 6 * t) * av + (3 * t2 - 4 * t + 1) * at + (-6 * t2 + 6 * t) * bv + (3 * t2 - 2 * t) * bt;
  let tx = derivative(a.xQ, b.xQ, ta.xQ, tb.xQ), ty = derivative(a.yQ, b.yQ, ta.yQ, tb.yQ), norm = Math.hypot(tx, ty);
  if (norm < 1e-9) { tx = b.xQ - a.xQ; ty = b.yQ - a.yQ; norm = Math.hypot(tx, ty); }
  return { xQ: Math.round(coordinate(a.xQ, b.xQ, ta.xQ, tb.xQ)), yQ: Math.round(coordinate(a.yQ, b.yQ, ta.yQ, tb.yQ)), tx: tx / norm, ty: ty / norm };
}
function contribution(node: Support, xQ: number, yQ: number): number {
  const dx = xQ - node.xQ, dy = yQ - node.yQ, along = (dx * node.tx + dy * node.ty) / node.alongQ;
  if (Math.abs(along) >= 1) return 0;
  const across = -dx * node.ty + dy * node.tx;
  const signed = Math.max(-1, Math.min(1, across / (node.widthQ / 4)));
  // Odd C1 saturation: ±1 beyond the blend, zero derivative at both joins.
  // Its range stays [-1,1], preserving the 1.15 spatial-index width bound.
  const side = signed * (1.5 - .5 * signed * signed);
  const width = node.widthQ * (1 + .15 * node.leeQ * side);
  const radius2 = along * along + (across / width) ** 2;
  if (radius2 >= 1) return 0;
  // A compact C2 radial kernel with a C1 variable width, integrated along the
  // shared arc rather than an independent peak per sample. 35/32 normalizes
  // integral (1-t²)^3 over [-1,1]. The composed field claims C1, not C2.
  const support = 1 - radius2;
  return node.peakQ * support * support * support * node.weight;
}

function endpointWeight(ends: Ends, xQ: number, yQ: number) {
  // Clip at the real run endpoints, not at each Hermite join. The C1 gates
  // prevent the integrated support from extending into a rounded end cap.
  const start = (xQ - ends.first.xQ) * ends.first.tx + (yQ - ends.first.yQ) * ends.first.ty;
  const finish = (ends.last.xQ - xQ) * ends.last.tx + (ends.last.yQ - yQ) * ends.last.ty;
  return smooth(start / ends.fadeQ) * smooth(finish / ends.fadeQ);
}

function peakOnArc(run: Run, arc: number, fallback: number) {
  if (run.profileSeed === undefined) return fallback;
  // Peaks and saddles belong to total physical arc length, independent of
  // where a cubic happened to be split. At least two broad peak/saddle cycles
  // survive real coarse sampling; mild phase modulation avoids equal spacing.
  const wavelength = Math.max(128 * 256, run.length / 3.7), phase = hashAt(run.profileSeed, 7250, run.group, 0) / 0x100000000 * Math.PI * 2;
  const u = arc / wavelength, wave = .5 + .5 * Math.cos(2 * Math.PI * u + phase + .32 * Math.sin(2 * Math.PI * u / 2.7 + phase));
  const envelope = .25 + .75 * wave * wave;
  return Math.max(...run.anchors.map(a => a.peakQ)) * envelope;
}

export async function createCurvedRidgeField(rawChains: readonly RidgeChain[], isLand: (xQ: number, yQ: number) => boolean, batch: number, control?: DetailShapeControl) {
  if (!Number.isInteger(batch) || batch < 64 || batch > 2048 || rawChains.length > 3) throw new Error('曲线山脊工作预算无效。');
  // Private source before the first callback or await.
  const chains = rawChains.map(chain => ({ group: chain.group, leeQ: chain.leeQ, profileSeed: chain.profileSeed, fitArcWidth: chain.fitArcWidth, anchors: chain.anchors.map(p => ({ ...p })) }));
  for (const chain of chains) {
    if (!Number.isInteger(chain.group) || ![-1, 1].includes(chain.leeQ) || chain.anchors.length > 9 || chain.profileSeed !== undefined && !Number.isInteger(chain.profileSeed)) throw new Error('曲线山脊身份或锚点数量无效。');
    for (const p of chain.anchors) if (![p.xQ, p.yQ, p.widthQ, p.peakQ].every(Number.isInteger) || p.xQ < 0 || p.yQ < 0 || p.xQ > WORLD_Q || p.yQ > WORLD_Q || p.widthQ < 4 * 256 || p.widthQ > 512 * 256 || p.peakQ < 0 || p.peakQ > FIELD_Q) throw new Error('曲线山脊锚点无效。');
  }
  let work = 0, probes = 0, rejectedSpans = 0;
  const checkpoint = async (phase: string, completed: number, total: number) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, completed, total); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted();
  };
  const runs: Run[] = [], spans: CurvedRidgeSpan[] = [];
  await checkpoint('plan-continuous-ridges', 0, chains.length);
  for (const chain of chains) {
    const anchors = chain.anchors.filter((p, i, all) => i === 0 || p.xQ !== all[i - 1].xQ || p.yQ !== all[i - 1].yQ);
    if (anchors.length < 2) continue;
    const tangent = tangents(anchors); let run: Run | undefined;
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i], ta = tangent[i - 1], tb = tangent[i];
      // Cubic derivative is bounded by 3*largest Bezier control edge. This
      // produces <=1 world steps before Q8 rounding (plus <=sqrt(2)/256 error).
      const c1 = { xQ: a.xQ + ta.xQ / 3, yQ: a.yQ + ta.yQ / 3 }, c2 = { xQ: b.xQ - tb.xQ / 3, yQ: b.yQ - tb.yQ / 3 };
      const bound = 3 * Math.max(Math.hypot(c1.xQ - a.xQ, c1.yQ - a.yQ), Math.hypot(c2.xQ - c1.xQ, c2.yQ - c1.yQ), Math.hypot(b.xQ - c2.xQ, b.yQ - c2.yQ));
      const count = Math.max(1, Math.ceil(bound / 256)); const points: Probe[] = []; let clear = true;
      for (let j = 0; j <= count; j++) {
        const p = hermite(a, b, ta, tb, j / count);
        if (++probes > CURVED_RIDGE_LIMITS.curveProbePoints) throw new Error('曲线山脊沿线核验超出有界预算。');
        if (p.xQ < 0 || p.yQ < 0 || p.xQ > WORLD_Q || p.yQ > WORLD_Q || !isLand(p.xQ, p.yQ)) { clear = false; break; }
        points.push({ ...p, arc: 0 });
        if (++work % batch === 0) await checkpoint('probe-continuous-land-ridges', probes, CURVED_RIDGE_LIMITS.curveProbePoints);
      }
      if (!clear) { rejectedSpans++; run = undefined; continue; }
      if (!run) { run = { group: chain.group, leeQ: chain.leeQ, profileSeed: chain.profileSeed, fitArcWidth: chain.fitArcWidth, points: [], anchors: [{ ...a, arc: 0 }], length: 0 }; runs.push(run); }
      const arcAQ = run.length;
      for (const p of points) {
        const previous = run.points.at(-1);
        if (previous && previous.xQ === p.xQ && previous.yQ === p.yQ) continue;
        if (previous) run.length += length(previous, p);
        p.arc = run.length; run.points.push(p);
      }
      run.anchors.push({ ...b, arc: run.length });
      spans.push({ a: { xQ: a.xQ, yQ: a.yQ }, b: { xQ: b.xQ, yQ: b.yQ }, group: chain.group, leeQ: chain.leeQ,
        widthQ: Math.max(a.widthQ, b.widthQ), peakQ: Math.max(a.peakQ, b.peakQ), widthAQ: a.widthQ, widthBQ: b.widthQ, peakAQ: a.peakQ, peakBQ: b.peakQ,
        run: runs.length - 1, arcAQ, arcBQ: run.length });
    }
  }
  const nodes: Support[] = [], ends: Ends[] = [];
  for (const [runId, run] of runs.entries()) {
    if (!run.length || run.points.length < 2) continue;
    if (run.fitArcWidth) for (let i = 0; i < run.anchors.length; i++) {
      const a = run.anchors[i], spacing = Math.min(i ? a.arc - run.anchors[i - 1].arc : Infinity, i + 1 < run.anchors.length ? run.anchors[i + 1].arc - a.arc : Infinity);
      a.widthQ = Math.max(4 * 256, Math.min(a.widthQ, spacing * .42));
    }
    const narrowest = Math.min(...run.anchors.map(p => p.widthQ)), nominalAlong = .35 * narrowest;
    const count = Math.max(1, Math.ceil(run.length / Math.max(256, nominalAlong / 4))), ds = run.length / count;
    if (nodes.length + count > CURVED_RIDGE_LIMITS.nodes) throw new Error('曲线山脊高度节点超出有界预算。');
    const endFade = Math.min(run.length / 3, Math.max(narrowest, run.length * .12));
    ends[runId] = { first: run.points[0], last: run.points.at(-1)!, fadeQ: endFade / 2 };
    for (const span of spans.filter(s => s.run === runId)) {
      const a = run.anchors.find(p => p.arc === span.arcAQ)!, b = run.anchors.find(p => p.arc === span.arcBQ)!;
      span.widthAQ = a.widthQ; span.widthBQ = b.widthQ; span.widthQ = Math.max(a.widthQ, b.widthQ);
      span.peakAQ = peakOnArc(run, a.arc, a.peakQ) * smooth(Math.min(a.arc, run.length - a.arc) / endFade);
      span.peakBQ = peakOnArc(run, b.arc, b.peakQ) * smooth(Math.min(b.arc, run.length - b.arc) / endFade);
      // Preserve the existing nonzero-ridge diagnostic even if both endpoints
      // are foothills and the peak lies inside the actual continuous span.
      span.peakQ = Math.max(span.peakAQ, span.peakBQ, peakOnArc(run, (a.arc + b.arc) / 2, (a.peakQ + b.peakQ) / 2));
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
      const widthQ = interpolated(a.widthQ, b.widthQ, u), alongQ = .35 * widthQ;
      const peakQ = peakOnArc(run, arc, interpolated(a.peakQ, b.peakQ, u)) * smooth(Math.min(arc, run.length - arc) / endFade);
      nodes.push({ xQ: pa.xQ + (pb.xQ - pa.xQ) * t, yQ: pa.yQ + (pb.yQ - pa.yQ) * t, tx, ty, widthQ, alongQ, peakQ, leeQ: run.leeQ, run: runId, weight: 35 * ds / (32 * alongQ) });
      if (++work % batch === 0) await checkpoint('sample-shared-ridge-arcs', nodes.length, CURVED_RIDGE_LIMITS.nodes);
    }
  }
  const buckets: number[][] = Array.from({ length: BUCKETS ** 2 }, () => []); let references = 0, maximumBucketCandidates = 0;
  for (let index = 0; index < nodes.length; index++) {
    const n = nodes[index], width = n.widthQ * 1.15;
    const rx = Math.abs(n.tx) * n.alongQ + Math.abs(n.ty) * width, ry = Math.abs(n.ty) * n.alongQ + Math.abs(n.tx) * width;
    const left = Math.max(0, Math.floor((n.xQ - rx) / BUCKET_Q)), right = Math.min(BUCKETS - 1, Math.floor((n.xQ + rx) / BUCKET_Q));
    const top = Math.max(0, Math.floor((n.yQ - ry) / BUCKET_Q)), bottom = Math.min(BUCKETS - 1, Math.floor((n.yQ + ry) / BUCKET_Q));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const bucket = buckets[y * BUCKETS + x]; bucket.push(index); maximumBucketCandidates = Math.max(maximumBucketCandidates, bucket.length);
      if (++references > CURVED_RIDGE_LIMITS.indexReferences || bucket.length > CURVED_RIDGE_LIMITS.bucketCandidates) throw new Error('曲线山脊局部密度超出查询预算，请换种子或更大范围。');
    }
    if (++work % batch === 0) await checkpoint('index-continuous-ridges', index + 1, nodes.length);
  }
  const index = buckets.map(bucket => Uint16Array.from(bucket));
  const gateValues = new Float64Array(runs.length), gateStamp = new Uint32Array(runs.length); let queryStamp = 0;
  const sample = (xQ: number, yQ: number) => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || yQ < 0 || xQ > WORLD_Q || yQ > WORLD_Q) throw new Error('曲线山脊查询坐标无效。');
    const bucket = index[Math.min(BUCKETS - 1, Math.floor(yQ / BUCKET_Q)) * BUCKETS + Math.min(BUCKETS - 1, Math.floor(xQ / BUCKET_Q))];
    let massQ = 0;
    // At most 24 accepted curve runs and at most 192 support candidates.
    // Reuse private scratch instead of allocating a Map at every fine node.
    queryStamp = (queryStamp + 1) >>> 0; if (!queryStamp) { gateStamp.fill(0); queryStamp = 1; }
    for (const id of bucket) {
      const node = nodes[id];
      if (gateStamp[node.run] !== queryStamp) { gateValues[node.run] = endpointWeight(ends[node.run], xQ, yQ); gateStamp[node.run] = queryStamp; }
      massQ += contribution(node, xQ, yQ) * gateValues[node.run];
    }
    return { massQ, kernelTests: bucket.length };
  };
  await checkpoint('index-continuous-ridges', nodes.length, nodes.length);
  const stats: CurvedRidgeStats = { curveRuns: runs.length, supportNodes: nodes.length, indexReferences: references, maximumBucketCandidates, landProbes: probes, rejectedSpans, acceptedSpans: spans.length };
  return { sample, stats, spans: spans.map(p => ({ ...p, a: { ...p.a }, b: { ...p.b } })),
    // Diagnostic copies for source-data plots and independent exhaustive-index
    // oracles. They cannot mutate the closure and are not persistence authority.
    supports: nodes.map(n => ({ ...n })),
    curves: runs.map(run => ({ group: run.group, points: run.points.map(p => ({ ...p })) })),
    ends: ends.map(end => ({ first: { ...end.first }, last: { ...end.last }, fadeQ: end.fadeQ })) };
}

/** C1 cap: equal to the original input through 3/4 of full relief, then
 * approaches its bound continuously. No hard max between ridges or flat cap. */
export function boundCurvedRelief(valueQ: number): number {
  if (valueQ <= FIELD_Q * .75) return Math.max(0, valueQ);
  return FIELD_Q - (FIELD_Q * .25) ** 2 / (valueQ - FIELD_Q * .5);
}

/** Shared arc interpolation uses this fixed-point helper only where persisted
 * integer diagnostics are required; continuous sampling stays unrounded. */
export const curveProfileQ = (a: number, b: number, fractionQ: number) => a + (b - a) * smoothQ(fractionQ) / FIELD_Q;
