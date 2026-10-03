import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGenerationDraft, encodeAtlasManifest, isDetailCoastDocument, verifyAtlasDocument, type AtlasDetailCoastDocument } from '../atlas-format';
import * as Base from '../detail-coast-base';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout } from '../detail-coast-types';
import { generationCanonical, generationDigest } from '../generation-contract';
import { hashAtlasCellLockBlock, lockKey } from '../generation-locks';
import { hashBlock } from '../model';
import { getAtlasStorage, type AtlasStoredRoot } from '../storage';
import { getCellQuad } from '../topology';
import { validateCountryWorldGeography } from './core';
import { validateCountryDocument, type CountryDocument } from './model';
import { COUNTRY_GEOGRAPHY_LIMITS, countryCellLandPolygons, countryClaimCells, countryGeographySource, countryLandAt, decodeCountryGeography,
  prepareCountryGeography, validateCountrySource, type CountryGeographyRecord, type CountrySource } from './geography';

const fast = { yieldTask: async () => {} }, api = getAtlasStorage(4);
let fixture: AtlasDetailCoastDocument, record: CountryGeographyRecord;
async function publish(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null) {
  const prepared = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, fast);
  const contents = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let offset = 0; offset < contents.length; offset += 16) await api.stageAtlasBlocks(prepared.preparationId, contents.slice(offset, offset + 16), fast);
  return api.commitAtlasPreparation(prepared.preparationId, fast);
}
const sourceOf = (receipt: Awaited<ReturnType<typeof publish>>): CountrySource => ({ draftId: receipt.draftId, revision: receipt.revision,
  rootDigest: receipt.rootDigest, manifestDigest: receipt.manifestDigest, atlasFormat: 4 });
beforeAll(async () => {
  globalThis.indexedDB = new IDBFactory();
  fixture = await createGenerationDraft({ size: 128, name: '独立建国地理合成海湾', seed: 'country-geography-fine-bay' }, fast, 4);
  for (const block of fixture.blocks.values()) {
    // Deliberately misleading positive coarse height under the actual sea bay.
    if (block.layer === 'elevation') block.values.fill(500);
    if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
      const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % 129 * 32 * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / 129) * 32 * 256;
    }
  }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  const layout = detailCoastOwnerLayout(0, 0), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
  for (let index = 0; index < layout.count; index++) {
    const x = index % layout.width, y = Math.floor(index / layout.width);
    const sea = x > 16 || x >= 6 && x <= 10 && y >= 4 && y <= 12;
    coverageQ[index] = x === 16 ? 0 : sea ? -512 : 512;
    elevationMeters[index] = x === 16 ? 0 : sea ? -180 : 720;
  }
  const coast = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples', coverageQ, elevationMeters } as const;
  const land = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 2, by: 0, mode: 'land' } as const;
  for (const tile of [coast, land]) { fixture.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile); fixture.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) }); }
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) } as const; lock.flags[0] = 3;
  fixture.locks.set(lockKey(0, 0), lock); fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }];
  await verifyAtlasDocument(fixture, fast);
  record = await prepareCountryGeography(sourceOf(await publish(fixture)), fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => vi.restoreAllMocks());
async function rehash(value: CountryGeographyRecord) {
  value.encodedBytes = value.sourceRoot.length + value.manifest.length + [...value.blocks, ...value.locks, ...value.detailCoast].reduce((sum, row) => sum + row.bytes.length, 0);
  const refs = (rows: CountryGeographyRecord['blocks']) => rows.map(row => ({ key: row.key, sha256: row.sha256, bytes: row.bytes.length }));
  value.sha256 = await generationDigest(new TextEncoder().encode(generationCanonical({ format: value.format, version: value.version, source: value.source,
    sourceRoot: await generationDigest(value.sourceRoot), manifest: await generationDigest(value.manifest), blocks: refs(value.blocks), locks: refs(value.locks), detailCoast: refs(value.detailCoast), encodedBytes: value.encodedBytes })));
  return value;
}

