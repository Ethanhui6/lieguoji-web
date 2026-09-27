import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGenerationDraft, decodeGenerationManifest, encodeGenerationManifest, validateGenerationManifest } from './generation-format';
import { encodeGenerationRecipe, validateGenerationRecipe, validateGenerationOperation, type AtlasDraftManifestV4, type DetailShapeRecipe, type AddDetailRecipe, type NaturalDetailRecipe, type AddNaturalDetailRecipe } from './generation-contract';
import { isStoredGeneratorFingerprint } from './generation-history';
import { fingerprintMacroGenerator, fingerprintLandformGenerator, fingerprintIslandGenerator, fingerprintCoastGenerator, fingerprintShapeGenerator, fingerprintOceanGenerator, fingerprintDetailShapeGenerator, fingerprintAddDetailGenerator, fingerprintNaturalDetailGenerator, fingerprintAddNaturalDetailGenerator, fingerprintLocalDetailReliefGenerator } from '../../scripts/generator-fingerprint';
import { engineFiles, fingerprintSources } from '../../scripts/engine-fingerprint';

// Synthetic codec envelopes, not real saves or permission to execute old code.
const evidence = new URL('../../docs/evidence/ph06-preview22-generator-history-2026-09-28/', import.meta.url);
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
  v4 = (await createGenerationDraft({ size: 128, seed: 'synthetic-preview22-history', name: '合成 preview22 历史封套' }, { yieldTask: async () => {} }, 4)).manifest;
}, 30000);

