import type {NativeWarProvince} from './score';
import type {NativeFatigueNation} from './weariness';
import type {NativeSettlementWar} from './settlement-verdict';
import {nativeClassifyOutcomes,type NativeClassificationQueries,type NativeSettlementPlan,type NativeTransfer,type NativeEffect,type NativeEffectResult,type NativeWarOutcome} from './settlement-classification';
import {nativeEffectResult} from './settlement-effects';

export type NativeExecutableWar=NativeSettlementWar&{motherStateId:number};
export type NativeColor={r:number;g:number;b:number;a:number};
export type NativeExecutionQueries<Animation=unknown>=NativeClassificationQueries&{
 capitalFallSuppression:{depth:number};
 stateId:(state:NativeFatigueNation)=>number;
 stateColor:(state:NativeFatigueNation)=>NativeColor;
 conquerProvince:(province:NativeWarProvince,target:NativeFatigueNation,isRecordHistory:true,shouldStripFamilyControl:true)=>void;
 makeConquestAnimation:(province:NativeWarProvince,from:NativeColor,to:NativeColor,transfer:NativeTransfer)=>Animation;
 playConquestAnimations:(animations:readonly Animation[])=>void;
 warnTransfer:(term:NativeTransfer,reason:'missing'|'owner-mismatch')=>void;
 warnEffect:(result:NativeEffectResult)=>void;
 applyEffect:(effect:NativeEffect,war:NativeExecutableWar,plan:NativeSettlementPlan)=>NativeEffectResult|null;
 classifyInternal:(war:NativeExecutableWar,plan:NativeSettlementPlan,actual:true)=>void;
 trySuppressionDestiny:(state:NativeFatigueNation,stateId:number)=>void;
 wasSettlementOutcomeRecorded:(warId:number,stateId:number)=>boolean;
 recordOutcome:(state:NativeFatigueNation,stateId:number,outcome:NativeWarOutcome)=>void;
 logOutcomeComparison:(war:NativeExecutableWar,planned:Map<number,NativeWarOutcome>,plannedWinner:NativeSettlementPlan['winnerSide'],actual:NativeSettlementPlan,allChangesApplied:boolean)=>void;
};

/** PeaceResolverV2.ExecutePlan 66EEF0. Operates on the caller's candidate
 * world: native transfer/effect failures do not roll back earlier successes.
 * The web session must install that candidate only after its own validation.
 * This is not a production adapter or an implementation of ConqueredBy. */
export function nativeExecuteSettlement<Animation>(w:NativeExecutableWar,p:NativeSettlementPlan|null,q:NativeExecutionQueries<Animation>){
 if(!p)return;
 const planned=new Map(p.outcomes),plannedWinner=p.winnerSide,blank=w.blankConquerable;
 p.appliedTransfers.length=0;
 const animations:Animation[]=[];
 q.capitalFallSuppression.depth=(q.capitalFallSuppression.depth+1)|0;
 try{
  for(const term of p.transfers){
   const province=q.province(term.provinceId),target=q.state(term.to);
   if(!province||!target){q.warnTransfer(term,'missing');continue;}
   const old=q.state(province.stateId),from=old?{...q.stateColor(old)}:{r:1,g:1,b:1,a:1},to={...q.stateColor(target)};
   q.conquerProvince(province,target,true,true);
   if(province.stateId!==q.stateId(target)){q.warnTransfer(term,'owner-mismatch');continue;}
   p.appliedTransfers.push(term);animations.push(q.makeConquestAnimation(province,from,to,term));
  }
 }finally{q.capitalFallSuppression.depth=Math.max(0,(q.capitalFallSuppression.depth-1)|0);}
 if(animations.length&&!blank)q.playConquestAnimations(animations);
 p.effectResults.length=0;
 for(const effect of p.effects){
  if(!effect)throw new TypeError('Null settlement effect');
  const result=q.applyEffect(effect,w,p)??nativeEffectResult(effect,2,'效果未返回执行结果');
  p.effectResults.push(result);
  if(result.status!==0&&result.status!==1){
   for(let i=p.enforcedGoals.length-1;i>=0;i--)if(p.enforcedGoals[i]===result.sourceGoalId)p.enforcedGoals.splice(i,1);
   q.warnEffect(result);
  }
 }
 if(w.internal){
  q.classifyInternal(w,p,true);
  if((w.legacyWarType===5||w.legacyWarType>=8&&w.legacyWarType<=11)&&p.outcomes.get(w.motherStateId)===0){
   const mother=q.state(w.motherStateId);if(mother)q.trySuppressionDestiny(mother,w.motherStateId);
  }
 }else{
  const participants=[...w.participants,...w.destroyedParticipants];
  nativeClassifyOutcomes(w,p,new Set(participants.filter(n=>n.side===0).map(n=>n.stateId)),new Set(participants.filter(n=>n.side===1).map(n=>n.stateId)),p.victorSide,false,true,q);
 }
 const effectsSucceeded=p.effectResults.every(r=>r.status===0||r.status===1);
 q.logOutcomeComparison(w,planned,plannedWinner,p,p.appliedTransfers.length===p.transfers.length&&effectsSucceeded);
 if(!blank)for(const [stateId,outcome]of p.outcomes){
  const state=q.state(stateId);if(state&&!state.dead&&!q.wasSettlementOutcomeRecorded(w.id,stateId))q.recordOutcome(state,stateId,outcome);
 }
}
