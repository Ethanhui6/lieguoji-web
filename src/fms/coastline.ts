import { FMS_SEA_LEVEL, type FmsDocument } from './model';

export const FMS_COASTLINE_CONTRACT = 'fixed-linear-sea-contour-v1';

/** The renderer linearly interpolates these exact triangle heights. Freezing
 * every vertex of a mixed sea/land triangle preserves its complete height
 * field, hence every sea-level crossing and land polygon, not only site masks.
 * Sea and exactly-sea-level vertices stay fixed too, including degenerate
 * level edges/plateaus in otherwise all-land triangles. Geometry is immutable.
 * This protects the geometric coastline, not lighting, rivers or pixel colors.
 * The document must already have passed its topology/height validation. */
export function fixedFmsCoastVertices(document: Pick<FmsDocument, 'elevations' | 'triangles'>): Uint8Array {
  const { elevations, triangles } = document;
  const locked = Uint8Array.from(elevations, height => Number(height <= FMS_SEA_LEVEL));
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset], b = triangles[offset + 1], c = triangles[offset + 2];
    const seaCount = Number(elevations[a] < FMS_SEA_LEVEL) + Number(elevations[b] < FMS_SEA_LEVEL) + Number(elevations[c] < FMS_SEA_LEVEL);
    if (seaCount > 0 && seaCount < 3) locked[a] = locked[b] = locked[c] = 1;
  }
  return locked;
}
