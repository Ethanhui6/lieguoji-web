import type { AtlasDocument } from '../atlas-format';
import { decodeCountryGeography, validateCountrySource, type CountryGeographyRecord, type CountrySource } from './geography';
import { COUNTRY_DATABASE, COUNTRY_LIMITS, CountryFutureVersionError, countryArray, countryDigest, countryExact, countryHash, countryId, countryInteger, countryJsonBytes, countryName,
  decodeCountryDocument, encodeCountryDocument, type CountryDocument, type CountryListEntry, type CountryState } from './model';

export interface CountryBlob { bytes: Uint8Array; digest: string }
interface StoredWorld { format: 'lieguoji-country-root'; version: 1; worldId: string; current: CountryBlob; backup: CountryBlob | null; undo: CountryBlob[]; lastCommandId: string; rootDigest: string }
interface Receipt { worldId: string; commandId: string; requestDigest: string; revision: number; rootDigest: string }
function validReceipt(raw: unknown): raw is Receipt { return countryExact(raw, ['worldId', 'commandId', 'requestDigest', 'revision', 'rootDigest']) && countryId(raw.worldId, 'country')
  && countryId(raw.commandId, 'command') && countryHash(raw.requestDigest) && countryInteger(raw.revision, 0, Number.MAX_SAFE_INTEGER) && countryHash(raw.rootDigest); }
const stores = ['worlds', 'geography', 'receipts'];
const sameSource = (a: CountrySource, b: CountrySource) => a.draftId === b.draftId && a.revision === b.revision && a.rootDigest === b.rootDigest && a.manifestDigest === b.manifestDigest && a.atlasFormat === b.atlasFormat;
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; reject(error); } };
    const request = indexedDB.open(COUNTRY_DATABASE, 1);
    request.onupgradeneeded = event => { if (settled || event.oldVersion !== 0) { request.transaction!.abort(); return; } for (const name of stores) request.result.createObjectStore(name); };
    request.onerror = () => fail(request.error?.name === 'VersionError' ? new CountryFutureVersionError() : request.error ?? new Error('无法打开国家世界存储。'));
    request.onblocked = () => fail(new Error('国家世界存储被另一标签占用，请关闭旧页面后重试。'));
    request.onsuccess = () => { const db = request.result; if (settled) { db.close(); return; } db.onversionchange = () => db.close(); if (db.version !== 1 || stores.some(name => !db.objectStoreNames.contains(name))) { db.close(); fail(new CountryFutureVersionError()); } else { settled = true; resolve(db); } };
  });
}
async function getRaw(store: string, key: string): Promise<unknown> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error ?? new Error('读取国家世界失败。')); }); }
  finally { db.close(); }
}
export async function hasCountryWorldV1(worldId: string): Promise<boolean> { return await getRaw('worlds', worldId) !== undefined; }
export async function readCountryGeographyRecordV1(worldId: string): Promise<CountryGeographyRecord> {
  const state = await openCountryWorld(worldId), raw = await getRaw('geography', worldId);
  await decodeCountryGeography(raw);
  if (!sameSource((raw as CountryGeographyRecord).source, state.document.source)) throw new Error('国家世界地理副本与实体来源不一致。');
  return raw as CountryGeographyRecord;
}
function validBlob(raw: unknown): raw is CountryBlob { return countryExact(raw, ['bytes', 'digest']) && raw.bytes instanceof Uint8Array && Object.getPrototypeOf(raw.bytes) === Uint8Array.prototype && raw.bytes.buffer instanceof ArrayBuffer && raw.bytes.length <= COUNTRY_LIMITS.documentBytes && countryHash(raw.digest); }
function rootShape(raw: unknown): raw is StoredWorld {
  if (raw && typeof raw === 'object' && (raw as { version?: number }).version !== 1) throw new CountryFutureVersionError();
  return countryExact(raw, ['format', 'version', 'worldId', 'current', 'backup', 'undo', 'lastCommandId', 'rootDigest']) && raw.format === 'lieguoji-country-root' && raw.version === 1
    && countryId(raw.worldId, 'country') && validBlob(raw.current) && (raw.backup === null || validBlob(raw.backup)) && countryArray(raw.undo, COUNTRY_LIMITS.undoEntries)
    && raw.undo.every(validBlob) && raw.undo.reduce((sum, blob) => sum + blob.bytes.length, 0) <= COUNTRY_LIMITS.undoBytes && countryId(raw.lastCommandId, 'command') && countryHash(raw.rootDigest);
}
const rootMetadata = (root: Omit<StoredWorld, 'rootDigest'> | StoredWorld) => ({ format: root.format, version: root.version, worldId: root.worldId,
  current: { digest: root.current.digest, size: root.current.bytes.length }, backup: root.backup ? { digest: root.backup.digest, size: root.backup.bytes.length } : null,
  undo: root.undo.map(blob => ({ digest: blob.digest, size: blob.bytes.length })), lastCommandId: root.lastCommandId });
