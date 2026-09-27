import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGenerationDraft } from './generation-format';
import { decodeGenerationManifest, encodeGenerationManifest, validateGenerationManifest } from './generation-format';
import { encodeGenerationRecipe, validateGenerationRecipe, type AtlasDraftManifestV4, type GenerationRecipe } from './generation-contract';
import { fingerprintMacroGenerator, fingerprintLandformGenerator, fingerprintIslandGenerator, fingerprintCoastGenerator, fingerprintShapeGenerator, fingerprintOceanGenerator, fingerprintDetailShapeGenerator } from '../../scripts/generator-fingerprint';

const evidence = new URL('../../docs/evidence/ph06-preview7-generator-history-2026-09-27/', import.meta.url);
const buildBytes = readFileSync(new URL('build.json', evidence)), build = JSON.parse(buildBytes.toString());
const provenance = JSON.parse(readFileSync(new URL('provenance.json', evidence), 'utf8'));
const archiveRead = (file: string) => readFileSync(new URL(`frozen-source/${file}`, evidence), 'utf8');
const entries = [
  ['macro', 'macroGenerator', fingerprintMacroGenerator], ['landforms', 'landformGenerator', fingerprintLandformGenerator],
  ['islands', 'islandGenerator', fingerprintIslandGenerator], ['coast', 'coastGenerator', fingerprintCoastGenerator],
  ['shape', 'shapeGenerator', fingerprintShapeGenerator], ['ocean', 'oceanGenerator', fingerprintOceanGenerator],
  ['detail', 'detailShapeGenerator', fingerprintDetailShapeGenerator],
] as const;
let v4: AtlasDraftManifestV4;
beforeAll(async () => { v4 = (await createGenerationDraft({ size: 128, seed: 'synthetic-preview7-history', name: '合成旧配方封套测试' }, { yieldTask: async () => {} }, 4)).manifest; }, 30000);

/** Synthetic manifest codec cases. The fingerprints themselves come only from
 * the captured real build and independently matched archived source closure. */
function historical(name: typeof entries[number][0], key: typeof entries[number][1]) {
  if (name === 'detail') {
    const manifest = structuredClone(v4); manifest.revision = 1;
    manifest.generation.lastApplied = { recipe: { format: 'lieguoji-atlas-recipe', version: 1,
      generator: { id: 'shape-detail-landmass', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview7-detail-history',
      parameters: { pointsQ: [{ xQ: 1200 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1264 * 256 }, { xQ: 1200 * 256, yQ: 1264 * 256 }], coastRoughnessWorld: 0, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 } },
      scope: { kind: 'world' }, baseManifestDigest: '1'.repeat(64), baseRootDigest: '2'.repeat(64), baseRevision: 0, lockSetDigest: '3'.repeat(64), appliedRevision: 1 };
    return manifest;
  }
  const manifest = decodeGenerationManifest(new Uint8Array(readFileSync(`tests/fixtures/atlas-v2-generation-history-preview2/${name === 'ocean' ? 'macro' : name}.json`)));
  if (manifest.version !== 2 || !manifest.generation.lastApplied) throw new Error('expected historical synthetic fixture');
  if (name === 'ocean') manifest.generation.lastApplied.recipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview7-ocean-history', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
  else manifest.generation.lastApplied.recipe.generator.fingerprint = build[key].sha256;
  return manifest;
}

describe('actual preview.7 identities before independent additive execution', () => {
  it('recomputes the seven archived runtime closures and verifies every captured source hash', () => {
    expect(build.version).toBe('0.5.0-preview.7');
    expect(createHash('sha256').update(buildBytes).digest('hex')).toBe(provenance.buildSha256);
    for (const [, key, fingerprint] of entries) expect(fingerprint(archiveRead)).toEqual(build[key]);
    for (const source of provenance.archivedSources as { file: string; sha256: string }[]) expect(createHash('sha256').update(readFileSync(new URL(`frozen-source/${source.file}`, evidence))).digest('hex')).toBe(source.sha256);
  });

  it('round-trips all seven stored recipes without enabling old execution or rewriting their identity', () => {
    for (const [name, key] of entries) {
      const manifest = historical(name, key), recipe = manifest.generation.lastApplied!.recipe, original = structuredClone(manifest);
      expect(validateGenerationManifest(manifest)).toBe(true); expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(true);
      expect(validateGenerationRecipe(recipe, manifest.spec, 'execute')).toBe(false); expect(() => encodeGenerationRecipe(recipe)).toThrow('不兼容');
      const bytes = encodeGenerationManifest(manifest), restored = decodeGenerationManifest(bytes);
      expect(restored).toEqual(original); expect(encodeGenerationManifest(restored)).toEqual(bytes); expect(manifest).toEqual(original);
      expect(restored.generation.lastApplied!.recipe.generator.fingerprint).toBe(build[key].sha256);
    }
  });

  it('rejects crossed history, future recipe versions and attempts to relabel old fine history as additive', () => {
    for (const [name, key] of entries) {
      const manifest = historical(name, key), stored = manifest.generation.lastApplied!.recipe;
      for (const changed of [
        { ...stored, generator: { ...stored.generator, fingerprint: build[key === 'macroGenerator' ? 'detailShapeGenerator' : 'macroGenerator'].sha256 } },
        { ...stored, generator: { ...stored.generator, version: 2 } },
        { ...stored, parameters: { ...stored.parameters, future: true } },
      ]) expect(validateGenerationRecipe(changed, manifest.spec, 'storage')).toBe(false);
      const renamed = structuredClone(stored) as GenerationRecipe; Object.assign(renamed.generator, { id: 'add-detail-landmass' });
      expect(validateGenerationRecipe(renamed, manifest.spec, 'storage')).toBe(false);
    }
  });
});
