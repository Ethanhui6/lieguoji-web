import {leaveAlliance46} from './war46-alliance';
import type {War46Run} from './war46-model';
import {nativeMakeVassalImmediate,type NativeVassalContext} from './native-war/vassal-effect';
import type {NativeEffectNation} from './native-war/settlement-effects';
import {war28Queries} from './war28-query';
import {war28Policy} from './war28-policy';
import {stateNumber} from './war28-state';
import {diplomacyRandom46} from './war46-state';
import {announce} from './chronicle-records';

export type Vassal46={vassalId:string;overlordId:string;time:number;tick:number;tributeRate:number;armyCapMultiplier:number;updateDay:number;endedTick:number|null;endReason:'released'|'independence'|'overlord-destroyed'|'vassal-destroyed'|null};
export type Vassals46={version:1;revision:number;records:Vassal46[]};
export const initialVassals46=():Vassals46=>({version:1,revision:0,records:[]});
export const overlord46=(r:Pick<War46Run,'vassals'>,id:string)=>r.vassals.records.find(v=>v.vassalId===id&&v.endedTick===null)?.overlordId??null;
const bump=(s:Vassals46)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('附庸关系超过安全范围。');s.revision++;};
/** Stable native objects use the same live fiscal and territorial getters as
 * settlement. Registration precedes the leave-war callback, as MakeVassalCore.
 * All changes belong to the session candidate; a thrown callback rolls back. */
export function makeVassal46(r:War46Run,vassalId:string,overlordId:string,leaveWars:(id:string)=>void){
 const q=war28Queries(r,r.nativeWars,war28Policy(r)),states=new Map<number,NativeEffectNation>();
 for(const n of r.world.nations){const id=stateNumber(r,n.id),s=q.state(id)!;states.set(id,{id,name:n.name,religionId:null,get dead(){return s.dead;},get provinces(){return s.provinces;},get gold(){return s.gold;},set gold(v){s.gold=v;},get goldPerMonth(){return s.goldPerMonth;},get armyCostGold(){return s.armyCostGold;}});}
 const c:NativeVassalContext={pending:[],vassalStates:new Map(),overlordToVassals:new Map()};
 for(const v of r.vassals.records.filter(v=>v.endedTick===null)){const a=states.get(stateNumber(r,v.vassalId))!,b=states.get(stateNumber(r,v.overlordId))!;c.vassalStates.set(a.id,{vassal:a,overlord:b,vassalizationTime:v.time,tributeRate:v.tributeRate,armyCapMultiplier:v.armyCapMultiplier,rebellionReason:'',updateDayInMonth:v.updateDay});c.overlordToVassals.set(b.id,[...(c.overlordToVassals.get(b.id)??[]),a]);}
 const number=(id:string)=>r.people.nations[id]?.id;
 return nativeMakeVassalImmediate(c,states.get(number(vassalId))??null,states.get(number(overlordId))??null,{
  // All live web wars have a WarV2 record. No second legacy manager
  // executes these rules; copied unknown wars are explicitly rejected below.
  legacyWars:()=>[],leaveLegacyWar:()=>{},forceLeaveAlliance:()=>{leaveAlliance46(r,vassalId,true);},gameTime:()=>r.life.gameTime,
  randomInt:(min,max)=>min+Math.floor(diplomacyRandom46(r.nativeDiplomacy)*(max-min)),
  leaveAllWarV2:()=>{const native=c.vassalStates.get(number(vassalId))!;r.vassals.records.push({vassalId,overlordId,time:native.vassalizationTime,tick:r.clock.tick,tributeRate:native.tributeRate,armyCapMultiplier:native.armyCapMultiplier,updateDay:native.updateDayInMonth,endedTick:null,endReason:null});bump(r.vassals);leaveWars(vassalId);},
  createEvent:(lord,vassal)=>({text:`${vassal.name}成为${lord.name}的附庸`,reason:'附庸关系已建立，国家和城市保留；退出已有战争，停止自主外战。'}),
  recordStateHistory:()=>{},recordWorldHistory:e=>announce(r.chronicle,r.world,r.clock.tick,'diplomacy',e.text,e.reason,[vassalId,overlordId],null),logMadeVassal:()=>{},drawVassalArrow:()=>{},
 });
}
/** ReleaseVassal 657B50 removes the relation. Visible announcements here are
 * a web history adapter; the native method itself only writes a debug log. */