async function makeRoot(input: Omit<StoredWorld, 'rootDigest'>): Promise<StoredWorld> { return { ...input, rootDigest: await countryDigest(countryJsonBytes(rootMetadata(input))) }; }
async function makeBlob(document: CountryDocument): Promise<CountryBlob> { const bytes = encodeCountryDocument(document); return { bytes, digest: await countryDigest(bytes) }; }
async function documentFrom(blob: CountryBlob, worldId: string): Promise<CountryDocument> {
  // A well-formed future document is never silently downgraded to its backup.
  const document = decodeCountryDocument(blob.bytes);
  if (await countryDigest(blob.bytes) !== blob.digest || document.worldId !== worldId) throw new Error('国家世界校验和或身份不一致。');
  return document;
}
async function interpret(raw: unknown, worldId: string): Promise<{ state: CountryState; root: StoredWorld }> {
  if (!raw) throw new Error('未找到这个国家世界。');
  if (!rootShape(raw) || raw.worldId !== worldId) throw new Error('国家世界根格式或历史容量损坏，未覆盖任何数据。');
  try {
    const document = await documentFrom(raw.current, worldId);
    if (raw.rootDigest !== await countryDigest(countryJsonBytes(rootMetadata(raw)))) throw new Error('国家世界根摘要不一致。');
    const history = [...(raw.backup ? [raw.backup] : []), ...raw.undo];
    for (const blob of history) { const previous = await documentFrom(blob, worldId); if (!sameSource(previous.source, document.source) || previous.revision >= document.revision) throw new Error('国家历史来源或修订不一致。'); }
    return { state: { document, rootDigest: raw.rootDigest, readOnly: false, recovered: false, undoCount: raw.undo.length }, root: raw };
  } catch (error) {
    if (error instanceof CountryFutureVersionError) throw error;
    if (!raw.backup) throw new Error('国家世界当前记录损坏且没有有效备份，未覆盖原始数据。', { cause: error });
    const document = await documentFrom(raw.backup, worldId);
    return { state: { document, rootDigest: raw.rootDigest, readOnly: true, recovered: true, undoCount: 0 }, root: raw };
  }
}
export async function openCountryWorld(worldId: string): Promise<CountryState> {
  if (!countryId(worldId, 'country')) throw new Error('国家世界 ID 无效。');
  return (await interpret(await getRaw('worlds', worldId), worldId)).state;
}
export async function listCountryWorlds(): Promise<CountryListEntry[]> {
  const db = await database(); let entries: { key: IDBValidKey; raw: unknown }[];
  try { entries = await new Promise((resolve, reject) => { const tx = db.transaction('worlds', 'readonly'), store = tx.objectStore('worlds'), keys = store.getAllKeys(), rows = store.getAll(); tx.oncomplete = () => resolve(keys.result.map((key, i) => ({ key, raw: rows.result[i] }))); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
  const result: CountryListEntry[] = [];
  for (const entry of entries) {
    if (!countryId(entry.key, 'country')) continue;
    try { const { state } = await interpret(entry.raw, entry.key), d = state.document; result.push({ worldId: d.worldId, name: d.name, revision: d.revision, readOnly: state.readOnly, recovered: state.recovered, nationCount: d.nations.length, cityCount: d.cities.length }); }
    catch { /* Invalid/future records remain untouched and may still be opened explicitly for their diagnostic. */ }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name) || a.worldId.localeCompare(b.worldId));
}
export async function readCountryGeography(worldId: string): Promise<AtlasDocument> {
  const state = await openCountryWorld(worldId), raw = await getRaw('geography', worldId);
  const data = await decodeCountryGeography(raw);
  const record = raw as CountryGeographyRecord;
  if (!sameSource(record.source, state.document.source)) throw new Error('国家世界地理副本与实体来源不一致。');
  return data;
}
export async function createCountryWorld(record: CountryGeographyRecord, name: string, signal?: AbortSignal): Promise<CountryState> {
  // Own the exact bytes that will be saved before the first await. The decoder
  // also owns its validation input, so saving the caller's record would create
  // a check/use gap even though decoding itself is safe.
  const owned = structuredClone(record);
  if (!countryName(name) || !validateCountrySource(owned.source)) throw new Error('建国草稿名称或来源无效。');
  signal?.throwIfAborted(); await decodeCountryGeography(owned, { signal }); signal?.throwIfAborted();
  const worldId = `country-${crypto.randomUUID()}`, commandId = `command-${crypto.randomUUID()}`;
  const document: CountryDocument = { format: 'lieguoji-country-document', version: 1, worldId, name, source: { ...owned.source }, revision: 0, nations: [], regimes: [], territories: [], cities: [] };
  const current = await makeBlob(document), root = await makeRoot({ format: 'lieguoji-country-root', version: 1, worldId, current, backup: null, undo: [], lastCommandId: commandId });
  signal?.throwIfAborted(); const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['worlds', 'geography'], 'readwrite'), stop = () => { try { tx.abort(); } catch { /* Already committed. */ } }; signal?.addEventListener('abort', stop, { once: true });
    tx.oncomplete = () => { signal?.removeEventListener('abort', stop); resolve(); };
    tx.onabort = () => { signal?.removeEventListener('abort', stop); reject(signal?.aborted ? signal.reason : tx.error ?? new Error('建国副本未能保存。')); };
    if (signal?.aborted) { stop(); return; }
    tx.objectStore('geography').add(owned, worldId); tx.objectStore('worlds').add(root, worldId);
  }); } finally { db.close(); }
  return { document, rootDigest: root.rootDigest, readOnly: false, recovered: false, undoCount: 0 };
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((byte, i) => byte === b[i]); }
function unchangedRoot(a: unknown, b: StoredWorld): boolean {
  if (!rootShape(a) || a.rootDigest !== b.rootDigest || JSON.stringify(rootMetadata(a)) !== JSON.stringify(rootMetadata(b))) return false;
  return sameBytes(a.current.bytes, b.current.bytes) && (a.backup === null ? b.backup === null : b.backup !== null && sameBytes(a.backup.bytes, b.backup.bytes))
    && a.undo.every((blob, i) => sameBytes(blob.bytes, b.undo[i].bytes));
}
function boundedUndo(input: CountryBlob[]): CountryBlob[] {
  const result = input.slice(-COUNTRY_LIMITS.undoEntries); let bytes = result.reduce((sum, row) => sum + row.bytes.length, 0);
  while (bytes > COUNTRY_LIMITS.undoBytes && result.length) bytes -= result.shift()!.bytes.length;
  return result;
}
export async function countryUndoDocument(state: CountryState): Promise<CountryDocument> {
  if (state.readOnly) throw new Error('恢复备份保持只读，不能撤销或覆盖主档。');
  const { state: actual, root } = await interpret(await getRaw('worlds', state.document.worldId), state.document.worldId);
  if (actual.readOnly || actual.rootDigest !== state.rootDigest || actual.document.revision !== state.document.revision) throw new Error('国家世界已被另一标签修改，请重新打开。');
  const previous = root.undo.at(-1); if (!previous) throw new Error('没有可撤销的国家编辑。');
  const document = await documentFrom(previous, state.document.worldId); document.revision = state.document.revision + 1; return document;
}
/** The geography store is immutable after creation. Only this political root
 * and its command receipt change together; no source Atlas database is read. */
