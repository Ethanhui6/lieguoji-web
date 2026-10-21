import {ARMY_BATCH_RULE47} from './army-batch47';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';
import {FRAME_LOOP_RULE47} from './frame-loop47';
import {ARMY_RECOVERY_RULE47} from './army-recovery47';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {Culture47Session,CULTURE47_RULE,CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE,type Culture47Journal} from './culture47-session';
import {assertStoredCulture47,supportsCulture47,culture47JournalVersion,Culture47Unavailable,Culture47InvalidJournal} from './culture47-contract';
import {sameCulture47Value} from './culture47-equal';
// The v1 database is left intact. New Chinese names must never replay and
// overwrite an old world's Latin names, family identities or chronicle.
export const CULTURE47_DATABASE='lieguoji-fms-culture47-zh-journal-v2';
export const CULTURE47_LONGPLAY_DATABASE='lieguoji-fms-culture47-longplay-v1';
export const CULTURE47_NEW_DATABASE='lieguoji-fms-culture47-newworld-v2';
export const CULTURE47_RETIREMENT_DATABASE='lieguoji-fms-culture47-retirement-copy-v1';
export const CULTURE47_FRESH_DATABASE='lieguoji-fms-culture47-newworld-v3';
export const CULTURE47_GENERATIONS_DATABASE='lieguoji-fms-culture47-generations-v1';
export type Culture47Database=typeof CULTURE47_GENERATIONS_DATABASE|typeof CULTURE47_RETIREMENT_DATABASE|typeof CULTURE47_FRESH_DATABASE|typeof CULTURE47_DATABASE|typeof CULTURE47_LONGPLAY_DATABASE|typeof CULTURE47_NEW_DATABASE;
type Envelope={version:1;revision:number;checksum:string;journal:Culture47Journal};
type Slots={current?:Envelope;backup?:Envelope;origin?:Envelope;revision:number};
export type SavedCulture47={journal:Culture47Journal;revision:number;recovered:boolean};
const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as ArrayLike<number>):x);
async function digest(j:Culture47Journal){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialize(j)))),n=>n.toString(16).padStart(2,'0')).join('');}
function open(factory:IDBFactory,signal?:AbortSignal,database:Culture47Database=CULTURE47_DATABASE):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let ended=false;const r=factory.open(database,1);
  const finish=(error:Error)=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(error);};
  const abort=()=>finish(Error('存档操作已取消。')),timer=setTimeout(()=>finish(Error('打开文化存档超时，请关闭其他占用页面后重试。')),8000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  r.onupgradeneeded=()=>{if(ended){r.transaction?.abort();return;}r.result.createObjectStore('slots');};
  r.onerror=()=>finish(r.error??Error('不能打开文化存档。'));r.onblocked=()=>finish(Error('文化存档被其他窗口占用，请关闭该窗口后重试。'));
  r.onsuccess=()=>{const db=r.result;if(ended){db.close();return;}ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);db.onversionchange=()=>db.close();resolve(db);};
});}
function read(db:IDBDatabase,signal?:AbortSignal):Promise<Slots>{return new Promise((resolve,reject)=>{
  const tx=db.transaction('slots','readonly'),s=tx.objectStore('slots'),a=s.get('current'),b=s.get('backup'),o=s.get('origin'),v=s.get('revision');
  const abort=()=>{try{tx.abort();}catch{/* closed */}},cleanup=()=>signal?.removeEventListener('abort',abort);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  tx.oncomplete=()=>{cleanup();resolve({current:a.result,backup:b.result,origin:o.result,revision:v.result??0});};tx.onerror=tx.onabort=()=>{cleanup();reject(tx.error??Error('读取文化存档中断。'));};
});}
function future(e:Envelope|undefined){
  if(e===undefined)return;
  const fail=()=>{throw Error('文化存档含未来格式或不同规则，已锁定读写。');};
  const unknown=(x:unknown,keys:string[])=>{if(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).some(k=>!keys.includes(k)))fail();};
  unknown(e,['version','revision','checksum','journal']);if(e?.version>1)fail();
  const j=e?.journal;unknown(j,['format','version','rule','engine','id','opening','actions',...(j?.version===2?['fork']:[])]);unknown(j?.fork,['engine','id','sequence',...(j?.fork?.engine===CULTURE47_RETIREMENT_SOURCE?['previous']:[])]);
  if(j?.fork&&'previous'in j.fork){unknown(j.fork.previous,['engine','id','sequence']);if(j.fork.previous&&typeof j.fork.previous.engine==='string'&&j.fork.previous.engine!==CULTURE47_CONTINUATION_SOURCE)fail();}
  if(j&&(j.version>culture47JournalVersion(j.engine)||typeof j.engine==='string'&&!supportsCulture47(j.engine)||typeof j.rule==='string'&&j.rule!==CULTURE47_RULE))fail();
  if(j?.fork&&typeof j.fork.engine==='string'&&j.fork.engine!==CULTURE47_CONTINUATION_SOURCE&&j.fork.engine!==CULTURE47_RETIREMENT_SOURCE)fail();
  const o=j?.opening;unknown(o,['terrain','count','cityCount','relations','setup','settlementAlgorithm','layout']);unknown(o?.layout,['seeds','owners']);
  if(o&&Object.hasOwn(o,'settlementAlgorithm')&&o.settlementAlgorithm!==SETTLEMENT47_ALGORITHM)fail();
  unknown(o?.terrain,['format','version','worldId','revision','width','height','points','triangles','neighbors','elevations','terrainLocks']);if(o?.terrain?.version>2)fail();
  unknown(o?.setup,['mode','enabled','nations']);if(o?.setup?.nations&&typeof o.setup.nations==='object')for(const n of Object.values(o.setup.nations))unknown(n,['cultureId','religionId','polity']);
  if(Array.isArray(j?.actions))for(const a of j.actions as unknown as {kind?:string;edit?:{kind?:string;patch?:unknown}}[]){
    if(a?.kind==='enable-generations'){const p=a as unknown as {rule?:string;expected:unknown};unknown(a,['kind','rule','expected']);if(typeof p.rule==='string'&&p.rule!==GENERATIONS_RULE47)fail();unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='enable-retirement'){const p=a as unknown as {rule?:string;expected:unknown};unknown(a,['kind','rule','expected']);if(typeof p.rule==='string'&&p.rule!=='retired-roster-web-v1')fail();unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='enable-recovery'){const p=a as unknown as {rule?:string;expected:unknown};unknown(a,['kind','rule','expected']);if(typeof p.rule==='string'&&p.rule!==ARMY_RECOVERY_RULE47)fail();unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='enable-army-batch'){const p=a as unknown as {rule?:string;expected:unknown};unknown(a,['kind','rule','expected']);if(typeof p.rule==='string'&&p.rule!==ARMY_BATCH_RULE47)fail();unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='enable-frame-loop'){const p=a as unknown as {rule?:string;expected:unknown};unknown(a,['kind','rule','expected']);if(typeof p.rule==='string'&&p.rule!==FRAME_LOOP_RULE47)fail();unknown(p.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']);continue;}
    if(a?.kind==='frame-length'){unknown(a,['kind','ticks']);continue;}
    if(a?.kind==='global'){const p=a as unknown as {order:{kind?:string;edit?:unknown};expected:unknown};unknown(a,['kind','order','expected']);unknown(p.order,['kind','edit']);if(p.order?.kind&&!['alliance','diplomacy','vassal','annex'].includes(p.order.kind))fail();unknown(p.order?.edit,['type','scope','nationId','targetId','enabled','months','vassalId','overlordId']);unknown(p.expected,['runId','day','tick','nextEventId','diplomacy','wars','civilization','settings','alliances','vassals','vassalManager']);continue;}
    if(a?.kind==='province'){const p=a as unknown as {edit:unknown;expected:unknown};unknown(a,['kind','edit','expected']);unknown(p.edit,['type','provinceId']);unknown(p.expected,['runId','day','tick','nextEventId','diplomacy','wars','civilization']);continue;}
    if(a?.kind==='territory'){const p=a as unknown as {edit:unknown;expected:unknown};unknown(a,['kind','edit','expected']);unknown(p.edit,['nationId','provinceIds']);unknown(p.expected,['runId','day','tick','nextEventId','diplomacy','wars','civilization']);continue;}
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
  future(s.current);future(s.backup);future(s.origin);
  if(s.origin){assertStoredCulture47(s.origin.journal);if(s.origin.version!==1||s.origin.revision!==1||await digest(s.origin.journal)!==s.origin.checksum)throw Error('续玩来源归档损坏，已保留并锁定。');}
  const valid=async(e:Envelope|undefined,current:boolean)=>{
    if(!e||e.version!==1||!Number.isSafeInteger(e.revision)||e.revision<1||(current?e.revision!==s.revision:e.revision>s.revision)||typeof e.checksum!=='string')return;
    try{assertStoredCulture47(e.journal);checkOrigin(e.journal,s.origin?.journal);}catch{return;}
    if(await digest(e.journal)!==e.checksum)return;
    try{await verify(e.journal);return e;}catch(error){
      // Transport failure or cancellation is not evidence of a corrupt slot.
      if(!(error instanceof Culture47InvalidJournal))throw error;
    }
  };
  return {current:await valid(s.current,true),backup:await valid(s.backup,false)};
}
function checkOrigin(j:Culture47Journal,origin?:Culture47Journal){
  if(!j.fork)return;
  if('previous'in j.fork&&!sameCulture47Value(j.fork.previous,origin?.fork??null))throw Error('第二次续玩的前史身份不一致。');
  if(j.fork.engine===CULTURE47_RETIREMENT_SOURCE&&j.actions[j.fork.sequence]?.kind!=='enable-retirement')throw Error('退役续玩规则尚未启用，原档保留。');
  if(!origin||origin.version!==(j.fork.engine===CULTURE47_RETIREMENT_SOURCE?2:1)||origin.engine!==j.fork.engine||origin.id!==j.fork.id||origin.actions.length!==j.fork.sequence||!sameCulture47Value(origin.opening,j.opening)||!sameCulture47Value(origin.actions,j.actions.slice(0,j.fork.sequence)))throw Error('续玩前史与不可轮换来源不一致，原档保留。');
}
function checkGenerationScope(j:Culture47Journal,database:Culture47Database){
  const enabled=j.actions.some(a=>a.kind==='enable-generations');
  if(enabled!==(database===CULTURE47_GENERATIONS_DATABASE)||enabled&&(j.version!==2||j.fork!==null))throw Error('婚育世界须使用独立的新世界存档，旧档保持。');
}
export async function loadCulture47(factory:IDBFactory=indexedDB,verify:Culture47Verifier=replay,signal?:AbortSignal,database:Culture47Database=CULTURE47_DATABASE):Promise<SavedCulture47|null>{
  signal?.throwIfAborted();const db=await open(factory,signal,database);try{const s=await read(db,signal),v=await checked(s,verify),chosen=v.current??v.backup;signal?.throwIfAborted();
    if(!chosen){if(s.current||s.backup||s.revision)throw Error('文化存档校验失败，两个槽位均保留。');return null;}
    checkGenerationScope(chosen.journal,database);
    return {journal:chosen.journal,revision:s.revision,recovered:!v.current};
  }finally{db.close();}
}
export async function saveCulture47(journal:Culture47Journal,expected:number|null,factory:IDBFactory=indexedDB,signal?:AbortSignal,verify:Culture47Verifier=replay,database:Culture47Database=CULTURE47_DATABASE,source?:Culture47Journal):Promise<number>{
  const candidate=structuredClone(journal);assertStoredCulture47(candidate);checkGenerationScope(candidate,database);signal?.throwIfAborted();await verify(candidate);signal?.throwIfAborted();
  const target=candidate.fork?.engine===CULTURE47_RETIREMENT_SOURCE?CULTURE47_RETIREMENT_DATABASE:CULTURE47_LONGPLAY_DATABASE;
  if(candidate.fork?database!==target:database===CULTURE47_LONGPLAY_DATABASE||database===CULTURE47_RETIREMENT_DATABASE)throw Error('续玩副本与普通新世界必须分开保存。');
  const origin=source?structuredClone(source):undefined;
  if(origin){if(database!==target||expected!==null||!candidate.fork)throw Error('只能在空的独立续玩库建立来源归档。');assertStoredCulture47(origin);checkOrigin(candidate,origin);await verify(origin);signal?.throwIfAborted();}
  const archived=origin?{version:1 as const,revision:1,checksum:await digest(origin),journal:origin}:undefined;
  const checksum=await digest(candidate);signal?.throwIfAborted();const db=await open(factory,signal,database);
  try{const before=await read(db,signal),prior=await checked(before,verify);signal?.throwIfAborted();
    if(before.revision!==(expected??0))throw Error('另一个页面已保存文化世界，请先重新读取；当前世界未覆盖。');
    if(archived&&(before.current||before.backup||before.origin||before.revision))throw Error('续玩库已有内容，来源归档不可覆盖。');
    checkOrigin(candidate,archived?.journal??before.origin?.journal);
    if(!Number.isSafeInteger(before.revision+1))throw Error('文化存档版本已达上限。');
    for(const value of [prior.current,prior.backup])if(value)checkGenerationScope(value.journal,database);
    const previous=prior.current??prior.backup;
    if((before.current||before.backup)&&!previous)throw Error('旧文化存档无法验证，禁止覆盖。');
    return await new Promise<number>((resolve,reject)=>{
      const tx=db.transaction('slots','readwrite'),s=tx.objectStore('slots'),a=s.get('current'),b=s.get('backup'),o=s.get('origin'),v=s.get('revision');let failure:Error|null=null;
      const abort=()=>{failure=Error('保存已取消，原存档保持。');try{tx.abort();}catch{/* already completed */}};
      signal?.addEventListener('abort',abort,{once:true});
      v.onsuccess=()=>{
        if(signal?.aborted)return abort();
        if((v.result??0)!==before.revision||serialize(a.result)!==serialize(before.current)||serialize(b.result)!==serialize(before.backup)||serialize(o.result)!==serialize(before.origin)){failure=Error('另一个页面已修改存档，请重新读取。');tx.abort();return;}
        if(archived)s.put(archived,'origin');if(previous)s.put(previous,'backup');s.put({version:1,revision:before.revision+1,checksum,journal:candidate} satisfies Envelope,'current');s.put(before.revision+1,'revision');
      };
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(before.revision+1);};
      tx.onabort=tx.onerror=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('文化保存未完成，原存档保持。'));};
    });
  }finally{db.close();}
}
