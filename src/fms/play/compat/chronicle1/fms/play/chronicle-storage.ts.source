import {assertChronicle as assertTactics,campaignView,type ChronicleRun as TacticsRun} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {assertStoredMaritimeSchema} from './storage';
export const CHRONICLE_DATABASE='lieguoji-fms-chronicle-v1';
type StoreKey=13;
type Envelope = { version: 1; revision: number; checksum: string; run: TacticsRun };
type Slots = { current?: Envelope; backup?: Envelope; revision?: number };
export interface SavedRun { run: TacticsRun; revision: number; recovered: boolean }
const serialize = (v: unknown) => JSON.stringify(v, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value);
async function digest(run: TacticsRun): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(run)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function future(raw: Envelope | undefined, _version:StoreKey) {
  if(!raw)return;
  const fail=()=>{throw Error('新版战争存档含未来规则或未知字段，已锁定读写。');};
  const unknown=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&Object.keys(v).some(k=>!keys.includes(k));
  if(raw.version!==1||unknown(raw,['version','revision','checksum','run']))fail();
  const r=raw.run;if(!r)return;
  if(r.version!==11||r.rules!=='fms-chronicle-1'||r.engine!==__FMS_CHRONICLE_ENGINE__)fail();
  const t=r.tactics;if(!t||t.version!==1||unknown(t,['version','nextArmyId','seed','forces','rounds','mobilizations','unopposed']))fail();
  if(t.forces&&Object.values(t.forces).some(f=>unknown(f,['homeId','kind','fullStrength'])))fail();
  if(t.mobilizations&&Object.values(t.mobilizations).some(m=>unknown(m,['lastMonth','recent'])))fail();
  const re=r.reorganization;if(!re||re.version!==1||unknown(re,['version','active','completed']))fail();
  if(re.active&&Object.values(re.active).some(v=>unknown(v,['startedTick','fraction'])))fail();
  if(unknown(r,['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle']))fail();
  // Unknown schemas lock both slots; damage to known values may recover backup.
  const c=r.chronicle;
  if(c&&(c.version!==1||unknown(c,['version','originDay','nextEntryId','nextNationId','leaders','entries','unrest','ended'])))fail();
  if(c?.leaders&&Object.values(c.leaders).some(h=>Array.isArray(h)&&h.some(v=>unknown(v,['id','name','family','order','regnalName','regnalOrdinal','ascendedDay','endedDay','termEndDay']))))fail();
  if(c?.unrest&&Object.values(c.unrest).some(v=>unknown(v,['pressure','controller','sinceDay','cooldownUntil'])))fail();
  if(Array.isArray(c?.entries)&&c.entries.some(e=>unknown(e,['id','day','tick','kind','text','reason','nationIds','place','people','sourceEventId'])||e&&unknown(e.place,['id','name','x','y'])||Array.isArray(e?.people)&&e.people.some(p=>unknown(p,['id','name','order','regnalName','regnalOrdinal']))))fail();
  assertStoredMaritimeSchema(maritimeView(tacticsView(campaignView(r))));
}
async function valid(raw?: Envelope): Promise<Envelope | undefined> {
  if (!raw) return;
  try { assertTactics(raw.run); if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || raw.checksum !== await digest(raw.run)) return; return raw; } catch { return; }
}
async function open(factory: IDBFactory, _version:StoreKey): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(CHRONICLE_DATABASE, 1); let ended = false;
    const timer = setTimeout(() => fail(), 8000);
    function fail() { if (!ended) { ended = true; clearTimeout(timer); reject(new Error('无法打开推演存档，未覆盖原档。')); } }
    req.onupgradeneeded = () => { if (ended) req.transaction?.abort(); else req.result.createObjectStore('saves'); };
    req.onerror = fail; req.onblocked = fail;
    req.onsuccess = () => { if (ended) req.result.close(); else { ended = true; clearTimeout(timer); req.result.onversionchange = () => req.result.close(); resolve(req.result); } };
  });
}
function transaction(db: IDBDatabase, version:StoreKey, write?: { expected: Slots; envelope: Envelope; previous?: Envelope }): Promise<Slots> {
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
async function checked(slots: Slots, version:StoreKey) {
  future(slots.current,version); future(slots.backup,version);
  if (!slots.current && !slots.backup && slots.revision === undefined) return { previous: undefined, revision: null };
  if (!Number.isSafeInteger(slots.revision) || slots.revision! < 1) throw new Error('推演存档序号损坏，已锁定写入。');
  const current = await valid(slots.current), backup = await valid(slots.backup), previous = current ?? backup;
  if (!previous || previous.revision > slots.revision! || (current && current.revision !== slots.revision)) throw new Error('推演主备档均无有效进度，已保留原档。');
  return { previous, revision: slots.revision!, recovered: !current };
}
export async function loadChronicle(factory: IDBFactory = indexedDB, version:StoreKey=13): Promise<SavedRun | null> {
  const db = await open(factory,version);
  try { const c = await checked(await transaction(db,version),version); return c.previous ? { run: c.previous.run, revision: c.revision!, recovered: !!c.recovered } : null; } finally { db.close(); }
}
export async function saveChronicle(run: TacticsRun, expected: number | null, factory: IDBFactory = indexedDB): Promise<number> {
  const copy = structuredClone(run); assertTactics(copy); const checksum = await digest(copy), version:StoreKey=13, db = await open(factory,version);
  try {
    const slots = await transaction(db,version), c = await checked(slots,version);
    if (c.revision !== expected) throw new Error('另一窗口已更新推演存档，本次未覆盖。请重新读取进度。');
    const revision = (expected ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('存档序号已达上限。');
    await transaction(db,version, { expected: slots, previous: c.previous, envelope: { version: 1, revision, checksum, run: copy } });
    return revision;
  } finally { db.close(); }
}
