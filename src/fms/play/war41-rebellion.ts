import type {War41Run} from './war41-model';
import {buildParticipants41,openCoalitionRelations41} from './war41-coalition';
import type {Vassal41} from './war41-vassals';
import {nativeVassalRebellion,nativeRebellionResistance,type NativeRebellionReason} from './native-war/vassal-rebellion';
import {nativeSuppressionDestiny} from './native-war/suppression-destiny';
import traits from './native-economy/character-traits.json';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';
import {diplomacyRandom41} from './war41-state';
import {nativeWar41,registerWar41,stateNumber} from './war41-wars';
import {war41Queries} from './war41-query';
import {war28Policy} from './war28-policy';
import {war26Strength} from './war26-strength';
import {reconcileWar26} from './war26-state';
import {reconcileLosses} from './war27-losses';
import {graphFor} from './naval-rules';
import {presentationOf} from './war41-model';
import {nationsAtWar,setDecision} from './realtime-statecraft';
import {announce,captureTransitions} from './chronicle-records';

export const REBELLION_REASONS41:Record<NativeRebellionReason,string>={powerful:'实力已接近宗主',war:'宗主在战争中溃败',destiny:'国运高于宗主',development:'长期发展积累了实力',default:'独立意愿触发'};
export type RebellionRecord41={warId:number;relationIndex:number;day:number;tick:number;years:number;strengthRatio:number;destinyDifference:number;reason:NativeRebellionReason};
export type Rebellion41={version:1;revision:number;originDay:number;lastDay:number;enabled:boolean;records:RebellionRecord41[]};
export const initialRebellion41=(day:number):Rebellion41=>({version:1,revision:0,originDay:day,lastDay:day,enabled:true,records:[]});
const bump=(s:Rebellion41)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('独立战争历史超过安全范围。');s.revision++;};
export function rebellionSituation41(r:War41Run,v:Vassal41){
 const f=Math.fround,id=r.people.nations[v.overlordId].leaderId,leader=id!==null?r.people.persons[id]:null;
 const resistance=leader&&leader.id>0&&leader.alive?nativeRebellionResistance(leader.traits.map(name=>{const t=traits.traits.find(t=>t.name===name);if(!t)throw Error('人物特性缺失。');return t;})):0;
 const strengthRatio=f(war26Strength(r.world,r,v.vassalId)/war26Strength(r.world,r,v.overlordId)),destinyDifference=f(r.destiny.nations[v.vassalId].destiny-r.destiny.nations[v.overlordId].destiny);
 const years=nativeGetYearSince(v.time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
 return {years,strengthRatio,destinyDifference,resistance};
}
export function setRebellion41(r:War41Run,enabled:boolean,revision:number){if(typeof enabled!=='boolean'||revision!==r.rebellion.revision)throw Error('附庸自主独立设置预览已过期。');if(r.rebellion.enabled!==enabled){bump(r.rebellion);r.rebellion.enabled=enabled;}}
/** Native Update evaluates monthly BEFORE quarter/already-at-war checks.
 * The persisted browser RNG replaces Unity's process-global stream; it is
 * deterministic here but is not claimed to produce the original seed result. */
export function advanceRebellion41(r:War41Run){
 const s=r.rebellion;if(r.world.day===s.lastDay)return;if(r.world.day!==s.lastDay+1)throw Error('附庸日历不连续，本批取消。');s.lastDay=r.world.day;bump(s);if(!s.enabled)return;
 const q=war41Queries(r,r.nativeWars,war28Policy(r)),pending:{index:number;reason:NativeRebellionReason;info:ReturnType<typeof rebellionSituation41>}[]=[];
 for(const [index,v]of r.vassals.records.entries()){
  if(v.endedTick!==null||v.updateDay!==r.life.currentDate.day)continue;
  const info=rebellionSituation41(r,v),lord=stateNumber(r,v.overlordId);
  const reason=nativeVassalRebellion({...info,overlordCollapsed:()=>r.nativeWars.campaigns.some(c=>c.endedTick===null&&c.history==='complete'&&c.participants.some(p=>p.stateId===lord)&&q.hasStateCollapsed(nativeWar41(c),lord)),randomValue:()=>Math.fround(diplomacyRandom41(r.nativeDiplomacy))});
  if(reason&&r.life.currentDate.month%3===0)pending.push({index,reason,info});
 }
 for(const {index,reason,info}of pending){const v=sameRelation(r,index);if(nationsAtWar(r.world,v.vassalId,v.overlordId))continue;
  const relation=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(v.vassalId)&&[p.a,p.b].includes(v.overlordId));if(!relation)throw Error('独立战争外交关系缺失。');
  const before=structuredClone(r.world),a=stateNumber(r,v.vassalId),b=stateNumber(r,v.overlordId),internal={casusBelliId:16 as const,legacyType:10 as const,rebelStateId:a,motherStateId:b};
  const members=buildParticipants41(r,v.vassalId,v.overlordId,internal);openCoalitionRelations41(r,members);
  const war=registerWar41(r.nativeWars,r,v.vassalId,v.overlordId,[{id:1,type:7,addedBy:a,target:b,beneficiary:a,scope:{provinceIds:[],requiredCount:0}}],'complete',internal,members);
  s.records.push({warId:war.id,relationIndex:index,day:r.world.day,tick:r.clock.tick,years:info.years,strengthRatio:info.strengthRatio,destinyDifference:info.destinyDifference,reason});
  r.nativeDiplomacy.nations[v.vassalId].activeTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.nations[v.overlordId].passiveTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.revision++;
  reconcileWar26(r.world,r.warfare,graphFor(presentationOf(r)),r.clock.tick,(w,id)=>war26Strength(w,r,id));reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);
  const name=(id:string)=>r.world.nations.find(n=>n.id===id)!.name,detail=`${REBELLION_REASONS41[reason]}；已附属 ${info.years} 年。保持宗属关系直到实际和约解除，交战期间不缴贡金。`;
  announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${name(v.vassalId)}对${name(v.overlordId)}发动独立战争`,detail,[v.vassalId,v.overlordId],null);
  setDecision(r.world,v.vassalId,'独立战争',detail);setDecision(r.world,v.overlordId,'应对反叛',detail);captureTransitions(r.chronicle,before,r.world,r.clock.tick);
 }
}
function sameRelation(r:War41Run,index:number){const v=r.vassals.records[index];if(!v||v.endedTick!==null)throw Error('附庸关系已变化。');return v;}
export function suppressionDestiny41(r:War41Run,id:string){
 const land=r.world.provinces.filter(p=>p.controller===id).length,s=r.destiny.nations[id];
 // Live web nations are ordinary nonblank playable states. Land is the real
 // simulation province census, not visual terrain samples or sea cells.
 const value=nativeSuppressionDestiny({eligible:land>0,otherEligibleAlive:r.world.provinces.some(p=>p.controller!==id),totalLand:r.world.provinces.length,ownLand:land,manifest:s.manifest,manifestCount:s.manifestCount,value:()=>Math.fround(diplomacyRandom41(r.nativeDiplomacy)),intRange:(min,max)=>min+Math.floor(diplomacyRandom41(r.nativeDiplomacy)*(max-min))});
 if(value!==null){s.destiny=value;r.upperCombat.nations[id].destiny=value;r.destiny.revision++;}
}
const keys=['version','revision','originDay','lastDay','enabled','records'],rowKeys=['warId','relationIndex','day','tick','years','strengthRatio','destinyDifference','reason'];
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,k:string[])=>obj(v)&&Object.keys(v).some(x=>!k.includes(x));
export function assertRebellionSchema41(v:unknown){const s=v as Rebellion41|undefined;if(unknown(v,keys)||s?.version!=null&&s.version!==1||Array.isArray(s?.records)&&s.records.some(e=>unknown(e,rowKeys)||e?.reason!=null&&!Object.hasOwn(REBELLION_REASONS41,e.reason)))throw Error('独立战争记录含未来规则，已锁定读写。');}
export function assertRebellion41(s:Rebellion41,r:War41Run){
 assertRebellionSchema41(s);const fail=()=>{throw Error('独立战争记录损坏，已保留原档。');},int=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max,f32=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&Math.fround(x)===x;
 if(!obj(s)||Object.keys(s).length!==keys.length||s.version!==1||!int(s.revision)||!int(s.originDay,0,r.world.day)||s.lastDay!==r.world.day||typeof s.enabled!=='boolean'||!Array.isArray(s.records))return fail();
 const seen=new Set<number>();let last=0;
 for(const e of s.records){if(!obj(e)||Object.keys(e).length!==rowKeys.length||!int(e.warId,1)||seen.has(e.warId)||!int(e.relationIndex,0,r.vassals.records.length-1)||!int(e.day,s.originDay+1,r.world.day)||e.tick!==e.day*120||e.tick<last||!int(e.years,12)||!f32(e.strengthRatio)||e.strengthRatio<0||!f32(e.destinyDifference)||Math.abs(e.destinyDifference)>100)return fail();
  const v=r.vassals.records[e.relationIndex],w=r.nativeWars.campaigns.find(w=>w.id===e.warId),date=isoPlusDays(r.life.startDate,e.day-r.life.originDay);
  if(!w?.internal||w.openedTick!==e.tick||w.attacker!==v.vassalId||w.defender!==v.overlordId||v.tick>e.tick||v.endedTick!==null&&v.endedTick<e.tick||date.day!==v.updateDay||date.month%3!==0||e.years!==nativeGetYearSince(v.time,w.startTime!,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate))||(e.reason==='powerful')!==(e.strengthRatio>Math.fround(.85)))return fail();seen.add(e.warId);last=e.tick;
 }
 if(r.nativeWars.campaigns.some(w=>w.internal&&!seen.has(w.id)))return fail();
}
