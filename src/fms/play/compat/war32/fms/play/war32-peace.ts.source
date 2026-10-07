import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant,nativeMaximumDurationWarIds} from './native-war/peace';
import {nativeWar28} from './war28-state';
import {war28Queries} from './war28-query';
import {war28Policy} from './war28-policy';
import type {War32Run} from './war32-model';
import {settleWar32} from './war32-settlement';
export {WAR28_PEACE_LABELS} from './war28-settlement';
export const war29Policy=(r:War32Run)=>({...war28Policy(r),autonomousDiplomacy:(id:string)=>r.diplomacy.nations[id]===true});
export function hasWar29Extinction(r:Pick<War32Run,'world'|'nativeWars'>){
 const owners=new Set(r.world.provinces.map(p=>p.controller));
 return r.nativeWars.campaigns.some(c=>c.endedTick===null&&c.history==='complete'&&(!owners.has(c.attacker!)||!owners.has(c.defender!)));
}
/** Manager timeouts are independent of national AI switches and the 36-month
 * fatigue gate. Native world default/max are 240/480; zero disables deadline.
 * TimeManager.AdvanceOneDay 5215E0 invokes both on calendar day 1, with
 * maximum-duration settlement before ordinary EvaluatePeace. */
export function advanceWar32Peace(r:War32Run,checkMonthStart=true){
 const active=()=>r.nativeWars.campaigns.filter(c=>c.endedTick===null&&c.history==='complete');
 const queries=()=>war28Queries(r,r.nativeWars,war29Policy(r));
 // Territory extinction is lifecycle cleanup, not an optional peace offer.
 for(const c of active()){const w=nativeWar28(c),q=queries();if(q.isDeadOrZero(w.primaryAttackerId)||q.isDeadOrZero(w.primaryDefenderId))settleWar32(r,c,2);}
 if(!checkMonthStart||!r.diplomacy.worldAuto||r.life.currentDate.day!==1)return;
 const due=nativeMaximumDurationWarIds(active().map(nativeWar28),true,r.diplomacy.maximumMonths,queries());
 for(const id of due){const c=active().find(c=>nativeWar28(c).id===id);if(c&&settleWar32(r,c,4)){
  const event=r.world.events.at(-1)!;event.reason=`达到世界设置的 ${r.diplomacy.maximumMonths} 个月战争期限，按当前战局结算。${event.reason}`;
  for(const n of r.world.statecraft!.nations)if(c.nations.includes(n.nationId)&&n.lastDecision)n.lastDecision.reason=event.reason;
 }}
 for(const c of active()){const w=nativeWar28(c),q=queries();if(!nativeHasAutonomousDiplomacyParticipant(w,q))continue;const reason=nativeDecidePeaceReason(w,q);if(reason!==null)settleWar32(r,c,reason);}
}
