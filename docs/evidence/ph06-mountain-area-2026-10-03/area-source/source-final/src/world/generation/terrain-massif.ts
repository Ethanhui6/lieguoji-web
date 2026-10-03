import { FIELD_Q, hashAt } from './seed';
import type { OrographyChain } from './detail-orography';
import type { DetailShapeControl } from './detail-shape';

const SIDE = 257, N = SIDE * SIDE, STEP = 16, Q = 256;
export const MASSIF_LIMITS = Object.freeze({ cells: N, ellipses: 15, regionStepWorld: STEP, maximumAlongWorld: 640,
  maximumAcrossWorld: 480, sourceTests: N * 15, routingEdges: N * 8, heapComparisons: N * 80,
  spreadingPasses: 3, spreadingTests: N * 9 * 3, typedWorkingBytes: N * 34, sampleTerms: 31,
  // sampleTerms counts bodies plus cut-grid taps, as before. The fixed noise
  // computation now explicitly records its own calls and corner kernels.
  noiseCallsPerSample: 5, noiseCornersPerSample: 15, maximumDomainOffsetWorld: 64 });
type Body = { x: number; y: number; tx: number; ty: number; along: number; across: number; amplitude: number };
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

/** Three-corner triangular gradient field. Each corner has compact C3 decay;
 * the bounded smooth remap avoids a hard clipping seam. This changes physical
 * relief only, never the source-body coordinates, land mask or material. */
export function mountainGradientNoise(seed: number, tag: number, x: number, y: number) {
  const skew = (Math.sqrt(3) - 1) / 2, unskew = (3 - Math.sqrt(3)) / 6;
  const offset = (x + y) * skew, i = Math.floor(x + offset), j = Math.floor(y + offset), back = (i + j) * unskew;
  const x0 = x - i + back, y0 = y - j + back, ix = x0 > y0 ? 1 : 0, iy = 1 - ix;
  const corner = (a: number, b: number, dx: number, dy: number) => {
    const radius = .5 - dx * dx - dy * dy; if (radius <= 0) return 0;
    const direction = hashAt(seed, tag, a, b) & 7;
    const dot = direction === 0 ? dx : direction === 1 ? -dx : direction === 2 ? dy : direction === 3 ? -dy
      : direction === 4 ? (dx + dy) * Math.SQRT1_2 : direction === 5 ? (dx - dy) * Math.SQRT1_2
      : direction === 6 ? (-dx + dy) * Math.SQRT1_2 : (-dx - dy) * Math.SQRT1_2;
    return radius ** 4 * dot;
  };
  const sum = 70 * (corner(i, j, x0, y0) + corner(i + ix, j + iy, x0 - ix + unskew, y0 - iy + unskew)
    + corner(i + 1, j + 1, x0 - 1 + 2 * unskew, y0 - 1 + 2 * unskew));
  return sum / Math.sqrt(1 + sum * sum);
}

/** Generation-only mountain-area field. This is not a river simulation, water
 * volume, lake solver or persisted drainage contract. The receiver forest is
 * discarded after it cuts the continuous physical elevation field. */
