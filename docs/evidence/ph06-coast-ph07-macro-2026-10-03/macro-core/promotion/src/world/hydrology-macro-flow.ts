import type { HydrologyControl, HydrologyOptions } from './hydrology-kernel';
import { MACRO_FLOW, MACRO_GRID, MACRO_SEMANTICS, macroAdjacent, macroExact, macroInteger, macroWorldEdge, validateMacroGridShape, validateMacroRequest, validateMacroSource,
  validateMacroPreview, type HydrologyMacroGrid, type HydrologyMacroPreview, type HydrologyMacroRequest, type MacroBranchStop } from './hydrology-macro-contract';

const SEA = -1, DEPRESSION = -2, WORLD_EDGE = -3, UNASSIGNED = -4;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const set16 = Int16Array.prototype.set;
const neighbour = (id: number, direction: number) => {
  const x = id % 257 + DX[direction], y = Math.floor(id / 257) + DY[direction];
  return x < 0 || y < 0 || x >= 257 || y >= 257 ? -1 : y * 257 + x;
};

/** Whole-world fixed-stride preview. It neither excavates land nor fills
 * depressions. A sampled sea endpoint is only a coarse transition range. */
export async function buildMacroFlowPreview(input: HydrologyMacroGrid, rawRequest: HydrologyMacroRequest, control?: HydrologyControl, options: HydrologyOptions = {}): Promise<HydrologyMacroPreview> {
  const request = validateMacroRequest(rawRequest), n = MACRO_FLOW.nodes;
  if (!macroExact(input, ['format', 'version', 'grid', 'source', 'locks', 'coverageQ', 'groundMeters', 'stats', 'operation'])
    || input.format !== 'lieguoji-hydrology-macro-grid' || input.version !== 1) throw new Error('宏观汇流只接受独立宏观采样合同。');
  const source = validateMacroSource(input.source, request.expected); validateMacroGridShape(input.grid);
  if (!macroExact(input.locks, ['semantics', 'lockedCoarseCells', 'refs']) || input.locks.semantics !== 'read-preserve-geography-not-flow-barriers'
    || !macroInteger(input.locks.lockedCoarseCells, 0, 262144) || !Array.isArray(input.locks.refs)) throw new Error('宏观汇流缺少来源锁语义。');
  if (!(input.coverageQ instanceof Int16Array) || !(input.groundMeters instanceof Int16Array) || input.coverageQ.length !== n || input.groundMeters.length !== n
    || !(input.coverageQ.buffer instanceof ArrayBuffer) || !(input.groundMeters.buffer instanceof ArrayBuffer)) throw new Error('宏观汇流需要完整私有可复制整数采样。');
  if (!macroExact(input.stats, ['sampledNodes', 'explicitFineNodes', 'uniformLandNodes', 'implicitSeaNodes', 'baseSamplerPrepared', 'outputTypedArrayBytes', 'sourceCoarseCells'])
    || input.stats.sampledNodes !== n || ![input.stats.explicitFineNodes, input.stats.uniformLandNodes, input.stats.implicitSeaNodes].every(value => macroInteger(value, 0, n))
    || input.stats.explicitFineNodes + input.stats.uniformLandNodes + input.stats.implicitSeaNodes !== n || typeof input.stats.baseSamplerPrepared !== 'boolean'
    || input.stats.outputTypedArrayBytes !== n * 4 || !macroInteger(input.stats.sourceCoarseCells, 1, 262144)
    || !macroExact(input.operation, ['sequence', 'sampledNodes', 'maxPages', 'maxSampledNodes', 'baseSamplerPreparations'])
    || !macroInteger(input.operation.maxPages, 1, 64) || !macroInteger(input.operation.sequence, 1, input.operation.maxPages)
    || !macroInteger(input.operation.maxSampledNodes, n, 4194304) || !macroInteger(input.operation.sampledNodes, n, input.operation.maxSampledNodes)
    || !macroInteger(input.operation.baseSamplerPreparations, 0, 1)) throw new Error('宏观汇流采样覆盖或实际工作计数无效。');
  const batch = options.batch ?? 2048, maximumOperations = options.maximumOperations ?? n * MACRO_FLOW.maxOperationsPerNode;
  const typedArrayBytes = n * MACRO_FLOW.bytesPerNode, maximumBytes = options.maximumTypedArrayBytes ?? typedArrayBytes;
  if (!macroInteger(batch, 64, 8192) || !macroInteger(maximumOperations, 1, n * MACRO_FLOW.maxOperationsPerNode)
    || maximumBytes !== typedArrayBytes) throw new Error('宏观汇流工作或数组预算无效。');
  control?.signal?.throwIfAborted();
  // Intrinsic copies before any callback: input mutation never changes routing.
  const coverageQ = new Int16Array(n), groundMeters = new Int16Array(n);
  set16.call(coverageQ, input.coverageQ); set16.call(groundMeters, input.groundMeters);
  const lockedCoarseCells = input.locks.lockedCoarseCells;
  const receiver = new Int32Array(n).fill(UNASSIGNED), contributing = new Uint32Array(n), indegree = new Uint8Array(n), queue = new Uint32Array(n), order = new Uint32Array(n);
  let operations = 0, nextYield = 0, landNodes = 0;
  const work = () => { if (++operations > maximumOperations) throw new Error('宏观汇流超出操作预算。'); };
  const checkpoint = async (phase: string) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, operations, maximumOperations); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted(); nextYield = operations + batch;
  };
  await checkpoint('macro-capture');
  for (let id = 0; id < n; id++) {
    work(); const c = coverageQ[id], h = groundMeters[id];
    if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h > -1 || c === 0 && h !== 0) throw new Error('宏观采样海陆与高程矛盾。');
    if (c < 0) receiver[id] = SEA; else { landNodes++; contributing[id] = 1; }
    if (operations >= nextYield) await checkpoint('macro-validate');
  }
  for (let id = 0; id < n; id++) {
    work();
    if (coverageQ[id] >= 0) {
      let best = UNASSIGNED, bestHeight = groundMeters[id], bestKey = Infinity;
      for (let d = 0; d < 4; d++) {
        work(); const other = neighbour(id, d); if (other < 0) continue;
        const sea = coverageQ[other] < 0, height = sea ? 0 : groundMeters[other];
        if (!sea && height >= groundMeters[id]) continue;
        if (height < bestHeight || height === bestHeight && other < bestKey) { best = other; bestHeight = height; bestKey = other; }
      }
      receiver[id] = best;
    }
    if (operations >= nextYield) await checkpoint('macro-descent');
  }
  let head = 0, tail = 0;
  for (let id = 0; id < n; id++) { work(); if (coverageQ[id] >= 0 && receiver[id] >= 0) queue[tail++] = id; if (operations >= nextYield) await checkpoint('macro-flat-seeds'); }
  while (head < tail) {
    const id = queue[head++]; work();
    for (let d = 0; d < 4; d++) {
      work(); const other = neighbour(id, d);
      if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[id]) { receiver[other] = id; queue[tail++] = other; }
    }
    if (operations >= nextYield) await checkpoint('macro-flat-routing');
  }
  for (let root = 0; root < n; root++) {
    work();
    if (receiver[root] === UNASSIGNED) {
      head = 0; tail = 1; queue[0] = root; receiver[root] = DEPRESSION; let boundaryRoot = -1;
      while (head < tail) {
        const id = queue[head++]; work();
        if (macroWorldEdge(id) && (boundaryRoot < 0 || id < boundaryRoot)) boundaryRoot = id;
        for (let d = 0; d < 4; d++) {
          work(); const other = neighbour(id, d);
          if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[id]) { receiver[other] = id; queue[tail++] = other; }
        }
        if (operations >= nextYield) await checkpoint('macro-closed-flats');
      }
      if (boundaryRoot >= 0) {
        let id = boundaryRoot, previous = WORLD_EDGE;
        while (id >= 0) { work(); const next = receiver[id]; receiver[id] = previous; previous = id; id = next; if (operations >= nextYield) await checkpoint('macro-world-edge'); }
      }
    }
    if (operations >= nextYield) await checkpoint('macro-depressions');
  }
  for (let id = 0; id < n; id++) { work(); if (receiver[id] >= 0) indegree[receiver[id]]++; if (operations >= nextYield) await checkpoint('macro-indegree'); }
  head = 0; tail = 0;
  for (let id = 0; id < n; id++) { work(); if (indegree[id] === 0) queue[tail++] = id; if (operations >= nextYield) await checkpoint('macro-topological-seeds'); }
  let ordered = 0;
  while (head < tail) {
    const id = queue[head++], to = receiver[id]; work(); order[ordered++] = id;
    if (to >= 0) { contributing[to] += contributing[id]; if (--indegree[to] === 0) queue[tail++] = to; }
    if (operations >= nextYield) await checkpoint('macro-accumulation');
  }
  if (ordered !== n) throw new Error('宏观汇流接收森林存在环。');
  // queue is no longer needed for traversal; reuse it as terminal IDs so
  // display selection favours major catchments without another typed array.
  for (let position = n - 1; position >= 0; position--) {
    work(); const id = order[position], to = receiver[id]; queue[id] = to < 0 ? id : queue[to];
    if (operations >= nextYield) await checkpoint('macro-terminal-priority');
  }
  const candidates: number[] = [];
  for (let id = 0; id < n; id++) {
    work();
    if (coverageQ[id] >= 0 && contributing[id] >= request.minimumContributingSamples) {
      let upstreamVisible = false;
      for (let d = 0; d < 4; d++) {
        work(); const other = neighbour(id, d);
        if (other >= 0 && receiver[other] === id && contributing[other] >= request.minimumContributingSamples) upstreamVisible = true;
      }
      if (!upstreamVisible) candidates.push(id);
    }
    if (operations >= nextYield) await checkpoint('macro-branch-selection');
  }
  candidates.sort((a, b) => { work(); return contributing[queue[b]] - contributing[queue[a]] || contributing[b] - contributing[a] || a - b; });
  await checkpoint('macro-project');
  const nodes: HydrologyMacroPreview['nodes'] = { ids: [], coverageQ: [], groundMeters: [], contributingSamples: [] };
  const edges: HydrologyMacroPreview['edges'] = { from: [], to: [] }, branches: HydrologyMacroPreview['branches'] = [];
  const nodeSet = new Set<number>(), emitted = new Set<number>();
  const addNode = (id: number) => {
    if (nodeSet.has(id)) return; nodeSet.add(id); nodes.ids.push(id); nodes.coverageQ.push(coverageQ[id]); nodes.groundMeters.push(groundMeters[id]); nodes.contributingSamples.push(contributing[id]);
  };
  for (const sourceNode of candidates.slice(0, request.maxBranches)) {
    let id = sourceNode, stop: MacroBranchStop; addNode(id);
    for (;;) {
      work(); const to = receiver[id];
      if (to < 0) { stop = to === SEA ? 'sampled-sea' : to === DEPRESSION ? 'depression' : 'world-edge-unresolved'; break; }
      if (emitted.has(id)) { stop = 'joins-network'; break; }
      if (edges.from.length === request.maxEdges) { stop = 'display-limit'; break; }
      if (!macroAdjacent(id, to) || groundMeters[to] > groundMeters[id]) throw new Error('宏观投影不能跳跃或逆坡。');
      emitted.add(id); edges.from.push(id); edges.to.push(to); addNode(to); id = to;
      if (operations >= nextYield) await checkpoint('macro-project');
    }
    branches.push({ sourceNode, endNode: id, stop });
    if (operations >= nextYield) await checkpoint('macro-project');
  }
  await checkpoint('macro-publish');
  return validateMacroPreview({ format: 'lieguoji-hydrology-macro-preview', version: 1, algorithm: 'macro-four-neighbour-drainage-v1', source,
    grid: { ...MACRO_GRID }, semantics: { ...MACRO_SEMANTICS }, locks: { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells }, nodes, edges, branches,
    displayTruncated: candidates.length > branches.length || branches.some(branch => branch.stop === 'display-limit'),
    stats: { sampledNodes: 66049, landNodes, sampledSeaNodes: n - landNodes, eligibleBranches: candidates.length, displayedBranches: branches.length,
      displayedEdges: edges.from.length, operations, typedArrayBytes, maximumOperations },
  }, request);
}
