import { validateWorld } from '../sim/core';
import type { World } from '../sim/types';
import { hashWorld, MAX_HISTORY_BYTES, validateHistory, verifyHistoryIntegrity } from './core';
import type { HistoryLog } from './types';

export type HistoryRecord = { storageId: string; readOnly: boolean; world: World; history: HistoryLog };
export type HistoryFile = { format: 'lieguoji-history-export'; version: 1; checksum: string; history: HistoryLog };
export const MAX_HISTORY_STORAGE_BYTES = 200 * 1024 * 1024;

type Envelope = { format: 'lieguoji-history-record'; version: 1; checksum: string; record: HistoryRecord };
type Slots = { format: 'lieguoji-history-slots'; version: 1; current: unknown; backup: unknown; revision: number };
type Usage = { format: 'lieguoji-history-usage'; version: 1; bytes: number };
type RawRead = { slots: unknown; usage: unknown; count: number };
const DB = 'lieguoji-history-v1';
const FILE_LIMIT = MAX_HISTORY_BYTES + 4096;
const encoder = new TextEncoder();
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const lockedVersion = () => new Error('历史存档版本不兼容，已锁定写入；请使用创建该记录的兼容游戏版本。');
const failure = () => new Error('历史保存失败或浏览器空间不足，原记录及备份未修改。请导出备份。');

function requireId(storageId: unknown): asserts storageId is string {
  if (typeof storageId !== 'string' || !/^run-h-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(storageId)) throw new Error('历史存储身份无效，原记录未修改。');
}
function revision(value: unknown, writing = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || (writing && value === Number.MAX_SAFE_INTEGER)) throw new Error('历史存档版本计数损坏或已达上限，原记录已保留。');
  return value;
}
function bytes(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return encoder.encode(JSON.stringify(value)).byteLength;
}
async function digest(value: unknown): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)));
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function guardWorld(raw: unknown) {
  if (!isObject(raw)) return;
  if (('schemaVersion' in raw && raw.schemaVersion !== 1 && raw.schemaVersion !== 2) || ('rulesVersion' in raw && raw.rulesVersion !== '0.1.0' && raw.rulesVersion !== '0.2.0')) throw lockedVersion();
  if ('schemaVersion' in raw && 'rulesVersion' in raw && !(raw.schemaVersion === 1 && raw.rulesVersion === '0.1.0' || raw.schemaVersion === 2 && raw.rulesVersion === '0.2.0')) throw lockedVersion();
  if (isObject(raw.statecraft) && 'version' in raw.statecraft && raw.statecraft.version !== 1) throw lockedVersion();
}
function guardHistory(raw: unknown) {
  if (!isObject(raw)) return;
  if (('version' in raw && raw.version !== 1) || ('rulesVersion' in raw && raw.rulesVersion !== '0.1.0' && raw.rulesVersion !== '0.2.0')) throw lockedVersion();
  if (isObject(raw.initial)) guardWorld(raw.initial.world);
  if (Array.isArray(raw.checkpoints)) for (const checkpoint of raw.checkpoints) if (isObject(checkpoint)) guardWorld(checkpoint.world);
}
function guardEnvelope(raw: unknown) {
  if (!isObject(raw)) return;
  if ('version' in raw && raw.version !== 1) throw lockedVersion();
  if (isObject(raw.record)) {
    guardWorld(raw.record.world); guardHistory(raw.record.history);
    if (isObject(raw.record.world) && isObject(raw.record.history) && 'rulesVersion' in raw.record.world && 'rulesVersion' in raw.record.history && raw.record.world.rulesVersion !== raw.record.history.rulesVersion) throw lockedVersion();
  }
}
function checkedSlots(raw: unknown): Slots | null {
  if (raw === undefined) return null;
  if (isObject(raw)) {
    if ('version' in raw && raw.version !== 1) throw lockedVersion();
    // A future backup is also protected; it must never be silently overwritten.
    guardEnvelope(raw.current); guardEnvelope(raw.backup);
  }
  if (!isObject(raw) || raw.format !== 'lieguoji-history-slots' || raw.version !== 1 || !exact(raw, ['format', 'version', 'current', 'backup', 'revision'])) throw new Error('历史存储记录损坏，已锁定写入，原记录保留。');
  revision(raw.revision);
  if (raw.revision === 0) throw new Error('历史存档版本计数损坏，原记录已保留。');
  return raw as Slots;
}
function checkedUsage(raw: unknown, count: number): number {
  if (raw === undefined && count === 0) return 0;
  if (isObject(raw) && 'version' in raw && raw.version !== 1) throw lockedVersion();
  if (!isObject(raw) || !exact(raw, ['format', 'version', 'bytes']) || raw.format !== 'lieguoji-history-usage' || raw.version !== 1 || typeof raw.bytes !== 'number' || !Number.isSafeInteger(raw.bytes) || raw.bytes < 0 || raw.bytes > MAX_HISTORY_STORAGE_BYTES) throw new Error('历史容量计数损坏，已锁定写入，原记录保留。');
  return raw.bytes;
}
function slotBytes(slots: Slots | null): number {
  return slots ? bytes(slots.current) + bytes(slots.backup) : 0;
}