export async function createMassifField(chains: readonly OrographyChain[], isLand: (xQ: number, yQ: number) => boolean,
  priorLandProbes: number, landProbeLimit: number, batch: number, control?: DetailShapeControl) {
  control?.signal?.throwIfAborted();
  if (priorLandProbes + N > landProbeLimit) throw new Error('面状山地陆地探测将超出原山系总预算。');
  const seed = chains[0]?.seed ?? 0, byPoint = new Map<string, Body>();
  for (const chain of chains) for (let i = 0; i < chain.anchors.length; i++) {
    const anchor = chain.anchors[i], before = chain.anchors[Math.max(0, i - 1)], after = chain.anchors[Math.min(chain.anchors.length - 1, i + 1)];
    const dx = after.xQ - before.xQ, dy = after.yQ - before.yQ, length = Math.max(1, Math.hypot(dx, dy));
    const neighbour = Math.max(Math.hypot(anchor.xQ - before.xQ, anchor.yQ - before.yQ), Math.hypot(after.xQ - anchor.xQ, after.yQ - anchor.yQ)) / Q;
    const width = anchor.widthQ / Q, key = `${anchor.xQ}:${anchor.yQ}`;
    const body = { x: anchor.xQ / Q, y: anchor.yQ / Q, tx: dx / length, ty: dy / length,
      along: clamp(neighbour * .8 + width * 1.3, 240, MASSIF_LIMITS.maximumAlongWorld),
      across: clamp(width * 2.6, 120, MASSIF_LIMITS.maximumAcrossWorld), amplitude: .75 * anchor.peakQ / FIELD_Q };
    const old = byPoint.get(key); if (!old || body.across > old.across) byPoint.set(key, body);
  }
  const bodies = [...byPoint.values()];
  if (bodies.length > MASSIF_LIMITS.ellipses) throw new Error('面状山地源区超出15个独立顶点预算。');
  const raw = new Float32Array(N), filled = new Float32Array(N), cut = new Float32Array(N), scratch = new Float32Array(N);
  const land = new Uint8Array(N), seen = new Uint8Array(N), receiver = new Int32Array(N).fill(-1), accumulation = new Uint32Array(N);
  const order = new Uint32Array(N), heap = new Uint32Array(N);
  const stats = { bodies: bodies.length, landProbes: N, sourceTests: 0, routingEdges: 0, heapComparisons: 0, spreadingTests: 0,
    maximumHeap: 0, routedLandNodes: 0, junctionsChecked: 0, typedWorkingBytes: N * 34, sampleTerms: bodies.length + 16,
    noiseCallsPerSample: MASSIF_LIMITS.noiseCallsPerSample, noiseCornersPerSample: MASSIF_LIMITS.noiseCornersPerSample };
  const checkpoint = async (phase: string, done: number, total: number) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, done, total); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted();
  };
  // Two-dimensional uplift occupies blocks around multiple actual parent and
  // child vertices. Fourth-power union remains smooth, without normalizing
  // away overlapping massifs or extruding a constant ribbon cross section.
  const baseAt = (x: number, y: number) => {
    let power = 0;
    for (const body of bodies) {
      const dx = x - body.x, dy = y - body.y;
      const a = (dx * body.tx + dy * body.ty) / body.along, b = (-dx * body.ty + dy * body.tx) / body.across;
      const compact = Math.max(0, 1 - a * a - b * b), uplift = body.amplitude * compact * compact;
      power += uplift ** 4;
    }
    if (!power) return 0;
    // Actual relief, shared with the routing grid; these are not shader terms.
    const warpedX = x + MASSIF_LIMITS.maximumDomainOffsetWorld * mountainGradientNoise(seed, 7508, x / 512, y / 512);
    const warpedY = y + MASSIF_LIMITS.maximumDomainOffsetWorld * mountainGradientNoise(seed, 7509, x / 512, y / 512);
    const n = (tag: number, wavelength: number) => mountainGradientNoise(seed, tag, warpedX / wavelength, warpedY / wavelength);
    const regional = .5 + .5 * n(7500, 256), ridges = 1 - Math.abs(n(7501, 80)), small = 1 - Math.abs(n(7502, 24));
    return FIELD_Q * power ** .25 * (.56 + .20 * regional + .18 * ridges + .09 * small);
  };
  await checkpoint('massif-area-samples', 0, N);
  for (let id = 0; id < N; id++) {
    const x = id % SIDE * STEP, y = Math.floor(id / SIDE) * STEP;
    land[id] = Number(isLand(x * Q, y * Q));
    raw[id] = land[id] ? baseAt(x, y) : 0; stats.sourceTests += bodies.length;
    if (stats.sourceTests > MASSIF_LIMITS.sourceTests) throw new Error('面状源区计算超出预算。');
    if ((id + 1) % batch === 0) await checkpoint('massif-area-samples', id + 1, N);
  }
  let heapSize = 0, sorted = 0;
  const less = (a: number, b: number) => {
    if (++stats.heapComparisons > MASSIF_LIMITS.heapComparisons) throw new Error('山谷森林优先队列超出预算。');
    return filled[a] < filled[b] || filled[a] === filled[b] && a < b;
  };
  const push = (id: number) => {
    if (heapSize >= N) throw new Error('山谷森林队列越界。');
    let at = heapSize++; heap[at] = id;
    while (at) { const parent = Math.floor((at - 1) / 2); if (!less(id, heap[parent])) break; heap[at] = heap[parent]; at = parent; heap[at] = id; }
    stats.maximumHeap = Math.max(stats.maximumHeap, heapSize);
  };
  const pop = () => {
    const first = heap[0], last = heap[--heapSize];
    if (heapSize) {
      let at = 0; heap[0] = last;
      while (at * 2 + 1 < heapSize) {
        const left = at * 2 + 1, right = left + 1, child = right < heapSize && less(heap[right], heap[left]) ? right : left;
        if (!less(heap[child], last)) break; heap[at] = heap[child]; at = child; heap[at] = last;
      }
    }
    return first;
  };
  // Every outside-massif / ocean node is a local outlet. The flood is solely
  // an acyclic generation-time ordering, never a claim of filled game lakes.
  for (let id = 0; id < N; id++) {
    if (!land[id] || raw[id] < FIELD_Q * .008 || id % SIDE === 0 || id % SIDE === SIDE - 1 || id < SIDE || id >= N - SIDE) {
      seen[id] = 1; filled[id] = raw[id]; push(id);
    } else accumulation[id] = 1;
    if ((id + 1) % batch === 0) await checkpoint('massif-valley-outlets', id + 1, N);
  }
  while (heapSize) {
    const id = pop(), x = id % SIDE, y = Math.floor(id / SIDE); order[sorted++] = id;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (++stats.routingEdges > MASSIF_LIMITS.routingEdges) throw new Error('山谷森林邻接检查超出预算。');
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIDE || ny >= SIDE) continue;
      const next = ny * SIDE + nx; if (seen[next]) continue;
      if (dx && dy && land[id] && (!land[y * SIDE + nx] || !land[ny * SIDE + x])) continue;
      seen[next] = 1; filled[next] = Math.max(raw[next], filled[id]); receiver[next] = land[id] && raw[id] >= FIELD_Q * .008 ? id : -1;
      stats.routedLandNodes++; push(next);
    }
    if (sorted % batch === 0) await checkpoint('massif-valley-forest', sorted, N);
  }
  if (sorted !== N) throw new Error('山谷森林没有覆盖固定生成域。');
  for (let at = N - 1; at >= 0; at--) {
    const id = order[at], target = receiver[id];
    if (target >= 0) accumulation[target] += accumulation[id];
    // Small tributaries remain shallow, merged valleys receive wider/deeper
    // incision. The final height floor preserves the connected mountain body.
    cut[id] = raw[id] * .78 * clamp((Math.log2(1 + accumulation[id]) - 1) / 7, 0, 1);
    if ((N - at) % batch === 0) await checkpoint('massif-valley-incision', N - at, N);
  }
  for (let pass = 0; pass < MASSIF_LIMITS.spreadingPasses; pass++) {
    for (let id = 0; id < N; id++) {
      const x = id % SIDE, y = Math.floor(id / SIDE); let value = cut[id];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (++stats.spreadingTests > MASSIF_LIMITS.spreadingTests) throw new Error('山谷坡脚展宽超出预算。');
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIDE && ny < SIDE) value = Math.max(value, cut[ny * SIDE + nx] * (dx && dy ? .51 : .62));
      }
      scratch[id] = land[id] ? Math.min(raw[id] * .78, value) : 0;
      if ((id + 1) % batch === 0) await checkpoint('massif-valley-shoulders', pass * N + id + 1, N * MASSIF_LIMITS.spreadingPasses);
    }
    cut.set(scratch);
  }
  const weights = (t: number) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const sample = (xQ: number, yQ: number) => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || yQ < 0 || xQ > 4096 * Q || yQ > 4096 * Q) throw new Error('面状山体查询坐标无效。');
    const x = xQ / Q, y = yQ / Q, gx = x / STEP, gy = y / STEP, ix = Math.floor(gx), iy = Math.floor(gy), wx = weights(gx - ix), wy = weights(gy - iy);
    let erosion = 0;
    for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
      erosion += wx[column] * wy[row] * cut[clamp(iy + row - 1, 0, SIDE - 1) * SIDE + clamp(ix + column - 1, 0, SIDE - 1)];
    }
    const base = baseAt(x, y);
    return { massQ: Math.max(base * .22, base - erosion), kernelTests: bodies.length + 16 };
  };
  const junctions = chains.filter(chain => chain.group).map(chain => {
    const root = chain.anchors[0], parent = chains.find(candidate => candidate.group === chain.parentGroup);
    if (priorLandProbes + stats.landProbes + 1 > landProbeLimit) throw new Error('面状山体父接点核验超出原探测预算。');
    stats.landProbes++;
    if (!parent?.anchors.some(anchor => anchor.xQ === root.xQ && anchor.yQ === root.yQ) || !isLand(root.xQ, root.yQ)) throw new Error('面状山体丢失真实父接点。');
    // Reuse the authoritative tree's already-probed coordinates; this single
    // shared continuous field has one actual height at the parent/child root.
    const heightQ = sample(root.xQ, root.yQ).massQ; if (!(heightQ > 0)) throw new Error('面状山体父接点没有正的山地高程。');
    stats.junctionsChecked++; return { parentGroup: chain.parentGroup!, childGroup: chain.group, xQ: root.xQ, yQ: root.yQ, heightQ };
  });
  await checkpoint('finish-massif-physical-field', N, N);
  return { sample, stats, bodies: bodies.map(body => ({ ...body })), junctions,
    // Receiver diagnostics are private candidate evidence, not a save schema.
    drainage: { receiver, accumulation, order }, profile: 'mountain-area-valleys-v1' as const };
}
