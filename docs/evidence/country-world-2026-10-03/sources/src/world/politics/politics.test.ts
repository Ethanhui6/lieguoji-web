import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import type { CountryGeographyRecord, CountrySource } from './geography';

// These tests exercise the political model, real IndexedDB transactions and
// Worker runtime. Terrain uses a declared tiny adapter fixture; real v4 owner,
// immutable geography decoding and source isolation are in geography.test.ts.
vi.mock('./geography', async importOriginal => {
  const actual = await importOriginal<typeof import('./geography')>();
  return { ...actual,
    prepareCountryGeography: vi.fn(async (source: CountrySource, control?: AtlasControl) => {
      control?.onProgress?.({ stage: 'fixture-source-copy', completed: 1, total: 1 }); control?.signal?.throwIfAborted();
      return { format: 'lieguoji-country-geography', version: 1, source: { ...source }, sourceRoot: new Uint8Array([1]), manifest: new Uint8Array([2]), blocks: [], locks: [], detailCoast: [], encodedBytes: 2, sha256: 'd'.repeat(64) };
    }),
    decodeCountryGeography: vi.fn(async (raw: unknown, control?: AtlasControl) => {
      control?.signal?.throwIfAborted(); if (!raw || typeof raw !== 'object' || (raw as CountryGeographyRecord).format !== 'lieguoji-country-geography') throw new Error('fixture geography missing');
      return { manifest: { spec: { columns: 128, rows: 128 } } } as AtlasDocument;
    }),
    countryClaimCells: vi.fn(async (_data: AtlasDocument, ids: readonly number[], control?: AtlasControl) => { control?.signal?.throwIfAborted(); await control?.yieldTask?.(); return [...new Set(ids)].filter(id => id < 100).sort((a, b) => a - b); }),
    countryLandAt: vi.fn(async (_data: AtlasDocument, xQ: number, yQ: number, control?: AtlasControl) => { control?.signal?.throwIfAborted(); return { cellId: Math.floor(yQ / 8192) * 128 + Math.floor(xQ / 8192), height: yQ < 6000 ? 50 : -20, land: yQ < 6000 }; }),
    countryGeographySource: vi.fn(() => ({ draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 })),
  };
});
import { countryClaimCells, prepareCountryGeography } from './geography';
import { COUNTRY_DATABASE, COUNTRY_LIMITS, CountryFutureVersionError, countryDigest, countryJsonBytes, decodeCountryDocument, encodeCountryDocument, validateCountryCommand, validateCountryDocument,
  type CountryCommand, type CountryDocument, type CountryPreview, type CountryState } from './model';
import { applyCountryCommand } from './core';
import { commitCountryWorld, countryUndoDocument, createCountryWorld, listCountryWorlds, openCountryWorld, readCountryGeography } from './storage';
import { CountryRuntime, validateCountryRequest } from './worker';

