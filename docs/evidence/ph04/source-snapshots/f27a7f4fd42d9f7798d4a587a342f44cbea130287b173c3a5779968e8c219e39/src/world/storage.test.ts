import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDraft, cloneBlock, createAtlasDraft, encodeBlock, encodeManifest, hashBlock, type AtlasDraftData } from './model';
import * as model from './model';
import * as topology from './topology';
import { ATLAS_DRAFTS_DB, ATLAS_STORAGE_LIMIT, AtlasStorageCommittedError, AtlasStorageFallbackError, AtlasStorageSession, atlasStorageLogicalBytes, commitAtlasPreparation, encodeAtlasRoot, exportAtlasRawBackup, findAtlasReceipt, hashAtlasRoot, listAtlasDrafts, openAtlasDraft, openAtlasStorageSession, prepareAtlasCommit, readAtlasBlockPage, stageAtlasBlocks, type AtlasPreparation, type AtlasStoredRoot } from './storage';

let base: AtlasDraftData;
const control = { yieldTask: async () => {} };
beforeAll(async () => { base = await createAtlasDraft({ size: 128, seed: 'ph04-storage-synthetic', name: '纯合成存储草稿' }, control); });
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });
const commandId = () => `edit-${crypto.randomUUID()}`;
const stores = ['blocks', 'manifests', 'roots', 'preparations', 'receipts', 'meta'];
type BlobValue = { format: string; version: number; domain: string; kind: string; digest: string; bytes: Uint8Array };
async function database(version?: number) {
  return new Promise<IDBDatabase>((resolve, reject) => { const request = version === undefined ? indexedDB.open(ATLAS_DRAFTS_DB) : indexedDB.open(ATLAS_DRAFTS_DB, version); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function raw(store: string, key: string): Promise<unknown> {
  const db = await database(); try { return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
async function putRaw(store: string, key: string, value: unknown) {
  const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
async function removeRaw(store: string, key: string) {
  const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
async function entireDatabase() {
  const db = await database(); try {
    return await new Promise<Record<string, { key: IDBValidKey; value: unknown }[]>>((resolve, reject) => {
      const tx = db.transaction(stores, 'readonly'), requests = stores.map(name => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() }));
      tx.oncomplete = () => resolve(Object.fromEntries(requests.map(({ name, keys, values }) => [name, keys.result.map((key, i) => ({ key, value: values.result[i] }))]))); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function prepared(data: AtlasDraftData, root: AtlasStoredRoot | null, stageAll = false, id = commandId()) {
  const prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: id, manifest: data.manifest, expectedRoot: root }, control);
  const blocks = [...data.blocks.values()];
  if (stageAll || root === null) for (let i = 0; i < blocks.length; i += 16) await stageAtlasBlocks(prep.preparationId, blocks.slice(i, i + 16), control);
  else await stageAtlasBlocks(prep.preparationId, [data.blocks.get('elevation:0:0')!], control);
  return prep;
}
async function publish(data = base, root: AtlasStoredRoot | null = null) { const prep = await prepared(data, root); return commitAtlasPreparation(prep.preparationId, control); }
async function edit(data: AtlasDraftData, delta = 1) {
  const next = { manifest: structuredClone(data.manifest), blocks: new Map(data.blocks) }, block = cloneBlock(next.blocks.get('elevation:0:0')!);
  if (block.layer !== 'elevation') throw new Error('Synthetic layer missing'); block.values[0] += delta;
  next.blocks.set('elevation:0:0', block); next.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash = await hashBlock(block); next.manifest.revision++; return next;
}
async function pair() { const first = await publish(), next = await edit(base), second = await publish(next, first.root); return { first, next, second }; }
async function restored(draftId: string, source: 'current' | 'backup' = 'current') {
  const handle = await openAtlasDraft(draftId, { ...control, source }); if (!handle) throw new Error('Synthetic draft absent');
  const blocks: AtlasDraftData['blocks'] = new Map(); let cursor: number | null = 0;
  do { const page = await readAtlasBlockPage(handle, cursor, control); expect(page.encodedBytes).toBeLessThanOrEqual(512 * 1024); for (const block of page.blocks) blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); cursor = page.nextCursor; } while (cursor !== null);
  return { handle, data: { manifest: handle.manifest, blocks } };
}

describe('PH04 independent immutable-block/root-CAS storage', () => {
  it('absent reads do not create a database, and invalid IDs never access storage', async () => {
    const open = vi.spyOn(indexedDB, 'open'), enumerate = vi.spyOn(indexedDB, 'databases');
    expect(await listAtlasDrafts()).toEqual([]); expect(await openAtlasDraft(base.manifest.draftId)).toBeNull();
    expect(await findAtlasReceipt(base.manifest.draftId, commandId())).toBeNull();
    for (const id of ['', '../player-save', 'atlas-not-a-uuid']) await expect(openAtlasDraft(id)).rejects.toThrow('标识');
    expect(enumerate).not.toHaveBeenCalled(); expect(open.mock.calls.every(([name]) => name === ATLAS_DRAFTS_DB)).toBe(true);
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('prepare/stage stay invisible; first commit restores exact typed data with revision zero', async () => {
    const prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: base.manifest, expectedRoot: null });
    expect(await listAtlasDrafts()).toEqual([]); expect(await openAtlasDraft(base.manifest.draftId)).toBeNull();
    const blocks = [...base.blocks.values()]; await stageAtlasBlocks(prep.preparationId, blocks.slice(0, 16));
    const stagedBefore = await entireDatabase(); await stageAtlasBlocks(prep.preparationId, blocks.slice(0, 8)); expect(await entireDatabase()).toEqual(stagedBefore);
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('缺块'); expect(await listAtlasDrafts()).toEqual([]);
    for (let i = 16; i < blocks.length; i += 16) await stageAtlasBlocks(prep.preparationId, blocks.slice(i, i + 16));
    const receipt = await commitAtlasPreparation(prep.preparationId), loaded = await restored(base.manifest.draftId);
    expect(receipt).toMatchObject({ revision: 0, committed: true, replayed: false, baseRoot: null }); expect(loaded.data).toEqual(base);
    expect(loaded.handle).toMatchObject({ readOnly: false, source: 'current', root: receipt.root }); expect(await hashAtlasRoot(receipt.root)).toBe(receipt.rootDigest);
    expect(await listAtlasDrafts()).toEqual([{ draftId: base.manifest.draftId, name: base.manifest.name, revision: 0, size: 128, rootDigest: receipt.rootDigest, currentManifest: receipt.manifestDigest, backupAvailable: false }]);
    const geometry = loaded.data.blocks.get('geometry:0:0')!; expect(geometry.layer).toBe('geometry'); if (geometry.layer === 'geometry') { expect(geometry.xyQ).toBeInstanceOf(Int32Array); expect(geometry.vertexIds).toBeInstanceOf(Uint32Array); }
  });

  it('rotation and explicit backup stay independent; fixed paged handles never follow a new current', async () => {
    const first = await publish(), fixed = await openAtlasDraft(base.manifest.draftId), next = await edit(base), second = await publish(next, first.root);
    expect((await restored(base.manifest.draftId)).data).toEqual(next);
    const backup = await restored(base.manifest.draftId, 'backup'); expect(backup.data).toEqual(base); expect(backup.handle.readOnly).toBe(true);
    const oldPage = await readAtlasBlockPage(fixed!, 16), oldElevation = oldPage.blocks[0]; expect(oldElevation.layer).toBe('elevation'); if (oldElevation.layer === 'elevation') expect(oldElevation.values[0]).toBe(-100);
    const alteredHandle = structuredClone(fixed!); alteredHandle.root.lastCommitId = commandId();
    await expect(readAtlasBlockPage(alteredHandle)).rejects.toThrow('整条根摘要');
    const before = await exportAtlasRawBackup(base.manifest.draftId), fork = cloneAtlasDraft(backup.data); fork.manifest.draftId = `atlas-${crypto.randomUUID()}`; fork.manifest.revision = 0;
    await publish(fork); expect(await exportAtlasRawBackup(base.manifest.draftId)).toEqual(before);
    expect(second.root.backupManifest).toBe(first.manifestDigest); expect((await listAtlasDrafts()).length).toBe(2);
  });

  it('counts unique content, manifests, preparations, roots, receipts and usage metadata exactly', async () => {
    const { second } = await pair(), all = await entireDatabase();
    const calculated = Object.values(all).flat().reduce((sum, entry) => sum + new TextEncoder().encode(String(entry.key)).length + atlasStorageLogicalBytes(entry.value), 0);
    const usage = all.meta[0].value as { bytes: number; blocks: number; manifests: number; preparations: number; roots: number; receipts: number };
    expect(usage.bytes).toBe(calculated); expect(second.logicalBytes).toBe(calculated);
    expect(usage).toMatchObject({ blocks: base.blocks.size + 1, manifests: 2, preparations: 2, roots: 1, receipts: 2 });
    expect(second.pairReferencedBytes).toBeGreaterThan(calculated / 2);
    const before = await entireDatabase(), p = all.preparations[0].value as AtlasPreparation;
    await expect(stageAtlasBlocks(p.preparationId, [...base.blocks.values()].slice(0, 8))).rejects.toThrow('CAS'); expect(await entireDatabase()).toEqual(before);
  });

  it('clones inputs before awaits and independently recomputes block/manifest hashes', async () => {
    const data = cloneAtlasDraft(base), expected = structuredClone(data.manifest), pending = prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: data.manifest, expectedRoot: null });
    data.manifest.name = 'caller changed while hashing'; const prep = await pending;
    const manifestRaw = await raw('manifests', prep.manifestDigest) as BlobValue; expect(manifestRaw.bytes).toEqual(encodeManifest(expected));
    const bad = cloneBlock(base.blocks.get('elevation:0:0')!); if (bad.layer === 'elevation') bad.values[0]++;
    const before = await entireDatabase(); await expect(stageAtlasBlocks(prep.preparationId, [bad])).rejects.toThrow('重新计算'); expect(await entireDatabase()).toEqual(before);
    const block = cloneBlock(base.blocks.get('elevation:0:0')!), expectedBlock = encodeBlock(block), staging = stageAtlasBlocks(prep.preparationId, [block]); if (block.layer === 'elevation') block.values[0]++;
    await staging; expect((await raw('blocks', base.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash) as BlobValue).bytes).toEqual(expectedBlock);
  });

  it('published immutable blocks never overwrite different bytes under an existing digest', async () => {
    const prep = await prepared(base, null), digest = base.manifest.blockRefs[0].hash, record = await raw('blocks', digest) as BlobValue;
    record.bytes[record.bytes.length - 1] ^= 1; await putRaw('blocks', digest, record); const before = await entireDatabase();
    await expect(stageAtlasBlocks(prep.preparationId, [base.blocks.get(base.manifest.blockRefs[0].key)!])).rejects.toThrow('禁止覆盖');
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('摘要'); expect(await entireDatabase()).toEqual(before);
  });

  it.each(['throw', 'abort'] as const)('a block %s abort rolls back the complete page and capacity but leaves no loadable root', async failure => {
    const prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: base.manifest, expectedRoot: null }), before = await entireDatabase(), original = IDBObjectStore.prototype.put; let writes = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'blocks' && ++writes === 3) { if (failure === 'throw') throw new DOMException('synthetic block quota', 'QuotaExceededError'); const request = original.call(this, value, key); this.transaction.abort(); return request; }
      return original.call(this, value, key);
    });
    await expect(stageAtlasBlocks(prep.preparationId, [...base.blocks.values()].slice(0, 8))).rejects.toThrow(); spy.mockRestore();
    expect(await entireDatabase()).toEqual(before); expect(await listAtlasDrafts()).toEqual([]);
  });

  it.each(['throw', 'abort'] as const)('a final transaction %s preserves exact root, backup, receipt and quota bytes', async failure => {
    const { next, second } = await pair(), candidate = await edit(next), prep = await prepared(candidate, second.root), before = await entireDatabase(), original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'receipts') { if (failure === 'throw') throw new DOMException('synthetic final quota', 'QuotaExceededError'); const request = original.call(this, value, key); this.transaction.abort(); return request; }
      return original.call(this, value, key);
    });
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow(); spy.mockRestore(); expect(await entireDatabase()).toEqual(before);
  });

  it('logical capacity rejection includes staging and retained preparations, without garbage collection', async () => {
    const prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: base.manifest, expectedRoot: null });
    const usage = await raw('meta', 'usage') as Record<string, unknown>; usage.bytes = ATLAS_STORAGE_LIMIT; await putRaw('meta', 'usage', usage); const before = await entireDatabase();
    await expect(stageAtlasBlocks(prep.preparationId, [base.blocks.get('geometry:0:0')!])).rejects.toThrow('128 MiB'); expect(await entireDatabase()).toEqual(before);
  });

  it('same expected whole root has exactly one concurrent winner and preserves losing staged content', async () => {
    const first = await publish(), a = await edit(base, 1), b = await edit(base, 2), prepA = await prepared(a, first.root), prepB = await prepared(b, first.root);
    const results = await Promise.allSettled([commitAtlasPreparation(prepA.preparationId), commitAtlasPreparation(prepB.preparationId)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const current = await openAtlasDraft(base.manifest.draftId); expect(current!.root.revision).toBe(1); expect(current!.root.backupManifest).toBe(first.manifestDigest);
    expect(await raw('preparations', prepA.preparationId)).toBeDefined(); expect(await raw('preparations', prepB.preparationId)).toBeDefined();
  });

  it('final CAS catches metadata changes after async verification even when revision and manifests match', async () => {
    const first = await publish(), prep = await prepared(await edit(base), first.root), changed = { ...first.root, lastCommitId: commandId() }; changed.rootDigest = await hashAtlasRoot(changed);
    const original = IDBDatabase.prototype.transaction; let inserted = false;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (!inserted && this.name === ATLAS_DRAFTS_DB && mode === 'readwrite') { inserted = true; const race = original.call(this, 'roots', 'readwrite'); race.objectStore('roots').put(encodeAtlasRoot(changed), base.manifest.draftId); }
      return original.call(this, names, mode, options);
    });
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('CAS'); spy.mockRestore(); expect(inserted).toBe(true); expect(await raw('roots', base.manifest.draftId)).toEqual(encodeAtlasRoot(changed)); expect(await findAtlasReceipt(base.manifest.draftId, prep.commandId)).toBeNull();
  });

  it('final transaction catches missing content or future metadata introduced after verification', async () => {
    const first = await publish(), prep = await prepared(await edit(base), first.root), digest = base.manifest.blockRefs[0].hash, value = await raw('blocks', digest) as BlobValue; value.domain = 'future-domain';
    const original = IDBDatabase.prototype.transaction; let inserted = false;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (!inserted && mode === 'readwrite') { inserted = true; const race = original.call(this, 'blocks', 'readwrite'); race.objectStore('blocks').put(value, digest); }
      return original.call(this, names, mode, options);
    });
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('原像'); spy.mockRestore(); expect(await raw('roots', base.manifest.draftId)).toEqual(encodeAtlasRoot(first.root));
  });

  it.each(['root', 'backup-codec'] as const)('stage stops all writes if %s becomes future after preparation', async kind => {
    const { next, second } = await pair(), candidate = await edit(next), prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: candidate.manifest, expectedRoot: second.root });
    if (kind === 'root') await putRaw('roots', second.draftId, new TextEncoder().encode(JSON.stringify({ ...second.root, version: 99 })));
    else { const digest = base.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash, value = await raw('blocks', digest) as BlobValue; value.bytes[4] = 99; await putRaw('blocks', digest, value); }
    const before = await entireDatabase(); await expect(stageAtlasBlocks(prep.preparationId, [candidate.blocks.get('elevation:0:0')!])).rejects.toThrow('不兼容'); expect(await entireDatabase()).toEqual(before);
  });

  it('receipt replay after a later commit returns the historical result without rotating current or backup', async () => {
    const first = await publish(), second = await publish(await edit(base), first.root), before = await entireDatabase();
    const replay = await commitAtlasPreparation(`${first.draftId}:${first.commandId}`); expect(replay).toMatchObject({ root: first.root, replayed: true, committed: true });
    expect(await findAtlasReceipt(first.draftId, first.commandId)).toEqual(replay); expect(await entireDatabase()).toEqual(before); expect((await openAtlasDraft(first.draftId))!.root).toEqual(second.root);
    await expect(prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: first.commandId, manifest: base.manifest, expectedRoot: null })).rejects.toThrow('不同候选'); expect(await entireDatabase()).toEqual(before);
  });

  it('a structurally valid corrupted receipt arriving during final CAS never reports committed success', async () => {
    const first = await publish(), prep = await prepared(await edit(base), first.root);
    const damagedRoot: AtlasStoredRoot = { ...first.root, revision: 1, currentManifest: prep.manifestDigest, backupManifest: first.manifestDigest, lastCommitId: prep.commandId, rootDigest: '0'.repeat(64) };
    const damaged = { format: 'lieguoji-atlas-receipt', version: 1, domain: 'atlas-draft-v1', draftId: prep.draftId, commandId: prep.commandId, candidateId: prep.candidateId, requestDigest: prep.requestDigest, revision: 1, rootDigest: damagedRoot.rootDigest, manifestDigest: prep.manifestDigest, root: damagedRoot, baseRoot: first.root, committed: true, replayed: false, logicalBytes: 1000, pairReferencedBytes: 1000 };
    const original = IDBDatabase.prototype.transaction; let inserted = false;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (!inserted && mode === 'readwrite') { inserted = true; const race = original.call(this, 'receipts', 'readwrite'); race.objectStore('receipts').put(damaged, prep.preparationId); }
      return original.call(this, names, mode, options);
    });
    await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('整条根摘要'); spy.mockRestore(); expect(inserted).toBe(true);
    expect(await raw('roots', first.draftId)).toEqual(encodeAtlasRoot(first.root)); await expect(findAtlasReceipt(first.draftId, prep.commandId)).rejects.toThrow('整条根摘要');
  });

  it('pre-cancellation and cancellation during final readwrite both leave original source bytes intact', async () => {
    const first = await publish(), prep = await prepared(await edit(base), first.root), before = await entireDatabase();
    const early = new AbortController(); early.abort(); const open = vi.spyOn(indexedDB, 'open'); await expect(commitAtlasPreparation(prep.preparationId, { signal: early.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(open).not.toHaveBeenCalled(); open.mockRestore();
    const controller = new AbortController(), original = IDBObjectStore.prototype.get;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      const request = original.call(this, key); if (this.transaction.mode === 'readwrite') queueMicrotask(() => controller.abort()); return request;
    });
    await expect(commitAtlasPreparation(prep.preparationId, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); spy.mockRestore(); expect(await entireDatabase()).toEqual(before);
  });

  it('cancellation after actual transaction completion reports the durable committed receipt', async () => {
    const first = await publish(), prep = await prepared(await edit(base), first.root), controller = new AbortController(), original = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      const tx = original.call(this, names, mode, options); if (mode === 'readwrite') tx.addEventListener('complete', () => controller.abort(), { once: true }); return tx;
    });
    const receipt = await commitAtlasPreparation(prep.preparationId, { signal: controller.signal }); spy.mockRestore(); expect(controller.signal.aborted).toBe(true); expect(receipt).toMatchObject({ committed: true, revision: 1 }); expect(await raw('roots', receipt.draftId)).toEqual(encodeAtlasRoot(receipt.root));
  });

  it.each(['backup-manifest', 'backup-domain', 'current-codec', 'root-version'] as const)('future %s locks writing and cannot be bypassed via explicit backup', async kind => {
    const { second } = await pair();
    if (kind === 'root-version') { const value = { ...second.root, version: 99 }; await putRaw('roots', second.draftId, new TextEncoder().encode(JSON.stringify(value))); }
    else if (kind === 'backup-manifest') { const value = await raw('manifests', second.root.backupManifest!) as BlobValue, parsed = JSON.parse(new TextDecoder().decode(value.bytes)); parsed.version = 99; value.bytes = new TextEncoder().encode(JSON.stringify(parsed)); await putRaw('manifests', second.root.backupManifest!, value); }
    else { const digest = kind === 'backup-domain' ? base.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash : base.manifest.blockRefs[0].hash, value = await raw('blocks', digest) as BlobValue; if (kind === 'backup-domain') value.domain = 'unknown-domain'; else value.bytes[4] = 99; await putRaw('blocks', digest, value); }
    const before = await entireDatabase(), rawBackup = await exportAtlasRawBackup(second.draftId); expect(rawBackup.records.length).toBeGreaterThan(0);
    await expect(openAtlasDraft(second.draftId)).rejects.toThrow(); await expect(openAtlasDraft(second.draftId, { source: 'backup' })).rejects.toThrow();
    await expect(prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: (await edit((await edit(base)))).manifest, expectedRoot: second.root })).rejects.toThrow(); expect(await entireDatabase()).toEqual(before);
  });

  it('known damaged current content allows only explicit backup recovery, then independent fork preserves raw source', async () => {
    const { next, second } = await pair(), changed = next.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash, record = await raw('blocks', changed) as BlobValue;
    record.bytes[record.bytes.length - 1] ^= 1; await putRaw('blocks', changed, record); const before = await exportAtlasRawBackup(second.draftId);
    await expect(openAtlasDraft(second.draftId)).rejects.toThrow('摘要'); const backup = await restored(second.draftId, 'backup'); expect(backup.handle.readOnly).toBe(true); expect(backup.data).toEqual(base);
    await expect(prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: (await edit(next)).manifest, expectedRoot: second.root })).rejects.toThrow('摘要');
    const fork = cloneAtlasDraft(backup.data); fork.manifest.draftId = `atlas-${crypto.randomUUID()}`; fork.manifest.revision = 0; await publish(fork); expect(await exportAtlasRawBackup(second.draftId)).toEqual(before);
    await removeRaw('blocks', changed); const missingBefore = await exportAtlasRawBackup(second.draftId), recoveredMissing = await restored(second.draftId, 'backup');
    expect(recoveredMissing.handle.pairReferencedBytes).toBeNull(); expect(recoveredMissing.data).toEqual(base); expect(await exportAtlasRawBackup(second.draftId)).toEqual(missingBefore);
  });

  it('future database version remains untouched and exact-target raw backup still works', async () => {
    const receipt = await publish(), before = await exportAtlasRawBackup(receipt.draftId), db = await database(2); db.close();
    await expect(openAtlasDraft(receipt.draftId)).rejects.toThrow('无法打开'); await expect(listAtlasDrafts()).rejects.toThrow('无法打开');
    expect(await exportAtlasRawBackup(receipt.draftId)).toEqual({ ...before, databaseVersion: 2 }); const check = await database(); expect(check.version).toBe(2); check.close();
  });

  it('missing staged blocks reject publication without replacing an established root', async () => {
    const first = await publish(), next = await edit(base), prep = await prepared(next, first.root), digest = next.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash; await removeRaw('blocks', digest);
    const before = await entireDatabase(); await expect(commitAtlasPreparation(prep.preparationId)).rejects.toThrow('缺块'); expect(await entireDatabase()).toEqual(before);
  });
});

