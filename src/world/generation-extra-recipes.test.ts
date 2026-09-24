import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ATLAS_LAYERS, decodeBlock, encodeBlock } from './model';
import { cloneAtlasDocument, cloneVerifiedAtlasDocument, createGenerationDraft, decodeAtlasManifest, encodeAtlasManifest, validateAtlasManifest, type AtlasGenerationDocument } from './atlas-format';
import { encodeGenerationRecipe, generationCanonical, validateCoastRecipe, validateGenerationRecipe, validateIslandRecipe, type CoastRecipe, type GenerationRecipe, type IslandRecipe } from './generation-contract';
import { hashAtlasLockSet } from './generation-locks';
import { COAST_GENERATOR_FINGERPRINT, ISLAND_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const islands = (): IslandRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'island-chains', version: 1, fingerprint: ISLAND_GENERATOR_FINGERPRINT }, seed: '弯曲群岛🌊原样种子', parameters: { chainCount: 2, islandsPerChain: 3, radiusWorld: 96, reliefMeters: 1600 } });
const coast = (): CoastRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'coast-smoothing', version: 1, fingerprint: COAST_GENERATOR_FINGERPRINT }, parameters: { strengthPermille: 500, iterations: 2 } });
const unknownFingerprint = (known: string) => `${known.startsWith('0') ? '1' : '0'}${known.slice(1)}`;
const decodeRecipe = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as GenerationRecipe;
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v1-before-ph06/${name}`, import.meta.url)));
let base: AtlasGenerationDocument;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'grid-seed-independent-of-every-recipe', name: '独立岛链海岸格式测试' }, { yieldTask: async () => {} }); });

describe('PH06 exact island and seedless coast recipe registration', () => {
  it('encodes separate canonical identities, preserves island seed, and gives coast no unused seed', () => {
    const island = islands(), smoothing = coast();
    expect(validateIslandRecipe(island)).toBe(true); expect(validateCoastRecipe(island)).toBe(false);
    expect(validateCoastRecipe(smoothing)).toBe(true); expect(validateIslandRecipe(smoothing)).toBe(false);
    expect(new TextDecoder().decode(encodeGenerationRecipe(island))).toBe(`{"format":"lieguoji-atlas-recipe","generator":{"fingerprint":"${ISLAND_GENERATOR_FINGERPRINT}","id":"island-chains","version":1},"parameters":{"chainCount":2,"islandsPerChain":3,"radiusWorld":96,"reliefMeters":1600},"seed":"弯曲群岛🌊原样种子","version":1}`);
    expect(new TextDecoder().decode(encodeGenerationRecipe(smoothing))).toBe(`{"format":"lieguoji-atlas-recipe","generator":{"fingerprint":"${COAST_GENERATOR_FINGERPRINT}","id":"coast-smoothing","version":1},"parameters":{"iterations":2,"strengthPermille":500},"version":1}`);
    const reordered: CoastRecipe = { parameters: { iterations: 2, strengthPermille: 500 }, generator: { fingerprint: COAST_GENERATOR_FINGERPRINT, version: 1, id: 'coast-smoothing' }, version: 1, format: 'lieguoji-atlas-recipe' };
    expect(encodeGenerationRecipe(reordered)).toEqual(encodeGenerationRecipe(smoothing));
    expect(validateGenerationRecipe({ ...smoothing, seed: 'ignored seed' })).toBe(false);
    expect(validateGenerationRecipe({ ...smoothing, seed: undefined })).toBe(false);
    const missingSeed: Partial<IslandRecipe> = islands(); delete missingSeed.seed; expect(validateGenerationRecipe(missingSeed)).toBe(false);
  });

  it('accepts every min/max parameter combination only at implemented integer boundaries', () => {
    for (const chainCount of [1, 3]) for (const islandsPerChain of [2, 6]) for (const radiusWorld of [64, 128]) for (const reliefMeters of [200, 3000]) {
      const recipe = { ...islands(), parameters: { chainCount, islandsPerChain, radiusWorld, reliefMeters } };
      expect(validateIslandRecipe(recipe)).toBe(true); expect(validateGenerationRecipe(recipe)).toBe(true); expect(decodeRecipe(encodeGenerationRecipe(recipe))).toEqual(recipe);
    }
    for (const strengthPermille of [100, 1000]) for (const iterations of [1, 4]) {
      const recipe = { ...coast(), parameters: { strengthPermille, iterations } };
      expect(validateCoastRecipe(recipe)).toBe(true); expect(validateGenerationRecipe(recipe)).toBe(true); expect(decodeRecipe(encodeGenerationRecipe(recipe))).toEqual(recipe);
    }
  });

  it('rejects outside-range, fractional, non-number and non-finite parameter values without clamping', () => {
    const islandRanges = { chainCount: [1, 3], islandsPerChain: [2, 6], radiusWorld: [64, 128], reliefMeters: [200, 3000] } as const;
    const coastRanges = { strengthPermille: [100, 1000], iterations: [1, 4] } as const;
    for (const [make, ranges] of [[islands, islandRanges], [coast, coastRanges]] as const) {
      for (const [key, [min, max]] of Object.entries(ranges)) for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity, -Infinity, String(min), null, undefined, true]) {
        const recipe = make(), invalid = { ...recipe, parameters: { ...recipe.parameters, [key]: value } };
        expect(validateGenerationRecipe(invalid)).toBe(false); expect(() => encodeGenerationRecipe(invalid as GenerationRecipe)).toThrow('不兼容');
      }
    }
    for (const seed of ['', ' \n\t', 'x'.repeat(121), 1, null]) expect(validateGenerationRecipe({ ...islands(), seed })).toBe(false);
    const exact = { ...islands(), seed: ` ${'中'.repeat(118)} ` }; expect(exact.seed.length).toBe(120); expect(decodeRecipe(encodeGenerationRecipe(exact))).toEqual(exact);
  });

  it('rejects unknown envelope or generator versions, cross-wired fingerprints, and extra or missing fields', () => {
    for (const recipe of [islands(), coast()]) {
      const invalid: unknown[] = [
        { ...recipe, version: 2 }, { ...recipe, format: 'future-recipe' }, { ...recipe, future: true },
        { ...recipe, generator: { ...recipe.generator, version: 2 } }, { ...recipe, generator: { ...recipe.generator, id: 'future-generator' } },
        { ...recipe, generator: { ...recipe.generator, fingerprint: unknownFingerprint(recipe.generator.fingerprint) } },
        { ...recipe, generator: { ...recipe.generator, fingerprint: recipe.generator.id === 'island-chains' ? COAST_GENERATOR_FINGERPRINT : ISLAND_GENERATOR_FINGERPRINT } },
        { ...recipe, generator: { ...recipe.generator, extra: true } }, { ...recipe, parameters: { ...recipe.parameters, extra: 1 } },
        { ...recipe, parameters: {} }, { ...recipe, parameters: recipe.generator.id === 'island-chains' ? coast().parameters : islands().parameters },
      ];
      for (const key of Object.keys(recipe)) { const missing = { ...recipe } as Record<string, unknown>; delete missing[key]; invalid.push(missing); }
      for (const raw of invalid) { expect(validateGenerationRecipe(raw)).toBe(false); expect(() => encodeGenerationRecipe(raw as GenerationRecipe)).toThrow('不兼容'); }
    }
  });

  it('never executes accessors at any recipe layer and refuses inherited, hidden or symbol properties', () => {
    let calls = 0;
    for (const recipe of [islands(), coast()]) {
      for (const layer of ['root', 'generator', 'parameters'] as const) {
        const raw = structuredClone(recipe), target = layer === 'root' ? raw : raw[layer], key = Object.keys(target)[0];
        Object.defineProperty(target, key, { enumerable: true, get: () => { calls++; throw new Error('must not invoke'); } });
        expect(validateGenerationRecipe(raw)).toBe(false); expect(() => encodeGenerationRecipe(raw)).toThrow('不兼容');
      }
      for (const layer of ['root', 'generator', 'parameters'] as const) {
        const hidden = structuredClone(recipe), symbol = structuredClone(recipe);
        Object.defineProperty(layer === 'root' ? hidden : hidden[layer], 'future', { value: 1 });
        Object.defineProperty(layer === 'root' ? symbol : symbol[layer], Symbol('future'), { value: 1 });
        expect(validateGenerationRecipe(hidden)).toBe(false); expect(validateGenerationRecipe(symbol)).toBe(false);
      }
      expect(validateGenerationRecipe(Object.assign(Object.create({ inherited: true }), recipe))).toBe(false);
      expect(validateGenerationRecipe({ ...recipe, parameters: Object.assign(Object.create({ inherited: true }), recipe.parameters) })).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it('keeps encoded parameter snapshots independent from source and decoded-object mutation', () => {
    for (const source of [islands(), coast()]) {
      const before = structuredClone(source), encoded = encodeGenerationRecipe(source), secondEncoding = encodeGenerationRecipe(source), decoded = decodeRecipe(encoded);
      Object.assign(source.parameters, source.generator.id === 'island-chains' ? { radiusWorld: 128 } : { iterations: 4 });
      if ('seed' in source) source.seed = 'later caller mutation';
      source.generator.fingerprint = unknownFingerprint(source.generator.fingerprint);
      expect(decodeRecipe(encoded)).toEqual(before); expect(secondEncoding).toEqual(encoded);
      Object.assign(decoded.parameters, { unwanted: true }); expect(decodeRecipe(encoded)).toEqual(before);
      encoded.fill(0); expect(decodeRecipe(secondEncoding)).toEqual(before);
    }
  });

  it.each(['islands', 'coast'] as const)('owns %s source parameters before the first document-validation yield', async kind => {
    const source = cloneAtlasDocument(base), recipe = kind === 'islands' ? islands() : coast(); source.manifest.revision = 1;
    source.manifest.generation.lastApplied = { recipe, scope: { kind: 'world' }, baseManifestDigest: 'a'.repeat(64), baseRootDigest: 'b'.repeat(64), baseRevision: 0, lockSetDigest: await hashAtlasLockSet(source.manifest.constraints, source.manifest.spec), appliedRevision: 1 };
    const expected = structuredClone(source.manifest); let mutated = false;
    const owned = await cloneVerifiedAtlasDocument(source, { yieldTask: async () => {
      if (mutated) return; mutated = true;
      Object.assign(recipe.parameters, kind === 'islands' ? { chainCount: 3, radiusWorld: 128 } : { iterations: 4 });
      if ('seed' in recipe) recipe.seed = 'caller seed after validation yield';
      recipe.generator.fingerprint = unknownFingerprint(recipe.generator.fingerprint);
    } });
    expect(mutated).toBe(true); expect(owned.manifest).toEqual(expected); expect(owned.manifest.generation.lastApplied!.recipe).not.toBe(recipe);
    expect(owned.manifest.generation.lastApplied!.recipe.parameters).not.toBe(recipe.parameters);
  });

  it.each(['islands', 'coast'] as const)('round trips %s lastApplied with exact canonical bytes and independent geography seed', async kind => {
    const recipe = kind === 'islands' ? islands() : coast(), manifest = structuredClone(base.manifest); manifest.revision = 5;
    manifest.generation.lastApplied = { recipe, scope: { kind: 'world' }, baseManifestDigest: 'a'.repeat(64), baseRootDigest: 'b'.repeat(64), baseRevision: 2, lockSetDigest: await hashAtlasLockSet(manifest.constraints, manifest.spec), appliedRevision: 3 };
    expect(validateAtlasManifest(manifest)).toBe(true);
    const original = structuredClone(manifest), bytes = encodeAtlasManifest(manifest), decoded = decodeAtlasManifest(bytes);
    expect(decoded).toEqual(original); expect(decoded.seed).toBe(base.manifest.seed); expect(encodeAtlasManifest(decoded)).toEqual(bytes);
    if (decoded.version !== 2) throw new Error('fixture format');
    expect(decoded.generation.lastApplied?.recipe).toEqual(recipe);
    if (kind === 'coast') expect(Object.hasOwn(decoded.generation.lastApplied!.recipe, 'seed')).toBe(false);
    Object.assign(recipe.parameters, { laterCallerField: true });
    expect(decoded).toEqual(original); expect(decodeAtlasManifest(bytes)).toEqual(original);
    const spaced = new TextEncoder().encode(JSON.stringify(original, null, 2)); expect(() => decodeAtlasManifest(spaced)).toThrow('非规范');
    for (const mutate of [
      (raw: typeof original) => { raw.generation.lastApplied!.recipe.generator.fingerprint = unknownFingerprint(raw.generation.lastApplied!.recipe.generator.fingerprint); },
      (raw: typeof original) => { Object.assign(raw.generation.lastApplied!.recipe.generator, { version: 2 }); },
      (raw: typeof original) => { Object.assign(raw.generation.lastApplied!.recipe, { version: 2 }); },
      (raw: typeof original) => { Object.assign(raw.generation.lastApplied!.recipe.parameters, { extra: true }); },
      (raw: typeof original) => { Object.assign(raw.generation.lastApplied!, { scope: { kind: 'future-local' } }); },
    ]) {
      const future = structuredClone(original); mutate(future);
      expect(validateAtlasManifest(future)).toBe(false); expect(() => encodeAtlasManifest(future)).toThrow();
      expect(() => decodeAtlasManifest(new TextEncoder().encode(generationCanonical(future)))).toThrow('不兼容');
    }
  });

  it('reuses the static pre-PH06 v1 bytes without regenerating expectations or adding recipe fields', () => {
    const baseline = JSON.parse(new TextDecoder().decode(fixture('baseline.json'))) as { files: {path: string; sha256: string; bytes: number}[] };
    for (const row of baseline.files) { const bytes = fixture(row.path); expect(bytes.length).toBe(row.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256); }
    for (const name of ['manifest-v1.bin', 'edited-manifest-v1.bin']) {
      const bytes = fixture(name), manifest = decodeAtlasManifest(bytes);
      expect(manifest.version).toBe(1); expect(Object.hasOwn(manifest, 'generation')).toBe(false); expect(encodeAtlasManifest(manifest)).toEqual(bytes);
      for (const layer of ATLAS_LAYERS) {
        const blockName = name.startsWith('edited-') && layer !== 'geometry' ? `edited-${layer}-v1.bin` : `${layer}-v1.bin`;
        const blockBytes = fixture(blockName); expect(encodeBlock(decodeBlock(blockBytes, manifest.spec))).toEqual(blockBytes);
      }
    }
  });
});
