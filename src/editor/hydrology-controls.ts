import type { HydrologyTrace } from '../world/hydrology-trace';

/** Map coordinates, never coarse cell IDs. The fine lattice is independent of atlas size. */
export function hydrologyNodeAt(point: { x: number; y: number }): { column: number; row: number } {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 4096 || point.y > 4096) throw new Error('请选择地图内的位置。');
  return { column: Math.round(point.x / 2), row: Math.round(point.y / 2) };
}
export function hydrologyRectangle(node: { column: number; row: number }) {
  if (![node.column, node.row].every(n => Number.isInteger(n) && n >= 0 && n <= 2048)) throw new Error('流向起点无效。');
  return { originColumn: Math.max(0, Math.min(1537, node.column - 256)), originRow: Math.max(0, Math.min(1537, node.row - 256)), columns: 512, rows: 512 };
}
export function hydrologyDescription(trace: HydrologyTrace): string {
  const end = { ocean: '下游到达海岸。', depression: '下游汇入地形低洼处。', unresolved: '下游延伸到分析范围之外。', sea: '最近的地形采样点位于海中。', truncated: '这条路径较长，当前显示到分析上限。' }[trace.terminal];
  return end + (trace.partial ? '流域未被完整覆盖，不能据此判断整个流域。' : '') + (trace.terminal === 'depression' ? '低洼处不等于已经蓄水的湖泊。' : '');
}
