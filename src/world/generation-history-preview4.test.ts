import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGenerationRecipe, type GenerationRecipe } from './generation-contract';
import { decodeGenerationManifest, encodeGenerationManifest } from './generation-format';

const buildBytes = readFileSync(new URL('../../docs/evidence/ph06-continuous-2026-09-27/build.json', import.meta.url));
const build = JSON.parse(buildBytes.toString());
const proof = JSON.parse(readFileSync(new URL('../../docs/evidence/ph06-coastal-surface-2026-09-27/preview4-provenance.json', import.meta.url), 'utf8'));
const pairs = [
  ['macro', 'macroGenerator'], ['landforms', 'landformGenerator'], ['islands', 'islandGenerator'], ['coast', 'coastGenerator'], ['shape', 'shapeGenerator'],
] as const;
describe('preview.4 historical provenance survives the explicit v3 addition', () => {
  it('is bound to previously verified immutable build bytes and the actual committed runtime closures', () => {
    expect(createHash('sha256').update(buildBytes).digest('hex')).toBe('c096754324425cc86e6fc3b9e81839362f8853c8d35ae14b3d1708f060d8b427');
    expect(proof.commit).toBe('147702e8c87e529f75b399f61503f58c9ea85e11');
    expect(proof.verified).toBe(true);
    for (const key of [...pairs.map(row => row[1]), 'oceanGenerator']) expect(proof.generators[key]).toEqual(build[key]);
  });
  it.each(pairs)('accepts %s provenance for storage only and preserves the exact synthetic canonical bytes', (name, key) => {
    const old = decodeGenerationManifest(new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v2-generation-history-preview2/${name}.json`, import.meta.url))));
    old.generation.lastApplied!.recipe.generator.fingerprint = build[key].sha256;
    const bytes = encodeGenerationManifest(old), copy = decodeGenerationManifest(bytes), recipe = copy.generation.lastApplied!.recipe;
    expect(encodeGenerationManifest(copy)).toEqual(bytes);
    expect(validateGenerationRecipe(recipe, copy.spec, 'storage')).toBe(true);
    expect(validateGenerationRecipe(recipe, copy.spec, 'execute')).toBe(false);
    expect(validateGenerationRecipe({ ...recipe, generator: { ...recipe.generator, fingerprint: '0'.repeat(64) } }, copy.spec, 'storage')).toBe(false);
  });
  it('protects the prior ocean recipe without interpreting it as the current implementation', () => {
    const recipe: GenerationRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: build.oceanGenerator.sha256 }, seed: 'synthetic-compatibility', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
    expect(validateGenerationRecipe(recipe, undefined, 'storage')).toBe(true);
    expect(validateGenerationRecipe(recipe, undefined, 'execute')).toBe(false);
  });
});
