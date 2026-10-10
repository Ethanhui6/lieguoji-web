import {Culture47Session,CULTURE47_RULE,type Culture47Journal} from './culture47-session';
import {assertStoredCulture47,supportsCulture47,Culture47Unavailable,Culture47InvalidJournal} from './culture47-contract';
// The v1 database is left intact. New Chinese names must never replay and
// overwrite an old world's Latin names, family identities or chronicle.
export const CULTURE47_DATABASE='lieguoji-fms-culture47-zh-journal-v2';
type Envelope={version:1;revision:number;checksum:string;journal:Culture47Journal};
type Slots={current?:Envelope;backup?:Envelope;revision:number};
export type SavedCulture47={journal:Culture47Journal;revision:number;recovered:boolean};
const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as ArrayLike<number>):x);
async function digest(j:Culture47Journal){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialize(j)))),n=>n.toString(16).padStart(2,'0')).join('');}
function open(factory:IDBFactory,signal?:AbortSignal):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let ended=false;const r=factory.open(CULTURE47_DATABASE,1);
  const finish=(error:Error)=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(error);};
  const abort=()=>finish(Error('存档操作已取消。')),timer=setTimeout(()=>finish(Error('打开文化存档超时，请关闭其他占用页面后重试。')),8000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  r.onupgradeneeded=()=>{if(ended){r.transaction?.abort();return;}r.result.createObjectStore('slots');};
  r.onerror=()=>finish(r.error??Error('不能打开文化存档。'));r.onblocked=()=>finish(Error('文化存档被其他窗口占用，请关闭该窗口后重试。'));
  r.onsuccess=()=>{const db=r.result;if(ended){db.close();return;}ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);db.onversionchange=()=>db.close();resolve(db);};
});}
function read(db:IDBDatabase,signal?:AbortSignal):Promise<Slots>{return new Promise((resolve,reject)=>{
  const tx=db.transaction('slots','readonly'),s=tx.objectStore('slots'),a=s.get('current'),b=s.get('backup'),v=s.get('revision');
  const abort=()=>{try{tx.abort();}catch{/* closed */}},cleanup=()=>signal?.removeEventListener('abort',abort);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  tx.oncomplete=()=>{cleanup();resolve({current:a.result,backup:b.result,revision:v.result??0});};tx.onerror=tx.onabort=()=>{cleanup();reject(tx.error??Error('读取文化存档中断。'));};
});}
function future(e:Envelope|undefined){
  if(e===undefined)return;
  const fail=()=>{throw Error('文化存档含未来格式或不同规则，已锁定读写。');};
  const unknown=(x:unknown,keys:string[])=>{if(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).some(k=>!keys.includes(k)))fail();};
  unknown(e,['version','revision','checksum','journal']);if(e?.version>1)fail();
  const j=e?.journal;unknown(j,['format','version','rule','engine','id','opening','actions']);
  if(j&&(j.version>1||typeof j.engine==='string'&&!supportsCulture47(j.engine)||typeof j.rule==='string'&&j.rule!==CULTURE47_RULE))fail();
  const o=j?.opening;unknown(o,['terrain','count','cityCount','relations','setup']);unknown(o?.terrain,['format','version','worldId','revision','width','height','points','triangles','neighbors','elevations','terrainLocks']);if(o?.terrain?.version>2)fail();
  unknown(o?.setup,['mode','enabled','nations']);if(o?.setup?.nations&&typeof o.setup.nations==='object')for(const n of Object.values(o.setup.nations))unknown(n,['cultureId','religionId','polity']);
  if(Array.isArray(j?.actions))for(const a of j.actions as unknown as {kind?:string;edit?:{kind?:string;patch?:unknown}}[]){
    if(a?.kind==='family-policy'){const p=a as unknown as {expected:unknown};unknown(a,['kind','nationId','enabled','expected']);unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='family'){const p=a as unknown as {intent:unknown;expected:unknown};unknown(a,['kind','intent','expected']);unknown(p.intent,['nationId','personId','provinceId']);unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='military'){
      const p=a as unknown as {intent:{force?:string;command:{type?:string;kind?:string;target?:{kind?:string}}};expected:unknown};unknown(a,['kind','intent','expected']);unknown(p.intent,['force','command']);
      if(p.intent?.force&&!['army','fleet'].includes(p.intent.force))fail();const c=p.intent?.command;
      if(c?.type&&!['army-move','army-halt','fleet-sail','fleet-halt'].includes(c.type))fail();
      unknown(c,['type','armyId','fleetId','kind','target']);unknown(c?.target,['kind','id']);
      if(c?.kind&&!['march','retreat'].includes(c.kind)||c?.target?.kind&&!['cell','province','port'].includes(c.target.kind))fail();
      // Known but broken discriminants are corrupt slots, not future rules.
      // Strict journal validation rejects them and may recover a valid backup.
      unknown(p.expected,['runId','day','nextEventId','tick','positionsRevision','binding','fleetRevision','armyRevision','portRevision']);continue;
    }
    if(a?.kind==='politics'){const p=a as unknown as {action:{type?:unknown};expected:unknown};unknown(a,['kind','action','expected']);unknown(p.action,['type','nationId','targetNationId']);if(p.action?.type&&!['declare-war','make-peace'].includes(String(p.action.type)))fail();unknown(p.expected,['runId','day','tick','nextEventId','diplomacy','wars','civilization']);continue;}
    if(a?.kind==='advance')unknown(a,['kind','ticks']);else if(a?.kind==='succession')unknown(a,['kind','nationId']);else if(a?.kind==='identity'){unknown(a,['kind','edit']);const v=a.edit;if(v?.kind==='city')unknown(v,['kind','id','customName']);else if(v?.kind==='nation'){unknown(v,['kind','id','patch']);unknown(v.patch,['polity','religionId','customName']);}else if(v?.kind)fail();}else if(a?.kind)fail();
  }
}
export type Culture47Verifier=(journal:Culture47Journal)=>void|Promise<void>;
const replay:Culture47Verifier=j=>{if(j.engine!==__CULTURE47_ENGINE__)throw new Culture47Unavailable('此存档须由登记的原模拟引擎读取，原档保留。');try{new Culture47Session().load(j);}catch(e){throw new Culture47InvalidJournal(e instanceof Error?e.message:'文化日志无效。');}};
async function checked(s:Slots,verify:Culture47Verifier){
  if(!Number.isSafeInteger(s.revision)||s.revision<0)throw Error('文化存档版本损坏，原档保留。');
  // Unknown schemas lock both slots. A known, checksum-corrupted current may
  // recover backup without replacing it with the damaged bytes on next save.
  future(s.current);future(s.backup);
  const valid=async(e:Envelope|undefined,current:boolean)=>{
    if(!e||e.version!==1||!Number.isSafeInteger(e.revision)||e.revision<1||(current?e.revision!==s.revision:e.revision>s.revision)||typeof e.checksum!=='string')return;
    try{assertStoredCulture47(e.journal);}catch{return;}
    if(await digest(e.journal)!==e.checksum)return;
    try{await verify(e.journal);return e;}catch(error){
      // Transport failure or cancellation is not evidence of a corrupt slot.
      if(!(error instanceof Culture47InvalidJournal))throw error;
    }
  };
  return {current:await valid(s.current,true),backup:await valid(s.backup,false)};
}
export async function loadCulture47(factory:IDBFactory=indexedDB,verify:Culture47Verifier=replay,signal?:AbortSignal):Promise<SavedCulture47|null>{
  signal?.throwIfAborted();const db=await open(factory,signal);try{const s=await read(db,signal),v=await checked(s,verify),chosen=v.current??v.backup;signal?.throwIfAborted();
    if(!chosen){if(s.current||s.backup||s.revision)throw Error('文化存档校验失败，两个槽位均保留。');return null;}
    return {journal:chosen.journal,revision:s.revision,recovered:!v.current};
  }finally{db.close();}
}
export async function saveCulture47(journal:Culture47Journal,expected:number|null,factory:IDBFactory=indexedDB,signal?:AbortSignal,verify:Culture47Verifier=replay):Promise<number>{
  const candidate=structuredClone(journal);assertStoredCulture47(candidate);signal?.throwIfAborted();await verify(candidate);signal?.throwIfAborted();
  const checksum=await digest(candidate);signal?.throwIfAborted();const db=await open(factory,signal);
  try{const before=await read(db,signal),prior=await checked(before,verify);signal?.throwIfAborted();
    if(before.revision!==(expected??0))throw Error('另一个页面已保存文化世界，请先重新读取；当前世界未覆盖。');
    if(!Number.isSafeInteger(before.revision+1))throw Error('文化存档版本已达上限。');
    const previous=prior.current??prior.backup;
    if((before.current||before.backup)&&!previous)throw Error('旧文化存档无法验证，禁止覆盖。');
    return await new Promise<number>((resolve,reject)=>{
      const tx=db.transaction('slots','readwrite'),s=tx.objectStore('slots'),a=s.get('current'),b=s.get('backup'),v=s.get('revision');let failure:Error|null=null;
      const abort=()=>{failure=Error('保存已取消，原存档保持。');try{tx.abort();}catch{/* already completed */}};
      signal?.addEventListener('abort',abort,{once:true});
      v.onsuccess=()=>{
        if(signal?.aborted)return abort();
        if((v.result??0)!==before.revision||serialize(a.result)!==serialize(before.current)||serialize(b.result)!==serialize(before.backup)){failure=Error('另一个页面已修改存档，请重新读取。');tx.abort();return;}
        if(previous)s.put(previous,'backup');s.put({version:1,revision:before.revision+1,checksum,journal:candidate} satisfies Envelope,'current');s.put(before.revision+1,'revision');
      };
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(before.revision+1);};
      tx.onabort=tx.onerror=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('文化保存未完成，原存档保持。'));};
    });
  }finally{db.close();}
}
