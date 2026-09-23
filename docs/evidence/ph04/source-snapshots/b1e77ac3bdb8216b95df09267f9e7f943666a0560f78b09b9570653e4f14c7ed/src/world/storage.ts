import { blockKey, decodeBlock, decodeManifest, encodeBlock, encodeManifest, validateAtlasDraft, validateManifest, type AtlasBlock, type AtlasDraftData, type AtlasDraftManifest } from './model';
import type { AtlasBlockPage, AtlasCatalogEntry, AtlasCommitReceipt, AtlasPreparation, AtlasPrepareRequest, AtlasReadHandle, AtlasStorageControl, AtlasStoredRoot } from './storage-types';
export type * from './storage-types';

export const ATLAS_DRAFTS_DB = 'lieguoji-atlas-drafts-v1';
export const ATLAS_STORAGE_LIMIT = 128 * 1024 * 1024;
export const ATLAS_STORAGE_PAGE_BYTES = 512 * 1024;
const DOMAIN = 'atlas-draft-v1', VERSION = 1;
const STORES = ['blocks', 'manifests', 'roots', 'preparations', 'receipts', 'meta'] as const;
type Store = typeof STORES[number];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const HASH = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
type BlobRecord = { format: 'lieguoji-atlas-blob'; version: 1; domain: typeof DOMAIN; kind: 'block' | 'manifest'; digest: string; bytes: Uint8Array };
type PrepRecord = AtlasPreparation & { format: 'lieguoji-atlas-preparation'; version: 1; domain: typeof DOMAIN; expectedRoot: AtlasStoredRoot | null };
type ReceiptRecord = AtlasCommitReceipt & { format: 'lieguoji-atlas-receipt'; version: 1; domain: typeof DOMAIN };
type Usage = { format: 'lieguoji-atlas-usage'; version: 1; domain: typeof DOMAIN; bytes: number; blocks: number; manifests: number; roots: number; preparations: number; receipts: number };
type Slot = { present: boolean; value: unknown };
type Query = { store: Store; key: string };
type Snapshot = Query & Slot;
type Write = Query & { value: unknown };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => record(v) && Reflect.ownKeys(v).length === keys.length && keys.every(key => { const d = Object.getOwnPropertyDescriptor(v, key); return d?.enumerable && 'value' in d; });
const safeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function checkId(id: string) { if (typeof id !== 'string' || !new RegExp(`^atlas-${UUID}$`).test(id)) throw new Error('Atlas 草稿标识无效，未访问其他数据库。'); }
function checkCommand(id: string) { if (typeof id !== 'string' || !new RegExp(`^edit-${UUID}$`).test(id)) throw new Error('Atlas commandId 无效。'); }
function checkPreparation(id: string) { if (typeof id !== 'string' || !new RegExp(`^atlas-${UUID}:edit-${UUID}$`).test(id)) throw new Error('Atlas 准备标识无效。'); }
function abort(control?: AtlasStorageControl) { control?.signal?.throwIfAborted(); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Uint8Array || b instanceof Uint8Array) return a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i]);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
async function hash(bytes: Uint8Array) {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(result)].map(n => n.toString(16).padStart(2, '0')).join('');
}
const rootKeys = ['format', 'version', 'domain', 'draftId', 'revision', 'currentManifest', 'backupManifest', 'lastCommitId', 'rootDigest'];
export function validateAtlasRoot(raw: unknown): raw is AtlasStoredRoot {
  try {
    if (!exact(raw, rootKeys) || raw.format !== 'lieguoji-atlas-root' || raw.version !== 1 || raw.domain !== DOMAIN || !safeInt(raw.revision) || typeof raw.currentManifest !== 'string' || !HASH.test(raw.currentManifest) || raw.backupManifest !== null && (typeof raw.backupManifest !== 'string' || !HASH.test(raw.backupManifest)) || typeof raw.rootDigest !== 'string' || !HASH.test(raw.rootDigest)) return false;
    checkId(raw.draftId as string); checkCommand(raw.lastCommitId as string); return true;
  } catch { return false; }
}
export function encodeAtlasRoot(root: AtlasStoredRoot): Uint8Array {
  if (!validateAtlasRoot(root)) throw new Error('Atlas 根格式、领域或版本不兼容，原始主备已保护。');
  return encoder.encode(canonical(root));
}
export function hashAtlasRoot(root: AtlasStoredRoot): Promise<string> {
  if (!validateAtlasRoot(root)) throw new Error('Atlas 根格式、领域或版本不兼容，原始主备已保护。');
  const body: Record<string, unknown> = { ...root }; delete body.rootDigest;
  return hash(encoder.encode(canonical(body)));
}
export async function verifyAtlasRoot(root: AtlasStoredRoot) {
  if (await hashAtlasRoot(root) !== root.rootDigest) throw new Error('Atlas 整条根摘要不符，原始主备已保护。');
}
function decodeRoot(raw: unknown): AtlasStoredRoot {
  if (!(raw instanceof Uint8Array) || !(raw.buffer instanceof ArrayBuffer) || raw.byteLength > 4096) throw new Error('Atlas 原始根类型或版本不兼容。');
  let root: unknown; try { root = JSON.parse(decoder.decode(raw)); } catch { throw new Error('Atlas 原始根损坏，未静默重建。'); }
  if (!validateAtlasRoot(root) || !equal(encodeAtlasRoot(root), raw)) throw new Error('Atlas 根格式、领域或版本不兼容，原始主备已保护。');
  return root;
}

