import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGenerationDraft, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from '../atlas-format';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey } from '../detail-coast-types';
import { hashBlock } from '../model';
import { getAtlasStorage } from '../storage';
import { applyCountryCommand, validateCountryWorldGeography } from './core';
import { COUNTRY_V3_DATABASE, COUNTRY_V4_DATABASE } from './chunk-codec';
import { countryGeographySource, countryLandAt, countryPoliticalMesh, decodeCountryGeography, prepareCountryGeography, type CountryGeographyRecord } from './geography';
import { COUNTRY_INSTITUTION_TEMPLATES, validateCountryInstitution, type CountryInstitution } from './institution';
import { CountryFutureVersionError, countryDigest, countryGeometry, countryJsonBytes, validateCountryCommand, validateCountryDocument,
  type CountryCommand, type CountryDocument, type CountryPreview, type CountryState } from './model';
import { copyCountryWorldToV4, createCountryWorld, openCountryWorld } from './storage';
import * as v3 from './storage-v3';
import * as v4 from './storage-v4';
import { CountryRuntime } from './worker';

const fast = { yieldTask: async () => {} }, commandId = () => `command-${crypto.randomUUID()}`;
let record: CountryGeographyRecord, geography: AtlasDocument, twoNations: CountryDocument;
const expected = (state: CountryState) => ({ worldId: state.document.worldId, revision: state.document.revision, rootDigest: state.rootDigest });
const preset = (id: Exclude<CountryInstitution['template'], 'custom'>) => structuredClone(COUNTRY_INSTITUTION_TEMPLATES.find(template => template.id === id)!.institution);
const custom = (): CountryInstitution => ({ version: 1, template: 'custom', succession: 'election', localAppointment: 'central', localRevenueBps: 4275, recruitment: 'levy' });
const institutionCommand = (document: CountryDocument, index: number, institution: CountryInstitution | null, regimeName = document.regimes[index].name): CountryCommand => ({ type: 'set-institution', nationId: document.nations[index].id, regimeName, institution });

