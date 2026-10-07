import {nativeCountLand,type NativeWarSide} from './score';
import {nativeWarSide} from './weariness';
import {nativeEnforceableGoal,type NativePeaceReason} from './peace';
import {nativeDetermineVictor,nativeShouldDecisiveAnnex,type NativeSettlementWar,type NativeSettlementGoal} from './settlement-verdict';
import {nativeClassifyOutcomes,type NativeSettlementPlan,type NativeClassificationQueries,type NativeEffect} from './settlement-classification';

export type NativePlanQueries=NativeClassificationQueries&{
 buildEffect:(goal:NativeSettlementGoal)=>NativeEffect|null;
 buildInternalPlan:(war:NativeSettlementWar,reason:NativePeaceReason)=>NativeSettlementPlan|null;
};
export function nativeResolveGoalProvinces(g:NativeSettlementGoal,q:NativeClassificationQueries){return g.type===3?(q.state(g.target)?.provinces??[]).filter(p=>p?.isLand).map(p=>p!.id):g.scope!.provinceIds??[];}
export function nativeCollectTransfers(p:NativeSettlementPlan,g:NativeSettlementGoal,annex:boolean,defenders:Set<number>,q:NativeClassificationQueries){
 for(const id of nativeResolveGoalProvinces(g,q)){
  if(p.transfers.some(t=>t.provinceId===id))continue;const province=q.province(id);if(!province||!province.isLand||province.stateId===g.beneficiary)continue;
  if(g.type===2||!defenders.has(province.stateId))continue;
  if(!annex&&nativeCountLand(q.state(province.stateId))<=1)continue;
  p.transfers.push({sourceGoalId:g.id,provinceId:id,from:province.stateId,to:g.beneficiary,type:g.type});
 }
}
export function nativeCollectAnnexationTransfers(p:NativeSettlementPlan,loser:number,winner:number,q:NativeClassificationQueries){
 const provinces=[...(q.state(loser)?.provinces??[])];for(const province of provinces)if(province?.isLand&&!p.transfers.some(t=>t.provinceId===province.id))p.transfers.push({sourceGoalId:-1,provinceId:province.id,from:loser,to:winner,type:3});
}
const sideIds=(w:NativeSettlementWar,side:NativeWarSide)=>new Set([...w.participants,...w.destroyedParticipants].filter(p=>p.side===side).map(p=>p.stateId));
/** BuildSettlementPlan 66C970. Does not mutate province ownership. Internal
 * settlement remains a separate, explicit port until its rules are recovered. */
export function nativeBuildSettlementPlan(w:NativeSettlementWar|null,reason:NativePeaceReason,q:NativePlanQueries):NativeSettlementPlan|null{
 if(!w||[6,7,8,10,11].includes(reason))return null;if(w.internal)return q.buildInternalPlan(w,reason);
 const attackers=sideIds(w,0),defenders=sideIds(w,1),victor=nativeDetermineVictor(w,reason,q),p:NativeSettlementPlan={warId:w.id,winnerSide:null,victorSide:victor,outcomes:new Map(),enforcedGoals:[],transfers:[],appliedTransfers:[],annexation:w.annexationConquerorId>=0,effects:[],effectResults:[]};
 const decisive=nativeShouldDecisiveAnnex(w,victor,q)&&reason!==4;if(decisive)p.annexation=true;
 for(const g of w.goals){
  if(!nativeEnforceableGoal(g.type))continue;
  const achieved=q.goalAchieved(w,g),forced=!achieved&&[0,1,4,6,11].includes(g.type)&&victor!==null&&nativeWarSide(w,g.beneficiary)===victor;
  if(!achieved&&!forced)continue;
  if([4,6,11].includes(g.type)){if(!p.annexation){const effect=q.buildEffect(g);if(effect){p.enforcedGoals.push(g.id);p.effects.push(effect);}}}
  else{p.enforcedGoals.push(g.id);nativeCollectTransfers(p,g,p.annexation,defenders,q);}
 }
 if(decisive)nativeCollectAnnexationTransfers(p,w.primaryDefenderId,w.primaryAttackerId,q);
 nativeClassifyOutcomes(w,p,attackers,defenders,victor,true,false,q);return p;
}
