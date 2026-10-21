import type {Culture47Journal} from './culture47-session';
import {CULTURE47_RETIREMENT_SOURCE} from './culture47-session';
import {assertStoredCulture47} from './culture47-contract';
import {CULTURE47_FRESH_DATABASE,CULTURE47_GENERATIONS_DATABASE,CULTURE47_LONGPLAY_DATABASE,CULTURE47_RETIREMENT_DATABASE,type Culture47Database} from './culture47-storage';

/** Original SaveSystem / LoadSaveDataUI: named saves, newest first, the
 * autosave is an ordinary save called "autosave". Each record holds the full
 * journal (opening map included), so one save restores map and world. The
 * continue slots in culture47-storage.ts stay as they are. */
export const CULTURE47_LIBRARY_DATABASE='lieguoji-fms-culture47-saves-v1';
export const CULTURE47_AUTOSAVE='autosave';
const FORMAT='lieguoji-culture47-named-save',STORE='saves',MAX_NAME=80;
type Record47={format:typeof FORMAT;version:1;name:string;savedAt:string;checksum:string;journal:Culture47Journal};
export type Culture47SaveInfo={name:string;savedAt:string;locked?:string};
export type Culture47LibraryVerifier=(journal:Culture47Journal)=>void|Promise<void>;

const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as ArrayLike<number>):x);
async function digest(j:Culture47Journal){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialize(j)))),n=>n.toString(16).padStart(2,'0')).join('');}
const stamp=(d=new Date())=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
/** NewSaveSlot.OnOpen: the suggested name is DateTime.Now "yyyyMMddHHmmss". */
export const defaultSaveName47=stamp;
const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
/** SaveSystem.SanitizeSaveName: blank names become a timestamp, ".save" is
 * dropped, invalid file-name and control characters are removed, Windows
 * reserved names get "_save", and the name is cut to 80 characters. */
export function sanitizeSaveName47(input:string,now=new Date()):string{
  let name=(input??'').trim();if(!name)return stamp(now);
  if(name.toLowerCase().endsWith('.save'))name=name.slice(0,-5);
  name=[...name].filter(c=>!/[<>:"/\\|?*]/.test(c)&&!/\p{Cc}/u.test(c)).join('').trim().replace(/[. ]+$/,'');
  if(!name)return stamp(now);
  if(RESERVED.test(name))name+='_save';
  if(name.length>MAX_NAME)name=name.slice(0,MAX_NAME).trim().replace(/[. ]+$/,'');
  return name||stamp(now);
}
/** The continue slot a loaded journal belongs to (same scope rules as culture47-storage). */
export function culture47ScopeOf(j:Culture47Journal):Culture47Database{
  if(j.fork)return j.fork.engine===CULTURE47_RETIREMENT_SOURCE?CULTURE47_RETIREMENT_DATABASE:CULTURE47_LONGPLAY_DATABASE;
  return j.actions.some(a=>a.kind==='enable-generations')?CULTURE47_GENERATIONS_DATABASE:CULTURE47_FRESH_DATABASE;
}
function open(factory:IDBFactory,name=CULTURE47_LIBRARY_DATABASE):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let ended=false;const r=factory.open(name,1),timer=setTimeout(()=>{if(!ended){ended=true;reject(Error('打开存档库超时，请关闭其他占用页面后重试。'));}},8000);
  r.onupgradeneeded=()=>{r.result.createObjectStore(STORE);};
  r.onerror=()=>{if(!ended){ended=true;clearTimeout(timer);reject(r.error??Error('不能打开存档库。'));}};
  r.onblocked=()=>{if(!ended){ended=true;clearTimeout(timer);reject(Error('存档库被其他窗口占用，请关闭该窗口后重试。'));}};
  r.onsuccess=()=>{const db=r.result;if(ended){db.close();return;}ended=true;clearTimeout(timer);db.onversionchange=()=>db.close();resolve(db);};
});}
function request<T>(db:IDBDatabase,mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>|void):Promise<T|undefined>{return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),r=run(tx.objectStore(STORE));
  tx.oncomplete=()=>resolve(r?r.result:undefined);tx.onerror=tx.onabort=()=>reject(tx.error??Error('存档操作未完成，原存档保持。'));
});}
function known(v:unknown):v is Record47{
  const r=v as Record47;
  return !!r&&typeof r==='object'&&r.format===FORMAT&&r.version===1&&typeof r.name==='string'&&typeof r.savedAt==='string'&&typeof r.checksum==='string'&&!!r.journal;
}
/** SaveSystem.GetAllSaves: every save, sorted by save time, newest first. */
export async function listCulture47Saves(factory:IDBFactory=indexedDB):Promise<Culture47SaveInfo[]>{
  const db=await open(factory);
  try{
    const keys=(await request(db,'readonly',s=>s.getAllKeys()))??[],values=(await request(db,'readonly',s=>s.getAll()))??[];
    return values.map((v,i):Culture47SaveInfo=>known(v)?{name:v.name,savedAt:v.savedAt}:{name:String(keys[i]),savedAt:'',locked:'版本不兼容，已保留并锁定。'})
      .sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.name.localeCompare(b.name));
  }finally{db.close();}
}
/** SaveSystem.SaveGame: writes (or overwrites) the named save. The journal is
 * verified before writing; a record of an unknown format is never replaced. */
