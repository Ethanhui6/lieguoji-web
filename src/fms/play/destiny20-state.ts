import {nativeDestinyDefaults,nativeRandomDestiny,nativeMonthlyDestiny,nativeRefreshDestinyTrait,type NativeDestiny,type DestinyRandom} from './native-economy/destiny';
import {f} from './native-economy/numeric';
import {personSkills} from './court16-people';
import type {Restoration19Run} from './restoration19-model';
export type DestinyLedger={day:number;before:number;after:number;populationRatio:number;gold:number;administrative:number|null;reset:boolean;clearedRecent:boolean};
export type DestinyNation=NativeDestiny&{seed:number;initializedDay:number;lastMonth:number;restorations:number;resets:number;ledger:DestinyLedger|null};
export type DestinyState={version:1;schedule:'web-30-day-v1';revision:number;nations:Record<string,DestinyNation>};
export type DestinyWorld=Pick<Restoration19Run,'world'|'upperCombat'|'people'|'finance'|'tactics'>;
export type DestinyEdit={nationId:string;manifest:boolean};
function random(s:{seed:number}):DestinyRandom{
 const unit=()=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
 return {intRange:(min,max)=>min+Math.floor(unit()*(max-min)),floatRange:(min,max)=>f(min+(max-min)*unit())};
}
function seedFor(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function apply(r:DestinyWorld,s:DestinyNation,id:string,change:{state:NativeDestiny;clearEmergencyMobilizations:boolean}){
 Object.assign(s,change.state);r.upperCombat.nations[id].destiny=s.destiny;
 // Cooldown and recent-three queue have distinct meanings in v20.
 if(change.clearEmergencyMobilizations)r.tactics.mobilizations[id].recent=[];
}
export function initialDestiny(r:Restoration19Run,copy:boolean):DestinyState{
 const s:DestinyState={version:1,schedule:'web-30-day-v1',revision:0,nations:{}};reconcileDestiny(r,s,copy);return s;
}
/** Native Start randomizes new/returning states. The web's restored-person
 * bridge performs one Start, not an invented second family-failure attempt. */
export function reconcileDestiny(r:Restoration19Run,s:DestinyState,copy=false){
 for(const n of r.world.nations){
  const restores=r.sovereignty.restorations[n.id]??0;let v=s.nations[n.id];
  if(!v){
   const stream={seed:seedFor(`${r.world.custom?.seed??''}/destiny20/${n.id}`)},rng=random(stream),base=nativeDestinyDefaults(rng);
   v={...base,seed:stream.seed,initializedDay:r.world.day,lastMonth:Math.floor(r.world.day/30),restorations:restores,resets:0,ledger:null};s.nations[n.id]=v;
   if(copy)v.destiny=r.upperCombat.nations[n.id].destiny;
   else apply(r,v,n.id,nativeRandomDestiny(v,true,random(v)));
   s.revision++;
  }else if(v.restorations<restores){
   apply(r,v,n.id,nativeRandomDestiny(v,true,random(v)));v.restorations=restores;v.resets++;v.ledger=null;s.revision++;
  }
 }
}
export function settleDestinyMonth(r:DestinyWorld,s:DestinyState){
 const day=r.world.day,month=Math.floor(day/30);if(day%30!==0)return;
 for(const n of r.world.nations){
  const v=s.nations[n.id],owned=r.world.provinces.filter(p=>p.controller===n.id);if(!v||v.lastMonth>=month||!owned.length)continue;
  const population=owned.reduce((sum,p)=>sum+r.world.statecraft!.provinces.find(q=>q.provinceId===p.id)!.population,0),capacity=owned.reduce((sum,p)=>sum+r.finance.provinces[p.id].maxPopulation,0);
  if(!Number.isFinite(capacity)||capacity<=0)throw Error('国运人口容量未解析，已取消本次月结。');
  const ratio=f(f(population)/f(capacity)),leaderId=r.people.nations[n.id].leaderId,leader=leaderId===null?undefined:r.people.persons[leaderId];let administrative:number|null=v.destiny>=30?50:null;
  const before=v.destiny,gold=r.finance.nations[n.id].gold,result=nativeMonthlyDestiny(v,{populationRatio:()=>ratio,gold,...(leader?{leaderAdministrative:()=>administrative=personSkills(leader).administrative}:{})},random(v));
  apply(r,v,n.id,result);v.lastMonth=month;if(result.reset)v.resets++;
  v.ledger={day,before,after:v.destiny,populationRatio:ratio,gold,administrative,reset:result.reset,clearedRecent:result.clearEmergencyMobilizations};s.revision++;
 }
}
export function previewDestinyEdit(r:DestinyWorld&{destiny:DestinyState},edit:DestinyEdit){
 const no=(reason:string)=>({valid:false,reason,details:[] as string[]});
 if(!edit||Object.keys(edit).sort().join()!=='manifest,nationId'||typeof edit.manifest!=='boolean')return no('国运特性参数无效。');
 const v=r.destiny.nations[edit.nationId],nation=r.world.nations.find(n=>n.id===edit.nationId);
 if(!v||!nation||!r.world.provinces.some(p=>p.controller===nation.id))return no('请选择仍有领土的国家。');
 if(v.manifest===edit.manifest)return no('国运特性没有变化。');
 return {valid:true,reason:`${edit.manifest?'启用':'取消'}${nation.name}的天命眷顾。`,details:edit.manifest?['特性刷新会抽取 2—4 次余量；当前国运数值保持。','下次触底时重抽到 70—89，并保留下降率与近期动员记录。']:['当前国运和已存余量保持，下次触底采用普通重抽。','普通重抽会清空最近三次动员记录，但不取消动员冷却。']};
}
export function refreshDestinyTrait(s:DestinyState,id:string,manifest:boolean){const v=s.nations[id];Object.assign(v,nativeRefreshDestinyTrait(v,manifest,random(v)));s.revision++;}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const keys=['destiny','decrease','manifestCount','manifest','seed','initializedDay','lastMonth','restorations','resets','ledger'];
const ledgerKeys=['day','before','after','populationRatio','gold','administrative','reset','clearedRecent'];
export function assertDestinySchema(v:unknown){const s=v as DestinyState|undefined;if(unknown(s,['version','schedule','revision','nations'])||s?.version!=null&&s.version!==1||s?.schedule!=null&&s.schedule!=='web-30-day-v1'||record(s?.nations)&&Object.values(s.nations).some(n=>unknown(n,keys)||unknown(n?.ledger,ledgerKeys)))throw Error('国运存档含未来规则或未知字段，已锁定读写。');}
export function assertDestiny(s:DestinyState,r:Restoration19Run){
 assertDestinySchema(s);const fail=()=>{throw Error('国运状态损坏，已保留原档。');},integer=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max,finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!record(s)||s.version!==1||s.schedule!=='web-30-day-v1'||!integer(s.revision)||!record(s.nations)||Object.keys(s.nations).length!==r.world.nations.length||r.world.nations.some(n=>!s.nations[n.id]))return fail();
 for(const [id,v]of Object.entries(s.nations)){
  if(!record(v)||Object.keys(v).length!==keys.length||!finite(v.destiny,0,100)||v.destiny!==f(v.destiny)||v.destiny!==r.upperCombat.nations[id].destiny||!finite(v.decrease,f(.043),f(.28))||v.decrease!==f(v.decrease)||!integer(v.manifestCount,-2147483648)||typeof v.manifest!=='boolean'||!integer(v.seed,0,0xffffffff)||!integer(v.initializedDay,0,r.world.day)||!integer(v.lastMonth,Math.floor(v.initializedDay/30),Math.floor(r.world.day/30))||!integer(v.restorations)||v.restorations!==(r.sovereignty.restorations[id]??0)||!integer(v.resets))return fail();
  const l=v.ledger;if(l!==null&&(!record(l)||Object.keys(l).length!==ledgerKeys.length||!integer(l.day,v.initializedDay,r.world.day)||l.day!==v.lastMonth*30||!finite(l.before,0,100)||!finite(l.after,0,100)||!finite(l.populationRatio,0,1e12)||!integer(l.gold,-2147483648)||(l.administrative!==null&&!finite(l.administrative,-1e6,1e6))||typeof l.reset!=='boolean'||typeof l.clearedRecent!=='boolean'||l.clearedRecent&&!l.reset))fail();
 }
}
