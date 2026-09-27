import { beforeAll, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, cloneVerifiedAtlasDocument, createGenerationCopy, createGenerationDraft, decodeAtlasManifest, encodeAtlasManifest, hashAtlasManifest, isDetailCoastDocument, isGenerationDocument, validateAtlasDocument, validateAtlasDocumentAsync, validateAtlasManifest, verifyAtlasDocument, type AtlasCopyOrigin, type AtlasGenerationDocument } from './atlas-format';
import { generationCanonical } from './generation-contract';
import { createAtlasDraft, type AtlasDraftData } from './model';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastSampleTile, type DetailCoastTile } from './detail-coast-types';
import { SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const fast = { yieldTask: async () => {} };
const options = { size: 128 as const, seed: 'detail-coast-format-synthetic', name: '细海岸封套合成测试',
  draftId: 'atlas-66666666-6666-4666-8666-666666666666', atlasId: 'geo-66666666-6666-4666-8666-666666666666' };
let legacy: AtlasDraftData, v2: AtlasGenerationDocument<2>, v3: AtlasGenerationDocument<3>, v4: AtlasGenerationDocument<4>, populated: AtlasGenerationDocument<4>;
function sampled(bx = 0, by = 0): DetailCoastSampleTile {
  const { count } = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(count).fill(-512), elevationMeters = new Int16Array(count).fill(-300);
  coverageQ[0] = 384; elevationMeters[0] = 450; coverageQ[1] = 0; elevationMeters[1] = 0;
  return { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters };
}
async function bind(data: AtlasGenerationDocument<4>, tiles: DetailCoastTile[]) {
  data.detailCoast = new Map(tiles.map(tile => [detailCoastKey(tile.bx, tile.by), tile]));
  data.manifest.detailCoast.refs = await Promise.all(tiles.slice().sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx)
    .map(async tile => ({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) })));
  return data;
}
function tile(data: AtlasGenerationDocument<4>) {
  const value = data.detailCoast.get('coast:0:0'); if (!value || value.mode !== 'samples') throw new Error('Missing sampled test tile.'); return value;
}
function rejectManifest(value: unknown) {
  expect(validateAtlasManifest(value)).toBe(false);
  expect(() => decodeAtlasManifest(new TextEncoder().encode(generationCanonical(value)))).toThrow();
}
async function origin(data: AtlasDraftData | AtlasGenerationDocument): Promise<AtlasCopyOrigin> {
  return { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: data.manifest.version,
    sourceDraftId: data.manifest.draftId, sourceSlot: 'current', sourceManifestDigest: await hashAtlasManifest(data.manifest),
    sourceManifestRevision: data.manifest.revision, observedRootDigest: await hashAtlasManifest(data.manifest) };
}
beforeAll(async () => {
  legacy = await createAtlasDraft(options, fast); v2 = await createGenerationDraft(options, fast);
  v3 = await createGenerationDraft(options, fast, 3); v4 = await createGenerationDraft(options, fast, 4);
  populated = await bind(cloneAtlasDocument(v4), [sampled(), { format: 'lieguoji-detail-coast-tile', version: 1, bx: 1, by: 0, mode: 'land' }]);
}, 30000);

