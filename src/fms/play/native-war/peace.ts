import {nativeWarScoreParts,type NativeWarGoal} from './score';
import {nativeShouldForceSettle,nativeWarWeariness,type NativeFatigueWar,type NativeFatigueQueries} from './weariness';

export type NativePeaceReason=0|1|2|3|4|5|6|7|8|9|10|11;
export type NativePeaceWar=NativeFatigueWar&{id:number;legacyWarType:number;blankConquerable:boolean};
export type NativePeaceQueries=NativeFatigueQueries&{
 isDeadOrZero:(id:number)=>boolean;
 hasStateCollapsed:(war:NativePeaceWar,id:number)=>boolean;
 goalAchieved:(war:NativePeaceWar,goal:NativeWarGoal)=>boolean;
 internalGoalsAchieved:(war:NativePeaceWar,minimumMonths:number)=>boolean;
 autonomousDiplomacy:(id:number)=>boolean;
};
export const nativeEnforceableGoal=(type:number)=>type>=0&&type<=4||type>=6&&type<=11;
/** Empty enforceable sets do not end a war. Keep short-circuit query order. */
export function nativeAllEnforceableGoalsAchieved(w:NativePeaceWar,q:NativePeaceQueries){
 let any=false;for(const g of w.goals)if(nativeEnforceableGoal(g.type)){any=true;if(!q.goalAchieved(w,g))return false;}return any;
}
/** WarAIV2.DecideInternalPeaceReason 674A60. Null input is outside the native
 * caller contract. The internal-goal service remains an explicit dependency. */
export function nativeInternalPeaceReason(w:NativePeaceWar,q:NativePeaceQueries):NativePeaceReason|null{
 if(q.isDeadOrZero(w.primaryAttackerId)||q.isDeadOrZero(w.primaryDefenderId))return 2;
 if(w.legacyWarType===2||w.legacyWarType===3)return null;
 return q.internalGoalsAchieved(w,w.legacyWarType===4?24:36)?0:null;
}
/** WarAIV2.DecidePeaceReason 674B40. This supplies a reason; it does not apply
 * a peace, redistribute provinces, or assume a calendar of 30-day months. */
export function nativeDecidePeaceReason(w:NativePeaceWar,q:NativePeaceQueries):NativePeaceReason|null{
 if(w.internal)return nativeInternalPeaceReason(w,q);
 if(w.blankConquerable)return q.isDeadOrZero(w.primaryDefenderId)||q.isDeadOrZero(w.primaryAttackerId)?2:null;
 if(q.monthsSince(w.startTime)>=12&&nativeAllEnforceableGoalsAchieved(w,q))return 0;
 if(q.hasStateCollapsed(w,w.primaryDefenderId)||q.hasStateCollapsed(w,w.primaryAttackerId))return 2;
 if(q.monthsSince(w.startTime)<36)return null;
 if(nativeShouldForceSettle(w,q))return 1;
 const score=nativeWarScoreParts(w,q).score;if(score<=-50||score>=50)return 1;
 const attacker=nativeWarWeariness(w,w.primaryAttackerId,q),defender=nativeWarWeariness(w,w.primaryDefenderId,q);
 if(attacker>=.5||defender>=.5)return 4;
 return null;
}
/** EvaluatePeace requires at least one living, currently participating state
 * with autonomous diplomacy. DestroyedParticipants is not consulted here. */
export function nativeHasAutonomousDiplomacyParticipant(w:NativePeaceWar,q:NativePeaceQueries){
 for(const p of w.participants){const state=q.state(p.stateId);if(state&&!state.dead&&q.autonomousDiplomacy(p.stateId))return true;}return false;
}
/** Manager deadline is independent of AI weariness and the 36-month AI gate.
 * Snapshot IDs first: later EndWar mutations must not change enumeration. */
export function nativeMaximumDurationWarIds(wars:readonly (NativePeaceWar|null)[],enabled:boolean,maximumMonths:number,q:Pick<NativePeaceQueries,'monthsSince'>){
 if(!enabled||maximumMonths<=0)return [];
 return wars.filter((w):w is NativePeaceWar=>!!w&&!w.internal&&q.monthsSince(w.startTime)>=maximumMonths).map(w=>w.id);
}
