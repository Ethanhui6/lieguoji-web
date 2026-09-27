/** Pure, bounded first-slice drainage over the existing 2-world fine lattice.
 * No geography mutation, implicit water volume, schema or simulation-region ID. */
export const HYDROLOGY_LIMITS = { side: 512, nodes: 262144, bytesPerNode: 48, typedArrayBytes: 12582912, operationsPerNode: 64 } as const;
export const NO_WATER = -32768;
export const HYDROLOGY_TERMINAL = { depression: -7, unresolved: -8, excluded: -9 } as const;
export const HYDROLOGY_STATUS = { excluded: 0, ocean: 1, endorheic: 2, unresolved: 3 } as const;
const UNASSIGNED = -10, STEP_Q = 512, WORLD_NODES = 2049;
// Four cardinal routing edges. NW/SE are used only to identify a zero node
// which already lies on the coast of an actual incident source triangle.
const DX = [0, 1, 0, -1, -1, 1], DY = [-1, 0, 1, 0, -1, 1];

export interface HydrologyInput {
  originColumn: number; originRow: number; columns: number; rows: number;
  coverageQ: Int16Array; groundMeters: Int16Array;
}
export interface HydrologyControl {
  signal?: AbortSignal;
  yieldControl?: () => Promise<void>;
  onProgress?: (phase: string, operations: number, maximumOperations: number) => void;
}
export interface HydrologyOptions { batch?: number; maximumOperations?: number; maximumTypedArrayBytes?: number }
export interface HydrologyResult {
  originColumn: number; originRow: number; columns: number; rows: number; stepQ: 512;
  coverageQ: Int16Array; groundMeters: Int16Array;
  /** >=0 is a land receiver index; -1..-6 are coast directions, -7 a natural
   * depression, -8 unresolved cropped flat, -9 excluded sea. */
  receiver: Int32Array;
  /** -1 for sea, otherwise index into basin arrays. Not a simulation-region ID. */
  basinId: Int32Array;
  contributingSamples: Uint32Array;
  drainageStatus: Uint8Array;
  lakeWaterSurfaceMeters: Int16Array;
  topologicalOrder: Uint32Array;
  basins: {
    terminalNode: Uint32Array; terminalKind: Uint8Array; partial: Uint8Array;
    candidateSpillMeters: Int16Array; spillFromNode: Int32Array; spillToNode: Int32Array;
    /** Q8 coast point for an ocean terminal; -1 for non-ocean terminals. */
    coastXQ: Int32Array; coastYQ: Int32Array;
  };
  stats: { nodes: number; landNodes: number; basinCount: number; operations: number; typedArrayBytes: number; maximumQueueLength: number };
}

/** Matches canonical fine source-edge clipping, including zero endpoints. */
export function canonicalHydrologyCoastCrossing(a: { xQ: number; yQ: number; coverageQ: number }, b: { xQ: number; yQ: number; coverageQ: number }) {
  if (![a.xQ, a.yQ, b.xQ, b.yQ, a.coverageQ, b.coverageQ].every(Number.isInteger)
    || Math.abs(a.coverageQ) > 32767 || Math.abs(b.coverageQ) > 32767
    || [a.xQ, a.yQ, b.xQ, b.yQ].some(v => v < 0 || v > 4096 * 256)
    || a.coverageQ < 0 && b.coverageQ < 0 || a.coverageQ > 0 && b.coverageQ > 0 || a.coverageQ === 0 && b.coverageQ === 0) throw new Error('水文海岸交点需要有效异号源边。');
  if (a.xQ > b.xQ || a.xQ === b.xQ && a.yQ > b.yQ) [a, b] = [b, a];
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length !== STEP_Q || dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) throw new Error('水文海岸交点只能使用实际细源边。');
  if (a.coverageQ === 0) return { xQ: a.xQ, yQ: a.yQ };
  if (b.coverageQ === 0) return { xQ: b.xQ, yQ: b.yQ };
  const numerator = length * Math.abs(a.coverageQ), denominator = Math.abs(a.coverageQ - b.coverageQ);
  const offset = Math.max(1, Math.min(length - 1, Math.floor((2 * numerator + denominator) / (2 * denominator))));
  return { xQ: a.xQ + Math.sign(dx) * offset, yQ: a.yQ + Math.sign(dy) * offset };
}

