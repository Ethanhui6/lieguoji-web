import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitFmsEdit, FmsEditHistory, prepareFmsLockEdit, type FmsDocument } from './model';
import { coastFixture } from '../../tests/helpers/fms-coast-metrics';
import { prepareFmsCoastPreview, refineFmsCoast } from './coast-refinement';
import { prepareFmsCoastSmoothPreview, smoothFmsCoast } from './coast-smoothing';
import { FMS_DATABASE_NAME, FmsPersistenceError, loadFmsDocument, saveFmsDocument } from './persistence';

function document(revision = 0, height = 0): FmsDocument {
  return {
    format: 'lieguoji-fms-world', version: 1,
    worldId: '5be0d480-99cb-4b0b-ad43-ec74d08c7f42', revision, width: 100, height: 100,
    points: [[0, 0], [100, 0], [0, 100]], triangles: new Uint32Array([0, 1, 2]),
    neighbors: [[1, 2], [0, 2], [0, 1]], elevations: new Int32Array([height, 0, 0]),
  };
}

async function database(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FMS_DATABASE_NAME, version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('saves')) request.result.createObjectStore('saves');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function slots(): Promise<{ current: unknown; backup: unknown; revision: unknown }> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readonly'), store = tx.objectStore('saves');
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      tx.oncomplete = () => resolve({ current: current.result, backup: backup.result, revision: revision.result });
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function replace(key: string, value: unknown, remove = false): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite'), store = tx.objectStore('saves');
      if (remove) store.delete(key); else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

type RawEnvelope = Record<string, unknown> & { document: FmsDocument; checksum: string; storedRevision: number; storedAt: string };
const rawEnvelope = (value: unknown) => structuredClone(value) as RawEnvelope;
const withLocks = (doc: FmsDocument) => commitFmsEdit(doc, prepareFmsLockEdit(doc, [{ x: 1, y: 1, radius: 1 }], true));
async function protectionBackup(): Promise<unknown> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction('saves', 'readonly').objectStore('saves').get('beforeProtection'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}

