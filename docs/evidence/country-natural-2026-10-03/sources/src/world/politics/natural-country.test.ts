import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import type { CountrySource } from './geography';

const fixture = vi.hoisted(() => ({ seaSeeds: new Set<number>([2]), cityCell: 0 }));
// Production transactions, codec, command/Worker route and source-copy logic;
// geometry is a declared adapter. Actual Voronoi coastline checks are separate.
vi.mock('./geography', async original => {
  const actual = await original<typeof import('./geography')>();
  return { ...actual,
    prepareCountryGeography: vi.fn(async (source: CountrySource) => ({ format: 'lieguoji-country-geography', version: 1, source, sourceRoot: new Uint8Array([1]), manifest: new Uint8Array([2]), blocks: [], locks: [], detailCoast: [], encodedBytes: 2, sha256: 'd'.repeat(64) })),
    decodeCountryGeography: vi.fn(async () => ({ manifest: { spec: { columns: 128, rows: 128 } } } as AtlasDocument)),
    countryGeographySource: vi.fn(() => ({ draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 })),
    countryClaimCells: vi.fn(async (_data: AtlasDocument, ids: readonly number[], control?: AtlasControl, geometry = 'atlas-cell-v1') => {
      control?.signal?.throwIfAborted(); return [...new Set(ids)].filter(id => geometry !== 'political-voronoi-v1' || !fixture.seaSeeds.has(id)).sort((a, b) => a - b);
    }),
    countryLandAt: vi.fn(async (_data: AtlasDocument, _x: number, _y: number, control?: AtlasControl, geometry = 'atlas-cell-v1') => {
      control?.signal?.throwIfAborted(); return { cellId: geometry === 'political-voronoi-v1' ? fixture.cityCell : 0, height: 20, land: true };
    }),
  };
});
vi.mock('./country-selection', () => ({ selectCountryPolygon: vi.fn(async (_data: AtlasDocument, request: { source: CountrySource; geometry?: string }, control?: AtlasControl) => {
  control?.signal?.throwIfAborted(); return { source: request.source, rule: 'cell-center-land-v1', cellIds: [0, 1], scannedCells: 2, polygonMatchedCells: 2, seaRejectedCells: 0 };
}) }));
import { countryClaimCells, countryLandAt, prepareCountryGeography } from './geography';
import { selectCountryPolygon } from './country-selection';
import { COUNTRY_DATABASE, CountryFutureVersionError, countryDigest, countryGeometry, countryJsonBytes, type CountryDocument, type CountryPreview, type CountryState } from './model';
import { COUNTRY_V2_DATABASE, COUNTRY_V3_DATABASE, decodeCountryManifest } from './chunk-codec';
import { CountryTransferReader, streamCountryResult } from './transfer';
import * as v1 from './storage-v1';
import * as v2 from './storage-v2';
import * as v3 from './storage-v3';
import { openCountryWorld, commitCountryWorld, copyCountryWorldToV3, listCountryWorlds } from './storage';
import { applyCountryCommand } from './core';
import { CountryRuntime } from './worker';

