import { FIELD_Q, hashAt, integerSqrt, roundRatio, smoothQ } from './seed';
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

/** Periodic along the complete shoreline, independent of source point density.
 * Knot indices wrap at the same arc origin; the closure has no noise seam. */
export function naturalArcField(seed: number, tag: number, arcQ: number, perimeterQ: number, wavelengthWorld: number) {
  const count = Math.max(3, Math.ceil(perimeterQ / (wavelengthWorld * 256))), scaled = ((arcQ % perimeterQ + perimeterQ) % perimeterQ) / perimeterQ * count;
  const knot = Math.floor(scaled), t = smoothQ(Math.floor((scaled - knot) * FIELD_Q));
  const a = hashAt(seed, tag, knot, 0) % (2 * FIELD_Q + 1) - FIELD_Q, b = hashAt(seed, tag, (knot + 1) % count, 0) % (2 * FIELD_Q + 1) - FIELD_Q;
  return a + roundRatio((b - a) * t, FIELD_Q);
}
