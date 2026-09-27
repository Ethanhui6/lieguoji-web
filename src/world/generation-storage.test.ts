import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasDraft, getCellLayerSlot, getVertexSlot, hashBlock, type AtlasBlock, type BlockKey } from './model';
import { cloneAtlasDocument, createGenerationCopy, createGenerationDraft, encodeAtlasManifest, verifyAtlasDocument, type AtlasCellLockBlock, type AtlasGenerationDocument } from './atlas-format';
import { encodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { ATLAS_DRAFTS_DB, ATLAS_GENERATION_DB, ATLAS_STORAGE_LIMIT, atlasStorageLogicalBytes, getAtlasStorage, openAtlasDraft, type AtlasStoredRoot } from './storage';

const control = { yieldTask: async () => {} }, api = getAtlasStorage(2), stores = ['blocks', 'manifests', 'roots', 'preparations', 'receipts', 'meta'];
let base: AtlasGenerationDocument<2>;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'ph06-format-storage-synthetic', name: 'PH06纯合成锁与原子故障样本' }, control); }, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });
type BlobRecord = { format: string; version: number; domain: string; kind: string; digest: string; bytes: Uint8Array };
async function db(name = ATLAS_GENERATION_DB) { return new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function raw(store: string, key: string, name?: string): Promise<unknown> { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(store, 'readonly'), r = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function put(store: string, key: string, value: unknown) { const database = await db(); try { await new Promise<void>((resolve, reject) => { const tx = database.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function snapshot(name = ATLAS_GENERATION_DB) { const database = await db(name); try { return await new Promise((resolve, reject) => { const tx = database.transaction(stores, 'readonly'), rs = stores.map(name => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() })); tx.oncomplete = () => resolve(rs.map(r => ({ name: r.name, keys: r.keys.result, values: r.values.result }))); tx.onabort = () => reject(tx.error); }); } finally { database.close(); } }
async function locked() {
  const data = cloneAtlasDocument(base), lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 1, by: 0, flags: new Uint8Array(1024) };
  lock.flags[31 * 32] = 3; data.locks.set(lockKey(1, 0), lock); data.manifest.constraints.lockRefs.push({ bx: 1, by: 0, hash: await hashAtlasCellLockBlock(lock) }); return data;
}
async function prepare(data: AtlasGenerationDocument<2>, root: AtlasStoredRoot | null = null, includeLocks = true) {
  const prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, control);
  const contents: (AtlasBlock | AtlasCellLockBlock)[] = [...data.blocks.values(), ...(includeLocks ? data.locks.values() : [])];
  for (let i = 0; i < contents.length; i += 16) await api.stageAtlasBlocks(prep.preparationId, contents.slice(i, i + 16), control);
  return prep;
}
async function publish(data: AtlasGenerationDocument<2> = base, root: AtlasStoredRoot | null = null) { return api.commitAtlasPreparation((await prepare(data, root)).preparationId, control); }
async function restored(id: string, source: 'current' | 'backup' = 'current') {
  const handle = await api.openAtlasDraft(id, { ...control, source }); if (!handle) throw new Error('missing synthetic');
  const data: AtlasGenerationDocument<2> = { manifest: handle.manifest, blocks: new Map(), locks: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, control); expect(page.encodedBytes).toBeLessThanOrEqual(512 * 1024); expect(page.locks).toBeDefined(); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const lock of page.locks!) data.locks.set(lockKey(lock.bx, lock.by), lock); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, control); return { handle, data };
}
async function edit(data: AtlasGenerationDocument<2>, cell = 0) { const next = cloneAtlasDocument(data), selected = getCellLayerSlot(next, 'elevation', cell); selected.block.values[selected.slot]++; next.manifest.blockRefs.find(r => r.key === selected.key)!.hash = await hashBlock(selected.block); next.manifest.revision++; return next; }
const local = (data: AtlasGenerationDocument<2>, root: AtlasStoredRoot, keys: BlockKey[] = ['elevation:0:0']) => ({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root, dirtyBlocks: keys.map(key => data.blocks.get(key)!) });