describe('protected document v2 opt-in and old-client isolation', () => {
  it('saves a smoothed mesh, restores exact positions and protection, and persists undo/redo without changing the v1 archive',async()=>{
    const source=coastFixture('asymmetric'),first=await saveFmsDocument(source,null),history=new FmsEditHistory(source);
    history.commit(prepareFmsLockEdit(source,[{x:100,y:90,radius:12}],true));
    const beforeSmooth=structuredClone(history.document),options={maxOffset:4};
    const result=smoothFmsCoast(history.document,options);expect(result.moves.length).toBeGreaterThan(0);
    const smoothed=structuredClone(history.replaceDocument(prepareFmsCoastSmoothPreview(history.document,result,options),history.document.revision));
    const saved=await saveFmsDocument(history.document,first.storedRevision),restored=await loadFmsDocument();
    expect(restored!.document).toEqual(smoothed);
    const undo=history.undo();expect(undo.points).toEqual(beforeSmooth.points);const undoSaved=await saveFmsDocument(undo,saved.storedRevision);
    expect((await loadFmsDocument())!.document.points).toEqual(beforeSmooth.points);
    const redo=history.redo();expect(redo.points).toEqual(smoothed.points);await saveFmsDocument(redo,undoSaved.storedRevision);
    expect((await loadFmsDocument())!.document).toEqual(redo);
    const db=await database();const archive=await new Promise<{document:FmsDocument}>(resolve=>{const tx=db.transaction('saves','readonly'),request=tx.objectStore('saves').get('beforeProtection');tx.oncomplete=()=>resolve(request.result);});db.close();
    expect(archive.document).toEqual(source);
  });
  it('saves and restores refined geometry on DB1, then preserves that v1 mesh through two protected DB2 saves and undo', async()=>{
    const original=coastFixture('neck'),options={seed:1337,maxOffset:4},candidate=prepareFmsCoastPreview(original,refineFmsCoast(original,options),options);
    await saveFmsDocument(candidate,null);expect((await loadFmsDocument())!.document).toEqual(candidate);const v1=(await slots()).current;
    const history=new FmsEditHistory(original);history.replaceDocument(candidate,0);
    history.commit(prepareFmsLockEdit(history.document,[{x:100,y:100,radius:20}],true));await saveFmsDocument(history.document,1);
    history.undo();history.undo();expect(history.document.version).toBe(2);expect(history.document.points).toEqual(original.points);
    await saveFmsDocument(history.document,2);expect(await protectionBackup()).toEqual(v1);expect((await loadFmsDocument())!.document).toEqual(history.document);
    history.redo();history.redo();await saveFmsDocument(history.document,3);expect((await loadFmsDocument())!.document).toEqual(history.document);expect(await protectionBackup()).toEqual(v1);
  });
  it('keeps ordinary v1 reads/saves on DB1, then atomically stores v2 locks with a durable v1 checkpoint', async () => {
    const original = document(1, 45); await saveFmsDocument(original, null);
    const old = (await slots()).current; const oldDb = await database(); expect(oldDb.version).toBe(1); oldDb.close();
    expect((await loadFmsDocument())!.document.version).toBe(1);
    const locked = withLocks(original); await saveFmsDocument(locked, 1);
    const db = await database(); expect(db.version).toBe(2); db.close();
    expect((await loadFmsDocument())!.document).toEqual(locked);
    expect(rawEnvelope((await slots()).current).version).toBe(2);
    expect((await slots()).backup).toEqual(old); expect(await protectionBackup()).toEqual(old);
    const later = { ...locked, revision: locked.revision + 1, terrainLocks: locked.terrainLocks!.slice() }; later.terrainLocks[0] = 0;
    await saveFmsDocument(later, 2);
    expect(await protectionBackup()).toEqual(old); // The rolling backup may change, this checkpoint must not.
    later.terrainLocks.fill(0); expect((await loadFmsDocument())!.document.terrainLocks!.some(Boolean)).toBe(true);
  });
  it.each(['deleted', 'versionless', 'locks-tampered'] as const)('DB2 rejects old open(name,1) even when current is %s; new recovery declares missing locks', async fault => {
    const original = document(1, 45); await saveFmsDocument(original, null); await saveFmsDocument(withLocks(original), 1);
    if (fault === 'deleted') await replace('current', undefined, true);
    else if (fault === 'versionless') await replace('current', { broken: true });
    else { const raw = rawEnvelope((await slots()).current); raw.document.terrainLocks![0] = 0; await replace('current', raw); }
    await expect(database(1)).rejects.toMatchObject({ name: 'VersionError' });
    const recovered = await loadFmsDocument();
    expect(recovered).toMatchObject({ recovery: 'backup', requiresProtectionUpgrade: true, document: { version: 1 } });
    const before = await slots();
    await expect(saveFmsDocument({ ...original, revision: 10 }, 2)).rejects.toMatchObject({ code: 'future' });
    expect(await slots()).toEqual(before);
    await saveFmsDocument(withLocks(recovered!.document), 2);
    expect((await loadFmsDocument())!.document.version).toBe(2);
  });
  it('protects lock bytes with checksum and recovers the prior v2 mask instead of trusting altered locks', async () => {
    const locked = withLocks(document(1, 45)); await saveFmsDocument(locked, null);
    await saveFmsDocument({ ...locked, revision: 3 }, 1);
    const raw = rawEnvelope((await slots()).current); raw.document.terrainLocks!.fill(0); await replace('current', raw);
    const recovered = await loadFmsDocument(); expect(recovered!.recovery).toBe('backup'); expect(recovered!.document.terrainLocks).toEqual(locked.terrainLocks);
    expect(recovered!.requiresProtectionUpgrade).toBeUndefined();
  });
  it.each([
    { fault: 'damaged', archived: false }, { fault: 'missing', archived: false },
    { fault: 'damaged', archived: true }, { fault: 'missing', archived: true },
  ] as const)('preserves chosen v1 backup through two v2 saves: current=$fault, existing archive=$archived', async ({ fault, archived }) => {
    await saveFmsDocument(document(1, 45), null); const earlier = (await slots()).current;
    await saveFmsDocument(document(2, 60), 1); await saveFmsDocument(document(3, 70), 2);
    const original = (await slots()).backup, expectedArchive = archived ? earlier : original;
    if (archived) await replace('beforeProtection', earlier);
    if (fault === 'missing') await replace('current', undefined, true);
    else { const broken = rawEnvelope((await slots()).current); broken.document.elevations[0] = 99; await replace('current', broken); }
    const db1 = await database(1); expect(db1.version).toBe(1); db1.close();
    const recovered = await loadFmsDocument();
    expect(recovered).toMatchObject({ recovery: 'backup', storedRevision: 3, sourceStoredRevision: 2, document: { version: 1, revision: 2 } });
    const locked = withLocks(recovered!.document); await saveFmsDocument(locked, recovered!.storedRevision);
    const db2 = await database(); expect(db2.version).toBe(2); db2.close();
    expect(await protectionBackup()).toEqual(expectedArchive);
    expect((await slots()).backup).toEqual(original);
    const firstProtected = (await slots()).current;
    await saveFmsDocument({ ...locked, revision: locked.revision + 1 }, 4);
    const afterSecond = await slots();
    expect(afterSecond.backup).toEqual(firstProtected);
    expect(rawEnvelope(afterSecond.backup).version).toBe(2);
    expect(afterSecond.revision).toBe(5);
    expect(await protectionBackup()).toEqual(expectedArchive);
    await expect(database(1)).rejects.toMatchObject({ name: 'VersionError' });
  });
  it('rolls back both DB schema upgrade and slots if first protected save aborts', async () => {
    const original = document(1, 45); await saveFmsDocument(original, null); const before = await slots();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.mode === 'versionchange' && key === 'revision') { this.transaction.abort(); throw new Error('injected protected upgrade write failure'); }
      return put.call(this, value, key);
    });
    await expect(saveFmsDocument(withLocks(original), 1)).rejects.toMatchObject({ code: 'unavailable' }); vi.restoreAllMocks();
    const db = await database(1); expect(db.version).toBe(1); db.close();
    expect(await slots()).toEqual(before); expect(await protectionBackup()).toBeUndefined();
  });
  it('does not upgrade or write later after a blocked request already reported failure', async () => {
    const original = document(1, 45); await saveFmsDocument(original, null); const before = await slots();
    const blocker = await database(1); blocker.onversionchange = () => {};
    await expect(saveFmsDocument(withLocks(original), 1)).rejects.toMatchObject({ code: 'unavailable' });
    blocker.close();
    const db = await database(1); expect(db.version).toBe(1); db.close();
    expect(await slots()).toEqual(before); expect(await protectionBackup()).toBeUndefined();
  });
  it('serializes two first protected saves with the same CAS token without losing the original checkpoint', async () => {
    const original = document(1, 45); await saveFmsDocument(original, null); const before = (await slots()).current;
    const outcomes = await Promise.allSettled([saveFmsDocument(withLocks(original), 1), saveFmsDocument(withLocks(original), 1)]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(x => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    expect((await loadFmsDocument())!.storedRevision).toBe(2); expect(await protectionBackup()).toEqual(before);
  });
});

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('独立 FMS 地形文档存档保护', () => {
  it('空库只读返回 null，不写空白草稿；只打开独立命名空间', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    expect(await loadFmsDocument()).toBeNull();
    expect(await slots()).toEqual({ current: undefined, backup: undefined, revision: undefined });
    expect(open.mock.calls.every(([name]) => name === 'lieguoji-fms-web-v1')).toBe(true);
    expect(open.mock.calls[0]).toEqual(['lieguoji-fms-web-v1', 1]);
  });

  it('真实 IndexedDB 往返 typed arrays，存储计数独立于编辑计数且无对象共享', async () => {
    const input = document(7, 45), original = structuredClone(input);
    const saved = await saveFmsDocument(input, null);
    expect(saved).toMatchObject({ document: original, storedRevision: 1, sourceStoredRevision: 1, recovery: 'none' });
    input.elevations[0] = 99;
    saved.document.points[0][0] = 20;
    const loaded = await loadFmsDocument();
    expect(loaded?.document).toEqual(original);
    expect(loaded?.document.triangles).toBeInstanceOf(Uint32Array);
    expect(loaded?.document.elevations).toBeInstanceOf(Int32Array);
    loaded!.document.elevations[0] = 18;
    expect((await loadFmsDocument())?.document).toEqual(original);
  });

  it('摘要异步期间的调用方修改不污染已捕获文档', async () => {
    const input = document(2, 50), original = structuredClone(input);
    const saving = saveFmsDocument(input, null);
    input.elevations[0] = 75; input.neighbors[0].reverse();
    expect((await saving).document).toEqual(original);
    expect((await loadFmsDocument())?.document).toEqual(original);
  });

  it('两次保存原子更新 current/backup，读取不改写任何槽', async () => {
    const first = await saveFmsDocument(document(0, 20), null);
    const firstSlots = await slots();
    const second = await saveFmsDocument(document(1, 65), first.storedRevision);
    const before = await slots();
    expect(before.backup).toEqual(firstSlots.current);
    expect(before.revision).toBe(2);
    expect(await loadFmsDocument()).toEqual(second);
    expect(await slots()).toEqual(before);
  });

  it('初始化空草稿无法覆盖已存在文档；旧令牌和其他 worldId 也不得替换会话', async () => {
    await saveFmsDocument(document(2, 60), null);
    const before = await slots();
    await expect(saveFmsDocument(document(), null)).rejects.toMatchObject({ code: 'conflict' });
    await expect(saveFmsDocument(document(3, 70), 2)).rejects.toMatchObject({ code: 'conflict' });
    await expect(saveFmsDocument({ ...document(3), worldId: '6be0d480-99cb-4b0b-ad43-ec74d08c7f42' }, 1)).rejects.toMatchObject({ code: 'conflict' });
    await expect(saveFmsDocument(document(1), 1)).rejects.toMatchObject({ code: 'conflict' });
    expect(await slots()).toEqual(before);
  });

  it('两个标签同一版本并发保存仅一个成功，备份保留赢家之前的版本', async () => {
    const first = await saveFmsDocument(document(), null), before = await slots();
    const candidates = [document(1, 33), document(1, 66)];
    const results = await Promise.allSettled(candidates.map(candidate => saveFmsDocument(candidate, first.storedRevision)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(FmsPersistenceError);
    expect(rejected.reason.code).toBe('conflict');
    expect((await loadFmsDocument())?.document).toEqual(candidates[results.findIndex(result => result.status === 'fulfilled')]);
    expect((await slots()).backup).toEqual(before.current);
    expect((await slots()).revision).toBe(2);
  });

  it('并发首次创建仅一个成功，不能各自报告保存了空槽', async () => {
    const outcomes = await Promise.allSettled([saveFmsDocument(document(0, 40), null), saveFmsDocument(document(0, 80), null)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect((await slots()).revision).toBe(1);
    expect((await slots()).backup).toBeUndefined();
  });

  it.each(['height', 'storedAt', 'storedRevision'] as const)('合法结构中的 %s 被篡改也拒绝读取和覆盖', async field => {
    await saveFmsDocument(document(1, 30), null);
    const damaged = rawEnvelope((await slots()).current);
    if (field === 'height') damaged.document.elevations[0] = 31;
    else if (field === 'storedAt') damaged.storedAt = '2026-10-05T00:00:00.000Z';
    else damaged.storedRevision = 2;
    await replace('current', damaged);
    const before = await slots();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    await expect(saveFmsDocument(document(2, 40), 1)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await slots()).toEqual(before);
  });

  it.each([false, true])('坏主槽（缺失=%s）只读恢复备份，下一次保存不把坏档提升为备份', async missing => {
    await saveFmsDocument(document(0, 25), null);
    await saveFmsDocument(document(1, 60), 1);
    await replace('current', { damaged: true }, missing);
    const before = await slots(), restored = await loadFmsDocument();
    expect(restored).toMatchObject({ document: document(0, 25), storedRevision: 2, sourceStoredRevision: 1, recovery: 'backup' });
    expect(await slots()).toEqual(before);
    const saved = await saveFmsDocument({ ...restored!.document, revision: 2 }, restored!.storedRevision);
    expect(saved).toMatchObject({ storedRevision: 3, sourceStoredRevision: 3, recovery: 'none' });
    expect((await slots()).backup).toEqual(before.backup);
    expect((await loadFmsDocument())?.recovery).toBe('none');
  });

  it('current 与 backup 均损坏时锁写，绝不将空草稿当恢复成功', async () => {
    await saveFmsDocument(document(), null); await saveFmsDocument(document(1, 20), 1);
    await replace('current', { damaged: true }); await replace('backup', { damaged: true });
    const before = await slots();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    await expect(saveFmsDocument(document(2), 2)).rejects.toMatchObject({ code: 'corrupt' });
    await expect(saveFmsDocument(document(), null)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await slots()).toEqual(before);
  });

  it('封装夹带未知字段不能作为合法当前档，孤立计数也不能被当成空槽', async () => {
    await saveFmsDocument(document(), null);
    const malformed = { ...rawEnvelope((await slots()).current), unversionedMetadata: true };
    await replace('current', malformed);
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    await replace('current', undefined, true);
    const before = await slots();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    await expect(saveFmsDocument(document(), null)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await slots()).toEqual(before);
  });

  it.each(['current-outer', 'current-inner', 'backup-outer', 'backup-inner'] as const)('未来版本 %s 即使另一个槽有效也拒绝降级读取和覆盖', async layer => {
    await saveFmsDocument(document(), null); await saveFmsDocument(document(1, 30), 1);
    const key = layer.startsWith('current') ? 'current' : 'backup';
    const newer = rawEnvelope((await slots())[key]);
    if (layer.endsWith('outer')) newer.version = 99;
    else Object.assign(newer.document, { version: 99 });
    await replace(key, newer);
    const before = await slots();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'future' });
    await expect(saveFmsDocument(document(2, 40), 2)).rejects.toMatchObject({ code: 'future' });
    expect(await slots()).toEqual(before);
  });

  it('未来数据库版本不可被当前代码打开或降级', async () => {
    const db = await database(3); db.close();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'future' });
    await expect(saveFmsDocument(document(), null)).rejects.toMatchObject({ code: 'future' });
    const current = await database(3); expect(current.version).toBe(3); current.close();
  });

  it.each([undefined, -1, 0, 0.5, NaN, Infinity, '2'])('损坏存储计数 %s 保留槽且不覆盖', async revision => {
    await saveFmsDocument(document(), null);
    await replace('revision', revision, revision === undefined);
    const before = await slots();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    await expect(saveFmsDocument(document(1), 1)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await slots()).toEqual(before);
  });

  it.each([undefined, -1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('无效调用计数 %s 不创建任何文档', async revision => {
    await expect(saveFmsDocument(document(), revision as number)).rejects.toMatchObject({ code: 'invalid-document' });
    expect(await slots()).toEqual({ current: undefined, backup: undefined, revision: undefined });
  });

  it('不完整拓扑、错误数组类型和未来文档不能保存', async () => {
    const invalids = [
      { ...document(), elevations: [0, 0, 0] },
      { ...document(), triangles: new Uint32Array([0, 1, 99]) },
      { ...document(), neighbors: [[1], [0, 2], [0, 1]] },
      { ...document(), version: 99 },
    ];
    for (const invalid of invalids)
      await expect(saveFmsDocument(invalid as FmsDocument, null)).rejects.toMatchObject({ code: 'invalid-document' });
    expect(await slots()).toEqual({ current: undefined, backup: undefined, revision: undefined });
  });

  it.each([false, true])('写事务前备份被换且未增计数仍拒绝覆盖（未来=%s）', async isFuture => {
    await saveFmsDocument(document(), null); await saveFmsDocument(document(1, 50), 1);
    const before = await slots(), replacement = rawEnvelope(before.backup);
    if (isFuture) replacement.version = 99;
    else replacement.document.elevations[0] = 23;
    const original = IDBDatabase.prototype.transaction; let injected = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (this.name === FMS_DATABASE_NAME && mode === 'readwrite' && !injected) {
        injected = true;
        original.call(this, 'saves', 'readwrite').objectStore('saves').put(replacement, 'backup');
      }
      return original.call(this, stores, mode, options);
    });
    await expect(saveFmsDocument(document(2, 80), 2)).rejects.toMatchObject({ code: isFuture ? 'future' : 'conflict' });
    vi.restoreAllMocks();
    expect(await slots()).toEqual({ ...before, backup: replacement });
  });

  it('提交中止会原子回滚 current、backup 和计数，不报告保存成功', async () => {
    await saveFmsDocument(document(), null); await saveFmsDocument(document(1, 40), 1);
    const before = await slots(), original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name === FMS_DATABASE_NAME && key === 'revision') {
        this.transaction.abort();
        throw new DOMException('Injected storage failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    });
    await expect(saveFmsDocument(document(2, 75), 2)).rejects.toMatchObject({ code: 'unavailable' });
    vi.restoreAllMocks(); expect(await slots()).toEqual(before);
  });
});