type Blob = { bytes: Uint8Array; digest: string };
type Root = { format: string; version: number; worldId: string; storedChunkBytes: number; current: Blob; backup: Blob | null; undo: Blob[]; lastCommandId: string; rootDigest: string };
async function database(name: string) { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function read<T>(name: string, store: string, key: string): Promise<T> {
  const db = await database(name);
  try { return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function writeRoot(name: string, root: Root) {
  const db = await database(name);
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('worlds', 'readwrite'); tx.objectStore('worlds').put(root, root.worldId); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function snapshot(name: string) {
  const db = await database(name);
  try { return await new Promise<unknown[]>((resolve, reject) => { const stores = [...db.objectStoreNames].sort(), tx = db.transaction(stores, 'readonly'); const requests = stores.map(store => ({ store, keys: tx.objectStore(store).getAllKeys(), rows: tx.objectStore(store).getAll() })); tx.oncomplete = () => resolve(requests.map(row => ({ store: row.store, keys: row.keys.result, rows: row.rows.result }))); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function rehashRoot(root: Root) {
  root.rootDigest = await countryDigest(countryJsonBytes({ format: root.format, version: root.version, worldId: root.worldId, storedChunkBytes: root.storedChunkBytes,
    current: { digest: root.current.digest, size: root.current.bytes.length }, backup: root.backup ? { digest: root.backup.digest, size: root.backup.bytes.length } : null,
    undo: root.undo.map(blob => ({ digest: blob.digest, size: blob.bytes.length })), lastCommandId: root.lastCommandId }));
}

beforeAll(async () => {
  globalThis.indexedDB = new IDBFactory();
  // Real verified Atlas-v4 geometry and two distinct fine-field islands. This
  // follows the existing real-geography tests; no geography/Worker/codec mock.
  const fixture: AtlasDetailCoastDocument = await createGenerationDraft({ size: 128, name: '制度双岛真实地理夹具', seed: 'country-institution-two-islands' }, fast, 4);
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
  twoNations = { format: 'lieguoji-country-document', version: 3, worldId: `country-${crypto.randomUUID()}`, name: '制度前的两国', source: countryGeographySource(geography), revision: 0, nations: [], regimes: [], territories: [], cities: [] };
  for (const [name, color, cells] of [['岬湾', '#447788', [4, 5]], ['临川', '#997744', [8, 9]]] as const) {
    twoNations = (await applyCountryCommand(twoNations, { type: 'create-nation', name, color, cellIds: [...cells] }, geography, undefined, fast)).document;
  }
  const mesh = await countryPoliticalMesh(geography, fast);
  for (const [index, cellId] of [[0, 5], [1, 9]]) {
    const positionQ = mesh.centerQ(cellId), nationId = twoNations.nations[index].id;
    expect(await countryLandAt(geography, positionQ.xQ, positionQ.yQ, fast, 'political-voronoi-v1')).toMatchObject({ cellId, land: true, height: 500 });
    twoNations = (await applyCountryCommand(twoNations, { type: 'create-city', nationId, name: `${twoNations.nations[index].name}都`, positionQ }, geography, undefined, fast)).document;
    twoNations = (await applyCountryCommand(twoNations, { type: 'set-capital', nationId, cityId: twoNations.cities[index].id }, geography, undefined, fast)).document;
  }
  await validateCountryWorldGeography(twoNations, geography, fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

async function oldWorld() {
  const initial = await v3.createCountryWorld(record, '原版双国', undefined, twoNations);
  const next = (await applyCountryCommand(initial.document, { type: 'rename-nation', nationId: initial.document.nations[0].id, name: '旧岬湾' }, geography, undefined, fast)).document;
  return v3.commitCountryWorld(initial, next, commandId(), 'a'.repeat(64));
}
async function institutionWorld() { const old = await oldWorld(); return copyCountryWorldToV4(old.document.worldId, '双国制度副本', fast); }
async function preview(runtime: CountryRuntime, state: CountryState, command: CountryCommand, id = 2) { return await runtime.handle({ id, type: 'preview', expected: expected(state), command }) as CountryPreview; }
async function confirm(runtime: CountryRuntime, candidate: CountryPreview, id = 3) { return await runtime.handle({ id, type: 'confirm', candidateId: candidate.candidateId }) as CountryState; }

describe('independent country institutions use real geography and transactional country state', () => {
  it('validates fixed presets, genuine custom values and exact nested fields without reading getters', () => {
    expect(COUNTRY_INSTITUTION_TEMPLATES.map(template => template.id)).toEqual(['central-office', 'landed-obligation', 'member-autonomy']);
    for (const template of COUNTRY_INSTITUTION_TEMPLATES) expect(validateCountryInstitution(template.institution)).toBe(true);
    expect(preset('central-office')).toEqual({ version: 1, template: 'central-office', succession: 'appointment', localAppointment: 'central', localRevenueBps: 1500, recruitment: 'standing' });
    expect(preset('landed-obligation')).toEqual({ version: 1, template: 'landed-obligation', succession: 'hereditary', localAppointment: 'local', localRevenueBps: 6000, recruitment: 'levy' });
    expect(preset('member-autonomy')).toEqual({ version: 1, template: 'member-autonomy', succession: 'election', localAppointment: 'local', localRevenueBps: 8000, recruitment: 'mixed' });
    expect(validateCountryInstitution(custom())).toBe(true);
    for (const localRevenueBps of [0, 10000]) expect(validateCountryInstitution({ ...custom(), localRevenueBps })).toBe(true);
    for (const invalid of [{ ...custom(), localRevenueBps: -1 }, { ...custom(), localRevenueBps: 10001 }, { ...custom(), localRevenueBps: 0.5 },
      { ...custom(), localRevenueBps: NaN }, { ...custom(), succession: 'random' }, { ...custom(), recruitment: 'free-armies' }, { ...custom(), localAppointment: 'random' },
      { ...custom(), template: 'missing' }, { ...custom(), version: 2 }, { ...custom(), extra: true }, { ...preset('central-office'), localRevenueBps: 1501 }]) expect(validateCountryInstitution(invalid)).toBe(false);
    let reads = 0; const accessor = { ...custom() }; Object.defineProperty(accessor, 'localRevenueBps', { enumerable: true, get: () => { reads++; return 500; } });
    expect(validateCountryInstitution(accessor)).toBe(false); expect(reads).toBe(0);
    const id = `nation-${crypto.randomUUID()}`;
    expect(validateCountryCommand({ type: 'set-institution', nationId: id, regimeName: '议政院', institution: custom() })).toBe(true);
    expect(validateCountryCommand({ type: 'set-institution', nationId: id, regimeName: '议政院', institution: null })).toBe(true);
    expect(validateCountryCommand({ type: 'set-institution', nationId: id, regimeName: '议政院', institution: custom(), applyNow: true })).toBe(false);
  });

  it('changes only the selected regime while preserving both nations, real land, cities and capitals', async () => {
    const initial = await institutionWorld(), before = structuredClone(initial.document), sourceBefore = structuredClone(record);
    const central = (await applyCountryCommand(initial.document, institutionCommand(initial.document, 0, preset('central-office'), '岬湾官署'), geography, undefined, fast)).document;
    const both = (await applyCountryCommand(central, institutionCommand(central, 1, preset('member-autonomy'), '临川联议院'), geography, undefined, fast)).document;
    expect(both).toEqual({ ...before, revision: before.revision + 2, regimes: [
      { ...before.regimes[0], name: '岬湾官署', institution: preset('central-office') },
      { ...before.regimes[1], name: '临川联议院', institution: preset('member-autonomy') },
    ] });
    const changed = (await applyCountryCommand(both, institutionCommand(both, 0, custom()), geography, undefined, fast)).document;
    expect(changed.regimes[0].institution).toEqual(custom()); expect(changed.regimes[1]).toEqual(both.regimes[1]);
    const cleared = (await applyCountryCommand(changed, institutionCommand(changed, 0, null), geography, undefined, fast)).document;
    expect(cleared.regimes[0].institution).toBeNull(); expect(cleared.regimes[1]).toEqual(both.regimes[1]);
    expect(initial.document).toEqual(before); expect(record).toEqual(sourceBefore);
    expect(countryGeometry(cleared)).toBe('political-voronoi-v1'); await validateCountryWorldGeography(cleared, geography, fast);
    for (const city of before.cities) expect(await countryLandAt(geography, city.positionQ.xQ, city.positionQ.yQ, fast, countryGeometry(cleared))).toMatchObject({ land: true, height: 500 });
  }, 30000);

  it('creates v4 by default and copies v3 explicitly without changing any original root, history or geography bytes', async () => {
    const fresh = await createCountryWorld(record, '默认制度世界'); expect(fresh.document.version).toBe(4);
    const old = await oldWorld(), original = await snapshot(COUNTRY_V3_DATABASE); expect(old.undoCount).toBeGreaterThan(0);
    const runtime = new CountryRuntime(), copied = await runtime.handle({ id: 1, type: 'copy-to-v4', worldId: old.document.worldId, name: '制度副本' }) as CountryState;
    expect(copied.document).toEqual({ ...old.document, version: 4, worldId: copied.document.worldId, name: '制度副本', revision: 0,
      regimes: old.document.regimes.map(regime => ({ ...regime, institution: null })) });
    expect(copied.document.worldId).not.toBe(old.document.worldId); expect(copied.undoCount).toBe(0);
    const root = await read<Root>(COUNTRY_V4_DATABASE, 'worlds', copied.document.worldId); expect(root.version).toBe(4); expect(root.backup).toBeNull(); expect(root.undo).toEqual([]);
    expect(await read(COUNTRY_V4_DATABASE, 'geography', copied.document.worldId)).toEqual(await read(COUNTRY_V3_DATABASE, 'geography', old.document.worldId));
    expect(await openCountryWorld(old.document.worldId)).toEqual(old); expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(original);
    await expect(copyCountryWorldToV4(copied.document.worldId, '不重复升级', fast)).rejects.toThrow();
    expect(validateCountryDocument({ ...old.document, regimes: old.document.regimes.map(regime => ({ ...regime, institution: null })) })).toBe(false);
    expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(original);
  }, 30000);

  it('previews and cancels without writes, recomputes confirmation, then restores the configuration through reload and undo', async () => {
    const initial = await institutionWorld(), original = await snapshot(COUNTRY_V4_DATABASE), runtime = new CountryRuntime();
    await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const command = institutionCommand(initial.document, 0, preset('landed-obligation'), '岬湾领议庭');
    const cancelled = await preview(runtime, initial, command);
    expect(cancelled.document.regimes[0].institution).toEqual(preset('landed-obligation')); expect(await snapshot(COUNTRY_V4_DATABASE)).toEqual(original);
    await runtime.handle({ id: 3, type: 'cancel-preview' }); await expect(confirm(runtime, cancelled, 4)).rejects.toThrow(/取消|过期/);
    expect(await snapshot(COUNTRY_V4_DATABASE)).toEqual(original);
    const candidate = await preview(runtime, initial, command, 5); candidate.document.regimes[0].name = '外部篡改预览'; candidate.document.regimes[0].institution = custom();
    const saved = await confirm(runtime, candidate, 6);
    expect(saved.document.regimes[0]).toEqual({ ...initial.document.regimes[0], name: '岬湾领议庭', institution: preset('landed-obligation') });
    expect(saved.document.regimes[1]).toEqual(initial.document.regimes[1]); expect(saved.document.nations).toEqual(initial.document.nations);
    expect(saved.document.cities).toEqual(initial.document.cities); expect(saved.document.territories).toEqual(initial.document.territories);
    const refresh = new CountryRuntime(); expect(await refresh.handle({ id: 7, type: 'open', worldId: saved.document.worldId })).toEqual(saved);
    const undo = await preview(refresh, saved, { type: 'undo' }, 8), restored = await confirm(refresh, undo, 9);
    expect(restored.document).toEqual({ ...initial.document, revision: saved.document.revision + 1 });
    expect(await new CountryRuntime().handle({ id: 10, type: 'open', worldId: restored.document.worldId })).toEqual(restored);
    expect(await v4.readCountryGeographyRecordV4(restored.document.worldId)).toEqual(record);
  }, 30000);

  it('rejects no-op, malformed rules and attempts to add institution fields to a legacy document', async () => {
    const initial = await institutionWorld(), runtime = new CountryRuntime(); await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const unchanged = await snapshot(COUNTRY_V4_DATABASE);
    await expect(preview(runtime, initial, institutionCommand(initial.document, 0, null))).rejects.toThrow();
    await expect(runtime.handle({ id: 3, type: 'preview', expected: expected(initial), command: { type: 'set-institution', nationId: initial.document.nations[0].id, regimeName: '无效', institution: { ...custom(), localRevenueBps: 10001 } } })).rejects.toThrow();
    expect(await snapshot(COUNTRY_V4_DATABASE)).toEqual(unchanged);
    const command = institutionCommand(initial.document, 0, preset('central-office'));
    const configured = (await applyCountryCommand(initial.document, command, geography, undefined, fast)).document;
    await expect(applyCountryCommand(configured, institutionCommand(configured, 0, preset('central-office')), geography, undefined, fast)).rejects.toThrow();
    const legacyBefore = structuredClone(twoNations);
    await expect(applyCountryCommand(twoNations, institutionCommand(twoNations, 0, preset('central-office')), geography, undefined, fast)).rejects.toThrow();
    expect(twoNations).toEqual(legacyBefore); expect(await snapshot(COUNTRY_V4_DATABASE)).toEqual(unchanged);
  }, 30000);

  it('rejects a stale institution confirmation after another tab commits a different country configuration', async () => {
    const initial = await institutionWorld(), first = new CountryRuntime(), second = new CountryRuntime();
    await first.handle({ id: 1, type: 'open', worldId: initial.document.worldId }); await second.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const stale = await preview(first, initial, institutionCommand(initial.document, 0, preset('central-office')));
    const other = await preview(second, initial, institutionCommand(initial.document, 1, preset('member-autonomy'))), current = await confirm(second, other);
    await expect(confirm(first, stale)).rejects.toThrow(/另一标签|过期/);
    expect(await openCountryWorld(initial.document.worldId)).toEqual(current);
    expect(current.document.regimes[0].institution).toBeNull(); expect(current.document.regimes[1].institution).toEqual(preset('member-autonomy'));
  }, 30000);

  it('locks a nested future institution version in current, backup or undo instead of silently recovering older data', async () => {
    const initial = await institutionWorld(), runtime = new CountryRuntime(); await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const configured = await confirm(runtime, await preview(runtime, initial, institutionCommand(initial.document, 0, preset('central-office'))));
    const saved = await confirm(runtime, await preview(runtime, configured, institutionCommand(configured.document, 1, preset('member-autonomy')), 4), 5);
    const original = await read<Root>(COUNTRY_V4_DATABASE, 'worlds', saved.document.worldId); expect(original.backup).not.toBeNull(); expect(original.undo.length).toBeGreaterThan(0);
    for (const location of ['current', 'backup', 'undo'] as const) {
      const root = structuredClone(original), blob = location === 'undo' ? root.undo[0] : root[location]!;
      const manifest = JSON.parse(new TextDecoder().decode(blob.bytes)); manifest.document.regimes[0].institution = { ...preset('central-office'), version: 2 };
      blob.bytes = countryJsonBytes(manifest); blob.digest = await countryDigest(blob.bytes); await rehashRoot(root); await writeRoot(COUNTRY_V4_DATABASE, root);
      await expect(openCountryWorld(saved.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
      await expect(new CountryRuntime().handle({ id: 1, type: 'open', worldId: saved.document.worldId })).rejects.toBeInstanceOf(CountryFutureVersionError);
      expect(await read(COUNTRY_V4_DATABASE, 'worlds', saved.document.worldId)).toEqual(root);
    }
    // A broken current must not hide a future history envelope behind recovery.
    // Both blob hashes and root metadata are valid: only current's JSON fails.
    // In the undo case backup stays valid and would otherwise be recoverable.
    for (const location of ['backup', 'undo'] as const) {
      const root = structuredClone(original), blob = location === 'undo' ? root.undo[0] : root.backup!;
      const manifest = JSON.parse(new TextDecoder().decode(blob.bytes)); manifest.document.regimes[0].institution = { ...preset('central-office'), version: 2 };
      blob.bytes = countryJsonBytes(manifest); blob.digest = await countryDigest(blob.bytes);
      root.current.bytes = new TextEncoder().encode('{broken-current-json'); root.current.digest = await countryDigest(root.current.bytes);
      await rehashRoot(root); await writeRoot(COUNTRY_V4_DATABASE, root);
      await expect(openCountryWorld(saved.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
      await expect(new CountryRuntime().handle({ id: 2, type: 'open', worldId: saved.document.worldId })).rejects.toBeInstanceOf(CountryFutureVersionError);
      expect(await read(COUNTRY_V4_DATABASE, 'worlds', saved.document.worldId)).toEqual(root);
    }
    await writeRoot(COUNTRY_V4_DATABASE, original); expect(await openCountryWorld(saved.document.worldId)).toEqual(saved);
  }, 30000);

  it('cancels an explicit v3 copy before publishing any destination data and preserves the old history byte for byte', async () => {
    const old = await oldWorld(); await v4.listCountryWorlds();
    const original = await snapshot(COUNTRY_V3_DATABASE), destination = await snapshot(COUNTRY_V4_DATABASE), controller = new AbortController();
    await expect(copyCountryWorldToV4(old.document.worldId, '取消的制度副本', { ...fast, signal: controller.signal, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.signal.aborted).toBe(true); expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(original); expect(await snapshot(COUNTRY_V4_DATABASE)).toEqual(destination);
    expect(await openCountryWorld(old.document.worldId)).toEqual(old);
    const copied = await copyCountryWorldToV4(old.document.worldId, '取消后重试', fast); expect(copied.document.version).toBe(4);
    expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(original);
  }, 30000);
});
