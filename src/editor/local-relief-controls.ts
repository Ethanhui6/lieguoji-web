import { validateCellRectangle, validateGenerationScope, validateGenerationOperation, validateLocalDetailReliefRecipe, type AtlasCellRectangle, type GenerationScope, type LocalDetailReliefRecipe } from '../world/generation-contract';
import { LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT } from '../world/generation/fingerprint';
import type { AtlasGridSpec } from '../world/model';

export type LocalReliefScope = Extract<GenerationScope, { kind: 'cell-rectangle' }>;
export interface LocalReliefControls { seed: string; reliefMeters: number; rectangle: AtlasCellRectangle; transitionCells: number }
export type ReliefSurfacePick = { cellId: number; land: boolean } | null;
export const LOCAL_RELIEF_DEFAULT_TRANSITION = 2;
export function canStartLocalRelief(selected: number | null, surface: ReliefSurfacePick): boolean {
  return selected !== null && surface?.cellId === selected && surface.land;
}
function validCell(id: number, spec: AtlasGridSpec) {
  if (!Number.isInteger(id) || id < 0 || id >= spec.columns * spec.rows) throw new Error('所选位置不属于当前地图。');
}
export function localReliefRectangleFromCells(first: number, second: number, spec: AtlasGridSpec): AtlasCellRectangle {
  validCell(first, spec); validCell(second, spec);
  const ax = first % spec.columns, ay = Math.floor(first / spec.columns), bx = second % spec.columns, by = Math.floor(second / spec.columns);
  return { column: Math.min(ax, bx), row: Math.min(ay, by), columns: Math.abs(ax - bx) + 1, rows: Math.abs(ay - by) + 1 };
}
export function nearbyLocalReliefRectangle(id: number, spec: AtlasGridSpec): AtlasCellRectangle {
  validCell(id, spec);
  const columns = Math.min(16, spec.columns), rows = Math.min(16, spec.rows);
  return { column: Math.max(0, Math.min(spec.columns - columns, id % spec.columns - Math.floor(columns / 2))), row: Math.max(0, Math.min(spec.rows - rows, Math.floor(id / spec.columns) - Math.floor(rows / 2))), columns, rows };
}
export function localReliefScope(rectangle: AtlasCellRectangle, transitionCells: number, spec: AtlasGridSpec): LocalReliefScope | null {
  const scope: LocalReliefScope = { kind: 'cell-rectangle', ...rectangle, transitionCells };
  return validateCellRectangle(rectangle, spec) && transitionCells >= 1 && validateGenerationScope(scope, spec) ? scope : null;
}
export function localReliefSelectionStep(anchor: number | null, id: number, surface: ReliefSurfacePick, spec: AtlasGridSpec) {
  validCell(id, spec);
  if (anchor === null) return canStartLocalRelief(id, surface)
    ? { kind: 'anchor' as const, anchor: id }
    : { kind: 'rejected' as const, message: '请先点一处已有陆地，再选择对角位置。海面不会成为山地生成的起点。' };
  return { kind: 'complete' as const, rectangle: localReliefRectangleFromCells(anchor, id, spec) };
}
/** Friendly input feedback only. The Worker still validates the private base,
 * recipe, full scope, lock dependencies and actual candidate before confirmation. */
export function makeLocalReliefRecipe(seed: string, reliefMeters: number): LocalDetailReliefRecipe {
  const recipe: LocalDetailReliefRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'local-detail-relief', version: 1, fingerprint: LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT }, seed, parameters: { reliefMeters } };
  if (!validateLocalDetailReliefRecipe(recipe)) throw new Error('请填写地貌种子，并将山地起伏设为 200 至 6000 米的整数。');
  return recipe;
}
export function restoreLocalReliefControls(recipe: unknown, scope: unknown, spec: AtlasGridSpec): LocalReliefControls | null {
  if (!validateLocalDetailReliefRecipe(recipe, 'storage') || !validateGenerationOperation(recipe, scope, spec, 'storage') || !validateGenerationScope(scope, spec) || scope.kind !== 'cell-rectangle' || scope.transitionCells < 1) return null;
  return { seed: recipe.seed, reliefMeters: recipe.parameters.reliefMeters, rectangle: { column: scope.column, row: scope.row, columns: scope.columns, rows: scope.rows }, transitionCells: scope.transitionCells };
}