export async function buildHydrologyKernel(input: HydrologyInput, options: HydrologyOptions = {}, control?: HydrologyControl): Promise<HydrologyResult> {
  const { columns, rows, originColumn, originRow } = input, n = columns * rows;
  const batch = options.batch ?? 1024, hardOperations = HYDROLOGY_LIMITS.operationsPerNode * n + 1024;
  const maximumOperations = options.maximumOperations ?? hardOperations, maximumBytes = options.maximumTypedArrayBytes ?? HYDROLOGY_LIMITS.typedArrayBytes;
  if (![columns, rows, originColumn, originRow].every(Number.isInteger) || columns < 2 || rows < 2 || columns > HYDROLOGY_LIMITS.side || rows > HYDROLOGY_LIMITS.side
    || n > HYDROLOGY_LIMITS.nodes || originColumn < 0 || originRow < 0 || originColumn + columns > WORLD_NODES || originRow + rows > WORLD_NODES) throw new Error('水文细节点范围超出有界输入。');
  if (!(input.coverageQ instanceof Int16Array) || !(input.groundMeters instanceof Int16Array) || input.coverageQ.length !== n || input.groundMeters.length !== n
    || !(input.coverageQ.buffer instanceof ArrayBuffer) || !(input.groundMeters.buffer instanceof ArrayBuffer)) throw new Error('水文输入需要私有可复制的完整整数细节点。');
  if (!Number.isInteger(batch) || batch < 64 || batch > 8192 || !Number.isInteger(maximumOperations) || maximumOperations < 1 || maximumOperations > hardOperations
    || !Number.isInteger(maximumBytes) || maximumBytes > HYDROLOGY_LIMITS.typedArrayBytes || maximumBytes < n * HYDROLOGY_LIMITS.bytesPerNode) throw new Error('水文工作或内存预算无效。');
  control?.signal?.throwIfAborted();
  // All caller state is owned before the first callback or yield.
  const coverageQ = input.coverageQ.slice(), groundMeters = input.groundMeters.slice();
  const receiver = new Int32Array(n).fill(UNASSIGNED), basinId = new Int32Array(n).fill(-1), contributingSamples = new Uint32Array(n);
  const drainageStatus = new Uint8Array(n), lakeWaterSurfaceMeters = new Int16Array(n).fill(NO_WATER), indegree = new Uint8Array(n), queue = new Uint32Array(n);
  let operations = 0, nextYield = 0, maximumQueueLength = 0, landNodes = 0;
  const work = () => { if (++operations > maximumOperations) throw new Error('水文计算超出操作预算。'); };
  const checkpoint = async (phase: string) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, operations, maximumOperations); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted(); nextYield = operations + batch;
  };
  const neighbour = (id: number, direction: number) => {
    const x = id % columns + DX[direction], y = Math.floor(id / columns) + DY[direction];
    return x < 0 || y < 0 || x >= columns || y >= rows ? -1 : y * columns + x;
  };
  const boundary = (id: number) => id < columns || id >= n - columns || id % columns === 0 || id % columns === columns - 1;
  const globalId = (id: number) => (originRow + Math.floor(id / columns)) * WORLD_NODES + originColumn + id % columns;
  const point = (id: number) => ({ xQ: (originColumn + id % columns) * STEP_Q, yQ: (originRow + Math.floor(id / columns)) * STEP_Q, coverageQ: coverageQ[id] });
  const landEdge = (a: number, b: number) => {
    if (b < 0 || coverageQ[b] < 0) return false;
    if (coverageQ[a] > 0 || coverageQ[b] > 0) return true;
    // A zero-zero line is not a land-area bridge when both incident source
    // triangles have a negative third vertex. Unknown outer triangles cannot
    // certify such an edge either.
    const lo = Math.min(a, b), hi = Math.max(a, b), horizontal = hi - lo === 1;
    const first = neighbour(lo, horizontal ? 0 : 3), second = neighbour(hi, horizontal ? 2 : 1);
    return first >= 0 && coverageQ[first] >= 0 || second >= 0 && coverageQ[second] >= 0;
  };
  await checkpoint('capture');
  for (let id = 0; id < n; id++) {
    work(); const c = coverageQ[id], h = groundMeters[id];
    if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h > -1 || c === 0 && h !== 0) throw new Error('水文节点覆盖或地面高程无效。');
    if (c < 0) receiver[id] = HYDROLOGY_TERMINAL.excluded;
    else { contributingSamples[id] = 1; landNodes++; }
    if (operations >= nextYield) await checkpoint('validate');
  }
  // Strict descent, deterministic lower-height / world-ID tie-break. A zero
  // coast terminal has priority over an equally low land neighbour.
  for (let id = 0; id < n; id++) {
    work(); if (coverageQ[id] < 0) { if (operations >= nextYield) await checkpoint('strict-descent'); continue; }
    let bestHeight = groundMeters[id], bestKey = Infinity, best = UNASSIGNED, bestOcean = false;
    for (let direction = 0; direction < (coverageQ[id] === 0 ? 6 : 4); direction++) {
      work(); const other = neighbour(id, direction); if (other < 0) continue;
      const ocean = coverageQ[other] < 0;
      if (!ocean && (direction >= 4 || !landEdge(id, other) || groundMeters[other] >= groundMeters[id])) continue;
      const height = ocean ? 0 : groundMeters[other], key = globalId(other);
      if (height < bestHeight || height === bestHeight && (ocean && !bestOcean || ocean === bestOcean && key < bestKey)) {
        bestHeight = height; bestKey = key; bestOcean = ocean; best = ocean ? -1 - direction : other;
      }
    }
    receiver[id] = best;
    if (operations >= nextYield) await checkpoint('strict-descent');
  }
  let head = 0, tail = 0;
  for (let id = 0; id < n; id++) { work(); if (coverageQ[id] >= 0 && receiver[id] !== UNASSIGNED) queue[tail++] = id; if (operations >= nextYield) await checkpoint('flat-seeds'); }
  maximumQueueLength = Math.max(maximumQueueLength, tail);
  while (head < tail) {
    const id = queue[head++]; work();
    for (let direction = 0; direction < 4; direction++) {
      work(); const other = neighbour(id, direction);
      if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[id] && landEdge(id, other)) { receiver[other] = id; queue[tail++] = other; }
    }
    maximumQueueLength = Math.max(maximumQueueLength, tail - head);
    if (operations >= nextYield) await checkpoint('route-flats');
  }
  // Unseeded flat components are natural local minima. A cropped flat must
  // terminate at a real boundary node and remain unresolved, never be filled.
  for (let root = 0; root < n; root++) {
    work(); if (receiver[root] !== UNASSIGNED) { if (operations >= nextYield) await checkpoint('closed-flats'); continue; }
    head = 0; tail = 1; queue[0] = root; receiver[root] = HYDROLOGY_TERMINAL.depression; let boundaryRoot = -1;
    while (head < tail) {
      const id = queue[head++]; work();
      if (boundary(id) && (boundaryRoot < 0 || id < boundaryRoot)) boundaryRoot = id;
      for (let direction = 0; direction < 4; direction++) {
        work(); const other = neighbour(id, direction);
        if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[id] && landEdge(id, other)) { receiver[other] = id; queue[tail++] = other; }
      }
      maximumQueueLength = Math.max(maximumQueueLength, tail - head);
      if (operations >= nextYield) await checkpoint('closed-flats');
    }
    if (boundaryRoot >= 0) {
      let id = boundaryRoot, previous: number = HYDROLOGY_TERMINAL.unresolved;
      while (id >= 0) { work(); const next = receiver[id]; receiver[id] = previous; previous = id; id = next; if (operations >= nextYield) await checkpoint('resolve-crop-boundary'); }
    }
  }
  let basinCount = 0;
  for (let id = 0; id < n; id++) {
    work(); if (coverageQ[id] >= 0) { if (receiver[id] >= 0) indegree[receiver[id]]++; else basinCount++; }
    if (operations >= nextYield) await checkpoint('topology');
  }
  const basins = { terminalNode: new Uint32Array(basinCount), terminalKind: new Uint8Array(basinCount), partial: new Uint8Array(basinCount),
    candidateSpillMeters: new Int16Array(basinCount).fill(NO_WATER), spillFromNode: new Int32Array(basinCount).fill(-1), spillToNode: new Int32Array(basinCount).fill(-1),
    coastXQ: new Int32Array(basinCount).fill(-1), coastYQ: new Int32Array(basinCount).fill(-1) };
  const typedArrayBytes = coverageQ.byteLength + groundMeters.byteLength + receiver.byteLength + basinId.byteLength + contributingSamples.byteLength
    + drainageStatus.byteLength + lakeWaterSurfaceMeters.byteLength + indegree.byteLength + queue.byteLength + Object.values(basins).reduce((sum, array) => sum + array.byteLength, 0);
  if (typedArrayBytes > maximumBytes || typedArrayBytes > n * HYDROLOGY_LIMITS.bytesPerNode) throw new Error('水文实际数组超出内存预算。');
  let basin = 0; head = 0; tail = 0;
  for (let id = 0; id < n; id++) {
    work(); if (coverageQ[id] < 0) { if (operations >= nextYield) await checkpoint('terminals'); continue; }
    if (indegree[id] === 0) queue[tail++] = id;
    if (receiver[id] < 0) {
      basinId[id] = basin; basins.terminalNode[basin] = id;
      if (receiver[id] >= -6) {
        basins.terminalKind[basin] = HYDROLOGY_STATUS.ocean;
        const crossing = canonicalHydrologyCoastCrossing(point(id), point(neighbour(id, -1 - receiver[id])));
        basins.coastXQ[basin] = crossing.xQ; basins.coastYQ[basin] = crossing.yQ;
      } else basins.terminalKind[basin] = receiver[id] === HYDROLOGY_TERMINAL.depression ? HYDROLOGY_STATUS.endorheic : HYDROLOGY_STATUS.unresolved;
      basin++;
    }
    if (operations >= nextYield) await checkpoint('terminals');
  }
  while (head < tail) {
    const id = queue[head++], to = receiver[id]; work();
    if (to >= 0) { contributingSamples[to] += contributingSamples[id]; if (--indegree[to] === 0) queue[tail++] = to; }
    maximumQueueLength = Math.max(maximumQueueLength, tail - head);
    if (operations >= nextYield) await checkpoint('accumulation');
  }
  if (tail !== landNodes) throw new Error('水文流向出现闭环或断链。');
  for (let index = tail - 1; index >= 0; index--) {
    const id = queue[index], to = receiver[id]; work();
    if (to >= 0) basinId[id] = basinId[to];
    if (basinId[id] < 0) throw new Error('水文上游缺少实际终点。');
    if (boundary(id) || basins.terminalKind[basinId[id]] === HYDROLOGY_STATUS.unresolved) basins.partial[basinId[id]] = 1;
    if (operations >= nextYield) await checkpoint('propagate-basins');
  }
  const recordSpill = (from: number, to: number, height: number) => {
    const bid = basinId[from]; if (basins.terminalKind[bid] !== HYDROLOGY_STATUS.endorheic) return;
    const previous = basins.candidateSpillMeters[bid], previousFrom = basins.spillFromNode[bid], previousTo = basins.spillToNode[bid];
    if (previous === NO_WATER || height < previous || height === previous && (from < previousFrom || from === previousFrom && to < previousTo)) {
      basins.candidateSpillMeters[bid] = height; basins.spillFromNode[bid] = from; basins.spillToNode[bid] = to;
    }
  };
  for (let id = 0; id < n; id++) {
    work(); if (coverageQ[id] < 0) { if (operations >= nextYield) await checkpoint('spill-candidates'); continue; }
    const bid = basinId[id]; drainageStatus[id] = basins.partial[bid] ? HYDROLOGY_STATUS.unresolved : basins.terminalKind[bid];
    for (let direction = 1; direction <= 2; direction++) {
      work(); const other = neighbour(id, direction);
      if (other >= 0 && landEdge(id, other) && basinId[other] !== bid) {
        const height = Math.max(groundMeters[id], groundMeters[other]); recordSpill(id, other, height); recordSpill(other, id, height);
      }
    }
    if (operations >= nextYield) await checkpoint('spill-candidates');
  }
  await checkpoint('complete');
  return { originColumn, originRow, columns, rows, stepQ: STEP_Q, coverageQ, groundMeters, receiver, basinId, contributingSamples, drainageStatus, lakeWaterSurfaceMeters,
    topologicalOrder: queue.subarray(0, landNodes), basins, stats: { nodes: n, landNodes, basinCount, operations, typedArrayBytes, maximumQueueLength } };
}