/** Logical quota: UTF-8 keys/strings, 8-byte numbers, one-byte booleans/null,
 * raw Uint8Array bytes, plus recursively counted metadata. Not physical disk. */
export function atlasStorageLogicalBytes(value: unknown): number {
  if (value === null) return 1;
  if (typeof value === 'string') return encoder.encode(value).length;
  if (typeof value === 'number' && Number.isFinite(value)) return 8;
  if (typeof value === 'boolean') return 1;
  if (value instanceof Uint8Array && value.buffer instanceof ArrayBuffer) return value.byteLength;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + atlasStorageLogicalBytes(item), 0);
  if (record(value)) return Object.entries(value).reduce((sum, [key, item]) => sum + encoder.encode(key).length + atlasStorageLogicalBytes(item), 0);
  throw new Error('Atlas 容量记录含未知数据，已停止写入。');
}
const entryBytes = (key: string, value: unknown) => encoder.encode(key).length + atlasStorageLogicalBytes(value);
function initialUsage(): Usage {
  const usage: Usage = { format: 'lieguoji-atlas-usage', version: 1, domain: DOMAIN, bytes: 0, blocks: 0, manifests: 0, roots: 0, preparations: 0, receipts: 0 };
  usage.bytes = entryBytes('usage', usage); return usage;
}
function usageRecord(raw: unknown): Usage {
  if (!exact(raw, ['format', 'version', 'domain', 'bytes', 'blocks', 'manifests', 'roots', 'preparations', 'receipts']) || raw.format !== 'lieguoji-atlas-usage' || raw.version !== 1 || raw.domain !== DOMAIN || !['bytes', 'blocks', 'manifests', 'roots', 'preparations', 'receipts'].every(key => safeInt(raw[key])) || (raw.bytes as number) < entryBytes('usage', raw) || (raw.bytes as number) > ATLAS_STORAGE_LIMIT) throw new Error('Atlas 容量账或版本无效，原数据保留。');
  return raw as unknown as Usage;
}
function openDatabase(create: boolean, rawRead = false): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false, settled = false; const request = rawRead ? indexedDB.open(ATLAS_DRAFTS_DB) : indexedDB.open(ATLAS_DRAFTS_DB, VERSION);
    request.onupgradeneeded = event => {
      if (!create || settled || event.oldVersion !== 0) { absent = !create && event.oldVersion === 0 && !settled; request.transaction!.abort(); return; }
      for (const name of STORES) request.result.createObjectStore(name);
      request.transaction!.objectStore('meta').put(initialUsage(), 'usage');
    };
    request.onerror = () => { if (settled) return; settled = true; if (absent) resolve(null); else reject(new Error('Atlas 独立库无法打开；未知版本或存储错误，未升级或重建。', { cause: request.error })); };
    request.onblocked = () => { settled = true; reject(new Error('Atlas 独立库被另一窗口阻塞，未修改原数据。')); };
    request.onsuccess = () => {
      const db = request.result; if (settled) { db.close(); return; } settled = true;
      if (!rawRead && (db.version !== 1 || db.objectStoreNames.length !== STORES.length || STORES.some(name => !db.objectStoreNames.contains(name)))) { db.close(); reject(new Error('Atlas 数据库目录或版本不兼容。')); return; }
      db.onversionchange = () => db.close(); resolve(db);
    };
  });
}
function queryKey(query: Query) { return `${query.store}/${query.key}`; }
function uniqueQueries(queries: Query[]) { return [...new Map(queries.map(query => [queryKey(query), query])).values()]; }
const snapshotMaps = new WeakMap<Snapshot[], { length: number; map: Map<string, Snapshot> }>();
function get(snapshots: Snapshot[], store: Store, key: string): Snapshot {
  let cached = snapshotMaps.get(snapshots);
  if (!cached || cached.length !== snapshots.length) { cached = { length: snapshots.length, map: new Map(snapshots.map(row => [queryKey(row), row])) }; snapshotMaps.set(snapshots, cached); }
  const value = cached.map.get(`${store}/${key}`); if (!value) throw new Error('Atlas 内部事务缺少固定读取。'); return value;
}
function transact<T>(db: IDBDatabase, mode: IDBTransactionMode, queries: Query[], body: (tx: IDBTransaction, rows: Snapshot[]) => T, control?: AtlasStorageControl): Promise<T> {
  abort(control);
  return new Promise((resolve, reject) => {
    const distinct = uniqueQueries(queries), tx = db.transaction(mode === 'readwrite' ? [...STORES] : [...new Set(distinct.map(q => q.store))], mode);
    const rows: Snapshot[] = distinct.map(q => ({ ...q, present: false, value: undefined })); let pending = rows.length * 2, result: T, failure: unknown;
    const cancel = () => { try { failure = control?.signal?.reason ?? new DOMException('Atlas 提交已取消。', 'AbortError'); tx.abort(); } catch { /* Already completed: report the real completion event. */ } };
    control?.signal?.addEventListener('abort', cancel, { once: true });
    const clean = () => control?.signal?.removeEventListener('abort', cancel);
    const done = () => { if (--pending !== 0) return; try { abort(control); result = body(tx, rows); } catch (error) { failure = error; tx.abort(); } };
    for (const row of rows) {
      const store = tx.objectStore(row.store), value = store.get(row.key), key = store.getKey(row.key);
      value.onsuccess = () => { row.value = value.result; done(); }; key.onsuccess = () => { row.present = key.result !== undefined; done(); };
    }
    tx.oncomplete = () => { clean(); resolve(result!); }; tx.onabort = () => { clean(); reject(failure ?? tx.error ?? new Error('Atlas 事务中断；没有提交主备。')); }; tx.onerror = () => { /* onabort is the authoritative failure boundary. */ };
  });
}
async function read(db: IDBDatabase, queries: Query[]) { return transact(db, 'readonly', queries, (_tx, rows) => rows); }
function assertUnchanged(expected: Snapshot[], actual: Snapshot[]) {
  for (const row of expected) { const next = get(actual, row.store, row.key); if (row.present !== next.present || !equal(row.value, next.value)) throw new Error('Atlas 完整根、主备或引用原像已变化，CAS 冲突，未覆盖。'); }
}
function applyWrites(tx: IDBTransaction, rows: Snapshot[], writes: Write[]) {
  const stored = get(rows, 'meta', 'usage'); if (!stored.present) throw new Error('Atlas 容量账缺失。');
  const usage = { ...usageRecord(stored.value) };
  for (const write of writes) {
    if (write.store === 'meta') throw new Error('容量账必须由事务维护。');
    const before = get(rows, write.store, write.key);
    usage.bytes += entryBytes(write.key, write.value) - (before.present ? entryBytes(write.key, before.value) : 0);
    if (!before.present) usage[write.store]++;
  }
  if (!Number.isSafeInteger(usage.bytes) || usage.bytes > ATLAS_STORAGE_LIMIT) throw new Error('Atlas 已达到 128 MiB 逻辑容量上限；主备保留，未自动清理内容。');
  for (const write of writes) tx.objectStore(write.store).put(write.value, write.key);
  tx.objectStore('meta').put(usage, 'usage'); return usage;
}
function blob(raw: unknown, kind: BlobRecord['kind'], digest: string): BlobRecord {
  if (!exact(raw, ['format', 'version', 'domain', 'kind', 'digest', 'bytes']) || raw.format !== 'lieguoji-atlas-blob' || raw.version !== 1 || raw.domain !== DOMAIN || raw.kind !== kind || raw.digest !== digest || !HASH.test(digest) || !(raw.bytes instanceof Uint8Array) || !(raw.bytes.buffer instanceof ArrayBuffer)) throw new Error('Atlas 不可变内容的领域、版本或元数据不兼容。');
  return raw as unknown as BlobRecord;
}
function assertCodec(record: BlobRecord) {
  if (record.kind === 'manifest') {
    let value: unknown; try { value = JSON.parse(decoder.decode(record.bytes)); } catch { throw new Error('Atlas manifest 编码损坏，原数据保留。'); }
    if (!record || !validateManifest(value)) throw new Error('Atlas manifest 格式、领域或未来版本不兼容。');
  } else {
    const b = record.bytes;
    if (b.length < 16 || b[0] !== 76 || b[1] !== 71 || b[2] !== 65 || b[3] !== 66 || b[4] !== 1 || b[5] !== 0 || b[6] > 3 || b[7] !== (b[6] === 0 ? 2 : 1) || b[12] || b[13] || b[14] || b[15]) throw new Error('Atlas 地理块领域或 codec 未来版本不兼容。');
  }
}
async function verifiedManifest(row: Snapshot): Promise<AtlasDraftManifest> {
  if (!row.present) throw new Error('Atlas 固定 manifest 缺失，未创建替代世界。');
  const value = blob(row.value, 'manifest', row.key); assertCodec(value);
  const manifest = decodeManifest(value.bytes); if (await hash(value.bytes) !== row.key) throw new Error('Atlas manifest 内容摘要不符。'); return manifest;
}
async function readContent(db: IDBDatabase, manifest: AtlasDraftManifest, control?: AtlasStorageControl) {
  const rows: Snapshot[] = [], blocks = new Map<string, AtlasBlock>(); let referencedBytes = encodeManifest(manifest).length;
  // Fixed manifest and bounded batches; never follow a newer root during reads.
  for (let start = 0; start < manifest.blockRefs.length; start += 16) {
    abort(control); const refs = manifest.blockRefs.slice(start, start + 16), page = await read(db, refs.map(ref => ({ store: 'blocks', key: ref.hash })));
    for (const ref of refs) {
      const row = get(page, 'blocks', ref.hash); if (!row.present) throw new Error('Atlas 固定版本引用缺块，未回退或创建世界。');
      const stored = blob(row.value, 'block', ref.hash); assertCodec(stored);
      if (await hash(stored.bytes) !== ref.hash) throw new Error('Atlas 不可变块内容摘要不符。');
      const decoded = decodeBlock(stored.bytes, manifest.spec); if (blockKey(decoded.layer, decoded.bx, decoded.by) !== ref.key) throw new Error('Atlas 内容块身份与 manifest 不符。');
      blocks.set(ref.key, decoded); referencedBytes += stored.bytes.length;
    }
    rows.push(...page);
  }
  const data: AtlasDraftData = { manifest, blocks: blocks as AtlasDraftData['blocks'] };
  if (!validateAtlasDraft(data)) throw new Error('Atlas 已存草稿的几何、目录或成员引用无效。'); abort(control);
  return { data, rows, referencedBytes };
}
async function readRoot(db: IDBDatabase, draftId: string) {
  const [row] = await read(db, [{ store: 'roots', key: draftId }]);
  if (!row.present) return { row, root: null };
  const root = decodeRoot(row.value); if (root.draftId !== draftId) throw new Error('Atlas 根身份不符。'); await verifyAtlasRoot(root); return { row, root };
}
async function rootContents(db: IDBDatabase, root: AtlasStoredRoot, control?: AtlasStorageControl) {
  const digests = [root.currentManifest, ...(root.backupManifest ? [root.backupManifest] : [])], manifests = await read(db, digests.map(key => ({ store: 'manifests', key })));
  const rows = [...manifests]; let pairReferencedBytes = 0;
  for (const digest of digests) {
    const manifest = await verifiedManifest(get(manifests, 'manifests', digest));
    if (manifest.draftId !== root.draftId || digest === root.currentManifest && manifest.revision !== root.revision || digest === root.backupManifest && manifest.revision >= root.revision) throw new Error('Atlas 主备身份或修订关系无效。');
    const content = await readContent(db, manifest, control); rows.push(...content.rows); pairReferencedBytes += content.referencedBytes;
  }
  return { rows: [...new Map(rows.map(row => [queryKey(row), row])).values()], pairReferencedBytes };
}
/** Stage guards compatibility and exact raw references, without repeating full
 * geometry/hash verification. Publication still independently verifies content. */
