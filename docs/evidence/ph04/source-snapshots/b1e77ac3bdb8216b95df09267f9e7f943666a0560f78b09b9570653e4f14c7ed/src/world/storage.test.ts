import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDraft, cloneBlock, createAtlasDraft, encodeBlock, encodeManifest, hashBlock, type AtlasDraftData } from './model';
import { ATLAS_DRAFTS_DB, ATLAS_STORAGE_LIMIT, atlasStorageLogicalBytes, commitAtlasPreparation, encodeAtlasRoot, exportAtlasRawBackup, findAtlasReceipt, hashAtlasRoot, listAtlasDrafts, openAtlasDraft, prepareAtlasCommit, readAtlasBlockPage, stageAtlasBlocks, type AtlasPreparation, type AtlasStoredRoot } from './storage';

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
  const prep = await prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: id, manifest: data.manifest, expectedRoot: root });
  const blocks = [...data.blocks.values()];
  if (stageAll || root === null) for (let i = 0; i < blocks.length; i += 16) await stageAtlasBlocks(prep.preparationId, blocks.slice(i, i + 16));
  else await stageAtlasBlocks(prep.preparationId, [data.blocks.get('elevation:0:0')!]);
  return prep;
}
async function publish(data = base, root: AtlasStoredRoot | null = null) { const prep = await prepared(data, root); return commitAtlasPreparation(prep.preparationId); }
async function edit(data: AtlasDraftData, delta = 1) {
  const next = { manifest: structuredClone(data.manifest), blocks: new Map(data.blocks) }, block = cloneBlock(next.blocks.get('elevation:0:0')!);
  if (block.layer !== 'elevation') throw new Error('Synthetic layer missing'); block.values[0] += delta;
  next.blocks.set('elevation:0:0', block); next.manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash = await hashBlock(block); next.manifest.revision++; return next;
}
async function pair() { const first = await publish(), next = await edit(base), second = await publish(next, first.root); return { first, next, second }; }
async function restored(draftId: string, source: 'current' | 'backup' = 'current') {
  const handle = await openAtlasDraft(draftId, { source }); if (!handle) throw new Error('Synthetic draft absent');
  const blocks: AtlasDraftData['blocks'] = new Map(); let cursor: number | null = 0;
  do { const page = await readAtlasBlockPage(handle, cursor); expect(page.encodedBytes).toBeLessThanOrEqual(512 * 1024); for (const block of page.blocks) blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); cursor = page.nextCursor; } while (cursor !== null);
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
