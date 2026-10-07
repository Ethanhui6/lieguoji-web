import {nativeCountLand,nativeInitialLand,nativeWarScoreParts,nativeSideLoss,nativeAverageGoal,type NativeWarSide,type NativeWarGoal} from './score';
import {nativeWarDistress,nativeWarSide,type NativeFatigueQueries} from './weariness';
import type {NativePeaceWar,NativePeaceReason} from './peace';

export type NativeSettlementGoal=NativeWarGoal&{id:number};
export type NativeSettlementWar=Omit<NativePeaceWar,'goals'>&{annexationConquerorId:number;goals:NativeSettlementGoal[]};
export type NativeVerdictQueries=NativeFatigueQueries&{hasStateCollapsed:(war:NativePeaceWar,id:number)=>boolean};
const f=Math.fround;
/** PeaceResolverV2.DetermineVictorSide 66EA60. A side verdict is not the
 * outcome of every participating country; classification follows effects. */
export function nativeDetermineVictor(w:NativeSettlementWar,reason:NativePeaceReason,q:NativeVerdictQueries):NativeWarSide|null{
 const defender=q.state(w.primaryDefenderId);
 const dCollapsed=!defender||defender.dead||!defender.provinces?.length||q.hasStateCollapsed(w,w.primaryDefenderId);
 const attacker=q.state(w.primaryAttackerId);
 const aCollapsed=!attacker||attacker.dead||!attacker.provinces?.length||q.hasStateCollapsed(w,w.primaryAttackerId);
 if(aCollapsed&&dCollapsed)return null;if(aCollapsed)return 1;if(dCollapsed)return 0;
 if(reason===0||reason===9)return 0;
 const a=nativeWarDistress(w,w.primaryAttackerId,q),d=nativeWarDistress(w,w.primaryDefenderId,q);
 if(d>=f(.45)&&f(d-a)>=f(.25))return 0;
 if(a>=f(.45)&&f(a-d)>=f(.25))return 1;
 const score=nativeWarScoreParts(w,q);if(score.score>=50)return 0;if(score.score<=-50)return 1;
 if(reason===4){
  const attackerLoss=nativeSideLoss(w,0,q),defenderLoss=nativeSideLoss(w,1,q),territory=f(Math.max(-1,Math.min(1,f(defenderLoss-attackerLoss)))*100);
  const attackerGoal=nativeAverageGoal(w,0,q),defenderGoal=nativeAverageGoal(w,1,q),goal=Math.max(-1,Math.min(1,f(attackerGoal-defenderGoal)));
  if(territory>=10&&goal>0)return 0;if(territory<=-10||territory<=0&&f(a-d)>=f(.1))return 1;
 }
 return null;
}
/** ShouldDecisiveAnnex 6716E0. FatigueTimeout exclusion belongs to the caller,
 * so existing annexation flags are not accidentally cleared here. */
export function nativeShouldDecisiveAnnex(w:NativeSettlementWar,victor:NativeWarSide|null,q:NativeVerdictQueries){
 if(victor!==0)return false;const attacker=q.state(w.primaryAttackerId),defender=q.state(w.primaryDefenderId);
 if(!attacker||!defender||defender.dead)return false;const current=nativeCountLand(q.state(w.primaryDefenderId));if(current<1)return false;
 if(w.goals.some(g=>g.type===3)){
  const initial=nativeInitialLand(w,w.primaryDefenderId,q);
  const capitalId=w.initialCapitals?.get(w.primaryDefenderId),capital=capitalId===undefined?null:q.province(capitalId);
  const held=!!capital&&nativeWarSide(w,capital.stateId)===0;
  if(initial>0&&f(current)<=f(f(initial)*f(held?.7:.4)))return true;
 }
 return current<=1&&q.strength(attacker,w.primaryAttackerId)>=f(q.strength(defender,w.primaryDefenderId)*3);
}
