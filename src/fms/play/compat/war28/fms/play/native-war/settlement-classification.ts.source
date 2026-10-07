import type {NativeWarParticipant,NativeWarSide} from './score';
import {nativeEnforceableGoal} from './peace';
import type {NativeSettlementWar,NativeSettlementGoal,NativeVerdictQueries} from './settlement-verdict';

export type NativeWarOutcome=0|1|2; // Victory / Defeat / Peace
export type NativeTransfer={sourceGoalId:number;provinceId:number;from:number;to:number;type:number};
export type NativeEffect={sourceGoalId:number;type:number;beneficiary:number;target:number};
export type NativeEffectResult=NativeEffect&{status:0|1|2;reason:string|null};
export type NativeSettlementPlan={warId:number;winnerSide:NativeWarSide|null;victorSide:NativeWarSide|null;outcomes:Map<number,NativeWarOutcome>;enforcedGoals:number[];transfers:NativeTransfer[];appliedTransfers:NativeTransfer[];annexation:boolean;effects:NativeEffect[];effectResults:NativeEffectResult[]};
export type NativeClassificationQueries=NativeVerdictQueries&{
 currentOwner:(provinceId:number)=>number;
 goalAchieved:(war:NativeSettlementWar,goal:NativeSettlementGoal)=>boolean;
};
const f=Math.fround;
const participants=(w:NativeSettlementWar)=>[...w.participants,...w.destroyedParticipants];
export function nativeNetGain(w:NativeSettlementWar,plan:NativeSettlementPlan|null,id:number,enemies:Set<number>,pending:boolean,q:NativeClassificationQueries){
 let net=0;for(const [pid,initial]of w.initialOwners){if(!q.province(pid)?.isLand)continue;const owner=q.currentOwner(pid);if(enemies.has(initial)&&owner===id)net=(net+1)|0;else if(initial===id&&enemies.has(owner))net=(net-1)|0;}
 if(pending&&plan)for(const t of plan.transfers){if(!q.province(t.provinceId)?.isLand||!w.initialOwners.has(t.provinceId))continue;const initial=w.initialOwners.get(t.provinceId)!;if(t.to===id&&enemies.has(initial))net=(net+1)|0;else if(initial===id&&enemies.has(t.to)&&q.currentOwner(t.provinceId)===id)net=(net-1)|0;}
 return net;
}
export function nativeLossFraction(w:NativeSettlementWar,id:number,q:Pick<NativeClassificationQueries,'currentOwner'>){
 const initial=w.initialProvinceCounts.get(id)??0;if(initial<=0)return 0;let lost=0;for(const [pid,owner]of w.initialOwners)if(owner===id&&q.currentOwner(pid)!==id)lost=(lost+1)|0;return f(f(lost)/f(initial));
}
export function nativeAllEnforceableGoalsFailed(w:NativeSettlementWar,q:NativeClassificationQueries){let any=false;for(const g of w.goals)if(nativeEnforceableGoal(g.type)){any=true;if(q.goalAchieved(w,g))return false;}return any;}
export const nativeIsSettlementBeneficiary=(w:NativeSettlementWar,p:NativeSettlementPlan,id:number,pending:boolean)=>pending&&p.transfers.some(t=>t.to===id)||w.annexationConquerorId===id;
export function nativeHasSettlementEffect(p:NativeSettlementPlan,id:number,field:'beneficiary'|'target',actual:boolean){return actual?p.effectResults.some(e=>(e.status===0||e.status===1)&&e[field]===id):p.effects.some(e=>e[field]===id);}
export function nativeClassifyState(w:NativeSettlementWar,p:NativeSettlementPlan,participant:NativeWarParticipant,enemies:Set<number>,pending:boolean,actual:boolean,q:NativeClassificationQueries):NativeWarOutcome{
 const id=participant.stateId,state=q.state(id);if(!state||state.dead||!state.provinces?.length||q.hasStateCollapsed(w,id))return 1;
 if(nativeNetGain(w,p,id,enemies,pending,q)>=1)return 0;
 if(p.annexation&&nativeIsSettlementBeneficiary(w,p,id,pending))return 0;
 if(nativeHasSettlementEffect(p,id,'beneficiary',actual))return 0;
 if(participant.side===1&&!nativeHasSettlementEffect(p,id,'target',actual)&&nativeAllEnforceableGoalsFailed(w,q)&&nativeLossFraction(w,id,q)<=0)return 0;
 return 2;
}
/** Planned victor and final winner are intentionally separate. Actual failed
 * effects can change the final winner; losses alone need not mean defeat. */
export function nativeClassifyOutcomes(w:NativeSettlementWar,p:NativeSettlementPlan,attackers:Set<number>,defenders:Set<number>,victor:NativeWarSide|null,pending:boolean,actual:boolean,q:NativeClassificationQueries){
 p.outcomes.clear();const all=participants(w);for(const participant of all)p.outcomes.set(participant.stateId,nativeClassifyState(w,p,participant,participant.side===0?defenders:attackers,pending,actual,q));
 if(victor!==null){
  const loser=victor===0?1:0,loserPrimary=loser===0?w.primaryAttackerId:w.primaryDefenderId,winnerPrimary=victor===0?w.primaryAttackerId:w.primaryDefenderId,enemies=loser===0?defenders:attackers;let materialVictory=false;
  for(const participant of all)if(participant.side===loser&&p.outcomes.get(participant.stateId)===0){const id=participant.stateId;if(nativeNetGain(w,p,id,enemies,pending,q)>=1||nativeIsSettlementBeneficiary(w,p,id,pending)||nativeHasSettlementEffect(p,id,'beneficiary',actual)){if(id===loserPrimary)materialVictory=true;}else p.outcomes.set(id,2);}
  if(p.outcomes.get(winnerPrimary)===0||!actual&&!materialVictory){p.winnerSide=victor;return;}
 }
 let a=false,d=false;for(const participant of all)if(p.outcomes.get(participant.stateId)===0){if(participant.side===0)a=true;else if(participant.side===1)d=true;}
 p.winnerSide=a===d?null:a?0:1;
}
