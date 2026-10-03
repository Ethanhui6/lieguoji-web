import { assertFmsDocument, type FmsDocument } from './model';

export const FMS_DATABASE_NAME = 'lieguoji-fms-web-v1';
export const FMS_DATABASE_VERSION = 1;
export const FMS_SAVE_FORMAT = 'lieguoji-fms-document';
const STORE = 'saves';

export type FmsPersistenceErrorCode = 'conflict' | 'corrupt' | 'future' | 'unavailable' | 'invalid-document';

export class FmsPersistenceError extends Error {
  readonly code: FmsPersistenceErrorCode;
  constructor(code: FmsPersistenceErrorCode, message: string) {
    super(message);
    this.name = 'FmsPersistenceError';
    this.code = code;
  }
}

/** storedRevision is the CAS token, including when document was recovered from backup. */
export interface FmsStoredSnapshot {
  document: FmsDocument;
  storedRevision: number;
  sourceStoredRevision: number;
  storedAt: string;
  recovery: 'none' | 'backup';
}

interface FmsSaveEnvelope {
  format: typeof FMS_SAVE_FORMAT;
  version: 1;
  storedRevision: number;
  storedAt: string;
  checksum: string;
  document: FmsDocument;
}

interface RawSlots { current: unknown; backup: unknown; revision: unknown }
interface CheckedSlots {
  revision: number | null;
  current: FmsSaveEnvelope | null;
  backup: FmsSaveEnvelope | null;
}

const corrupt = () => new FmsPersistenceError('corrupt', '地形存档损坏或摘要不匹配，原存档已保留。');
const future = () => new FmsPersistenceError('future', '地形存档版本不兼容，已锁定读写；请使用创建该存档的兼容版本。');
const conflict = () => new FmsPersistenceError('conflict', '另一窗口已更新地形存档，本次未覆盖。请保留当前画布并重新载入存档。');
const unavailable = () => new FmsPersistenceError('unavailable', '无法完成本地地形存档操作，请检查浏览器存储权限和可用空间。');

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function rejectIncompatible(raw: unknown): void {
  if (!record(raw)) return;
  if (('format' in raw && raw.format !== FMS_SAVE_FORMAT) || ('version' in raw && raw.version !== 1)) throw future();
  if (record(raw.document) && (('format' in raw.document && raw.document.format !== 'lieguoji-fms-world')
    || ('version' in raw.document && raw.document.version !== 1))) throw future();
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validateDocument(raw: unknown): asserts raw is FmsDocument {
  try { assertFmsDocument(raw); } catch { throw corrupt(); }
}

function snapshotDocument(document: FmsDocument): FmsDocument {
  try {
    const copy: unknown = structuredClone(document);
    assertFmsDocument(copy);
    return copy;
  } catch {
    throw new FmsPersistenceError('invalid-document', '当前地形文档校验失败，未写入存档。');
  }
}

/** Explicit fields keep typed-array bytes portable without making JSON the document model. */
async function checksum(envelope: Omit<FmsSaveEnvelope, 'checksum'>): Promise<string> {
  const document = envelope.document;
  const bytes = new TextEncoder().encode(JSON.stringify({
    format: envelope.format, version: envelope.version,
    storedRevision: envelope.storedRevision, storedAt: envelope.storedAt,
    document: {
      format: document.format, version: document.version, worldId: document.worldId,
      revision: document.revision, width: document.width, height: document.height,
      points: document.points, triangles: Array.from(document.triangles),
      neighbors: document.neighbors, elevations: Array.from(document.elevations),
    },
  }));
  try {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { throw unavailable(); }
}

async function decodeEnvelope(raw: unknown): Promise<FmsSaveEnvelope> {
  rejectIncompatible(raw);
  const keys = ['format', 'version', 'storedRevision', 'storedAt', 'checksum', 'document'];
  if (!record(raw) || raw.format !== FMS_SAVE_FORMAT || raw.version !== 1
    || Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key))
    || !validRevision(raw.storedRevision) || typeof raw.storedAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.storedAt)
    || !Number.isFinite(Date.parse(raw.storedAt))
    || typeof raw.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(raw.checksum)) throw corrupt();
  validateDocument(raw.document);
  const envelope: FmsSaveEnvelope = {
    format: FMS_SAVE_FORMAT, version: 1, storedRevision: raw.storedRevision,
    storedAt: raw.storedAt, checksum: raw.checksum, document: raw.document,
  };
  if (envelope.checksum !== await checksum(envelope)) throw corrupt();
  return envelope;
}

async function validEnvelope(raw: unknown): Promise<FmsSaveEnvelope | null> {
  if (raw === undefined) return null;
  try { return await decodeEnvelope(raw); }
  catch (error) {
    if (error instanceof FmsPersistenceError && error.code === 'corrupt') return null;
    throw error;
  }
}

