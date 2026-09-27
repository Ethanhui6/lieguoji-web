import { FIELD_Q, hashAt, noiseQ12 } from './seed';
import type { DetailShapeControl } from './detail-shape';
import type { OrographyAnchor, OrographyChain } from './detail-orography';

const SIDE = 128, COUNT = SIDE * SIDE, STEP = 32, Q = 256, UNSEEN = 0xffffffff, UPLIFT_WORLD = 384;
export const FINE_RANGE_TREE_LIMITS = Object.freeze({ gridNodes: COUNT, uniqueVertices: 15, chains: 5, anchorRecords: 19, spans: 14,
  routes: 7, routeEdgeTests: 458752, heapComparisons: 16777216, candidateTests: 589824, typedWorkingBytes: COUNT * 23 } as const);
export interface FineRangeTreeInput { seed: number; isLand: (xQ: number, yQ: number) => boolean }
type Vertex = { cell: number; peakQ: number };
type Chain = { group: number; parentGroup?: number; vertices: Vertex[] };
const point = (cell: number) => ({ xQ: ((cell % SIDE) * STEP + STEP / 2) * Q, yQ: (Math.floor(cell / SIDE) * STEP + STEP / 2) * Q });
const distance2 = (a: number, b: number) => (a % SIDE - b % SIDE) ** 2 + (Math.floor(a / SIDE) - Math.floor(b / SIDE)) ** 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fine-world planning only. The fixed grid locates terrain, never overrides
 * authoritative coverage. Every resulting curve still needs true land probes. */