export async function saveCulture47Named(journal:Culture47Journal,rawName:string,verify:Culture47LibraryVerifier,factory:IDBFactory=indexedDB,now=new Date()):Promise<string>{
  const candidate=structuredClone(journal);assertStoredCulture47(candidate);await verify(candidate);
  const name=sanitizeSaveName47(rawName,now),checksum=await digest(candidate),db=await open(factory);
  try{
    const prior=await request(db,'readonly',s=>s.get(name));
    if(prior!==undefined&&!known(prior))throw Error('同名存档版本不兼容，未覆盖。');
    await request(db,'readwrite',s=>{s.put({format:FORMAT,version:1,name,savedAt:now.toISOString(),checksum,journal:candidate} satisfies Record47,name);});
    return name;
  }finally{db.close();}
}
export async function loadCulture47Named(name:string,factory:IDBFactory=indexedDB):Promise<Culture47Journal>{
  const db=await open(factory);
  try{
    const v=await request(db,'readonly',s=>s.get(name));
    if(v===undefined)throw Error('找不到该存档。');
    if(!known(v))throw Error('存档版本不兼容，已保留并锁定。');
    assertStoredCulture47(v.journal);
    if(await digest(v.journal)!==v.checksum)throw Error('存档损坏或摘要不匹配，原存档已保留。');
    return v.journal;
  }finally{db.close();}
}
/** SaveSystem.DeleteSave. */
export async function deleteCulture47Named(name:string,factory:IDBFactory=indexedDB){
  const db=await open(factory);try{await request(db,'readwrite',s=>{s.delete(name);});}finally{db.close();}
}
/** Revision of a continue slot, so a loaded save can later be quick-saved there. */
export async function culture47SlotRevision(database:Culture47Database,factory:IDBFactory=indexedDB):Promise<number|null>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=factory.open(database,1);r.onupgradeneeded=()=>{r.result.createObjectStore('slots');};r.onerror=()=>reject(r.error??Error('不能打开文化存档。'));r.onblocked=()=>reject(Error('文化存档被其他窗口占用。'));r.onsuccess=()=>resolve(r.result);});
  try{return await new Promise<number|null>((resolve,reject)=>{const tx=db.transaction('slots','readonly'),v=tx.objectStore('slots').get('revision');tx.oncomplete=()=>resolve(typeof v.result==='number'&&v.result>0?v.result:null);tx.onerror=tx.onabort=()=>reject(tx.error??Error('读取文化存档中断。'));});}
  finally{db.close();}
}
