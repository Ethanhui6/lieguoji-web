import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';

export type NaturalPointQ = { xQ: number; yQ: number };
export interface NaturalEdge { a: NaturalPointQ; b: NaturalPointQ; length: number; arc: number }
interface Node { minX: number; minY: number; maxX: number; maxY: number; ids?: number[]; left?: Node; right?: Node }
const Q20 = 1048576, MAX_POINTS = 16384, MAX_VALIDATION_WORK = 8000000;
const cross = (a: NaturalPointQ, b: NaturalPointQ, c: NaturalPointQ) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const on = (a: NaturalPointQ, b: NaturalPointQ, p: NaturalPointQ) => p.xQ >= Math.min(a.xQ, b.xQ) && p.xQ <= Math.max(a.xQ, b.xQ) && p.yQ >= Math.min(a.yQ, b.yQ) && p.yQ <= Math.max(a.yQ, b.yQ);
function intersects(a: NaturalPointQ, b: NaturalPointQ, c: NaturalPointQ, d: NaturalPointQ) {
  const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), s = cross(c, d, b);
  return p === 0 && on(a, b, c) || q === 0 && on(a, b, d) || r === 0 && on(c, d, a) || s === 0 && on(c, d, b)
    || (p < 0 && q > 0 || p > 0 && q < 0) && (r < 0 && s > 0 || r > 0 && s < 0);
}
function distance(edge: NaturalEdge, x: number, y: number) {
  const dx = edge.b.xQ - edge.a.xQ, dy = edge.b.yQ - edge.a.yQ, dot = (x - edge.a.xQ) * dx + (y - edge.a.yQ) * dy, length2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(Q20, Math.floor(dot / length2 * Q20 + .5)));
  if (dot >= 0 && dot <= length2 && dx * (y - edge.a.yQ) - dy * (x - edge.a.xQ) === 0) return { distance: 0, t };
  const px = edge.a.xQ + roundRatio(dx * t, Q20), py = edge.a.yQ + roundRatio(dy * t, Q20);
  return { distance: integerSqrt((x - px) ** 2 + (y - py) ** 2), t };
}
function boxDistance(node: Node, x: number, y: number) { return Math.max(node.minX - x, 0, x - node.maxX) ** 2 + Math.max(node.minY - y, 0, y - node.maxY) ** 2; }
async function checkpoint(control: DetailShapeControl | undefined, phase: string, done: number, total: number) {
  control?.signal?.throwIfAborted(); control?.onProgress?.(phase, done, total); control?.signal?.throwIfAborted();
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  control?.signal?.throwIfAborted();
}

/** Remove only sub-Q8 sampling jitter on an otherwise straight run. The
 * maximum removed deviation is two Q8 units (1/128 world), not a smoothing
 * tolerance measured in world cells. Real corners, necks and bay ends remain.
 * Zero-variation callers keep their literal source rather than using this. */
export async function simplifyNaturalSampling(points: readonly NaturalPointQ[], batch: number, control?: DetailShapeControl) {
  const source = points.map(point => ({ ...point })), retained = source.map((_, index) => index); let work = 0, changed = true;
  while (changed && retained.length > 3) {
    changed = false;
    for (let i = retained.length - 1; i >= 0 && retained.length > 3; i--) {
      const before = retained[(i + retained.length - 1) % retained.length], after = retained[(i + 1) % retained.length], a = source[before], b = source[after];
      const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length2 = dx * dx + dy * dy, tolerance = 2 * integerSqrt(length2); let safe = length2 > 0;
      // Check every original point in the merged run. Repeated removal must
      // not accumulate two-Q tolerances and erase a shallow real feature.
      for (let k = (before + 1) % source.length; safe && k !== after; k = (k + 1) % source.length) {
        const p = source[k], dot = (p.xQ - a.xQ) * dx + (p.yQ - a.yQ) * dy;
        safe = dot > 0 && dot < length2 && Math.abs(cross(a, b, p)) <= tolerance;
        if (++work > MAX_VALIDATION_WORK) throw new Error('自然轮廓采样整理工作超出上限，原图未改变。');
        if (work % batch === 0) await checkpoint(control, 'simplify-natural-sampling', work, MAX_VALIDATION_WORK);
      }
      if (safe) { retained.splice(i, 1); changed = true; }
    }
  }
  await checkpoint(control, 'simplify-natural-sampling', work, work);
  return retained.map(index => source[index]);
}

/** True facing features, rather than all nearby fragments of the same shore.
 * A connector must face both segments: a local vertex normal cone or within
 * asin(1/3) of its normal (also protecting gently tapering channels). Parallel overlap
 * is included explicitly: endpoint-only tests miss a 12-world U-shaped bay.
 * Returned separation still receives the conservative quarter-distance cap. */
