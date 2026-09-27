import { describe, expect, it } from 'vitest';
import { assertDetailTerrainGlCapabilities, decodeDetailTerrainDiagnostic, readDetailTerrainGlCapabilities, type DetailTerrainGlCapabilities } from './detail-terrain-shader';

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
