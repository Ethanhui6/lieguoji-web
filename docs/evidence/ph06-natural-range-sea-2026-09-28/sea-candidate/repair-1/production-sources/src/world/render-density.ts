import type { AtlasAabb } from './spatial-index';

export const ATLAS_MINIMUM_CACHE_DENSITY = 1 / 64;
export const ATLAS_TEXTURE_SIDE_LIMIT = 1024;
export const ATLAS_TEXTURE_GUTTER = 2;
const VISIBLE_BUDGET_FRACTION = .75;
export interface AtlasRasterCore { bx: number; by: number }
export interface AtlasRasterRange extends AtlasRasterCore { firstX: number; lastX: number; firstY: number; lastY: number }
export interface AtlasRasterQuality {
  requestedDensity: number; density: number; subdivisions: number;
  coreWorldSize: number; corePixels: number; textureSide: number;
  visibleTextures: number; visiblePixels: number; visiblePixelBudget: number;
  outputPixelsPerTexel: number; fallbackReason: 'pixel-budget' | null;
}
export interface AtlasRasterPlan extends AtlasRasterQuality { ranges: AtlasRasterRange[] }
export interface AtlasRasterOptions {
  logicalSpan: number; scale: number; resolution: number; bounds: AtlasAabb;
  cores: readonly AtlasRasterCore[]; layers: 1 | 2; budgetPixels: number; sharedPixels: number;
}

/** Display cores may be smaller than a geographic sample. All split factors
 * and densities are powers of two, so every core stays on the same global
 * sampling lattice. No geometry, source sample or camera range is changed. */
export function planAtlasRaster(options: AtlasRasterOptions): AtlasRasterPlan {
  const { logicalSpan, scale, resolution, bounds, cores, layers, budgetPixels, sharedPixels } = options;
  if (![logicalSpan, scale, resolution, budgetPixels].every(value => Number.isFinite(value) && value > 0)
    || !Number.isSafeInteger(sharedPixels) || sharedPixels < 0 || layers !== 1 && layers !== 2
    || !Object.values(bounds).every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY
    || cores.some(core => !Number.isSafeInteger(core.bx) || !Number.isSafeInteger(core.by) || core.bx < 0 || core.by < 0)) throw new Error('地图采样计划参数无效。');
  const outputDensity = scale * resolution;
  const requestedDensity = 2 ** Math.ceil(Math.log2(Math.max(ATLAS_MINIMUM_CACHE_DENSITY, outputDensity)));
  const visiblePixelBudget = Math.floor(budgetPixels * VISIBLE_BUDGET_FRACTION);
  if (!Number.isFinite(requestedDensity) || sharedPixels >= visiblePixelBudget) throw new Error('地图可见缓存无法在最低采样密度内满足预算。');
  for (let density = requestedDensity; density >= ATLAS_MINIMUM_CACHE_DENSITY; density /= 2) {
    const subdivisions = 2 ** Math.max(0, Math.ceil(Math.log2(logicalSpan * density / (ATLAS_TEXTURE_SIDE_LIMIT - ATLAS_TEXTURE_GUTTER * 2))));
    const coreWorldSize = logicalSpan / subdivisions, corePixels = logicalSpan * density / subdivisions, textureSide = corePixels + ATLAS_TEXTURE_GUTTER * 2;
    if (!Number.isSafeInteger(subdivisions) || !Number.isSafeInteger(corePixels) || corePixels < 1 || textureSide > ATLAS_TEXTURE_SIDE_LIMIT) throw new Error('地图显示核心未对齐有效采样格。');
    const ranges: AtlasRasterRange[] = [];
    let visibleTextures = 0;
    // Compute intersections before enumerating tiles. High zoom must never
    // allocate an array containing every possible subcore of a logical block.
    for (const core of cores) {
      const x = core.bx * logicalSpan, y = core.by * logicalSpan;
      const firstX = Math.max(0, Math.floor((bounds.minX - x) / coreWorldSize)), lastX = Math.min(subdivisions - 1, Math.floor((bounds.maxX - x) / coreWorldSize));
      const firstY = Math.max(0, Math.floor((bounds.minY - y) / coreWorldSize)), lastY = Math.min(subdivisions - 1, Math.floor((bounds.maxY - y) / coreWorldSize));
      if (firstX > lastX || firstY > lastY) continue;
      visibleTextures += (lastX - firstX + 1) * (lastY - firstY + 1) * layers;
      ranges.push({ ...core, firstX, lastX, firstY, lastY });
    }
    const visiblePixels = visibleTextures * textureSide * textureSide + sharedPixels;
    if (Number.isSafeInteger(visiblePixels) && visiblePixels <= visiblePixelBudget) return {
      requestedDensity, density, subdivisions, coreWorldSize, corePixels, textureSide,
      visibleTextures, visiblePixels, visiblePixelBudget, outputPixelsPerTexel: outputDensity / density,
      fallbackReason: density === requestedDensity ? null : 'pixel-budget', ranges,
    };
  }
  throw new Error('地图可见缓存无法在最低采样密度内满足预算。');
}