function open(create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    let missing = false, settled = false;
    request.onupgradeneeded = () => {
      if (!create) { missing = true; request.transaction!.abort(); return; }
      request.result.createObjectStore('runs'); request.result.createObjectStore('meta');
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      if (!db.objectStoreNames.contains('runs') || !db.objectStoreNames.contains('meta')) { db.close(); reject(new Error('历史数据库结构损坏，已锁定写入。')); return; }
      db.onversionchange = () => db.close(); resolve(db);
    };
    request.onerror = () => {
      if (settled) return; settled = true;
      if (missing) resolve(null);
      else reject(request.error?.name === 'VersionError' ? lockedVersion() : new Error('无法打开历史存储，请检查浏览器存储权限；原记录保留。'));
    };
    request.onblocked = () => { if (!settled) { settled = true; reject(new Error('另一窗口正在升级历史存储，请关闭旧窗口后重试。')); } };
  });
}
function readRaw(db: IDBDatabase, storageId: string): Promise<RawRead> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['runs', 'meta'], 'readonly');
    const slots = tx.objectStore('runs').get(storageId), usage = tx.objectStore('meta').get('usage'), count = tx.objectStore('runs').count();
    tx.oncomplete = () => resolve({ slots: slots.result, usage: usage.result, count: count.result });
    tx.onerror = () => reject(new Error('历史读取失败，已保留原记录。'));
    tx.onabort = () => reject(new Error('历史读取中断，已保留原记录。'));
  });
}
async function validateRecord(record: HistoryRecord, storageId: string): Promise<void> {
  guardWorld(record.world); guardHistory(record.history);
  if (!isObject(record) || !exact(record, ['storageId', 'readOnly', 'world', 'history']) || record.storageId !== storageId || typeof record.readOnly !== 'boolean' || !validateWorld(record.world) || !validateHistory(record.history)) throw new Error('历史快照或记录结构、版本、大小无效，原记录未修改。');
  const { world, history } = record;
  if (world.scenario !== 'custom-world' || world.custom?.id !== history.runId || world.rulesVersion !== history.rulesVersion || (!record.readOnly && storageId !== history.runId)) throw new Error('历史与快照的运行身份或规则不一致，原记录未修改。');
  await verifyHistoryIntegrity(history);
  const tail = history.entries.at(-1)?.after ?? { day: history.initial.world.day, nextEventId: history.initial.world.nextEventId, hash: history.initial.hash };
  if (world.day !== tail.day || world.nextEventId !== tail.nextEventId || await hashWorld(world) !== tail.hash) throw new Error('当前快照与历史末态不一致，原记录未修改。');
}
async function encodeRecord(record: HistoryRecord): Promise<Envelope> {
  const snapshot = structuredClone(record);
  await validateRecord(snapshot, snapshot.storageId);
  return { format: 'lieguoji-history-record', version: 1, checksum: await digest(snapshot), record: snapshot };
}
async function decodeRecord(raw: unknown, storageId: string): Promise<HistoryRecord> {
  guardEnvelope(raw);
  const snapshot: unknown = structuredClone(raw);
  if (!isObject(snapshot) || !exact(snapshot, ['format', 'version', 'checksum', 'record']) || snapshot.format !== 'lieguoji-history-record' || snapshot.version !== 1 || typeof snapshot.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.checksum) || !isObject(snapshot.record)) throw new Error('历史存档封装损坏，原记录已保留。');
  const record = snapshot.record as HistoryRecord;
  if (snapshot.checksum !== await digest(record)) throw new Error('历史存档校验和不匹配，原记录已保留。');
  await validateRecord(record, storageId); return record;
}
function hasReadOnlyRecord(raw: unknown): boolean {
  return isObject(raw) && isObject(raw.record) && raw.record.readOnly === true;
}

export async function readHistoryRun(storageId: string): Promise<{ record: HistoryRecord | null; revision: number; recovery: boolean; bytes: number }> {
  requireId(storageId);
  const db = await open(false);
  if (!db) return { record: null, revision: 0, recovery: false, bytes: 0 };
  try {
    const raw = await readRaw(db, storageId), slots = checkedSlots(raw.slots), total = checkedUsage(raw.usage, raw.count);
    if (total < slotBytes(slots)) throw new Error('历史容量计数损坏，已保留原记录。');
    if (!slots) return { record: null, revision: 0, recovery: false, bytes: total };
    try { return { record: await decodeRecord(slots.current, storageId), revision: slots.revision, recovery: false, bytes: total }; }
    catch (error) {
      if (slots.backup === null || slots.backup === undefined) throw error;
      return { record: await decodeRecord(slots.backup, storageId), revision: slots.revision, recovery: true, bytes: total };
    }
  } finally { db.close(); }
}

