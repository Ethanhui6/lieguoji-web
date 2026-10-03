import type { HydrologySnapshot, HydrologySnapshotHead } from './hydrology-snapshot';

export const MACRO_FLOW = Object.freeze({ side: 257, nodes: 66049, stepWorld: 16, stepQ: 4096, fineNodeStride: 8,
  maxBranches: 64, maxEdges: 8192, maxPacketBytes: 512 * 1024 - 4096, packetEnvelopeReserveBytes: 4096, bytesPerNode: 21, maxOperationsPerNode: 96 });
export interface HydrologyMacroGrid {
  format: 'lieguoji-hydrology-macro-grid'; version: 1;
  grid: { columns: 257; rows: 257; stepWorld: 16; worldSize: 4096; coverage: 'complete-fixed-grid'; sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' };
  source: HydrologySnapshot['source']; locks: HydrologySnapshot['locks'];
  coverageQ: Int16Array; groundMeters: Int16Array;
  stats: HydrologySnapshot['stats'];
  operation: { sequence: number; sampledNodes: number; maxPages: number; maxSampledNodes: number; baseSamplerPreparations: 0 | 1 };
}
export interface HydrologyMacroRequest {
  expected: HydrologySnapshotHead;
  maxBranches: number; maxEdges: number; minimumContributingSamples: number;
}
export type MacroBranchStop = 'sampled-sea' | 'depression' | 'world-edge-unresolved' | 'joins-network' | 'display-limit';
export interface HydrologyMacroPreview {
  format: 'lieguoji-hydrology-macro-preview'; version: 1; algorithm: 'macro-four-neighbour-drainage-v1';
  source: HydrologySnapshot['source'];
  grid: HydrologyMacroGrid['grid'];
  semantics: { flow: 'sampled-terrain-preview-not-water-volume'; lowland: 'natural-depression-not-lake-water'; sea: 'sampled-sea-not-open-ocean';
    coast: 'macro-transition-edge-not-fine-coast-mouth'; edges: '16-world-may-cross-unsampled-microterrain'; landBoundary: 'unresolved' };
  locks: { semantics: HydrologySnapshot['locks']['semantics']; lockedCoarseCells: number };
  /** Plain dense arrays: the atlas packet serializes its header body as JSON. */
  nodes: { ids: number[]; coverageQ: number[]; groundMeters: number[]; contributingSamples: number[] };
  edges: { from: number[]; to: number[] };
  branches: { sourceNode: number; endNode: number; stop: MacroBranchStop }[];
  displayTruncated: boolean;
  stats: { sampledNodes: 66049; landNodes: number; sampledSeaNodes: number; eligibleBranches: number; displayedBranches: number; displayedEdges: number;
    operations: number; typedArrayBytes: number; maximumOperations: number };
}
export const MACRO_GRID: HydrologyMacroGrid['grid'] = Object.freeze({ columns: 257, rows: 257, stepWorld: 16, worldSize: 4096,
  coverage: 'complete-fixed-grid', sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' });
export const MACRO_SEMANTICS: HydrologyMacroPreview['semantics'] = Object.freeze({ flow: 'sampled-terrain-preview-not-water-volume',
  lowland: 'natural-depression-not-lake-water', sea: 'sampled-sea-not-open-ocean', coast: 'macro-transition-edge-not-fine-coast-mouth',
  edges: '16-world-may-cross-unsampled-microterrain', landBoundary: 'unresolved' });
const HEX = /^[a-f0-9]{64}$/;
export const macroInteger = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
export function macroExact(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every(key => {
    if (typeof key !== 'string' || !keys.includes(key)) return false;
    const d = Object.getOwnPropertyDescriptor(value, key)!; return d.enumerable && 'value' in d;
  });
}
const identifier = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const digest = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
export function macroHeadMatches(a: HydrologySnapshotHead, b: HydrologySnapshotHead): boolean {
  return a.draftId === b.draftId && a.revision === b.revision && a.manifestDigest === b.manifestDigest && a.rootDigest === b.rootDigest;
}
export function validateMacroRequest(value: unknown): HydrologyMacroRequest {
  if (!macroExact(value, ['expected', 'maxBranches', 'maxEdges', 'minimumContributingSamples'])
    || !macroExact(value.expected, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])
    || !identifier(value.expected.draftId) || !macroInteger(value.expected.revision, 0, Number.MAX_SAFE_INTEGER)
    || !digest(value.expected.manifestDigest) || !digest(value.expected.rootDigest)
    || !macroInteger(value.maxBranches, 1, MACRO_FLOW.maxBranches) || !macroInteger(value.maxEdges, 1, MACRO_FLOW.maxEdges)
    || !macroInteger(value.minimumContributingSamples, 1, MACRO_FLOW.nodes)) throw new Error('宏观汇流请求身份或显示预算无效。');
  return { expected: { ...value.expected } as unknown as HydrologySnapshotHead, maxBranches: value.maxBranches, maxEdges: value.maxEdges, minimumContributingSamples: value.minimumContributingSamples };
}
export function validateMacroSource(value: unknown, expected: HydrologySnapshotHead): HydrologySnapshot['source'] {
  if (!macroExact(value, ['version', 'atlasId', 'draftId', 'revision', 'manifestDigest', 'rootDigest', 'lockSetDigest', 'rootBinding'])
    || value.version !== 4 || value.rootBinding !== 'current-owned-session-head' || !identifier(value.atlasId) || !digest(value.lockSetDigest)
    || !macroHeadMatches(value as unknown as HydrologySnapshotHead, expected)) throw new Error('宏观汇流来源身份或锁摘要无效。');
  return { ...value } as unknown as HydrologySnapshot['source'];
}
export function validateMacroGridShape(value: unknown): HydrologyMacroGrid['grid'] {
  if (!macroExact(value, Object.keys(MACRO_GRID)) || Object.entries(MACRO_GRID).some(([key, v]) => value[key] !== v)) throw new Error('宏观汇流必须覆盖完整 257×257、16-world 固定采样网。');
  return { ...MACRO_GRID };
}
function numbers(value: unknown, maximum: number, min: number, max: number): number[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('宏观汇流结果数组无效。');
  const result: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !('value' in d) || !macroInteger(d.value, min, max)) throw new Error('宏观汇流结果数组不能稀疏或含访问器。');
    result.push(d.value);
  }
  return result;
}
export const macroAdjacent = (a: number, b: number) => Math.abs(a % 257 - b % 257) + Math.abs(Math.floor(a / 257) - Math.floor(b / 257)) === 1;
export const macroWorldEdge = (id: number) => id < 257 || id >= 66049 - 257 || id % 257 === 0 || id % 257 === 256;
export function macroPacketBytes(preview: HydrologyMacroPreview): number { return new TextEncoder().encode(JSON.stringify(preview)).byteLength; }