async function rootProtectionRows(db: IDBDatabase, root: AtlasStoredRoot, control?: AtlasStorageControl) {
  const digests = [root.currentManifest, ...(root.backupManifest ? [root.backupManifest] : [])], rows = await read(db, digests.map(key => ({ store: 'manifests', key })));
  for (const digest of digests) {
    const manifest = await verifiedManifest(get(rows, 'manifests', digest));
    if (manifest.draftId !== root.draftId || digest === root.currentManifest && manifest.revision !== root.revision || digest === root.backupManifest && manifest.revision >= root.revision) throw new Error('Atlas 主备身份或修订关系无效。');
    for (let start = 0; start < manifest.blockRefs.length; start += 16) {
      abort(control); const page = await read(db, manifest.blockRefs.slice(start, start + 16).map(ref => ({ store: 'blocks', key: ref.hash })));
      for (const row of page) { if (!row.present) throw new Error('Atlas 主备引用缺块，已保护。'); assertCodec(blob(row.value, 'block', row.key)); }
      rows.push(...page);
    }
  }
  return [...new Map(rows.map(row => [queryKey(row), row])).values()];
}
function preparationRecord(raw: unknown, id: string): PrepRecord {
  if (!exact(raw, ['format', 'version', 'domain', 'preparationId', 'candidateId', 'commandId', 'draftId', 'requestDigest', 'manifestDigest', 'revision', 'expectedRoot']) || raw.format !== 'lieguoji-atlas-preparation' || raw.version !== 1 || raw.domain !== DOMAIN || raw.preparationId !== id || typeof raw.candidateId !== 'string' || !new RegExp(`^${UUID}$`).test(raw.candidateId) || !safeInt(raw.revision) || typeof raw.requestDigest !== 'string' || !HASH.test(raw.requestDigest) || typeof raw.manifestDigest !== 'string' || !HASH.test(raw.manifestDigest) || raw.expectedRoot !== null && !validateAtlasRoot(raw.expectedRoot)) throw new Error('Atlas 准备记录格式、领域或版本不兼容。');
  checkId(raw.draftId as string); checkCommand(raw.commandId as string);
  if (`${raw.draftId}:${raw.commandId}` !== id) throw new Error('Atlas 准备身份不符。'); return raw as unknown as PrepRecord;
}
function publicPrep(prep: PrepRecord): AtlasPreparation { const { preparationId, candidateId, commandId, draftId, requestDigest, manifestDigest, revision } = prep; return { preparationId, candidateId, commandId, draftId, requestDigest, manifestDigest, revision }; }
async function readPreparation(db: IDBDatabase, id: string) {
  const [row] = await read(db, [{ store: 'preparations', key: id }]); if (!row.present) throw new Error('Atlas 准备记录不存在。'); return { row, prep: preparationRecord(row.value, id) };
}
function receiptRecord(raw: unknown, id: string): ReceiptRecord {
  const keys = ['format', 'version', 'domain', 'draftId', 'commandId', 'candidateId', 'requestDigest', 'revision', 'rootDigest', 'manifestDigest', 'root', 'baseRoot', 'committed', 'replayed', 'logicalBytes', 'pairReferencedBytes'];
  if (!exact(raw, keys) || raw.format !== 'lieguoji-atlas-receipt' || raw.version !== 1 || raw.domain !== DOMAIN || raw.committed !== true || raw.replayed !== false || !validateAtlasRoot(raw.root) || raw.baseRoot !== null && !validateAtlasRoot(raw.baseRoot) || typeof raw.candidateId !== 'string' || !new RegExp(`^${UUID}$`).test(raw.candidateId) || typeof raw.requestDigest !== 'string' || !HASH.test(raw.requestDigest) || !safeInt(raw.logicalBytes) || !safeInt(raw.pairReferencedBytes) || `${raw.draftId}:${raw.commandId}` !== id || raw.root.draftId !== raw.draftId || raw.root.lastCommitId !== raw.commandId || raw.root.revision !== raw.revision || raw.root.rootDigest !== raw.rootDigest || raw.root.currentManifest !== raw.manifestDigest) throw new Error('Atlas 提交回执或版本不兼容。');
  return raw as unknown as ReceiptRecord;
}
function publicReceipt(receipt: ReceiptRecord, replayed: boolean): AtlasCommitReceipt {
  const { draftId, commandId, candidateId, requestDigest, revision, rootDigest, manifestDigest, root, baseRoot, committed, logicalBytes, pairReferencedBytes } = receipt;
  return { draftId, commandId, candidateId, requestDigest, revision, rootDigest, manifestDigest, root, baseRoot, committed, replayed, logicalBytes, pairReferencedBytes };
}
async function requestDigest(prep: Pick<PrepRecord, 'candidateId' | 'commandId' | 'draftId' | 'manifestDigest' | 'expectedRoot'>) {
  return hash(encoder.encode(canonical({ candidateId: prep.candidateId, commandId: prep.commandId, draftId: prep.draftId, manifestDigest: prep.manifestDigest, expectedRoot: prep.expectedRoot })));
}
async function verifyReceipt(receipt: AtlasCommitReceipt) {
  await verifyAtlasRoot(receipt.root);
  if (receipt.baseRoot) await verifyAtlasRoot(receipt.baseRoot);
  if (receipt.baseRoot && receipt.baseRoot.draftId !== receipt.draftId || receipt.revision !== (receipt.baseRoot ? receipt.baseRoot.revision + 1 : 0) || receipt.root.backupManifest !== (receipt.baseRoot?.currentManifest ?? null)) throw new Error('Atlas 回执的前后根身份、修订或备份关系无效。');
  if (await requestDigest({ ...receipt, expectedRoot: receipt.baseRoot }) !== receipt.requestDigest) throw new Error('Atlas 回执请求摘要与前后根绑定不符。');
}

