import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {invalidatePoliticalRoutes47} from './civilization47-diplomatic-world';
import {nativeWar46,reconcileParticipants28,type War46Campaign} from './war47-wars';
import {war28Queries} from './civilization47-war-query';
import {WAR28_LOSS_THRESHOLD} from './war28-policy';
import {nativeBuildSettlementPlan} from './native-war/settlement-plan';
import {nativeExecuteSettlement} from './native-war/settlement-execute';
import {nativeBuildEffect,nativeEffectResult,nativeReparationAmount} from './native-war/settlement-effects';
import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant,nativeMaximumDurationWarIds,type NativePeaceReason} from './native-war/peace';
import {WAR28_PEACE_LABELS} from './war28-settlement';
import {participantNationIds46,opposedPairs46,coversPair46} from './war46-coalition';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {reconcileCore} from './upper14-state';
import {reconcileOccupation} from './occupation';
import {actualForces47} from './force-runtime47';
import {reconcileForceContactsOwned47,forceKey47} from './force-motion47';
import {nationsAtWar} from './realtime-statecraft';
import {reconcileMilitaryClock47} from './force-tick47';
import {settlePortPeaceOwned47,reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {reconcileLosses} from './war27-losses';
import {graphFor47 as graphFor46} from './sea-geography47';
import {announce} from './chronicle-records';
import {refreshLeaderCombat47} from './civilization47-combat-state';
import {reconcileNativeDiplomacy46} from './civilization47-diplomatic-state';
export const peaceQueries47=(r:PoliticalRun47)=>war28Queries(r,r.nativeWars,{territoryLossThreshold:id=>WAR28_LOSS_THRESHOLD[r.civilization.nations[id].polity],autonomousDiplomacy:id=>r.diplomacy.nations[id]});
/** All reconciliation is at zero elapsed time and reads actual47 ledgers. */
export function reconcileDiplomaticForces47(r:PoliticalRun47,participants:Set<string>){
  r.occupation=reconcileOccupation(r.world,r.occupation).occupation;
  reconcileCore(r.world,r.upperCombat);reconcilePortLandOwnersOwned47(r);settlePortPeaceOwned47(r,participants);
  invalidatePoliticalRoutes47(r);
  const {spatial,forces}=actualForces47(r),regions=new Map(r.diplomaticGeography.water.flatMap(p=>p.faces.map(face=>[face,p.id] as const)));
  const contact=reconcileForceContactsOwned47(forces,spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),face=>regions.get(face)!);
  r.forceContacts=contact.contacts;
  for(const a of r.world.armies)if(a.troops>0&&a.status!=='destroyed'&&a.status!=='retreating')a.status=contact.held.has(forceKey47({kind:'army',id:a.id}))?'fighting':'idle';
  reconcileMilitaryClock47(r,r.clock.tick);refreshLeaderCombat47(r,r.combatPersonnel);
  reconcileWar26(r.world,r.warfare,graphFor46(r),r.clock.tick,(world,id)=>war26Strength(world,r,id));reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);
}
/** Native plan/execute contract, actual47 ownership/economy projection.
 * This slice enables external territorial goals and reparations; it never
 * dispatches unimplemented internal/vassal/religious settlement effects. */
