/** PH03 experiment storage only. This is not an importable game save format. */
export const SCALE_BENCH_DB = 'lieguoji-scale-bench-v1';
export const SCALE_BENCH_STORE = 'runs';
const SLOT_FORMAT = 'lieguoji-scale-bench-slots';
const SNAPSHOT_FORMAT = 'lieguoji-scale-bench-snapshot';
const VERSION = 1;

export type ScaleSnapshotSource = 'current' | 'backup';
export type ScaleSaveOptions = { expectedRevision: number; payloadHash: string; signal?: AbortSignal };
export type ScaleSaveResult = { revision: number; payloadBytes: number; pairPayloadBytes: number };
export type ScaleReadResult<T> = {
  payload: T | null;
  /** Caller-provided digest. The caller must recompute it after loading. */
  payloadHash: string | null;
  revision: number;
  source: ScaleSnapshotSource;
  recoveredFromBackup: boolean;
  payloadBytes: number;
  /** Null when explicit recovery encountered an invalid other slot. */
  pairPayloadBytes: number | null;
};
type Snapshot<T = unknown> = {
  format: typeof SNAPSHOT_FORMAT; version: 1; runId: string;
  payloadHash: string; payloadBytes: number; payload: T;
};
type SlotPair = {
  format: typeof SLOT_FORMAT; version: 1; runId: string; revision: number;
  current: unknown; backup: unknown;
};

const encoder = new TextEncoder();
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function runKey(runId: string) {
  if (typeof runId !== 'string' || !/^scale-[a-z0-9][a-z0-9-]{0,89}$/.test(runId)) throw new Error('实验运行标识无效，未访问数据库。');
}
function revision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('实验修订号无效，原数据保留。');
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('实验快照需要调用方提供完整 SHA-256 摘要。');
}

/**
 * Logical payload accounting, NOT structured-clone encoding or physical disk use.
 * Counts UTF-8 strings/object keys, numeric values as 8 bytes, booleans as 1 byte,
 * and each visible ArrayBuffer/view byte. Null/undefined and container overhead
 * count as zero. Repeated references count per occurrence; cycles are rejected.
 * A view may retain a larger backing buffer: that physical cost is not claimed.
 */
export function scalePayloadBytes(payload: unknown): number {
  const ancestors = new Set<object>();
  function bytes(value: unknown, depth: number): number {
    if (depth > 64) throw new Error('实验数据嵌套过深，未保存。');
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return encoder.encode(value).byteLength;
    if (typeof value === 'boolean') return 1;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('实验数据包含无效数值，未保存。');
      return 8;
    }
    if (typeof value !== 'object') throw new Error('实验数据含不支持的值，未保存。');
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) {
      if (!(value.buffer instanceof ArrayBuffer)) throw new Error('实验快照不接受可并发修改的共享缓冲区。');
      return value.byteLength;
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('实验快照只接受纯数据对象、数组与类型化数组。');
    if (ancestors.has(value)) throw new Error('实验快照含循环引用，未保存。');
    ancestors.add(value);
    let total = 0;
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (typeof key !== 'string') throw new Error('实验快照不接受 Symbol 字段。');
      if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error('实验数组不接受额外命名字段。');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('实验快照不接受访问器或隐藏字段。');
      // Array indices describe container positions, not object metadata.
      if (!Array.isArray(value)) total += encoder.encode(key).byteLength;
      total += bytes(descriptor.value, depth + 1);
      if (!Number.isSafeInteger(total)) throw new Error('实验逻辑容量超出计数范围。');
    }
    ancestors.delete(value);
    return total;
  }
  return bytes(payload, 0);
}