describe('explicit v4 detailed-coast document and immutable old envelopes', () => {
  it('creates only an explicit v4 with empty sparse sea, unchanged coarse layers and distinct canonical identity', async () => {
    expect(v2.manifest.version).toBe(2); expect(v4.manifest).toMatchObject({ version: 4, origin: null,
      surface: { kind: 'sparse-coast-field-v1', coordinateScale: 256, stepWorld: 2, tileCells: 32 },
      detailCoast: { format: 'lieguoji-atlas-detail-coast', version: 1, codec: 'signed-distance-q8-v1', refs: [] }, generation: { lastApplied: null } });
    expect(v4.detailCoast.size).toBe(0); expect(v4.blocks).toEqual(v2.blocks); expect(v4.manifest.blockRefs).toEqual(v2.manifest.blockRefs);
    expect(isDetailCoastDocument(v4)).toBe(true); expect(isGenerationDocument(v4)).toBe(true);
    expect(validateAtlasDocument(v4)).toBe(true); await expect(validateAtlasDocumentAsync(v4, fast)).resolves.toBe(true);
    await expect(verifyAtlasDocument(v4, fast)).resolves.toBeUndefined();
    const bytes = encodeAtlasManifest(v4.manifest); expect(decodeAtlasManifest(bytes)).toEqual(v4.manifest);
    expect(encodeAtlasManifest(decodeAtlasManifest(bytes))).toEqual(bytes);
    expect(await hashAtlasManifest(v4.manifest)).not.toBe(await hashAtlasManifest(v3.manifest));
    await expect(createGenerationDraft(options, fast, 5 as 4)).rejects.toThrow('未知');
  });

  it('reads v1/v2/v3 without mutation and rejects detailed fields in every old exact envelope', async () => {
    for (const data of [legacy, v2, v3]) {
      const before = encodeAtlasManifest(data.manifest), copy = cloneAtlasDocument(data);
      expect(decodeAtlasManifest(before)).toEqual(data.manifest); expect(encodeAtlasManifest(copy.manifest)).toEqual(before);
      await verifyAtlasDocument(data, fast); expect(encodeAtlasManifest(data.manifest)).toEqual(before);
      expect(isDetailCoastDocument(data)).toBe(false);
      rejectManifest({ ...data.manifest, detailCoast: v4.manifest.detailCoast });
      rejectManifest({ ...data.manifest, surface: v4.manifest.surface });
      expect(validateAtlasDocument({ ...data, detailCoast: new Map() })).toBe(false);
    }
  });

  it('rejects unknown or incomplete detailed surface and directory envelopes without invoking getters', () => {
    for (const surface of [undefined, null, v3.manifest.surface, { ...v4.manifest.surface, stepWorld: 1 }, { ...v4.manifest.surface, tileCells: 64 }, { ...v4.manifest.surface, coordinateScale: 512 }, { ...v4.manifest.surface, future: true }]) rejectManifest({ ...v4.manifest, surface });
    for (const detailCoast of [undefined, null, { ...v4.manifest.detailCoast, format: 'future' }, { ...v4.manifest.detailCoast, version: 2 }, { ...v4.manifest.detailCoast, codec: 'signed-distance-q8-v2' }, { ...v4.manifest.detailCoast, future: true }]) rejectManifest({ ...v4.manifest, detailCoast });
    let invoked = false; const manifest = { ...v4.manifest };
    Object.defineProperty(manifest, 'detailCoast', { enumerable: true, get: () => { invoked = true; return v4.manifest.detailCoast; } });
    expect(validateAtlasManifest(manifest)).toBe(false); expect(invoked).toBe(false);
    rejectManifest({ ...v4.manifest, version: 5 });
    expect(() => decodeAtlasManifest(new TextEncoder().encode(JSON.stringify(v4.manifest, null, 2)))).toThrow('非规范');
  });

  it('requires canonical by*64+bx references, exact bounds and at most 4096 entries', () => {
    const hash = populated.manifest.detailCoast.refs[0].hash;
    const directory = (refs: unknown) => ({ ...v4.manifest, detailCoast: { ...v4.manifest.detailCoast, refs } });
    const full = Array.from({ length: 4096 }, (_, id) => ({ bx: id % 64, by: Math.floor(id / 64), hash }));
    expect(validateAtlasManifest(directory(full))).toBe(true); // A manifest alone does not prove content availability.
    for (const refs of [full.concat(full[0]), [full[0], full[0]], [full[64], full[1]], [{ bx: 64, by: 0, hash }], [{ bx: 0, by: -1, hash }], [{ bx: 0, by: 0, hash: 'invalid' }], [{ bx: 0, by: 0, hash, future: true }], { 0: full[0], length: 1 }]) rejectManifest(directory(refs));
  });

  it('verifies actual sampled and uniform content while binding refs into the v4 manifest hash', async () => {
    expect(validateAtlasDocument(populated)).toBe(true);
    await expect(verifyAtlasDocument(populated, fast)).resolves.toBeUndefined();
    const bytes = encodeAtlasManifest(populated.manifest); expect(decodeAtlasManifest(bytes)).toEqual(populated.manifest);
    expect(await hashAtlasManifest(populated.manifest)).not.toBe(await hashAtlasManifest(v4.manifest));
    expect(populated.manifest.detailCoast.refs.map(ref => detailCoastKey(ref.bx, ref.by))).toEqual(['coast:0:0', 'coast:1:0']);
  });

  it('rejects a missing map, extra document fields, missing referenced tiles and unreferenced contents', async () => {
    const { detailCoast: _detailCoast, ...missing } = v4; void _detailCoast;
    const cases: unknown[] = [missing, { ...v4, detailCoast: {} }, { ...v4, future: true }];
    const absent = cloneAtlasDocument(populated); absent.detailCoast.delete('coast:0:0'); cases.push(absent);
    const extra = cloneAtlasDocument(v4); extra.detailCoast.set('coast:0:0', sampled()); cases.push(extra);
    const wrongKey = cloneAtlasDocument(populated), value = tile(wrongKey); wrongKey.detailCoast.delete('coast:0:0'); wrongKey.detailCoast.set('coast:1:1', value); cases.push(wrongKey);
    const wrongOwner = cloneAtlasDocument(populated); Object.assign(tile(wrongOwner), { bx: 1 }); cases.push(wrongOwner);
    const unknownTile = cloneAtlasDocument(populated); Object.assign(tile(unknownTile), { future: true }); cases.push(unknownTile);
    for (const data of cases) {
      expect(validateAtlasDocument(data)).toBe(false); await expect(validateAtlasDocumentAsync(data, fast)).resolves.toBe(false);
      await expect(verifyAtlasDocument(data, fast)).rejects.toThrow();
    }
  });

  it('rejects invalid sampled signs, heights and aliased/subarray encodings at the envelope boundary', () => {
    const badSign = cloneAtlasDocument(populated); tile(badSign).elevationMeters[0] = -2;
    const badZero = cloneAtlasDocument(populated); tile(badZero).elevationMeters[1] = 1;
    const badDistance = cloneAtlasDocument(populated); tile(badDistance).coverageQ[2] = -32768;
    const badArray = cloneAtlasDocument(populated), original = tile(badArray).coverageQ;
    const larger = new Int16Array(original.length + 1); larger.set(original); tile(badArray).coverageQ = larger.subarray(0, original.length);
    for (const data of [badSign, badZero, badDistance, badArray]) expect(validateAtlasDocument(data)).toBe(false);
  });

  it('rejects a content hash mismatch during verification and verified cloning', async () => {
    const changed = cloneAtlasDocument(populated); tile(changed).elevationMeters[0]++;
    const bytes = encodeAtlasManifest(changed.manifest);
    expect(validateAtlasDocument(changed)).toBe(true); // Structural validation never substitutes for complete hashes.
    await expect(verifyAtlasDocument(changed, fast)).rejects.toThrow('细海岸块 coast:0:0 完整摘要不符');
    await expect(cloneVerifiedAtlasDocument(changed, fast)).rejects.toThrow('细海岸块 coast:0:0 完整摘要不符');
    expect(encodeAtlasManifest(changed.manifest)).toEqual(bytes);
  });

  it('deep-clones both sampled arrays, maps and manifest refs', () => {
    const copy = cloneAtlasDocument(populated), a = tile(populated), b = tile(copy);
    expect(copy).toEqual(populated); expect(copy.detailCoast).not.toBe(populated.detailCoast);
    expect(b.coverageQ.buffer).not.toBe(a.coverageQ.buffer); expect(b.elevationMeters.buffer).not.toBe(a.elevationMeters.buffer);
    expect(copy.manifest.detailCoast.refs).not.toBe(populated.manifest.detailCoast.refs);
    b.coverageQ[0] = 512; b.elevationMeters[0] = 800; copy.detailCoast.delete('coast:1:0'); copy.manifest.detailCoast.refs.pop();
    expect(a.coverageQ[0]).toBe(384); expect(a.elevationMeters[0]).toBe(450); expect(populated.detailCoast.size).toBe(2); expect(populated.manifest.detailCoast.refs).toHaveLength(2);
  });

  it('takes private ownership of both arrays and refs before the first await', async () => {
    const caller = cloneAtlasDocument(populated), expected = cloneAtlasDocument(caller);
    const pending = cloneVerifiedAtlasDocument(caller, fast);
    tile(caller).coverageQ[0] = -512; tile(caller).elevationMeters[0] = -800;
    caller.detailCoast.clear(); caller.manifest.detailCoast.refs.length = 0; caller.blocks.clear();
    const owned = await pending; expect(owned).toEqual(expected);
    expect(tile(owned).coverageQ[0]).toBe(384); expect(tile(owned).elevationMeters[0]).toBe(450);
  });

  it('honors cancellation during detailed hash verification without returning partial authority or changing input', async () => {
    const data = await bind(cloneAtlasDocument(v4), Array.from({ length: 17 }, (_, bx) => ({ format: 'lieguoji-detail-coast-tile' as const, version: 1 as const, bx, by: 0, mode: 'land' as const })));
    const bytes = encodeAtlasManifest(data.manifest), controller = new AbortController(); let sawDetailedStage = false;
    await expect(cloneVerifiedAtlasDocument(data, { ...fast, signal: controller.signal, onProgress: progress => {
      if (progress.stage === '核验细海岸内容摘要') { sawDetailedStage = true; controller.abort(); }
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawDetailedStage).toBe(true); expect(encodeAtlasManifest(data.manifest)).toEqual(bytes); expect(data.detailCoast.size).toBe(17);
  });

  it('does not permit an old valid shape recipe or any other lastApplied payload to masquerade as v4', () => {
    const lastApplied = { recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT },
      seed: 'registered-old-shape', parameters: { pointsQ: [{ xQ: 0, yQ: 0 }, { xQ: 300000, yQ: 0 }, { xQ: 0, yQ: 300000 }], coastRoughnessWorld: 32, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128 } },
      scope: { kind: 'world' }, baseManifestDigest: populated.manifest.detailCoast.refs[0].hash, baseRootDigest: populated.manifest.detailCoast.refs[0].hash,
      baseRevision: 0, lockSetDigest: populated.manifest.detailCoast.refs[0].hash, appliedRevision: 1 };
    expect(validateAtlasManifest({ ...v3.manifest, revision: 1, generation: { ...v3.manifest.generation, lastApplied } })).toBe(true);
    rejectManifest({ ...v4.manifest, revision: 1, generation: { ...v4.manifest.generation, lastApplied } });
    rejectManifest({ ...v4.manifest, generation: { ...v4.manifest.generation, lastApplied: {} } });
  });

  it('keeps old origin limits and requires new v4 worlds to have no copy origin', async () => {
    const v4Origin = await origin(v4), v3Origin = await origin(v3);
    rejectManifest({ ...v2.manifest, origin: v4Origin }); rejectManifest({ ...v3.manifest, origin: v4Origin });
    rejectManifest({ ...v2.manifest, origin: v3Origin });
    for (const source of [legacy, v2, v3, v4]) rejectManifest({ ...v4.manifest, origin: await origin(source) });
    expect(validateAtlasManifest({ ...v3.manifest, origin: await origin(v2) })).toBe(true);
  });

  it('explicitly rejects every v4 copy direction without mutating the source', async () => {
    for (const source of [legacy, v2, v3, v4]) {
      const bytes = encodeAtlasManifest(source.manifest), sourceOrigin = await origin(source);
      await expect(createGenerationCopy(source, sourceOrigin, { draftId: `atlas-${crypto.randomUUID()}`, format: 4 }, fast)).rejects.toThrow('第四版目前仅支持明确新建');
      expect(encodeAtlasManifest(source.manifest)).toEqual(bytes);
    }
    const bytes = encodeAtlasManifest(v4.manifest), sourceOrigin = await origin(v4);
    for (const format of [2, 3] as const) await expect(createGenerationCopy(v4, sourceOrigin, { draftId: `atlas-${crypto.randomUUID()}`, format }, fast)).rejects.toThrow('第四版目前仅支持明确新建');
    expect(encodeAtlasManifest(v4.manifest)).toEqual(bytes); expect(v4.detailCoast.size).toBe(0);
  });
});
