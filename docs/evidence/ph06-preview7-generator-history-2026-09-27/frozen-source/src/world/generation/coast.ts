import { cloneBlock, yieldAtlas, type AtlasBlock, type BlockKey, type GeometryBlock } from '../model';
import { generationExact, generationInt, validateGenerationScope, type AtlasGenerationDocument, type GenerationScope } from '../generation-contract';
import { generationEnvelope } from '../generation-format';
import { assertAtlasLocksPreserved, LOCK_COAST, lockKey } from '../generation-locks';
import { cellNeighbors, edgeIdAt, edgeVertexIds, getVertexPositionQ, incidentCellIds, validateVertexPositionQ, vertexSlotLocation } from '../topology';
import { batchSize, measureGeography, quadMeasure, quadQ, type GenerationControl } from './quality';
import { FIELD_Q, smoothQ } from './seed';

/** Strength is a maximum target. Invalid complete rounds reduce their actual
 * displacement together, rather than weakening topology validation. */
export interface CoastParameters { strengthPermille: number; iterations: number }
export interface CoastInput { base: AtlasGenerationDocument; parameters: CoastParameters; scope?: GenerationScope }
export interface CoastOutput {
  /** Only geometry blocks with actual final changes are copied. Every other
   * block remains a reference to the verified, privately owned baseline. */
  blocks: Map<BlockKey, AtlasBlock>; changedKeys: BlockKey[];
  summary: {
    changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number;
    minElevationMeters: number; maxElevationMeters: number;
    changedVertexCount: number; coastlineEdges: number; eligibleVertices: number;
    /** These exclusion counts may overlap, e.g. a locked world-edge endpoint. */
    lockedVertices: number; endpointVertices: number; ambiguousVertices: number; boundaryVertices: number;
    /** Fully checked rounds that produced at least one actual displacement. */
    iterationsApplied: number; rejectedCandidates: number;
  };
  diagnostics: {
    coastlineLengthBeforeWorld: number; coastlineLengthAfterWorld: number;
    /** Sum of |neighborA + neighborB - 2 * vertex| squared in Q8 units,
     * measured at actual degree-two coastal vertices, including locked ones. */
    turnEnergyBeforeQ2: number; turnEnergyAfterQ2: number;
    /** Actual whole-round displacement divisors, one per applied round. */
    stepDivisors: number[];
  };
}
export type CoastControl = GenerationControl;
export function validateCoastParameters(raw: unknown): raw is CoastParameters {
  return generationExact(raw, ['strengthPermille', 'iterations']) && generationInt(raw.strengthPermille, 100, 1000) && generationInt(raw.iterations, 1, 4);
}

/** Smooth the existing land/sea edge graph, without changing its resolution or
 * classifying new land. Each Jacobi round reads only the preceding complete
 * round. Quarter-cell creation-grid bounds, locks, fixed world boundaries and
 * ambiguous junctions remain hard constraints; clipped coasts may not improve.
 * The caller must supply its verified, exclusively owned immutable baseline. */
