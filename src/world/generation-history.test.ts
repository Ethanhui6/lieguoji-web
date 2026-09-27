import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGenerationManifest, encodeGenerationManifest, hashGenerationManifest, validateGenerationManifest } from './generation-format';
import { encodeGenerationRecipe, generationCanonical, validateGenerationOperation, validateGenerationRecipe, type AtlasDraftManifestV2 } from './generation-contract';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v2-generation-history-90cdabc/${name}`, import.meta.url)));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
// Independent fixed expectations: tests do not rebuild fixtures using current recipes.
const golden = [
  { file: 'macro.json', sha256: 'aa4a645c430fa04536fd926ba5bdd4fd6ca6e3df5be0bb7e3742c1e616acabbd', recipeSha256: '3f2781c8f5289f1de93febb888ca8d184d0039ee069906bb7a277a98cb8afbf9' },
  { file: 'landforms.json', sha256: 'beae64d2fbdaa148a1d60730d356c4a18dcfdc8f09327c8b8707a3f032639277', recipeSha256: '151cd303822fbe3a681510e6db6151d76ad4bfe66277156ca43b4a1ce5521481' },
  { file: 'islands.json', sha256: '0423b4b67222c6addd873fb98f65f9945b409ec95a2583f84ffc4e05871a2430', recipeSha256: 'db8506ac3eedd1a425a2ca0e6482dac9c161249bfee6ccb4bc5be7ab3851be3e' },
  { file: 'coast.json', sha256: '53d89bed7e7f09164846c463582ea106898c66b0e4ccd63506e5e561b55c23ab', recipeSha256: '71616e816bc7d903580dfcd1cd16d5bdcd7dd7d76df280891f5e21c3b16bcbc4' },
];

describe('verified published recipe provenance remains immutable storage history', () => {
  it.each(golden)('reads and re-encodes $file with the exact fixed manifest and recipe digests', async row => {
    const bytes = fixture(row.file); expect(hash(bytes)).toBe(row.sha256);
    const manifest = decodeGenerationManifest(bytes), original = structuredClone(manifest), last = manifest.generation.lastApplied!;
    expect(validateGenerationManifest(manifest)).toBe(true);
    expect(validateGenerationRecipe(last.recipe, manifest.spec, 'storage')).toBe(true);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec, 'storage')).toBe(true);
    expect(hash(generationCanonical(last.recipe))).toBe(row.recipeSha256);
    expect(encodeGenerationManifest(manifest)).toEqual(bytes);
    expect(await hashGenerationManifest(manifest)).toBe(row.sha256);
    expect(manifest).toEqual(original);
    // Storage acceptance must not make the current implementation execute an old recipe.
    expect(validateGenerationRecipe(last.recipe)).toBe(false);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec)).toBe(false);
    expect(() => encodeGenerationRecipe(last.recipe)).toThrow('不兼容');
  });

  it.each(golden)('rejects unknown fingerprints, crossed generator histories and malformed old payloads for $file', row => {
    const base = decodeGenerationManifest(fixture(row.file));
    for (const mutation of ['unknown', 'crossed', 'version', 'extra', 'bad-parameter'] as const) {
      const manifest = structuredClone(base), recipe = manifest.generation.lastApplied!.recipe;
      if (mutation === 'unknown') recipe.generator.fingerprint = '0'.repeat(64);
      else if (mutation === 'crossed') recipe.generator.fingerprint = decodeGenerationManifest(fixture(row.file === 'macro.json' ? 'coast.json' : 'macro.json')).generation.lastApplied!.recipe.generator.fingerprint;
      else if (mutation === 'version') Object.assign(recipe.generator, { version: 2 });
      else if (mutation === 'extra') Object.assign(recipe, { future: true });
      else Object.assign(recipe.parameters, { [Object.keys(recipe.parameters)[0]]: -1 });
      expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(false);
      expect(validateGenerationManifest(manifest)).toBe(false);
      expect(() => encodeGenerationManifest(manifest)).toThrow('无效');
      expect(() => decodeGenerationManifest(new TextEncoder().encode(generationCanonical(manifest)))).toThrow('不兼容');
    }
  });

  it('does not mutate even frozen historical provenance and retains strict outer version/canonical-byte protection', () => {
    const bytes = fixture('macro.json'), raw = JSON.parse(new TextDecoder().decode(bytes)) as AtlasDraftManifestV2;
    Object.freeze(raw.generation.lastApplied!.recipe.generator);
    Object.freeze(raw.generation.lastApplied!.recipe.parameters);
    Object.freeze(raw.generation.lastApplied!.recipe);
    expect(validateGenerationManifest(raw)).toBe(true);
    expect(encodeGenerationManifest(raw)).toEqual(bytes);
    expect(validateGenerationManifest({ ...raw, version: 3 })).toBe(false);
    expect(() => decodeGenerationManifest(new TextEncoder().encode(JSON.stringify(raw, null, 2)))).toThrow('非规范');
  });
});