async function checkSlots(raw: RawSlots): Promise<CheckedSlots> {
  // Even a healthy current slot must not overwrite a backup from a newer client.
  rejectIncompatible(raw.current);
  rejectIncompatible(raw.backup);
  if (raw.current === undefined && raw.backup === undefined && raw.revision === undefined)
    return { revision: null, current: null, backup: null };
  if (!validRevision(raw.revision)) throw corrupt();
  const [currentCandidate, backupCandidate] = await Promise.all([validEnvelope(raw.current), validEnvelope(raw.backup)]);
  const current = currentCandidate?.storedRevision === raw.revision ? currentCandidate : null;
  const backup = backupCandidate && backupCandidate.storedRevision < raw.revision ? backupCandidate : null;
  if (!current && !backup) throw corrupt();
  return { revision: raw.revision, current, backup };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(FMS_DATABASE_NAME, FMS_DATABASE_VERSION); }
    catch { reject(unavailable()); return; }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onblocked = () => {
      abandoned = true;
      reject(new FmsPersistenceError('unavailable', '另一窗口阻止打开地形存档，请关闭该窗口后重试。'));
    };
    request.onerror = () => reject(request.error?.name === 'VersionError' ? future() : unavailable());
    request.onsuccess = () => {
      const database = request.result;
      if (abandoned) { database.close(); return; }
      if (!database.objectStoreNames.contains(STORE)) { database.close(); reject(corrupt()); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function readSlots(database: IDBDatabase): Promise<RawSlots> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      transaction.oncomplete = () => resolve({ current: current.result, backup: backup.result, revision: revision.result });
      transaction.onerror = transaction.onabort = () => reject(unavailable());
    } catch { reject(unavailable()); }
  });
}

function snapshot(envelope: FmsSaveEnvelope, revision: number, recovery: FmsStoredSnapshot['recovery']): FmsStoredSnapshot {
  return { document: envelope.document, storedRevision: revision, sourceStoredRevision: envelope.storedRevision,
    storedAt: envelope.storedAt, recovery };
}

/** Reads never repair slots or open any legacy game database. */
export async function loadFmsDocument(): Promise<FmsStoredSnapshot | null> {
  const database = await openDatabase();
  const raw = await readSlots(database).finally(() => database.close());
  const checked = await checkSlots(raw);
  if (checked.revision === null) return null;
  if (checked.current) return snapshot(checked.current, checked.revision, 'none');
  return snapshot(checked.backup!, checked.revision, 'backup');
}

/** null is create-only. Hashing finishes before the atomic CAS/backup/current transaction. */
export async function saveFmsDocument(document: FmsDocument, expectedStoredRevision: number | null): Promise<FmsStoredSnapshot> {
  if (expectedStoredRevision !== null && (!validRevision(expectedStoredRevision) || expectedStoredRevision >= Number.MAX_SAFE_INTEGER))
    throw new FmsPersistenceError('invalid-document', '存档版本计数无效或已达上限，原存档已保留。');
  const copy = snapshotDocument(document);
  const revision = (expectedStoredRevision ?? 0) + 1;
  const payload: Omit<FmsSaveEnvelope, 'checksum'> = {
    format: FMS_SAVE_FORMAT, version: 1, storedRevision: revision, storedAt: new Date().toISOString(), document: copy,
  };
  const envelope: FmsSaveEnvelope = { ...payload, checksum: await checksum(payload) };
  const database = await openDatabase();
  try {
    const before = await readSlots(database);
    const checked = await checkSlots(before);
    if (checked.revision !== expectedStoredRevision) throw conflict();
    const previous = checked.current ?? checked.backup;
    if (previous && (copy.worldId !== previous.document.worldId || copy.revision < previous.document.revision)) throw conflict();
    // Raw equality also catches concurrent writers that failed to update the CAS counter.
    const beforeIdentity = JSON.stringify(before);
    await new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = database.transaction(STORE, 'readwrite'); } catch { reject(unavailable()); return; }
      const store = transaction.objectStore(STORE);
      const current = store.get('current'), backup = store.get('backup'), counter = store.get('revision');
      let failure: FmsPersistenceError | null = null;
      counter.onsuccess = () => {
        try {
          rejectIncompatible(current.result);
          rejectIncompatible(backup.result);
          const actual: RawSlots = { current: current.result, backup: backup.result, revision: counter.result };
          if (JSON.stringify(actual) !== beforeIdentity) throw conflict();
          if (checked.current) store.put(checked.current, 'backup');
          store.put(envelope, 'current');
          store.put(revision, 'revision');
        } catch (error) {
          failure = error instanceof FmsPersistenceError ? error : unavailable();
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(failure ?? unavailable());
    });
    return snapshot(envelope, revision, 'none');
  } finally { database.close(); }
}