export function releaseVassal46(r:War46Run,id:string,reason:NonNullable<Vassal46['endReason']>='released'){
 const v=r.vassals.records.find(v=>v.vassalId===id&&v.endedTick===null);if(!v)return false;
 v.endedTick=r.clock.tick;v.endReason=reason;bump(r.vassals);
 const name=(id:string)=>r.world.nations.find(n=>n.id===id)!.name;
 announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${name(id)}与${name(v.overlordId)}解除附庸关系`,reason==='independence'?'独立战争和约生效，宗属关系解除。':reason==='released'?'上帝干预解除了宗属关系。':reason==='overlord-destroyed'?'宗主已失去全部领土，附庸恢复独立外交。':'附庸已失去全部领土，宗属关系结束。',[id,v.overlordId],null);return true;
}
export function reconcileVassals46(r:War46Run){const live=new Set(r.world.provinces.map(p=>p.controller));for(const v of r.vassals.records.filter(v=>v.endedTick===null))if(!live.has(v.vassalId)||!live.has(v.overlordId))releaseVassal46(r,v.vassalId,!live.has(v.vassalId)?'vassal-destroyed':'overlord-destroyed');}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=['vassalId','overlordId','time','tick','tributeRate','armyCapMultiplier','updateDay','endedTick','endReason'];
export function assertVassalSchema46(v:unknown){const s=v as Vassals46|undefined;if(obj(s)&&(Object.keys(s).some(k=>!['version','revision','records'].includes(k))||s.version!=null&&s.version!==1)||Array.isArray(s?.records)&&s.records.some(v=>obj(v)&&(Object.keys(v).some(k=>!keys.includes(k))||v.endReason!=null&&!['released','independence','overlord-destroyed','vassal-destroyed'].includes(v.endReason))))throw Error('附庸存档含未来字段，已锁定读写。');}
export function assertVassals46(s:Vassals46,r:Pick<War46Run,'world'|'clock'|'life'>){
 assertVassalSchema46(s);const fail=()=>{throw Error('附庸关系损坏，保留原档。');},int=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
 if(!obj(s)||Object.keys(s).length!==3||s.version!==1||!int(s.revision)||!Array.isArray(s.records))return fail();
 const ids=new Set(r.world.nations.map(n=>n.id)),live=new Set(r.world.provinces.map(p=>p.controller)),active=new Map<string,string>(),last=new Map<string,number>();
 for(const v of s.records){if(!obj(v)||Object.keys(v).length!==keys.length||!ids.has(v.vassalId)||!ids.has(v.overlordId)||v.vassalId===v.overlordId||!int(v.tick,0,r.clock.tick)||!Number.isFinite(v.time)||Math.fround(v.time)!==v.time||v.time<0||v.time>r.life.gameTime||v.tributeRate!==Math.fround(.3)||v.armyCapMultiplier!==.5||!int(v.updateDay,1,27)||(last.get(v.vassalId)??0)>v.tick)return fail();
  if(v.endedTick===null){if(v.endReason!==null||active.has(v.vassalId)||!live.has(v.vassalId)||!live.has(v.overlordId))return fail();active.set(v.vassalId,v.overlordId);last.set(v.vassalId,Number.MAX_SAFE_INTEGER);}
  else{if(!int(v.endedTick,v.tick,r.clock.tick)||v.endReason===null)return fail();last.set(v.vassalId,v.endedTick);}
 }
 for(const id of active.keys()){const seen=new Set<string>();let next:string|undefined=id;while(next){if(seen.has(next))return fail();seen.add(next);next=active.get(next);}}
}
