import {militaryAccess44} from './war44-access';
import {nativeBuildInternalPlan,nativeClassifyInternal,type NativeInternalWar} from './native-war/internal-settlement';
import {participantNationIds44,opposedPairs44,coversPair44} from './war44-coalition';
import {nativeLeaveWarDisposition} from './native-war/participation-leave';
import {suppressionDestiny44} from './war44-rebellion';
import {makeVassal44,overlord44,releaseVassal44} from './war44-vassals';
import {nativeBuildSettlementPlan} from './native-war/settlement-plan';
import {nativeExecuteSettlement} from './native-war/settlement-execute';
import {nativeBuildEffect,nativeEffectResult,nativeReparationAmount} from './native-war/settlement-effects';
import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant,type NativePeaceReason} from './native-war/peace';
import type {NativeSettlementPlan} from './native-war/settlement-classification';
import {nativeWar44,reconcileParticipants28,type War44Campaign} from './war44-wars';
import {war44Queries} from './war44-query';
import {war28Policy} from './war28-policy';
import {createFiscalFood} from './war28-food';
import {reconcileCore} from './upper14-state';
import {reconcileCombat} from './war44-battle';
import {reconcileOccupation} from './occupation';
import {reconcileMaritime} from './maritime';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView,type War44Run} from './war44-model';
import {graphFor44 as graphFor} from './war44-geography';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {reconcileLosses} from './war27-losses';

export type War28Settlement={reason:NativePeaceReason;tick:number;winnerSide:0|1|2|null;outcomes:[number,0|1|2][];enforcedGoals:number[];transfers:NativeSettlementPlan['appliedTransfers'];effects:NativeSettlementPlan['effectResults'];confirmedOwnership:[number,number][]};
export const WAR28_PEACE_LABELS:Record<NativePeaceReason,string>={0:'战争目标达成',1:'战局已定',2:'国家无法继续战争',3:'战争结束',4:'战争疲惫',5:'名义和平',6:'战争取消',7:'战争取消',8:'战争取消',9:'投降',10:'战争取消',11:'上帝干预停战'};
const revision=(r:War44Run)=>{if(!Number.isSafeInteger(r.nativeWars.revision+1))throw Error('战争记录超过安全范围。');r.nativeWars.revision++;};
/** Native removes support from current participants without erasing initial
 * ownership/damage. The extra departures log is a web persistence/audit field.
 * Our pairwise military adapter clears only hostilities no live war requires. */
export function leaveWars44(r:War44Run,id:string,settling=new Set<number>()){
 const stateId=r.people.nations[id].id,food=createFiscalFood(r.finance);
 for(const c of [...r.nativeWars.campaigns]){
  if(c.endedTick!==null||settling.has(c.id))continue;
  const disposition=nativeLeaveWarDisposition(nativeWar44(c),stateId);
  if(disposition==='absent')continue;
  if(disposition==='end'){settleWar44(r,c,2,settling);continue;}
  const member=c.participants.find(p=>p.stateId===stateId)!,pairs=opposedPairs44(r.nativeWars,c).filter(p=>p.includes(id));
  if(!c.coalition)throw Error('退战缺少参战来源，已取消本批。');
  c.participants=c.participants.filter(p=>p.stateId!==stateId);
  c.coalition.departures.push({...member,tick:r.clock.tick});revision(r);
  for(const [a,b]of pairs)if(!r.nativeWars.campaigns.some(other=>other.endedTick===null&&coversPair44(other,r.nativeWars,a,b))&&r.world.statecraft!.relations.some(p=>p.status==='war'&&[p.a,p.b].includes(a)&&[p.a,p.b].includes(b)))r.world=food.applyManagementAction(r.world,{type:'make-peace',nationId:a,targetNationId:b},{day:r.world.day,nextEventId:r.world.nextEventId},()=>{});
  r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'diplomacy',text:`${r.world.nations.find(n=>n.id===id)!.name}退出战争`,reason:'宗属关系变更后退出参战；原阵营其余国家继续作战。'});r.world.events=r.world.events.slice(-160);
  if(disposition==='remove-and-end')settleWar44(r,c,2,settling);
 }
 Object.assign(r,reconcileCombat(r.world,r.battles,r.clock.tick,militaryAccess44(r)));Object.assign(r,reconcileOccupation(r.world,r.occupation));r.maritime=reconcileMaritime(maritimeView(tacticsView(campaignView(r)))).maritime;
 reconcileWar26(r.world,r.warfare,graphFor(r),r.clock.tick,(world,id)=>war26Strength(world,r,id));reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);
}
/** Writes only to the session's discardable candidate. Native uses one owner;
 * v28 preserves web occupation while fighting, then confirms ONLY land that
 * belonged to these participants at declaration. Third-party wars stay intact.
 * Manual ceasefire skips settlement and ownership confirmation, as reason 11. */