export async function planFineRangeTree(input: FineRangeTreeInput, batch: number, control?: DetailShapeControl) {
  if (!Number.isInteger(input.seed) || !Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('细山系规划规格无效。');
  const seed = input.seed, isLand = input.isLand;
  // land bit 1: actual sampled land; bit 2: occupied planning path.
  const land = new Uint8Array(COUNT), clearance = new Uint16Array(COUNT), queue = new Uint32Array(COUNT);
  const costs = new Uint32Array(COUNT), parent = new Int32Array(COUNT), heap = new Uint32Array(COUNT), positions = new Int32Array(COUNT);
  const stats = { landQueries: 0, routeCalls: 0, routeEdgeTests: 0, heapComparisons: 0, candidateTests: 0, maximumHeap: 0,
    typedWorkingBytes: land.byteLength + clearance.byteLength + queue.byteLength + costs.byteLength + parent.byteLength + heap.byteLength + positions.byteLength,
    rejectedRouteArms: 0, uniqueVertices: 0, anchorRecords: 0, spans: 0, chains: 0 };
  const checkpoint = async (phase: string, completed: number, total: number) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, completed, total); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted();
  };
  await checkpoint('plan-fine-range-land', 0, COUNT);
  let tail = 0;
  for (let cell = 0; cell < COUNT; cell++) {
    const p = point(cell), actual = isLand(p.xQ, p.yQ); stats.landQueries++;
    land[cell] = Number(actual);
    if (!actual || cell % SIDE === 0 || cell % SIDE === SIDE - 1 || cell < SIDE || cell >= COUNT - SIDE) {
      clearance[cell] = 0; queue[tail++] = cell;
    } else clearance[cell] = 65535;
    if ((cell + 1) % batch === 0) await checkpoint('plan-fine-range-land', cell + 1, COUNT);
  }
  const adjacent = (cell: number) => [cell % SIDE ? cell - 1 : -1, cell % SIDE + 1 < SIDE ? cell + 1 : -1, cell >= SIDE ? cell - SIDE : -1, cell + SIDE < COUNT ? cell + SIDE : -1];
  for (let head = 0; head < tail; head++) {
    const cell = queue[head];
    for (const next of adjacent(cell)) if (next >= 0 && clearance[next] > clearance[cell] + 1) { clearance[next] = clearance[cell] + 1; queue[tail++] = next; }
    if ((head + 1) % batch === 0) await checkpoint('plan-fine-range-clearance', head + 1, COUNT);
  }
  const eligible: number[] = [];
  let centre = -1, best = -Infinity, maxClearance = 0;
  for (let cell = 0; cell < COUNT; cell++) if ((land[cell] & 1) && clearance[cell] >= 2) {
    eligible.push(cell); maxClearance = Math.max(maxClearance, clearance[cell]);
    const p = point(cell), score = clearance[cell] * (4096 + noiseQ12(seed, 7410, p.xQ, p.yQ, 512 * Q) / 3);
    if (score > best) { best = score; centre = cell; }
  }
  const empty = () => ({ chains: [] as OrographyChain[], stats, graph: [] as { group: number; parentGroup?: number; cells: number[] }[] });
  if (centre < 0 || eligible.length < 16 || maxClearance < 3) return empty();
  let endA = -1, endB = -1; best = -Infinity;
  for (const cell of eligible) {
    const score = distance2(centre, cell) * (.8 + (hashAt(seed, 7411, cell, 0) % 201) / 1000);
    if (score > best) { best = score; endA = cell; }
  }
  best = -Infinity;
  const ca = { x: endA % SIDE - centre % SIDE, y: Math.floor(endA / SIDE) - Math.floor(centre / SIDE) };
  for (const cell of eligible) {
    const x = cell % SIDE - centre % SIDE, y = Math.floor(cell / SIDE) - Math.floor(centre / SIDE);
    if (x * ca.x + y * ca.y >= 0) continue;
    const score = Math.min(distance2(centre, cell), distance2(endA, cell)) * (.8 + (hashAt(seed, 7412, cell, 0) % 201) / 1000);
    if (score > best) { best = score; endB = cell; }
  }
  if (endB < 0 || distance2(endA, endB) < 64) return empty();

  const route = async (start: number, goal: number, avoidOccupied: boolean): Promise<number[]> => {
    if (++stats.routeCalls > FINE_RANGE_TREE_LIMITS.routes) throw new Error('细山系寻路次数超出预算。');
    costs.fill(UNSEEN); parent.fill(-1); positions.fill(-1); let size = 0;
    const less = (a: number, b: number) => {
      if (++stats.heapComparisons > FINE_RANGE_TREE_LIMITS.heapComparisons) throw new Error('细山系堆比较超出预算。');
      return costs[a] < costs[b] || costs[a] === costs[b] && a < b;
    };
    const swap = (a: number, b: number) => { const av = heap[a], bv = heap[b]; heap[a] = bv; heap[b] = av; positions[av] = b; positions[bv] = a; };
    const up = (index: number) => { while (index) { const p = Math.floor((index - 1) / 2); if (!less(heap[index], heap[p])) break; swap(index, p); index = p; } };
    const add = (cell: number) => {
      if (positions[cell] >= 0) { up(positions[cell]); return; }
      if (size >= COUNT) throw new Error('细山系开放集超出预算。');
      positions[cell] = size; heap[size++] = cell; up(size - 1); stats.maximumHeap = Math.max(stats.maximumHeap, size);
    };
    costs[start] = 0; add(start); let pops = 0;
    while (size) {
      const cell = heap[0]; positions[cell] = -2; size--;
      if (size) {
        heap[0] = heap[size]; positions[heap[0]] = 0; let index = 0;
        while (index * 2 + 1 < size) {
          const left = index * 2 + 1, right = left + 1, child = right < size && less(heap[right], heap[left]) ? right : left;
          if (!less(heap[child], heap[index])) break; swap(index, child); index = child;
        }
      }
      if (cell === goal) {
        const result: number[] = []; let node = goal;
        while (node >= 0) { if (result.length >= COUNT) throw new Error('细山系回溯出现环。'); result.push(node); node = parent[node]; }
        return result.reverse();
      }
      const cx = cell % SIDE, cy = Math.floor(cell / SIDE);
      const neighbours = [...adjacent(cell), cx && cy ? cell - SIDE - 1 : -1, cx + 1 < SIDE && cy ? cell - SIDE + 1 : -1,
        cx && cy + 1 < SIDE ? cell + SIDE - 1 : -1, cx + 1 < SIDE && cy + 1 < SIDE ? cell + SIDE + 1 : -1];
      for (const next of neighbours) {
        if (++stats.routeEdgeTests > FINE_RANGE_TREE_LIMITS.routeEdgeTests) throw new Error('细山系路径边检查超出预算。');
        if (next < 0 || !(land[next] & 1) || positions[next] === -2 || clearance[next] < 2 || avoidOccupied && (land[next] & 2) && distance2(start, next) > 4) continue;
        const diagonal = next % SIDE !== cx && Math.floor(next / SIDE) !== cy;
        if (diagonal) {
          const across = cy * SIDE + next % SIDE, down = Math.floor(next / SIDE) * SIDE + cx;
          if (!(land[across] & 1) || !(land[down] & 1) || clearance[across] < 2 || clearance[down] < 2
            || avoidOccupied && (((land[across] & 2) && distance2(start, across) > 4) || ((land[down] & 2) && distance2(start, down) > 4))) continue;
        }
        const p = point(next), regional = Math.floor((FIELD_Q - noiseQ12(seed, 7414, p.xQ, p.yQ, UPLIFT_WORLD * Q)) / 16);
        const edgeCost = 256 + Math.max(0, maxClearance - clearance[next]) * 32 + regional;
        const candidate = costs[cell] + (diagonal ? Math.round(edgeCost * 181 / 128) : edgeCost);
        if (candidate < costs[next]) { costs[next] = candidate; parent[next] = cell; add(next); }
      }
      if (++pops % Math.max(64, Math.floor(batch / 4)) === 0) await checkpoint('route-fine-range-tree', stats.routeEdgeTests, FINE_RANGE_TREE_LIMITS.routeEdgeTests);
    }
    return [];
  };
  const first = await route(endA, centre, false), second = await route(centre, endB, false);
  if (!first.length || !second.length) return empty();
  // Loop erasure prevents backtracking at the common inland route.
  costs.fill(UNSEEN); const path: number[] = [];
  for (const cell of [...first, ...second.slice(1)]) {
    if (costs[cell] !== UNSEEN) while (path.length > costs[cell] + 1) costs[path.pop()!] = UNSEEN;
    else { costs[cell] = path.length; path.push(cell); }
  }
  if (path.length < 9) return empty();
  const simplify = (source: readonly number[], count: number) => {
    const selected = [0, source.length - 1];
    while (selected.length < Math.min(count, source.length)) {
      let chosen = -1, score = -1;
      for (let span = 1; span < selected.length; span++) {
        const lo = selected[span - 1], hi = selected[span], a = point(source[lo]), b = point(source[hi]);
        for (let i = lo + 1; i < hi; i++) {
          const p = point(source[i]), t = (i - lo) / (hi - lo), deviation = Math.hypot(p.xQ - a.xQ - (b.xQ - a.xQ) * t, p.yQ - a.yQ - (b.yQ - a.yQ) * t) / Q;
          const separation = Math.min(i - lo, hi - i) * STEP;
          const value = deviation + .22 * separation;
          if (value > score) { score = value; chosen = i; }
        }
      }
      if (chosen < 0) break; selected.push(chosen); selected.sort((a, b) => a - b);
    }
    return selected.map(i => source[i]);
  };
  const mainCells = simplify(path, 7), main: Chain = { group: 0, vertices: mainCells.map((cell, i) => {
    const p = point(cell), relief = .38 + .48 * Math.sqrt(clearance[cell] / maxClearance) + noiseQ12(seed, 7414, p.xQ, p.yQ, UPLIFT_WORLD * Q) / FIELD_Q * .1;
    return { cell, peakQ: Math.round(FIELD_Q * (i === 0 || i + 1 === mainCells.length ? .16 : clamp(relief, .42, .98))) };
  }) };
  // Two actual peak controls separated by an explicit lower pass.
  const internal = main.vertices.map((v, i) => ({ ...v, i })).filter(v => v.i > 0 && v.i + 1 < main.vertices.length);
  const strongest = internal.reduce((a, b) => b.peakQ > a.peakQ ? b : a), others = internal.filter(v => Math.abs(v.i - strongest.i) >= 2);
  if (others.length) {
    const other = others.reduce((a, b) => b.peakQ > a.peakQ ? b : a), lo = Math.min(strongest.i, other.i), hi = Math.max(strongest.i, other.i);
    const middle = Math.floor((lo + hi) / 2); main.vertices[middle].peakQ = Math.min(main.vertices[middle].peakQ, Math.round(Math.min(strongest.peakQ, other.peakQ) * .47));
  }
  const planned: Chain[] = [main], usedRoots: number[] = [];
  for (const cell of path) land[cell] |= 2;
  for (let arm = 0; arm < 4; arm++) {
    const roots = planned.flatMap(chain => chain.vertices.flatMap((v, i) => i > 0 && i + 1 < chain.vertices.length && (chain.group === 0 || chain.group === 1 && arm >= 2)
      ? [{ cell: v.cell, parentGroup: chain.group, before: chain.vertices[i - 1].cell, after: chain.vertices[i + 1].cell }] : []));
    let choice: { root: typeof roots[number]; end: number; score: number } | undefined;
    for (const root of roots) {
      if (usedRoots.some(cell => distance2(cell, root.cell) < 36)) continue;
      const before = point(root.before), after = point(root.after), dx = after.xQ - before.xQ, dy = after.yQ - before.yQ, norm = Math.hypot(dx, dy);
      const start = point(root.cell), reach = Math.min(512, clearance[root.cell] * STEP * 1.6);
      for (const end of eligible) {
        if (++stats.candidateTests > FINE_RANGE_TREE_LIMITS.candidateTests) throw new Error('细山系支臂候选超出预算。');
        const p = point(end), ex = p.xQ - start.xQ, ey = p.yQ - start.yQ, distance = Math.hypot(ex, ey) / Q;
        const side = Math.abs(dx * ey - dy * ex) / Math.max(1, norm * distance * Q);
        if (!(land[end] & 2) && distance >= 128 && distance <= reach && side >= .55 && clearance[end] >= 2
          && planned.every(chain => chain.vertices.every(v => v.cell === root.cell || distance2(end, v.cell) >= 9))) {
          // The same regional uplift field steers routes, arm destinations and
          // peak controls. It changes actual connected landforms, not shading.
          const uplift = (noiseQ12(seed, 7414, p.xQ, p.yQ, UPLIFT_WORLD * Q) + FIELD_Q) / (2 * FIELD_Q);
          const score = distance * Math.sqrt(side) * (1 + Math.min(6, clearance[end]) * .07) * (.7 + .6 * uplift)
            * (.97 + (hashAt(seed, 7415, root.cell, end) % 61) / 1000);
          if (!choice || score > choice.score) choice = { root, end, score };
        }
        if (stats.candidateTests % batch === 0) await checkpoint('branch-fine-range-tree', stats.candidateTests, FINE_RANGE_TREE_LIMITS.candidateTests);
      }
    }
    if (!choice) break;
    usedRoots.push(choice.root.cell);
    const armPath = await route(choice.root.cell, choice.end, true);
    if (armPath.length < 5) { stats.rejectedRouteArms++; continue; }
    const cells = simplify(armPath, 3);
    if (cells.length !== 3 || new Set(cells).size !== 3) { stats.rejectedRouteArms++; continue; }
    planned.push({ group: planned.length, parentGroup: choice.root.parentGroup, vertices: cells.map((cell, i) => ({ cell, peakQ: Math.round(FIELD_Q * [1, .55, .16][i]) })) });
    for (const cell of armPath) land[cell] |= 2;
  }
  const sectionAt = (cell: number, before: number, after: number, branch: boolean) => {
    const a = point(before), b = point(after), dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, norm = Math.max(1, Math.hypot(dx, dy));
    const p = point(cell), near = Math.min(cell === before ? Infinity : Math.sqrt(distance2(cell, before)) * STEP, cell === after ? Infinity : Math.sqrt(distance2(cell, after)) * STEP);
    const width = clamp(Math.min(clearance[cell] * STEP * .72, near * .55), branch ? 16 : 24, 160);
    const atSide = (sign: number) => {
      const x = clamp(Math.floor((p.xQ / Q - sign * dy / norm * 64) / STEP), 0, SIDE - 1), y = clamp(Math.floor((p.yQ / Q + sign * dx / norm * 64) / STEP), 0, SIDE - 1);
      return clearance[y * SIDE + x];
    };
    const left = atSide(-1), right = atSide(1), leftRatio = clamp((left + 2) / (clearance[cell] + 2), .6, 1.2), rightRatio = clamp((right + 2) / (clearance[cell] + 2), .6, 1.2);
    return { widthQ: Math.round(width * Q), section: { leftReachQ: Math.round(width * leftRatio * Q), rightReachQ: Math.round(width * rightRatio * Q),
      leftShoulderQ: Math.round(FIELD_Q * (.18 + .18 * leftRatio)), rightShoulderQ: Math.round(FIELD_Q * (.18 + .18 * rightRatio)) } };
  };
  const chains: OrographyChain[] = planned.map(chain => ({ group: chain.group, parentGroup: chain.parentGroup, leeQ: 1, seed, sampleStepQ: 512, crossSection: 'fine-tree',
    anchors: chain.vertices.map((v, i): OrographyAnchor => ({ ...point(v.cell), peakQ: v.peakQ,
      ...sectionAt(v.cell, chain.vertices[Math.max(0, i - 1)].cell, chain.vertices[Math.min(chain.vertices.length - 1, i + 1)].cell, chain.group !== 0) })) }));
  stats.uniqueVertices = new Set(planned.flatMap(chain => chain.vertices.map(v => v.cell))).size;
  stats.anchorRecords = chains.reduce((sum, chain) => sum + chain.anchors.length, 0); stats.spans = stats.anchorRecords - chains.length; stats.chains = chains.length;
  if (stats.uniqueVertices > 15 || stats.anchorRecords > 19 || stats.spans > 14 || stats.chains > 5) throw new Error('细山系脊树结构超出预算。');
  await checkpoint('finish-fine-range-tree', stats.uniqueVertices, FINE_RANGE_TREE_LIMITS.uniqueVertices);
  return { chains, stats, graph: planned.map(chain => ({ group: chain.group, parentGroup: chain.parentGroup, cells: chain.vertices.map(v => v.cell) })) };
}