function historical(name: typeof entries[number][0], key: typeof entries[number][1]) {
  if (name === 'local') {
    const manifest = structuredClone(v4); manifest.revision = 1;
    manifest.generation.lastApplied = {
      recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'local-detail-relief', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview22-local-history', parameters: { reliefMeters: 2600 } },
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
      seed: 'synthetic-preview22-detail-history',
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
  if (name === 'ocean') manifest.generation.lastApplied.recipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: build[key].sha256 }, seed: 'synthetic-preview22-ocean-history', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
  else manifest.generation.lastApplied.recipe.generator.fingerprint = build[key].sha256;
  return manifest;
}

describe('actual preview.22 stored identities as storage-only compatibility', () => {
  it('binds all eleven identities to original22 build bytes and the exact committed source closure', () => {
    expect(build.version).toBe('0.5.0-preview.22'); expect(build.commit).toBe('d651bcc9502d5afe31fef80d0a17b9a9988bc819');
    expect(provenance.sourceCommit).toBe('5aadcba21f13ed101c5983fd4e97ce16f8206f55');
    expect(provenance.originalBuildCommit).toBe(build.commit);
    expect(digest(buildBytes)).toBe('517215bfffe6125531d90b8540ad53f358547c3739ff63f3ca64a4c60f410be2');
    expect(provenance.originalBuildSha256).toBe(digest(buildBytes));
    expect(entries.map(([, key]) => key).sort()).toEqual(Object.keys(build).filter(key => key.endsWith('Generator')).sort());
    const generatorSources = new Set<string>();
    for (const [, key, , fingerprint] of entries) {
      expect(fingerprint(archiveRead)).toEqual(build[key]);
      for (const file of build[key].files as string[]) generatorSources.add(file);
    }
    expect(generatorSources.size).toBe(43); expect(provenance.closureCount).toBe(11);
    expect(provenance.engineFiles).toEqual(engineFiles); expect(fingerprintSources(engineFiles, archiveRead)).toBe(build.engineFingerprint);
    const checkedSources = JSON.parse(readFileSync(new URL('verified-preview22/source-after.json', evidence), 'utf8')) as { path: string; sha256: string }[];
    const sourceRows = provenance.sources as { file: string; sha256: string; bytes: number; checkedWorkingTreeSha256: string }[];
    expect(sourceRows.map(row => row.file).sort()).toEqual([...new Set([...generatorSources, ...engineFiles])].sort());
    expect(sourceRows).toHaveLength(48);
    for (const row of sourceRows) {
      const bytes = readFileSync(new URL('frozen-source/' + row.file, evidence));
      expect(bytes.byteLength).toBe(row.bytes); expect(digest(bytes)).toBe(row.sha256);
      expect(row.sha256).toBe(row.checkedWorkingTreeSha256); expect(checkedSources.find(entry => entry.path === row.file)?.sha256).toBe(row.sha256);
    }
    expect(digest(JSON.stringify(sourceRows))).toBe(provenance.sourceSnapshotSha256);
    const checkedBytes = readFileSync(new URL('verified-preview22/verification.json', evidence)), checked = JSON.parse(checkedBytes.toString());
    expect(digest(checkedBytes)).toBe(provenance.referenced.find((row: { path: string; sha256: string }) => row.path.endsWith('/unified/repair-1/verification.json')).sha256);
    expect(checked.passed).toBe(true); expect(checked.sourceStable).toBe(true); expect(checked.buildJsonSha256).toBe(digest(buildBytes));
    const unit = JSON.parse(readFileSync(new URL('verified-preview22/unit.json', evidence), 'utf8'));
    expect(unit.success).toBe(true); expect(unit.numTotalTests).toBe(306); expect(unit.numPassedTests).toBe(306);
    const first = JSON.parse(readFileSync(new URL('original-rounds/first.json', evidence), 'utf8'));
    expect(first.passed).toBe(false); expect(first.unit.passedAssertions).toBe(302); expect(first.unit.pendingAssertions).toBe(3);
    expect(provenance.acceptance).toMatchObject({ naturalVisualAccepted: false, userVisualAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false });
    const inventory = JSON.parse(readFileSync(new URL('inventory.json', evidence), 'utf8'));
    for (const row of inventory.files as { path: string; bytes: number; sha256: string }[]) {
      const bytes = readFileSync(new URL(row.path, evidence)); expect(bytes.byteLength).toBe(row.bytes); expect(digest(bytes)).toBe(row.sha256);
    }
  });

  it('round-trips all eleven stored recipes byte-for-byte while rejecting old recipe execution', () => {
    for (const [name, key] of entries) {
      const manifest = historical(name, key), recipe = manifest.generation.lastApplied!.recipe, original = structuredClone(manifest);
      expect(validateGenerationManifest(manifest)).toBe(true); expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(true);
      expect(validateGenerationRecipe(recipe, manifest.spec, 'execute')).toBe(false); expect(() => encodeGenerationRecipe(recipe)).toThrow('不兼容');
      const bytes = encodeGenerationManifest(manifest), restored = decodeGenerationManifest(bytes);
      expect(restored).toEqual(original); expect(encodeGenerationManifest(restored)).toEqual(bytes); expect(manifest).toEqual(original);
    }
  });

  it('rejects every other namespace fingerprint rather than using a global historical whitelist', () => {
    for (const [name, key, namespace] of entries) {
      const manifest = historical(name, key), recipe = manifest.generation.lastApplied!.recipe;
      expect(isStoredGeneratorFingerprint(namespace, build[key].sha256)).toBe(true);
      for (const [, otherKey, otherNamespace] of entries) if (otherKey !== key) {
        expect(isStoredGeneratorFingerprint(otherNamespace, build[key].sha256)).toBe(false);
        expect(validateGenerationRecipe({ ...recipe, generator: { ...recipe.generator, fingerprint: build[otherKey].sha256 } }, manifest.spec, 'storage')).toBe(false);
      }
    }
  });

  it('does not transfer natural-v2 history to v1, first/add roles, future versions or unknown fields', () => {
    for (const [oldKey, newKey, name] of [['detailShapeGenerator', 'naturalDetailGenerator', 'natural'], ['addDetailGenerator', 'addNaturalDetailGenerator', 'naturalAdd']] as const) {
      const manifest = historical(name, newKey), natural = manifest.generation.lastApplied!.recipe;
      expect(validateGenerationRecipe({ ...natural, generator: { ...natural.generator, fingerprint: build[oldKey].sha256 } }, manifest.spec, 'storage')).toBe(false);
      const parameters = { ...natural.parameters } as Record<string, unknown>; delete parameters.coastStructureWorld;
      expect(validateGenerationRecipe({ ...natural, generator: { ...natural.generator, version: 1 }, parameters }, manifest.spec, 'storage')).toBe(false);
    }
    for (const [name, key] of entries) {
      const manifest = historical(name, key), stored = manifest.generation.lastApplied!.recipe;
      for (const changed of [
        { ...stored, generator: { ...stored.generator, version: 3 } },
        { ...stored, generator: { ...stored.generator, id: stored.generator.id === 'add-detail-landmass' ? 'shape-detail-landmass' : 'add-detail-landmass' } },
        { ...stored, parameters: { ...stored.parameters, future: true } },
      ]) expect(validateGenerationRecipe(changed, manifest.spec, 'storage')).toBe(false);
    }
  });

  it('retains v4-only bounded scope requirements for the stored local-relief identity', async () => {
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
