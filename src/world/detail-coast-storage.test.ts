import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasDraft, encodeBlock, type AtlasBlock } from './model';
import { cloneAtlasDocument, createGenerationDraft, encodeAtlasManifest, verifyAtlasDocument, type AtlasCellLockBlock, type AtlasGenerationDocument } from './atlas-format';
import { encodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { encodeDetailCoastTile, hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastSampleTile, type DetailCoastTile } from './detail-coast-types';
import { ATLAS_DETAIL_COAST_DB, ATLAS_DRAFTS_DB, ATLAS_GENERATION_DB, ATLAS_SURFACE_DB, ATLAS_STORAGE_LIMIT, ATLAS_STORAGE_PAGE_BYTES, AtlasStorageFallbackError, atlasStorageLogicalBytes, getAtlasStorage, type AtlasReadHandle, type AtlasStoredRoot } from './storage';

const control = { yieldTask: async () => {} }, api = getAtlasStorage(4);
const stores = ['blocks', 'manifests', 'roots', 'preparations', 'receipts', 'meta'];
type BlobRecord = { format: string; version: number; domain: string; kind: string; digest: string; bytes: Uint8Array };
type DatabaseSnapshot = { name: string; keys: IDBValidKey[]; values: unknown[] }[];
let base: AtlasGenerationDocument<4>;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'detail-coast-storage-synthetic', name: '细海岸存储合成样本' }, control, 4); }, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

async function db(name = ATLAS_DETAIL_COAST_DB) { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function raw(store: string, key: string, name?: string): Promise<unknown> { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(store, 'readonly'), request = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function put(store: string, key: string, value: unknown) { const database = await db(); try { await new Promise<void>((resolve, reject) => { const tx = database.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function snapshot(name = ATLAS_DETAIL_COAST_DB): Promise<DatabaseSnapshot> { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(stores, 'readonly'), requests = stores.map(name => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() })); tx.oncomplete = () => resolve(requests.map(request => ({ name: request.name, keys: request.keys.result, values: request.values.result }))); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
function samples(bx: number, by: number, offset = 0): DetailCoastSampleTile {
  const layout = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
  for (let index = 0; index < layout.count; index++) { const land = index % 32 < 16; coverageQ[index] = land ? 128 + offset : -128 - offset; elevationMeters[index] = land ? 320 + offset : -740 - offset; }
  return { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters };
}
async function withTiles(tiles: DetailCoastTile[] = [samples(20, 20), { format: 'lieguoji-detail-coast-tile', version: 1, bx: 21, by: 20, mode: 'land' }]) {
  const data = cloneAtlasDocument(base);
  for (const tile of [...tiles].sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx)) { data.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile); data.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) }); }
  return data;
}
async function prepare(data: AtlasGenerationDocument<4>, root: AtlasStoredRoot | null = null, includeFine = true) {
  const prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, control);
  const contents: (AtlasBlock | AtlasCellLockBlock | DetailCoastTile)[] = [...data.blocks.values(), ...data.locks.values(), ...(includeFine ? data.detailCoast.values() : [])];
  for (let index = 0; index < contents.length; index += 16) await api.stageAtlasBlocks(prep.preparationId, contents.slice(index, index + 16), control);
  return prep;
}
async function publish(data: AtlasGenerationDocument<4> = base, root: AtlasStoredRoot | null = null) { return api.commitAtlasPreparation((await prepare(data, root)).preparationId, control); }
async function readAll(handle: AtlasReadHandle<4>) {
  const data: AtlasGenerationDocument<4> = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() }; let cursor: number | null = 0, count = 0;
  do {
    const page = await api.readAtlasBlockPage(handle, cursor, control);
    expect(page.encodedBytes).toBeLessThanOrEqual(ATLAS_STORAGE_PAGE_BYTES); expect(page.locks).toBeDefined(); expect(page.detailCoast).toBeDefined();
    const pageCount = page.blocks.length + page.locks!.length + page.detailCoast!.length; expect(pageCount).toBeGreaterThan(0); expect(pageCount).toBeLessThanOrEqual(16); count += pageCount;
    for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block);
    for (const lock of page.locks!) data.locks.set(lockKey(lock.bx, lock.by), lock);
    for (const tile of page.detailCoast!) data.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile);
    expect(page.nextCursor).toBe(count < handle.manifest.blockRefs.length + handle.manifest.constraints.lockRefs.length + handle.manifest.detailCoast.refs.length ? count : null);
    cursor = page.nextCursor;
  } while (cursor !== null);
  await verifyAtlasDocument(data, control); return data;
}
async function restored(source: 'current' | 'backup' = 'current') { const handle = await api.openAtlasDraft(base.manifest.draftId, { ...control, source }); if (!handle) throw new Error('missing synthetic draft'); return { handle, data: await readAll(handle) }; }
const bytesOf = (data: AtlasGenerationDocument<4>) => encodeAtlasManifest(data.manifest).length + [...data.blocks.values()].reduce((sum, block) => sum + encodeBlock(block).length, 0) + [...data.locks.values()].reduce((sum, lock) => sum + encodeAtlasCellLockBlock(lock).length, 0) + [...data.detailCoast.values()].reduce((sum, tile) => sum + encodeDetailCoastTile(tile).length, 0);

