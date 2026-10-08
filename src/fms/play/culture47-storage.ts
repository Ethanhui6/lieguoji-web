import {Culture47Session,assertCulture47Journal,type Culture47Journal} from './culture47-session';
export const CULTURE47_DATABASE='lieguoji-fms-culture47-journal-v1';
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
  if(j&&(j.version>1||typeof j.engine==='string'&&j.engine!==__CULTURE47_ENGINE__||typeof j.rule==='string'&&j.rule!=='real-culture-play-journal-1'))fail();
  const o=j?.opening;unknown(o,['terrain','count','cityCount','relations','setup']);unknown(o?.terrain,['format','version','worldId','revision','width','height','points','triangles','neighbors','elevations','terrainLocks']);if(o?.terrain?.version>2)fail();
  unknown(o?.setup,['mode','enabled','nations']);if(o?.setup?.nations&&typeof o.setup.nations==='object')for(const n of Object.values(o.setup.nations))unknown(n,['cultureId','religionId','polity']);
  if(Array.isArray(j?.actions))for(const a of j.actions as unknown as {kind?:string;edit?:{kind?:string;patch?:unknown}}[]){
    if(a?.kind==='advance')unknown(a,['kind','ticks']);else if(a?.kind==='succession')unknown(a,['kind','nationId']);else if(a?.kind==='identity'){unknown(a,['kind','edit']);const v=a.edit;if(v?.kind==='city')unknown(v,['kind','id','customName']);else if(v?.kind==='nation'){unknown(v,['kind','id','patch']);unknown(v.patch,['polity','religionId','customName']);}else if(v?.kind)fail();}else if(a?.kind)fail();
  }
}
export type Culture47Verifier=(journal:Culture47Journal)=>void|Promise<void>;
const replay:Culture47Verifier=j=>{new Culture47Session().load(j);};
async function checked(s:Slots,verify:Culture47Verifier){
  if(!Number.isSafeInteger(s.revision)||s.revision<0)throw Error('文化存档版本损坏，原档保留。');
  // Unknown schemas lock both slots. A known, checksum-corrupted current may
  // recover backup without replacing it with the damaged bytes on next save.
  future(s.current);future(s.backup);
  const valid=async(e:Envelope|undefined,current:boolean)=>{
    if(!e||e.version!==1||!Number.isSafeInteger(e.revision)||e.revision<1||(current?e.revision!==s.revision:e.revision>s.revision)||typeof e.checksum!=='string')return;
    try{assertCulture47Journal(e.journal);if(await digest(e.journal)===e.checksum){await verify(e.journal);return e;}}catch{/* Known damaged slot; retain bytes and try the other valid slot. */}
  };
  return {current:await valid(s.current,true),backup:await valid(s.backup,false)};
}
export async function loadCulture47(factory:IDBFactory=indexedDB,verify:Culture47Verifier=replay):Promise<SavedCulture47|null>{
  const db=await open(factory);try{const s=await read(db),v=await checked(s,verify),chosen=v.current??v.backup;
    if(!chosen){if(s.current||s.backup||s.revision)throw Error('文化存档校验失败，两个槽位均保留。');return null;}
    return {journal:chosen.journal,revision:s.revision,recovered:!v.current};
  }finally{db.close();}
}
export async function saveCulture47(journal:Culture47Journal,expected:number|null,factory:IDBFactory=indexedDB,signal?:AbortSignal,verify:Culture47Verifier=replay):Promise<number>{
  const candidate=structuredClone(journal);assertCulture47Journal(candidate);signal?.throwIfAborted();await verify(candidate);signal?.throwIfAborted();
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
