import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ATLAS_LAYERS, cloneBlock, createAtlasDraft, decodeBlock, decodeManifest, encodeBlock, encodeManifest, getCellLayerSlot, getVertexSlot, hashBlock, type AtlasCreateOptions, type AtlasDraftData } from './model';
import { cloneAtlasDocument, cloneVerifiedAtlasDocument, createGenerationCopy, createGenerationDraft, decodeAtlasManifest, encodeAtlasManifest, hashAtlasManifest, validateAtlasDocument, validateAtlasManifest, verifyAtlasDocument, type AtlasGenerationDocument } from './atlas-format';
import { encodeMacroRecipe, generationCanonical, validateGenerationOperation, validateGenerationScope, validateMacroRecipe, type AtlasCellLockBlock, type LandformRecipe, type MacroRecipe } from './generation-contract';
import { assertAtlasLocksPreserved, decodeAtlasCellLockBlock, encodeAtlasCellLockBlock, hashAtlasCellLockBlock, hashAtlasLockSet, lockKey } from './generation-locks';
import { LANDFORM_GENERATOR_FINGERPRINT, MACRO_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const control = { yieldTask: async () => {} };
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/atlas-v1-before-ph06/${name}`, import.meta.url)));
const options = JSON.parse(new TextDecoder().decode(fixture('options.json'))) as AtlasCreateOptions;
let legacy: AtlasDraftData, base: AtlasGenerationDocument;
beforeAll(async () => { legacy = await createAtlasDraft(options, control); base = await createGenerationDraft({ ...options, draftId: 'atlas-33333333-3333-4333-8333-333333333333' }, control); }, 30000);
const recipe = (): MacroRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed: '群岛🌊原样UTF-8', parameters: { majorContinents: 3, landCoveragePermille: 450, coastWavelengthWorld: 512, reliefMeters: 2400 } });
async function withLock(flags = 3, cellId = 31 * 128 + 32) {
  const data = cloneAtlasDocument(base), column = cellId % 128, row = Math.floor(cellId / 128), bx = Math.floor(column / 32), by = Math.floor(row / 32);
  const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) };
  lock.flags[row % 32 * 32 + column % 32] = flags;
  data.locks.set(lockKey(bx, by), lock); data.manifest.constraints.lockRefs.push({ bx, by, hash: await hashAtlasCellLockBlock(lock) }); return data;
}

describe('PH06 exact format and unchanged v1 codec', () => {
  it('matches static BEFORE-source-change bytes and independent hashes, including edited catalog/membership values', async () => {
    const baseline = JSON.parse(new TextDecoder().decode(fixture('baseline.json'))) as { files: {path: string; sha256: string; bytes: number}[] };
    for (const row of baseline.files) { const bytes = fixture(row.path); expect(bytes.length).toBe(row.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256); }
    expect(encodeManifest(legacy.manifest)).toEqual(fixture('manifest-v1.bin'));
    for (const layer of ATLAS_LAYERS) expect(encodeBlock(legacy.blocks.get(`${layer}:0:0`)!)).toEqual(fixture(`${layer}-v1.bin`));
    // The pre-PH06 capture edited columns/catalogs without a durable commit;
    // its revision remains zero. Expected files are copied, never regenerated.
    const edited = cloneAtlasDocument(legacy);
    edited.manifest.catalogs = { simRegions: [{ id: 7, name: '回归区域' }], administration: [{ id: 11, kind: 'leaf', name: '回归县', parentId: null }] };
    for (const layer of ['elevation', 'sim-membership', 'admin-membership'] as const) {
      const key = `${layer}:0:0` as const, block = cloneBlock(edited.blocks.get(key)!); if (block.layer === 'geometry') throw new Error('fixture');
      if (layer === 'elevation') block.values.set([-1234, 0, 4321]); else block.values[layer === 'sim-membership' ? 1 : 2] = layer === 'sim-membership' ? 7 : 11;
      edited.blocks.set(key, block); edited.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(block);
      expect(encodeBlock(block)).toEqual(fixture(`edited-${layer}-v1.bin`));
      expect(encodeBlock(decodeBlock(fixture(`edited-${layer}-v1.bin`), edited.manifest.spec))).toEqual(fixture(`edited-${layer}-v1.bin`));
    }
    expect(encodeManifest(edited.manifest)).toEqual(fixture('edited-manifest-v1.bin'));
    expect(encodeAtlasManifest(decodeManifest(fixture('edited-manifest-v1.bin')))).toEqual(fixture('edited-manifest-v1.bin'));
    expect(encodeAtlasManifest(decodeAtlasManifest(fixture('manifest-v1.bin')))).toEqual(fixture('manifest-v1.bin'));
  });

  it('validates known recipes/scopes only and strictly preserves envelope fields', async () => {
    expect(validateMacroRecipe(recipe())).toBe(true); expect(encodeMacroRecipe(recipe())).toEqual(encodeMacroRecipe(structuredClone(recipe())));
    for (const value of [0, 7, 1.1, NaN]) { const r = recipe(); r.parameters.majorContinents = value; expect(validateMacroRecipe(r)).toBe(false); }
    for (const update of [{ extra: true }, { version: 2 }, { seed: '' }, { generator: { ...recipe().generator, fingerprint: 'f'.repeat(64) } }]) expect(validateMacroRecipe({ ...recipe(), ...update })).toBe(false);
    expect(validateGenerationScope({ kind: 'world' })).toBe(true); expect(validateGenerationScope({ kind: 'world', extra: 1 })).toBe(false);
    const local = { kind: 'cell-rectangle', column: 0, row: 0, columns: 1, rows: 1, transitionCells: 0 };
    expect(validateGenerationScope(local, base.manifest.spec)).toBe(true); expect(validateGenerationOperation(recipe(), local, base.manifest.spec)).toBe(false);
    expect(validateGenerationScope({ ...local, column: base.manifest.spec.columns }, base.manifest.spec)).toBe(false);
    expect(validateAtlasManifest(base.manifest)).toBe(true); expect(validateAtlasDocument(base)).toBe(true); expect(encodeAtlasManifest(decodeAtlasManifest(encodeAtlasManifest(base.manifest)))).toEqual(encodeAtlasManifest(base.manifest));
    for (const update of [{ version: 3 }, { future: true }, { constraints: { ...base.manifest.constraints, version: 2 } }, { generation: { ...base.manifest.generation, version: 2 } }]) expect(validateAtlasManifest({ ...base.manifest, ...update })).toBe(false);
    const record = cloneAtlasDocument(base); record.manifest.revision = 3; record.manifest.generation.lastApplied = { recipe: recipe(), scope: { kind: 'world' }, baseManifestDigest: 'a'.repeat(64), baseRootDigest: 'b'.repeat(64), baseRevision: 0, lockSetDigest: await hashAtlasLockSet(record.manifest.constraints, record.manifest.spec), appliedRevision: 1 };
    expect(validateAtlasManifest(record.manifest)).toBe(true); record.manifest.generation.lastApplied.appliedRevision = 2; expect(validateAtlasManifest(record.manifest)).toBe(false);
  });

  it('round trips an independent landforms provenance without reinterpreting the grid seed and protects unknown nested recipe/scope versions', async () => {
    const record = cloneAtlasDocument(base), landforms: LandformRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'landforms', version: 1, fingerprint: LANDFORM_GENERATOR_FINGERPRINT }, seed: '单独山系盆地种子', parameters: { mountainRanges: 4, basins: 3, reliefMeters: 3200 } };
    record.manifest.revision = 3;
    record.manifest.generation.lastApplied = { recipe: landforms, scope: { kind: 'cell-rectangle', column: 3, row: 5, columns: 15, rows: 17, transitionCells: 3 }, baseManifestDigest: 'a'.repeat(64), baseRootDigest: 'b'.repeat(64), baseRevision: 1, lockSetDigest: await hashAtlasLockSet(record.manifest.constraints, record.manifest.spec), appliedRevision: 2 };
    expect(validateAtlasManifest(record.manifest)).toBe(true);
    const encoded = encodeAtlasManifest(record.manifest), decoded = decodeAtlasManifest(encoded); expect(decoded).toEqual(record.manifest); expect(decoded.seed).toBe(base.manifest.seed);
    if (decoded.version !== 2) throw new Error('fixture format');
    const applied = decoded.generation.lastApplied?.recipe; expect(applied).toEqual(landforms);
    if (!applied || !('seed' in applied)) throw new Error('fixture must be a seeded landform recipe');
    expect(applied.seed).not.toBe(decoded.seed);
    expect(encodeAtlasManifest(decoded)).toEqual(encoded);

    for (const kind of ['fingerprint', 'generator-version', 'extra-parameter', 'scope-bounds', 'scope-field', 'scope-operation'] as const) {
      const future = structuredClone(record.manifest);
      const last = future.generation.lastApplied!;
      if (kind === 'fingerprint') last.recipe.generator.fingerprint = `${LANDFORM_GENERATOR_FINGERPRINT.startsWith('0') ? '1' : '0'}${LANDFORM_GENERATOR_FINGERPRINT.slice(1)}`;
      else if (kind === 'generator-version') Object.assign(last.recipe.generator, { version: 2 });
      else if (kind === 'extra-parameter') Object.assign(last.recipe.parameters, { islands: 4 });
      else if (kind === 'scope-bounds') Object.assign(last, { scope: { kind: 'cell-rectangle', column: record.manifest.spec.columns - 1, row: 0, columns: 2, rows: 1, transitionCells: 0 } });
      else if (kind === 'scope-field') Object.assign(last.scope, { future: true });
      else last.recipe = recipe(); // Macro remains a world-only operation.
      expect(validateAtlasManifest(future)).toBe(false); expect(() => encodeAtlasManifest(future)).toThrow();
      // Canonical JSON avoids a non-canonical-byte error masking the actual
      // future format rejection at the independently decoded manifest ingress.
      expect(() => decodeAtlasManifest(new TextEncoder().encode(generationCanonical(future)))).toThrow('不兼容');
    }
  });

  it('copies the explicit fixed point to a new v2 identity, never mutating the source or carrying an applied recipe over reset revision', async () => {
    const digest = await hashAtlasManifest(legacy.manifest), before = encodeAtlasManifest(legacy.manifest);
    const origin = { format: 'lieguoji-atlas-copy-origin' as const, version: 1 as const, sourceFormat: 1 as const, sourceDraftId: legacy.manifest.draftId, sourceSlot: 'backup' as const, sourceManifestDigest: digest, sourceManifestRevision: 0, observedRootDigest: 'a'.repeat(64) };
    const copy = await createGenerationCopy(legacy, origin, { draftId: 'atlas-44444444-4444-4444-8444-444444444444' }, control);
    expect(copy.manifest).toMatchObject({ version: 2, atlasId: legacy.manifest.atlasId, revision: 0, origin, generation: { lastApplied: null } }); expect(copy.blocks).toEqual(legacy.blocks); expect(copy.locks.size).toBe(0);
    const block = copy.blocks.get('elevation:0:0')!; if (block.layer !== 'elevation') throw new Error('fixture'); block.values[0] = 200;
    expect(getCellLayerSlot(legacy, 'elevation', 0).block.values[0]).toBe(-100); expect(encodeAtlasManifest(legacy.manifest)).toEqual(before);
    await expect(createGenerationCopy(legacy, origin, { draftId: legacy.manifest.draftId }, control)).rejects.toThrow('原身份');
    await expect(createGenerationCopy(legacy, { ...origin, sourceManifestRevision: 1 }, { draftId: copy.manifest.draftId }, control)).rejects.toThrow('来源');
  });

  it('pins all v2 buffers before yielding and refuses unknown top-level fields or missing lock references', async () => {
    const input = await withLock(), original = input.locks.values().next().value!.flags.slice(); let mutated = false;
    const result = await cloneVerifiedAtlasDocument(input, { yieldTask: async () => { if (!mutated) { mutated = true; input.locks.values().next().value!.flags.fill(0); } } });
    expect(result.locks.values().next().value!.flags).toEqual(original);
    expect(validateAtlasDocument({ ...result, private: true })).toBe(false); const missing = cloneAtlasDocument(result); missing.locks.clear(); await expect(verifyAtlasDocument(missing, control)).rejects.toThrow('地块锁');
    const wrongHash = cloneAtlasDocument(result); wrongHash.manifest.constraints.lockRefs[0].hash = '0'.repeat(64); await expect(verifyAtlasDocument(wrongHash, control)).rejects.toThrow('摘要');
  });
});

describe('PH06 LGAL codec and actual geography protection', () => {
  it('round trips exact known LGAL bytes and rejects unknown bits/version/reserved/zero/trailing data', async () => {
    const data = await withLock(), block = [...data.locks.values()][0], bytes = encodeAtlasCellLockBlock(block);
    expect(bytes.length).toBe(1040); expect([...bytes.slice(0, 6)]).toEqual([76, 71, 65, 76, 1, 0]); expect(decodeAtlasCellLockBlock(bytes, data.manifest.spec)).toEqual(block);
    for (const [index, value] of [[4, 2], [12, 1], [16, 4], [6, 16]]) { const bad = bytes.slice(); bad[index] = value; expect(() => decodeAtlasCellLockBlock(bad, data.manifest.spec)).toThrow(); }
    expect(() => decodeAtlasCellLockBlock(new Uint8Array([...bytes, 0]))).toThrow(); const zero = bytes.slice(); zero.fill(0, 16); expect(() => decodeAtlasCellLockBlock(zero)).toThrow();
    expect(await hashAtlasLockSet(base.manifest.constraints, base.manifest.spec)).not.toBe(await hashAtlasLockSet(base.manifest.constraints, { ...base.manifest.spec, columns: 256, rows: 256 }));
  });

  it('protects exact elevation and shared vertices across owner-block boundaries, while allowing unlocked changes', async () => {
    const cell = 31 * 128 + 32, locked = await withLock(), next = cloneAtlasDocument(locked), slot = getCellLayerSlot(next, 'elevation', cell); slot.block.values[slot.slot]++;
    expect(() => assertAtlasLocksPreserved(locked, next, [cell], [])).toThrow('准确高程');
    const coast = await withLock(1), land = cloneAtlasDocument(coast), landSlot = getCellLayerSlot(land, 'elevation', cell); landSlot.block.values[landSlot.slot] = 0;
    expect(() => assertAtlasLocksPreserved(coast, land, [cell], [])).toThrow('海陆');
    const geometric = cloneAtlasDocument(coast), sharedVertex = 32 * 129 + 32, vertex = getVertexSlot(geometric, sharedVertex); vertex.block.xyQ[vertex.slot * 2]++;
    expect(vertex.key).toBe('geometry:0:0'); expect(() => assertAtlasLocksPreserved(coast, geometric, [], [sharedVertex])).toThrow('共享顶点');
    const free = cloneAtlasDocument(locked), freeSlot = getCellLayerSlot(free, 'elevation', 0); freeSlot.block.values[freeSlot.slot] = 800;
    expect(() => assertAtlasLocksPreserved(locked, free, [0], [])).not.toThrow();
    free.manifest.constraints.lockRefs = []; free.locks.clear(); expect(() => assertAtlasLocksPreserved(locked, free)).toThrow('锁集合');
  });
});
