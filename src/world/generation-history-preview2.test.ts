import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGenerationManifest, encodeGenerationManifest, hashGenerationManifest, validateGenerationManifest } from './generation-format';
import { encodeGenerationRecipe, generationCanonical, validateGenerationOperation, validateGenerationRecipe, type AtlasDraftManifestV2 } from './generation-contract';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v2-generation-history-preview2/${name}`, import.meta.url)));
const evidence = (name: string) => new Uint8Array(readFileSync(new URL(`../../docs/evidence/ph06-handdraw-2026-09-27/${name}`, import.meta.url)));
const parse = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
// Fixed synthetic codec bytes. The five identities come from the locally tested
// uncommitted-source build; neither this fixture nor that build was published.
const golden = [
  { file: 'macro.json', buildKey: 'macroGenerator', sha256: '11a7f28e9b646f793155390103de17881d154d5404ea185a8157ea471311a31c', recipeSha256: 'cd8cedd02bebe1290c9e62d8851272fce65b3eb56252f6a31052b061270b1cae', fingerprint: 'b0aa8d84c950afd34a1c5fd098626682950b7a38865ae379bcb1d20f41427b1c' },
  { file: 'landforms.json', buildKey: 'landformGenerator', sha256: '8308cc9f76fbd6dd7c085df4029c4f123f23d7fc35f013c8be117ea88ccc1530', recipeSha256: 'de3767c33df64d7e7f583bba6716093428c96dc7f8699dcb8dc760bfc72c3b4e', fingerprint: 'b2f9104fed3015eecb53d352fd1b1fb2e1efe6b6af561c3770f1c2d8719e2177' },
  { file: 'islands.json', buildKey: 'islandGenerator', sha256: 'e593ca12a11dfb3d10099f18d6891a1f181b3888f5dcd32e53e94582b0456aa7', recipeSha256: '0a51088fbe74ccd23e1cf0a1bffbfea8f57ef35af64448d3346c46069efd2352', fingerprint: 'fa97c165ccd6b7ce9fbe1f634e11187c792afddf3bc8e49afbc2f1126aa7d16d' },
  { file: 'coast.json', buildKey: 'coastGenerator', sha256: 'd7a06633909d7cd2ea5308937aa8204351b207661542557a9e9dc44109fcd0d0', recipeSha256: '6734bd7effd4892ec31468706343a0f70918b91af5b9ef9b2ec3879bd21c3edf', fingerprint: '75a68ae6c93e95cee6cd8e0b5bd55fd1df4dff8d3e3126bddaffd8afe4035b3f' },
  { file: 'shape.json', buildKey: 'shapeGenerator', sha256: 'c4b9767f59e69a8df49fc36cc486a62d11615d35647ea430298e462ec4b4bd84', recipeSha256: '60614f18cc95ae4d6ff36a1055990d2562611489903cefd4173eb3a6edfb99df', fingerprint: '1ff3b8a2eff5f4211a2bdec0d13ca6f1c24dd2cc530e087f906b8e9a6e5b7211' },
] as const;

describe('locally tested preview.2 recipe provenance remains immutable storage history', () => {
  it('binds all five historical identities to fixed local build, source and browser evidence without claiming publication', () => {
    const baseline = parse(fixture('baseline.json')), buildBytes = evidence('build.json'), sourcesBytes = evidence('sources.json'), coverageBytes = evidence('handdraw-coverage.json');
    expect(hash(buildBytes)).toBe('9c3d43ed6f1d276589f472702ae75b60b5a0923a8d71d9121fcb15eb585bb70b');
    expect(hash(sourcesBytes)).toBe('9503532343c896ffab55b42acb6b6e505c11418ed7008aa4e6b15375251ff52f');
    expect(hash(coverageBytes)).toBe('77903f44bd52f4dcd59603aa4a034a7170fcb110d638b634ed2f0f9b69befbfb');
    const build = parse(buildBytes), sources = parse(sourcesBytes), coverage = parse(coverageBytes);
    expect(baseline.published).toBe(false);
    expect(baseline.workingTreeChanges).toBe(true);
    expect(baseline.buildJsonSha256).toBe(hash(buildBytes));
    expect(baseline.sourceEvidenceSha256).toBe(hash(sourcesBytes));
    expect(baseline.browserEvidenceSha256).toBe(hash(coverageBytes));
    expect(build.version).toBe('0.5.0-preview.2');
    expect(build.commit).toBe('90cdabc6fa1c0cd0d3f8d4037b93870b63421db5');
    expect(sources.baseCommit).toBe(build.commit);
    expect(sources.workingTreeChanges).toBe(true);
    expect(sources.sourceSetSha256).toBe('0029b59e996b4a25edf466dde46ca30c3b573d3d3ecabe5020b88638f513942e');
    expect(coverage.frozenBuildSHA256).toBe(hash(buildBytes));
    expect(coverage.stats).toMatchObject({ expected: 6, skipped: 0, unexpected: 0, flaky: 0 });
    for (const row of golden) {
      expect(build[row.buildKey].sha256).toBe(row.fingerprint);
      expect(parse(fixture(row.file)).generation.lastApplied.recipe.generator.fingerprint).toBe(row.fingerprint);
      expect(baseline.files.find((file: { file: string }) => file.file === row.file)).toMatchObject({ sha256: row.sha256, recipeSha256: row.recipeSha256 });
    }
  });

  it.each(golden)('preserves $file exact bytes, recipe and hashes without enabling old execution', async row => {
    const bytes = fixture(row.file); expect(hash(bytes)).toBe(row.sha256);
    const manifest = decodeGenerationManifest(bytes), original = structuredClone(manifest), last = manifest.generation.lastApplied!;
    expect(validateGenerationManifest(manifest)).toBe(true);
    expect(validateGenerationRecipe(last.recipe, manifest.spec, 'storage')).toBe(true);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec, 'storage')).toBe(true);
    expect(last.recipe.generator.fingerprint).toBe(row.fingerprint);
    expect(hash(generationCanonical(last.recipe))).toBe(row.recipeSha256);
    expect(encodeGenerationManifest(manifest)).toEqual(bytes);
    expect(await hashGenerationManifest(manifest)).toBe(row.sha256);
    expect(manifest).toEqual(original);
    expect(validateGenerationRecipe(last.recipe)).toBe(false);
    expect(validateGenerationOperation(last.recipe, last.scope, manifest.spec)).toBe(false);
    expect(() => encodeGenerationRecipe(last.recipe)).toThrow('不兼容');
  });

  it.each(golden)('rejects unknown, crossed, future and malformed storage payloads for $file', row => {
    const base = decodeGenerationManifest(fixture(row.file));
    for (const mutation of ['unknown', 'crossed', 'version', 'extra', 'bad-parameter'] as const) {
      const manifest = structuredClone(base), recipe = manifest.generation.lastApplied!.recipe;
      if (mutation === 'unknown') recipe.generator.fingerprint = '0'.repeat(64);
      else if (mutation === 'crossed') recipe.generator.fingerprint = golden[row.file === 'macro.json' ? 4 : 0].fingerprint;
      else if (mutation === 'version') Object.assign(recipe.generator, { version: 2 });
      else if (mutation === 'extra') Object.assign(recipe.parameters, { future: true });
      else Object.assign(recipe.parameters, { [Object.keys(recipe.parameters)[0]]: -1 });
      expect(validateGenerationRecipe(recipe, manifest.spec, 'storage')).toBe(false);
      expect(validateGenerationManifest(manifest)).toBe(false);
      expect(() => encodeGenerationManifest(manifest)).toThrow('无效');
      expect(() => decodeGenerationManifest(new TextEncoder().encode(generationCanonical(manifest)))).toThrow('不兼容');
    }
  });

  it('keeps frozen historical contours unchanged and rejects invalid contour/scope or future outer format', () => {
    const bytes = fixture('shape.json'), raw = parse(bytes) as AtlasDraftManifestV2;
    const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
    freeze(raw);
    expect(validateGenerationManifest(raw)).toBe(true);
    expect(encodeGenerationManifest(raw)).toEqual(bytes);
    expect(validateGenerationManifest({ ...raw, version: 3 })).toBe(false);
    const crossed = structuredClone(raw);
    Object.assign(crossed.generation.lastApplied!.recipe.parameters, { pointsQ: [{ xQ: 0, yQ: 0 }, { xQ: 100, yQ: 100 }, { xQ: 0, yQ: 100 }, { xQ: 100, yQ: 0 }] });
    expect(validateGenerationManifest(crossed)).toBe(false);
    const local = structuredClone(raw);
    local.generation.lastApplied!.scope = { kind: 'cell-rectangle', column: 0, row: 0, columns: 20, rows: 20, transitionCells: 3 };
    expect(validateGenerationManifest(local)).toBe(false);
    expect(() => decodeGenerationManifest(new TextEncoder().encode(JSON.stringify(raw, null, 2)))).toThrow('非规范');
  });
});
