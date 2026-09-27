import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGenerationDraft, decodeGenerationManifest, encodeGenerationManifest, validateGenerationManifest } from './generation-format';
import { encodeGenerationRecipe, validateGenerationRecipe, validateGenerationOperation, type AtlasDraftManifestV4, type DetailShapeRecipe, type AddDetailRecipe, type NaturalDetailRecipe, type AddNaturalDetailRecipe } from './generation-contract';
import { isStoredGeneratorFingerprint } from './generation-history';
import { fingerprintMacroGenerator, fingerprintLandformGenerator, fingerprintIslandGenerator, fingerprintCoastGenerator, fingerprintShapeGenerator, fingerprintOceanGenerator, fingerprintDetailShapeGenerator, fingerprintAddDetailGenerator, fingerprintNaturalDetailGenerator, fingerprintAddNaturalDetailGenerator, fingerprintLocalDetailReliefGenerator } from '../../scripts/generator-fingerprint';

// Archive must be promoted before this candidate test. These are synthetic
// codec envelopes, not real saves and not proof that old code may execute.
const evidence = new URL('../../docs/evidence/ph06-preview13-generator-history-2026-09-28/', import.meta.url);
const buildBytes = readFileSync(new URL('build.json', evidence)), build = JSON.parse(buildBytes.toString());
const provenance = JSON.parse(readFileSync(new URL('provenance.json', evidence), 'utf8'));
const archiveRead = (file: string) => readFileSync(new URL(`frozen-source/${file}`, evidence), 'utf8');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const entries = [
  ['macro', 'macroGenerator', 'macro-landmass', fingerprintMacroGenerator],
  ['landforms', 'landformGenerator', 'landforms', fingerprintLandformGenerator],
  ['islands', 'islandGenerator', 'island-chains', fingerprintIslandGenerator],
  ['coast', 'coastGenerator', 'coast-smoothing', fingerprintCoastGenerator],
  ['shape', 'shapeGenerator', 'shape-landmass', fingerprintShapeGenerator],
  ['ocean', 'oceanGenerator', 'ocean-floor', fingerprintOceanGenerator],
  ['detail', 'detailShapeGenerator', 'shape-detail-landmass', fingerprintDetailShapeGenerator],
  ['add', 'addDetailGenerator', 'add-detail-landmass', fingerprintAddDetailGenerator],
  ['natural', 'naturalDetailGenerator', 'shape-detail-landmass@2', fingerprintNaturalDetailGenerator],
  ['naturalAdd', 'addNaturalDetailGenerator', 'add-detail-landmass@2', fingerprintAddNaturalDetailGenerator],
  ['local', 'localDetailReliefGenerator', 'local-detail-relief', fingerprintLocalDetailReliefGenerator],
] as const;
let v4: AtlasDraftManifestV4;
beforeAll(async () => {
  v4 = (await createGenerationDraft({ size: 128, seed: 'synthetic-preview13-history', name: '合成 preview13 历史封套' }, { yieldTask: async () => {} }, 4)).manifest;
}, 30000);

function historical(name: typeof entries[number][0], key: typeof entries[number][1]) {
  if (name === 'local') {
    const manifest = structuredClone(v4); manifest.revision = 1;
    manifest.generation.lastApplied = {
      recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'local-detail-relief', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview13-local-history', parameters: { reliefMeters: 2600 } },
      scope: { kind: 'cell-rectangle', column: 38, row: 38, columns: 16, rows: 16, transitionCells: 2 },
      baseManifestDigest: '1'.repeat(64), baseRootDigest: '2'.repeat(64), baseRevision: 0, lockSetDigest: '3'.repeat(64), appliedRevision: 1,
    };
    return manifest;
  }
  if (name === 'detail' || name === 'add' || name === 'natural' || name === 'naturalAdd') {
    const manifest = structuredClone(v4); manifest.revision = 1;
    const natural = name === 'natural' || name === 'naturalAdd';
    const recipe = {
      format: 'lieguoji-atlas-recipe', version: 1,
      generator: { id: name === 'add' || name === 'naturalAdd' ? 'add-detail-landmass' : 'shape-detail-landmass', version: natural ? 2 : 1, fingerprint: build[key].sha256 },
      seed: 'synthetic-preview13-detail-history',
      parameters: {
        pointsQ: [{ xQ: 1200 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1264 * 256 }, { xQ: 1200 * 256, yQ: 1264 * 256 }],
        coastRoughnessWorld: 0, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3,
        ...(natural ? { coastStructureWorld: 96 } : {}),
      },
    } as DetailShapeRecipe | AddDetailRecipe | NaturalDetailRecipe | AddNaturalDetailRecipe;
    manifest.generation.lastApplied = { recipe, scope: { kind: 'world' }, baseManifestDigest: '1'.repeat(64), baseRootDigest: '2'.repeat(64), baseRevision: 0, lockSetDigest: '3'.repeat(64), appliedRevision: 1 };
    return manifest;
  }
  const manifest = decodeGenerationManifest(new Uint8Array(readFileSync(`tests/fixtures/atlas-v2-generation-history-preview2/${name === 'ocean' ? 'macro' : name}.json`)));
  if (manifest.version !== 2 || !manifest.generation.lastApplied) throw new Error('Expected synthetic historical fixture');
  if (name === 'ocean') manifest.generation.lastApplied.recipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview13-ocean-history', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
  else manifest.generation.lastApplied.recipe.generator.fingerprint = build[key].sha256;
  return manifest;
}

