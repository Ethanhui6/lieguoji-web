import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import type { CountrySource, CountryGeographyRecord } from './geography';

// Real IndexedDB + production codec/runtime/stream, with an explicitly
// synthetic all-land adapter. These numbers are not real-terrain acceptance.
vi.mock('./geography', async original => {
  const actual = await original<typeof import('./geography')>();
  return { ...actual,
    prepareCountryGeography: vi.fn(async (source: CountrySource) => ({ format: 'lieguoji-country-geography', version: 1, source, sourceRoot: new Uint8Array([1]), manifest: new Uint8Array([2]), blocks: [], locks: [], detailCoast: [], encodedBytes: 2, sha256: 'd'.repeat(64) })),
    decodeCountryGeography: vi.fn(async (record: unknown) => { if (!(record as CountryGeographyRecord)?.source) throw new Error('fixture missing'); return { manifest: { spec: { columns: 512, rows: 512 } } } as AtlasDocument; }),
    countryGeographySource: vi.fn(() => ({ draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 })),
    countryClaimCells: vi.fn(async (_data: AtlasDocument, ids: readonly number[], control?: AtlasControl) => { control?.signal?.throwIfAborted(); return [...new Set(ids)].sort((a, b) => a - b); }),
    countryLandAt: vi.fn(async () => ({ cellId: 0, height: 50, land: true })),
  };
});
vi.mock('./country-selection', () => ({ selectCountryPolygon: vi.fn(async (_data: AtlasDocument, request: { source: CountrySource }, control?: AtlasControl) => {
  control?.signal?.throwIfAborted(); return { source: request.source, rule: 'cell-center-land-v1', cellIds: Array.from({ length: 65536 }, (_, id) => id), scannedCells: 65536, polygonMatchedCells: 65536, seaRejectedCells: 0 };
}) }));
import { prepareCountryGeography } from './geography';
import { COUNTRY_DATABASE, COUNTRY_LIMITS, CountryFutureVersionError, countryDigest, countryJsonBytes, type CountryDocument, type CountryState, type CountryPreview } from './model';
import { COUNTRY_V2_DATABASE, decodeCountryChunks, decodeCountryManifest, encodeCountryChunks } from './chunk-codec';
import { CountryTransferReader, streamCountryResult } from './transfer';
import { createCountryWorld as createLegacy, commitCountryWorld as commitLegacy } from './storage-v1';
import { createCountryWorld, openCountryWorld, commitCountryWorld, copyCountryWorldToV2, countryUndoDocument } from './storage';
import { applyCountryCommand } from './core';
import { CountryRuntime } from './worker';

