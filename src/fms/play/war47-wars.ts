/** Forward47 fork: identical campaign/war accounting, narrowed to the actual
 * calendar fields consumed. Real Life47 family records pass unchanged; never
 * filter relatives or forge the old LifePerson source to satisfy a type.
 * Frozen46 remains byte-identical. */
import type {War27Run} from './war27-model';
import type {NativeSettlementGoal} from './native-war/settlement-verdict';
import type {NativeExecutableWar} from './native-war/settlement-execute';
import {nativeGetMonthSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {assertWars47} from './war47-validation';
import type {War28Settlement} from './war28-settlement';
import type {NativeSideMember} from './native-war/side-builder';
import {coversPair46} from './war46-coalition';

/** Persist plain records, never Map (the save checksum uses JSON). These are
 * new war observations, not reconstructed v27 integer casualty history. */
export type War46Campaign={
 coalition?:{version:1;members:NativeSideMember[];departures:{stateId:number;side:0|1;tick:number}[]};
 internal?:{casusBelliId:16;legacyType:10;rebelStateId:number;motherStateId:number};
 id:number; relationId:string; nations:[string,string]; attacker:string|null; defender:string|null; startTime:number|null;
 openedTick:number; endedTick:number|null; history:'complete'|'unknown';
 participants:{stateId:number;side:0|1}[]; destroyedParticipants:{stateId:number;side:0|1}[];
 initialOwners:[number,number][]; initialProvinceCounts:[number,number][];
 initialCapitals:[number,number][]; goals:NativeSettlementGoal[];
 kills:[number,number][]; deaths:[number,number][];
 settlement:War28Settlement|null;
};
export type War46Wars={version:1;revision:number;nextId:number;originTick:number;provinceIds:string[];nationIds:[number,string][];campaigns:War46Campaign[]};
export type War28World=Pick<War27Run,'world'|'clock'|'people'|'warfare'|'finance'|'upperCombat'|'navy'|'transports'>&{life:Pick<War27Run['life'],'gameTime'|'startDate'|'secondsPerDay'>};
const f=Math.fround;
export const initialWar28=(r:War28World):War46Wars=>({version:1,revision:0,nextId:1,originTick:r.clock.tick,provinceIds:r.world.provinces.map(p=>p.id),nationIds:r.world.nations.map(n=>[stateNumber(r,n.id),n.id]),campaigns:[]});
const advanceRevision=(s:War46Wars)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('战争记录超过安全范围，本批未写入。');s.revision++;};
export const relationIdentity=(a:string,b:string,since:number)=>`${a<b?a:b}/${a<b?b:a}/${since}`;
export const provinceNumber=(s:War46Wars,id:string)=>s.provinceIds.indexOf(id)+1;
export function stateNumber(r:War28World,id:string){const value=r.people.nations[id]?.id;if(!Number.isInteger(value)||value<1||value>2147483647)throw Error('战争国家身份缺失。');return value;}
/** Native state acquisition order, with newly conquered live land appended
 * before the separate upper-state reconciliation catches up. */
export function orderedWar28Provinces(r:War28World,nationId:string){
 const owned=new Map(r.world.provinces.filter(p=>p.controller===nationId).map(p=>[p.id,p]));
 const ordered=[...new Set(r.upperCombat.nations[nationId]?.provinceOrder??[])].filter(id=>owned.has(id));
 const seen=new Set(ordered);return [...ordered,...[...owned.keys()].filter(id=>!seen.has(id))].map(id=>owned.get(id)!);
}
/** Nations can be founded later; existing numeric identities never change. */
export function reconcileWar28Identities(s:War46Wars,r:War28World){
 const present=new Set(r.world.provinces.map(p=>p.id));
 if(present.size!==s.provinceIds.length||s.provinceIds.some(id=>!present.has(id)))throw Error('战争地图身份发生变化，不能复用原战争历史。');
 const additions:[number,string][]=[];
 for(const n of r.world.nations){const id=stateNumber(r,n.id),old=s.nationIds.find(x=>x[1]===n.id);if(old&&old[0]!==id||s.nationIds.some(x=>x[0]===id&&x[1]!==n.id))throw Error('战争国家身份发生冲突。');if(!old)additions.push([id,n.id]);}
 if(additions.length){advanceRevision(s);s.nationIds.push(...additions);}
}

/** Register before any combat at the new relation. Caller supplies the actual
 * declaration initiator; lexical relation a/b is deliberately not used as side. */
