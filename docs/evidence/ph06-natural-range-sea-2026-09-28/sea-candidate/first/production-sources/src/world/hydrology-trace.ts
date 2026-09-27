import type { HydrologyResult } from './hydrology-kernel';
import type { HydrologyNodeRectangle, HydrologySnapshotHead, HydrologySnapshot } from './hydrology-snapshot';

/** A display budget, never a shortcut across unvisited terrain. */
export const HYDROLOGY_TRACE_LIMIT = 4096;
export interface HydrologyTraceNode { column: number; row: number }
export interface HydrologyTraceRequest {
  expected: HydrologySnapshotHead;
  rectangle: HydrologyNodeRectangle;
  sourceNode: HydrologyTraceNode;
}
export interface HydrologyTrace {
  format: 'lieguoji-hydrology-trace'; version: 1; algorithm: 'fine-drainage-v1';
  source: HydrologySnapshot['source'];
  rectangle: HydrologyNodeRectangle; sourceNode: HydrologyTraceNode;
  path: HydrologyTraceNode[];
  coastPointQ: { xQ: number; yQ: number } | null;
  terminal: 'ocean' | 'depression' | 'unresolved' | 'sea' | 'truncated';
  /** True when upstream evidence is incomplete, or this displayed path stops early. */
  partial: boolean;
  /** Counts of represented fine samples, not area, precipitation or discharge. */
  contributingSamples: number; terminalContributingSamples: number;
}
const HEX = /^[a-f0-9]{64}$/;
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every(key => {
    if (typeof key !== 'string' || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return descriptor.enumerable && 'value' in descriptor;
  });
}
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const hash = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);
const sameNode = (a: HydrologyTraceNode, b: HydrologyTraceNode) => a.column === b.column && a.row === b.row;
const nodeIn = (value: unknown, r: HydrologyNodeRectangle): value is HydrologyTraceNode => exact(value, ['column', 'row'])
  && integer(value.column, r.originColumn, r.originColumn + r.columns - 1) && integer(value.row, r.originRow, r.originRow + r.rows - 1);
