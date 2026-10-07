import {nativeInternalGoalAchieved} from './achievement';
import {nativeEnforceableGoal} from './peace';
import {nativeHasSettlementEffect,type NativeClassificationQueries,type NativeSettlementPlan,type NativeWarOutcome} from './settlement-classification';
import type {NativeExecutableWar} from './settlement-execute';
import type {NativeWarParticipant} from './score';
export type NativeInternalWar=NativeExecutableWar&{rebelStateId:number;casusBelliId:number};
/** PeaceResolverV2.RebelPrevailed 671120. Missing mother is checked first. */
export function nativeRebelPrevailed(w:NativeInternalWar,q:NativeClassificationQueries){
 const mother=q.state(w.motherStateId);if(!mother||mother.dead||!mother.provinces?.length)return true;
 const rebel=q.state(w.rebelStateId);if(!rebel||rebel.dead||!rebel.provinces?.length)return false;
 return w.goals.some(g=>nativeEnforceableGoal(g.type)&&nativeInternalGoalAchieved(w,g,0,q));
}
/** ClassifyStateInternal 66DD70. A surviving mother may receive Peace even
 * after the rebel wins; do not force external-war winner/loser symmetry. */
export function nativeClassifyInternalState(w:NativeInternalWar,p:NativeSettlementPlan,n:NativeWarParticipant,actual:boolean,q:NativeClassificationQueries):NativeWarOutcome{
 const state=q.state(n.stateId);if(!state||state.dead||!state.provinces?.length)return 1;
 if(n.stateId===w.rebelStateId){if(nativeRebelPrevailed(w,q)&&(!actual||!p.effects.some(e=>e.beneficiary===n.stateId)||nativeHasSettlementEffect(p,n.stateId,'beneficiary',true)))return 0;}
 else if(n.stateId===w.motherStateId){const rebel=q.state(w.rebelStateId);if(!rebel||rebel.dead||!rebel.provinces?.length)return 0;}
 return 2;
}
export function nativeClassifyInternal(w:NativeInternalWar,p:NativeSettlementPlan,actual:boolean,q:NativeClassificationQueries){
 p.outcomes.clear();let a=false,b=false;
 for(const n of [...w.participants,...w.destroyedParticipants]){const outcome=nativeClassifyInternalState(w,p,n,actual,q);p.outcomes.set(n.stateId,outcome);if(outcome===0){if(n.side===0)a=true;else if(n.side===1)b=true;}}
 p.winnerSide=a===b?null:a?0:1;
}
/** BuildInternalSettlementPlan 66C750 + BuildInternalEffect 66C610.
 * CB16 selects ReleaseVassalEffect (source type7), distinct from the ordinary
 * IndependenceEffect. Other effect kinds must be implemented by their owner. */
export function nativeBuildInternalPlan(w:NativeInternalWar,q:NativeClassificationQueries):NativeSettlementPlan{
 const p:NativeSettlementPlan={warId:w.id,winnerSide:null,victorSide:null,outcomes:new Map(),enforcedGoals:[],transfers:[],appliedTransfers:[],annexation:false,effects:[],effectResults:[]};
 for(const g of w.goals)if(nativeEnforceableGoal(g.type)&&nativeInternalGoalAchieved(w,g,0,q)&&(w.casusBelliId===16||g.type>=7&&g.type<=10)){
  p.enforcedGoals.push(g.id);p.effects.push({sourceGoalId:g.id,type:w.casusBelliId===16?7:g.type,beneficiary:g.beneficiary,target:g.target});
 }
 nativeClassifyInternal(w,p,false,q);return p;
}