export function naturalFacingSeparation(points: readonly NaturalPointQ[], i: number, j: number): number | null {
  const count = points.length, a = points[i], b = points[(i + 1) % count], c = points[j], d = points[(j + 1) % count];
  const normalAt = (edge: number, t: number, vx: number, vy: number) => {
    const first = points[edge], last = points[(edge + 1) % count];
    if (t > 0 && t < Q20) {
      const dx = last.xQ - first.xQ, dy = last.yQ - first.yQ;
      return Math.abs(vx * dx + vy * dy) <= (2 + integerSqrt(vx * vx + vy * vy) / 3) * integerSqrt(dx * dx + dy * dy);
    }
    const id = t === 0 ? edge : (edge + 1) % count, p = points[id];
    const inCone = [points[(id + count - 1) % count], points[(id + 1) % count]].every(q => {
      const dx = q.xQ - p.xQ, dy = q.yQ - p.yQ;
      return vx * dx + vy * dy <= 2 * integerSqrt(dx * dx + dy * dy);
    });
    const dx = last.xQ - first.xQ, dy = last.yQ - first.yQ;
    return inCone || Math.abs(vx * dx + vy * dy) <= (2 + integerSqrt(vx * vx + vy * vy) / 3) * integerSqrt(dx * dx + dy * dy);
  };
  let best = Infinity;
  const candidate = (edge: number, other: number, t: number) => {
    const p = points[edge], q = points[(edge + 1) % count], u = points[other], v = points[(other + 1) % count];
    const x = p.xQ + roundRatio((q.xQ - p.xQ) * t, Q20), y = p.yQ + roundRatio((q.yQ - p.yQ) * t, Q20);
    const projection = distance({ a: u, b: v, length: 0, arc: 0 }, x, y);
    const ex = u.xQ + roundRatio((v.xQ - u.xQ) * projection.t, Q20) - x, ey = u.yQ + roundRatio((v.yQ - u.yQ) * projection.t, Q20) - y;
    if (normalAt(edge, t, ex, ey) && normalAt(other, projection.t, -ex, -ey)) best = Math.min(best, projection.distance);
  };
  candidate(i, j, 0); candidate(i, j, Q20); candidate(j, i, 0); candidate(j, i, Q20);
  candidate(i, j, Q20 / 2); candidate(j, i, Q20 / 2);
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length2 = dx * dx + dy * dy;
  if (dx * (d.yQ - c.yQ) - dy * (d.xQ - c.xQ) === 0) {
    const t1 = ((c.xQ - a.xQ) * dx + (c.yQ - a.yQ) * dy) / length2, t2 = ((d.xQ - a.xQ) * dx + (d.yQ - a.yQ) * dy) / length2;
    const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(1, Math.max(t1, t2));
    if (lo < hi) candidate(i, j, Math.round((lo + hi) / 2 * Q20));
  }
  return Number.isFinite(best) ? best : null;
}

/** Consumes the kernel's privately owned, already validated source contour and
 * its non-adjacent-feature caps. Local quadratic corners stay inside the source
 * cap; the remaining cap is reserved for actual structural bay/cape movement.
 * No input references survive this call. Derived intersections are rechecked. */
