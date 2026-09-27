import { validateCellRectangle, type AtlasCellRectangle } from '../world/generation-contract';
import type { AtlasGridSpec } from '../world/model';

function validCell(id: number, spec: AtlasGridSpec) {
  if (!Number.isInteger(id) || id < 0 || id >= spec.columns * spec.rows) throw new Error('保护范围需要当前地图内的地块。');
}
/** A lock can protect sea as well as land. A single cell is a valid range. */
export function protectionRectangle(first: number, second: number, spec: AtlasGridSpec): AtlasCellRectangle {
  validCell(first, spec); validCell(second, spec);
  const ax = first % spec.columns, ay = Math.floor(first / spec.columns), bx = second % spec.columns, by = Math.floor(second / spec.columns);
  return { column: Math.min(ax, bx), row: Math.min(ay, by), columns: Math.abs(ax - bx) + 1, rows: Math.abs(ay - by) + 1 };
}
export function protectionSelectionStep(anchor: number | null, id: number, spec: AtlasGridSpec) {
  validCell(id, spec);
  return anchor === null ? { kind: 'anchor' as const, anchor: id } : { kind: 'complete' as const, rectangle: protectionRectangle(anchor, id, spec) };
}
/** UI validation does not replace the Worker's private candidate validation. */
export function makeProtectionRequest(rectangle: AtlasCellRectangle, mask: number, action: string, spec: AtlasGridSpec) {
  if (!validateCellRectangle(rectangle, spec)) throw new Error('保护范围越界或尺寸无效，请调整后再预览。');
  if (mask !== 1 && mask !== 2 && mask !== 3 || action !== 'set' && action !== 'clear') throw new Error('请选择有效的保护内容和锁定操作。');
  return { rectangle: { ...rectangle }, mask, action } as { rectangle: AtlasCellRectangle; mask: 1 | 2 | 3; action: 'set' | 'clear' };
}