export function hydrologyHeadMatches(a: HydrologySnapshotHead, b: HydrologySnapshotHead): boolean {
  return a.draftId === b.draftId && a.revision === b.revision && a.manifestDigest === b.manifestDigest && a.rootDigest === b.rootDigest;
}
/** Strict public request ingestion. Getters, aliases and future fields do not become authority. */
export function validateHydrologyTraceRequest(raw: unknown): HydrologyTraceRequest {
  if (!exact(raw, ['expected', 'rectangle', 'sourceNode']) || !exact(raw.expected, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])
    || !identifier(raw.expected.draftId) || !integer(raw.expected.revision, 0, Number.MAX_SAFE_INTEGER) || !hash(raw.expected.manifestDigest) || !hash(raw.expected.rootDigest)
    || !exact(raw.rectangle, ['originColumn', 'originRow', 'columns', 'rows'])) throw new Error('水文请求身份或范围格式无效。');
  const r = raw.rectangle;
  if (!integer(r.columns, 2, 512) || !integer(r.rows, 2, 512) || !integer(r.originColumn, 0, 2049 - r.columns) || !integer(r.originRow, 0, 2049 - r.rows)) throw new Error('水文范围须为世界内 2–512 个细节点。');
  const rectangle = r as unknown as HydrologyNodeRectangle;
  if (!nodeIn(raw.sourceNode, rectangle)) throw new Error('水文起点不在分析范围内。');
  return { expected: { ...raw.expected } as unknown as HydrologySnapshotHead, rectangle: { ...rectangle }, sourceNode: { ...raw.sourceNode } };
}
/** Validate an untrusted bounded result before the bridge exposes it to display. */
export function validateHydrologyTrace(raw: unknown, input: HydrologyTraceRequest): HydrologyTrace {
  const request = validateHydrologyTraceRequest(input), r = request.rectangle, n = r.columns * r.rows;
  if (!exact(raw, ['format', 'version', 'algorithm', 'source', 'rectangle', 'sourceNode', 'path', 'coastPointQ', 'terminal', 'partial', 'contributingSamples', 'terminalContributingSamples'])
    || raw.format !== 'lieguoji-hydrology-trace' || raw.version !== 1 || raw.algorithm !== 'fine-drainage-v1'
    || !exact(raw.source, ['version', 'atlasId', 'draftId', 'revision', 'manifestDigest', 'rootDigest', 'lockSetDigest', 'rootBinding'])
    || raw.source.version !== 4 || raw.source.rootBinding !== 'current-owned-session-head' || !identifier(raw.source.atlasId) || !hash(raw.source.lockSetDigest)
    || !hydrologyHeadMatches(raw.source as unknown as HydrologySnapshotHead, request.expected)
    || !exact(raw.rectangle, ['originColumn', 'originRow', 'columns', 'rows']) || raw.rectangle.originColumn !== r.originColumn || raw.rectangle.originRow !== r.originRow || raw.rectangle.columns !== r.columns || raw.rectangle.rows !== r.rows
    || !nodeIn(raw.sourceNode, r) || !sameNode(raw.sourceNode, request.sourceNode)
    || !Array.isArray(raw.path) || Object.getPrototypeOf(raw.path) !== Array.prototype || raw.path.length < 1 || raw.path.length > HYDROLOGY_TRACE_LIMIT || Reflect.ownKeys(raw.path).length !== raw.path.length + 1
    || !['ocean', 'depression', 'unresolved', 'sea', 'truncated'].includes(raw.terminal as string) || typeof raw.partial !== 'boolean'
    || !integer(raw.contributingSamples, 0, n) || !integer(raw.terminalContributingSamples, 0, n)) throw new Error('水文结果格式、身份或预算无效。');
  const path: HydrologyTraceNode[] = [], seen = new Set<number>();
  for (let i = 0; i < raw.path.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw.path, String(i));
    if (!descriptor?.enumerable || !('value' in descriptor) || !nodeIn(descriptor.value, r)) throw new Error('水文路径节点无效。');
    const node = descriptor.value, previous = path.at(-1), key = node.row * 2049 + node.column;
    if (seen.has(key) || previous && Math.abs(previous.column - node.column) + Math.abs(previous.row - node.row) !== 1) throw new Error('水文路径重复或跨越真实细边。');
    seen.add(key); path.push({ ...node });
  }
  if (!sameNode(path[0], request.sourceNode)) throw new Error('水文路径没有从请求起点开始。');
  const last = path.at(-1)!;
  if (raw.terminal === 'sea') {
    if (path.length !== 1 || raw.contributingSamples !== 0 || raw.terminalContributingSamples !== 0 || raw.partial) throw new Error('海面不能伪装为陆地汇水路径。');
  } else if (raw.contributingSamples < 1 || raw.terminalContributingSamples < raw.contributingSamples + path.length - 1) throw new Error('水文路径汇水样本数量不守恒。');
  if (raw.terminal === 'truncated' && (path.length !== HYDROLOGY_TRACE_LIMIT || !raw.partial)
    || raw.terminal === 'unresolved' && (!raw.partial || last.column !== r.originColumn && last.column !== r.originColumn + r.columns - 1 && last.row !== r.originRow && last.row !== r.originRow + r.rows - 1)) throw new Error('水文截断或未解析终点标记无效。');
  let coastPointQ: HydrologyTrace['coastPointQ'] = null;
  if (raw.terminal === 'ocean') {
    if (!exact(raw.coastPointQ, ['xQ', 'yQ']) || !integer(raw.coastPointQ.xQ, r.originColumn * 512, (r.originColumn + r.columns - 1) * 512)
      || !integer(raw.coastPointQ.yQ, r.originRow * 512, (r.originRow + r.rows - 1) * 512)) throw new Error('入海路径缺少范围内真实海岸交点。');
    const dx = raw.coastPointQ.xQ - last.column * 512, dy = raw.coastPointQ.yQ - last.row * 512;
    // Non-zero land terminals cross only cardinal edges; a zero terminal may
    // lie exactly at a diagonal source-edge endpoint, hence the zero vector.
    if (dx && dy || Math.abs(dx) >= 512 || Math.abs(dy) >= 512) throw new Error('海岸交点跨越了真实相邻源边。');
    coastPointQ = { xQ: raw.coastPointQ.xQ, yQ: raw.coastPointQ.yQ };
  } else if (raw.coastPointQ !== null) throw new Error('非入海终点不能携带虚构海岸交点。');
  return { format: 'lieguoji-hydrology-trace', version: 1, algorithm: 'fine-drainage-v1', source: { ...raw.source } as unknown as HydrologyTrace['source'], rectangle: { ...r }, sourceNode: { ...request.sourceNode },
    path, coastPointQ, terminal: raw.terminal as HydrologyTrace['terminal'], partial: raw.partial, contributingSamples: raw.contributingSamples, terminalContributingSamples: raw.terminalContributingSamples };
}