export async function roundAndIndexNaturalOutline(input: { points: readonly NaturalPointQ[]; caps: readonly number[]; structureWorld: number; roughnessWorld: number; area2: number },
  batch: number, control: DetailShapeControl | undefined, counters: { outlineEdgeTests: number }) {
  const source = input.points.map(p => ({ ...p })), sourceCaps = [...input.caps], points: NaturalPointQ[] = [], caps: number[] = [];
  if (source.length < 3 || source.length > 2048 || sourceCaps.length !== source.length || !Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('自然轮廓内部输入规格无效。');
  let roundedCorners = 0;
  const append = (p: NaturalPointQ, cap: number) => {
    const previous = points.at(-1); if (previous?.xQ === p.xQ && previous.yQ === p.yQ) { caps[caps.length - 1] = Math.min(caps.at(-1)!, cap); return; }
    if (points.length >= MAX_POINTS) throw new Error('自然轮廓超过16384个几何节点；请简化输入，原图未改变。');
    points.push(p); caps.push(cap);
  };
  const lerp = (a: NaturalPointQ, b: NaturalPointQ, t: number) => ({ xQ: a.xQ + roundRatio((b.xQ - a.xQ) * t, Q20), yQ: a.yQ + roundRatio((b.yQ - a.yQ) * t, Q20) });
  for (let i = 0; i < source.length; i++) {
    const previous = source[(i + source.length - 1) % source.length], vertex = source[i], next = source[(i + 1) % source.length];
    const before = integerSqrt((vertex.xQ - previous.xQ) ** 2 + (vertex.yQ - previous.yQ) ** 2), after = integerSqrt((next.xQ - vertex.xQ) ** 2 + (next.yQ - vertex.yQ) ** 2);
    const cut = Math.floor(Math.min(48 * 256, input.structureWorld * 128, sourceCaps[i] / 2, before / 4, after / 4));
    if (cut < 256 || cross(previous, vertex, next) === 0) append({ ...vertex }, sourceCaps[i]);
    else {
      const a = lerp(vertex, previous, roundRatio(cut * Q20, before)), b = lerp(vertex, next, roundRatio(cut * Q20, after)), steps = Math.max(2, Math.ceil(cut / (4 * 256)));
      const incoming = { a: previous, b: vertex, length: before, arc: 0 }, outgoing = { a: vertex, b: next, length: after, arc: 0 };
      for (let j = 0; j <= steps; j++) {
        const t = roundRatio(j * Q20, steps), point = lerp(lerp(a, vertex, t), lerp(vertex, b, t), t);
        // Reserve the measured round-off displacement, not an entire corner
        // cut from every following long edge. Endpoints remain on source edges.
        const used = Math.min(distance(incoming, point.xQ, point.yQ).distance, distance(outgoing, point.xQ, point.yQ).distance) + 2;
        append(point, Math.max(0, sourceCaps[i] - used));
      }
      roundedCorners++;
    }
    if ((i + 1) % batch === 0) await checkpoint(control, 'round-natural-corners', i + 1, source.length);
  }
  if (points[0].xQ === points.at(-1)!.xQ && points[0].yQ === points.at(-1)!.yQ) { points.pop(); caps.pop(); }
  const edges: NaturalEdge[] = []; let perimeter = 0, area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], length = integerSqrt((b.xQ - a.xQ) ** 2 + (b.yQ - a.yQ) ** 2);
    if (!length) throw new Error('自然轮廓量化后退化。');
    edges.push({ a, b, length, arc: perimeter }); perimeter += length; area2 += a.xQ * b.yQ - b.xQ * a.yQ;
    if ((i + 1) % batch === 0) await checkpoint(control, 'write-natural-edges', i + 1, points.length);
  }
  if (!Number.isSafeInteger(area2) || area2 * Math.sign(input.area2) <= 0) throw new Error('自然轮廓改变了原始方向或退化。');
  const sortIds = async (ids: number[], axis: 'xQ' | 'yQ') => {
    const compare = (a: number, b: number) => edges[a].a[axis] + edges[a].b[axis] - edges[b].a[axis] - edges[b].b[axis] || a - b;
    if (ids.length <= 32) return ids.sort(compare);
    let from = ids, to = new Array<number>(ids.length), work = 0;
    const total = ids.length * Math.ceil(Math.log2(ids.length));
    for (let width = 1; width < ids.length; width *= 2) {
      for (let start = 0; start < ids.length; start += width * 2) {
        const middle = Math.min(start + width, ids.length), end = Math.min(start + width * 2, ids.length); let a = start, b = middle;
        for (let out = start; out < end; out++) {
          to[out] = b >= end || a < middle && compare(from[a], from[b]) <= 0 ? from[a++] : from[b++];
          if (++work % batch === 0) await checkpoint(control, 'sort-natural-outline', work, total);
        }
      }
      [from, to] = [to, from];
    }
    return from;
  };
  const root: Node = { minX: 0, minY: 0, maxX: 0, maxY: 0 }, pending = [{ node: root, ids: edges.map((_, i) => i) }]; let built = 0;
  while (pending.length) {
    const { node, ids } = pending.pop()!;
    node.minX = Math.min(...ids.map(id => Math.min(edges[id].a.xQ, edges[id].b.xQ))); node.maxX = Math.max(...ids.map(id => Math.max(edges[id].a.xQ, edges[id].b.xQ)));
    node.minY = Math.min(...ids.map(id => Math.min(edges[id].a.yQ, edges[id].b.yQ))); node.maxY = Math.max(...ids.map(id => Math.max(edges[id].a.yQ, edges[id].b.yQ)));
    if (ids.length <= 8) node.ids = ids;
    else {
      const axis = node.maxX - node.minX >= node.maxY - node.minY ? 'xQ' : 'yQ', sorted = await sortIds(ids, axis);
      const middle = Math.floor(sorted.length / 2); node.left = { minX: 0, minY: 0, maxX: 0, maxY: 0 }; node.right = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      pending.push({ node: node.right, ids: sorted.slice(middle) }, { node: node.left, ids: sorted.slice(0, middle) });
    }
    if (++built % 16 === 0) await checkpoint(control, 'index-natural-outline', built, Math.ceil(points.length / 4));
  }
  let validationWork = 0;
  for (let id = 0; id < edges.length; id++) {
    const a = edges[id], minX = Math.min(a.a.xQ, a.b.xQ), maxX = Math.max(a.a.xQ, a.b.xQ), minY = Math.min(a.a.yQ, a.b.yQ), maxY = Math.max(a.a.yQ, a.b.yQ), stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (++validationWork > MAX_VALIDATION_WORK) throw new Error('自然轮廓局部边过于密集，候选已拒绝，未降精度。');
      if (validationWork % batch === 0) await checkpoint(control, 'validate-natural-outline', validationWork, MAX_VALIDATION_WORK);
      if (node.maxX < minX || node.minX > maxX || node.maxY < minY || node.minY > maxY) continue;
      if (node.ids) for (const other of node.ids) {
        if (other <= id + 1 || id === 0 && other === edges.length - 1) continue;
        if (++validationWork > MAX_VALIDATION_WORK) throw new Error('自然轮廓局部边过于密集，候选已拒绝，未降精度。');
        if (validationWork % batch === 0) await checkpoint(control, 'validate-natural-outline', validationWork, MAX_VALIDATION_WORK);
        if (intersects(a.a, a.b, edges[other].a, edges[other].b)) throw new Error('自然圆顺会触碰另一段轮廓；请增大局部间隔，原图未改变。');
      } else stack.push(node.left!, node.right!);
    }
  }
  await checkpoint(control, 'validate-natural-outline', validationWork, validationWork);
  const limit = Math.max(32767, (input.structureWorld + input.roughnessWorld + 52) * 256);
  const nearest = (x: number, y: number) => {
    let best = limit, edge = -1, t = 0; const stack = [root];
    while (stack.length) {
      const node = stack.pop()!; if (boxDistance(node, x, y) > (best + 2) ** 2) continue;
      if (node.ids) for (const id of node.ids) { counters.outlineEdgeTests++; const value = distance(edges[id], x, y); if (value.distance < best || value.distance === best && (edge < 0 || id < edge)) { best = value.distance; edge = id; t = value.t; } }
      else { const a = node.left!, b = node.right!; if (boxDistance(a, x, y) <= boxDistance(b, x, y)) stack.push(b, a); else stack.push(a, b); }
    }
    return { distance: best, edge, t };
  };
  const bins: number[][] = Array.from({ length: 64 }, () => []), cachedRows = new Map<number, number[]>(); let registered = 0;
  for (let id = 0; id < edges.length; id++) {
    const edge = edges[id];
    for (let row = Math.floor(Math.min(edge.a.yQ, edge.b.yQ) / 16384); row <= Math.min(63, Math.floor(Math.max(edge.a.yQ, edge.b.yQ) / 16384)); row++) {
      bins[row].push(id); if (++registered % batch === 0) await checkpoint(control, 'bin-natural-outline', id + 1, edges.length);
    }
  }
  const inside = (x: number, y: number) => {
    let crossings = y % 512 === 0 ? cachedRows.get(y) : undefined;
    if (!crossings) { crossings = []; for (const id of bins[Math.max(0, Math.min(63, Math.floor(y / 16384)))]) { const { a, b } = edges[id]; if ((a.yQ > y) !== (b.yQ > y)) crossings.push(a.xQ + (y - a.yQ) * (b.xQ - a.xQ) / (b.yQ - a.yQ)); } crossings.sort((a, b) => a - b); if (y % 512 === 0) cachedRows.set(y, crossings); }
    let low = 0, high = crossings.length; while (low < high) { const middle = (low + high) >>> 1; if (crossings[middle] <= x) low = middle + 1; else high = middle; } return (low & 1) === 1;
  };
  return { edges, caps, area2, perimeter, roundedCorners, nearest, inside };
}