describe('PH06 closed v2 storage, complete lock references and unchanged v1 database', () => {
  it('selects only the explicit known database, keeps v1 defaults and never migrates the same identity', async () => {
    const legacy = await createAtlasDraft({ size: 128, seed: 'legacy-kept', name: '保留旧档', draftId: base.manifest.draftId }, control), old = getAtlasStorage(1), first = await old.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: legacy.manifest, expectedRoot: null }, control), blocks = [...legacy.blocks.values()];
    for (let i = 0; i < blocks.length; i += 16) await old.stageAtlasBlocks(first.preparationId, blocks.slice(i, i + 16), control); await old.commitAtlasPreparation(first.preparationId, control);
    const before = await snapshot(ATLAS_DRAFTS_DB); expect(await api.openAtlasDraft(base.manifest.draftId, control)).toBeNull(); await publish();
    expect((await openAtlasDraft(base.manifest.draftId, control))!.manifest.version).toBe(1); expect((await api.openAtlasDraft(base.manifest.draftId, control))!.manifest.version).toBe(2); expect(await snapshot(ATLAS_DRAFTS_DB)).toEqual(before);
    expect((await old.readAtlasBlockPage((await old.openAtlasDraft(base.manifest.draftId, control))!, 0, control)).locks).toBeUndefined();
    expect(() => getAtlasStorage(5 as 2)).toThrow('未知'); await expect(api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: legacy.manifest as never, expectedRoot: null }, control)).rejects.toThrow('请求无效');
  });

  it('does not publish a missing referenced lock, then pages, accounts and raw-exports its exact bytes', async () => {
    const data = await locked(), prep = await prepare(data, null, false), before = await snapshot(); await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('缺块'); expect(await snapshot()).toEqual(before); expect(await api.listAtlasDrafts()).toEqual([]);
    const lock = [...data.locks.values()][0]; await api.stageAtlasBlocks(prep.preparationId, [lock], control); const receipt = await api.commitAtlasPreparation(prep.preparationId, control), result = await restored(data.manifest.draftId);
    expect(result.data).toEqual(data); expect(receipt.pairReferencedBytes).toBe(result.handle.referencedBytes); const exported = await api.exportAtlasRawBackup(data.manifest.draftId), row = exported.records.find(r => r.store === 'blocks' && r.key === data.manifest.constraints.lockRefs[0].hash)!;
    expect(row.value).toMatchObject({ kind: 'lock', domain: 'atlas-draft-v2', bytes: encodeAtlasCellLockBlock(lock) });
    expect(result.handle.referencedBytes).toBe(encodeAtlasManifest(data.manifest).length + [...data.blocks.values()].reduce((sum, b) => sum + (b.layer === 'geometry' ? 40 + b.vertexIds.byteLength + b.xyQ.byteLength : 28 + b.values.byteLength), 0) + 1040);
    const usage = await raw('meta', 'usage') as { bytes: number; blocks: number }; expect(usage.blocks).toBe(data.blocks.size + 1); expect(usage.bytes).toBe(receipt.logicalBytes);
  });

  it('copies an explicit v2 backup to a new identity with original bytes and independent root, preserving source current and backup', async () => {
    const data = await locked(), first = await publish(data), next = await edit(data), second = await publish(next, first.root), sourceBefore = await api.exportAtlasRawBackup(data.manifest.draftId), backup = await restored(data.manifest.draftId, 'backup');
    const copy = await createGenerationCopy(backup.data, { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: 2, sourceDraftId: data.manifest.draftId, sourceSlot: 'backup', sourceManifestDigest: backup.handle.manifestDigest, sourceManifestRevision: 0, observedRootDigest: second.rootDigest }, { draftId: `atlas-${crypto.randomUUID()}` }, control);
    const created = await publish(copy); expect(created.revision).toBe(0); expect(created.root.backupManifest).toBeNull(); expect((await restored(copy.manifest.draftId)).data).toEqual(copy); expect(await api.exportAtlasRawBackup(data.manifest.draftId)).toEqual(sourceBefore);
    expect(copy.manifest.origin?.sourceManifestRevision).toBe(0); expect(copy.manifest.origin?.observedRootDigest).toBe(second.rootDigest);
  });

  it.each(['lock-codec', 'constraint-version', 'recipe-fingerprint'] as const)('protects future %s in current even when the caller explicitly requests backup', async kind => {
    const data = await locked(), first = await publish(data), second = await publish(await edit(data), first.root);
    if (kind === 'lock-codec') { const digest = data.manifest.constraints.lockRefs[0].hash, row = await raw('blocks', digest) as BlobRecord; row.bytes[4] = 2; await put('blocks', digest, row); }
    else { const row = await raw('manifests', second.manifestDigest) as BlobRecord, manifest = JSON.parse(new TextDecoder().decode(row.bytes)); if (kind === 'constraint-version') manifest.constraints.version = 2; else { manifest.generation.lastApplied = { recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: 'f'.repeat(64) }, seed: 'future', parameters: { majorContinents: 1, landCoveragePermille: 400, coastWavelengthWorld: 512, reliefMeters: 200 } }, scope: { kind: 'world' }, baseManifestDigest: first.manifestDigest, baseRootDigest: first.rootDigest, baseRevision: 0, lockSetDigest: 'a'.repeat(64), appliedRevision: 1 }; } row.bytes = new TextEncoder().encode(JSON.stringify(manifest)); await put('manifests', second.manifestDigest, row); }
    const before = await snapshot(); await expect(api.openAtlasDraft(data.manifest.draftId, { ...control, source: 'backup' })).rejects.toThrow(); await expect(api.openAtlasStorageSession(data.manifest.draftId, control)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
    const exported = await api.exportAtlasRawBackup(data.manifest.draftId); expect(exported.records.some(r => r.key === data.manifest.constraints.lockRefs[0].hash)).toBe(true);
  });

  it('enforces exact elevation/coast locks in local and full commits including shared-vertex owners outside the locked block', async () => {
    const data = await locked(), first = await publish(data), session = (await api.openAtlasStorageSession(data.manifest.draftId, control))!, changed = await edit(data, 31 * 128 + 32), before = await snapshot();
    await expect(session.commitLocal(local(changed, first.root, ['elevation:1:0']), control)).rejects.toThrow('高程'); expect(await snapshot()).toEqual(before);
    const geometry = cloneAtlasDocument(data), vertex = getVertexSlot(geometry, 32 * 129 + 32); vertex.block.xyQ[vertex.slot * 2]++; geometry.manifest.revision++; geometry.manifest.blockRefs.find(r => r.key === vertex.key)!.hash = await hashBlock(vertex.block);
    await expect(session.commitLocal(local(geometry, first.root, [vertex.key]), control)).rejects.toThrow('共享顶点'); expect(await snapshot()).toEqual(before); session.close();
    const prep = await prepare(changed, first.root), staged = await snapshot(); await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('高程'); expect(await snapshot()).toEqual(staged); expect((await api.openAtlasDraft(data.manifest.draftId, control))!.root).toEqual(first.root);
  });

  it('ordinary edits preserve generation/locks metadata and lock bytes, then restore both current and backup', async () => {
    const data = await locked(), first = await publish(data), session = (await api.openAtlasStorageSession(data.manifest.draftId, control))!, next = await edit(data);
    const poisoned = cloneAtlasDocument(next); poisoned.manifest.constraints.lockRefs = []; const before = await snapshot(); await expect(session.commitLocal(local(poisoned, first.root), control)).rejects.toThrow('锁'); expect(await snapshot()).toEqual(before);
    const receipt = await session.commitLocal(local(next, first.root), control); const page = await session.readPage(64, control); expect(page.blocks).toEqual([]); expect(page.locks).toEqual([...data.locks.values()]); session.close();
    expect((await restored(data.manifest.draftId)).data).toEqual(next); expect((await restored(data.manifest.draftId, 'backup')).data).toEqual(data); expect(receipt.pairReferencedBytes).toBe((await api.openAtlasDraft(data.manifest.draftId, control))!.pairReferencedBytes);
  });

  it('rechecks lock raw bytes under final CAS even when their digest key is unchanged', async () => {
    const data = await locked(), first = await publish(data), next = await edit(data), prep = await prepare(next, first.root), digest = data.manifest.constraints.lockRefs[0].hash, old = await raw('blocks', digest) as BlobRecord, changed = structuredClone(old); changed.bytes[16 + 31 * 32] = 1;
    const transaction = IDBDatabase.prototype.transaction; let tampered = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) { if (this.name === ATLAS_GENERATION_DB && mode === 'readwrite' && !tampered) { tampered = true; transaction.call(this, 'blocks', 'readwrite').objectStore('blocks').put(changed, digest); } return transaction.call(this, names, mode, options); });
    await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('原像已变化'); vi.restoreAllMocks(); expect(tampered).toBe(true); expect(await raw('roots', data.manifest.draftId)).toEqual(api.encodeAtlasRoot(first.root)); expect(await api.findAtlasReceipt(data.manifest.draftId, prep.commandId)).toBeNull();
  });

  it('rolls back root, receipt and quota atomically on real final-write fault, while a late cancel returns the real receipt', async () => {
    const first = await publish(), next = await edit(base), prep = await prepare(next, first.root), before = await snapshot(), original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key) { if (this.name === 'receipts') throw new DOMException('quota synthetic', 'QuotaExceededError'); return original.call(this, value, key); });
    await expect(api.commitAtlasPreparation(prep.preparationId, control)).rejects.toThrow('quota synthetic'); vi.restoreAllMocks(); expect(await snapshot()).toEqual(before);
    const aborter = new AbortController(), transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) { const tx = transaction.call(this, names, mode, options); if (mode === 'readwrite') tx.addEventListener('complete', () => aborter.abort(), { once: true }); return tx; });
    const receipt = await api.commitAtlasPreparation(prep.preparationId, { ...control, signal: aborter.signal }); vi.restoreAllMocks(); expect(receipt.committed).toBe(true); expect(aborter.signal.aborted).toBe(true); expect(await api.findAtlasReceipt(base.manifest.draftId, prep.commandId)).toMatchObject({ committed: true, replayed: true, rootDigest: receipt.rootDigest });
  });

  it('counts staged lock bytes within quota and rejects pre-commit cancellation with unchanged persisted root', async () => {
    const data = await locked(), prep = await prepare(data, null, false), usage = await raw('meta', 'usage') as {bytes:number}, lock = [...data.locks.values()][0]; usage.bytes = ATLAS_STORAGE_LIMIT - 1; await put('meta', 'usage', usage); const before = await snapshot();
    expect(atlasStorageLogicalBytes({ kind: 'lock', bytes: encodeAtlasCellLockBlock(lock) })).toBeGreaterThan(1040); await expect(api.stageAtlasBlocks(prep.preparationId, [lock], control)).rejects.toThrow('128 MiB'); expect(await snapshot()).toEqual(before);
    const aborter = new AbortController(); aborter.abort(); await expect(api.commitAtlasPreparation(prep.preparationId, { ...control, signal: aborter.signal })).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });

  it('rejects a stale second session and does not rewrite a future IDB schema', async () => {
    const first = await publish(), a = (await api.openAtlasStorageSession(base.manifest.draftId, control))!, b = (await api.openAtlasStorageSession(base.manifest.draftId, control))!, next = await edit(base), result = await a.commitLocal(local(next, first.root), control);
    await expect(b.commitLocal(local(next, first.root), control)).rejects.toThrow('CAS'); a.close(); b.close();
    expect((await api.openAtlasDraft(base.manifest.draftId, control))!.root.rootDigest).toBe(result.rootDigest);
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(ATLAS_GENERATION_DB, 2); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); upgraded.close();
    await expect(api.openAtlasDraft(base.manifest.draftId, control)).rejects.toThrow('未知版本'); expect((await api.exportAtlasRawBackup(base.manifest.draftId)).databaseVersion).toBe(2);
  });
});