export async function prepareAtlasCommit(input: AtlasPrepareRequest, control?: AtlasStorageControl): Promise<AtlasPreparation> {
  abort(control);
  if (!exact(input, ['candidateId', 'commandId', 'manifest', 'expectedRoot']) || !validateManifest(input.manifest) || input.expectedRoot !== null && !validateAtlasRoot(input.expectedRoot) || typeof input.candidateId !== 'string' || !new RegExp(`^${UUID}$`).test(input.candidateId)) throw new Error('Atlas 准备请求无效。');
  checkCommand(input.commandId); const owned = structuredClone(input); const bytes = encodeManifest(owned.manifest); abort(control);
  if (owned.expectedRoot !== null) { await verifyAtlasRoot(owned.expectedRoot); if (owned.expectedRoot.draftId !== owned.manifest.draftId || owned.manifest.revision !== owned.expectedRoot.revision + 1) throw new Error('Atlas 候选修订必须紧接完整预期根。'); }
  else if (owned.manifest.revision !== 0) throw new Error('Atlas 新草稿必须从修订 0 创建。');
  const manifestDigest = await hash(bytes), preparationId = `${owned.manifest.draftId}:${owned.commandId}`;
  const prep: PrepRecord = { format: 'lieguoji-atlas-preparation', version: 1, domain: DOMAIN, preparationId, candidateId: owned.candidateId, commandId: owned.commandId, draftId: owned.manifest.draftId, manifestDigest, revision: owned.manifest.revision, expectedRoot: owned.expectedRoot, requestDigest: await requestDigest({ ...owned, draftId: owned.manifest.draftId, manifestDigest }) };
  const value: BlobRecord = { format: 'lieguoji-atlas-blob', version: 1, domain: DOMAIN, kind: 'manifest', digest: manifestDigest, bytes };
  abort(control); const db = await openDatabase(true); if (!db) throw new Error('Atlas 创建数据库失败。');
  try {
    abort(control); const fixed = await readRoot(db, prep.draftId), protectedRows: Snapshot[] = [fixed.row];
    if (fixed.root) protectedRows.push(...(await rootContents(db, fixed.root, control)).rows);
    const queries: Query[] = [...protectedRows, { store: 'preparations', key: preparationId }, { store: 'manifests', key: manifestDigest }, { store: 'receipts', key: preparationId }, { store: 'meta', key: 'usage' }];
    abort(control);
    return await transact(db, 'readwrite', queries, (tx, rows) => {
      const prior = get(rows, 'preparations', preparationId);
      if (prior.present) { const saved = preparationRecord(prior.value, preparationId); if (!equal(saved, prep)) throw new Error('Atlas commandId 已绑定不同候选或请求，拒绝重放。'); return publicPrep(saved); }
      assertUnchanged(protectedRows, rows);
      const actual = get(rows, 'roots', prep.draftId);
      if (actual.present !== (owned.expectedRoot !== null) || actual.present && !equal(actual.value, encodeAtlasRoot(owned.expectedRoot!))) throw new Error('Atlas 完整根 CAS 冲突，未覆盖。');
      const receipt = get(rows, 'receipts', preparationId); if (receipt.present) throw new Error('Atlas 回执存在但准备记录缺失，已保护。');
      const oldManifest = get(rows, 'manifests', manifestDigest);
      if (oldManifest.present && !equal(oldManifest.value, value)) throw new Error('Atlas 已存 manifest 摘要键对应不同原始内容，禁止覆盖。');
      const writes: Write[] = [{ store: 'preparations', key: preparationId, value: prep }]; if (!oldManifest.present) writes.push({ store: 'manifests', key: manifestDigest, value });
      applyWrites(tx, rows, writes); return publicPrep(prep);
    }, control);
  } finally { db.close(); }
}