const source: CountrySource = { draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 };
const geo = { manifest: { spec: { columns: 128, rows: 128 } } } as AtlasDocument;
const commandId = () => `command-${crypto.randomUUID()}`;
const outlineQ = [{ xQ: 0, yQ: 0 }, { xQ: 16384, yQ: 0 }, { xQ: 16384, yQ: 16384 }, { xQ: 0, yQ: 16384 }];
type Root = { version: number; worldId: string; storedChunkBytes: number; rootDigest: string; current: { bytes: Uint8Array; digest: string }; backup: { bytes: Uint8Array; digest: string } | null; undo: { bytes: Uint8Array; digest: string }[]; lastCommandId: string; format: string };
async function db(name: string) { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function read<T>(name: string, store: string, key: string): Promise<T> { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(store, 'readonly'), get = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(get.result); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function overwrite(name: string, worldId: string, value: unknown) { const database = await db(name); try { await new Promise<void>((resolve, reject) => { const tx = database.transaction('worlds', 'readwrite'); tx.objectStore('worlds').put(value, worldId); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function snapshot(name: string) {
  const database = await db(name);
  try { return await new Promise<unknown[]>((resolve, reject) => { const names = [...database.objectStoreNames].sort(), tx = database.transaction(names, 'readonly'), requests = names.map(store => ({ store, keys: tx.objectStore(store).getAllKeys(), rows: tx.objectStore(store).getAll() })); tx.oncomplete = () => resolve(requests.map(row => ({ store: row.store, keys: row.keys.result, rows: row.rows.result }))); tx.onabort = () => reject(tx.error); }); }
  finally { database.close(); }
}
async function legacy(version: 1 | 2, city = false) {
  const store = version === 1 ? v1 : v2, empty = await store.createCountryWorld(await prepareCountryGeography(source), `原 v${version}`);
  const nation = (await applyCountryCommand(empty.document, { type: 'create-nation', name: '原国', color: '#336699', cellIds: [0, 1, 2] }, geo)).document;
  let state = await store.commitCountryWorld(empty, nation, commandId(), 'a'.repeat(64));
  if (city) { const candidate = (await applyCountryCommand(state.document, { type: 'create-city', nationId: nation.nations[0].id, name: '原城', positionQ: { xQ: 1024, yQ: 1024 } }, geo)).document; state = await store.commitCountryWorld(state, candidate, commandId(), 'b'.repeat(64)); }
  return state;
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); fixture.seaSeeds = new Set([2]); fixture.cityCell = 0; vi.clearAllMocks(); });

describe('v3 natural country geometry is an explicit independent semantic version', () => {
  it('routes new world preview, confirmation, city and undo checks through v3 geometry and streams document3 in layout2', async () => {
    const runtime = new CountryRuntime(), initial = await runtime.handle({ id: 1, type: 'create', source, name: '自然国界' }) as CountryState;
    expect(initial.document.version).toBe(3); expect(countryGeometry(initial.document)).toBe('political-voronoi-v1');
    const expected = (state: CountryState) => ({ worldId: state.document.worldId, revision: state.document.revision, rootDigest: state.rootDigest });
    const preview = await runtime.handle({ id: 2, type: 'preview', expected: expected(initial), command: { type: 'create-nation-shape', name: '新国', color: '#446688', outlineQ } }) as CountryPreview;
    expect((await openCountryWorld(initial.document.worldId)).document.nations).toHaveLength(0);
    const saved = await runtime.handle({ id: 3, type: 'confirm', candidateId: preview.candidateId }) as CountryState;
    expect(vi.mocked(selectCountryPolygon).mock.calls).toHaveLength(2); for (const call of vi.mocked(selectCountryPolygon).mock.calls) expect(call[1].geometry).toBe('political-voronoi-v1');
    const city = await runtime.handle({ id: 4, type: 'preview', expected: expected(saved), command: { type: 'create-city', nationId: saved.document.nations[0].id, name: '新城', positionQ: { xQ: 1024, yQ: 1024 } } }) as CountryPreview;
    const withCity = await runtime.handle({ id: 5, type: 'confirm', candidateId: city.candidateId }) as CountryState;
    for (const call of vi.mocked(countryLandAt).mock.calls) expect(call[4]).toBe('political-voronoi-v1');
    const undo = await runtime.handle({ id: 6, type: 'preview', expected: expected(withCity), command: { type: 'undo' } }) as CountryPreview;
    const undone = await runtime.handle({ id: 7, type: 'confirm', candidateId: undo.candidateId }) as CountryState; expect(undone.document.cities).toHaveLength(0);
    for (const call of vi.mocked(countryClaimCells).mock.calls) expect(call[3]).toBe('political-voronoi-v1');
    const root = await read<Root>(COUNTRY_V3_DATABASE, 'worlds', undone.document.worldId), manifest = decodeCountryManifest(root.current.bytes);
    expect(root.version).toBe(3); expect(manifest.version).toBe(2); expect(manifest.document.version).toBe(3);
    const parts: { kind: string; value: unknown }[] = [], end = await streamCountryResult(undone, (kind, value) => parts.push({ kind, value }));
    const receiver = new CountryTransferReader(parts[0].value, 'state'); for (const part of parts.slice(1)) receiver.append(part.value); expect(await receiver.finish(end)).toEqual(undone);
  });
  it('explicitly copies v1 and v2 with stable entities, new IDs and filtered true-land seeds while preserving every source store', async () => {
    for (const version of [1, 2] as const) {
      const old = await legacy(version, true), database = version === 1 ? COUNTRY_DATABASE : COUNTRY_V2_DATABASE, before = await snapshot(database), prepared = vi.mocked(prepareCountryGeography).mock.calls.length;
      const copied = await copyCountryWorldToV3(old.document.worldId, `自然副本 v${version}`);
      expect(copied.document).toMatchObject({ version: 3, revision: 0, name: `自然副本 v${version}` }); expect(copied.undoCount).toBe(0); expect(copied.document.worldId).not.toBe(old.document.worldId);
      expect(copied.document.nations).toEqual(old.document.nations); expect(copied.document.cities).toEqual(old.document.cities); expect(copied.document.regimes).toEqual(old.document.regimes); expect(copied.document.territories.map(t => t.cellId)).toEqual([0, 1]);
      expect(await snapshot(database)).toEqual(before); expect(await openCountryWorld(old.document.worldId)).toEqual(old); expect(vi.mocked(prepareCountryGeography).mock.calls).toHaveLength(prepared);
      expect(await read(COUNTRY_V3_DATABASE, 'geography', copied.document.worldId)).toEqual(await read(database, 'geography', old.document.worldId));
    }
  });
  it('refuses changed city ownership and empty nations before any destination root, chunk or receipt is saved', async () => {
    const old = await legacy(2, true); await listCountryWorlds(); const beforeOld = await snapshot(COUNTRY_V2_DATABASE), beforeNew = await snapshot(COUNTRY_V3_DATABASE);
    fixture.cityCell = 999;
    await expect(copyCountryWorldToV3(old.document.worldId, '不应存在的错城副本')).rejects.toThrow('城市不在所属');
    expect(await snapshot(COUNTRY_V2_DATABASE)).toEqual(beforeOld); expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(beforeNew);
    fixture.cityCell = 0; fixture.seaSeeds = new Set([0, 1, 2]);
    await expect(copyCountryWorldToV3(old.document.worldId, '不应存在的空国副本')).rejects.toThrow('失去全部真实陆地');
    expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(beforeNew);
    fixture.seaSeeds.clear(); const abort = new AbortController();
    await expect(copyCountryWorldToV3(old.document.worldId, '取消副本', { signal: abort.signal, onProgress: () => abort.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await snapshot(COUNTRY_V2_DATABASE)).toEqual(beforeOld); expect(await snapshot(COUNTRY_V3_DATABASE)).toEqual(beforeNew);
  });
  it('keeps v3 receipts and CAS atomic and rejects ordinary cross-version writes', async () => {
    const old = await legacy(2), state = await copyCountryWorldToV3(old.document.worldId, 'CAS'), next = (await applyCountryCommand(state.document, { type: 'rename-nation', nationId: state.document.nations[0].id, name: '新名' }, geo)).document, id = commandId();
    const [a, b] = await Promise.all([commitCountryWorld(state, next, id, 'c'.repeat(64)), commitCountryWorld(state, next, id, 'c'.repeat(64))]); expect(a).toEqual(b); expect(await commitCountryWorld(state, next, id, 'c'.repeat(64))).toEqual(a);
    await expect(commitCountryWorld(state, next, commandId(), 'd'.repeat(64))).rejects.toThrow('另一标签');
    await expect(commitCountryWorld(a, { ...next, version: 2 }, commandId(), 'd'.repeat(64))).rejects.toThrow('隐式');
    await expect(v3.commitCountryWorld(a, { ...next, version: 2 }, commandId(), 'd'.repeat(64))).rejects.toBeInstanceOf(CountryFutureVersionError);
    const oldBefore = await snapshot(COUNTRY_V2_DATABASE);
    await expect(v2.commitCountryWorld(old, { ...old.document, version: 3, revision: old.document.revision + 1 }, commandId(), 'd'.repeat(64))).rejects.toBeInstanceOf(CountryFutureVersionError);
    expect(await snapshot(COUNTRY_V2_DATABASE)).toEqual(oldBefore);
  });
  it('never recovers across a future root/semantic version or allows document3 to enter the v2 library', async () => {
    const old = await legacy(2), state = await copyCountryWorldToV3(old.document.worldId, '未来锁'), next: CountryDocument = { ...state.document, revision: 1 };
    const saved = await commitCountryWorld(state, next, commandId(), 'd'.repeat(64)), root = await read<Root>(COUNTRY_V3_DATABASE, 'worlds', saved.document.worldId);
    const manifest = JSON.parse(new TextDecoder().decode(root.current.bytes)); manifest.document.version = 4; root.current.bytes = countryJsonBytes(manifest); root.current.digest = await countryDigest(root.current.bytes); await overwrite(COUNTRY_V3_DATABASE, saved.document.worldId, root);
    await expect(openCountryWorld(saved.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
    root.version = 4; await overwrite(COUNTRY_V3_DATABASE, saved.document.worldId, root); await expect(openCountryWorld(saved.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
    const oldRoot = await read<Root>(COUNTRY_V2_DATABASE, 'worlds', old.document.worldId), oldManifest = JSON.parse(new TextDecoder().decode(oldRoot.current.bytes)); oldManifest.document.version = 3; oldRoot.current.bytes = countryJsonBytes(oldManifest); oldRoot.current.digest = await countryDigest(oldRoot.current.bytes); await overwrite(COUNTRY_V2_DATABASE, old.document.worldId, oldRoot);
    await expect(openCountryWorld(old.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
    expect(await read(COUNTRY_V2_DATABASE, 'worlds', old.document.worldId)).toEqual(oldRoot);
  });
});
