import { describe, expect, it } from 'vitest';
import { ATLAS_CACHE_PIXEL_LIMIT } from './atlas-texture-cache';
import { cameraScaleBounds } from './camera';
import { planAtlasRaster, type AtlasRasterOptions } from './render-density';

const defaults: AtlasRasterOptions = {
  logicalSpan: 512, scale: 5.27, resolution: 1, bounds: { minX: 480, minY: 480, maxX: 550, maxY: 550 },
  cores: [{ bx: 0, by: 0 }, { bx: 1, by: 0 }, { bx: 0, by: 1 }, { bx: 1, by: 1 }], layers: 1,
  budgetPixels: ATLAS_CACHE_PIXEL_LIMIT, sharedPixels: 79266,
};

describe('camera-dependent raster density under the unchanged pixel ledger', () => {
  it.each([128, 256, 512])('keeps one output pixel within one texture sample on a %i² atlas at 527%%', columns => {
    for (const resolution of [1, 2]) {
      const plan = planAtlasRaster({ ...defaults, logicalSpan: 4096 / columns * 32, resolution });
      expect(plan.requestedDensity).toBe(resolution === 1 ? 8 : 16); expect(plan.density).toBe(plan.requestedDensity);
      expect(plan.coreWorldSize).toBe(resolution === 1 ? 64 : 32); expect(plan.corePixels).toBe(512);
      expect(plan.textureSide).toBe(516); expect(plan.outputPixelsPerTexel).toBeLessThanOrEqual(1); expect(plan.fallbackReason).toBeNull();
      expect(plan.visiblePixels).toBeLessThanOrEqual(ATLAS_CACHE_PIXEL_LIMIT * .75);
    }
  });

  it('subdivides below a sample at the real maximum camera zoom without enumerating a whole logical block', () => {
    const viewport = { width: 800, height: 600 }, { maxScale } = cameraScaleBounds({ width: 4096, height: 4096 }, viewport);
    const plan = planAtlasRaster({ ...defaults, logicalSpan: 1024, scale: maxScale, resolution: 2,
      bounds: { minX: 500, minY: 500, maxX: 500 + viewport.width / maxScale, maxY: 500 + viewport.height / maxScale }, cores: [{ bx: 0, by: 0 }] });
    expect(maxScale).toBe(10.546875); expect(plan).toMatchObject({ density: 32, subdivisions: 64, coreWorldSize: 16, visibleTextures: 20, fallbackReason: null });
    expect(plan.ranges).toHaveLength(1); expect(plan.visibleTextures).toBeLessThan(64 ** 2 / 100);
  });

  it('accounts for every actual halo and grid target and preserves a common lattice across adjacent blocks', () => {
    const terrain = planAtlasRaster(defaults), grid = planAtlasRaster({ ...defaults, layers: 2 });
    expect(terrain.visibleTextures).toBe(4); expect(grid.visibleTextures).toBe(8);
    expect(grid.visiblePixels).toBe(8 * 516 ** 2 + defaults.sharedPixels); expect(grid.fallbackReason).toBeNull();
    const cores = terrain.ranges.flatMap(range => {
      const values: { x: number; y: number }[] = [];
      for (let y = range.firstY; y <= range.lastY; y++) for (let x = range.firstX; x <= range.lastX; x++) values.push({ x: range.bx * 512 + x * 64, y: range.by * 512 + y * 64 });
      return values;
    });
    expect(cores).toEqual([{ x: 448, y: 448 }, { x: 512, y: 448 }, { x: 448, y: 512 }, { x: 512, y: 512 }]);
  });

  it('reports genuine DPR2 budget pressure instead of silently capping the requested sampling density', () => {
    const cores = Array.from({ length: 16 }, (_, id) => ({ bx: id % 4, by: Math.floor(id / 4) }));
    const plan = planAtlasRaster({ ...defaults, resolution: 2, cores, bounds: { minX: 400, minY: 400, maxX: 1128, maxY: 810 } });
    expect(plan.requestedDensity).toBe(16); expect(plan.density).toBe(8); expect(plan.outputPixelsPerTexel).toBeCloseTo(1.3175);
    expect(plan.fallbackReason).toBe('pixel-budget'); expect(plan.visiblePixels).toBeLessThanOrEqual(plan.visiblePixelBudget);
    const pressureRemoved = planAtlasRaster({ ...defaults, resolution: 2 });
    expect(pressureRemoved.density).toBe(16); expect(pressureRemoved.fallbackReason).toBeNull();
  });

  it('keeps minimum density and fails honestly when even its visible targets do not fit', () => {
    const small = { ...defaults, scale: .0001, logicalSpan: 1024, sharedPixels: 0, cores: [{ bx: 0, by: 0 }], bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
    const plan = planAtlasRaster(small);
    expect(plan).toMatchObject({ requestedDensity: 1 / 64, density: 1 / 64, textureSide: 20, visiblePixels: 400, fallbackReason: null });
    expect(() => planAtlasRaster({ ...small, budgetPixels: 400 })).toThrow('最低采样密度');
  });

  it('does not materialize offscreen high-zoom tiles or drop shared material accounting', () => {
    const plan = planAtlasRaster({ ...defaults, scale: 1000, resolution: 2, bounds: { minX: -20, minY: -20, maxX: -1, maxY: -1 } });
    expect(plan.subdivisions).toBe(2048); expect(plan.ranges).toEqual([]); expect(plan.visibleTextures).toBe(0); expect(plan.visiblePixels).toBe(defaults.sharedPixels);
  });
});