export async function stageAtlasBlocks(preparationId: string, input: AtlasBlock[], control?: AtlasStorageControl): Promise<{ logicalBytes: number; stagedBlocks: number }> {
  checkPreparation(preparationId); abort(control);
  if (!Array.isArray(input) || input.length === 0) throw new Error('Atlas 分块提交必须包含内容。');
  const encoded = input.map(block => ({ key: blockKey(block.layer, block.bx, block.by), bytes: encodeBlock(block) }));
  if (encoded.reduce((sum, entry) => sum + entry.bytes.length + encoder.encode(entry.key).length + 128, encoder.encode(preparationId).length) > ATLAS_STORAGE_PAGE_BYTES) throw new Error('Atlas 单片准备超过 512 KiB。');
  const prepared = await Promise.all(encoded.map(async entry => ({ ...entry, digest: await hash(entry.bytes) }))); abort(control);
  const db = await openDatabase(false); if (!db) throw new Error('Atlas 准备库不存在。');
  try {
    abort(control); const fixed = await readPreparation(db, preparationId), [manifestRow] = await read(db, [{ store: 'manifests', key: fixed.prep.manifestDigest }]), manifest = await verifiedManifest(manifestRow);
    const current = await readRoot(db, fixed.prep.draftId), protectedRows: Snapshot[] = [fixed.row, manifestRow, current.row];
    if (!equal(current.root, fixed.prep.expectedRoot)) throw new Error('Atlas 准备所基于的完整根已变化，CAS 冲突，未追加暂存。');
    if (current.root) protectedRows.push(...await rootProtectionRows(db, current.root, control));
    const values = new Map<string, BlobRecord>();
    for (const item of prepared) {
      const ref = manifest.blockRefs.find(ref => ref.key === item.key); if (!ref || ref.hash !== item.digest) throw new Error('Atlas 分块重新计算的摘要与候选 manifest 不符。');
      decodeBlock(item.bytes, manifest.spec);
      values.set(item.digest, { format: 'lieguoji-atlas-blob', version: 1, domain: DOMAIN, kind: 'block', digest: item.digest, bytes: item.bytes });
    }
    const queries: Query[] = [...protectedRows, ...[...values.keys()].map(key => ({ store: 'blocks' as const, key })), { store: 'meta', key: 'usage' }];
    abort(control);
    return await transact(db, 'readwrite', queries, (tx, rows) => {
      assertUnchanged(protectedRows, rows); const writes: Write[] = [];
      for (const [key, value] of values) { const old = get(rows, 'blocks', key); if (old.present && !equal(old.value, value)) throw new Error('Atlas 不可变块的同摘要内容不同，禁止覆盖。'); if (!old.present) writes.push({ store: 'blocks', key, value }); }
      const usage = applyWrites(tx, rows, writes); return { logicalBytes: usage.bytes, stagedBlocks: values.size };
    }, control);
  } finally { db.close(); }
}