describe('independent original-identity country geography', () => {
  it('reads exactly current without writes and preserves original identity, locks and fine bytes independently of the source DB', async () => {
    const receipt = await publish(fixture), source = sourceOf(receipt), before = await api.exportAtlasRawBackup(source.draftId);
    const actual = await prepareCountryGeography(source, fast);
    expect(actual.source).toEqual(source); expect(actual.manifest).toEqual(encodeAtlasManifest(fixture.manifest));
    expect(actual.sourceRoot).toEqual(api.encodeAtlasRoot(receipt.root));
    expect(actual.encodedBytes).toBe(actual.sourceRoot.length + actual.manifest.length + [...actual.blocks, ...actual.locks, ...actual.detailCoast].reduce((sum, row) => sum + row.bytes.length, 0));
    expect(await api.exportAtlasRawBackup(source.draftId)).toEqual(before);
    globalThis.indexedDB = new IDBFactory(); const open = vi.spyOn(indexedDB, 'open');
    const restored = await decodeCountryGeography(actual, fast);
    expect(restored).toEqual(fixture); expect(open).not.toHaveBeenCalled(); expect(await indexedDB.databases()).toEqual([]);
    expect(restored.manifest.draftId).toBe(fixture.manifest.draftId); expect(restored.manifest.atlasId).toBe(fixture.manifest.atlasId);
    restored.blocks.clear(); expect((await decodeCountryGeography(actual, fast)).blocks.size).toBe(fixture.blocks.size);
  });

  it('rejects missing/stale/future sources before making a country record and captures caller identity before any yield', async () => {
    const source = { ...record.source }, getter = vi.fn(() => source.draftId), malformed = { ...source };
    Object.defineProperty(malformed, 'draftId', { enumerable: true, get: getter });
    const open = vi.spyOn(indexedDB, 'open');
    expect(validateCountrySource(malformed)).toBe(false);
    await expect(prepareCountryGeography(malformed, fast)).rejects.toThrow('身份'); expect(getter).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    await expect(prepareCountryGeography({ ...source, atlasFormat: 3 } as unknown as CountrySource, fast)).rejects.toThrow('身份');
    await expect(prepareCountryGeography(source, fast)).rejects.toThrow('不存在');
    const receipt = await publish(fixture), expected = sourceOf(receipt);
    await expect(prepareCountryGeography({ ...expected, rootDigest: 'a'.repeat(64) }, fast)).rejects.toThrow('current');
    const mutable = { ...expected };
    const accepted = await prepareCountryGeography(mutable, { ...fast, onProgress: () => { mutable.revision = 999; mutable.manifestDigest = 'f'.repeat(64); } });
    expect(accepted.source).toEqual(expected); expect((await api.openAtlasDraft(expected.draftId, fast))?.root).toEqual(receipt.root);
  });

  it('detects a real source current advancement during encoding without writing or relabeling the older source', async () => {
    const original = await publish(fixture), next = structuredClone(fixture); next.manifest.revision++; next.manifest.name = '来源已推进';
    let encodeReached = false, advanced = false;
    await expect(prepareCountryGeography(sourceOf(original), {
      onProgress: progress => { if (progress.stage === '准备独立建国地理快照') encodeReached = true; },
      yieldTask: async () => { if (encodeReached && !advanced) { advanced = true; await publish(next, original.root); } },
    })).rejects.toThrow('current');
    expect(advanced).toBe(true); expect((await api.openAtlasDraft(original.draftId, fast))?.manifest).toEqual(next.manifest);
    const archived = await decodeCountryGeography(record, fast); expect(archived.manifest.revision).toBe(0); expect(archived).toEqual(fixture);
  });

  it('rejects corrupt/future encodings, wrong original roots, missing/extra references and overstated byte budgets', async () => {
    const raw = structuredClone(record); raw.detailCoast[0].bytes[20] ^= 1;
    await expect(decodeCountryGeography(raw, fast)).rejects.toThrow('摘要');
    const missing = structuredClone(record); missing.blocks.pop(); await rehash(missing);
    await expect(decodeCountryGeography(missing, fast)).rejects.toThrow('引用集合');
    const wrongRoot = structuredClone(record); wrongRoot.source.rootDigest = 'b'.repeat(64); await rehash(wrongRoot);
    await expect(decodeCountryGeography(wrongRoot, fast)).rejects.toThrow('原身份');
    const changedFine = structuredClone(record); changedFine.detailCoast[0].bytes[20] ^= 1; changedFine.detailCoast[0].sha256 = await generationDigest(changedFine.detailCoast[0].bytes); await rehash(changedFine);
    await expect(decodeCountryGeography(changedFine, fast)).rejects.toThrow('分块引用');
    await expect(decodeCountryGeography({ ...record, version: 2 }, fast)).rejects.toThrow('版本');
    await expect(decodeCountryGeography({ ...record, encodedBytes: COUNTRY_GEOGRAPHY_LIMITS.encodedBytes + 1 }, fast)).rejects.toThrow('预算');
    await expect(decodeCountryGeography({ ...record, blocks: [...record.blocks, record.blocks[0]] }, fast)).rejects.toThrow('重复');
    const getter = vi.fn(() => record.manifest), envelope = { ...record };
    Object.defineProperty(envelope, 'manifest', { enumerable: true, get: getter });
    await expect(decodeCountryGeography(envelope, fast)).rejects.toThrow('封套'); expect(getter).not.toHaveBeenCalled();
  });

  it('uses actual fine sea bays and exact positive-area land intersections, compressing only proven all-land cells', async () => {
    const data = await decodeCountryGeography(record, fast), base = vi.spyOn(Base, 'extractDetailCoastBase');
    expect(await countryLandAt(data, 16 * 256, 16 * 256, fast)).toEqual({ cellId: 0, land: false, height: -180 });
    expect(await countryLandAt(data, 4 * 256, 16 * 256, fast)).toEqual({ cellId: 0, land: true, height: 720 });
    expect(await countryLandAt(data, 32 * 256, 16 * 256, fast)).toEqual({ cellId: 0, land: true, height: 0 });
    expect(await countryLandAt(data, 48 * 256, 16 * 256, fast)).toEqual({ cellId: 1, land: false, height: -180 });
    expect(await countryClaimCells(data, [1, 0, 5, 0], fast)).toEqual([0, 5]);
    expect(await countryCellLandPolygons(data, 1, fast)).toEqual([]); // Sea cell only touches the zero coast edge.
    expect(await countryCellLandPolygons(data, 5, fast)).toEqual([getCellQuad(data, 5).map(p => ({ xQ: p.x * 256, yQ: p.y * 256 }))]);
    const polygons = await countryCellLandPolygons(data, 0, fast), bay = { xQ: 16 * 256, yQ: 16 * 256 };
    const containsBay = polygons.some(polygon => polygon.every((a, index) => { const b = polygon[(index + 1) % polygon.length]; return (b.xQ - a.xQ) * (bay.yQ - a.yQ) - (b.yQ - a.yQ) * (bay.xQ - a.xQ) >= 0; }));
    expect(polygons.length).toBeGreaterThan(1); expect(containsBay).toBe(false);
    expect(polygons.flat().every(p => p.xQ >= 0 && p.xQ <= 32 * 256 && p.yQ >= 0 && p.yQ <= 32 * 256)).toBe(true);
    expect(base).toHaveBeenCalledTimes(1);
    if (isDetailCoastDocument(data)) data.detailCoast.clear(); data.blocks.clear();
    expect(await countryLandAt(data, 16 * 256, 16 * 256, fast)).toEqual({ cellId: 0, land: false, height: -180 });
    expect(base).toHaveBeenCalledTimes(1); // Authority privately captured before caller mutation.
  });

  it('preflights the actual 1024-input budget, safe Q8 coordinates and cancellation without silently accepting partial claims', async () => {
    const data = await decodeCountryGeography(record, fast), base = vi.spyOn(Base, 'extractDetailCoastBase');
    await expect(countryClaimCells(data, Array.from({ length: 1025 }, () => 0), fast)).rejects.toThrow('1024');
    await expect(countryClaimCells(data, [-1], fast)).rejects.toThrow('1024');
    await expect(countryLandAt(data, 1.5, 0, fast)).rejects.toThrow('Q8');
    await expect(countryLandAt(data, 4096 * 256 + 1, 0, fast)).rejects.toThrow('Q8');
    expect(base).not.toHaveBeenCalled(); expect(await countryClaimCells(data, [], fast)).toEqual([]);
    await countryLandAt(data, 0, 0, fast);
    const controller = new AbortController();
    await expect(countryClaimCells(data, [1], { signal: controller.signal, ...fast,
      onProgress: progress => { if (progress.stage === '按真实细海岸裁剪建国领土') controller.abort(); } })).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true); expect(await countryClaimCells(data, [1, 0], fast)).toEqual([0]);
    const aborted = new AbortController(); aborted.abort();
    await expect(decodeCountryGeography(record, { signal: aborted.signal })).rejects.toThrow();
    await expect(prepareCountryGeography(record.source, { signal: aborted.signal })).rejects.toThrow();
    const cold = await decodeCountryGeography(record, fast), duringSetup = new AbortController();
    await expect(countryLandAt(cold, 0, 0, { signal: duringSetup.signal, ...fast, onProgress: () => duringSetup.abort() })).rejects.toThrow();
    expect((await countryLandAt(cold, 0, 0, fast)).land).toBe(true);
  });

  it('owns every incoming record byte before yielding and does not accept a caller mutation as a new geography', async () => {
    const input = structuredClone(record); let mutated = false;
    const decoded = await decodeCountryGeography(input, { ...fast, onProgress: () => {
      if (mutated) return; mutated = true; input.manifest.fill(0); input.sourceRoot.fill(0);
      input.blocks[0].bytes.fill(0); input.detailCoast[0].bytes.fill(0); input.source.revision = 99;
    } });
    expect(mutated).toBe(true); expect(decoded).toEqual(fixture);
    await expect(decodeCountryGeography(input, fast)).rejects.toThrow();
  });

  it('binds political entities to privately decoded provenance and rejects real out-of-world land or sea-bay cities', async () => {
    const data = await decodeCountryGeography(record, fast), base = vi.spyOn(Base, 'extractDetailCoastBase');
    const source = countryGeographySource(data); expect(source).toEqual(record.source);
    source.revision = 999; expect(countryGeographySource(data)).toEqual(record.source);
    expect(() => countryGeographySource(structuredClone(data))).toThrow('来源身份');
    expect(() => countryGeographySource(fixture)).toThrow('来源身份');
    expect(base).not.toHaveBeenCalled();
    const nationId = `nation-${crypto.randomUUID()}`, regimeId = `regime-${crypto.randomUUID()}`, cityId = `city-${crypto.randomUUID()}`;
    const document: CountryDocument = { format: 'lieguoji-country-document', version: 1, worldId: `country-${crypto.randomUUID()}`,
      name: '真实海湾建国校验', source: { ...record.source }, revision: 1,
      nations: [{ id: nationId, name: '海湾国', color: '#446688', regimeId, capitalCityId: cityId, labelAnchorQ: { xQ: 4 * 256, yQ: 16 * 256 } }],
      regimes: [{ id: regimeId, nationId, name: '海湾政权' }],
      territories: [{ cellId: 0, legalNationId: nationId, controllingNationId: nationId }],
      cities: [{ id: cityId, nationId, name: '湾岸城', positionQ: { xQ: 4 * 256, yQ: 16 * 256 }, labelAnchorQ: { xQ: 4 * 256, yQ: 16 * 256 } }] };
    expect(validateCountryDocument(document)).toBe(true);
    await expect(validateCountryWorldGeography(document, data, fast)).resolves.toBeUndefined();
    const outside = structuredClone(document); outside.territories[0].cellId = 128 * 128;
    expect(validateCountryDocument(outside)).toBe(true);
    await expect(validateCountryWorldGeography(outside, data, fast)).rejects.toThrow('超出实际地理范围');
    const sea = structuredClone(document); sea.cities[0].positionQ.xQ = 16 * 256;
    expect(validateCountryDocument(sea)).toBe(true);
    await expect(validateCountryWorldGeography(sea, data, fast)).rejects.toThrow('实际陆地');
    const changedSource = structuredClone(document); changedSource.source.rootDigest = 'f'.repeat(64);
    expect(validateCountryDocument(changedSource)).toBe(true);
    await expect(validateCountryWorldGeography(changedSource, data, fast)).rejects.toThrow('来源身份');
    expect(base).toHaveBeenCalledTimes(1);
    const beforeQuery = await decodeCountryGeography(record, fast);
    if (isDetailCoastDocument(beforeQuery)) beforeQuery.detailCoast.clear(); beforeQuery.blocks.clear();
    expect(countryGeographySource(beforeQuery)).toEqual(record.source);
    expect(await countryLandAt(beforeQuery, 16 * 256, 16 * 256, fast)).toEqual({ cellId: 0, height: -180, land: false });
    expect(base).toHaveBeenCalledTimes(2);
  });
});
