import { describe, expect, it } from 'vitest';
import { encodeGenerationRecipe, validateGenerationOperation, validateGenerationRecipe, validateShapeRecipe, type ShapeRecipe } from './generation-contract';
import { SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import type { AtlasGridSpec } from './model';

const spec: AtlasGridSpec = { kind: 'shared-quad-grid-v1', columns: 128, rows: 128, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 };
const q = (pairs: number[][]) => pairs.map(([xQ, yQ]) => ({ xQ, yQ }));
const shape = (): ShapeRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1,
  generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: ' 我画的大陆🌊 ',
  parameters: { pointsQ: q([[0, 0], [300000, 0], [300000, 400000], [100000, 200000], [0, 400000]]), coastRoughnessWorld: 64, coastWavelengthWorld: 256, reliefMeters: 2400, shelfWidthWorld: 96 },
});

describe('player contour recipe boundary', () => {
  it('accepts concave polygons in either winding, preserves exact Q8 points and literal seed, and restricts execution to world scope', () => {
    const recipe = shape(), before = structuredClone(recipe);
    expect(validateShapeRecipe(recipe, spec)).toBe(true);
    expect(validateGenerationRecipe(recipe, spec)).toBe(true);
    expect(validateGenerationOperation(recipe, { kind: 'world' }, spec)).toBe(true);
    expect(validateGenerationOperation(recipe, { kind: 'cell-rectangle', column: 0, row: 0, columns: 50, rows: 50, transitionCells: 3 }, spec)).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(recipe)))).toEqual(before);
    expect(recipe).toEqual(before);
    recipe.parameters.pointsQ.reverse();
    expect(validateShapeRecipe(recipe, spec)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(recipe))).parameters.pointsQ).toEqual(recipe.parameters.pointsQ);
  });

  it('accepts the 3/256 point limits, straight continuations and exact world boundary without normalizing input', () => {
    for (const pointsQ of [q([[0, 0], [1048576, 0], [0, 1048576]]), q([[0, 0], [20, 0], [40, 0], [40, 40], [0, 40]]), Array.from({ length: 256 }, (_, i) => ({ xQ: 500000 + Math.round(200000 * Math.cos(i * Math.PI * 2 / 256)), yQ: 500000 + Math.round(200000 * Math.sin(i * Math.PI * 2 / 256)) }))]) {
      expect(validateShapeRecipe({ ...shape(), parameters: { ...shape().parameters, pointsQ } }, spec)).toBe(true);
    }
  });

  it.each([
    ['too few', q([[0, 0], [100, 0]])],
    ['repeated closing point', q([[0, 0], [100, 0], [100, 100], [0, 0]])],
    ['repeated interior point', q([[0, 0], [100, 0], [100, 100], [100, 0], [0, 100]])],
    ['zero area', q([[0, 0], [100, 0], [200, 0]])],
    ['crossing bowtie', q([[0, 0], [100, 100], [0, 100], [100, 0]])],
    ['nonzero-area crossing', q([[0, 0], [100, 100], [0, 100], [200, 0]])],
    ['edge touching another edge', q([[0, 0], [100, 0], [100, 100], [50, 0], [0, 100]])],
    ['adjacent backtracking', q([[0, 0], [100, 0], [50, 0], [100, 100], [0, 100]])],
    ['negative coordinate', q([[-1, 0], [100, 0], [100, 100]])],
    ['outside world', q([[0, 0], [1048577, 0], [100, 100]])],
    ['fractional Q8 coordinate', q([[0, 0], [100.5, 0], [100, 100]])],
    ['nonfinite coordinate', q([[0, 0], [Infinity, 0], [100, 100]])],
    ['too many', Array.from({ length: 257 }, (_, i) => ({ xQ: i, yQ: i * i }))],
  ])('rejects %s without editing the contour', (_name, pointsQ) => {
    const recipe = { ...shape(), parameters: { ...shape().parameters, pointsQ } }, before = structuredClone(recipe);
    expect(validateShapeRecipe(recipe, spec)).toBe(false);
    expect(validateGenerationOperation(recipe, { kind: 'world' }, spec)).toBe(false);
    expect(recipe).toEqual(before);
    expect(() => encodeGenerationRecipe(recipe)).toThrow('不兼容');
  });

  it.each([
    ['coastRoughnessWorld', 0, 128], ['coastWavelengthWorld', 64, 512],
    ['reliefMeters', 200, 6000], ['shelfWidthWorld', 32, 256],
  ] as const)('validates %s integer boundaries', (field, min, max) => {
    for (const value of [min, max]) expect(validateShapeRecipe({ ...shape(), parameters: { ...shape().parameters, [field]: value } }, spec)).toBe(true);
    for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity]) expect(validateShapeRecipe({ ...shape(), parameters: { ...shape().parameters, [field]: value } }, spec)).toBe(false);
  });

  it('rejects future identities, malformed specs, hidden/accessor fields and sparse arrays without invoking accessors', () => {
    let calls = 0;
    const getter = shape(); Object.defineProperty(getter.parameters.pointsQ[0], 'xQ', { enumerable: true, get: () => { calls++; return 0; } });
    const sparse = shape(); delete sparse.parameters.pointsQ[1];
    const hidden = shape(); Object.defineProperty(hidden.parameters.pointsQ[0], 'future', { value: true });
    const unknown = 'f'.repeat(64) === SHAPE_GENERATOR_FINGERPRINT ? 'e'.repeat(64) : 'f'.repeat(64);
    for (const recipe of [getter, sparse, hidden, { ...shape(), future: true }, { ...shape(), version: 2 }, { ...shape(), generator: { ...shape().generator, version: 2 } }, { ...shape(), generator: { ...shape().generator, fingerprint: unknown } }, { ...shape(), parameters: { ...shape().parameters, future: true } }]) {
      expect(validateShapeRecipe(recipe, spec)).toBe(false);
      expect(validateShapeRecipe(recipe, spec, 'storage')).toBe(false);
    }
    for (const seed of ['', '   ', 'x'.repeat(121), 12]) expect(validateShapeRecipe({ ...shape(), seed }, spec)).toBe(false);
    expect(validateShapeRecipe(shape(), { ...spec, width: 2048 } as unknown as AtlasGridSpec)).toBe(false);
    expect(validateShapeRecipe(shape(), { ...spec, coordinateScale: 1 } as unknown as AtlasGridSpec)).toBe(false);
    expect(calls).toBe(0);
  });
});