export function settleWar47(r:PoliticalRun47,c:War46Campaign,reason:NativePeaceReason){
  if(c.endedTick!==null)return false;
  if(c.internal)throw Error('内部战争须由完整政治登记器结算。');
  if(c.history==='unknown'&&reason!==11&&reason!==2)throw Error('开局战争没有宣战史，不能推算和约。');
  const q=peaceQueries47(r),participants=participantNationIds46(r.nativeWars,c),key=(id:number)=>{const out=r.nativeWars.nationIds.find(n=>n[0]===id)?.[1];if(!out)throw Error('战争国家身份缺失。');return out;};
  const w=c.history==='complete'?nativeWar46(c):null;
  const plan=w?nativeBuildSettlementPlan(w,reason,{...q,buildEffect:nativeBuildEffect,buildInternalPlan:()=>{throw Error('内部战争尚未注册。');}}):null;
  const confirmedOwnership:[number,number][]=[];
  const stripOffice=(pid:number)=>{for(const n of Object.values(r.people.nations)){const old=n.offices.assignments??[],next=old.filter(a=>!a||a.officeId!=='Governor'||a.scopeId!==pid);if(next.length!==old.length){n.offices.assignments=next;n.offices.revision++;r.people.revision++;}}};
  const idFor=(state:ReturnType<typeof q.state>)=>{const id=r.nativeWars.nationIds.find(([id])=>q.state(id)===state)?.[0];if(id===undefined)throw Error('和约国家不存在。');return id;};
  const color=(id:number)=>{const h=r.world.nations.find(n=>n.id===key(id))!.color.slice(1);return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255,a:1};};
  if(w)nativeExecuteSettlement(w,plan,{...q,capitalFallSuppression:{depth:0},stateId:idFor,stateColor:s=>color(idFor(s)),
    conquerProvince:(province,target)=>{const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[province.id-1])!,owner=key(idFor(target));if(p.controller!==owner)transferEconomy(r.world,p.id,p.controller,owner);p.controller=owner;if(participants.includes(p.legalOwner))p.legalOwner=owner;stripOffice(province.id);reconcileCore(r.world,r.upperCombat);reconcileParticipants28(r.nativeWars,r);w.participants=structuredClone(c.participants);w.destroyedParticipants=structuredClone(c.destroyedParticipants);},
    makeConquestAnimation:(_p,_from,_to,transfer)=>transfer,playConquestAnimations:()=>{},warnTransfer:()=>{},warnEffect:()=>{},
    applyEffect:e=>{if(e.type!==6)throw Error('当前外交尚未启用该和约效果。');const a=q.state(e.beneficiary),b=q.state(e.target);if(!a||!b||b.dead)return nativeEffectResult(e,2,'赔款受益方或承担方不存在/已灭亡');const amount=nativeReparationAmount(b.gold,b.goldPerMonth);b.gold=(b.gold-amount)|0;a.gold=(a.gold+amount)|0;return nativeEffectResult(e,0,null);},
    classifyInternal:()=>{throw Error('内部战争尚未注册。');},trySuppressionDestiny:()=>{throw Error('内部战争尚未注册。');},wasSettlementOutcomeRecorded:()=>c.settlement!==null,recordOutcome:()=>{},logOutcomeComparison:()=>{},
  });
  if(plan)for(const [pid,original]of c.initialOwners){const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[pid-1])!,owner=q.currentOwner(pid);if(owner!==original&&participants.includes(p.controller)&&participants.includes(p.legalOwner)){if(p.legalOwner!==p.controller){p.legalOwner=p.controller;stripOffice(pid);}confirmedOwnership.push([pid,owner]);}}
  for(const [a,b]of opposedPairs46(r.nativeWars,c)){
    if(r.nativeWars.campaigns.some(other=>other!==c&&other.endedTick===null&&coversPair46(other,r.nativeWars,a,b)))continue;
    const rel=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(a)&&[p.a,p.b].includes(b))!;rel.status='peace';rel.sinceDay=r.world.day;rel.truceUntilDay=r.world.day+10;
  }
  c.settlement=w?{reason,tick:r.clock.tick,winnerSide:plan?.winnerSide??null,outcomes:[...(plan?.outcomes??[])],enforcedGoals:[...(plan?.enforcedGoals??[])],transfers:structuredClone(plan?.appliedTransfers??[]),effects:structuredClone(plan?.effectResults??[]),confirmedOwnership}:null;
  c.endedTick=r.clock.tick;r.nativeWars.revision++;
  const label=WAR28_PEACE_LABELS[reason],names=c.nations.map(id=>r.world.nations.find(n=>n.id===id)!.name);
  announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${names.join('与')}的战争结束：${label}`,`${reason===11?'玩家干预停战，不执行割地和赔款。':plan?`按原作和约规则执行：${plan.appliedTransfers.length}项转地。`:'开局缺少宣战史，只结束已失去参战条件的战争，不编造条款。'}其他仍在进行的战争保留。`,participants,null);
  reconcileDiplomaticForces47(r,new Set(participants));reconcileNativeDiplomacy46(r.nativeDiplomacy,r);return true;
}
export function advancePeace47(r:PoliticalRun47,monthStart:boolean){
  const active=()=>r.nativeWars.campaigns.filter(c=>c.endedTick===null);
  for(const id of active().map(c=>c.id)){const c=r.nativeWars.campaigns.find(c=>c.id===id)!;if(c.nations.some(id=>!r.world.provinces.some(p=>p.controller===id)))settleWar47(r,c,2);}
  if(!monthStart||!r.diplomacy.worldAuto||r.life.currentDate.day!==1)return;
  const complete=()=>active().filter(c=>c.history==='complete'),q=peaceQueries47(r);
  for(const id of nativeMaximumDurationWarIds(complete().map(nativeWar46),true,r.diplomacy.maximumMonths,q)){const c=complete().find(c=>c.id===id);if(c)settleWar47(r,c,4);}
  for(const id of complete().map(c=>c.id)){const c=r.nativeWars.campaigns.find(c=>c.id===id)!;if(c.endedTick!==null)continue;const w=nativeWar46(c);if(!nativeHasAutonomousDiplomacyParticipant(w,q))continue;const reason=nativeDecidePeaceReason(w,q);if(reason!==null)settleWar47(r,c,reason);}
}