const source: CountrySource = { draftId: 'atlas-00000000-0000-4000-8000-000000000001', revision: 1, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 };
const geo = { manifest: { spec: { columns: 512, rows: 512 } } } as AtlasDocument;
const commandId = () => `command-${crypto.randomUUID()}`;
const outlineQ = [{ xQ: 0, yQ: 0 }, { xQ: 1048576, yQ: 0 }, { xQ: 1048576, yQ: 1048576 }, { xQ: 0, yQ: 1048576 }];
type Root = { version: number; worldId: string; storedChunkBytes: number; rootDigest: string; current: { bytes: Uint8Array; digest: string }; backup: { bytes: Uint8Array; digest: string } | null; undo: { bytes: Uint8Array; digest: string }[]; lastCommandId: string; format: string };
async function db(name = COUNTRY_V2_DATABASE) { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function read<T>(store: string, key: string, name = COUNTRY_V2_DATABASE): Promise<T> { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(store, 'readonly'), get = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(get.result); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function write(store: string, key: string, value: unknown, name = COUNTRY_V2_DATABASE) { const database = await db(name); try { await new Promise<void>((resolve, reject) => { const tx = database.transaction(store, 'readwrite'); if (value === undefined) tx.objectStore(store).delete(key); else tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function small() { const state = await createCountryWorld(await prepareCountryGeography(source), '分块世界'); const next = (await applyCountryCommand(state.document, { type: 'create-nation', name: '南陆', color: '#336699', cellIds: [0, 1] }, geo)).document; return { base: state, state: await commitCountryWorld(state, next, commandId(), 'f'.repeat(64)) }; }
function expanded(base: CountryDocument, count: number): CountryDocument {
  const nationId = `nation-${crypto.randomUUID()}`, regimeId = `regime-${crypto.randomUUID()}`;
  return { ...structuredClone(base), revision: base.revision + 1, nations: [{ id: nationId, name: '广陆', color: '#445566', regimeId, capitalCityId: null, labelAnchorQ: { xQ: 1, yQ: 1 } }], regimes: [{ id: regimeId, nationId, name: '广陆政权' }],
    territories: Array.from({ length: count }, (_, cellId) => ({ cellId, legalNationId: nationId, controllingNationId: nationId })) };
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); vi.clearAllMocks(); });

describe('v2 bounded country chunks and explicit v1 isolation', () => {
  it('persists and cold-opens 65,536 cells through runtime and bounded messages without a UUID-table packet', async () => {
    const runtime = new CountryRuntime(), initial = await runtime.handle({ id: 1, type: 'create', source, name: '65k 合成地理' }) as CountryState;
    expect(initial.document.version).toBe(2);
    const before = await read<Root>('worlds', initial.document.worldId), preview = await runtime.handle({ id: 2, type: 'preview', expected: { worldId: initial.document.worldId, revision: 0, rootDigest: initial.rootDigest }, command: { type: 'create-nation-shape', name: '全陆', color: '#336699', outlineQ } }) as CountryPreview;
    expect(preview.document.territories).toHaveLength(65536); expect(await read('worlds', initial.document.worldId)).toEqual(before);
    const started = performance.now(), saved = await runtime.handle({ id: 3, type: 'confirm', candidateId: preview.candidateId }) as CountryState, writeMs = performance.now() - started;
    const reading = performance.now(), cold = await new CountryRuntime().handle({ id: 1, type: 'open', worldId: saved.document.worldId }) as CountryState, readMs = performance.now() - reading;
    expect(cold.document).toEqual(saved.document); expect(countryJsonBytes(cold.document).length).toBeGreaterThan(COUNTRY_LIMITS.packetBytes);
    const packets: { kind: string; value: unknown }[] = [], end = await streamCountryResult(cold, (kind, value) => packets.push({ kind, value }));
    const receiver = new CountryTransferReader(packets[0].value, 'state'); for (const packet of packets.slice(1)) receiver.append(packet.value);
    expect(await receiver.finish(end)).toEqual(cold);
    const root = await read<Root>('worlds', saved.document.worldId), manifest = decodeCountryManifest(root.current.bytes);
    const maximum = Math.max(...packets.map(part => countryJsonBytes({ id: 123, ...part }).length), countryJsonBytes({ id: 123, kind: 'complete', value: end }).length);
    expect(maximum).toBeLessThanOrEqual(COUNTRY_LIMITS.packetBytes); expect(manifest.pages).toHaveLength(64); expect(root.current.bytes.length).toBeLessThan(16384);
    console.info(JSON.stringify({ fixture: 'synthetic-all-land-adapter-not-real-terrain', territoryCount: 65536, manifestBytes: root.current.bytes.length, chunksBytes: root.storedChunkBytes, pageCount: manifest.pages.length, maxWirePacketBytes: maximum, writeMs, readMs }));
    const undo = await countryUndoDocument(cold), reverted = await commitCountryWorld(cold, undo, commandId(), 'e'.repeat(64), true);
    expect(reverted.document.territories).toHaveLength(0); expect(reverted.document.revision).toBe(2);
  }, 120000);
  it('keeps unchanged chunk bytes shared across rename, atomic receipts and competing heads', async () => {
    const { state } = await small(), before = await read<Root>('worlds', state.document.worldId);
    const next = (await applyCountryCommand(state.document, { type: 'rename-nation', nationId: state.document.nations[0].id, name: '改名南陆' }, geo)).document, id = commandId();
    const [a, b] = await Promise.all([commitCountryWorld(state, next, id, 'a'.repeat(64)), commitCountryWorld(state, next, id, 'a'.repeat(64))]); expect(a).toEqual(b);
    expect(await commitCountryWorld(state, next, id, 'a'.repeat(64))).toEqual(a);
    await expect(commitCountryWorld(state, next, commandId(), 'b'.repeat(64))).rejects.toThrow('另一标签');
    await expect(commitCountryWorld(state, next, id, 'c'.repeat(64))).rejects.toThrow('其他国家操作');
    const after = await read<Root>('worlds', state.document.worldId); expect(after.storedChunkBytes).toBe(before.storedChunkBytes); expect(decodeCountryManifest(after.current.bytes).pages).toEqual(decodeCountryManifest(before.current.bytes).pages);
  });
  it('recovers missing or changed chunks only as read-only backup and locks future manifests', async () => {
    for (const corruption of ['missing', 'changed', 'future'] as const) {
      globalThis.indexedDB = new IDBFactory(); const { base, state } = await small(), root = await read<Root>('worlds', state.document.worldId), ref = decodeCountryManifest(root.current.bytes).pages[0], key = `${state.document.worldId}:${ref.digest}`;
      if (corruption === 'future') { const raw = JSON.parse(new TextDecoder().decode(root.current.bytes)); raw.version = 3; root.current.bytes = countryJsonBytes(raw); root.current.digest = await countryDigest(root.current.bytes); await write('worlds', state.document.worldId, root); await expect(openCountryWorld(state.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError); }
      else { const bytes = await read<Uint8Array>('chunks', key); bytes[10] ^= 1; await write('chunks', key, corruption === 'missing' ? undefined : bytes); const recovered = await openCountryWorld(state.document.worldId); expect(recovered).toMatchObject({ readOnly: true, recovered: true, undoCount: 0 }); expect(recovered.document).toEqual(base.document); await expect(commitCountryWorld(recovered, state.document, commandId(), 'a'.repeat(64))).rejects.toThrow('只读'); }
      expect(await read('worlds', state.document.worldId)).toEqual(root);
    }
  });
  it('rejects reordered, missing, duplicate and altered page messages before exposing a document', async () => {
    const state = await createCountryWorld(await prepareCountryGeography(source), '协议'), document = expanded(state.document, 2048), value = { ...state, document };
    const parts: { kind: string; value: unknown }[] = [], end = await streamCountryResult(value, (kind, value) => parts.push({ kind, value }));
    const reordered = new CountryTransferReader(parts[0].value, 'state'); expect(() => reordered.append(parts[2].value)).toThrow('顺序');
    const partial = new CountryTransferReader(parts[0].value, 'state'); partial.append(parts[1].value); await expect(partial.finish(end)).rejects.toThrow('未完整'); expect(() => partial.append(parts[1].value)).toThrow('顺序');
    const altered = new CountryTransferReader(parts[0].value, 'state'); const part = structuredClone(parts[1].value) as { text: string }; part.text = part.text.replace('nation-', 'natioX-'); altered.append(part); altered.append(parts[2].value); await expect(altered.finish(end)).rejects.toThrow('摘要');
    expect((await openCountryWorld(state.document.worldId)).document.territories).toHaveLength(0);
  });
  it('owns all pages before asynchronous encoding and never exposes private reference objects to readers', async () => {
    const state = await createCountryWorld(await prepareCountryGeography(source), '所有权'), document = expanded(state.document, 2048), original = structuredClone(document), running = encodeCountryChunks(document);
    document.name = '调用方后改'; document.source.revision++; document.territories[1500].cellId = 99999;
    const encoded = await running, decoded = await decodeCountryChunks(encoded.bytes, async ref => { const chunk = encoded.chunks.find(row => row.digest === ref.digest)!; ref.pageId = 99; ref.digest = '0'.repeat(64); return chunk.bytes; });
    expect(decoded).toEqual(original);
  });
  it('rejects unused or unknown dictionary identities even with recalculated checksums', async () => {
    const state = await createCountryWorld(await prepareCountryGeography(source), '字典'), document = expanded(state.document, 1), encoded = await encodeCountryChunks(document);
    const page = JSON.parse(new TextDecoder().decode(encoded.chunks[0].bytes)) as { dictionary: string[]; rows: number[][] };
    const used = page.dictionary[0]; page.dictionary.push(`nation-${crypto.randomUUID()}`); page.dictionary.sort(); page.rows[0][1] = page.dictionary.indexOf(used); page.rows[0][2] = page.dictionary.indexOf(used);
    const bytes = countryJsonBytes(page), manifest = decodeCountryManifest(encoded.bytes); manifest.pages[0].digest = await countryDigest(bytes); manifest.pages[0].size = bytes.length;
    await expect(decodeCountryChunks(countryJsonBytes(manifest), async () => bytes)).rejects.toThrow('未使用');
  });
  it('copies v1 explicitly into a new v2 identity using its own geography and never rewrites legacy bytes', async () => {
    const old = await createLegacy(await prepareCountryGeography(source), '旧档'), document = (await applyCountryCommand(old.document, { type: 'create-nation', name: '旧国', color: '#446688', cellIds: [0, 1] }, geo)).document;
    const saved = await commitLegacy(old, document, commandId(), 'b'.repeat(64)), rootBefore = await read('worlds', saved.document.worldId, COUNTRY_DATABASE), geoBefore = await read('geography', saved.document.worldId, COUNTRY_DATABASE);
    await expect(applyCountryCommand(saved.document, { type: 'create-nation-shape', name: '非法新规则', color: '#112233', outlineQ }, geo)).rejects.toThrow('v2 独立副本');
    const preparations = vi.mocked(prepareCountryGeography).mock.calls.length;
    const copied = await copyCountryWorldToV2(saved.document.worldId, '明确副本'); expect(copied.document.version).toBe(2); expect(copied.document.worldId).not.toBe(saved.document.worldId); expect(copied.document.nations).toEqual(saved.document.nations); expect(copied.document.territories).toEqual(saved.document.territories);
    expect(await read('worlds', saved.document.worldId, COUNTRY_DATABASE)).toEqual(rootBefore); expect(await read('geography', saved.document.worldId, COUNTRY_DATABASE)).toEqual(geoBefore); expect(await openCountryWorld(saved.document.worldId)).toEqual(saved);
    expect(vi.mocked(prepareCountryGeography).mock.calls).toHaveLength(preparations);
  });
  it('does not treat a future legacy database as missing when finding a v2 world', async () => {
    const state = await createCountryWorld(await prepareCountryGeography(source), '未来锁');
    const future = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(COUNTRY_DATABASE, 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); future.close();
    await expect(openCountryWorld(state.document.worldId)).rejects.toBeInstanceOf(CountryFutureVersionError);
  });
});