/** Structural/identity validation for a display packet. Actual terrain authority
 * remains the owned-reader/kernel path, not claims inside a public packet. */
export function validateMacroPreview(raw: unknown, input: HydrologyMacroRequest): HydrologyMacroPreview {
  const request = validateMacroRequest(input);
  if (!macroExact(raw, ['format', 'version', 'algorithm', 'source', 'grid', 'semantics', 'locks', 'nodes', 'edges', 'branches', 'displayTruncated', 'stats'])
    || raw.format !== 'lieguoji-hydrology-macro-preview' || raw.version !== 1 || raw.algorithm !== 'macro-four-neighbour-drainage-v1'
    || !macroExact(raw.semantics, Object.keys(MACRO_SEMANTICS)) || Object.entries(MACRO_SEMANTICS).some(([k, v]) => (raw.semantics as Record<string, unknown>)[k] !== v)
    || !macroExact(raw.locks, ['semantics', 'lockedCoarseCells']) || raw.locks.semantics !== 'read-preserve-geography-not-flow-barriers'
    || !macroInteger(raw.locks.lockedCoarseCells, 0, 262144) || !macroExact(raw.nodes, ['ids', 'coverageQ', 'groundMeters', 'contributingSamples'])
    || !macroExact(raw.edges, ['from', 'to']) || typeof raw.displayTruncated !== 'boolean'
    || !macroExact(raw.stats, ['sampledNodes', 'landNodes', 'sampledSeaNodes', 'eligibleBranches', 'displayedBranches', 'displayedEdges', 'operations', 'typedArrayBytes', 'maximumOperations'])) throw new Error('宏观汇流结果合同无效。');
  const source = validateMacroSource(raw.source, request.expected), grid = validateMacroGridShape(raw.grid), maxNodes = request.maxEdges + request.maxBranches;
  const nodes = { ids: numbers(raw.nodes.ids, maxNodes, 0, MACRO_FLOW.nodes - 1), coverageQ: numbers(raw.nodes.coverageQ, maxNodes, -32767, 32767),
    groundMeters: numbers(raw.nodes.groundMeters, maxNodes, -12000, 12000), contributingSamples: numbers(raw.nodes.contributingSamples, maxNodes, 0, MACRO_FLOW.nodes) };
  if ([nodes.coverageQ, nodes.groundMeters, nodes.contributingSamples].some(values => values.length !== nodes.ids.length)) throw new Error('宏观汇流节点字段长度不一致。');
  const slots = new Map<number, number>();
  for (let i = 0; i < nodes.ids.length; i++) {
    const id = nodes.ids[i], c = nodes.coverageQ[i], h = nodes.groundMeters[i];
    if (slots.has(id) || c > 0 && h < 0 || c < 0 && h > -1 || c === 0 && h !== 0 || c >= 0 && nodes.contributingSamples[i] < 1) throw new Error('宏观汇流节点重复或真实地形字段矛盾。');
    slots.set(id, i);
  }
  const edges = { from: numbers(raw.edges.from, request.maxEdges, 0, MACRO_FLOW.nodes - 1), to: numbers(raw.edges.to, request.maxEdges, 0, MACRO_FLOW.nodes - 1) };
  if (edges.from.length !== edges.to.length) throw new Error('宏观汇流边长度不一致。');
  const receiver = new Map<number, number>(), visibleIncoming = new Map<number, number>();
  for (let i = 0; i < edges.from.length; i++) {
    const a = edges.from[i], b = edges.to[i], sa = slots.get(a), sb = slots.get(b);
    if (sa === undefined || sb === undefined || receiver.has(a) || !macroAdjacent(a, b) || nodes.coverageQ[sa] < 0
      || nodes.groundMeters[sb] > nodes.groundMeters[sa] || nodes.contributingSamples[sb] < nodes.contributingSamples[sa]
      || nodes.coverageQ[sb] >= 0 && nodes.contributingSamples[sb] <= nodes.contributingSamples[sa]) throw new Error('宏观汇流边重复、跳跃、逆坡或汇流计数矛盾。');
    receiver.set(a, b);
    visibleIncoming.set(b, (visibleIncoming.get(b) ?? 0) + nodes.contributingSamples[sa]);
  }
  for (const [id, total] of visibleIncoming) {
    const slot = slots.get(id)!;
    // Unshown tributaries may contribute more; visible upstream samples must
    // still fit, plus this node's own sample on land and none on sampled sea.
    if (nodes.contributingSamples[slot] < total + (nodes.coverageQ[slot] >= 0 ? 1 : 0)) throw new Error('宏观汇流汇合处可见上游样本数不守恒。');
  }
  if (!Array.isArray(raw.branches) || Object.getPrototypeOf(raw.branches) !== Array.prototype || raw.branches.length > request.maxBranches || Reflect.ownKeys(raw.branches).length !== raw.branches.length + 1) throw new Error('宏观汇流分支预算无效。');
  const branches: HydrologyMacroPreview['branches'] = [], branchSources = new Set<number>(), reachedEdges = new Set<number>();
  let limitStops = 0;
  for (let i = 0; i < raw.branches.length; i++) {
    const d = Object.getOwnPropertyDescriptor(raw.branches, String(i)), b: unknown = d && 'value' in d ? d.value : undefined;
    if (!d?.enumerable || !macroExact(b, ['sourceNode', 'endNode', 'stop']) || !macroInteger(b.sourceNode, 0, MACRO_FLOW.nodes - 1)
      || !macroInteger(b.endNode, 0, MACRO_FLOW.nodes - 1) || !['sampled-sea', 'depression', 'world-edge-unresolved', 'joins-network', 'display-limit'].includes(b.stop as string)
      || !slots.has(b.sourceNode) || !slots.has(b.endNode) || branchSources.has(b.sourceNode)) throw new Error('宏观汇流分支身份无效。');
    branchSources.add(b.sourceNode);
    if (nodes.coverageQ[slots.get(b.sourceNode)!] < 0 || nodes.contributingSamples[slots.get(b.sourceNode)!] < request.minimumContributingSamples) throw new Error('宏观汇流分支必须从达阈值的陆地样本开始。');
    let id = b.sourceNode, steps = 0;
    while (id !== b.endNode) {
      if (++steps > edges.from.length || !receiver.has(id)) throw new Error('宏观汇流分支不连续或存在环。');
      reachedEdges.add(id); id = receiver.get(id)!;
    }
    const end = slots.get(id)!;
    if (b.stop === 'joins-network') { if (!reachedEdges.has(id) && !branches.some(other => other.endNode === id)) throw new Error('汇合终点必须属于已显示下游。'); }
    else if (receiver.has(id)) throw new Error('宏观汇流终点不能仍携带未声明下游。');
    if (b.stop === 'sampled-sea' && nodes.coverageQ[end] >= 0 || b.stop !== 'sampled-sea' && b.stop !== 'joins-network' && nodes.coverageQ[end] < 0
      || b.stop === 'world-edge-unresolved' && !macroWorldEdge(id) || b.stop === 'depression' && macroWorldEdge(id)) throw new Error('宏观汇流终点原因与范围或海陆矛盾。');
    if (b.stop === 'display-limit') limitStops++;
    branches.push({ sourceNode: b.sourceNode, endNode: b.endNode, stop: b.stop as MacroBranchStop });
  }
  if (reachedEdges.size !== edges.from.length) throw new Error('宏观汇流有不属于任何分支的多余边。');
  const usedNodes = new Set([...edges.from, ...edges.to, ...branches.flatMap(branch => [branch.sourceNode, branch.endNode])]);
  if (usedNodes.size !== nodes.ids.length) throw new Error('宏观汇流有不属于显示网络的多余节点。');
  const s = raw.stats;
  if (s.sampledNodes !== MACRO_FLOW.nodes || !macroInteger(s.landNodes, 0, MACRO_FLOW.nodes) || s.sampledSeaNodes !== MACRO_FLOW.nodes - s.landNodes
    || !macroInteger(s.eligibleBranches, branches.length, s.landNodes) || s.displayedBranches !== branches.length || s.displayedEdges !== edges.from.length
    || !macroInteger(s.maximumOperations, 1, MACRO_FLOW.nodes * MACRO_FLOW.maxOperationsPerNode)
    || !macroInteger(s.operations, 1, s.maximumOperations) || s.typedArrayBytes !== MACRO_FLOW.nodes * MACRO_FLOW.bytesPerNode
    || raw.displayTruncated !== (s.eligibleBranches > branches.length || limitStops > 0)
    || limitStops > 0 && edges.from.length !== request.maxEdges) throw new Error('宏观汇流计数、完整性或工作预算声明无效。');
  const preview: HydrologyMacroPreview = { format: 'lieguoji-hydrology-macro-preview', version: 1, algorithm: 'macro-four-neighbour-drainage-v1', source, grid,
    semantics: { ...MACRO_SEMANTICS }, locks: { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells: raw.locks.lockedCoarseCells }, nodes, edges, branches,
    displayTruncated: raw.displayTruncated, stats: { ...s } as unknown as HydrologyMacroPreview['stats'] };
  if (macroPacketBytes(preview) > MACRO_FLOW.maxPacketBytes) throw new Error('宏观汇流 JSON 正文超过 508 KiB，需为外层包预留 4 KiB。');
  return preview;
}
