import { assertFmsRun, runEngine, type FmsRun } from './world';
import { supportedMilitaryEngine } from './military-registry';

export const RUN_DATABASE = 'lieguoji-fms-play-v1';
export const MILITARY_DATABASE = 'lieguoji-fms-play-v2';
type Envelope = { version: 1; revision: number; checksum: string; run: FmsRun };
type Slots = { current?: Envelope; backup?: Envelope; revision?: number };
export interface SavedRun { run: FmsRun; revision: number; recovered: boolean }
const serialize = (v: unknown) => JSON.stringify(v, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value);
async function digest(run: FmsRun): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(run)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function future(raw: Envelope | undefined, version:1|2) {
  if (raw && ((raw.version !== undefined && raw.version !== 1) || (raw.run?.version !== undefined && raw.run.version !== version) || (raw.run?.engine !== undefined && !(version===1?raw.run.engine===runEngine(1):supportedMilitaryEngine(raw.run.engine))))) throw new Error('推演存档属于其他规则版本，已锁定写入，请保留原档。');
  const run = raw?.run;
  if(run?.version===2&&run.rules!=='fms-military-1')throw new Error('推演规则版本不同，已锁定读写。');
  if (run && ((run.terrain?.version !== undefined && ![1, 2].includes(run.terrain.version))
    || (run.terrain?.format !== undefined && run.terrain.format !== 'lieguoji-fms-world')
    || (run.world?.schemaVersion !== undefined && run.world.schemaVersion !== 2)
    || (run.world?.rulesVersion !== undefined && run.world.rulesVersion !== '0.2.0')
    || (run.world?.statecraft?.version !== undefined && run.world.statecraft.version !== 1))) throw new Error('推演内层存档属于其他版本，已锁定读写并保留原档。');
}
async function valid(raw?: Envelope): Promise<Envelope | undefined> {
  if (!raw) return;
  try { assertFmsRun(raw.run); if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || raw.checksum !== await digest(raw.run)) return; return raw; } catch { return; }
}
async function open(factory: IDBFactory, version:1|2): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(version===1?RUN_DATABASE:MILITARY_DATABASE, 1); let ended = false;
    const timer = setTimeout(() => fail(), 8000);
    function fail() { if (!ended) { ended = true; clearTimeout(timer); reject(new Error('无法打开推演存档，未覆盖原档。')); } }
    req.onupgradeneeded = () => { if (ended) req.transaction?.abort(); else req.result.createObjectStore('saves'); };
    req.onerror = fail; req.onblocked = fail;
    req.onsuccess = () => { if (ended) req.result.close(); else { ended = true; clearTimeout(timer); req.result.onversionchange = () => req.result.close(); resolve(req.result); } };
  });
}
function transaction(db: IDBDatabase, version:1|2, write?: { expected: Slots; envelope: Envelope; previous?: Envelope }): Promise<Slots> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', write ? 'readwrite' : 'readonly'), store = tx.objectStore('saves'), slots: Slots = {}; let failure: unknown;
    const timer = setTimeout(() => { failure = new Error('存档操作超时，已取消写入。'); try { tx.abort(); } catch { /* already ended */ } }, 8000);
    let left = 3;
    for (const key of ['current', 'backup', 'revision'] as const) {
      const req = store.get(key);
      req.onsuccess = () => {
        Object.assign(slots, { [key]: req.result }); if (--left || !write) return;
        try {
          future(slots.current,version); future(slots.backup,version);
          if (serialize(slots) !== serialize(write.expected)) throw new Error('另一窗口已更新推演存档，本次未覆盖。请重新读取进度。');
          if (write.previous) store.put(write.previous, 'backup');
          store.put(write.envelope, 'current'); store.put(write.envelope.revision, 'revision');
        } catch (e) { failure = e; tx.abort(); }
      };
    }
    tx.oncomplete = () => { clearTimeout(timer); resolve(slots); };
    tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(failure ?? new Error('推演保存失败，原进度已保留。')); };
  });
}
async function checked(slots: Slots, version:1|2) {
  future(slots.current,version); future(slots.backup,version);
  if (!slots.current && !slots.backup && slots.revision === undefined) return { previous: undefined, revision: null };
  if (!Number.isSafeInteger(slots.revision) || slots.revision! < 1) throw new Error('推演存档序号损坏，已锁定写入。');
  const current = await valid(slots.current), backup = await valid(slots.backup), previous = current ?? backup;
  if (!previous || previous.revision > slots.revision! || (current && current.revision !== slots.revision)) throw new Error('推演主备档均无有效进度，已保留原档。');
  return { previous, revision: slots.revision!, recovered: !current };
}
export async function loadRun(factory: IDBFactory = indexedDB, version:1|2=1): Promise<SavedRun | null> {
  const db = await open(factory,version);
  try { const c = await checked(await transaction(db,version),version); return c.previous ? { run: c.previous.run, revision: c.revision!, recovered: !!c.recovered } : null; } finally { db.close(); }
}
export async function saveRun(run: FmsRun, expected: number | null, factory: IDBFactory = indexedDB): Promise<number> {
  const copy = structuredClone(run); assertFmsRun(copy); const checksum = await digest(copy), version=copy.version, db = await open(factory,version);
  try {
    const slots = await transaction(db,version), c = await checked(slots,version);
    if (c.revision !== expected) throw new Error('另一窗口已更新推演存档，本次未覆盖。请重新读取进度。');
    const revision = (expected ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('存档序号已达上限。');
    await transaction(db,version, { expected: slots, previous: c.previous, envelope: { version: 1, revision, checksum, run: copy } });
    return revision;
  } finally { db.close(); }
}
