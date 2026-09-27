import { preflightHydrologyReceivers, RECEIVER_STATUS, RECEIVER_TERMINAL,
  type HydrologyBoundaryCore, type HydrologyBoundarySource, type HydrologyPageReceivers } from './hydrology-boundary';
import { NO_WATER } from './hydrology-kernel';

/** Displayed nodes only; never permission to shortcut an unvisited receiver. */
export const HYDROLOGY_RECEIVER_PATH_LIMIT = 4096;
export interface HydrologyReceiverPathNode {
  nodeId: number; xQ: number; yQ: number; groundMeters: number;
  /** Counts of owned samples, not rainfall, water volume or discharge. */
  contributingSamples: number; contributingSamplesIncomplete: boolean;
}
export type HydrologyReceiverPathTerminal =
  | { kind: 'coast'; nodeId: number; coastPointQ: { xQ: number; yQ: number } }
  | { kind: 'depression'; nodeId: number }
  | { kind: 'unresolved'; nodeId: number; reason: 'external-land'; boundaryTargetNodeId: number }
  | { kind: 'unresolved'; nodeId: number; reason: 'world-boundary'; boundaryTargetNodeId: null }
  | { kind: 'excluded'; nodeId: number }
  | { kind: 'truncated'; nodeId: number; nextNodeId: number };
export interface HydrologyReceiverPath {
  format: 'lieguoji-hydrology-receiver-path'; version: 1; algorithm: 'fine-two-page-receivers-v1';
  /** The receiver's exact four-field binding. Does not invent atlas/lock proof. */
  source: HydrologyBoundarySource; cores: HydrologyBoundaryCore[]; stepQ: 512; sourceNodeId: number;
  /** Excluded negative-coverage selections return no drawable path. */
  path: HydrologyReceiverPathNode[]; terminal: HydrologyReceiverPathTerminal;
  /** Last represented node's actual flag, independent of unresolved/truncated. */
  contributingSamplesIncomplete: boolean;
}
const WORLD = 2049, STEP_Q = 512;
const validId = (id: number) => Number.isSafeInteger(id) && id >= 0 && id < WORLD * WORLD;
const adjacent = (a: number, b: number) => Math.abs(a % WORLD - b % WORLD) + Math.abs(Math.floor(a / WORLD) - Math.floor(b / WORLD)) === 1;

/** Internal synchronous projection of the real, privately computed receiver.
 * It validates the accessed chain, not unvisited terrain or source authenticity.
 * No await/callback, sampling, routing, public message ingress or mutation. A
 * future caller must retain its Owned session/head lease around this function. */