export async function commitAtlasPreparation(preparationId: string, control?: AtlasStorageControl): Promise<AtlasCommitReceipt> {
  checkPreparation(preparationId); abort(control); const db = await openDatabase(false); if (!db) throw new Error('Atlas 准备库不存在。');
  try {
    abort(control); const fixed = await readPreparation(db, preparationId), prep = fixed.prep;
    const [receiptRow] = await read(db, [{ store: 'receipts', key: preparationId }]);
    if (receiptRow.present) { const receipt = receiptRecord(receiptRow.value, preparationId); if (receipt.requestDigest !== prep.requestDigest || receipt.candidateId !== prep.candidateId) throw new Error('Atlas commandId 回执绑定冲突。'); await verifyReceipt(receipt); return publicReceipt(receipt, true); }
    if (await requestDigest(prep) !== prep.requestDigest) throw new Error('Atlas 准备请求摘要不符。');
    const base = await readRoot(db, prep.draftId), protectedRows: Snapshot[] = [fixed.row, base.row];
    if (base.root) protectedRows.push(...(await rootContents(db, base.root, control)).rows);
    if (!equal(base.root, prep.expectedRoot)) throw new Error('Atlas 完整根 CAS 冲突，未覆盖。');
    const [manifestRow] = await read(db, [{ store: 'manifests', key: prep.manifestDigest }]), manifest = await verifiedManifest(manifestRow);
    if (manifest.draftId !== prep.draftId || manifest.revision !== prep.revision || (base.root ? manifest.revision !== base.root.revision + 1 : manifest.revision !== 0)) throw new Error('Atlas 候选身份或修订不符。');
    const candidate = await readContent(db, manifest, control); protectedRows.push(manifestRow, ...candidate.rows);
    const root: AtlasStoredRoot = { format: 'lieguoji-atlas-root', version: 1, domain: DOMAIN, draftId: prep.draftId, revision: prep.revision, currentManifest: prep.manifestDigest, backupManifest: base.root?.currentManifest ?? null, lastCommitId: prep.commandId, rootDigest: '0'.repeat(64) };
    root.rootDigest = await hashAtlasRoot(root);
    let backupBytes = 0;
    if (base.root) { const previous = await verifiedManifest(get(protectedRows, 'manifests', base.root.currentManifest)); backupBytes = encodeManifest(previous).length + previous.blockRefs.reduce((sum, ref) => sum + blob(get(protectedRows, 'blocks', ref.hash).value, 'block', ref.hash).bytes.length, 0); }
    const receipt: ReceiptRecord = { format: 'lieguoji-atlas-receipt', version: 1, domain: DOMAIN, draftId: prep.draftId, commandId: prep.commandId, candidateId: prep.candidateId, requestDigest: prep.requestDigest, revision: prep.revision, rootDigest: root.rootDigest, manifestDigest: prep.manifestDigest, root, baseRoot: base.root, committed: true, replayed: false, logicalBytes: 0, pairReferencedBytes: candidate.referencedBytes + backupBytes };
    const queries: Query[] = [...protectedRows, receiptRow, { store: 'meta', key: 'usage' }]; abort(control);
    const committed = await transact(db, 'readwrite', queries, (tx, rows) => {
      // Another identical commit may have won while this invocation was hashing.
      const existing = get(rows, 'receipts', preparationId);
      if (existing.present) { const prior = receiptRecord(existing.value, preparationId); if (prior.requestDigest !== prep.requestDigest || prior.candidateId !== prep.candidateId) throw new Error('Atlas commandId 绑定冲突。'); return publicReceipt(prior, true); }
      assertUnchanged(protectedRows, rows);
      const usage = usageRecord(get(rows, 'meta', 'usage').value), oldRoot = get(rows, 'roots', prep.draftId), rootBytes = encodeAtlasRoot(root);
      receipt.logicalBytes = usage.bytes + entryBytes(prep.draftId, rootBytes) - (oldRoot.present ? entryBytes(prep.draftId, oldRoot.value) : 0) + entryBytes(preparationId, receipt);
      applyWrites(tx, rows, [{ store: 'roots', key: prep.draftId, value: rootBytes }, { store: 'receipts', key: preparationId, value: receipt }]);
      return publicReceipt(receipt, false);
    }, control);
    // Hash outside the IDB transaction, including the concurrent receipt path.
    await verifyReceipt(committed); return committed;
    // No post-completion abort check: a late cancellation is a committed result.
  } finally { db.close(); }
}