export function registerWar46(s:War46Wars,r:War28World,attacker:string,defender:string,goals:NativeSettlementGoal[],history:'complete'|'unknown'='complete',internal?:War46Campaign['internal'],members?:NativeSideMember[]){
 const relation=r.world.statecraft!.relations.find(x=>[x.a,x.b].includes(attacker)&&[x.a,x.b].includes(defender));
 if(attacker===defender||!relation||relation.status!=='war')throw Error('新战争双方或关系无效。');
 const relationId=relationIdentity(attacker,defender,relation.sinceDay);
 const existing=s.campaigns.find(c=>c.relationId===relationId&&c.endedTick===null);
 if(existing)return existing;
 if(!Number.isSafeInteger(s.nextId)||s.nextId<1||s.nextId>=2147483647)throw Error('战争编号已达上限。');
 const ids=[stateNumber(r,attacker),stateNumber(r,defender)];
 const c:War46Campaign={...(internal?{internal}:{}),...(members?{coalition:{version:1 as const,members:structuredClone(members),departures:[]}}:{}),id:s.nextId,relationId,nations:[relation.a,relation.b],attacker:history==='complete'?attacker:null,defender:history==='complete'?defender:null,startTime:history==='complete'?f(r.life.gameTime):null,openedTick:r.clock.tick,endedTick:null,history,
 participants:members?members.map(({stateId,side})=>({stateId,side})):ids.map((stateId,i)=>({stateId,side:i as 0|1})),destroyedParticipants:[],initialOwners:[],initialProvinceCounts:[],initialCapitals:[],goals:structuredClone(goals),kills:[],deaths:[],settlement:null};
 // The native snapshot iterates each initial participant's province list.
 // Web provinces are all real land districts; no third-country census enters.
 if(history==='complete')for(const nationId of c.participants.map(p=>s.nationIds.find(n=>n[0]===p.stateId)![1])){
  const stateId=stateNumber(r,nationId),owned=orderedWar28Provinces(r,nationId);
  c.initialProvinceCounts.push([stateId,owned.length]);
  for(const p of owned)c.initialOwners.push([provinceNumber(s,p.id),stateId]);
  const capital=r.world.cities.find(x=>x.id===r.world.nations.find(n=>n.id===nationId)!.capitalId);
  if(capital)c.initialCapitals.push([stateId,provinceNumber(s,capital.provinceId)]);
 }
 assertWars47({...s,nextId:s.nextId+1,campaigns:[...s.campaigns,c]},r,true);
 advanceRevision(s);s.nextId++;s.campaigns.push(c);return c;
}

/** The unchanged integer ledger remains separate. Only this callback accepts
 * source-backed per-attacker floating military damage, including overkill. */
export type RawWarDamageSink=(killer:string,victim:string,amount:number,warId?:number)=>void;
export function war28DamageSink(s:War46Wars,r:War28World):RawWarDamageSink{
 return (killer,victim,amount,warId)=>{
  if(!Number.isFinite(amount)||amount!==f(amount))throw Error('战争伤害必须是有限原始军力数值。');
  if(!(amount>0))return;
  const k=stateNumber(r,killer),v=stateNumber(r,victim);
  const opposite=(c:War46Campaign)=>{const a=c.participants.find(p=>p.stateId===k),b=c.participants.find(p=>p.stateId===v);return c.endedTick===null&&!!a&&!!b&&a.side!==b.side;};
  // Explicit war identity never falls back. Otherwise native active order wins.
  const c=warId===undefined?s.campaigns.find(opposite):s.campaigns.find(c=>c.id===warId&&opposite(c));
  if(!c)return;
  const kills=c.kills.find(x=>x[0]===k),deaths=c.deaths.find(x=>x[0]===v);
  const nextKills=f((kills?.[1]??0)+amount),nextDeaths=f((deaths?.[1]??0)+amount);
  if(!Number.isFinite(nextKills)||!Number.isFinite(nextDeaths))throw Error('战争伤害累计溢出，本批未写入。');
  advanceRevision(s);if(kills)kills[1]=nextKills;else c.kills.push([k,nextKills]);if(deaths)deaths[1]=nextDeaths;else c.deaths.push([v,nextDeaths]);
 };
}
export function nativeWar46(c:War46Campaign):NativeExecutableWar&{rebelStateId:number;casusBelliId:number}{
 if(c.history!=='complete'||!c.attacker||!c.defender||c.startTime===null)throw Error('旧战争缺少开战历史，不能计算完整战争分或自动和约。');
 const all=c.coalition?.members??[...c.participants,...c.destroyedParticipants],attacker=all.find(p=>p.side===0&&(!('isPrimary'in p)||p.isPrimary)),defender=all.find(p=>p.side===1&&(!('isPrimary'in p)||p.isPrimary));
 if(!attacker||!defender)throw Error('战争历史主攻或主守身份缺失。');
 return {id:c.id,internal:!!c.internal,legacyWarType:c.internal?.legacyType??0,rebelStateId:c.internal?.rebelStateId??-1,casusBelliId:c.internal?.casusBelliId??0,blankConquerable:false,motherStateId:c.internal?.motherStateId??-1,annexationConquerorId:-1,
 primaryAttackerId:attacker.stateId,primaryDefenderId:defender.stateId,startTime:c.startTime,
 participants:structuredClone(c.participants),destroyedParticipants:structuredClone(c.destroyedParticipants),goals:structuredClone(c.goals),
 initialOwners:new Map(c.initialOwners),initialProvinceCounts:new Map(c.initialProvinceCounts),initialCapitals:new Map(c.initialCapitals),killsByState:new Map(c.kills),deathsByState:new Map(c.deaths)};
}
export const war28Months=(r:War28World,time:number)=>nativeGetMonthSince(time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));

/** No current-territory backfill for copied ongoing wars. The UI can expose
 * their new raw damage, but score/automatic settlement must remain unknown. */
export function importUnknownWars28(s:War46Wars,r:War28World){
 for(const relation of r.world.statecraft!.relations)if(relation.status==='war'&&!s.campaigns.some(c=>c.endedTick===null&&coversPair46(c,s,relation.a,relation.b)))registerWar46(s,r,relation.a,relation.b,[],'unknown');
}
export function reconcileParticipants28(s:War46Wars,r:War28World){
 for(const c of s.campaigns){if(c.endedTick!==null)continue;
  const vanished=c.participants.filter(p=>{const n=Object.entries(r.people.nations).find(([,v])=>v.id===p.stateId)?.[0];return !n||!r.world.provinces.some(v=>v.controller===n);});
  if(vanished.length){advanceRevision(s);c.participants=c.participants.filter(p=>!vanished.includes(p));c.destroyedParticipants.push(...vanished);}
  const relation=r.world.statecraft!.relations.find(x=>relationIdentity(x.a,x.b,x.sinceDay)===c.relationId&&x.status==='war');
  if(!relation){advanceRevision(s);c.endedTick=r.clock.tick;}
 }
}
