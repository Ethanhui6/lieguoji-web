import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGenerationDraft, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from '../atlas-format';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey } from '../detail-coast-types';
import { hashBlock } from '../model';
import { getAtlasStorage } from '../storage';
import { COUNTRY_V4_DATABASE } from './chunk-codec';
import { applyCountryCommand, validateCountryWorldGeography } from './core';
import { selectCountryPolygon } from './country-selection';
import { countryGeographySource, countryLandAt, countryPoliticalMesh, decodeCountryGeography, prepareCountryGeography, type CountryGeographyRecord } from './geography';
import { COUNTRY_INSTITUTION_TEMPLATES, institutionFieldLabels } from './institution';
import { countryGeometry, validateCountryCommand, validateCountryDocument, type CountryCommand, type CountryDocument, type CountryPoint, type CountryPreview, type CountryState } from './model';
import { openCountryWorld } from './storage';
import * as v4 from './storage-v4';
import { CountryRuntime } from './worker';

const fast = { yieldTask: async () => {} };
let record: CountryGeographyRecord, geography: AtlasDocument, base: CountryDocument;
const rectangle = (left: number, top: number, right: number, bottom: number): CountryPoint[] => [
  { xQ: left * 256, yQ: top * 256 }, { xQ: right * 256, yQ: top * 256 },
  { xQ: right * 256, yQ: bottom * 256 }, { xQ: left * 256, yQ: bottom * 256 },
];
const around = (point: CountryPoint) => rectangle((point.xQ - 1) / 256, (point.yQ - 1) / 256, (point.xQ + 1) / 256, (point.yQ + 1) / 256);
const expected = (state: CountryState) => ({ worldId: state.document.worldId, revision: state.document.revision, rootDigest: state.rootDigest });
const move = (document: CountryDocument, field: 'legal' | 'control', outlineQ = rectangle(128, 0, 160, 32)): Extract<CountryCommand, { type: 'reassign-territory-shape' }> => ({
  type: 'reassign-territory-shape', nationId: document.nations[0].id, targetNationId: document.nations[1].id, field, outlineQ,
});
async function snapshot(): Promise<unknown[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(COUNTRY_V4_DATABASE, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    return await new Promise((resolve, reject) => {
      const stores = [...db.objectStoreNames].sort(), tx = db.transaction(stores, 'readonly');
      const reads = stores.map(store => ({ store, keys: tx.objectStore(store).getAllKeys(), rows: tx.objectStore(store).getAll() }));
      tx.oncomplete = () => resolve(reads.map(read => ({ store: read.store, keys: read.keys.result, rows: read.rows.result }))); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
const world = () => v4.createCountryWorld(record, '归属编辑双国', undefined, base);
const preview = async (runtime: CountryRuntime, state: CountryState, command: CountryCommand, id = 2) => await runtime.handle({ id, type: 'preview', expected: expected(state), command }) as CountryPreview;
const confirm = async (runtime: CountryRuntime, candidate: CountryPreview, id = 3) => await runtime.handle({ id, type: 'confirm', candidateId: candidate.candidateId }) as CountryState;

beforeAll(async () => {
  globalThis.indexedDB = new IDBFactory();
  // Two real fine-field islands over a verified Atlas-v4 source. Selection,
  // point ownership, Worker, codecs and IDB transactions remain production code.
  const fixture: AtlasDetailCoastDocument = await createGenerationDraft({ size: 128, name: '归属双岛真实地理夹具', seed: 'ownership-two-islands' }, fast, 4);
  for (const block of fixture.blocks.values()) {
    if (block.layer === 'elevation') block.values.fill(500);
    if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
      const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % 129 * 32 * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / 129) * 32 * 256;
    }
  }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  for (const bx of [2, 4]) {
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by: 0, mode: 'land' } as const;
    fixture.detailCoast.set(detailCoastKey(bx, 0), tile); fixture.manifest.detailCoast.refs.push({ bx, by: 0, hash: await hashDetailCoastTile(tile) });
  }
  await verifyAtlasDocument(fixture, fast);
  const api = getAtlasStorage(4), prepared = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: fixture.manifest, expectedRoot: null }, fast);
  const blocks = [...fixture.blocks.values(), ...fixture.locks.values(), ...fixture.detailCoast.values()];
  for (let offset = 0; offset < blocks.length; offset += 16) await api.stageAtlasBlocks(prepared.preparationId, blocks.slice(offset, offset + 16), fast);
  const receipt = await api.commitAtlasPreparation(prepared.preparationId, fast);
  record = await prepareCountryGeography({ draftId: receipt.draftId, revision: receipt.revision, rootDigest: receipt.rootDigest, manifestDigest: receipt.manifestDigest, atlasFormat: 4 }, fast);
  geography = await decodeCountryGeography(record, fast);
  base = { format: 'lieguoji-country-document', version: 4, worldId: `country-${crypto.randomUUID()}`, name: '双国归属', source: countryGeographySource(geography), revision: 0, nations: [], regimes: [], territories: [], cities: [] };
  for (const [name, color, cellIds] of [['岬湾', '#447788', [4, 5]], ['临川', '#997744', [8, 9]]] as const) {
    base = (await applyCountryCommand(base, { type: 'create-nation', name, color, cellIds: [...cellIds] }, geography, undefined, fast)).document;
  }
  const mesh = await countryPoliticalMesh(geography, fast);
  for (const [index, cellId] of [[0, 5], [1, 9]]) {
    const center = mesh.centerQ(cellId), positionQ = { xQ: center.xQ + 128, yQ: center.yQ }, nationId = base.nations[index].id;
    expect(await countryLandAt(geography, positionQ.xQ, positionQ.yQ, fast, countryGeometry(base))).toMatchObject({ cellId, land: true, height: 500 });
    base = (await applyCountryCommand(base, { type: 'create-city', nationId, name: `${base.nations[index].name}都`, positionQ }, geography, undefined, fast)).document;
    base = (await applyCountryCommand(base, { type: 'set-capital', nationId, cityId: base.cities[index].id }, geography, undefined, fast)).document;
  }
  await validateCountryWorldGeography(base, geography, fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe('manual country ownership edits preserve separate legal and control fields', () => {
  it('validates exact commands, existing ID shape, distinct nations, fields and simple outlines without getters', () => {
    const command = move(base, 'legal'); expect(validateCountryCommand(command)).toBe(true);
    const crossed = [{ xQ: 0, yQ: 0 }, { xQ: 8192, yQ: 8192 }, { xQ: 0, yQ: 8192 }, { xQ: 8192, yQ: 0 }];
    for (const invalid of [{ ...command, force: true }, { ...command, field: 'both' }, { ...command, targetNationId: base.nations[0].id }, { ...command, targetNationId: 'missing' },
      { ...command, nationId: 'missing' }, { ...command, outlineQ: [] }, { ...command, outlineQ: crossed }, { ...command, outlineQ: [crossed[0], crossed[0], crossed[1]] },
      { ...command, outlineQ: [{ xQ: 0.5, yQ: 0 }, { xQ: 100, yQ: 0 }, { xQ: 0, yQ: 100 }] }]) expect(validateCountryCommand(invalid)).toBe(false);
    let reads = 0; const accessor = { ...command }; Object.defineProperty(accessor, 'field', { enumerable: true, get: () => { reads++; return 'legal'; } });
    expect(validateCountryCommand(accessor)).toBe(false); expect(reads).toBe(0);
    expect(institutionFieldLabels(null).map(row => row.field)).toEqual(institutionFieldLabels(COUNTRY_INSTITUTION_TEMPLATES[0].institution).map(row => row.field));
  });

  it.each(['legal', 'control'] as const)('moves only %s, retaining all entity identities, other ownership and real geography', async field => {
    const before = structuredClone(base), geographyBefore = structuredClone(record), key = field === 'legal' ? 'legalNationId' : 'controllingNationId';
    // The taller ring also includes unassigned island land; only cell 4 is owned.
    const outlineQ = rectangle(128, 0, 160, 64), chosen = await selectCountryPolygon(geography, { source: base.source, pointsQ: outlineQ, geometry: countryGeometry(base) }, fast);
    expect(chosen.cellIds).toContain(4); expect(chosen.cellIds).toContain(132);
    const result = await applyCountryCommand(base, move(base, field, outlineQ), geography, undefined, fast);
    expect(result.document).toEqual({ ...before, revision: before.revision + 1, territories: before.territories.map(row => row.cellId === 4 ? { ...row, [key]: base.nations[1].id } : row) });
    expect(result.description).toContain('1 个地块'); expect(result.description).toContain('从「岬湾」移交给「临川」');
    expect(result.description).toContain('手动世界编辑'); expect(result.description).toContain('城市和首都所在整个地块受到保护'); expect(result.description).toContain('不产生战争、人口或财政结算');
    expect(base).toEqual(before); expect(record).toEqual(geographyBefore); await validateCountryWorldGeography(result.document, geography, fast);
    const sea = await countryLandAt(geography, 3200 * 256, 3200 * 256, fast, countryGeometry(base)); expect(sea.land).toBe(false);
  });

  it('checks only the edited ownership field so legitimate split ownership can be corrected independently', async () => {
    const controlled = (await applyCountryCommand(base, move(base, 'control'), geography, undefined, fast)).document;
    const both = (await applyCountryCommand(controlled, move(controlled, 'legal'), geography, undefined, fast)).document;
    expect(both.territories.find(row => row.cellId === 4)).toEqual({ cellId: 4, legalNationId: base.nations[1].id, controllingNationId: base.nations[1].id });
    const command = { ...move(both, 'control'), nationId: both.nations[1].id, targetNationId: both.nations[0].id };
    const restoredControl = (await applyCountryCommand(both, command, geography, undefined, fast)).document;
    expect(restoredControl.territories.find(row => row.cellId === 4)).toEqual({ cellId: 4, legalNationId: base.nations[1].id, controllingNationId: base.nations[0].id });
    await validateCountryWorldGeography(restoredControl, geography, fast);
  });

  it('protects city and capital whole cells even outside the trace, and validates all other city references', async () => {
    const seed = (await countryPoliticalMesh(geography, fast)).centerQ(5), outlineQ = around(seed), before = structuredClone(base);
    expect(base.cities[0].positionQ.xQ).toBeGreaterThan(Math.max(...outlineQ.map(point => point.xQ)));
    for (const field of ['legal', 'control'] as const) await expect(applyCountryCommand(base, move(base, field, outlineQ), geography, undefined, fast)).rejects.toThrow('首都「岬湾都」');
    const ordinary = structuredClone(base); ordinary.nations[0].capitalCityId = null;
    await expect(applyCountryCommand(ordinary, move(ordinary, 'control', outlineQ), geography, undefined, fast)).rejects.toThrow('城市「岬湾都」');
    const invalidOtherCity = structuredClone(base); invalidOtherCity.cities[1].positionQ = { xQ: 3200 * 256, yQ: 3200 * 256 };
    expect(validateCountryDocument(invalidOtherCity)).toBe(true);
    await expect(applyCountryCommand(invalidOtherCity, move(invalidOtherCity, 'legal'), geography, undefined, fast)).rejects.toThrow('保存的城市');
    expect(base).toEqual(before);
  });

  it('rejects foreign or third-party selected ownership, missing nations and empty changes atomically', async () => {
    const before = structuredClone(base), foreign = rectangle(128, 0, 288, 32);
    for (const field of ['legal', 'control'] as const) await expect(applyCountryCommand(base, move(base, field, foreign), geography, undefined, fast)).rejects.toThrow('不属于「岬湾」');
    const third = (await applyCountryCommand(base, { type: 'create-nation', name: '第三国', color: '#776655', cellIds: [132] }, geography, undefined, fast)).document;
    await expect(applyCountryCommand(third, move(third, 'legal', rectangle(128, 0, 160, 64)), geography, undefined, fast)).rejects.toThrow('不属于「岬湾」');
    for (const outline of [rectangle(128, 32, 160, 64), rectangle(3200, 3200, 3232, 3232)]) await expect(applyCountryCommand(base, move(base, 'control', outline), geography, undefined, fast)).rejects.toThrow('没有需要提交的变化');
    await expect(applyCountryCommand(base, { ...move(base, 'legal'), targetNationId: `nation-${crypto.randomUUID()}` }, geography, undefined, fast)).rejects.toThrow('另一个已有国家');
    await expect(applyCountryCommand(base, { ...move(base, 'legal'), nationId: `nation-${crypto.randomUUID()}` }, geography, undefined, fast)).rejects.toThrow('目标国家不存在');
    expect(base).toEqual(before);
  });

  it('retains the last legal land while allowing a city-free country to lose all actual control', async () => {
    const noCities = structuredClone(base); noCities.cities = []; for (const nation of noCities.nations) nation.capitalCityId = null;
    const outlineQ = rectangle(128, 0, 192, 32);
    await expect(applyCountryCommand(noCities, move(noCities, 'legal', outlineQ), geography, undefined, fast)).rejects.toThrow('最后的法理领土');
    const result = (await applyCountryCommand(noCities, move(noCities, 'control', outlineQ), geography, undefined, fast)).document;
    expect(result.territories.filter(row => row.controllingNationId === noCities.nations[0].id)).toEqual([]);
    expect(result.territories.filter(row => row.legalNationId === noCities.nations[0].id)).toHaveLength(2);
    expect(result.nations).toEqual(noCities.nations); expect(result.regimes).toEqual(noCities.regimes);
    await validateCountryWorldGeography(result, geography, fast);
  });

  it('rejects every legacy version and aborts real selection without changing original documents', async () => {
    for (const version of [1, 2, 3] as const) {
      const legacy: CountryDocument = { ...base, version, regimes: base.regimes.map(row => ({ id: row.id, nationId: row.nationId, name: row.name })) }, before = structuredClone(legacy);
      expect(validateCountryDocument(legacy)).toBe(true);
      await expect(applyCountryCommand(legacy, move(legacy, 'legal'), geography, undefined, fast)).rejects.toThrow('v4 制度副本'); expect(legacy).toEqual(before);
    }
    const abort = new AbortController(), before = structuredClone(base);
    await expect(applyCountryCommand(base, move(base, 'control'), geography, undefined, { ...fast, signal: abort.signal, onProgress: () => abort.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(base).toEqual(before);
  });

  it('previews and cancels without writes, repeats selection on confirm, persists separate fields and undoes after reload', async () => {
    const initial = await world(), original = await snapshot(), runtime = new CountryRuntime(); await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const command = move(initial.document, 'control'), cancelled = await preview(runtime, initial, command);
    expect(await snapshot()).toEqual(original); await runtime.handle({ id: 3, type: 'cancel-preview' });
    await expect(confirm(runtime, cancelled, 4)).rejects.toThrow('取消或过期'); expect(await snapshot()).toEqual(original);
    let selections = 0; const progress = (p: { stage: string; completed: number }) => { if (p.stage === '按地理单元中心圈地' && p.completed === 128) selections++; };
    const candidate = await runtime.handle({ id: 5, type: 'preview', expected: expected(initial), command }, progress) as CountryPreview;
    expect(selections).toBe(1); candidate.document.territories = [];
    const saved = await runtime.handle({ id: 6, type: 'confirm', candidateId: candidate.candidateId }, progress) as CountryState;
    expect(selections).toBe(2); expect(saved.document.territories.find(row => row.cellId === 4)).toEqual({ cellId: 4, legalNationId: initial.document.nations[0].id, controllingNationId: initial.document.nations[1].id });
    const refresh = new CountryRuntime(); expect(await refresh.handle({ id: 7, type: 'open', worldId: saved.document.worldId })).toEqual(saved);
    const undo = await preview(refresh, saved, { type: 'undo' }, 8), restored = await confirm(refresh, undo, 9);
    expect(restored.document).toEqual({ ...initial.document, revision: saved.document.revision + 1 });
    expect(await openCountryWorld(initial.document.worldId)).toEqual(restored); expect(await v4.readCountryGeographyRecordV4(initial.document.worldId)).toEqual(record);
  }, 30000);

  it('rejects a stale durable ownership confirmation after another tab has committed', async () => {
    const initial = await world(), first = new CountryRuntime(), second = new CountryRuntime();
    await first.handle({ id: 1, type: 'open', worldId: initial.document.worldId }); await second.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const stale = await preview(first, initial, move(initial.document, 'legal'));
    const other = await preview(second, initial, move(initial.document, 'control')), current = await confirm(second, other);
    await expect(confirm(first, stale)).rejects.toThrow('另一标签'); expect(await openCountryWorld(initial.document.worldId)).toEqual(current);
    expect(current.document.territories.find(row => row.cellId === 4)).toEqual({ cellId: 4, legalNationId: initial.document.nations[0].id, controllingNationId: initial.document.nations[1].id });
  }, 30000);
});