/** Receives the privately computed kernel result, never a renderer approximation. */
export function buildHydrologyTrace(result: HydrologyResult, source: HydrologyTrace['source'], input: HydrologyTraceRequest): HydrologyTrace {
  const request = validateHydrologyTraceRequest(input), r = request.rectangle, n = r.columns * r.rows;
  if (result.columns !== r.columns || result.rows !== r.rows || result.originColumn !== r.originColumn || result.originRow !== r.originRow || result.stepQ !== 512
    || [result.receiver, result.basinId, result.coverageQ, result.groundMeters, result.contributingSamples].some(values => values.length !== n)) throw new Error('水文内核输出范围不符。');
  let id = (request.sourceNode.row - r.originRow) * r.columns + request.sourceNode.column - r.originColumn;
  const sourceId = id, path: HydrologyTraceNode[] = [], seen = new Set<number>();
  let terminal: HydrologyTrace['terminal'] = 'truncated', coastPointQ: HydrologyTrace['coastPointQ'] = null, partial = false;
  const basin = result.basinId[id];
  if (result.coverageQ[id] >= 0 && (basin < 0 || basin >= result.basins.terminalNode.length)) throw new Error('水文陆地缺少真实汇水盆地。');
  if (basin >= 0) partial = result.basins.partial[basin] === 1;
  for (;;) {
    if (seen.has(id)) throw new Error('水文路径出现循环。');
    seen.add(id); path.push({ column: r.originColumn + id % r.columns, row: r.originRow + Math.floor(id / r.columns) });
    const receiver = result.receiver[id];
    if (receiver >= 0) {
      const dx = Math.abs(receiver % r.columns - id % r.columns), dy = Math.abs(Math.floor(receiver / r.columns) - Math.floor(id / r.columns));
      if (receiver >= n || dx + dy !== 1 || result.coverageQ[id] < 0 || result.coverageQ[receiver] < 0 || result.basinId[receiver] !== basin || result.groundMeters[receiver] > result.groundMeters[id]
        || result.contributingSamples[receiver] <= result.contributingSamples[id]) throw new Error('水文接收节点不是连续守恒的真实下游。');
      if (path.length === HYDROLOGY_TRACE_LIMIT) { partial = true; break; }
      id = receiver; continue;
    }
    if (receiver === -9 && result.coverageQ[id] < 0 && path.length === 1) { terminal = 'sea'; partial = false; }
    else {
      if (basin < 0 || result.basins.terminalNode[basin] !== id || result.coverageQ[id] < 0) throw new Error('水文终点与盆地不一致。');
      if (receiver >= -6 && receiver <= -1) { terminal = 'ocean'; coastPointQ = { xQ: result.basins.coastXQ[basin], yQ: result.basins.coastYQ[basin] }; }
      else if (receiver === -7) terminal = 'depression';
      else if (receiver === -8) { terminal = 'unresolved'; partial = true; }
      else throw new Error('未知水文终点。');
    }
    break;
  }
  return validateHydrologyTrace({ format: 'lieguoji-hydrology-trace', version: 1, algorithm: 'fine-drainage-v1', source, rectangle: r, sourceNode: request.sourceNode,
    path, coastPointQ, terminal, partial, contributingSamples: result.contributingSamples[sourceId], terminalContributingSamples: result.contributingSamples[id] }, request);
}
