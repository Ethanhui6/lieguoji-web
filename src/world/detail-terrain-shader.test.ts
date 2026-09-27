import { describe, expect, it } from 'vitest';
import { assertDetailTerrainGlCapabilities, decodeDetailTerrainDiagnostic, detailTerrainPieceRelief, readDetailTerrainGlCapabilities, type DetailTerrainGlCapabilities } from './detail-terrain-shader';
import { buildDetailCoastSurface, pickDetailCoastSurface } from './detail-coast-geometry';
import { type DetailCoastField, type DetailCoastTriangle } from './detail-coast-types';
import { atlasTerrainColor } from './terrain-material';
import { terrainMaterialTable, terrainMaterialUv, TERRAIN_LUT_WIDTH } from './terrain-mesh';

const sufficient: DetailTerrainGlCapabilities = { webGL2: true, contextLost: false, maxTextureSize: 4096, fragmentTextureUnits: 16,
  fragmentFloatPrecision: 23, fragmentIntRangeMin: 31, fragmentIntRangeMax: 31 };

describe('v4 WebGL2 shader boundary contracts (no GPU claimed)', () => {
  it('requires the actual backend, integer/float precision and all seven source samplers', () => {
    expect(() => assertDetailTerrainGlCapabilities(sufficient)).not.toThrow();
    for (const change of [{ webGL2: false }, { contextLost: true }, { maxTextureSize: 1024 }, { maxTextureSize: NaN }, { fragmentTextureUnits: 6 },
      { fragmentFloatPrecision: 22 }, { fragmentIntRangeMin: 25 }, { fragmentIntRangeMax: 25 }, { fragmentIntRangeMax: Infinity }]) {
      expect(() => assertDetailTerrainGlCapabilities({ ...sufficient, ...change })).toThrow('不能准确显示 v4');
    }
  });

  it('queries runtime limits and distinguishes missing precision/context loss from supported WebGL2', () => {
    const context = { VERSION: 1, MAX_TEXTURE_SIZE: 2, MAX_TEXTURE_IMAGE_UNITS: 3, FRAGMENT_SHADER: 4, HIGH_FLOAT: 5, HIGH_INT: 6,
      texStorage2D() {}, getParameter: (name: number) => ({ 1: 'WebGL 2.0 (fixture)', 2: 4096, 3: 16 } as Record<number, string | number>)[name],
      getShaderPrecisionFormat: (_stage: number, kind: number) => kind === 5 ? { precision: 23, rangeMin: 127, rangeMax: 127 } : { precision: 0, rangeMin: 31, rangeMax: 31 },
      isContextLost: () => false };
    expect(readDetailTerrainGlCapabilities(context as unknown as WebGL2RenderingContext)).toEqual(sufficient);
    const unavailable = { ...context, getShaderPrecisionFormat: () => null, isContextLost: () => true };
    expect(() => assertDetailTerrainGlCapabilities(readDetailTerrainGlCapabilities(unavailable as unknown as WebGL2RenderingContext))).toThrow();
  });

  it.each([
    [[0, 0, 0, 255], { land: false, height: -12000 }],
    [[0, 223, 46, 255], { land: false, height: -1 }],
    [[0, 224, 174, 255], { land: true, height: 0 }],
    [[128, 224, 174, 255], { land: true, height: .5 }],
    [[0, 192, 221, 255], { land: true, height: 12000 }],
  ] as const)('decodes unfiltered diagnostic bytes %j without alpha blending ambiguity', (pixel, expected) => {
    expect(decodeDetailTerrainDiagnostic(pixel)).toEqual(expected);
  });

  it('separates uncovered pixels from malformed, filtered or out-of-range diagnostic output', () => {
    expect(decodeDetailTerrainDiagnostic([0, 0, 0, 0])).toBeNull();
    expect(() => decodeDetailTerrainDiagnostic([0, 0, 0, 254])).toThrow('透明度或滤波');
    expect(() => decodeDetailTerrainDiagnostic([255, 255, 255, 255])).toThrow('高度越界');
    expect(() => decodeDetailTerrainDiagnostic([.5, 0, 0, 255])).toThrow();
    expect(() => decodeDetailTerrainDiagnostic([0, 0, 255])).toThrow();
  });
});

