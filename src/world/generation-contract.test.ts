import { describe, expect, it } from 'vitest';
import { encodeGenerationRecipe, encodeMacroRecipe, validateGenerationRecipe, validateGenerationScope, validateLandformRecipe, validateMacroRecipe, type GenerationRecipe, type LandformRecipe, type MacroRecipe } from './generation-contract';
import { LANDFORM_GENERATOR_FINGERPRINT, MACRO_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const landforms = (): LandformRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'landforms', version: 1, fingerprint: LANDFORM_GENERATOR_FINGERPRINT }, seed: '高原与盆地🌋', parameters: { mountainRanges: 3, basins: 2, reliefMeters: 2400 } });
const macro = (): MacroRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed: '原宏观种子', parameters: { majorContinents: 2, landCoveragePermille: 450, coastWavelengthWorld: 512, reliefMeters: 2400 } });
const unknownFingerprint = (known: string) => `${known.startsWith('0') ? '1' : '0'}${known.slice(1)}`;

describe('PH06 closed macro and landforms recipe registration', () => {
  it('retains the exact macro API and bytes while independently encoding landforms', () => {
    const previous = macro(); expect(validateMacroRecipe(previous)).toBe(true); expect(validateLandformRecipe(previous)).toBe(false); expect(validateGenerationRecipe(previous)).toBe(true);
    expect(encodeGenerationRecipe(previous)).toEqual(encodeMacroRecipe(previous));
    const next = landforms(); expect(validateLandformRecipe(next)).toBe(true); expect(validateMacroRecipe(next)).toBe(false); expect(validateGenerationRecipe(next)).toBe(true);
    const text = new TextDecoder().decode(encodeGenerationRecipe(next));
    expect(text).toBe(`{"format":"lieguoji-atlas-recipe","generator":{"fingerprint":"${LANDFORM_GENERATOR_FINGERPRINT}","id":"landforms","version":1},"parameters":{"basins":2,"mountainRanges":3,"reliefMeters":2400},"seed":"高原与盆地🌋","version":1}`);
    expect(encodeGenerationRecipe({ parameters: { reliefMeters: 2400, basins: 2, mountainRanges: 3 }, seed: next.seed, generator: { fingerprint: LANDFORM_GENERATOR_FINGERPRINT, version: 1, id: 'landforms' }, version: 1, format: 'lieguoji-atlas-recipe' })).toEqual(encodeGenerationRecipe(next));
    expect(() => encodeMacroRecipe(next as unknown as MacroRecipe)).toThrow('不兼容');
  });

  it.each([
    { mountainRanges: 0, basins: 1, reliefMeters: 200 },
    { mountainRanges: 1, basins: 0, reliefMeters: 6000 },
    { mountainRanges: 8, basins: 4, reliefMeters: 200 },
    { mountainRanges: 4, basins: 8, reliefMeters: 6000 },
  ])('accepts implemented count/relief boundaries %j', parameters => {
    const recipe = { ...landforms(), parameters }; expect(validateLandformRecipe(recipe)).toBe(true); expect(validateGenerationRecipe(recipe)).toBe(true);
  });

  it.each([
    { mountainRanges: 0, basins: 0, reliefMeters: 200 },
    { mountainRanges: 8, basins: 5, reliefMeters: 200 },
    { mountainRanges: 9, basins: 1, reliefMeters: 200 },
    { mountainRanges: 1, basins: 9, reliefMeters: 200 },
    { mountainRanges: -1, basins: 1, reliefMeters: 200 },
    { mountainRanges: 1, basins: -1, reliefMeters: 200 },
    { mountainRanges: 1.5, basins: 1, reliefMeters: 200 },
    { mountainRanges: 1, basins: 1.5, reliefMeters: 200 },
    { mountainRanges: 1, basins: 1, reliefMeters: 199 },
    { mountainRanges: 1, basins: 1, reliefMeters: 6001 },
    { mountainRanges: 1, basins: 1, reliefMeters: 200.5 },
    { mountainRanges: NaN, basins: 1, reliefMeters: 200 },
    { mountainRanges: 1, basins: Infinity, reliefMeters: 200 },
  ])('rejects invalid individual counts, total count and integer relief %j', parameters => {
    const recipe = { ...landforms(), parameters }; expect(validateLandformRecipe(recipe)).toBe(false); expect(validateGenerationRecipe(recipe)).toBe(false); expect(() => encodeGenerationRecipe(recipe)).toThrow('不兼容');
  });

  it('preserves the literal seed and rejects empty, non-string or overlong seeds for both recipes', () => {
    for (const recipe of [macro(), landforms()]) {
      for (const seed of ['', ' \n\t', 'x'.repeat(121), 23, null]) expect(validateGenerationRecipe({ ...recipe, seed })).toBe(false);
      const exact = { ...recipe, seed: ` ${'中'.repeat(118)} ` }; expect(exact.seed.length).toBe(120); expect(validateGenerationRecipe(exact)).toBe(true); expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(exact))).seed).toBe(exact.seed);
    }
  });

  it('rejects future or crossed identities/fingerprints and extra/missing fields without normalizing them away', () => {
    for (const recipe of [macro(), landforms()]) {
      const invalid = [
        { ...recipe, future: true }, { ...recipe, version: 2 }, { ...recipe, format: 'future-recipe' },
        { ...recipe, generator: { ...recipe.generator, id: 'future-generator' } },
        { ...recipe, generator: { ...recipe.generator, version: 2 } },
        { ...recipe, generator: { ...recipe.generator, fingerprint: unknownFingerprint(recipe.generator.fingerprint) } },
        { ...recipe, generator: { ...recipe.generator, future: true } },
        { ...recipe, parameters: { ...recipe.parameters, extra: 1 } },
        { ...recipe, parameters: { reliefMeters: 2400 } },
      ];
      for (const raw of invalid) { expect(validateGenerationRecipe(raw)).toBe(false); expect(() => encodeGenerationRecipe(raw as GenerationRecipe)).toThrow('不兼容'); }
    }
    expect(validateGenerationRecipe({ ...landforms(), parameters: macro().parameters })).toBe(false);
    expect(validateGenerationRecipe({ ...macro(), parameters: landforms().parameters })).toBe(false);
    expect(validateLandformRecipe({ ...landforms(), generator: { ...landforms().generator, fingerprint: MACRO_GENERATOR_FINGERPRINT } })).toBe(false);
    expect(validateMacroRecipe({ ...macro(), generator: { ...macro().generator, fingerprint: LANDFORM_GENERATOR_FINGERPRINT } })).toBe(false);
    expect(validateGenerationScope({ kind: 'world' })).toBe(true); expect(validateGenerationScope({ kind: 'cell-rectangle', column: 0, row: 0, columns: 10, rows: 10, transitionCells: 2 })).toBe(true); expect(validateGenerationScope({ kind: 'cell-rectangle', column: 510, row: 0, columns: 10, rows: 10, transitionCells: 2 })).toBe(false);
  });

  it('does not invoke accessors or accept inherited/hidden/symbol fields as either known recipe', () => {
    let calls = 0;
    for (const recipe of [macro(), landforms()]) {
      const getter = { ...recipe }; Object.defineProperty(getter, 'seed', { enumerable: true, get: () => { calls++; return 'unsafe'; } }); expect(validateGenerationRecipe(getter)).toBe(false);
      const parameterGetter = structuredClone(recipe); Object.defineProperty(parameterGetter.parameters, 'reliefMeters', { enumerable: true, get: () => { calls++; return 200; } }); expect(validateGenerationRecipe(parameterGetter)).toBe(false);
      const hidden = structuredClone(recipe); Object.defineProperty(hidden, 'private', { value: true }); expect(validateGenerationRecipe(hidden)).toBe(false);
      const symbol = structuredClone(recipe); Object.defineProperty(symbol, Symbol('future'), { value: true }); expect(validateGenerationRecipe(symbol)).toBe(false);
      expect(validateGenerationRecipe(Object.assign(Object.create({ inherited: true }), recipe))).toBe(false);
    }
    expect(calls).toBe(0);
  });
});
