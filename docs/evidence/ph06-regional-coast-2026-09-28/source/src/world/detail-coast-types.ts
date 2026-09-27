/** Independent, persisted fine geography. These contracts do not change any
 * atlas v1/v2/v3 semantics. An atlas format must explicitly opt into this field. */
export const DETAIL_COAST_WORLD = 4096;
export const DETAIL_COAST_SCALE = 256;
export const DETAIL_COAST_STEP = 2;
export const DETAIL_COAST_STEP_Q = 512;
export const DETAIL_COAST_CELLS = 2048;
export const DETAIL_COAST_TILE_CELLS = 32;
export const DETAIL_COAST_TILES = 64;
export const DETAIL_COAST_LIMIT = 32767;
export const DETAIL_COAST_MAX_BUILD_CELLS = 4096;
export type DetailCoastKey = `coast:${number}:${number}`;
interface DetailCoastTileBase {
  format: 'lieguoji-detail-coast-tile'; version: 1; bx: number; by: number;
}
export interface DetailCoastLandTile extends DetailCoastTileBase { mode: 'land' }
export interface DetailCoastSampleTile extends DetailCoastTileBase {
  mode: 'samples'; coverageQ: Int16Array; elevationMeters: Int16Array;
}
export type DetailCoastTile = DetailCoastLandTile | DetailCoastSampleTile;
export type DetailCoastTiles = ReadonlyMap<DetailCoastKey, DetailCoastTile>;
export interface DetailCoastPointQ { xQ: number; yQ: number }
export interface DetailCoastVertex extends DetailCoastPointQ { coverageQ: number; heightMeters: number }
export type DetailCoastTriangle = [DetailCoastVertex, DetailCoastVertex, DetailCoastVertex];
export interface DetailCoastSegment { a: DetailCoastVertex; b: DetailCoastVertex; ownerTriangleId: number }
export interface DetailCoastCellSurface {
  cellId: number; column: number; row: number;
  land: DetailCoastTriangle[]; sea: DetailCoastTriangle[]; shore: DetailCoastSegment[];
  /** Twice area in Q8 squared units. All area values are safe integers. */
  landAreaTwiceQ2: number; seaAreaTwiceQ2: number; totalAreaTwiceQ2: number;
}
export interface DetailCoastSurface {
  cells: DetailCoastCellSurface[];
  landAreaTwiceQ2: number; seaAreaTwiceQ2: number; totalAreaTwiceQ2: number;
}
export interface DetailCoastRectangle { column: number; row: number; columns: number; rows: number }
export interface DetailCoastField {
  tiles: DetailCoastTiles;
  /** Used only for omitted sea / uniform land nodes. Coordinates are Q8.
   * It must be a pure synchronous sampler of the accepted coarse snapshot. */
  sampleBaseElevation: (xQ: number, yQ: number) => number;
}
export interface DetailCoastControl {
  signal?: AbortSignal;
  yieldControl?: () => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
}
export function detailCoastKey(bx: number, by: number): DetailCoastKey {
  if (!Number.isInteger(bx) || !Number.isInteger(by) || bx < 0 || by < 0 || bx >= 64 || by >= 64) throw new Error('细海岸 tile 坐标无效。');
  return `coast:${bx}:${by}`;
}
export function detailCoastOwnerLayout(bx: number, by: number) {
  detailCoastKey(bx, by);
  const startX = bx * 32 + (bx === 0 ? 0 : 1), startY = by * 32 + (by === 0 ? 0 : 1);
  const width = bx === 0 ? 33 : 32, height = by === 0 ? 33 : 32;
  return { startX, startY, width, height, count: width * height };
}
export function detailCoastNodeOwner(nodeX: number, nodeY: number) {
  if (!Number.isInteger(nodeX) || !Number.isInteger(nodeY) || nodeX < 0 || nodeY < 0 || nodeX > 2048 || nodeY > 2048) throw new Error('细海岸节点坐标无效。');
  const bx = Math.floor(Math.max(0, nodeX - 1) / 32), by = Math.floor(Math.max(0, nodeY - 1) / 32);
  const { startX, startY, width } = detailCoastOwnerLayout(bx, by);
  return { key: detailCoastKey(bx, by), bx, by, slot: (nodeY - startY) * width + nodeX - startX };
}
/** An owner tile supplies the left/top boundaries of its east/south neighbours. */
export function detailCoastAffectedDisplayTiles(bx: number, by: number): DetailCoastKey[] {
  detailCoastKey(bx, by);
  const result: DetailCoastKey[] = [];
  for (let y = by; y <= Math.min(63, by + 1); y++) for (let x = bx; x <= Math.min(63, bx + 1); x++) result.push(detailCoastKey(x, y));
  return result;
}
export function checkDetailCoastAbort(control?: DetailCoastControl): void {
  if (control?.signal?.aborted) throw new DOMException('细海岸操作已取消。', 'AbortError');
}
export async function yieldDetailCoast(control?: DetailCoastControl): Promise<void> {
  checkDetailCoastAbort(control);
  if (control?.yieldControl) await control.yieldControl();
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkDetailCoastAbort(control);
}