export async function commitCountryWorld(expected: CountryState, next: CountryDocument, commandId: string, requestDigest: string, undo = false, signal?: AbortSignal): Promise<CountryState> {
  expected = structuredClone(expected); next = structuredClone(next);
  if (expected.readOnly || !countryId(commandId, 'command') || !countryHash(requestDigest)) throw new Error('国家提交身份无效或来源只读。');
  signal?.throwIfAborted();
  const worldId = expected.document.worldId, receiptKey = `${worldId}:${commandId}`;
  const { state: actual, root: before } = await interpret(await getRaw('worlds', worldId), worldId);
  if (actual.readOnly) throw new Error('当前世界只能只读恢复，禁止覆盖。');
  const existing = await getRaw('receipts', receiptKey);
  if (existing) {
    if (!validReceipt(existing) || existing.worldId !== worldId || existing.commandId !== commandId || existing.requestDigest !== requestDigest) throw new Error('命令 ID 已绑定其他国家操作。');
    return actual;
  }
  if (actual.rootDigest !== expected.rootDigest || actual.document.revision !== expected.document.revision) throw new Error('国家世界已被另一标签修改，请重新打开。');
  if (next.worldId !== worldId || next.revision !== actual.document.revision + 1 || next.name !== actual.document.name || !sameSource(next.source, actual.document.source)) throw new Error('国家候选修改了固定身份、来源或修订。');
  if (undo) {
    const target = await countryUndoDocument(actual);
    if (await countryDigest(encodeCountryDocument(target)) !== await countryDigest(encodeCountryDocument(next))) throw new Error('撤销候选不符合真实历史。');
  }
  const current = await makeBlob(next), root = await makeRoot({ format: 'lieguoji-country-root', version: 1, worldId, current, backup: before.current,
    undo: undo ? before.undo.slice(0, -1) : boundedUndo([...before.undo, before.current]), lastCommandId: commandId });
  const receipt: Receipt = { worldId, commandId, requestDigest, revision: next.revision, rootDigest: root.rootDigest };
  signal?.throwIfAborted(); const db = await database(); let replayed = false;
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['worlds', 'receipts'], 'readwrite'), store = tx.objectStore('worlds'), check = store.get(worldId), receiptCheck = tx.objectStore('receipts').get(receiptKey);
    let failure: unknown; const stop = () => { try { tx.abort(); } catch { /* Already committed. */ } }; signal?.addEventListener('abort', stop, { once: true });
    tx.oncomplete = () => { signal?.removeEventListener('abort', stop); resolve(); };
    tx.onabort = () => { signal?.removeEventListener('abort', stop); reject(failure ?? (signal?.aborted ? signal.reason : tx.error) ?? new Error('国家编辑事务未完成。')); };
    receiptCheck.onsuccess = () => {
      try {
        signal?.throwIfAborted();
        if (receiptCheck.result !== undefined) {
          const receipt = receiptCheck.result as unknown;
          if (!validReceipt(receipt) || receipt.worldId !== worldId || receipt.commandId !== commandId || receipt.requestDigest !== requestDigest) throw new Error('命令 ID 已绑定其他国家操作。');
          replayed = true; return;
        }
        if (!unchangedRoot(check.result, before)) throw new Error('国家世界提交冲突，请重新打开后预览。');
        store.put(root, worldId); tx.objectStore('receipts').add(receipt, receiptKey);
      } catch (error) { failure = error; stop(); }
    };
  }); } finally { db.close(); }
  if (replayed) return openCountryWorld(worldId);
  return { document: structuredClone(next), rootDigest: root.rootDigest, readOnly: false, recovered: false, undoCount: root.undo.length };
}