describe('actual preview.13 storage history before the next contract change', () => {
  it('recomputes every real archived closure and verifies original bytes without calling the base commit the product identity', () => {
    expect(build.version).toBe('0.5.0-preview.13');
    expect(build.commit).toBe('0a02f3c27ce2acafec014e4f89d2693416243105');
    expect(provenance.baseCommit).toBe(build.commit); expect(provenance.closureSourceMatchesHead).toBe(true);
    expect(provenance.actualHead).toBe(build.commit); expect(provenance.sourceIsHead).toBe(false);
    expect(provenance.closureSourceMatchesHeadRawBytes).toBe(true);
    expect(provenance.priorPreview12.allGeneratorsAndEngineEqual).toBe(true);
    const priorBytes = readFileSync(new URL(provenance.priorPreview12.archivedPath, evidence));
    const prior = JSON.parse(priorBytes.toString());
    expect(digest(priorBytes)).toBe(provenance.priorPreview12.sha256); expect(prior.version).toBe('0.5.0-preview.12');
    expect(prior.engineFingerprint).toBe(build.engineFingerprint);
    expect(provenance.dist.matchedVerifiedPreview13).toBe(true); expect(provenance.dist.count).toBe(provenance.dist.files.length);
    expect(provenance.verifiedPreview13.runtimeProductSourceMatchesCurrent).toBe(true);
    expect(provenance.verifiedPreview13.allRecordedSourceMatchesCurrent).toBe(false);
    expect(provenance.verifiedPreview13.postBuildSourceDifferences).toHaveLength(1);
    for (const difference of provenance.verifiedPreview13.postBuildSourceDifferences as { path: string; verifiedSha256: string; currentSha256: string; classification: string }[]) {
      expect(difference.classification).toBe('non-runtime-test-change');
      expect(difference.path).toBe('tests/atlas-detail-lock-relief.spec.ts');
      expect(difference.currentSha256).not.toBe(difference.verifiedSha256);
      expect(digest(readFileSync(new URL(`post-build-check-source/${difference.path}`, evidence)))).toBe(difference.currentSha256);
    }
    expect(digest(buildBytes)).toBe(provenance.buildSha256);
    const actualKeys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
    expect(entries.map(([, key]) => key).sort()).toEqual(actualKeys); expect(provenance.closureCount).toBe(actualKeys.length);
    const closureFiles = new Set<string>();
    for (const [, key, , fingerprint] of entries) {
      expect(fingerprint(archiveRead)).toEqual(build[key]); expect(prior[key]).toEqual(build[key]);
      for (const file of build[key].files as string[]) closureFiles.add(file);
    }
    expect(provenance.sourceCount).toBe(closureFiles.size);
    expect(provenance.archivedSources.map((source: { file: string }) => source.file).sort()).toEqual([...closureFiles].sort());
    for (const source of provenance.archivedSources as { file: string; bytes: number; sha256: string }[]) {
      const bytes = readFileSync(new URL(`frozen-source/${source.file}`, evidence));
      expect(bytes.byteLength).toBe(source.bytes); expect(digest(bytes)).toBe(source.sha256);
    }
    expect(digest(JSON.stringify(provenance.archivedSources))).toBe(provenance.sourceSnapshotSha256);
    expect(digest(readFileSync(new URL(provenance.fingerprintTool.archivedPath, evidence)))).toBe(provenance.fingerprintTool.sha256);
    const inventory = JSON.parse(readFileSync(new URL('inventory.json', evidence), 'utf8'));
    for (const record of inventory.files as { path: string; bytes: number; sha256: string }[]) {
      const bytes = readFileSync(new URL(record.path, evidence));
      expect(bytes.byteLength).toBe(record.bytes); expect(digest(bytes)).toBe(record.sha256);
    }
  });

  it('round-trips all stored recipe identities including local relief without enabling old execution or mutating them', () => {
    for (const [name, key] of entries) {
      const manifest = historical(name, key), recipe = manifest.generation.lastApplied!.recipe, original = structuredClone(manifest);
      expect(validateGenerationManifest(manifest)).toBe(true); expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(true);
      expect(validateGenerationRecipe(recipe, manifest.spec, 'execute')).toBe(false); expect(() => encodeGenerationRecipe(recipe)).toThrow('不兼容');
      const bytes = encodeGenerationManifest(manifest), restored = decodeGenerationManifest(bytes);
      expect(restored).toEqual(original); expect(encodeGenerationManifest(restored)).toEqual(bytes); expect(manifest).toEqual(original);
    }
  });

  it('keeps both natural @2 namespaces separate from v1 and every other archived identity', () => {
    for (const [, key, historyKey] of entries) {
      expect(isStoredGeneratorFingerprint(historyKey, build[key].sha256)).toBe(true);
      for (const [, otherKey, otherHistoryKey] of entries) if (otherKey !== key) expect(isStoredGeneratorFingerprint(otherHistoryKey, build[key].sha256)).toBe(false);
    }
    for (const [oldKey, newKey, name] of [['detailShapeGenerator', 'naturalDetailGenerator', 'natural'], ['addDetailGenerator', 'addNaturalDetailGenerator', 'naturalAdd']] as const) {
      const manifest = historical(name, newKey), natural = manifest.generation.lastApplied!.recipe;
      expect(validateGenerationRecipe({ ...natural, generator: { ...natural.generator, fingerprint: build[oldKey].sha256 } }, manifest.spec, 'storage')).toBe(false);
      const parameters = { ...natural.parameters } as Record<string, unknown>; delete parameters.coastStructureWorld;
      expect(validateGenerationRecipe({ ...natural, generator: { ...natural.generator, version: 1 }, parameters }, manifest.spec, 'storage')).toBe(false);
    }
  });

  it('rejects unrelated fingerprints, first/add swaps, unknown fields and future versions', () => {
    for (const [name, key] of entries) {
      const manifest = historical(name, key), stored = manifest.generation.lastApplied!.recipe;
      const other = key === 'macroGenerator' ? 'naturalDetailGenerator' : 'macroGenerator';
      for (const changed of [
        { ...stored, generator: { ...stored.generator, fingerprint: build[other].sha256 } },
        { ...stored, generator: { ...stored.generator, version: 3 } },
        { ...stored, generator: { ...stored.generator, id: stored.generator.id === 'add-detail-landmass' ? 'shape-detail-landmass' : 'add-detail-landmass' } },
        { ...stored, parameters: { ...stored.parameters, future: true } },
      ]) expect(validateGenerationRecipe(changed, manifest.spec, 'storage')).toBe(false);
    }
  });

  it('retains bounded v4-only storage semantics for historical local relief', async () => {
    const manifest = historical('local', 'localDetailReliefGenerator'), last = manifest.generation.lastApplied!;
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec, 'storage')).toBe(true);
    for (const scope of [{ kind: 'world' }, { kind: 'cell-rectangle', column: 38, row: 38, columns: 16, rows: 16, transitionCells: 0 }]) {
      expect(validateGenerationOperation(last.recipe, scope, manifest.spec, 'storage')).toBe(false);
      expect(validateGenerationManifest({ ...manifest, generation: { ...manifest.generation, lastApplied: { ...last, scope } } })).toBe(false);
    }
    for (const format of [2, 3] as const) {
      const legacy = (await createGenerationDraft({ size: 128, seed: 'historical-local-isolation', name: '合成旧格式封套' }, { yieldTask: async () => {} }, format)).manifest;
      expect(validateGenerationManifest(legacy)).toBe(true);
      expect(validateGenerationManifest({ ...legacy, revision: 1, generation: { ...legacy.generation, lastApplied: last } })).toBe(false);
    }
  });
});