describe('v4 analytic piece relief contract (CPU oracle, GPU parity still required)', () => {
  const plane = (gx: number, gy: number, offset = 600): DetailCoastTriangle => [
    { xQ: 0, yQ: 0, coverageQ: 1, heightMeters: offset },
    { xQ: 512, yQ: 0, coverageQ: 1, heightMeters: offset + 2 * gx },
    { xQ: 512, yQ: 512, coverageQ: 1, heightMeters: offset + 2 * gx + 2 * gy },
  ];

  it('recovers metres per world unit and the existing NW light at actual fine step two', () => {
    const relief = detailTerrainPieceRelief(...plane(20, 20));
    expect(relief.gradient).toEqual({ x: 20, y: 20 }); expect(relief.light).toBeCloseTo(1.065, 12);
    // Existing material's symmetric neighbours describe this same height plane.
    const expected = atlasTerrainColor(600, 560, 640, 560, 640, 2);
    const table = terrainMaterialTable('land'), [u, v] = terrainMaterialUv(600, relief.light, 'land');
    const pixel = (Math.round(v * 33 - .5) * TERRAIN_LUT_WIDTH + Math.round(u * TERRAIN_LUT_WIDTH - .5)) * 4;
    expect([...table.slice(pixel, pixel + 3)]).toEqual([expected >> 16 & 255, expected >> 8 & 255, expected & 255]);
  });

  it('brightens slopes facing northwest, darkens the reverse, and keeps perpendicular slopes neutral', () => {
    const forward = detailTerrainPieceRelief(...plane(40, 0)), reverse = detailTerrainPieceRelief(...plane(-40, 0));
    expect(forward.light).toBeGreaterThan(1); expect(reverse.light).toBeLessThan(1);
    expect(forward.light + reverse.light).toBeCloseTo(2, 12);
    expect(detailTerrainPieceRelief(...plane(0, 40)).light).toBeCloseTo(forward.light, 12);
    expect(detailTerrainPieceRelief(...plane(25, -25)).light).toBe(1);
  });

  it('keeps a flat height field neutral on both land and seabed without inventing detail', () => {
    for (const height of [-12000, -400, 0, 12000]) expect(detailTerrainPieceRelief(...plane(0, 0, height))).toEqual({ gradient: { x: 0, y: 0 }, light: 1 });
  });

  it('uses relative coordinates and physical height, independent of world origin or uniform geometric scaling', () => {
    const triangle = plane(20, -7), expected = detailTerrainPieceRelief(...triangle);
    const translated = triangle.map(v => ({ ...v, xQ: v.xQ + 1048064, yQ: v.yQ + 1048064, heightMeters: v.heightMeters + 500 })) as DetailCoastTriangle;
    const scaled = triangle.map(v => ({ ...v, xQ: v.xQ * .5, yQ: v.yQ * .5, heightMeters: v.heightMeters * .5 })) as DetailCoastTriangle;
    expect(detailTerrainPieceRelief(...translated)).toEqual(expected); expect(detailTerrainPieceRelief(...scaled)).toEqual(expected);
  });

  it('matches independent CPU pick height differences inside actual quantized land and sea pieces', () => {
    const coverageQ = new Int16Array(1089).fill(-32767), elevationMeters = new Int16Array(1089).fill(-1200);
    coverageQ[0] = 1; elevationMeters[0] = 800; // Forces the canonical 1-Q8 crossing clamp.
    const field: DetailCoastField = { tiles: new Map([['coast:0:0', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples', coverageQ, elevationMeters }]]), sampleBaseElevation: () => -1200 };
    const surface = buildDetailCoastSurface(field, { column: 0, row: 0, columns: 1, rows: 1 }), before = JSON.stringify(surface);
    for (const [land, pieces] of [[true, surface.cells[0].land], [false, surface.cells[0].sea]] as const) {
      expect(pieces.length).toBeGreaterThan(0);
      for (const triangle of pieces) {
        const point = (weights: number[]) => ({ x: triangle.reduce((n, v, i) => n + v.xQ * weights[i], 0) / 256, y: triangle.reduce((n, v, i) => n + v.yQ * weights[i], 0) / 256 });
        const a = point([.25, .25, .5]), b = point([.2, .35, .45]), pickedA = pickDetailCoastSurface(field, a)!, pickedB = pickDetailCoastSurface(field, b)!;
        expect(pickedA.land).toBe(land); expect(pickedB.land).toBe(land);
        const { gradient, light } = detailTerrainPieceRelief(...triangle);
        expect(gradient.x * (b.x - a.x) + gradient.y * (b.y - a.y)).toBeCloseTo(pickedB.height - pickedA.height, 7);
        expect(Number.isFinite(light)).toBe(true); expect(light).toBeGreaterThanOrEqual(.87); expect(light).toBeLessThanOrEqual(1.13);
        for (const v of triangle) if (v.coverageQ === 0) expect(v.heightMeters).toBe(0);
      }
    }
    expect(JSON.stringify(surface)).toBe(before);
  });

  it('uses zero gradient for degenerate ties instead of division by zero or NaN', () => {
    const a = { xQ: 0, yQ: 0, heightMeters: 0 }, b = { xQ: 1, yQ: 1, heightMeters: 0 }, c = { xQ: 2, yQ: 2, heightMeters: 0 };
    expect(detailTerrainPieceRelief(a, b, c)).toEqual({ gradient: { x: 0, y: 0 }, light: 1 });
    expect(detailTerrainPieceRelief(a, a, a)).toEqual({ gradient: { x: 0, y: 0 }, light: 1 });
  });
});
