import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {nativeTributeAmount,nativeTributePayment} from './native-war/vassal-tribute';
import {nativeVassalRebellion,nativeRebellionResistance,type NativeRebellionReason} from './native-war/vassal-rebellion';
import traits from './native-economy/character-traits.json';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {nationsAtWar} from './realtime-statecraft';
import {war26Strength} from './war26-strength';
import {nativeWar46,registerWar46,stateNumber} from './war47-wars';
import {peaceQueries47} from './civilization47-war-settlement';
import {buildParticipants47,openCoalitionRelations47} from './civilization47-diplomatic-world';
import {diplomacyRandom46} from './civilization47-diplomatic-state';
import {announce} from './civilization47-history';

/** Original VassalManager.Update (658A50) on the live 47 run: December tribute
 * on each relation's update day, and the monthly independence check that
 * starts a real internal war (casus belli 16) in quarter months. The recovered
 * build gates the whole manager with the "允许附庸叛乱" option
 * (isAllowVassalAutoRebel), so one switch controls both. */
export const REBELLION_REASONS47:Record<NativeRebellionReason,string>={powerful:'实力已接近宗主',war:'宗主在战争中溃败',destiny:'国运高于宗主',development:'长期发展积累了实力',default:'独立意愿触发'};
export type TributeReceipt47={vassalId:string;overlordId:string;tick:number;year:number;dateDay:number;status:'paid'|'insufficient'|'at-war';amount:number|null};
export type Independence47={warId:number;vassalId:string;overlordId:string;tick:number;years:number;reason:NativeRebellionReason};
export type VassalManager47={version:1;revision:number;lastDay:number;enabled:boolean;receipts:TributeReceipt47[];rebellions:Independence47[]};
export const initialVassalManager47=(day:number):VassalManager47=>({version:1,revision:0,lastDay:day,enabled:true,receipts:[],rebellions:[]});
type Run=PoliticalRun47&{vassalManager:VassalManager47};
const bump=(s:VassalManager47)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('附庸记录超过安全范围。');s.revision++;};
const alive=(r:PoliticalRun47,id:string)=>r.world.provinces.some(p=>p.controller===id);
const name=(r:PoliticalRun47,id:string)=>r.world.nations.find(n=>n.id===id)!.name;

export function quoteTribute47(r:PoliticalRun47,vassalId:string){
  const v=r.vassals.records.find(v=>v.vassalId===vassalId&&v.endedTick===null);if(!v)return null;
  const d=r.life.currentDate;return {amount:nativeTributeAmount(r.finance.nations[vassalId].goldPerMonth,v.tributeRate),year:d.year+(d.month===12&&d.day>=v.updateDay?1:0),day:v.updateDay};
}
function situation(r:PoliticalRun47,vassalId:string,overlordId:string,time:number){
  const f=Math.fround,id=r.people.nations[overlordId].leaderId,leader=id!==null?r.people.persons[id]:null;
  const resistance=leader&&leader.id>0&&leader.alive?nativeRebellionResistance(leader.traits.map(t=>{const found=traits.traits.find(v=>v.name===t);if(!found)throw Error('人物特性缺失。');return found;})):0;
  const strengthRatio=f(war26Strength(r.world,r,vassalId)/war26Strength(r.world,r,overlordId)),destinyDifference=f(r.destiny.nations[vassalId].destiny-r.destiny.nations[overlordId].destiny);
  const years=nativeGetYearSince(time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
  return {years,strengthRatio,destinyDifference,resistance};
}
/** Daily, after peace and diplomacy for the day. Missed dates are never billed. */
export function advanceVassalManager47(r:Run){
  const s=r.vassalManager;if(r.world.day===s.lastDay)return;
  if(r.world.day!==s.lastDay+1)throw Error('附庸日历不连续，本批取消。');
  s.lastDay=r.world.day;bump(s);if(!s.enabled)return;
  const date=r.life.currentDate;
  if(date.month===12)for(const v of r.vassals.records){
    if(v.endedTick!==null||v.updateDay!==date.day||!alive(r,v.vassalId)||!alive(r,v.overlordId))continue;
    const a=r.finance.nations[v.vassalId],b=r.finance.nations[v.overlordId];
    const payment=nativeTributePayment({gold:a.gold,overlordGold:b.gold,goldPerMonth:a.goldPerMonth,rate:v.tributeRate,atWar:nationsAtWar(r.world,v.vassalId,v.overlordId)});
    s.receipts.push({vassalId:v.vassalId,overlordId:v.overlordId,tick:r.clock.tick,year:date.year,dateDay:date.day,status:payment.status,amount:payment.amount});s.receipts=s.receipts.slice(-256);
    a.gold=payment.gold;b.gold=payment.overlordGold;
  }
  const q=peaceQueries47(r),pending:{vassalId:string;overlordId:string;reason:NativeRebellionReason;years:number}[]=[];
  for(const v of r.vassals.records){
    if(v.endedTick!==null||v.updateDay!==date.day||!alive(r,v.vassalId)||!alive(r,v.overlordId))continue;
    const info=situation(r,v.vassalId,v.overlordId,v.time),lord=stateNumber(r,v.overlordId);
    const reason=nativeVassalRebellion({...info,overlordCollapsed:()=>r.nativeWars.campaigns.some(c=>c.endedTick===null&&c.history==='complete'&&c.participants.some(p=>p.stateId===lord)&&q.hasStateCollapsed(nativeWar46(c),lord)),randomValue:()=>Math.fround(diplomacyRandom46(r.nativeDiplomacy))});
    if(reason&&date.month%3===0)pending.push({vassalId:v.vassalId,overlordId:v.overlordId,reason,years:info.years});
  }
  for(const p of pending){
    if(nationsAtWar(r.world,p.vassalId,p.overlordId))continue;
    const a=stateNumber(r,p.vassalId),b=stateNumber(r,p.overlordId),internal={casusBelliId:16 as const,legacyType:10 as const,rebelStateId:a,motherStateId:b};
    const members=buildParticipants47(r,p.vassalId,p.overlordId,internal);openCoalitionRelations47(r,members);
    const war=registerWar46(r.nativeWars,r,p.vassalId,p.overlordId,[{id:1,type:7,addedBy:a,target:b,beneficiary:a,scope:{provinceIds:[],requiredCount:0}}],'complete',internal,members);
    s.rebellions.push({warId:war.id,vassalId:p.vassalId,overlordId:p.overlordId,tick:r.clock.tick,years:p.years,reason:p.reason});
    r.nativeDiplomacy.nations[p.vassalId].activeTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.nations[p.overlordId].passiveTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.revision++;
    // Original VassalRebellionEvent text.
    announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${name(r,p.vassalId)}反抗其宗主国${name(r,p.overlordId)}`,`${REBELLION_REASONS47[p.reason]}；已附属 ${p.years} 年。保持宗属关系直到实际和约解除，交战期间不缴贡金。`,[p.vassalId,p.overlordId],null);
  }
}
export function setVassalManager47(r:Run,enabled:boolean){
  if(typeof enabled!=='boolean'||enabled===r.vassalManager.enabled)throw Error('附庸叛乱开关已变化。');
  r.vassalManager.enabled=enabled;bump(r.vassalManager);
}
