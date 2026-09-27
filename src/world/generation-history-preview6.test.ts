import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeGenerationRecipe, generationCanonical, validateGenerationOperation, validateGenerationRecipe, type AtlasCopyOrigin, type AtlasDraftManifestV2, type AtlasDraftManifestV3 } from './generation-contract';
import { decodeGenerationManifest, encodeGenerationManifest, validateGenerationManifest } from './generation-format';

const buildBytes = readFileSync(new URL('../../docs/evidence/ph06-zoom-density-2026-09-27/build.json', import.meta.url));
const build = JSON.parse(buildBytes.toString());
const pairs = [
  ['macro', 'macroGenerator'], ['landforms', 'landformGenerator'], ['islands', 'islandGenerator'],
  ['coast', 'coastGenerator'], ['shape', 'shapeGenerator'], ['ocean', 'oceanGenerator'],
] as const;
type HistoryName = typeof pairs[number][0];
type BuildKey = typeof pairs[number][1];

// Synthetic codec cases reuse the archived fixture envelopes and actual
// preview.6 build identities. They are not player saves or newly run generators.
function historicalV2(name: HistoryName, key: BuildKey): AtlasDraftManifestV2 {
  const manifest = decodeGenerationManifest(new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v2-generation-history-preview2/${name === 'ocean' ? 'macro' : name}.json`, import.meta.url))));
  if (manifest.version !== 2 || !manifest.generation.lastApplied) throw new Error('Expected the fixed v2 historical fixture.');
  if (name === 'ocean') manifest.generation.lastApplied.recipe = {
    format: 'lieguoji-atlas-recipe', version: 1,
    generator: { id: 'ocean-floor', version: 1, fingerprint: build[key].sha256 },
    seed: 'synthetic-preview6-ocean-history', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 },
  };
  else manifest.generation.lastApplied.recipe.generator.fingerprint = build[key].sha256;
  return manifest;
}
function historicalV3(name: HistoryName, key: BuildKey): AtlasDraftManifestV3 {
  return { ...historicalV2(name, key), version: 3, surface: { kind: 'land-mask-fan-v1', coordinateScale: 256 } };
}
function rejectStoredManifest(manifest: unknown): void {
  expect(validateGenerationManifest(manifest)).toBe(false);
  expect(() => decodeGenerationManifest(new TextEncoder().encode(generationCanonical(manifest)))).toThrow('不兼容');
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}

describe('archived preview.6 generator identities remain storage-only history', () => {
  it('binds all six identities to the immutable archived build without deriving them from current code', () => {
    expect(createHash('sha256').update(buildBytes).digest('hex')).toBe('030acfa1abf79cc553b03f8b1303f5fae3743e1d03a4d52e0d0245bfe84ef395');
    expect(build.version).toBe('0.5.0-preview.6');
    // This is the recorded build base HEAD, not the later commit that archived
    // the tested working tree. Its closure provenance is separately archived.
    expect(build.commit).toBe('fa98b8c48902ceea9b76517e36cbcfa3fef7f15c');
    expect(new Set(pairs.map(([, key]) => build[key].sha256)).size).toBe(6);
    for (const [, key] of pairs) {
      expect(build[key].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(build[key].files).toContain('src/world/generation-history.ts');
    }
  });

  it.each(pairs)('accepts stored %s recipes and operations without enabling current execution', (name, key) => {
    const manifest = historicalV2(name, key), original = structuredClone(manifest), last = manifest.generation.lastApplied!;
    expect(validateGenerationManifest(manifest)).toBe(true);
    expect(validateGenerationRecipe(last.recipe, manifest.spec, 'storage')).toBe(true);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec, 'storage')).toBe(true);
    expect(last.recipe.generator.fingerprint).toBe(build[key].sha256);
    expect(validateGenerationRecipe(last.recipe, manifest.spec)).toBe(false);
    expect(validateGenerationRecipe(last.recipe, manifest.spec, 'execute')).toBe(false);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec)).toBe(false);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec, 'execute')).toBe(false);
    expect(() => encodeGenerationRecipe(last.recipe)).toThrow('不兼容');
    expect(manifest).toEqual(original);
  });

  it.each(pairs)('reads and re-encodes an explicit v3 draft retaining exact %s lastApplied provenance', (name, key) => {
    const manifest = historicalV3(name, key), original = structuredClone(manifest);
    freeze(manifest);
    const bytes = encodeGenerationManifest(manifest), restored = decodeGenerationManifest(bytes);
    expect(restored.version).toBe(3);
    expect(restored).toEqual(original);
    expect(restored.generation.lastApplied).toEqual(original.generation.lastApplied);
    expect(restored.generation.lastApplied!.recipe.generator.fingerprint).toBe(build[key].sha256);
    expect(encodeGenerationManifest(restored)).toEqual(bytes);
    expect(manifest).toEqual(original);
    expect(validateGenerationRecipe(restored.generation.lastApplied!.recipe, restored.spec, 'execute')).toBe(false);
  });

  it('rejects unknown or crossed histories and malformed/future recipe payloads for all six identities', () => {
    for (const [name, key] of pairs) for (const mutation of ['unknown', 'crossed', 'generator-version', 'recipe-version', 'extra-parameter', 'bad-parameter'] as const) {
      const manifest = historicalV3(name, key), recipe = manifest.generation.lastApplied!.recipe;
      if (mutation === 'unknown') recipe.generator.fingerprint = '0'.repeat(64); // Deliberately invalid sentinel, not provenance.
      else if (mutation === 'crossed') recipe.generator.fingerprint = build[key === 'macroGenerator' ? 'shapeGenerator' : 'macroGenerator'].sha256;
      else if (mutation === 'generator-version') Object.assign(recipe.generator, { version: 2 });
      else if (mutation === 'recipe-version') Object.assign(recipe, { version: 2 });
      else if (mutation === 'extra-parameter') Object.assign(recipe.parameters, { future: true });
      else Object.assign(recipe.parameters, { [Object.keys(recipe.parameters)[0]]: -1 });
      expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(false);
      rejectStoredManifest(manifest);
    }
  });

  it('retains old origin restrictions instead of allowing v3 origins in v2 envelopes', () => {
    const old = historicalV2('shape', 'shapeGenerator'), last = old.generation.lastApplied!;
    const origin: AtlasCopyOrigin = {
      format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: 2,
      sourceDraftId: old.draftId, sourceSlot: 'backup', sourceManifestDigest: last.baseManifestDigest,
      sourceManifestRevision: last.baseRevision, observedRootDigest: last.baseRootDigest,
    };
    for (const sourceFormat of [1, 2] as const) expect(validateGenerationManifest({ ...old, origin: { ...origin, sourceFormat } })).toBe(true);
    rejectStoredManifest({ ...old, origin: { ...origin, sourceFormat: 3 } });
    const next = historicalV3('shape', 'shapeGenerator');
    expect(validateGenerationManifest({ ...next, origin: { ...origin, sourceFormat: 3 } })).toBe(true);
    for (const change of [{ version: 2 }, { sourceFormat: 4 }, { sourceSlot: 'future' }, { future: true }]) rejectStoredManifest({ ...next, origin: { ...origin, ...change } });
  });

  it('requires explicit v3 surface semantics and keeps outer-format and canonical-byte boundaries closed', () => {
    const old = historicalV2('macro', 'macroGenerator'), next = historicalV3('macro', 'macroGenerator');
    rejectStoredManifest({ ...old, version: 3 });
    rejectStoredManifest({ ...old, surface: next.surface });
    for (const version of [1, 4]) rejectStoredManifest({ ...next, version });
    for (const surface of [null, { kind: 'land-mask-fan-v2', coordinateScale: 256 }, { kind: 'land-mask-fan-v1', coordinateScale: 512 }, { ...next.surface, future: true }]) rejectStoredManifest({ ...next, surface });
    rejectStoredManifest({ ...next, generation: { ...next.generation, version: 2 } });
    expect(() => decodeGenerationManifest(new TextEncoder().encode(JSON.stringify(next, null, 2)))).toThrow('非规范');
  });
});
