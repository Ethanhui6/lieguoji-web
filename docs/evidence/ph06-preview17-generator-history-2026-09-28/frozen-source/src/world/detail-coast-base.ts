import { measureGeography } from './generation/quality';
import type { AtlasControl, AtlasGeographyView, AtlasSize } from './model';

export interface DetailCoastBaseSamples {
  size: AtlasSize; centersQ: ArrayBuffer; elevationsMeters: ArrayBuffer;
  worldAreaTwiceQ2: number;
}
/** Shared adapter/renderer projection from a stable, already verified v4
 * snapshot. Uses actual convex-quad area centroids, quantized to Q8, in
 * row-major cell order. The returned arrays are newly allocated; this helper
 * is not a substitute for document ownership or manifest/hash validation. */
export async function extractDetailCoastBase(data: AtlasGeographyView, control?: AtlasControl): Promise<DetailCoastBaseSamples> {
  if (data.manifest.version !== 4) throw new Error('细海岸基础采样只支持第四版地理。');
  const measured = await measureGeography(data, control, '读取细海岸实际粗格重心');
  return { size: data.manifest.spec.columns, centersQ: measured.xyQ.buffer as ArrayBuffer,
    elevationsMeters: measured.elevation.buffer as ArrayBuffer, worldAreaTwiceQ2: measured.worldAreaQ2 };
}