function openDatabase(create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let missing = false, settled = false;
    const request = indexedDB.open(SCALE_BENCH_DB, VERSION);
    request.onupgradeneeded = event => {
      // Aborting creation allows an absent read without creating an empty DB.
      if (!create || settled || event.oldVersion !== 0) {
        missing = !create && event.oldVersion === 0 && !settled;
        request.transaction!.abort();
        return;
      }
      request.result.createObjectStore(SCALE_BENCH_STORE);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      if (missing) resolve(null);
      else reject(new Error('无法打开实验库；版本、权限或存储状态不兼容，原数据保留。', { cause: request.error }));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('实验库正被另一窗口占用升级，请关闭旧实验页后重试。'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      if (db.version !== VERSION || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(SCALE_BENCH_STORE)) {
        db.close(); reject(new Error('实验库结构不兼容，原数据保留。')); return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function supportedSnapshot(raw: unknown) {
  if (object(raw) && (raw.format !== SNAPSHOT_FORMAT || raw.version !== VERSION)) throw new Error('实验快照格式或版本不兼容，禁止覆盖原数据。');
}
function slotPair(raw: unknown, runId: string): SlotPair {
  if (!object(raw) || raw.format !== SLOT_FORMAT || raw.version !== VERSION) throw new Error('实验主备格式或版本不兼容，禁止覆盖原数据。');
  revision(raw.revision);
  if (raw.revision === 0 || raw.runId !== runId || !own(raw, 'current') || !own(raw, 'backup')) throw new Error('实验主备身份或修订号损坏，原数据保留。');
  // A valid old backup must not disguise a future current slot, or vice versa.
  supportedSnapshot(raw.current); supportedSnapshot(raw.backup);
  return raw as SlotPair;
}
function snapshot(raw: unknown, runId: string): Snapshot {
  supportedSnapshot(raw);
  if (!object(raw) || raw.runId !== runId || !own(raw, 'payload')) throw new Error('实验快照内容损坏，原数据保留。');
  digest(raw.payloadHash);
  const measured = scalePayloadBytes(raw.payload);
  if (raw.payloadBytes !== measured) throw new Error('实验快照逻辑容量不一致，原数据保留。');
  return raw as Snapshot;
}
function rawRun(db: IDBDatabase, runId: string): Promise<{ present: boolean; value: unknown }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SCALE_BENCH_STORE, 'readonly');
    const store = transaction.objectStore(SCALE_BENCH_STORE), read = store.get(runId), key = store.getKey(runId);
    transaction.oncomplete = () => resolve({ present: key.result !== undefined, value: read.result });
    transaction.onerror = () => reject(transaction.error ?? new Error('实验读取失败，原数据保留。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('实验读取中断，原数据保留。'));
  });
}

/** No implicit backup fallback and no writes while reading, including recovery. */
export async function readScaleSnapshot<T = unknown>(runId: string, options: { source?: ScaleSnapshotSource } = {}): Promise<ScaleReadResult<T>> {
  runKey(runId);
  const source = options.source ?? 'current';
  if (source !== 'current' && source !== 'backup') throw new Error('必须明确选择实验主档或备份。');
  const db = await openDatabase(false);
  let raw: { present: boolean; value: unknown };
  try { raw = db ? await rawRun(db, runId) : { present: false, value: undefined }; } finally { db?.close(); }
  if (!raw.present) return { payload: null, payloadHash: null, revision: 0, source, recoveredFromBackup: false, payloadBytes: 0, pairPayloadBytes: 0 };
  const pair = slotPair(raw.value, runId), selected = snapshot(pair[source], runId);
  let pairPayloadBytes: number | null;
  try { pairPayloadBytes = snapshot(pair.current, runId).payloadBytes + (pair.backup === null ? 0 : snapshot(pair.backup, runId).payloadBytes); }
  catch { pairPayloadBytes = null; }
  return { payload: selected.payload as T, payloadHash: selected.payloadHash, revision: pair.revision, source, recoveredFromBackup: source === 'backup', payloadBytes: selected.payloadBytes, pairPayloadBytes };
}

/**
 * The supplied digest is opaque: callers verify their fixture/history semantics.
 * Corrupt/future slots are never silently repaired or overwritten. An explicitly
 * recovered payload can be saved under a new experiment run ID instead.
 * Cancellation is checked before the write transaction starts. Once started,
 * only the actual IDB complete/abort result determines whether a save committed.
 */
export async function saveScaleSnapshot<T>(runId: string, payload: T, options: ScaleSaveOptions): Promise<ScaleSaveResult> {
  const signal = options.signal;
  signal?.throwIfAborted();
  runKey(runId); revision(options.expectedRevision); digest(options.payloadHash);
  if (options.expectedRevision === Number.MAX_SAFE_INTEGER) throw new Error('实验修订号已达上限，原数据保留。');
  // Validate and clone before the first asynchronous boundary: caller mutation
  // cannot alter this snapshot while IndexedDB opens or another writer commits.
  const payloadBytes = scalePayloadBytes(payload), copied = structuredClone(payload);
  signal?.throwIfAborted();
  const current: Snapshot<T> = { format: SNAPSHOT_FORMAT, version: VERSION, runId, payloadHash: options.payloadHash, payloadBytes, payload: copied };
  const expectedRevision = options.expectedRevision;
  signal?.throwIfAborted();
  const db = (await openDatabase(true))!;
  try {
    // An abort while open() was pending must not turn into a later write. Keep
    // this inside finally's scope so the newly opened connection is closed.
    signal?.throwIfAborted();
    return await new Promise<ScaleSaveResult>((resolve, reject) => {
      const transaction = db.transaction(SCALE_BENCH_STORE, 'readwrite'), store = transaction.objectStore(SCALE_BENCH_STORE);
      const read = store.get(runId), key = store.getKey(runId);
      let result: ScaleSaveResult | undefined, failure: unknown;
      key.onsuccess = () => {
        try {
          const before = key.result === undefined ? null : slotPair(read.result, runId);
          if ((before?.revision ?? 0) !== expectedRevision) throw new Error('另一实验窗口已更新此运行，修订号冲突，未覆盖。');
          const backup = before ? snapshot(before.current, runId) : null;
          if (before && before.backup !== null) snapshot(before.backup, runId);
          const next: SlotPair = { format: SLOT_FORMAT, version: VERSION, runId, revision: expectedRevision + 1, current, backup };
          store.put(next, runId);
          result = { revision: next.revision, payloadBytes, pairPayloadBytes: payloadBytes + (backup?.payloadBytes ?? 0) };
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => result ? resolve(result) : reject(new Error('实验保存没有产生提交结果。'));
      transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('实验保存失败，原主备保留。'));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('实验保存事务中断，原主备保留。'));
    });
  } finally { db.close(); }
}