export function settleWar44(r:War44Run,c:War44Campaign,reason:NativePeaceReason,settling=new Set<number>()){
 if(c.endedTick!==null||c.settlement!==null||settling.has(c.id))return false;
 settling.add(c.id);
 if(c.history!=='complete')throw Error('旧战争缺少开战资料，不能自动分配和约。');
 const w=nativeWar44(c),q=war44Queries(r,r.nativeWars,war28Policy(r));
 const participantIds=participantNationIds44(r.nativeWars,c);
 const key=(id:number)=>{const k=r.nativeWars.nationIds.find(p=>p[0]===id)?.[1];if(!k)throw Error('和约国家身份缺失。');return k;};
 const plan=nativeBuildSettlementPlan(w,reason,{...q,buildEffect:nativeBuildEffect,buildInternalPlan:()=>nativeBuildInternalPlan(w,q)});
 const food=createFiscalFood(r.finance),confirmedOwnership:[number,number][]=[];
 const stripOffice=(pid:number)=>{const officeId=r.world.provinces.findIndex(p=>p.id===r.nativeWars.provinceIds[pid-1])+1;if(!officeId)throw Error('总督地区引用缺失。');for(const n of Object.values(r.people.nations)){const old=n.offices.assignments;if(!old)continue;n.offices.assignments=old.filter(a=>!a||a.officeId!=='Governor'||a.scopeId!==officeId);if(old.length!==n.offices.assignments.length){n.offices.revision++;r.people.revision++;}}};
 const syncParticipants=()=>{reconcileParticipants28(r.nativeWars,r);w.participants=structuredClone(c.participants);w.destroyedParticipants=structuredClone(c.destroyedParticipants);};
 const color=(id:number)=>{const hex=r.world.nations.find(n=>n.id===key(id))!.color.slice(1);return {r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255,a:1};};
 const idFor=(state:ReturnType<typeof q.state>)=>{const id=r.nativeWars.nationIds.find(([id])=>q.state(id)===state)?.[0];if(id===undefined)throw Error('和约执行国家缺失。');return id;};
 nativeExecuteSettlement(w,plan,{...q,capitalFallSuppression:{depth:0},stateId:idFor,stateColor:s=>color(idFor(s)),
  conquerProvince:(province,target)=>{const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[province.id-1]);if(!p)throw Error('和约地区缺失。');const owner=key(idFor(target));if(p.controller!==owner)food.transferEconomy(r.world,p.id,p.controller,owner);p.controller=owner;if(participantIds.includes(p.legalOwner))p.legalOwner=owner;stripOffice(province.id);reconcileCore(r.world,r.upperCombat);syncParticipants();},
  // Existing political rendering animates actual territory data; no fake
  // conquest frames or result state are fabricated here.
  makeConquestAnimation:(_p,_from,_to,transfer)=>transfer,playConquestAnimations:()=>{},warnTransfer:()=>{},warnEffect:()=>{},
  applyEffect:e=>{if(e.type===7&&c.internal?.casusBelliId===16){const rebel=q.state(e.beneficiary);if(!rebel||rebel.dead)return nativeEffectResult(e,2,'反抗方不存在/已灭亡');const id=key(e.beneficiary),lord=overlord44(r,id);if(lord===null)return nativeEffectResult(e,1,'反抗方已经独立');if(lord!==key(e.target))return nativeEffectResult(e,2,'反抗方当前宗主与战争目标不一致');releaseVassal44(r,id,'independence');return nativeEffectResult(e,0,null);}
  if(e.type===4){const a=q.state(e.beneficiary),b=q.state(e.target);if(!a||!b||a.dead||b.dead)return nativeEffectResult(e,2,'宗主或目标不存在/已灭亡');if(!b.provinces?.some(p=>p?.isLand))return nativeEffectResult(e,2,'目标已无陆地行省');const target=key(e.target),lord=key(e.beneficiary);if(overlord44(r,target)===lord)return nativeEffectResult(e,1,'目标已是该受益方的附庸');
   // Existing v30 history with missing initiator cannot safely be settled.
   if(r.nativeWars.campaigns.some(w=>w.endedTick===null&&participantNationIds44(r.nativeWars,w).includes(target)&&w.history!=='complete'))return nativeEffectResult(e,2,'目标仍有旧战争缺失开战资料，请先明确停战。');
   const made=makeVassal44(r,target,lord,id=>leaveWars44(r,id,settling));return nativeEffectResult(e,made.success?0:2,made.reason);
  }if(e.type!==6)return nativeEffectResult(e,2,'该和约效果尚未接入完整世界状态。');const a=q.state(e.beneficiary),b=q.state(e.target);if(!a||!b||b.dead)return nativeEffectResult(e,2,'赔款受益方或承担方不存在/已灭亡');const amount=nativeReparationAmount(b.gold,b.goldPerMonth);b.gold=(b.gold-amount)|0;a.gold=(a.gold+amount)|0;return nativeEffectResult(e,0,null);},
  classifyInternal:(war,plan,actual)=>nativeClassifyInternal(war as NativeInternalWar,plan,actual,q),trySuppressionDestiny:(_s,id)=>suppressionDestiny44(r,key(id)),
  wasSettlementOutcomeRecorded:()=>c.settlement!==null,recordOutcome:()=>{},logOutcomeComparison:()=>{},
 });
 const subjugated=new Set(plan?.effectResults.filter(e=>e.type===4&&e.status<=1).map(e=>e.target)??[]);
 for(const [pid,original]of c.initialOwners){if(!subjugated.has(original))continue;const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[pid-1])!;if(!participantIds.includes(p.controller))continue;const owner=key(original);if(p.controller!==owner)food.transferEconomy(r.world,p.id,p.controller,owner);p.controller=owner;p.legalOwner=owner;stripOffice(pid);}
 if(subjugated.size){reconcileCore(r.world,r.upperCombat);syncParticipants();}
 if(plan){for(const [pid,original]of c.initialOwners){const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[pid-1])!,owner=q.currentOwner(pid);if(owner!==original&&participantIds.includes(p.controller)&&participantIds.includes(p.legalOwner)){if(p.legalOwner!==p.controller){p.legalOwner=p.controller;stripOffice(pid);}confirmedOwnership.push([pid,owner]);}}}
 const names=c.nations.map(id=>r.world.nations.find(n=>n.id===id)!.name),label=WAR28_PEACE_LABELS[reason];
 // A pair may still oppose one another in another live campaign. Ending this
 // war must not erase its real battles, naval orders or diplomatic hostility.
 for(const [a,b]of opposedPairs44(r.nativeWars,c)){
  if(r.nativeWars.campaigns.some(other=>other!==c&&other.endedTick===null&&coversPair44(other,r.nativeWars,a,b)))continue;
  if(!r.world.statecraft!.relations.some(p=>p.status==='war'&&[p.a,p.b].includes(a)&&[p.a,p.b].includes(b)))continue;
  r.world=food.applyManagementAction(r.world,{type:'make-peace',nationId:a,targetNationId:b},{day:r.world.day,nextEventId:r.world.nextEventId},()=>{});
 }
 const last={id:r.world.nextEventId++,day:r.world.day,kind:'diplomacy' as const,text:`${names.join('与')}的战争结束：${label}`,reason:`${label}。本场共有 ${participantIds.length} 国参战；其他仍在进行的战争保留。${plan?`和约已执行：${plan.appliedTransfers.length}项转地、${plan.effectResults.filter(e=>e.status===0).length}项效果。`:'不执行割地与赔款。'}`};r.world.events.push(last);r.world.events=r.world.events.slice(-160);
 for(const id of participantIds){const n=r.world.statecraft!.nations.find(n=>n.nationId===id)!;n.lastDecision={day:r.world.day,action:'结束参战',reason:last.reason};}
 Object.assign(r,reconcileCombat(r.world,r.battles,r.clock.tick,militaryAccess44(r)));Object.assign(r,reconcileOccupation(r.world,r.occupation));r.maritime=reconcileMaritime(maritimeView(tacticsView(campaignView(r)))).maritime;
 c.settlement={reason,tick:r.clock.tick,winnerSide:plan?.winnerSide??null,outcomes:[...(plan?.outcomes??[])],enforcedGoals:[...(plan?.enforcedGoals??[])],transfers:structuredClone(plan?.appliedTransfers??[]),effects:structuredClone(plan?.effectResults??[]),confirmedOwnership};
 c.endedTick=r.clock.tick;revision(r);
 reconcileWar26(r.world,r.warfare,graphFor(r),r.clock.tick,(world,id)=>war26Strength(world,r,id));
 reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);settling.delete(c.id);return true;
}
/** Web scheduling runs once per actual day after combat; elapsed thresholds
 * are still native full calendar months. Manager deadline and internal wars
 * remain separate until their production world settings are represented. */
export function advanceWar44PeaceLegacy(r:War44Run){
 for(const c of [...r.nativeWars.campaigns]){if(c.endedTick!==null||c.history!=='complete')continue;const w=nativeWar44(c),q=war44Queries(r,r.nativeWars,war28Policy(r));
  const destroyed=q.isDeadOrZero(w.primaryAttackerId)||q.isDeadOrZero(w.primaryDefenderId);
  if(!destroyed&&!nativeHasAutonomousDiplomacyParticipant(w,q))continue;
  const reason=destroyed?2:nativeDecidePeaceReason(w,q);if(reason!==null)settleWar44(r,c,reason);
 }
}