export interface NaturalCoastFeature {
  layer: 'regional' | 'local'; startQ: number; lengthQ: number; peakQ: number; amplitudeQ: number; leftShapeQ: number; rightShapeQ: number;
}
export interface NaturalCoastRegion {
  kind: 'bay' | 'cape' | 'fractured' | 'quiet'; startQ: number; lengthQ: number; transitionQ: number;
}
export const NATURAL_COAST_PLAN_LIMITS = { features: 48, bins: 128, references: 1024, candidates: 8 } as const;

/** Private continent-scale allocation. Regions have unequal lengths; local
 * events belong to a region, never to each source gesture edge. Tiny contours
 * retain the prior plan. This does not claim erosion or add ocean holes. */
async function regionalCoastFeatures(seed: number, perimeterQ: number, control?: DetailShapeControl) {
  const count = Math.max(6, Math.min(10, Math.round(perimeterQ / (360 * 256))));
  const kinds: NaturalCoastRegion['kind'][] = ['bay', 'bay', 'cape', 'cape', 'fractured', 'quiet'];
  const other: NaturalCoastRegion['kind'][] = ['bay', 'cape', 'fractured', 'quiet'];
  while (kinds.length < count) kinds.push(other[hashAt(seed, 7310, kinds.length, 0) % other.length]);
  const slots = kinds.map((kind, id) => ({ kind, id, weight: kind === 'bay' ? 1850 + hashAt(seed, 7311, id, 0) % 701
    : kind === 'cape' ? 950 + hashAt(seed, 7311, id, 0) % 201
      : kind === 'fractured' ? 1200 + hashAt(seed, 7311, id, 0) % 601 : 1300 + hashAt(seed, 7311, id, 0) % 701 }));
  for (let i = slots.length - 1; i > 0; i--) { const j = hashAt(seed, 7312, i, 0) % (i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const phase = hashAt(seed, 7313, 0, 0) % perimeterQ, total = slots.reduce((sum, slot) => sum + slot.weight, 0);
  const features: NaturalCoastFeature[] = [], regions: NaturalCoastRegion[] = []; let consumed = 0, localCount = 0;
  const append = (layer: NaturalCoastFeature['layer'], from: number, width: number, peakFraction: number, strength: number, id: number, tag: number) => {
    const lengthQ = Math.floor(width), peakQ = Math.floor(lengthQ * peakFraction);
    if (lengthQ < (layer === 'regional' ? 48 : 16) * 256 || peakQ <= 0 || peakQ >= lengthQ) return;
    // A short feature cannot have a very deep needle-shaped tip. This also
    // retains the existing finite-slope continuity contract at one Q8 step.
    const rampWorld = Math.min(peakQ, lengthQ - peakQ) / 256;
    const amplitudeQ = Math.sign(strength) * Math.min(Math.abs(strength) * FIELD_Q, rampWorld * rampWorld);
    features.push({ layer, startQ: ((Math.floor(from) % perimeterQ) + perimeterQ) % perimeterQ, lengthQ, peakQ, amplitudeQ,
      leftShapeQ: hashAt(seed, 7318 + tag, id, 0) % 2457 - 1228, rightShapeQ: hashAt(seed, 7319 + tag, id, 0) % 2457 - 1228 });
    if (features.length > NATURAL_COAST_PLAN_LIMITS.features) throw new Error('自然湾岬特征超过规划上限。');
  };
  for (const slot of slots) {
    const from = Math.round(perimeterQ * consumed / total); consumed += slot.weight;
    const end = Math.round(perimeterQ * consumed / total), length = end - from, start = phase + from;
    regions.push({ kind: slot.kind, startQ: start % perimeterQ, lengthQ: length, transitionQ: Math.min(48 * 256, Math.floor(length * .15)) });
    const strength = slot.kind === 'bay' ? -(.78 + (hashAt(seed, 7314, slot.id, 0) % 171) / 1000)
      : slot.kind === 'cape' ? .78 + (hashAt(seed, 7314, slot.id, 0) % 171) / 1000
        : (hashAt(seed, 7314, slot.id, 1) % 2 ? 1 : -1) * (slot.kind === 'fractured' ? .18 + (hashAt(seed, 7314, slot.id, 0) % 121) / 1000 : .04 + (hashAt(seed, 7314, slot.id, 0) % 81) / 1000);
    // Capes have narrow, resolved tips; bays occupy most of their wider slots.
    const fill = slot.kind === 'cape' ? .84 + (hashAt(seed, 7315, slot.id, 0) % 61) / 1000 : .77 + (hashAt(seed, 7315, slot.id, 0) % 81) / 1000;
    // A long continent's slot must not enlarge every cape with the perimeter:
    // its narrow physical core stays resolved while the unused slot is shore.
    const width = slot.kind === 'cape' ? Math.min(length * fill, (160 + hashAt(seed, 7339, slot.id, 0) % 25) * 256) : length * fill;
    const margin = length - width;
    const peak = slot.kind === 'cape' ? .46 + (hashAt(seed, 7316, slot.id, 0) % 81) / 1000 : .28 + (hashAt(seed, 7316, slot.id, 0) % 441) / 1000;
    append('regional', start + margin * (.25 + (hashAt(seed, 7317, slot.id, 0) % 501) / 1000), width, peak, strength, slot.id, 0);
    const wanted = slot.kind === 'fractured' ? 3 + hashAt(seed, 7330, slot.id, 0) % 3 : slot.kind === 'bay' ? 1 + hashAt(seed, 7330, slot.id, 0) % 2 : slot.kind === 'cape' ? 1 : 0;
    const weights = Array.from({ length: wanted }, (_, i) => 500 + hashAt(seed, 7331, slot.id, i) % 1001), sum = weights.reduce((a, b) => a + b, 0);
    const clusterLength = length * (slot.kind === 'fractured' ? .70 : .78), clusterStart = start + (length - clusterLength) * (.2 + (hashAt(seed, 7332, slot.id, 0) % 601) / 1000);
    let used = 0;
    for (let i = 0; i < wanted && localCount < 36; i++) {
      const low = clusterLength * used / sum; used += weights[i]; const high = clusterLength * used / sum, span = high - low;
      const width = slot.kind === 'fractured' ? Math.min(64 * 256, span * .76) : span * .66;
      const positive = hashAt(seed, 7333, slot.id, i) % 2 ? 1 : -1, magnitude = slot.kind === 'fractured' ? .23 + hashAt(seed, 7334, slot.id, i) % 91 / 1000 : .10 + hashAt(seed, 7334, slot.id, i) % 121 / 1000;
      const before = features.length;
      append('local', clusterStart + low + (span - width) * (.2 + (hashAt(seed, 7335, slot.id, i) % 601) / 1000), width,
        .34 + hashAt(seed, 7336, slot.id, i) % 321 / 1000, positive * magnitude, slot.id * 8 + i, 30);
      if (features.length !== before) localCount++;
    }
    await checkpoint(control, 'plan-natural-coast-features', features.length, NATURAL_COAST_PLAN_LIMITS.features);
  }
  // Ascending starts permit a bounded lookup without allocating per-node data.
  regions.sort((a, b) => a.startQ - b.startQ);
  return { features, regions };
}

/** Plan broad bays/capes and smaller shoulder features once per private
 * generation. Unequal physical intervals, off-center peaks and shuffled
 * signs avoid harmonic scallops; the output is a real SDF displacement field,
 * not an offset display polygon. Existing facing-shore caps still apply at
 * the caller. All event endpoints and peak joins have zero first derivative. */
export async function createNaturalCoastArcPlan(input: { seed: number; perimeterQ: number; structureWorld: number }, batch: number, control?: DetailShapeControl) {
  const { seed, perimeterQ, structureWorld } = input;
  if (!Number.isInteger(seed) || !Number.isSafeInteger(perimeterQ) || perimeterQ <= 0 || !Number.isInteger(structureWorld) || structureWorld < 0 || structureWorld > 160
    || !Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('自然湾岬规划参数无效。');
  const features: NaturalCoastFeature[] = [], regions: NaturalCoastRegion[] = [], binCount = NATURAL_COAST_PLAN_LIMITS.bins;
  await checkpoint(control, 'plan-natural-coast-features', 0, NATURAL_COAST_PLAN_LIMITS.features);
  // Do not force the minimum event count into a perimeter too small for the
  // 2-world real coast lattice. The existing literal/capped outline remains.
  if (structureWorld > 0 && perimeterQ >= 2048 * 256) {
    const planned = await regionalCoastFeatures(seed, perimeterQ, control);
    features.push(...planned.features); regions.push(...planned.regions);
  } else if (structureWorld > 0 && perimeterQ >= 96 * 256) {
    // A normal continent needs several primary bays and capes, including
    // narrow deep ones. Shrink reach with the whole usable shore on a tiny
    // island, not with every individual event's width on a large continent.
    const coastReach = Math.min(1, perimeterQ / (8 * structureWorld * 256));
    const counts = [Math.max(2, Math.min(10, Math.round(perimeterQ / (360 * 256)))), perimeterQ < 384 * 256 ? 0 : Math.min(36, Math.floor(perimeterQ / (230 * 256)))];
    for (let layer = 0; layer < 2; layer++) {
      const count = counts[layer], items: { width: number; sign: number; id: number }[] = [];
      for (let id = 0; id < count; id++) {
        // Distinct width bands supply different physical scales. The seeded
        // shuffle places a balanced quota of strong bays/capes on the shore;
        // id parity never becomes an alternating spatial waveform.
        const width = layer ? 450 + hashAt(seed, 7140, layer, id) % 1501
          : 600 + id * 240 + hashAt(seed, 7140, layer, id) % 81;
        const sign = layer ? id === 0 ? -1 : id === 1 || id === 2 ? 1 : hashAt(seed, 7141, layer, id) % 2 ? 1 : -1 : id % 2 ? 1 : -1;
        items.push({ width, sign, id });
      }
      for (let i = count - 1; i > 0; i--) { const j = hashAt(seed, 7142, layer, i) % (i + 1); [items[i], items[j]] = [items[j], items[i]]; }
      // A random shuffle can still accidentally recreate the old alternating
      // ring. Break only that case; keep seeded order and unequal slots.
      if (!layer && count >= 6 && items.every((item, i) => item.sign !== items[(i + 1) % count].sign)) [items[1], items[2]] = [items[2], items[1]];
      const total = items.reduce((sum, item) => sum + item.width, 0), phase = hashAt(seed, 7143, layer, 0) % perimeterQ; let consumed = 0;
      for (const item of items) {
        const from = Math.round(perimeterQ * consumed / total); consumed += item.width;
        const to = Math.round(perimeterQ * consumed / total), slot = to - from;
        const fill = (layer ? 540 : 760) + hashAt(seed, 7144, layer, item.id) % (layer ? 281 : 41);
        const lengthQ = Math.floor(slot * fill / 1000);
        // A full-size primary event spans at least 48 world of source arc
        // (24 fine-step lengths). Small-shore width and reach shrink together.
        const minimumWidthQ = (layer ? 16 : Math.max(16, 48 * coastReach)) * 256;
        if (lengthQ < minimumWidthQ) continue;
        const shoulder = 30 + hashAt(seed, 7145, layer, item.id) % 81;
        const startQ = (phase + from + Math.floor(slot * shoulder / 1000)) % perimeterQ;
        const peakQ = Math.floor(lengthQ * (280 + hashAt(seed, 7146, layer, item.id) % 441) / 1000);
        const reach = layer ? Math.min(1, lengthQ / Math.max(1, structureWorld * 2 * 256)) : coastReach;
        const amplitude = layer ? 533 + hashAt(seed, 7147, layer, item.id) % 779 : 3482 + hashAt(seed, 7147, layer, item.id) % 615;
        features.push({ layer: layer ? 'local' : 'regional', startQ, lengthQ, peakQ, amplitudeQ: item.sign * amplitude * reach,
          leftShapeQ: hashAt(seed, 7148, layer, item.id) % 2457 - 1228, rightShapeQ: hashAt(seed, 7149, layer, item.id) % 2457 - 1228 });
        if (features.length > NATURAL_COAST_PLAN_LIMITS.features) throw new Error('自然湾岬特征超过规划上限。');
      }
      await checkpoint(control, 'plan-natural-coast-features', features.length, NATURAL_COAST_PLAN_LIMITS.features);
    }
  }
  const bins: number[][] = Array.from({ length: binCount }, () => []); let references = 0, maximumCandidates = 0;
  for (let id = 0; id < features.length; id++) {
    const feature = features[id], first = Math.floor(feature.startQ / perimeterQ * binCount), last = Math.floor((feature.startQ + feature.lengthQ) / perimeterQ * binCount);
    for (let bin = first; bin <= last; bin++) {
      const bucket = bins[bin % binCount]; bucket.push(id); maximumCandidates = Math.max(maximumCandidates, bucket.length);
      if (++references > NATURAL_COAST_PLAN_LIMITS.references || bucket.length > NATURAL_COAST_PLAN_LIMITS.candidates) throw new Error('自然湾岬空间查询超过有界预算。');
      if (references % batch === 0) await checkpoint(control, 'index-natural-coast-features', references, NATURAL_COAST_PLAN_LIMITS.references);
    }
  }
  const index = bins.map(bin => Uint8Array.from(bin));
  const ease = (value: number, shapeQ: number) => { const s = value * value * (3 - 2 * value); return s + shapeQ / FIELD_Q * s * (1 - s); };
  const sample = (arcQ: number) => {
    if (!Number.isFinite(arcQ)) throw new Error('自然湾岬弧长查询无效。');
    const arc = (arcQ % perimeterQ + perimeterQ) % perimeterQ, ids = index[Math.min(binCount - 1, Math.floor(arc / perimeterQ * binCount))];
    let regional = 0, local = 0;
    for (const id of ids) {
      const feature = features[id], distance = (arc - feature.startQ + perimeterQ) % perimeterQ;
      if (distance > feature.lengthQ) continue;
      const weight = distance <= feature.peakQ ? ease(distance / feature.peakQ, feature.leftShapeQ) : ease((feature.lengthQ - distance) / (feature.lengthQ - feature.peakQ), feature.rightShapeQ);
      if (feature.layer === 'regional') regional += feature.amplitudeQ * weight; else local += feature.amplitudeQ * weight;
    }
    // Regional and local events each occupy non-overlapping physical slots.
    // With |local|<=.321Q, r+l*(1-r²) is bounded by [-Q,Q] for |r|<=Q.
    // Broad feature crests keep their strength; smaller shoulders cannot
    // cancel the important bay/cape as the previous 2:3 harmonics could.
    return regional + local * (1 - (regional / FIELD_Q) ** 2);
  };
  const sampleDetail = (arcQ: number, uQ: number, vQ: number, maximumDisplacementWorld: number) => {
    if (!Number.isFinite(arcQ) || !Number.isFinite(uQ) || !Number.isFinite(vQ) || !Number.isFinite(maximumDisplacementWorld) || maximumDisplacementWorld < 0 || maximumDisplacementWorld > 64) throw new Error('自然沿岸细节查询无效。');
    if (!regions.length) return roundRatio(3 * noiseQ12(seed, 7113, uQ, vQ, 48 * 256) + noiseQ12(seed, 7114, uQ, vQ, 12 * 256), 4);
    const arc = (arcQ % perimeterQ + perimeterQ) % perimeterQ;
    let lo = 0, hi = regions.length;
    while (lo < hi) { const middle = (lo + hi) >>> 1; if (regions[middle].startQ <= arc) lo = middle + 1; else hi = middle; }
    const region = regions[(lo + regions.length - 1) % regions.length], distance = (arc - region.startQ + perimeterQ) % perimeterQ;
    const phase = Math.min(1, distance / region.transitionQ, (region.lengthQ - distance) / region.transitionQ), blend = phase * phase * (3 - 2 * phase);
    const slow = noiseQ12(seed, 7340, uQ, vQ, 96 * 256), medium = noiseQ12(seed, 7341, uQ, vQ, 24 * 256);
    const common = .25 * (.8 * slow + .2 * medium);
    let detail: number;
    if (region.kind === 'bay') detail = .45 * (.8 * slow + .2 * medium);
    else if (region.kind === 'cape') {
      const mediumWeight = maximumDisplacementWorld > 0 ? Math.min(.55 * .65, 6 / maximumDisplacementWorld) : 0;
      const slowWeight = maximumDisplacementWorld > 0 ? Math.min(.55 - mediumWeight, 24 / maximumDisplacementWorld) : 0;
      detail = slowWeight * slow + mediumWeight * medium;
    }
    else if (region.kind === 'quiet') detail = .15 * (.9 * slow + .1 * medium);
    else {
      // Each detail band moves the final shoreline by at most wavelength/4:
      // 96 -> 24, 24 -> 6, 8 -> 2 world. Reassigned fine weight cannot turn the
      // medium band into another deep needle. Unused gain is allowed; caps
      // still separately protect narrow facing shores and the original pen.
      const fineWeight = maximumDisplacementWorld > 0 ? Math.min(.65, 2 / maximumDisplacementWorld) : 0;
      const mediumWeight = maximumDisplacementWorld > 0 ? Math.min(1 - fineWeight, 6 / maximumDisplacementWorld) : 0;
      const slowWeight = maximumDisplacementWorld > 0 ? Math.min(1 - fineWeight - mediumWeight, 24 / maximumDisplacementWorld) : 0;
      detail = slowWeight * slow + mediumWeight * medium + fineWeight * noiseQ12(seed, 7342, uQ, vQ, 8 * 256);
    }
    return Math.round(common + (detail - common) * blend);
  };
  await checkpoint(control, 'index-natural-coast-features', references, references);
  return { sample, sampleDetail, features: features.map(feature => ({ ...feature })), regions: regions.map(region => ({ ...region })), stats: { features: features.length, references, maximumCandidates, bins: binCount } };
}

/** Legacy numerical oracle, retained for historic periodic-seam checks.
 * The current natural generator uses its prebuilt feature plan instead. */
export function naturalArcField(seed: number, tag: number, arcQ: number, perimeterQ: number, wavelengthWorld: number) {
  const count = Math.max(4, Math.ceil(perimeterQ / (wavelengthWorld * 256) / 2) * 2);
  // Alternating unequal lobes guarantee both bays and capes rather than a
  // low-amplitude same-sign shrink of the original polygon. A seed-specific
  // phase and nonlinear within-period coordinate avoid alignment to its sides.
  const phase = hashAt(seed, tag + 90, 0, 0) % FIELD_Q;
  const wrapped = ((arcQ % perimeterQ + perimeterQ) % perimeterQ) / perimeterQ * count + phase / FIELD_Q;
  const scaled = wrapped % count;
  const knot = Math.floor(scaled), t = smoothQ(Math.floor((scaled - knot) * FIELD_Q));
  const value = (id: number) => (id % 2 ? -1 : 1) * (2253 + hashAt(seed, tag, id, 0) % 1844);
  const a = value(knot), b = value((knot + 1) % count);
  return a + roundRatio((b - a) * t, FIELD_Q);
}
