import { describe, expect, it } from 'vitest';
import { encodeGenerationRecipe, validateGenerationOperation, validateGenerationRecipe, validateOceanRecipe, type GenerationValidationMode, type OceanRecipe } from './generation-contract';
import { OCEAN_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import type { AtlasGridSpec } from './model';

const spec: AtlasGridSpec = { kind: 'shared-quad-grid-v1', columns: 128, rows: 128, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 };
const ocean = (): OceanRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1,
  generator: { id: 'ocean-floor', version: 1, fingerprint: OCEAN_GENERATOR_FINGERPRINT }, seed: ' 我的海盆🌊 ',
  parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 },
});

describe('explicit ocean-floor recipe contract', () => {
  it('accepts the current implementation, preserves literal parameters and seed, and permits only world scope', () => {
    const recipe = ocean(), before = structuredClone(recipe);
    expect(validateOceanRecipe(recipe)).toBe(true);
    expect(validateOceanRecipe(recipe, spec)).toBe(true);
    expect(validateGenerationRecipe(recipe, spec)).toBe(true);
    expect(validateGenerationOperation(recipe, { kind: 'world' }, spec)).toBe(true);
    expect(validateGenerationOperation(recipe, { kind: 'world' }, spec, 'storage')).toBe(true);
    expect(validateGenerationOperation(recipe, { kind: 'cell-rectangle', column: 0, row: 0, columns: 50, rows: 50, transitionCells: 3 }, spec)).toBe(false);
    expect(validateGenerationOperation(recipe, { kind: 'cell-rectangle', column: 0, row: 0, columns: 50, rows: 50, transitionCells: 3 }, spec, 'storage')).toBe(false);
    expect(validateGenerationOperation(recipe, { kind: 'world', future: true }, spec)).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(recipe)))).toEqual(before);
    expect(recipe).toEqual(before);
  });

  it.each([
    ['meanDepthMeters', 1000, 6000], ['reliefMeters', 0, 2000], ['shelfWidthWorld', 64, 1024],
  ] as const)('validates every %s integer boundary in execution and storage mode', (field, min, max) => {
    for (const mode of ['execute', 'storage'] as const) {
      for (const value of [min, max]) expect(validateOceanRecipe({ ...ocean(), parameters: { ...ocean().parameters, [field]: value } }, spec, mode)).toBe(true);
      for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity, -Infinity, '1000', null]) {
        const recipe = { ...ocean(), parameters: { ...ocean().parameters, [field]: value } };
        expect(validateOceanRecipe(recipe, spec, mode)).toBe(false);
        expect(validateGenerationRecipe(recipe, spec, mode)).toBe(false);
      }
    }
  });

  it('accepts every independent extreme combination without inventing depth/relief coupling', () => {
    for (const meanDepthMeters of [1000, 6000]) for (const reliefMeters of [0, 2000]) for (const shelfWidthWorld of [64, 1024]) {
      const recipe = { ...ocean(), parameters: { meanDepthMeters, reliefMeters, shelfWidthWorld } };
      expect(validateOceanRecipe(recipe, spec)).toBe(true);
      expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(recipe)))).toEqual(recipe);
    }
  });

  it('rejects unknown, crossed, historical non-ocean and future identities even in storage mode', () => {
    const unknown = 'f'.repeat(64) === OCEAN_GENERATOR_FINGERPRINT ? 'e'.repeat(64) : 'f'.repeat(64);
    const invalid = [
      { ...ocean(), format: 'future-recipe' }, { ...ocean(), version: 2 },
      { ...ocean(), generator: { ...ocean().generator, id: 'ocean-floor-future' } },
      { ...ocean(), generator: { ...ocean().generator, version: 2 } },
      ...[unknown, SHAPE_GENERATOR_FINGERPRINT, '1ff3b8a2eff5f4211a2bdec0d13ca6f1c24dd2cc530e087f906b8e9a6e5b7211', OCEAN_GENERATOR_FINGERPRINT.toUpperCase(), '0'.repeat(63)].map(fingerprint => ({ ...ocean(), generator: { ...ocean().generator, fingerprint } })),
    ];
    for (const recipe of invalid) for (const mode of ['execute', 'storage'] as const) {
      expect(validateOceanRecipe(recipe, spec, mode)).toBe(false);
      expect(validateGenerationRecipe(recipe, spec, mode)).toBe(false);
    }
    expect(validateOceanRecipe(ocean(), spec, 'future' as GenerationValidationMode)).toBe(false);
  });

  it('validates seed and grid boundaries without trimming, clamping or coercing input', () => {
    for (const seed of ['', '   ', '\t\n', 'x'.repeat(121), 12, null]) expect(validateOceanRecipe({ ...ocean(), seed }, spec)).toBe(false);
    expect(validateOceanRecipe({ ...ocean(), seed: 'x'.repeat(120) }, spec)).toBe(true);
    for (const grid of [{ ...spec, width: 2048 }, { ...spec, rows: 64 }, { ...spec, coordinateScale: 1 }, { ...spec, future: true }]) {
      expect(validateOceanRecipe(ocean(), grid as unknown as AtlasGridSpec)).toBe(false);
      expect(validateGenerationRecipe(ocean(), grid as unknown as AtlasGridSpec, 'storage')).toBe(false);
    }
  });

  it('rejects missing, extra, accessor, hidden, symbol and inherited payload fields without executing getters', () => {
    let calls = 0;
    const accessor = ocean(); Object.defineProperty(accessor.parameters, 'meanDepthMeters', { enumerable: true, get: () => { calls++; return 3600; } });
    const seedAccessor = ocean(); Object.defineProperty(seedAccessor, 'seed', { enumerable: true, get: () => { calls++; return 'secret'; } });
    const hidden = ocean(); Object.defineProperty(hidden.parameters, 'future', { value: true });
    const symbol = ocean(); Object.defineProperty(symbol.generator, Symbol('future'), { value: true });
    const inherited = ocean(); Object.setPrototypeOf(inherited.parameters, { inherited: true });
    const missing = { ...ocean().parameters } as Partial<OceanRecipe['parameters']>; delete missing.reliefMeters;
    for (const recipe of [accessor, seedAccessor, hidden, symbol, inherited, { ...ocean(), parameters: missing }, { ...ocean(), future: true }, { ...ocean(), parameters: { ...ocean().parameters, future: true } }, { ...ocean(), generator: { ...ocean().generator, future: true } }]) {
      expect(validateOceanRecipe(recipe, spec)).toBe(false);
      expect(validateOceanRecipe(recipe, spec, 'storage')).toBe(false);
    }
    expect(calls).toBe(0);
  });
});