export async function writeHistoryRun(storageId: string, candidate: { world: World; history: HistoryLog; readOnly: boolean }, expectedRevision: number): Promise<{ revision: number; bytes: number }> {
  requireId(storageId); revision(expectedRevision, true);
  // Snapshot all inputs together before the first asynchronous hash or database access.
  const snapshot = structuredClone(candidate);
  if (snapshot.readOnly && expectedRevision !== 0) throw new Error('只读历史记录不能修改，请创建独立分支。');
  const envelope = await encodeRecord({ ...snapshot, storageId });
  const db = await open(true);
  if (!db) throw failure();
  try {
    const before = await readRaw(db, storageId), previous = checkedSlots(before.slots);
    checkedUsage(before.usage, before.count);
    if (previous && (hasReadOnlyRecord(previous.current) || hasReadOnlyRecord(previous.backup))) throw new Error('只读历史记录不能修改，请创建独立分支。');
    let backup: unknown = previous?.backup ?? null;
    if (previous) {
      try { await decodeRecord(previous.current, storageId); backup = previous.current; }
      catch { /* A corrupt current is never promoted over the earlier backup. */ }
    }
    const next: Slots = { format: 'lieguoji-history-slots', version: 1, current: envelope, backup, revision: expectedRevision + 1 };
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['runs', 'meta'], 'readwrite'), runs = tx.objectStore('runs'), meta = tx.objectStore('meta');
      const actual = runs.get(storageId), usage = meta.get('usage'), count = runs.count();
      let rejected: Error | null = null, total = 0;
      count.onsuccess = () => {
        try {
          const stored = checkedSlots(actual.result), currentBytes = checkedUsage(usage.result, count.result);
          if ((stored?.revision ?? 0) !== expectedRevision || JSON.stringify(actual.result) !== JSON.stringify(before.slots)) throw new Error('另一窗口已更新历史，本次未覆盖。请导出当前记录后刷新。');
          if (stored && (hasReadOnlyRecord(stored.current) || hasReadOnlyRecord(stored.backup))) throw new Error('只读历史记录不能修改，请创建独立分支。');
          const oldBytes = slotBytes(stored);
          if (currentBytes < oldBytes) throw new Error('历史容量计数损坏，原记录已保留。');
          total = currentBytes - oldBytes + slotBytes(next);
          if (!Number.isSafeInteger(total) || total > MAX_HISTORY_STORAGE_BYTES) throw new Error('历史本地存储已达 200 MiB 上限，本次未保存，原记录及备份已保留。请先导出备份。');
          runs.put(next, storageId);
          meta.put({ format: 'lieguoji-history-usage', version: 1, bytes: total } satisfies Usage, 'usage');
        } catch (error) { rejected = error instanceof Error ? error : failure(); tx.abort(); }
      };
      tx.oncomplete = () => resolve({ revision: expectedRevision + 1, bytes: total });
      tx.onerror = () => reject(rejected ?? failure()); tx.onabort = () => reject(rejected ?? failure());
    });
  } finally { db.close(); }
}

export async function encodeHistoryFile(history: HistoryLog): Promise<HistoryFile> {
  const snapshot = structuredClone(history); guardHistory(snapshot);
  await verifyHistoryIntegrity(snapshot);
  const envelope: HistoryFile = { format: 'lieguoji-history-export', version: 1, checksum: await digest(snapshot), history: snapshot };
  if (bytes(envelope) > FILE_LIMIT) throw new Error('历史文件超过 20 MiB 限制，尚未导出。');
  return envelope;
}
export async function decodeHistoryFile(raw: unknown): Promise<HistoryLog> {
  if (isObject(raw)) { if ('version' in raw && raw.version !== 1) throw lockedVersion(); guardHistory(raw.history); }
  const snapshot: unknown = structuredClone(raw);
  if (!isObject(snapshot) || !exact(snapshot, ['format', 'version', 'checksum', 'history']) || snapshot.format !== 'lieguoji-history-export' || snapshot.version !== 1 || typeof snapshot.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.checksum) || bytes(snapshot) > FILE_LIMIT) throw new Error('历史文件封装、大小或版本无效，原记录未修改。');
  if (snapshot.checksum !== await digest(snapshot.history)) throw new Error('历史文件校验和不匹配，原记录未修改。');
  if (!validateHistory(snapshot.history)) throw new Error('历史记录结构或大小无效，原记录未修改。');
  await verifyHistoryIntegrity(snapshot.history); return snapshot.history;
}
export async function parseHistoryFile(file: File): Promise<HistoryLog> {
  if (file.size > FILE_LIMIT) throw new Error('历史文件超过 20 MiB 限制，未导入。');
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('文件不是有效的 JSON 历史记录。'); }
  return decodeHistoryFile(raw);
}
