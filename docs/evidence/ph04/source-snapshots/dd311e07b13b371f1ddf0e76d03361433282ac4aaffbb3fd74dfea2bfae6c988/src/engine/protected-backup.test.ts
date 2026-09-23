import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROTECTED_BACKUP_BYTES, readProtectedBackup } from './protected-backup';

const storageId = 'run-h-10000000-0000-4000-8000-000000000001';
const historyScope = `custom-${storageId}`;
const ordinaryScope = 'custom-run-protected-test';
const ordinaryDb = `lieguoji-${ordinaryScope}-v1`;
async function seed(name: string, version: number, stores: Record<string, Record<string, unknown>>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => { for (const store of Object.keys(stores)) request.result.createObjectStore(store); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(Object.keys(stores), 'readwrite');
    for (const [store, entries] of Object.entries(stores)) for (const [key, value] of Object.entries(entries)) tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function snapshot(name: string, stores: string[]) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { return await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(stores, 'readonly');
    const requests = stores.map(name => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() }));
    tx.oncomplete = () => resolve({ version: db.version, stores: requests.map(item => ({ name: item.name, keys: item.keys.result, values: item.values.result })) });
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function checksum(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('受保护存档的只读原始备份', () => {
  it('未来数据库和内外版本原样导出，current/backup/revision及未知字段不变', async () => {
    const current = { format: 'lieguoji-save', version: 99, rulesVersion: '99.1', checksum: 'future-checksum', world: { schemaVersion: 99, statecraft: { version: 77 }, future: ['保留', { flag: true, value: null }] } };
    const backup = { format: 'future-save', version: 100, extension: { missingInOldClient: '原封不动' } };
    await seed(ordinaryDb, 17, { saves: { current, backup, revision: 902, unrelated: { private: '不属于导出key' } } });
    const before = await snapshot(ordinaryDb, ['saves']);
    const result = await readProtectedBackup(ordinaryScope);
    expect(result).toMatchObject({ format: 'lieguoji-protected-backup', version: 1, scope: ordinaryScope });
    expect(result.records).toEqual({ kind: 'save', database: ordinaryDb, databaseVersion: 17, current: { present: true, value: current }, backup: { present: true, value: backup }, revision: { present: true, value: 902 } });
    expect(result.checksum).toBe(await checksum(result.records));
    expect(JSON.stringify(JSON.parse(JSON.stringify(result)).records)).toBe(JSON.stringify(result.records));
    expect(JSON.stringify(result)).not.toContain('不属于导出key');
    expect(await snapshot(ordinaryDb, ['saves'])).toEqual(before);
  });

  it('历史slots即使格式和引擎未知仍仅导出当前run及usage，不枚举其他运行', async () => {
    const run = { format: 'future-slots', version: 99, current: { version: 80, record: { history: { version: 9, engineFingerprint: 'unknown-new-engine' }, world: { future: true } } }, backup: { keep: 'previous opaque record' }, revision: 71, futureField: 'extra' };
    const usage = { format: 'future-usage', version: 19, bytes: 735, additional: [1, 2] };
    await seed('lieguoji-history-v1', 8, { runs: { [storageId]: run, 'run-h-20000000-0000-4000-8000-000000000002': { otherWorld: '不可导出' } }, meta: { usage, otherMeta: '不读取' } });
    const before = await snapshot('lieguoji-history-v1', ['runs', 'meta']);
    const result = await readProtectedBackup(historyScope);
    expect(result.records).toEqual({ kind: 'history', database: 'lieguoji-history-v1', databaseVersion: 8, storageId, run: { present: true, value: run }, usageStorePresent: true, usage: { present: true, value: usage } });
    expect(result.checksum).toBe(await checksum(result.records));
    expect(JSON.stringify(result)).not.toContain('不可导出'); expect(JSON.stringify(result)).not.toContain('不读取');
    expect(await snapshot('lieguoji-history-v1', ['runs', 'meta'])).toEqual(before);
  });

  it('不存在的普通和历史数据库均拒绝，初次upgrade被abort且不留下空库', async () => {
    for (const scope of ['test-continent', ordinaryScope, historyScope]) {
      await expect(readProtectedBackup(scope)).rejects.toThrow('数据库不存在');
      expect(await indexedDB.databases()).toEqual([]);
    }
  });

  it.each(['', '../test-continent', 'other-project', 'custom-other', 'custom-run-../escape', 'custom-run-h-invalid', 'custom-run-h-10000000-0000-4000-8000-00000000000G', `custom-run-${'a'.repeat(80)}`])('错误scope %s 在开库前拒绝', async scope => {
    await expect(readProtectedBackup(scope)).rejects.toThrow(); expect(await indexedDB.databases()).toEqual([]);
  });

  it('已有数据库缺少目标run或存储区时拒绝，不创建新store/key', async () => {
    await seed('lieguoji-history-v1', 4, { runs: { other: { keep: true } }, meta: { usage: { version: 99 } } });
    const before = await snapshot('lieguoji-history-v1', ['runs', 'meta']);
    await expect(readProtectedBackup(historyScope)).rejects.toThrow('没有原始存档');
    expect(await snapshot('lieguoji-history-v1', ['runs', 'meta'])).toEqual(before);
    await seed(ordinaryDb, 5, { futureStore: { raw: { keep: true } } });
    const other = await snapshot(ordinaryDb, ['futureStore']);
    await expect(readProtectedBackup(ordinaryScope)).rejects.toThrow('缺少原始存档存储区');
    expect(await snapshot(ordinaryDb, ['futureStore'])).toEqual(other);
  });

  it('缺失槽有明确present标记，未来history没有meta也可导出原run', async () => {
    await seed('lieguoji-test-continent-v1', 1, { saves: { backup: { opaque: true } } });
    expect((await readProtectedBackup('test-continent')).records).toMatchObject({ current: { present: false }, backup: { present: true, value: { opaque: true } }, revision: { present: false } });
    await seed('lieguoji-history-v1', 2, { runs: { [storageId]: { version: 999, current: null } } });
    expect((await readProtectedBackup(historyScope)).records).toMatchObject({ run: { present: true, value: { version: 999, current: null } }, usageStorePresent: false, usage: { present: false } });
  });

  it.each([undefined, NaN, new Date('2026-09-23T00:00:00Z'), new Uint8Array([1, 2]), { dropped: undefined }])('JSON会转换或丢字段的原值%s拒绝导出，原记录不改', async value => {
    await seed(ordinaryDb, 1, { saves: { current: value, backup: { valid: true }, revision: 1 } });
    const before = await snapshot(ordinaryDb, ['saves']);
    await expect(readProtectedBackup(ordinaryScope)).rejects.toThrow('JSON');
    expect(await snapshot(ordinaryDb, ['saves'])).toEqual(before);
  });

  it('超过完整JSON字节预算时拒绝，不以截断结果冒充原始备份', async () => {
    await seed(ordinaryDb, 1, { saves: { current: { opaque: 'kept' }, revision: 3 } });
    const before = await snapshot(ordinaryDb, ['saves']);
    const oversized = new Uint8Array(1); Object.defineProperty(oversized, 'byteLength', { value: MAX_PROTECTED_BACKUP_BYTES + 1 });
    vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(oversized);
    await expect(readProtectedBackup(ordinaryScope)).rejects.toThrow('250 MiB'); vi.restoreAllMocks();
    expect(await snapshot(ordinaryDb, ['saves'])).toEqual(before);
  });

  it('所有实际读取事务均为readonly，没有写请求和版本升级', async () => {
    await seed(ordinaryDb, 12, { saves: { current: { unknown: true }, revision: 1 } });
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction'), put = vi.spyOn(IDBObjectStore.prototype, 'put'), remove = vi.spyOn(IDBObjectStore.prototype, 'delete');
    await readProtectedBackup(ordinaryScope);
    expect(transaction.mock.calls.every(call => call[1] === 'readonly')).toBe(true);
    expect(put).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
});
