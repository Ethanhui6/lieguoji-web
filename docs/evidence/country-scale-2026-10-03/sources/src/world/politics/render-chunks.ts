/** Spatial display units are independent from territorial ownership and storage.
 * These functions do not alter or simplify authoritative land geometry. */
export const COUNTRY_RENDER_CHUNK_SIDE = 8;
export interface CountryRenderBounds { left: number; top: number; right: number; bottom: number }
export function countryRenderChunk(cellId: number, columns: number): string {
  return `${Math.floor((cellId % columns) / COUNTRY_RENDER_CHUNK_SIDE)}:${Math.floor(Math.floor(cellId / columns) / COUNTRY_RENDER_CHUNK_SIDE)}`;
}
export function countryRenderBounds(points: readonly { x: number; y: number }[]): CountryRenderBounds {
  return { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
}
export function expandCountryRenderBounds(a: CountryRenderBounds, b: CountryRenderBounds): void {
  a.left = Math.min(a.left, b.left); a.top = Math.min(a.top, b.top); a.right = Math.max(a.right, b.right); a.bottom = Math.max(a.bottom, b.bottom);
}
export function countryChunkVisible(bounds: CountryRenderBounds, camera: { x: number; y: number; scale: number }, width: number, height: number): boolean {
  const margin = 3 / camera.scale;
  return bounds.right + margin >= -camera.x / camera.scale && bounds.left - margin <= (width - camera.x) / camera.scale
    && bounds.bottom + margin >= -camera.y / camera.scale && bounds.top - margin <= (height - camera.y) / camera.scale;
}
/** Use the entire ownership index, including neighbours outside the viewport. */
export function countryExposedSides(cellId: number, columns: number, rows: number, nationId: string, owners: ReadonlyMap<number, string>): boolean[] {
  const x = cellId % columns, y = Math.floor(cellId / columns);
  return [y > 0 ? cellId - columns : -1, x + 1 < columns ? cellId + 1 : -1, y + 1 < rows ? cellId + columns : -1, x > 0 ? cellId - 1 : -1].map(id => owners.get(id) !== nationId);
}
