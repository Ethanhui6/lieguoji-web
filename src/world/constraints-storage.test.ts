import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasDraft, getCellLayerSlot, hashBlock, type AtlasBlock } from './model';
import { cloneAtlasDocument, createGenerationDraft, verifyAtlasDocument, type AtlasCellLockBlock, type AtlasGenerationDocument } from './atlas-format';
import { assertAtlasConstraintsOnly, hashAtlasCellLockBlock, hashAtlasLockSet, lockKey } from './generation-locks';
import { COAST_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { ATLAS_GENERATION_DB, ATLAS_STORAGE_LIMIT, getAtlasStorage, type AtlasStoredRoot } from './storage';

const control = { yieldTask: async () => {} }, api = getAtlasStorage(2), stores = ['blocks', 'manifests', 'roots', 'preparations', 'receipts', 'meta'];
let base: AtlasGenerationDocument<2>;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'ph06-constraints-atomic-synthetic', name: '纯合成锁事务测试' }, control); });
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });
async function database() { return new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(ATLAS_GENERATION_DB); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function raw(store: string, key: string): Promise<unknown> { const db = await database(); try { return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'), r = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
async function put(store: string, key: string, value: unknown) { const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
async function snapshot() { const db = await database(); try { return await new Promise((resolve, reject) => { const tx = db.transaction(stores, 'readonly'), rows = stores.map(name => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() })); tx.oncomplete = () => resolve(rows.map(row => ({ name: row.name, keys: row.keys.result, values: row.values.result }))); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
async function prepare(data: AtlasGenerationDocument<2>, root: AtlasStoredRoot | null, extra: AtlasBlock[] = []) {
  const prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, control);
  // Reuse the existing immutable geography already in the same database. Only
  // new lock/explicit changed-block bytes need staging for a pure-lock change.
  const contents = [...(root ? extra : data.blocks.values()), ...data.locks.values()];
  for (let i = 0; i < contents.length; i += 16) await api.stageAtlasBlocks(prep.preparationId, contents.slice(i, i + 16), control);
  return prep;
}
async function publish(data = base, root: AtlasStoredRoot | null = null, extra: AtlasBlock[] = []) { return api.commitAtlasPreparation((await prepare(data, root, extra)).preparationId, control); }
async function flags(data: AtlasGenerationDocument<2>, flag: number) {
  const next = cloneAtlasDocument(data); next.manifest.revision++;
  const block: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 1, by: 0, flags: new Uint8Array(1024) }; block.flags[31 * 32] = flag;
  next.locks.clear(); next.manifest.constraints.lockRefs = [];
  if (flag) { next.locks.set(lockKey(1, 0), block); next.manifest.constraints.lockRefs.push({ bx: 1, by: 0, hash: await hashAtlasCellLockBlock(block) }); }
  return next;
}
async function restored(source: 'current' | 'backup' = 'current') {
  const handle = await api.openAtlasDraft(base.manifest.draftId, { ...control, source }); if (!handle) throw new Error('missing synthetic fixture');
  const data: AtlasGenerationDocument<2> = { manifest: handle.manifest, blocks: new Map(), locks: new Map() }; let cursor: number | null = 0;
  do { const page = await api.readAtlasBlockPage(handle, cursor, control); for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block); for (const lock of page.locks ?? []) data.locks.set(lockKey(lock.bx, lock.by), lock); cursor = page.nextCursor; } while (cursor !== null);
  await verifyAtlasDocument(data, control); return { handle, data };
}
async function historicalGeneration(data: AtlasGenerationDocument<2>, root: AtlasStoredRoot) {
  const next = cloneAtlasDocument(data); next.manifest.revision++;
  next.manifest.generation.lastApplied = { recipe: { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'coast-smoothing', version: 1, fingerprint: COAST_GENERATOR_FINGERPRINT }, parameters: { strengthPermille: 500, iterations: 2 } }, scope: { kind: 'world' }, baseManifestDigest: root.currentManifest, baseRootDigest: root.rootDigest, baseRevision: data.manifest.revision, lockSetDigest: await hashAtlasLockSet(data.manifest.constraints, data.manifest.spec), appliedRevision: next.manifest.revision };
  return next;
}

describe('PH06 explicit pure-constraints atomic persistence', () => {
  it('sets, completely removes and restores locks, preserves historical provenance, and reloads both exact slots', async () => {
    const created = await publish(), generated = await historicalGeneration(base, created.root), generationReceipt = await publish(generated, created.root);
    const locked = await flags(generated, 3), p = await prepare(locked, generationReceipt.root), first = await api.commitAtlasConstraintsPreparation(p.preparationId, control);
    expect((await restored()).data).toEqual(locked); expect((await restored('backup')).data).toEqual(generated);
    const unlocked = await flags(locked, 0), second = await api.commitAtlasConstraintsPreparation((await prepare(unlocked, first.root)).preparationId, control);
    expect((await restored()).data).toEqual(unlocked); expect((await restored('backup')).data).toEqual(locked);
    const again = await flags(unlocked, 3), third = await api.commitAtlasConstraintsPreparation((await prepare(again, second.root)).preparationId, control);
    const loaded = await restored(); expect(loaded.data).toEqual(again); expect((await restored('backup')).data).toEqual(unlocked);
    expect(loaded.data.manifest.generation).toEqual(generated.manifest.generation); expect(loaded.data.blocks).toEqual(base.blocks);
    expect(third.root.backupManifest).toBe(second.manifestDigest); expect(loaded.handle.pairReferencedBytes).toBe(third.pairReferencedBytes);
    expect(await hashAtlasLockSet(again.manifest.constraints, again.manifest.spec)).not.toBe(again.manifest.generation.lastApplied!.lockSetDigest);
  }, 30000); // Full multi-revision/slot integration, not a frame-time budget.

  it('keeps ordinary commits strict, permits initial locks through ordinary creation, and limits the dedicated entry to existing v2 roots', async () => {
    const initial = await flags(base, 3); initial.manifest.revision = 0;
    const p = await prepare(initial, null), staged = await snapshot(); await expect(api.commitAtlasConstraintsPreparation(p.preparationId, control)).rejects.toThrow('已有生成版本主档'); expect(await snapshot()).toEqual(staged);
    const created = await api.commitAtlasPreparation(p.preparationId, control), unlocked = await flags(initial, 0), next = await prepare(unlocked, created.root), before = await snapshot();
    await expect(api.commitAtlasPreparation(next.preparationId, control)).rejects.toThrow('锁集合'); expect(await snapshot()).toEqual(before);
    await expect(api.commitAtlasConstraintsPreparation(p.preparationId, control)).rejects.toThrow('已有生成版本主档'); expect(await snapshot()).toEqual(before);
    const old = getAtlasStorage(1), legacy = await createAtlasDraft({ size: 128, seed: 'v1-remains-separate', name: '旧格式纯合成' }, control);
    const v1 = await old.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: legacy.manifest, expectedRoot: null }, control), blocks = [...legacy.blocks.values()];
    for (let i = 0; i < blocks.length; i += 16) await old.stageAtlasBlocks(v1.preparationId, blocks.slice(i, i + 16), control);
    const receipt = await old.commitAtlasPreparation(v1.preparationId, control), open = vi.spyOn(indexedDB, 'open');
    await expect(old.commitAtlasConstraintsPreparation(v1.preparationId, control)).rejects.toThrow('生成版本'); expect(open).not.toHaveBeenCalled(); open.mockRestore();
    expect((await old.openAtlasDraft(legacy.manifest.draftId, control))!.root).toEqual(receipt.root); expect(await snapshot()).toEqual(before);
  }, 30000); // Real old/new IDB copies and complete snapshots on shared CI CPUs.

  it.each(['name', 'seed', 'catalogs', 'origin', 'generation'] as const)('rejects a lock update mixed with %s and keeps exact staged database bytes', async field => {
    const first = await publish(), mixed = await flags(base, 3);
    if (field === 'name') mixed.manifest.name += ' changed';
    else if (field === 'seed') mixed.manifest.seed += ' changed';
    else if (field === 'catalogs') mixed.manifest.catalogs.simRegions = [{ id: 7, name: 'unrelated region' }];
    else if (field === 'origin') mixed.manifest.origin = { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: 2, sourceDraftId: base.manifest.draftId, sourceSlot: 'current', sourceManifestDigest: first.manifestDigest, sourceManifestRevision: 0, observedRootDigest: first.rootDigest };
    else mixed.manifest.generation = (await historicalGeneration(base, first.root)).manifest.generation;
    const prep = await prepare(mixed, first.root), before = await snapshot();
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow('纯锁事务不能改变'); expect(await snapshot()).toEqual(before);
    expect((await api.openAtlasDraft(base.manifest.draftId, control))!.root).toEqual(first.root);
  });

  it('rejects actual geography changes even under unchanged references, changed hashes, or an already committed ordinary receipt', async () => {
    const first = await publish(), forged = await flags(base, 3), cell = getCellLayerSlot(forged, 'elevation', 0); cell.block.values[cell.slot] = 100;
    expect(() => assertAtlasConstraintsOnly(base, forged)).toThrow('实际地理值');
    forged.manifest.blockRefs.find(ref => ref.key === cell.key)!.hash = await hashBlock(cell.block);
    const prep = await prepare(forged, first.root, [cell.block]), before = await snapshot(); await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow('地理引用'); expect(await snapshot()).toEqual(before);
    const ordinary = cloneAtlasDocument(base), edit = getCellLayerSlot(ordinary, 'elevation', 0); edit.block.values[edit.slot] = 100; ordinary.manifest.revision++;
    ordinary.manifest.blockRefs.find(ref => ref.key === edit.key)!.hash = await hashBlock(edit.block);
    const standard = await prepare(ordinary, first.root, [edit.block]); await api.commitAtlasPreparation(standard.preparationId, control); const committed = await snapshot();
    await expect(api.commitAtlasConstraintsPreparation(standard.preparationId, control)).rejects.toThrow('地理引用'); expect(await snapshot()).toEqual(committed);
  });

  it('replays the same command receipt after later changes without rotating roots or rewriting capacity', async () => {
    const first = await publish(), locked = await flags(base, 3), prep = await prepare(locked, first.root), receipt = await api.commitAtlasConstraintsPreparation(prep.preparationId, control);
    const unlocked = await flags(locked, 0), latest = await api.commitAtlasConstraintsPreparation((await prepare(unlocked, receipt.root)).preparationId, control), before = await snapshot();
    expect(await api.commitAtlasConstraintsPreparation(prep.preparationId, control)).toEqual({ ...receipt, replayed: true }); expect(await snapshot()).toEqual(before);
    expect((await api.openAtlasDraft(base.manifest.draftId, control))!.root).toEqual(latest.root);
    await expect(api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: prep.commandId, manifest: locked.manifest, expectedRoot: first.root }, control)).rejects.toThrow('不同候选'); expect(await snapshot()).toEqual(before);
  });

  it('rejects a genuinely stale competing lock candidate and preserves the winning full root', async () => {
    const first = await publish(), a = await flags(base, 1), b = await flags(base, 2), pa = await prepare(a, first.root), pb = await prepare(b, first.root);
    const winner = await api.commitAtlasConstraintsPreparation(pa.preparationId, control), before = await snapshot();
    await expect(api.commitAtlasConstraintsPreparation(pb.preparationId, control)).rejects.toThrow('CAS'); expect(await snapshot()).toEqual(before);
    expect((await restored()).data).toEqual(a); expect((await api.openAtlasDraft(base.manifest.draftId, control))!.root).toEqual(winner.root);
  });

  it('rechecks original root bytes in the final IDB CAS after asynchronous verification', async () => {
    const first = await publish(), prep = await prepare(await flags(base, 3), first.root), changed = { ...first.root, lastCommitId: `edit-${crypto.randomUUID()}` }; changed.rootDigest = await api.hashAtlasRoot(changed);
    const transaction = IDBDatabase.prototype.transaction; let inserted = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) {
      if (!inserted && this.name === ATLAS_GENERATION_DB && mode === 'readwrite') { inserted = true; transaction.call(this, 'roots', 'readwrite').objectStore('roots').put(api.encodeAtlasRoot(changed), base.manifest.draftId); }
      return transaction.call(this, names, mode, options);
    });
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow('CAS'); vi.restoreAllMocks(); expect(inserted).toBe(true);
    expect(await raw('roots', base.manifest.draftId)).toEqual(api.encodeAtlasRoot(changed)); expect(await api.findAtlasReceipt(base.manifest.draftId, prep.commandId)).toBeNull();
  });

  it('cancels during real content validation and during the final readwrite transaction without publishing', async () => {
    const first = await publish(), prep = await prepare(await flags(base, 3), first.root), before = await snapshot(), reading = new AbortController(); let progressed = false;
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, { ...control, signal: reading.signal, onProgress: value => { if (value.stage === '核验固定版本不可变块' && value.completed > 0) { progressed = true; reading.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progressed).toBe(true); expect(await snapshot()).toEqual(before);
    const controller = new AbortController(), get = IDBObjectStore.prototype.get; let finalRead = false;
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) { const r = get.call(this, key); if (this.transaction.mode === 'readwrite') { finalRead = true; queueMicrotask(() => controller.abort()); } return r; });
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, { ...control, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); vi.restoreAllMocks(); expect(finalRead).toBe(true); expect(await snapshot()).toEqual(before);
  });

  it.each(['throw', 'abort'] as const)('rolls back every root, backup, receipt and quota byte on actual final IDB %s', async failure => {
    const first = await publish(), prep = await prepare(await flags(base, 3), first.root), before = await snapshot(), putOriginal = IDBObjectStore.prototype.put; let injected = false;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key) {
      if (this.name === 'receipts') { injected = true; if (failure === 'throw') throw new DOMException('synthetic constraints quota', 'QuotaExceededError'); const request = putOriginal.call(this, value, key); this.transaction.abort(); return request; }
      return putOriginal.call(this, value, key);
    });
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow(); vi.restoreAllMocks(); expect(injected).toBe(true); expect(await snapshot()).toEqual(before);
    expect((await api.commitAtlasConstraintsPreparation(prep.preparationId, control)).revision).toBe(1);
  });

  it('preserves the existing quota limit and returns a durable receipt for cancellation after IDB completion', async () => {
    const first = await publish(), prep = await prepare(await flags(base, 3), first.root), usage = await raw('meta', 'usage') as { bytes: number }, originalUsage = structuredClone(usage); usage.bytes = ATLAS_STORAGE_LIMIT; await put('meta', 'usage', usage); const before = await snapshot();
    await expect(api.commitAtlasConstraintsPreparation(prep.preparationId, control)).rejects.toThrow('128 MiB'); expect(await snapshot()).toEqual(before); await put('meta', 'usage', originalUsage);
    const aborter = new AbortController(), transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, names, mode, options) { const tx = transaction.call(this, names, mode, options); if (mode === 'readwrite') tx.addEventListener('complete', () => aborter.abort(), { once: true }); return tx; });
    const receipt = await api.commitAtlasConstraintsPreparation(prep.preparationId, { ...control, signal: aborter.signal }); vi.restoreAllMocks(); expect(aborter.signal.aborted).toBe(true); expect(receipt.committed).toBe(true);
    expect(await api.findAtlasReceipt(base.manifest.draftId, prep.commandId)).toEqual({ ...receipt, replayed: true }); expect((await restored()).data.locks.size).toBe(1);
  });
});