const source: CountrySource = { draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 };
const fresh = () => new CountryRuntime();
const id = () => `command-${crypto.randomUUID()}`;
const geo = { manifest: { spec: { columns: 128, rows: 128 } } } as AtlasDocument;
let serial = 0;
const create = async (runtime = fresh()) => ({ runtime, state: await runtime.handle({ id: ++serial, type: 'create', source, name: '山河建国测试' }) as CountryState });
async function preview(runtime: CountryRuntime, state: CountryState, command: CountryCommand) {
  return await runtime.handle({ id: ++serial, type: 'preview', expected: { worldId: state.document.worldId, revision: state.document.revision, rootDigest: state.rootDigest }, command }) as CountryPreview;
}
async function commit(runtime: CountryRuntime, state: CountryState, command: CountryCommand) {
  const candidate = await preview(runtime, state, command);
  return await runtime.handle({ id: ++serial, type: 'confirm', candidateId: candidate.candidateId }) as CountryState;
}
const nationCommand: CountryCommand = { type: 'create-nation', name: '临川', color: '#336699', cellIds: [0, 1, 1, 101] };
async function openDatabase() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(COUNTRY_DATABASE, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function rawWorld(worldId: string): Promise<{ current: { bytes: Uint8Array; digest: string }; backup: { bytes: Uint8Array; digest: string } | null; [key: string]: unknown }> {
  const db = await openDatabase(); try { return await new Promise((resolve, reject) => { const tx = db.transaction('worlds', 'readonly'), get = tx.objectStore('worlds').get(worldId); tx.oncomplete = () => resolve(get.result); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
async function overwriteWorld(worldId: string, raw: unknown) { const db = await openDatabase(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('worlds', 'readwrite'); tx.objectStore('worlds').put(raw, worldId); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); serial = 0; vi.clearAllMocks(); });

describe('independent persisted country slice', () => {
  it('previews a real entity delta without writing, cancels it and retains the unchanged root', async () => {
    const { runtime, state } = await create(), before = await rawWorld(state.document.worldId);
    const candidate = await preview(runtime, state, nationCommand);
    expect(candidate.document.nations).toHaveLength(1); expect(candidate.document.territories.map(t => t.cellId)).toEqual([0, 1]);
    expect(candidate.document.nations[0].id).not.toBe(candidate.document.regimes[0].id);
    expect(await rawWorld(state.document.worldId)).toEqual(before);
    await runtime.handle({ id: ++serial, type: 'cancel-preview' });
    await expect(runtime.handle({ id: ++serial, type: 'confirm', candidateId: candidate.candidateId })).rejects.toThrow('取消');
    expect(await openCountryWorld(state.document.worldId)).toEqual(state);
  });
  it('persists a nation, two cities and capital changes; cold open and undo keep stable IDs', async () => {
    const created = await create(), runtime = created.runtime; let state = await commit(runtime, created.state, nationCommand);
    const nationId = state.document.nations[0].id;
    state = await commit(runtime, state, { type: 'create-city', nationId, name: '临川城', positionQ: { xQ: 1024, yQ: 1024 } });
    state = await commit(runtime, state, { type: 'create-city', nationId, name: '东津', positionQ: { xQ: 9216, yQ: 1024 } });
    const [first, second] = state.document.cities.map(city => city.id);
    state = await commit(runtime, state, { type: 'set-capital', nationId, cityId: first });
    state = await commit(runtime, state, { type: 'set-capital', nationId, cityId: second });
    const cold = fresh(), opened = await cold.handle({ id: ++serial, type: 'open', worldId: state.document.worldId }) as CountryState;
    expect(opened).toEqual(state); expect(vi.mocked(prepareCountryGeography)).toHaveBeenCalledTimes(1);
    const undone = await commit(cold, opened, { type: 'undo' });
    expect(undone.document.nations[0].capitalCityId).toBe(first); expect(undone.document.cities.map(city => city.id)).toEqual([first, second]);
    expect(undone.document.revision).toBe(state.document.revision + 1); expect(undone.undoCount).toBe(state.undoCount - 1);
    expect((await listCountryWorlds())[0]).toMatchObject({ cityCount: 2, nationCount: 1 });
    expect(await readCountryGeography(state.document.worldId)).toEqual(geo);
  });
  it('rejects sea placement, foreign capitals, duplicate city positions and silently stealing land', async () => {
    const created = await create(), runtime = created.runtime; let state = await commit(runtime, created.state, nationCommand);
    state = await commit(runtime, state, { type: 'create-nation', name: '北原', color: '#aa6633', cellIds: [2] });
    const [a, b] = state.document.nations.map(n => n.id);
    await expect(preview(runtime, state, { type: 'claim-territory', nationId: b, cellIds: [0] })).rejects.toThrow('其他国家');
    await expect(preview(runtime, state, { type: 'create-city', nationId: a, name: '海城', positionQ: { xQ: 1024, yQ: 7000 } })).rejects.toThrow('陆地');
    state = await commit(runtime, state, { type: 'create-city', nationId: b, name: '北都', positionQ: { xQ: 17408, yQ: 1024 } });
    await expect(preview(runtime, state, { type: 'set-capital', nationId: a, cityId: state.document.cities[0].id })).rejects.toThrow('本国');
    await expect(preview(runtime, state, { type: 'create-city', nationId: b, name: '重复', positionQ: { xQ: 17408, yQ: 1024 } })).rejects.toThrow('已有城市');
    expect((await openCountryWorld(state.document.worldId)).rootDigest).toBe(state.rootDigest);
  });
  it('rechecks the current durable head when another session wins its confirmation', async () => {
    const { runtime, state } = await create(), other = fresh();
    await other.handle({ id: ++serial, type: 'open', worldId: state.document.worldId });
    const a = await preview(runtime, state, nationCommand), b = await preview(other, state, { ...nationCommand, name: '另一国' });
    const saved = await runtime.handle({ id: ++serial, type: 'confirm', candidateId: a.candidateId }) as CountryState;
    await expect(other.handle({ id: ++serial, type: 'confirm', candidateId: b.candidateId })).rejects.toThrow('另一标签');
    expect(await openCountryWorld(state.document.worldId)).toEqual(saved);
  });
  it('uses command receipts to prevent duplicate commits and rejects reused IDs for other requests', async () => {
    const { state } = await create(), commandId = id(), digest = 'f'.repeat(64);
    const next = (await applyCountryCommand(state.document, nationCommand, geo)).document;
    const [first, simultaneous] = await Promise.all([commitCountryWorld(state, next, commandId, digest), commitCountryWorld(state, next, commandId, digest)]);
    expect(simultaneous).toEqual(first);
    expect(await commitCountryWorld(state, next, commandId, digest)).toEqual(first);
    await expect(commitCountryWorld(state, next, commandId, 'e'.repeat(64))).rejects.toThrow('其他国家操作');
    await expect(commitCountryWorld(state, next, id(), digest)).rejects.toThrow('另一标签');
    expect((await openCountryWorld(state.document.worldId)).document.revision).toBe(1);
  });
  it('opens a corrupt current record only as its read-only backup and never rewrites it', async () => {
    const { runtime, state } = await create(), saved = await commit(runtime, state, nationCommand);
    const raw = await rawWorld(state.document.worldId); raw.current.bytes[10] ^= 1; await overwriteWorld(state.document.worldId, raw);
    const before = await rawWorld(state.document.worldId), recovered = await openCountryWorld(state.document.worldId);
    expect(recovered).toMatchObject({ readOnly: true, recovered: true, undoCount: 0 }); expect(recovered.document.revision).toBe(0);
    const reader = fresh(); await reader.handle({ id: ++serial, type: 'open', worldId: state.document.worldId });
    await expect(preview(reader, recovered, nationCommand)).rejects.toThrow('只读');
    await expect(commitCountryWorld(recovered, saved.document, id(), 'c'.repeat(64))).rejects.toThrow('只读');
    expect(await rawWorld(state.document.worldId)).toEqual(before);
  });
  it('locks future document/root/database versions without silently opening an older backup', async () => {
    const { runtime, state } = await create(); await commit(runtime, state, nationCommand);
    const raw = await rawWorld(state.document.worldId), next = JSON.parse(new TextDecoder().decode(raw.current.bytes)); next.version = 2;
    raw.current.bytes = countryJsonBytes(next); raw.current.digest = await countryDigest(raw.current.bytes); await overwriteWorld(state.document.worldId, raw);
    await expect(openCountryWorld(state.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
    raw.version = 2; await overwriteWorld(state.document.worldId, raw);
    await expect(openCountryWorld(state.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
    globalThis.indexedDB = new IDBFactory();
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(COUNTRY_DATABASE, 2); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    await expect(listCountryWorlds()).rejects.toBeInstanceOf(CountryFutureVersionError);
  });
  it('rejects history corruption instead of enabling destructive undo', async () => {
    const { runtime, state } = await create(), saved = await commit(runtime, state, nationCommand), raw = await rawWorld(state.document.worldId);
    const history = raw.undo as { bytes: Uint8Array }[]; history[0] = { ...history[0], bytes: new Uint8Array(history[0].bytes) }; history[0].bytes[0] = 0; await overwriteWorld(state.document.worldId, raw);
    const recovered = await openCountryWorld(state.document.worldId); expect(recovered.readOnly).toBe(true);
    await expect(countryUndoDocument(recovered)).rejects.toThrow('只读');
    expect(saved.document.nations).toHaveLength(1);
  });
  it('rejects checksum-valid but geographically illegal undo history before preview', async () => {
    const { runtime, state } = await create(), saved = await commit(runtime, state, nationCommand), raw = await rawWorld(state.document.worldId);
    const bad: CountryDocument = { ...structuredClone(saved.document), revision: 0, territories: [{ ...saved.document.territories[0], cellId: 20000 }] };
    expect(validateCountryDocument(bad)).toBe(true);
    const bytes = encodeCountryDocument(bad); raw.undo = [{ bytes, digest: await countryDigest(bytes) }];
    const describe = (row: { digest: string; bytes: Uint8Array }) => ({ digest: row.digest, size: row.bytes.length });
    // Supply a correctly checksummed stored envelope, not a broken-byte case.
    raw.rootDigest = await countryDigest(countryJsonBytes({ format: raw.format, version: raw.version, worldId: raw.worldId,
      current: describe(raw.current), backup: raw.backup ? describe(raw.backup) : null, undo: (raw.undo as { digest: string; bytes: Uint8Array }[]).map(describe), lastCommandId: raw.lastCommandId }));
    await overwriteWorld(state.document.worldId, raw);
    const reader = fresh(), opened = await reader.handle({ id: ++serial, type: 'open', worldId: state.document.worldId }) as CountryState;
    expect(opened.readOnly).toBe(false);
    await expect(preview(reader, opened, { type: 'undo' })).rejects.toThrow('实际地理范围');
    expect(await rawWorld(state.document.worldId)).toEqual(raw);
  });
  it('rechecks undo geography again at confirmation and preserves the root on failure', async () => {
    const created = await create(), runtime = created.runtime; let state = await commit(runtime, created.state, nationCommand);
    state = await commit(runtime, state, { type: 'rename-nation', nationId: state.document.nations[0].id, name: '临川新名' });
    const candidate = await preview(runtime, state, { type: 'undo' }), before = await rawWorld(state.document.worldId);
    vi.mocked(countryClaimCells).mockResolvedValueOnce([]);
    await expect(runtime.handle({ id: ++serial, type: 'confirm', candidateId: candidate.candidateId })).rejects.toThrow('没有真实陆地');
    expect(await rawWorld(state.document.worldId)).toEqual(before);
  });
  it('owns the geography bytes and source before create yields instead of saving mutable caller data', async () => {
    const record = await prepareCountryGeography(source), original = structuredClone(record);
    const creating = createCountryWorld(record, '私有副本'); record.source.revision = 999; record.manifest.fill(99); record.sourceRoot.fill(88);
    const state = await creating; expect(state.document.source).toEqual(original.source);
    const db = await openDatabase();
    try { const stored = await new Promise((resolve, reject) => { const tx = db.transaction('geography', 'readonly'), get = tx.objectStore('geography').get(state.document.worldId); tx.oncomplete = () => resolve(get.result); tx.onabort = () => reject(tx.error); }); expect(stored).toEqual(original); }
    finally { db.close(); }
  });
  it('aborts creation before any visible root or geography copy and leaves prior worlds intact', async () => {
    const original = await create(), runtime = fresh();
    await expect(runtime.handle({ id: ++serial, type: 'create', source, name: '取消副本' }, () => runtime.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(await listCountryWorlds()).toHaveLength(1); expect(await openCountryWorld(original.state.document.worldId)).toEqual(original.state);
    const record = await prepareCountryGeography(source), abort = new AbortController(); abort.abort();
    await expect(createCountryWorld(record, '已取消', abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const db = await openDatabase(); try { const counts = await new Promise<number[]>((resolve, reject) => { const tx = db.transaction(['worlds', 'geography'], 'readonly'), worlds = tx.objectStore('worlds').count(), geography = tx.objectStore('geography').count(); tx.oncomplete = () => resolve([worlds.result, geography.result]); tx.onabort = () => reject(tx.error); }); expect(counts).toEqual([1, 1]); } finally { db.close(); }
  });
  it('validates exact schemas, command bounds and the real 256 KiB document cap', async () => {
    const { state } = await create(), next = (await applyCountryCommand(state.document, nationCommand, geo)).document;
    expect(validateCountryDocument({ ...next, population: 123 })).toBe(false);
    expect(validateCountryCommand({ ...nationCommand, cellIds: Array.from({ length: 1025 }, (_, i) => i) })).toBe(false);
    expect(validateCountryRequest({ id: 1, type: 'list', extra: true })).toBe(false);
    const broken = structuredClone(next); broken.nations[0].capitalCityId = `city-${crypto.randomUUID()}`; expect(validateCountryDocument(broken)).toBe(false);
    const large: CountryDocument = structuredClone(next); large.territories = Array.from({ length: 3000 }, (_, cellId) => ({ cellId, legalNationId: next.nations[0].id, controllingNationId: next.nations[0].id }));
    expect(countryJsonBytes(large).length).toBeGreaterThan(COUNTRY_LIMITS.documentBytes); expect(() => encodeCountryDocument(large)).toThrow('256 KiB');
    expect(decodeCountryDocument(encodeCountryDocument(next))).toEqual(next);
  });
});