describe('v4 private fine-content ingestion and isolated atomic persistence', () => {
  it('does not create a missing database on reads and leaves v1/v2/v3 records byte-for-byte unchanged', async () => {
    expect(await api.openAtlasDraft(base.manifest.draftId, control)).toBeNull(); expect((await indexedDB.databases()).some(info => info.name === ATLAS_DETAIL_COAST_DB)).toBe(false);
    const options = { size: 128 as const, seed: 'legacy-detail-isolation', name: '旧领域保留', draftId: base.manifest.draftId };
    const legacy = [await createAtlasDraft(options, control), await createGenerationDraft(options, control, 2), await createGenerationDraft(options, control, 3)];
    for (const data of legacy) {
      const old = getAtlasStorage(data.manifest.version), prep = await old.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: null }, control), blocks = [...data.blocks.values()];
      for (let index = 0; index < blocks.length; index += 16) await old.stageAtlasBlocks(prep.preparationId, blocks.slice(index, index + 16), control);
      await old.commitAtlasPreparation(prep.preparationId, control); const handle = (await old.openAtlasDraft(data.manifest.draftId, control))!;
      expect((await old.readAtlasBlockPage(handle, 0, control)).detailCoast).toBeUndefined();
    }
    const names = [ATLAS_DRAFTS_DB, ATLAS_GENERATION_DB, ATLAS_SURFACE_DB], before = await Promise.all(names.map(name => snapshot(name)));
    const receipt = await publish(await withTiles()); expect(receipt.root.domain).toBe('atlas-draft-v4'); expect(api.database).toBe(ATLAS_DETAIL_COAST_DB);
    expect(await Promise.all(names.map(name => snapshot(name)))).toEqual(before); expect(() => getAtlasStorage(5 as 4)).toThrow('未知');
  });

  it('rejects missing referenced fine bytes, then restores exact arrays and accounts every real byte after staging them', async () => {
    const data = await withTiles(), prep = await prepare(data, null, false), before = await snapshot();
    await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('缺块'); expect(await snapshot()).toEqual(before); expect(await api.listAtlasDrafts()).toEqual([]);
    await api.stageAtlasBlocks(prep.preparationId, [...data.detailCoast.values()], control); const receipt = await api.commitAtlasPreparation(prep.preparationId, control), result = await restored();
    expect(result.data).toEqual(data); expect(result.handle.referencedBytes).toBe(bytesOf(data)); expect(receipt.pairReferencedBytes).toBe(bytesOf(data));
    const usage = await raw('meta', 'usage') as { bytes: number; blocks: number }; expect(usage.bytes).toBe(receipt.logicalBytes); expect(usage.blocks).toBe(data.blocks.size + data.detailCoast.size);
    const saved = await snapshot(), measured = saved.reduce((sum, store) => sum + store.keys.reduce<number>((subtotal, key, index) => subtotal + new TextEncoder().encode(String(key)).length + atlasStorageLogicalBytes(store.values[index]), 0), 0); expect(usage.bytes).toBe(measured);
  });

  it('pins caller fine arrays before the first await and returns detached arrays from both paging APIs', async () => {
    const data = await withTiles([samples(63, 63)]), tile = [...data.detailCoast.values()][0] as DetailCoastSampleTile, expected = encodeDetailCoastTile(tile), prep = await prepare(data, null, false);
    const staging = api.stageAtlasBlocks(prep.preparationId, [tile], control); tile.coverageQ.fill(-9); tile.elevationMeters.fill(-9); await staging; await api.commitAtlasPreparation(prep.preparationId, control);
    const result = await restored(); expect(encodeDetailCoastTile([...result.data.detailCoast.values()][0])).toEqual(expected);
    const session = (await api.openAtlasStorageSession(base.manifest.draftId, control))!, cursor = data.manifest.blockRefs.length;
    try { const first = (await session.readPage(cursor, control)).detailCoast![0] as DetailCoastSampleTile; first.coverageQ[0] = 0; first.elevationMeters[0] = 0; expect(encodeDetailCoastTile((await session.readPage(cursor, control)).detailCoast![0])).toEqual(expected); }
    finally { session.close(); }
    const page = await api.readAtlasBlockPage(result.handle, cursor, control), returned = page.detailCoast![0] as DetailCoastSampleTile; returned.coverageQ[0] = 0; returned.elevationMeters[0] = 0;
    expect(encodeDetailCoastTile((await api.readAtlasBlockPage(result.handle, cursor, control)).detailCoast![0])).toEqual(expected);
  });

  it('keeps deleted and changed immutable fine blobs for the backup and raw-exports both complete slots', async () => {
    const data = await withTiles(), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++;
    const changed = samples(20, 20, 23); next.detailCoast.set(detailCoastKey(20, 20), changed); next.detailCoast.delete(detailCoastKey(21, 20)); next.manifest.detailCoast.refs = [{ bx: 20, by: 20, hash: await hashDetailCoastTile(changed) }];
    const second = await publish(next, first.root), current = await restored(), backup = await restored('backup');
    expect(current.data).toEqual(next); expect(backup.data).toEqual(data); expect(backup.handle.readOnly).toBe(true); expect(second.pairReferencedBytes).toBe(bytesOf(next) + bytesOf(data));
    const exported = await api.exportAtlasRawBackup(data.manifest.draftId);
    for (const ref of [...data.manifest.detailCoast.refs, ...next.manifest.detailCoast.refs]) expect(exported.records.find(row => row.store === 'blocks' && row.key === ref.hash)?.value).toMatchObject({ kind: 'detail-coast', domain: 'atlas-draft-v4' });
  });

  it.each(['unreferenced', 'wrong-hash', 'duplicate', 'invalid-values'] as const)('rejects %s fine staging without persisting any bytes', async kind => {
    const data = await withTiles([samples(20, 20)]), prep = await prepare(data, null, false), tile = [...data.detailCoast.values()][0] as DetailCoastSampleTile, before = await snapshot();
    const input: DetailCoastTile[] = kind === 'unreferenced' ? [samples(19, 20)] : kind === 'wrong-hash' ? [samples(20, 20, 1)] : kind === 'duplicate' ? [tile, tile] : [{ ...tile, elevationMeters: new Int16Array(tile.elevationMeters.length).fill(-32768) }];
    await expect(api.stageAtlasBlocks(prep.preparationId, input, control)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });

  it.each([1, 2, 3] as const)('does not admit a fine attachment into format %i or create that database', async format => {
    await expect(getAtlasStorage(format).stageAtlasBlocks(`${base.manifest.draftId}:edit-${crypto.randomUUID()}`, [samples(0, 0)], control)).rejects.toThrow('旧格式'); expect((await indexedDB.databases()).length).toBe(0);
  });

  it.each(['codec', 'digest', 'owner'] as const)('protects %s-corrupted current fine data and exports its unchanged raw evidence', async kind => {
    const data = await withTiles([samples(20, 20)]), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++;
    const tile = samples(20, 20, 3); next.detailCoast.set(detailCoastKey(20, 20), tile); next.manifest.detailCoast.refs[0].hash = await hashDetailCoastTile(tile); await publish(next, first.root);
    const digest = next.manifest.detailCoast.refs[0].hash, row = await raw('blocks', digest) as BlobRecord;
    if (kind === 'codec') row.bytes[4] = 2; else if (kind === 'owner') row.bytes[6] = 19; else row.bytes[16] ^= 1;
    await put('blocks', digest, row); const before = await snapshot(); await expect(api.openAtlasDraft(base.manifest.draftId, control)).rejects.toThrow(); await expect(api.openAtlasStorageSession(base.manifest.draftId, control)).rejects.toThrow();
    if (kind === 'codec') await expect(api.openAtlasDraft(base.manifest.draftId, { ...control, source: 'backup' })).rejects.toThrow();
    expect(await snapshot()).toEqual(before); expect((await api.exportAtlasRawBackup(base.manifest.draftId)).records.find(item => item.key === digest)?.value).toEqual(row);
  });

  it('cancels bounded fine-content ingestion with progress while retaining every persisted store', async () => {
    const tiles = Array.from({ length: 18 }, (_, index) => samples(index, 20)), data = await withTiles(tiles); await publish(data); const before = await snapshot(), aborter = new AbortController(), progress: number[] = [];
    await expect(api.openAtlasStorageSession(base.manifest.draftId, { ...control, signal: aborter.signal, onProgress(value) { if (value.stage === '核验固定版本不可变块') { progress.push(value.completed); if (value.completed > data.blocks.size) aborter.abort(); } } })).rejects.toThrow();
    expect(progress).toContain(data.blocks.size + 16); expect(progress.every((value, index) => index === 0 || value - progress[index - 1] <= 16)).toBe(true); expect(await snapshot()).toEqual(before);
  });

  it('cancels a privately captured fine staging page before writes and counts its exact quota cost', async () => {
    // The north-west owner stores the additional world-boundary row/column:
    // 33 × 33 samples, each with two int16 fields, plus a 16-byte header.
    const data = await withTiles([samples(0, 0)]), prep = await prepare(data, null, false), tile = [...data.detailCoast.values()][0], before = await snapshot(), aborter = new AbortController();
    await expect(api.stageAtlasBlocks(prep.preparationId, [tile], { ...control, signal: aborter.signal, onProgress() { aborter.abort(); } })).rejects.toThrow(); expect(await snapshot()).toEqual(before);
    const usage = await raw('meta', 'usage') as { bytes: number }; usage.bytes = ATLAS_STORAGE_LIMIT - 1; await put('meta', 'usage', usage); const full = await snapshot();
    expect(encodeDetailCoastTile(tile).length).toBe(4372); await expect(api.stageAtlasBlocks(prep.preparationId, [tile], control)).rejects.toThrow('128 MiB'); expect(await snapshot()).toEqual(full);
  });

  it('rejects legacy local delta and stale full candidates without losing the accepted root', async () => {
    const data = await withTiles(), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++;
    const session = (await api.openAtlasStorageSession(base.manifest.draftId, control))!, before = await snapshot();
    try { await expect(session.commitLocal({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: next.manifest, expectedRoot: first.root, dirtyBlocks: [] }, control)).rejects.toBeInstanceOf(AtlasStorageFallbackError); expect(await snapshot()).toEqual(before); } finally { session.close(); }
    const a = await prepare(next, first.root), b = await prepare(next, first.root), accepted = await api.commitAtlasPreparation(a.preparationId, control), acceptedState = await snapshot();
    await expect(api.commitAtlasPreparation(b.preparationId, control)).rejects.toThrow('CAS'); expect(await snapshot()).toEqual(acceptedState); expect((await restored()).handle.root).toEqual(accepted.root);
  });

  it('independently enforces the actual fine coast lock at full publication', async () => {
    const data = await withTiles([samples(20, 20)]), lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 1, by: 1, flags: new Uint8Array(1024) };
    // At size 128 this coarse cell covers world [1280,1312]², crossing
    // actual fine nodes owned by coast:20:20. No coarse height is edited.
    lock.flags[8 * 32 + 8] = 1; data.locks.set(lockKey(1, 1), lock); data.manifest.constraints.lockRefs.push({ bx: 1, by: 1, hash: await hashAtlasCellLockBlock(lock) });
    const first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++;
    const tile = next.detailCoast.get(detailCoastKey(20, 20)) as DetailCoastSampleTile; tile.coverageQ[3 * 32 + 3] = -128; tile.elevationMeters[3 * 32 + 3] = -740; next.manifest.detailCoast.refs[0].hash = await hashDetailCoastTile(tile);
    const prep = await prepare(next, first.root), before = await snapshot(); await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow(); expect(await snapshot()).toEqual(before); expect((await restored()).data).toEqual(data);
  });

  it('does not turn a fine-layer change into a pure-lock transaction or replay', async () => {
    const data = await withTiles(), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++; next.detailCoast.clear(); next.manifest.detailCoast.refs = [];
    const prep = await prepare(next, first.root), before = await snapshot(); await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
    const accepted = await api.commitAtlasPreparation(prep.preparationId, control), after = await snapshot(); expect(accepted.committed).toBe(true); await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow(); expect(await snapshot()).toEqual(after);
  });

  it('rechecks the fine raw preimage under the final transaction even with an unchanged digest key', async () => {
    const data = await withTiles([samples(20, 20)]), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++; const prep = await prepare(next, first.root), digest = data.manifest.detailCoast.refs[0].hash, changed = await raw('blocks', digest) as BlobRecord; changed.bytes[16] ^= 1;
    const transaction = IDBDatabase.prototype.transaction; let tampered = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) { if (this.name === ATLAS_DETAIL_COAST_DB && mode === 'readwrite' && !tampered) { tampered = true; transaction.call(this, 'blocks', 'readwrite').objectStore('blocks').put(changed, digest); } return transaction.call(this, names, mode, options); });
    await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('原像已变化'); vi.restoreAllMocks(); expect(tampered).toBe(true); expect(await raw('roots', data.manifest.draftId)).toEqual(api.encodeAtlasRoot(first.root)); expect(await api.findAtlasReceipt(data.manifest.draftId, prep.commandId)).toBeNull();
  });

  it('rolls back root, receipt and quota on final-write failure and returns the real receipt after late cancellation', async () => {
    const data = await withTiles(), first = await publish(data), next = cloneAtlasDocument(data); next.manifest.revision++; next.detailCoast.delete(detailCoastKey(21, 20)); next.manifest.detailCoast.refs.pop(); const prep = await prepare(next, first.root), before = await snapshot(), original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key) { if (this.name === 'receipts') throw new DOMException('fine-final-write-fault', 'QuotaExceededError'); return original.call(this, value, key); });
    await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('fine-final-write-fault'); vi.restoreAllMocks(); expect(await snapshot()).toEqual(before);
    const aborter = new AbortController(), transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) { const tx = transaction.call(this, names, mode, options); if (this.name === ATLAS_DETAIL_COAST_DB && mode === 'readwrite') tx.addEventListener('complete', () => aborter.abort(), { once: true }); return tx; });
    const receipt = await api.commitAtlasPreparation(prep.preparationId, { ...control, signal: aborter.signal }); vi.restoreAllMocks(); expect(aborter.signal.aborted).toBe(true); expect(receipt.committed).toBe(true); expect((await restored()).data).toEqual(next); expect(await api.findAtlasReceipt(data.manifest.draftId, prep.commandId)).toMatchObject({ committed: true, replayed: true, rootDigest: receipt.rootDigest });
  });
});