export function projectHydrologyReceiverPath(result: HydrologyPageReceivers, sourceNodeId: number): HydrologyReceiverPath {
  if (result.format !== 'lieguoji-hydrology-page-receivers' || result.version !== 1 || result.algorithm !== 'fine-two-page-receivers-v1'
    || result.stepQ !== STEP_Q || !validId(sourceNodeId)) throw new Error('接收路径算法、步长或世界起点无效。');
  const source = result.source;
  if (typeof source.draftId !== 'string' || source.draftId.length < 1 || source.draftId.length > 200 || !Number.isSafeInteger(source.revision) || source.revision < 0
    || !/^[a-f0-9]{64}$/.test(source.manifestDigest) || !/^[a-f0-9]{64}$/.test(source.rootDigest)) throw new Error('接收路径来源绑定无效。');
  const plan = preflightHydrologyReceivers(result.cores), cores = plan.pages.map(page => page.core), n = plan.coreNodes;
  if (cores.some((core, i) => (['originColumn', 'originRow', 'columns', 'rows'] as const).some(key => core[key] !== result.cores[i][key]))) throw new Error('接收路径核心顺序不符合真实数组布局。');
  const arrays = [
    [result.nodeIds, Uint32Array], [result.coverageQ, Int16Array], [result.groundMeters, Int16Array],
    [result.receiverNodeIds, Int32Array], [result.terminalNodeIds, Uint32Array], [result.drainageStatus, Uint8Array],
    [result.contributingSamples, Uint32Array], [result.contributingSamplesIncomplete, Uint8Array],
    [result.lakeWaterSurfaceMeters, Int16Array], [result.coastXQ, Int32Array], [result.coastYQ, Int32Array], [result.boundaryTargetNodeIds, Int32Array],
  ] as const;
  if (arrays.some(([array, constructor]) => !(array instanceof constructor) || Object.getPrototypeOf(array) !== constructor.prototype || !(array.buffer instanceof ArrayBuffer) || array.length !== n)) throw new Error('接收路径数组类型或核心长度无效。');
  // Two arithmetic owner checks per lookup. No N-entry Map/world-sized array.
  const indexAt = (id: number) => {
    if (!validId(id)) return -1;
    const x = id % WORLD, y = Math.floor(id / WORLD); let offset = 0;
    for (const core of cores) {
      if (x >= core.originColumn && x < core.originColumn + core.columns && y >= core.originRow && y < core.originRow + core.rows)
        return offset + (y - core.originRow) * core.columns + x - core.originColumn;
      offset += core.columns * core.rows;
    }
    return -1;
  };
  const rowAt = (id: number) => {
    const index = indexAt(id);
    if (index < 0 || result.nodeIds[index] !== id) throw new Error('接收路径缺少对应的已拥有核心节点。');
    if (result.coverageQ[index] === -32768 || result.groundMeters[index] < -12000 || result.groundMeters[index] > 12000
      || result.coverageQ[index] < 0 && result.groundMeters[index] >= 0 || result.coverageQ[index] > 0 && result.groundMeters[index] < 0
      || result.coverageQ[index] === 0 && result.groundMeters[index] !== 0 || result.lakeWaterSurfaceMeters[index] !== NO_WATER
      || result.contributingSamples[index] > n || result.contributingSamplesIncomplete[index] > 1) throw new Error('接收路径高程、样本累计或完整性无效。');
    return index;
  };
  const start = rowAt(sourceNodeId), path: HydrologyReceiverPathNode[] = [], seen = new Set<number>();
  const finish = (terminal: HydrologyReceiverPathTerminal): HydrologyReceiverPath => ({
    format: 'lieguoji-hydrology-receiver-path', version: 1, algorithm: result.algorithm,
    source: { draftId: source.draftId, revision: source.revision, manifestDigest: source.manifestDigest, rootDigest: source.rootDigest },
    cores: cores.map(core => ({ ...core })), stepQ: STEP_Q, sourceNodeId, path, terminal,
    contributingSamplesIncomplete: path.at(-1)?.contributingSamplesIncomplete ?? false,
  });
  if (result.coverageQ[start] < 0) {
    if (result.receiverNodeIds[start] !== RECEIVER_TERMINAL.excluded || result.drainageStatus[start] !== RECEIVER_STATUS.excluded
      || result.contributingSamples[start] !== 0 || result.contributingSamplesIncomplete[start] !== 0 || result.coastXQ[start] !== -1 || result.coastYQ[start] !== -1 || result.boundaryTargetNodeIds[start] !== -1)
      throw new Error('排除海节点不能携带陆地路径或样本累计。');
    return finish({ kind: 'excluded', nodeId: sourceNodeId });
  }
  const drainage = result.drainageStatus[start], target = result.terminalNodeIds[start], terminalIndex = indexAt(target);
  if (![RECEIVER_STATUS.coast, RECEIVER_STATUS.depression, RECEIVER_STATUS.unresolved].some(value => value === drainage)
    || terminalIndex < 0 || result.nodeIds[terminalIndex] !== target) throw new Error('接收路径缺少核心内终点绑定。');
  let id = sourceNodeId;
  for (;;) {
    if (seen.has(id)) throw new Error('接收路径存在循环。');
    const index = rowAt(id), count = result.contributingSamples[index], incomplete = result.contributingSamplesIncomplete[index];
    if (result.coverageQ[index] < 0 || count < 1 || result.drainageStatus[index] !== drainage || result.terminalNodeIds[index] !== target) throw new Error('接收路径陆地、终点或样本累计断裂。');
    seen.add(id);
    path.push({ nodeId: id, xQ: id % WORLD * STEP_Q, yQ: Math.floor(id / WORLD) * STEP_Q, groundMeters: result.groundMeters[index], contributingSamples: count, contributingSamplesIncomplete: incomplete === 1 });
    const next = result.receiverNodeIds[index], cx = result.coastXQ[index], cy = result.coastYQ[index], witness = result.boundaryTargetNodeIds[index];
    if (next >= 0) {
      if (seen.has(next)) throw new Error('接收路径存在循环。');
      const nextIndex = rowAt(next);
      if (!adjacent(id, next) || result.coverageQ[nextIndex] < 0) throw new Error('接收路径跨越真实四邻接陆地。');
      if (result.groundMeters[nextIndex] > result.groundMeters[index]) throw new Error('接收路径不得逆坡。');
      if (result.contributingSamples[nextIndex] <= count || result.contributingSamplesIncomplete[nextIndex] < incomplete) throw new Error('接收路径样本累计或不完整标志不守恒。');
      if (result.drainageStatus[nextIndex] !== drainage || result.terminalNodeIds[nextIndex] !== target || cx !== -1 || cy !== -1 || witness !== -1) throw new Error('接收路径中间节点携带冲突终点。');
      if (path.length === HYDROLOGY_RECEIVER_PATH_LIMIT) return finish({ kind: 'truncated', nodeId: id, nextNodeId: next });
      id = next; continue;
    }
    if (id !== target) throw new Error('接收路径实际终点与绑定不一致。');
    if (next === RECEIVER_TERMINAL.coast) {
      const dx = cx - id % WORLD * STEP_Q, dy = cy - Math.floor(id / WORLD) * STEP_Q;
      if (drainage !== RECEIVER_STATUS.coast || witness !== -1 || cx < 0 || cy < 0 || cx > 4096 * 256 || cy > 4096 * 256
        || dx !== 0 && dy !== 0 || Math.abs(dx) >= STEP_Q || Math.abs(dy) >= STEP_Q
        || (result.coverageQ[index] === 0 ? dx !== 0 || dy !== 0 : dx === 0 && dy === 0)) throw new Error('岸口必须是实际终点相邻源边上的交点。');
      return finish({ kind: 'coast', nodeId: id, coastPointQ: { xQ: cx, yQ: cy } });
    }
    if (cx !== -1 || cy !== -1) throw new Error('非岸口终点不可带虚构海岸交点。');
    if (next === RECEIVER_TERMINAL.depression && drainage === RECEIVER_STATUS.depression && witness === -1) return finish({ kind: 'depression', nodeId: id });
    if (next === RECEIVER_TERMINAL.unresolved && drainage === RECEIVER_STATUS.unresolved) {
      if (witness >= 0) {
        if (!validId(witness) || !adjacent(id, witness) || indexAt(witness) >= 0) throw new Error('未解析路径的外部见证不是相邻核心外节点。');
        return finish({ kind: 'unresolved', nodeId: id, reason: 'external-land', boundaryTargetNodeId: witness });
      }
      const x = id % WORLD, y = Math.floor(id / WORLD);
      if (witness !== -1 || x !== 0 && y !== 0 && x !== WORLD - 1 && y !== WORLD - 1) throw new Error('世界边缘未解析终点没有真实边界。');
      return finish({ kind: 'unresolved', nodeId: id, reason: 'world-boundary', boundaryTargetNodeId: null });
    }
    throw new Error('接收路径终止标识无效。');
  }
}
