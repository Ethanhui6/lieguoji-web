/** Opaque rescue export only. This version does not import or execute this format. */
export type ProtectedValue = { present: false } | { present: true; value: unknown };
export type ProtectedBackupRecords = {
  kind: 'save'; database: string; databaseVersion: number;
  current: ProtectedValue; backup: ProtectedValue; revision: ProtectedValue;
} | {
  kind: 'history'; database: 'lieguoji-history-v1'; databaseVersion: number; storageId: string;
  run: ProtectedValue; usageStorePresent: boolean; usage: ProtectedValue;
};
export type ProtectedBackup = {
  format: 'lieguoji-protected-backup'; version: 1; scope: string; createdAt: string;
  checksum: string; records: ProtectedBackupRecords;
};
export const MAX_PROTECTED_BACKUP_BYTES = 250 * 1024 * 1024;

type Target = { kind: 'save'; database: string } | { kind: 'history'; database: 'lieguoji-history-v1'; storageId: string };
function targetFor(scope: string): Target {
  if (scope === 'test-continent') return { kind: 'save', database: 'lieguoji-test-continent-v1' };
  if (typeof scope !== 'string' || scope.length > 90 || !/^custom-run-[a-z0-9-]+$/.test(scope)) throw new Error('原始备份范围无效，只能导出当前游戏存档。');
  if (scope.startsWith('custom-run-h-')) {
    const storageId = scope.slice(7);
    if (!/^run-h-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(storageId)) throw new Error('历史原始备份身份无效。');
    return { kind: 'history', database: 'lieguoji-history-v1', storageId };
  }
  return { kind: 'save', database: `lieguoji-${scope}-v1` };
}

/** Opening without a version also permits a future DB version, without upgrading it. */
function openExisting(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let settled = false, missing = false;
    const fail = (message: string) => { if (!settled) { settled = true; reject(new Error(message)); } };
    request.onupgradeneeded = () => {
      // A missing DB would be created here. Abort it rather than leave an empty database.
      missing = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (settled || missing) { request.result.close(); fail('当前存档数据库不存在，没有可导出的原始备份。'); return; }
      settled = true; resolve(request.result);
    };
    request.onerror = () => fail(missing ? '当前存档数据库不存在，没有可导出的原始备份。' : '无法只读打开当前存档，原数据保留。');
    request.onblocked = () => fail('当前存档被其他窗口占用，原数据保留，请关闭冲突窗口后重试导出。');
  });
}

function readValue(store: IDBObjectStore, key: IDBValidKey): () => ProtectedValue {
  const value = store.get(key), found = store.getKey(key);
  return () => found.result === undefined ? { present: false } : { present: true, value: value.result };
}

async function readRecords(target: Target): Promise<ProtectedBackupRecords> {
  const db = await openExisting(target.database);
  try {
    const requiredStore = target.kind === 'history' ? 'runs' : 'saves';
    if (!db.objectStoreNames.contains(requiredStore)) throw new Error('当前数据库缺少原始存档存储区，未读取其他内容，原数据保留。');
    return await new Promise<ProtectedBackupRecords>((resolve, reject) => {
      const usageStorePresent = target.kind === 'history' && db.objectStoreNames.contains('meta');
      const tx = db.transaction(usageStorePresent ? ['runs', 'meta'] : [requiredStore], 'readonly');
      let snapshot: () => ProtectedBackupRecords;
      if (target.kind === 'history') {
        const run = readValue(tx.objectStore('runs'), target.storageId);
        const usage = usageStorePresent ? readValue(tx.objectStore('meta'), 'usage') : () => ({ present: false } as const);
        snapshot = () => ({ kind: 'history', database: target.database, databaseVersion: db.version, storageId: target.storageId, run: run(), usageStorePresent, usage: usage() });
      } else {
        const store = tx.objectStore('saves');
        const current = readValue(store, 'current'), backup = readValue(store, 'backup'), revision = readValue(store, 'revision');
        snapshot = () => ({ kind: 'save', database: target.database, databaseVersion: db.version, current: current(), backup: backup(), revision: revision() });
      }
      tx.oncomplete = () => resolve(snapshot());
      tx.onerror = () => reject(new Error('原始存档读取失败，数据库未修改。'));
      tx.onabort = () => reject(new Error('原始存档读取中断，数据库未修改。'));
    });
  } finally { db.close(); }
}

/** Refuse values JSON would silently omit or transform; never truncate an opaque backup. */
function requireLosslessJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Object.is(value, -0)) throw new Error('原始存档含 JSON 无法原样保存的数值，未导出且原数据保留。');
    return;
  }
  if (typeof value !== 'object') throw new Error('原始存档包含无法无损导出为 JSON 的值，未导出且原数据保留。');
  if (ancestors.has(value)) throw new Error('原始存档含循环引用，不能无损导出为 JSON，原数据保留。');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('原始存档包含非 JSON 数据，未转换或丢弃任何字段，原数据保留。');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).some(present => !present)) throw new Error('原始存档包含稀疏数组，未替换为空值，原数据保留。');
      for (const entry of value) requireLosslessJson(entry, ancestors);
    } else {
      if (Reflect.ownKeys(value).length !== Object.keys(value).length) throw new Error('原始存档包含非 JSON 字段，未导出且原数据保留。');
      for (const entry of Object.values(value)) requireLosslessJson(entry, ancestors);
    }
  } finally { ancestors.delete(value); }
}

export async function readProtectedBackup(scope: string): Promise<ProtectedBackup> {
  const records = await readRecords(targetFor(scope));
  if (records.kind === 'history' ? !records.run.present : !records.current.present && !records.backup.present) throw new Error('当前范围没有原始存档，没有创建或修改任何记录。');
  requireLosslessJson(records);
  const bytes = new TextEncoder().encode(JSON.stringify(records));
  if (bytes.byteLength > MAX_PROTECTED_BACKUP_BYTES) throw new Error('原始备份超过 250 MiB，未截断或导出，原数据保留。');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const envelope: ProtectedBackup = {
    format: 'lieguoji-protected-backup', version: 1, scope, createdAt: new Date().toISOString(),
    checksum: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''), records,
  };
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_PROTECTED_BACKUP_BYTES) throw new Error('原始备份超过 250 MiB，未截断或导出，原数据保留。');
  return envelope;
}