export async function findAtlasReceipt(draftId: string, commandId: string, control?: AtlasStorageControl): Promise<AtlasCommitReceipt | null> {
  checkId(draftId); checkCommand(commandId); abort(control); const db = await openDatabase(false); if (!db) return null;
  try { abort(control); const id = `${draftId}:${commandId}`, [row] = await read(db, [{ store: 'receipts', key: id }]); if (!row.present) return null; const receipt = receiptRecord(row.value, id); await verifyReceipt(receipt); return publicReceipt(receipt, true); } finally { db.close(); }
}

export async function openAtlasDraft(draftId: string, options: AtlasStorageControl & { source?: 'current' | 'backup' } = {}): Promise<AtlasReadHandle | null> {
  checkId(draftId); abort(options); const source = options.source ?? 'current'; if (source !== 'current' && source !== 'backup') throw new Error('Atlas 读取来源无效。');
  const db = await openDatabase(false); if (!db) return null;
  try {
    abort(options); const { root } = await readRoot(db, draftId); if (!root) return null;
    const digest = source === 'current' ? root.currentManifest : root.backupManifest; if (!digest) throw new Error('Atlas 没有备份；未隐式回退。');
    const digests = [root.currentManifest, ...(root.backupManifest ? [root.backupManifest] : [])], rows = await read(db, digests.map(key => ({ store: 'manifests', key })));
    let selected: AtlasDraftManifest | undefined, pairReferencedBytes = 0, pairComplete = true;
    for (const key of digests) {
      const manifest = await verifiedManifest(get(rows, 'manifests', key)); if (manifest.draftId !== draftId || key === root.currentManifest && manifest.revision !== root.revision || key === root.backupManifest && manifest.revision >= root.revision) throw new Error('Atlas 主备身份或修订关系无效。');
      // Even an explicit backup must not bypass a future codec/domain in current.
      let bytes = encodeManifest(manifest).length;
      for (let i = 0; i < manifest.blockRefs.length; i += 16) {
        abort(options); const refs = manifest.blockRefs.slice(i, i + 16), page = await read(db, refs.map(ref => ({ store: 'blocks', key: ref.hash })));
        for (const ref of refs) { const row = get(page, 'blocks', ref.hash); if (!row.present) { if (key === digest) throw new Error('Atlas 所选版本缺块。'); pairComplete = false; continue; } const stored = blob(row.value, 'block', ref.hash); assertCodec(stored); bytes += stored.bytes.length; }
      }
      pairReferencedBytes += bytes; if (key === digest) selected = manifest;
    }
    if (!selected) throw new Error('Atlas 所选固定版本缺失。'); const content = await readContent(db, selected, options);
    return { draftId, source, readOnly: source === 'backup', root, manifest: selected, manifestDigest: digest, referencedBytes: content.referencedBytes, pairReferencedBytes: pairComplete ? pairReferencedBytes : null };
  } finally { db.close(); }
}

