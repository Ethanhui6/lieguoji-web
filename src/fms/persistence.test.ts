import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FmsDocument } from './model';
import { FMS_DATABASE_NAME, FmsPersistenceError, loadFmsDocument, saveFmsDocument } from './persistence';

function document(revision = 0, height = 0): FmsDocument {
  return {
    format: 'lieguoji-fms-world', version: 1,
    worldId: '5be0d480-99cb-4b0b-ad43-ec74d08c7f42', revision, width: 100, height: 100,
    points: [[0, 0], [100, 0], [0, 100]], triangles: new Uint32Array([0, 1, 2]),
    neighbors: [[1, 2], [0, 2], [0, 1]], elevations: new Int32Array([height, 0, 0]),
  };
}

async function database(version = 1): Promise<IDBDatabase> {
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

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('独立 FMS 地形文档存档保护', () => {
  it('空库只读返回 null，不写空白草稿；只打开独立命名空间', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    expect(await loadFmsDocument()).toBeNull();
    expect(await slots()).toEqual({ current: undefined, backup: undefined, revision: undefined });
    expect(open.mock.calls.every(([name, version]) => name === 'lieguoji-fms-web-v1' && version === 1)).toBe(true);
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
    const db = await database(2); db.close();
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'future' });
    await expect(saveFmsDocument(document(), null)).rejects.toMatchObject({ code: 'future' });
    const current = await database(2); expect(current.version).toBe(2); current.close();
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