export async function generateCoast(input: CoastInput, control?: CoastControl): Promise<CoastOutput> {
  if (input.base?.manifest?.version === 4) throw new Error('旧生成器尚不支持第四版细海岸，原图未修改。');
  control?.signal?.throwIfAborted();
  if (!validateCoastParameters(input.parameters)) throw new Error('海岸平滑参数无效：强度须为100—1000‰，轮数须为1—4。');
  if (!generationEnvelope(input.base)) throw new Error('海岸平滑需要完整、已核验的第二版草稿与已知锁。');
  const requestedScope = input.scope === undefined ? { kind: 'world' } : input.scope;
  if (!validateGenerationScope(requestedScope)) throw new Error('海岸生成范围无效，必须明确全图或合法地块矩形及过渡宽度。');
  const scope = structuredClone(requestedScope);
  const parameters = { ...input.parameters }, base = input.base, spec = base.manifest.spec, batch = batchSize(control);
  if (scope.kind === 'cell-rectangle' && (scope.column + scope.columns > spec.columns || scope.row + scope.rows > spec.rows)) throw new Error('局部海岸范围超出当前地图。');
  const total = spec.columns * spec.rows, vertexTotal = (spec.columns + 1) * (spec.rows + 1), stepQ = spec.width * spec.coordinateScale / spec.columns, limitQ = Math.floor(stepQ / 4);
  const pause = (stage: string, completed: number, count: number) => yieldAtlas(control, stage, completed, count);
  const original = await measureGeography(base, control, '读取海岸真实共享几何');
  const degrees = new Uint8Array(vertexTotal), neighbors = new Int32Array(vertexTotal * 2).fill(-1), edges: number[] = [];
  const coastLocked = new Uint8Array(total), weights = new Uint16Array(vertexTotal), coastVertices: number[] = [], eligible: number[] = [];
  const cellWeight = (id: number) => {
    if (scope.kind === 'world') return FIELD_Q;
    const col = id % spec.columns, row = Math.floor(id / spec.columns);
    const distance = Math.min(col - scope.column, scope.column + scope.columns - 1 - col, row - scope.row, scope.row + scope.rows - 1 - row);
    if (distance < 0) return 0;
    return scope.transitionCells ? smoothQ(Math.min(FIELD_Q, Math.floor(distance * FIELD_Q / scope.transitionCells))) : FIELD_Q;
  };
  function addEdge(edge: number) {
    const [a, b] = edgeVertexIds(spec, edge); edges.push(edge);
    if (degrees[a] < 2) neighbors[a * 2 + degrees[a]] = b;
    if (degrees[b] < 2) neighbors[b * 2 + degrees[b]] = a;
    degrees[a]++; degrees[b]++;
  }
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const col = id % spec.columns, row = Math.floor(id / spec.columns), land = original.elevation[id] >= 0;
      const lock = base.locks.get(lockKey(Math.floor(col / 32), Math.floor(row / 32)));
      coastLocked[id] = lock && lock.flags[row % 32 * 32 + col % 32] & LOCK_COAST ? 1 : 0;
      // Every interior edge is considered exactly once. A world border is not
      // an invented ocean neighbor and does not become a coastline by itself.
      if (col + 1 < spec.columns && land !== (original.elevation[id + 1] >= 0)) addEdge(edgeIdAt(spec, 'vertical', col + 1, row));
      if (row + 1 < spec.rows && land !== (original.elevation[id + spec.columns] >= 0)) addEdge(edgeIdAt(spec, 'horizontal', col, row + 1));
    }
    await pause('识别真实海陆共享边与海岸锁', end, total);
  }
  let lockedVertices = 0, endpointVertices = 0, ambiguousVertices = 0, boundaryVertices = 0;
  for (let start = 0; start < vertexTotal; start += batch) {
    const end = Math.min(vertexTotal, start + batch);
    for (let id = start; id < end; id++) if (degrees[id]) {
      coastVertices.push(id);
      const col = id % (spec.columns + 1), row = Math.floor(id / (spec.columns + 1));
      const boundary = col === 0 || col === spec.columns || row === 0 || row === spec.rows;
      const incident = incidentCellIds(spec, id), locked = incident.some(cell => coastLocked[cell]);
      // A shared point is writable only if every real incident cell is inside.
      // Taking the smallest continuous cell weight also fixes the outer ring
      // when a transition exists, leaving every outside quad byte-for-byte.
      const weight = Math.min(...incident.map(cellWeight));
      if (locked) lockedVertices++;
      if (degrees[id] === 1) endpointVertices++;
      if (degrees[id] > 2) ambiguousVertices++;
      if (boundary) boundaryVertices++;
      if (degrees[id] === 2 && !boundary && !locked && weight > 0) { eligible.push(id); weights[id] = weight; }
    }
    await pause('确认连续岸线与保守固定的交点', end, vertexTotal);
  }
  async function diagnostics(blocks: ReadonlyMap<BlockKey, AtlasBlock>) {
    const data = { ...base, blocks }; let length = 0, energy = 0;
    for (let start = 0; start < edges.length; start += batch) {
      const end = Math.min(edges.length, start + batch);
      for (let index = start; index < end; index++) {
        const [a, b] = edgeVertexIds(spec, edges[index]), p = getVertexPositionQ(data, a), q = getVertexPositionQ(data, b);
        length += Math.hypot(p.xQ - q.xQ, p.yQ - q.yQ) / spec.coordinateScale;
      }
      await pause('测量实际岸线长度', end, edges.length);
    }
    for (let start = 0; start < coastVertices.length; start += batch) {
      const end = Math.min(coastVertices.length, start + batch);
      for (let index = start; index < end; index++) {
        const id = coastVertices[index]; if (degrees[id] !== 2) continue;
        const p = getVertexPositionQ(data, id), a = getVertexPositionQ(data, neighbors[id * 2]), b = getVertexPositionQ(data, neighbors[id * 2 + 1]);
        energy += (a.xQ + b.xQ - 2 * p.xQ) ** 2 + (a.yQ + b.yQ - 2 * p.yQ) ** 2;
      }
      await pause('测量实际岸线转折能量', end, coastVertices.length);
    }
    if (!Number.isFinite(length) || !Number.isSafeInteger(energy)) throw new Error('海岸几何测量超出安全范围。');
    return { length, energy };
  }
  const before = await diagnostics(base.blocks);
  let currentBlocks = new Map(base.blocks), iterationsApplied = 0, rejectedCandidates = 0;
  const stepDivisors: number[] = [];
  for (let iteration = 0; iteration < parameters.iterations; iteration++) {
    const previous = { ...base, blocks: currentBlocks };
    let stationary = false;
    // Nine complete candidates at most, including the full target. Failed
    // blocks never become the next round or escape into the returned candidate.
    for (let attempt = 0; attempt <= 8; attempt++) {
      const divisor = 2 ** attempt, proposedBlocks = new Map(currentBlocks), owned = new Map<BlockKey, GeometryBlock>(), affected = new Set<number>();
      let changedThisRound = 0;
      for (let start = 0; start < eligible.length; start += batch) {
        const end = Math.min(eligible.length, start + batch);
        for (let index = start; index < end; index++) {
          const id = eligible[index], p = getVertexPositionQ(previous, id), a = getVertexPositionQ(previous, neighbors[id * 2]), b = getVertexPositionQ(previous, neighbors[id * 2 + 1]);
          const creationX = id % (spec.columns + 1) * stepQ, creationY = Math.floor(id / (spec.columns + 1)) * stepQ;
          // strength/2000 is the requested midpoint relaxation weight
          // (0.05..0.5). Symmetric integer rounding does not depend on origin,
          // traversal or batch order. Backtracking halves the actual clamped
          // target displacement from this same old round, never a failed mesh.
          const offset = (value: number) => Math.sign(value) * Math.floor((Math.abs(value) * parameters.strengthPermille * weights[id] + 2000 * FIELD_Q) / (4000 * FIELD_Q));
          const targetX = Math.max(creationX - limitQ, Math.min(creationX + limitQ, p.xQ + offset(a.xQ + b.xQ - 2 * p.xQ)));
          const targetY = Math.max(creationY - limitQ, Math.min(creationY + limitQ, p.yQ + offset(a.yQ + b.yQ - 2 * p.yQ)));
          const scaled = (value: number) => Math.sign(value) * Math.floor((Math.abs(value) + divisor / 2) / divisor);
          const xQ = p.xQ + scaled(targetX - p.xQ), yQ = p.yQ + scaled(targetY - p.yQ);
          if (xQ === p.xQ && yQ === p.yQ) continue;
          validateVertexPositionQ(spec, id, xQ, yQ);
          const { key, slot } = vertexSlotLocation(spec, id), source = currentBlocks.get(key);
          if (!source || source.layer !== 'geometry' || source.vertexIds[slot] !== id) throw new Error('海岸共享顶点的唯一所有者不一致。');
          let block = owned.get(key);
          if (!block) { block = cloneBlock(source); owned.set(key, block); proposedBlocks.set(key, block); }
          block.xyQ[slot * 2] = xQ; block.xyQ[slot * 2 + 1] = yQ; changedThisRound++;
          for (const cell of incidentCellIds(spec, id)) affected.add(cell);
        }
        await pause(`海岸第${iteration + 1}轮同步平滑`, end, eligible.length);
      }
      if (!changedThisRound) { stationary = true; break; }
      const proposed = { manifest: base.manifest, blocks: proposedBlocks }, affectedCells = [...affected].sort((a, b) => a - b);
      let invalid = false, checkedCells = 0;
      // quadQ resolves every corner through its canonical block owner,
      // including across block boundaries. Structural/owner failures remain
      // hard errors; only actual geometric invalidity invokes backtracking.
      for (let start = 0; start < affectedCells.length; start += batch) {
        const end = Math.min(affectedCells.length, start + batch);
        for (let index = start; index < end; index++) {
          const points = quadQ(proposed, affectedCells[index]); checkedCells++;
          try { quadMeasure(points); } catch { invalid = true; break; }
        }
        await pause(`核验海岸第${iteration + 1}轮共享拓扑`, checkedCells, affectedCells.length);
        if (invalid) break;
      }
      if (invalid) {
        rejectedCandidates++;
        if (attempt === 8) throw new Error('海岸平滑在8次整轮缩步后仍不能保持严格凸拓扑；原图未改变。');
        await pause(`海岸第${iteration + 1}轮整体缩步`, attempt + 1, 8); continue;
      }
      currentBlocks = proposedBlocks; iterationsApplied++; stepDivisors.push(divisor); break;
    }
    if (stationary) break;
  }
  const blocks = new Map(base.blocks), changedKeys: BlockKey[] = [], changedVertices: number[] = [], changedCells = new Set<number>();
  for (const { key } of base.manifest.blockRefs) {
    const source = base.blocks.get(key);
    if (!source) throw new Error('海岸平滑基线缺少受引用的地理块。');
    const next = currentBlocks.get(key);
    if (!next || next === source) continue;
    if (source.layer !== 'geometry' || next.layer !== 'geometry') throw new Error('海岸平滑意外写入了非几何数据。');
    let changed = false;
    for (let slot = 0; slot < source.vertexIds.length; slot++) {
      if (source.vertexIds[slot] !== next.vertexIds[slot]) throw new Error('海岸平滑改变了稳定顶点ID。');
      if (source.xyQ[slot * 2] === next.xyQ[slot * 2] && source.xyQ[slot * 2 + 1] === next.xyQ[slot * 2 + 1]) continue;
      const id = source.vertexIds[slot]; changed = true; changedVertices.push(id);
      if (!weights[id] || incidentCellIds(spec, id).some(cell => cellWeight(cell) === 0 || coastLocked[cell])) throw new Error('海岸平滑改变了范围边界外或受保护的共享顶点。');
      for (const cell of incidentCellIds(spec, id)) changedCells.add(cell);
    }
    if (changed) { blocks.set(key, next); changedKeys.push(key); }
    await pause('保留实际改变的私有海岸几何块', changedKeys.length, currentBlocks.size / 4);
  }
  assertAtlasLocksPreserved(base, { ...base, blocks }, changedCells, changedVertices);
  const final = await measureGeography({ ...base, blocks }, control, '独立核验平滑后的真实几何与面积');
  const seen = new Uint8Array(total), queue = new Uint32Array(total);
  let landAreaQ2 = 0, majorComponentCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000, visited = 0;
  for (let first = 0; first < total; first++) {
    const value = final.elevation[first];
    if (value !== original.elevation[first]) throw new Error('海岸平滑改变了真实高程或海陆分类。');
    minElevationMeters = Math.min(minElevationMeters, value); maxElevationMeters = Math.max(maxElevationMeters, value);
    if (value >= 0) landAreaQ2 += final.areaQ2[first];
    if (value >= 0 && !seen[first]) {
      majorComponentCount++; let head = 0, tail = 1; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++]; visited++;
        for (const next of cellNeighbors(spec, id)) if (!seen[next] && final.elevation[next] >= 0) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await pause('独立遍历平滑后陆地的共享边连通', visited, total);
      }
    }
    if ((first + 1) % batch === 0 || first + 1 === total) await pause('核对海岸未改变的真实高程', first + 1, total);
  }
  if (!Number.isSafeInteger(landAreaQ2) || final.worldAreaQ2 !== original.worldAreaQ2) throw new Error('海岸平滑改变了固定世界面积或使陆地面积无效。');
  const after = await diagnostics(blocks);
  control?.signal?.throwIfAborted();
  return { blocks, changedKeys, summary: { changedCellCount: changedCells.size, landAreaQ2, worldAreaQ2: final.worldAreaQ2, majorComponentCount,
    minElevationMeters, maxElevationMeters, changedVertexCount: changedVertices.length, coastlineEdges: edges.length, eligibleVertices: eligible.length,
    lockedVertices, endpointVertices, ambiguousVertices, boundaryVertices, iterationsApplied, rejectedCandidates },
  diagnostics: { coastlineLengthBeforeWorld: before.length, coastlineLengthAfterWorld: after.length, turnEnergyBeforeQ2: before.energy, turnEnergyAfterQ2: after.energy, stepDivisors } };
}