export async function readAtlasBlockPage(handle: AtlasReadHandle, cursor = 0, control?: AtlasStorageControl): Promise<AtlasBlockPage> {
  abort(control); checkId(handle.draftId);
  if (!validateManifest(handle.manifest) || !validateAtlasRoot(handle.root) || handle.root.draftId !== handle.draftId || handle.manifest.draftId !== handle.draftId || handle.source !== 'current' && handle.source !== 'backup' || !safeInt(cursor) || cursor >= handle.manifest.blockRefs.length || !HASH.test(handle.manifestDigest)) throw new Error('Atlas 固定读取句柄或游标无效。');
  const manifest = decodeManifest(encodeManifest(handle.manifest)), root = structuredClone(handle.root), selectedDigest = handle.manifestDigest, source = handle.source;
  await verifyAtlasRoot(root);
  if (await hash(encodeManifest(manifest)) !== selectedDigest || selectedDigest !== (source === 'current' ? root.currentManifest : root.backupManifest)) throw new Error('Atlas 读取句柄与固定版本摘要不符。');
  const db = await openDatabase(false); if (!db) throw new Error('Atlas 固定版本库不存在。');
  try {
    const refs = manifest.blockRefs.slice(cursor, cursor + 16); abort(control); const rows = await read(db, refs.map(ref => ({ store: 'blocks', key: ref.hash }))), blocks: AtlasBlock[] = []; let encodedBytes = 0;
    for (const ref of refs) { const row = get(rows, 'blocks', ref.hash); if (!row.present) throw new Error('Atlas 固定版本缺块。'); const value = blob(row.value, 'block', ref.hash); assertCodec(value); if (await hash(value.bytes) !== ref.hash) throw new Error('Atlas 页面块摘要不符。'); const block = decodeBlock(value.bytes, manifest.spec); if (blockKey(block.layer, block.bx, block.by) !== ref.key) throw new Error('Atlas 页面块身份不符。'); blocks.push(block); encodedBytes += value.bytes.length + encoder.encode(ref.key).length + 128; }
    if (encodedBytes > ATLAS_STORAGE_PAGE_BYTES) throw new Error('Atlas 固定分片超过 512 KiB。');
    return { blocks, nextCursor: cursor + refs.length < manifest.blockRefs.length ? cursor + refs.length : null, encodedBytes };
  } finally { db.close(); }
}

export async function listAtlasDrafts(control?: AtlasStorageControl): Promise<AtlasCatalogEntry[]> {
  abort(control); const db = await openDatabase(false); if (!db) return [];
  try {
    abort(control); const roots = await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
      const tx = db.transaction('roots', 'readonly'), store = tx.objectStore('roots'), keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => resolve(keys.result.map((key, i) => ({ key, value: values.result[i] }))); tx.onabort = () => reject(tx.error ?? new Error('Atlas 草稿目录读取中断。'));
    });
    const result: AtlasCatalogEntry[] = [];
    for (const row of roots) {
      abort(control); const root = decodeRoot(row.value); if (root.draftId !== row.key) throw new Error('Atlas 目录身份不符。'); await verifyAtlasRoot(root);
      const [manifestRow] = await read(db, [{ store: 'manifests', key: root.currentManifest }]), manifest = await verifiedManifest(manifestRow);
      if (manifest.draftId !== root.draftId || manifest.revision !== root.revision) throw new Error('Atlas 目录修订不符。');
      result.push({ draftId: root.draftId, name: manifest.name, revision: root.revision, size: manifest.spec.columns, rootDigest: root.rootDigest, currentManifest: root.currentManifest, backupAvailable: root.backupManifest !== null });
    }
    return result;
  } finally { db.close(); }
}

/** Read exact target records without validators rewriting unknown raw values.
 * Uint8Array values are retained as typed bytes; a JSON download must encode them
 * explicitly (e.g. tagged byte arrays) instead of claiming JSON is a raw IDB file. */
export async function exportAtlasRawBackup(draftId: string) {
  checkId(draftId); const db = await openDatabase(false, true); if (!db) return { format: 'lieguoji-atlas-raw-backup', version: 1, database: ATLAS_DRAFTS_DB, databaseVersion: null, draftId, records: [] as Snapshot[] };
  try {
    if (!db.objectStoreNames.contains('roots')) throw new Error('Atlas 原始库没有已知根存储，拒绝猜测其他资料范围。');
    const [root] = await read(db, [{ store: 'roots', key: draftId }]), records = [root]; let raw: unknown;
    try { raw = root.value instanceof Uint8Array ? JSON.parse(decoder.decode(root.value)) : root.value; } catch { raw = null; }
    // Only explicit hash pointers on the requested root, never enumerate players.
    const hashes = record(raw) ? [raw.currentManifest, raw.backupManifest].filter((v): v is string => typeof v === 'string' && HASH.test(v)) : [];
    if (hashes.length) {
      const manifests = await read(db, hashes.map(key => ({ store: 'manifests', key }))); records.push(...manifests); const refs = new Set<string>();
      for (const row of manifests) {
        try { const value = record(row.value) && row.value.bytes instanceof Uint8Array ? JSON.parse(decoder.decode(row.value.bytes)) as Record<string, unknown> : null; if (Array.isArray(value?.blockRefs)) for (const ref of value.blockRefs) if (record(ref) && typeof ref.hash === 'string' && HASH.test(ref.hash)) refs.add(ref.hash); } catch { /* Preserve undecodable original manifest bytes. */ }
      }
      for (const digest of refs) records.push(...await read(db, [{ store: 'blocks', key: digest }]));
    }
    return { format: 'lieguoji-atlas-raw-backup', version: 1, database: ATLAS_DRAFTS_DB, databaseVersion: db.version, draftId, records };
  } finally { db.close(); }
}