function localRequest(data: AtlasDraftData, root: AtlasStoredRoot, dirtyKeys = ['elevation:0:0'] as const) {
  return { candidateId: crypto.randomUUID(), commandId: commandId(), manifest: data.manifest, expectedRoot: root, dirtyBlocks: dirtyKeys.map(key => data.blocks.get(key)!) };
}

describe('PH04 privately verified incremental storage capability', () => {
  it('cannot mint a capability from external data and returns only independent handle/page/receipt copies', async () => {
    expect(() => Reflect.construct(AtlasStorageSession, [Symbol('forged'), {}, {}, []])).toThrow('外部缓存');
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, handle = session.handle, page = await session.readPage(0, control);
    handle.root.lastCommitId = commandId(); handle.manifest.name = 'mutated caller copy';
    const geometry = page.blocks[0]; if (geometry.layer === 'geometry') geometry.xyQ.fill(0);
    expect(session.handle.manifest.name).toBe(base.manifest.name); expect(session.handle.root).toEqual(first.root);
    const next = await edit(base), receipt = await session.commitLocal(localRequest(next, first.root), control), expectedRoot = structuredClone(receipt.root);
    receipt.root.lastCommitId = commandId(); receipt.baseRoot!.rootDigest = 'f'.repeat(64);
    expect(session.handle.root).toEqual(expectedRoot); expect((await session.readPage(0, control)).blocks).toEqual([...base.blocks.values()].slice(0, 16));
    expect((await restored(first.draftId)).data).toEqual(next); session.close(); expect(session.valid).toBe(false);
  });

  it('two bounded edits and an undo use one write transaction each with no whole-world revalidation or old-block SHA', async () => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, full = vi.spyOn(model, 'validateAtlasDraftAsync'), digest = vi.spyOn(crypto.subtle, 'digest'), transactions = vi.spyOn(IDBDatabase.prototype, 'transaction');
    let data = base;
    for (const delta of [1, 1, -1]) {
      const next = await edit(data, delta), beforeDigest = digest.mock.calls.length, beforeTx = transactions.mock.calls.length;
      const receipt = await session.commitLocal(localRequest(next, session.handle.root), control);
      expect(receipt.replayed).toBe(false); expect(digest.mock.calls.length - beforeDigest).toBeLessThanOrEqual(9);
      expect(transactions.mock.calls.slice(beforeTx).filter(([, mode]) => mode === 'readwrite')).toHaveLength(1);
      const oldGeometry = encodeBlock(base.blocks.get('geometry:0:0')!);
      expect(digest.mock.calls.slice(beforeDigest).some(([, bytes]) => { const view = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes); return view.length === oldGeometry.length && view.every((v, i) => v === oldGeometry[i]); })).toBe(false);
      data = next;
    }
    expect(full).not.toHaveBeenCalled(); full.mockRestore(); digest.mockRestore(); transactions.mockRestore();
    expect((await restored(first.draftId)).data).toEqual(data); session.close();
  });

  it('locally verifies shared geometry, elevation and independent memberships and preserves the prior source as backup', async () => {
    const initial = cloneAtlasDraft(base); initial.manifest.catalogs.simRegions = [{ id: 7, name: '合成模拟区' }]; initial.manifest.catalogs.administration = [{ id: 4, name: '合成行政叶', kind: 'leaf', parentId: null }];
    const first = await publish(initial), session = (await openAtlasStorageSession(first.draftId, control))!, next = cloneAtlasDraft(initial); next.manifest.revision++;
    const keys = ['geometry:0:0', 'elevation:0:0', 'sim-membership:0:0', 'admin-membership:0:0'] as const;
    for (const key of keys) {
      const block = next.blocks.get(key)!;
      if (block.layer === 'geometry') { const slot = block.vertexIds.indexOf(32 * 129 + 32); block.xyQ[slot * 2] += 256; }
      else block.values[0] = block.layer === 'elevation' ? 500 : block.layer === 'sim-membership' ? 7 : 4;
      next.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(block);
    }
    const localGeometry = vi.spyOn(topology, 'validateLocalGeometry');
    const receipt = await session.commitLocal({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: next.manifest, expectedRoot: first.root, dirtyBlocks: keys.map(key => next.blocks.get(key)!) }, control);
    expect(localGeometry).toHaveBeenCalledTimes(1); expect(localGeometry.mock.calls[0][1]).toEqual([32 * 129 + 32]);
    for (const key of ['geometry:0:0', 'geometry:1:0', 'geometry:0:1', 'geometry:1:1'] as const) expect(localGeometry.mock.calls[0][0].blocks.has(key)).toBe(true);
    localGeometry.mockRestore();
    expect(receipt.root.backupManifest).toBe(first.manifestDigest); expect((await restored(first.draftId)).data).toEqual(next); expect((await restored(first.draftId, 'backup')).data).toEqual(initial);
    const all = await entireDatabase(), calculated = Object.values(all).flat().reduce((sum, entry) => sum + new TextEncoder().encode(String(entry.key)).length + atlasStorageLogicalBytes(entry.value), 0); expect(receipt.logicalBytes).toBe(calculated); session.close();
  });

  it('rejects untrusted candidate membership, omitted changed blocks and changed catalogs without modifying storage', async () => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, before = await entireDatabase();
    const candidate = cloneAtlasDraft(base); candidate.manifest.revision++; const membership = candidate.blocks.get('admin-membership:0:0')!; if (membership.layer !== 'geometry') membership.values[0] = 99; candidate.manifest.blockRefs.find(ref => ref.key === 'admin-membership:0:0')!.hash = await hashBlock(membership);
    await expect(session.commitLocal({ candidateId: crypto.randomUUID(), commandId: commandId(), manifest: candidate.manifest, expectedRoot: first.root, dirtyBlocks: [membership] }, control)).rejects.toThrow('不存在');
    const valid = await edit(base); await expect(session.commitLocal({ ...localRequest(valid, first.root), dirtyBlocks: [] }, control)).rejects.toThrow('缺少');
    valid.manifest.catalogs.simRegions.push({ id: 0, name: 'changed catalogs' }); await expect(session.commitLocal(localRequest(valid, first.root), control)).rejects.toBeInstanceOf(AtlasStorageFallbackError);
    expect(await entireDatabase()).toEqual(before); expect(session.valid).toBe(true); session.close();
  });

  it.each(['same-hash-bytes', 'future-backup-domain', 'whole-root', 'missing-block'] as const)('detects externally altered %s without relying on a metadata epoch', async fault => {
    const { next, second } = await pair(), session = (await openAtlasStorageSession(second.draftId, control))!, candidate = await edit(next);
    if (fault === 'whole-root') { const changed = { ...second.root, lastCommitId: commandId() }; changed.rootDigest = await hashAtlasRoot(changed); await putRaw('roots', changed.draftId, encodeAtlasRoot(changed)); }
    else {
      const digest = fault === 'future-backup-domain' ? base.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash : base.manifest.blockRefs[0].hash;
      if (fault === 'missing-block') await removeRaw('blocks', digest);
      else { const value = await raw('blocks', digest) as BlobValue; if (fault === 'same-hash-bytes') value.bytes[value.bytes.length - 1] ^= 1; else value.domain = 'future-domain'; await putRaw('blocks', digest, value); }
    }
    const before = await entireDatabase(); await expect(session.commitLocal(localRequest(candidate, second.root), control)).rejects.toThrow('原像');
    expect(session.valid).toBe(false); expect(await entireDatabase()).toEqual(before);
  });

  it('two private sessions still have exactly one CAS winner and the losing source remains unpublished', async () => {
    const first = await publish(), a = (await openAtlasStorageSession(first.draftId, control))!, b = (await openAtlasStorageSession(first.draftId, control))!, nextA = await edit(base, 1), nextB = await edit(base, 2);
    const results = await Promise.allSettled([a.commitLocal(localRequest(nextA, first.root), control), b.commitLocal(localRequest(nextB, first.root), control)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1); expect([a.valid, b.valid].filter(Boolean)).toHaveLength(1);
    const root = (await openAtlasDraft(first.draftId))!.root; expect(root.revision).toBe(1); expect(root.backupManifest).toBe(first.manifestDigest); a.close(); b.close();
  });

  it('the final local transaction catches raw changes injected after hashing and invalidates its capability', async () => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, candidate = await edit(base), digest = base.manifest.blockRefs[0].hash, value = await raw('blocks', digest) as BlobValue; value.bytes[value.bytes.length - 1] ^= 1;
    const original = IDBDatabase.prototype.transaction; let inserted = false;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (!inserted && mode === 'readwrite') { inserted = true; const race = original.call(this, 'blocks', 'readwrite'); race.objectStore('blocks').put(value, digest); }
      return original.call(this, names, mode, options);
    });
    await expect(session.commitLocal(localRequest(candidate, first.root), control)).rejects.toThrow('原像'); spy.mockRestore();
    expect(inserted).toBe(true); expect(session.valid).toBe(false); expect(await raw('roots', first.draftId)).toEqual(encodeAtlasRoot(first.root));
  });

  it.each(['quota', 'cancel'] as const)('local %s failure retains private head and exact durable data for a safe retry', async fault => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, request = localRequest(await edit(base), first.root), before = await entireDatabase(), controller = new AbortController(), original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'roots') { if (fault === 'quota') throw new DOMException('local synthetic quota', 'QuotaExceededError'); controller.abort(); }
      return original.call(this, value, key);
    });
    await expect(session.commitLocal(request, { ...control, signal: controller.signal })).rejects.toThrow(); spy.mockRestore(); expect(session.valid).toBe(true); expect(session.handle.root).toEqual(first.root); expect(await entireDatabase()).toEqual(before);
    expect((await session.commitLocal(request, control)).committed).toBe(true); session.close();
  });

  it('late cancellation returns committed and a lost-reply retry returns the old receipt without rotating the new head', async () => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, request = localRequest(await edit(base), first.root), controller = new AbortController(), original = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) { const tx = original.call(this, names, mode, options); if (mode === 'readwrite') tx.addEventListener('complete', () => controller.abort(), { once: true }); return tx; });
    const receipt = await session.commitLocal(request, { ...control, signal: controller.signal }); spy.mockRestore(); expect(controller.signal.aborted).toBe(true); expect(receipt.committed).toBe(true); expect(session.handle.root).toEqual(receipt.root);
    const before = await entireDatabase(), replay = await session.commitLocal(request, control); expect(replay).toMatchObject({ replayed: true, root: receipt.root }); expect(await entireDatabase()).toEqual(before); expect(session.valid).toBe(false);
  });

  it('a failure after real oncomplete is marked committed, closes the capability and preserves the recoverable receipt', async () => {
    const first = await publish(), session = (await openAtlasStorageSession(first.draftId, control))!, request = localRequest(await edit(base), first.root), original = IDBDatabase.prototype.transaction;
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      const tx = original.call(this, names, mode, options); if (mode === 'readwrite') tx.addEventListener('complete', () => digest.mockRejectedValueOnce(new Error('synthetic post-completion verification failure')), { once: true }); return tx;
    });
    const failure = await session.commitLocal(request, control).catch(error => error); spy.mockRestore(); digest.mockRestore();
    expect(failure).toBeInstanceOf(AtlasStorageCommittedError); expect(failure.committed).toBe(true); expect(session.valid).toBe(false);
    expect(await raw('roots', first.draftId)).toEqual(encodeAtlasRoot(failure.receipt.root)); const recovered = await findAtlasReceipt(first.draftId, request.commandId); expect(recovered!.root).toEqual(failure.receipt.root); expect(recovered!.revision).toBe(1);
  });
});
