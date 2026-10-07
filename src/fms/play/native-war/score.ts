/** WarScoreCalculatorV2 / WarGoalDefinitionV2 recovered from the authorized
 * Windows IL2CPP build. See NEXT_WAR_RECOVERY.md for RVAs and byte hashes.
 * Queries are explicit: this module neither reconstructs missing history nor
 * substitutes a different enemy set for the original fixed defender set. */
export type NativeWarSide=0|1|2;
export type NativeWarProvince={id:number;stateId:number;isLand:boolean};
export type NativeWarNation={dead:boolean;provinces:(NativeWarProvince|null)[]|null};
export type NativeWarGoal={type:number;addedBy:number;target:number;beneficiary:number;scope:{provinceIds:number[]|null;requiredCount:number}|null};
export type NativeWarParticipant={stateId:number;side:NativeWarSide};
export type NativeScoreWar={internal:boolean;primaryDefenderId:number;participants:NativeWarParticipant[];destroyedParticipants:NativeWarParticipant[];goals:NativeWarGoal[];killsByState:Map<number,number>;initialProvinceCounts:Map<number,number>;initialOwners:Map<number,number>};
export type NativeWarQueries={province:(id:number)=>NativeWarProvince|null;state:(id:number)=>NativeWarNation|null};
const f=Math.fround;
const clamp=(v:number,lo=0,hi=1)=>v<lo?lo:v>hi?hi:v;
const both=(w:NativeScoreWar)=>[...w.participants,...w.destroyedParticipants];
export function nativeCountLand(state:NativeWarNation|null){let n=0;for(const p of state?.provinces??[])if(p?.isLand)n=(n+1)|0;return n;}
export function nativeInitialLand(w:NativeScoreWar,id:number,q:NativeWarQueries){let n=0;for(const [pid,owner]of w.initialOwners)if(owner===id&&q.province(pid)?.isLand)n=(n+1)|0;return n;}
export function nativeCurrentProvinceCount(id:number,q:NativeWarQueries){const state=q.state(id);return !state||state.dead?0:state.provinces?.length??0;}
export function nativeEnemyStates(w:NativeScoreWar,g:NativeWarGoal){const ids=new Set(w.participants.filter(p=>p.side===1).map(p=>p.stateId));if(!ids.size)ids.add(w.primaryDefenderId);if(g.target>0)ids.add(g.target);return ids;}
export function nativeEffectiveRange(w:NativeScoreWar,g:NativeWarGoal,enemies:Set<number>,q:NativeWarQueries){
 const source=[3,4,11].includes(g.type)?Array.from(w.initialOwners).filter(([,owner])=>owner===g.target).map(([id])=>id):g.scope!.provinceIds??[];
 return source.filter(id=>w.initialOwners.has(id)&&enemies.has(w.initialOwners.get(id)!)&&q.province(id)?.isLand);
}
function internalProgress(w:NativeScoreWar,g:NativeWarGoal,q:NativeWarQueries){
 if(g.type===7){
  const target=q.state(g.target);if(!target||target.dead||nativeCountLand(target)<=0)return 1;
  const beneficiary=q.state(g.beneficiary);if(!beneficiary||beneficiary.dead||nativeCountLand(beneficiary)<=0)return 0;
  const initial=nativeInitialLand(w,g.beneficiary,q);if(initial<=0)return 0;
  const threshold=Math.max(1,Math.ceil(f(f(initial)*.5))|0);
  return clamp(f(f(nativeCountLand(q.state(g.beneficiary)))/f(threshold)));
 }
 if(g.type>=8&&g.type<=10){
  const target=q.state(g.target);if(!target||target.dead||nativeCountLand(target)<=0)return 1;
  const initial=nativeInitialLand(w,g.target,q);if(initial<=0)return 0;
  const current=nativeCountLand(q.state(g.target));return clamp(f(f((initial-current)|0)/f(initial)));
 }
 return 0;
}
export function nativeGoalProgress(w:NativeScoreWar|null,g:NativeWarGoal|null,q:NativeWarQueries):number{
 if(!w||!g)return 0;if(w.internal)return internalProgress(w,g,q);
 const enemies=nativeEnemyStates(w,g),range=nativeEffectiveRange(w,g,enemies,q);if(!range.length)return 1;
 let achieved=0;for(const id of range){const p=q.province(id);if(!p||!enemies.has(p.stateId))achieved=(achieved+1)|0;}
 let numerator=achieved,denominator=range.length;
 if(g.type===2||g.type===6){denominator=clamp(g.scope!.requiredCount,1,range.length);numerator=Math.min(achieved,denominator);}
 return clamp(f(f(numerator)/f(denominator)));
}
export function nativeSideLoss(w:NativeScoreWar,side:NativeWarSide,q:NativeWarQueries){
 let initial=0,current=0;for(const p of both(w))if(p.side===side){initial=(initial+(w.initialProvinceCounts.get(p.stateId)??0))|0;current=(current+nativeCurrentProvinceCount(p.stateId,q))|0;}
 return initial<=0?0:clamp(f(f((initial-current)|0)/f(initial)));
}
export function nativeSideKills(w:NativeScoreWar,side:NativeWarSide){let sum=0;for(const p of both(w))if(p.side===side)sum=f(sum+(w.killsByState.get(p.stateId)??0));return sum;}
export function nativeAverageGoal(w:NativeScoreWar,side:NativeWarSide,q:NativeWarQueries){
 const ids=new Set(both(w).filter(p=>p.side===side).map(p=>p.stateId));let sum=0,count=0;
 for(const g of w.goals)if((g.type>=0&&g.type<=4||g.type>=6&&g.type<=11)&&ids.has(g.addedBy)){sum=f(sum+nativeGoalProgress(w,g,q));count=(count+1)|0;}
 return count<=0?0:f(sum/f(count));
}
export type NativeWarScore={occupation:number;battle:number;goal:number;score:number};
export function nativeWarScoreParts(w:NativeScoreWar|null,q:NativeWarQueries):NativeWarScore{
 if(!w)return {occupation:0,battle:0,goal:0,score:0};
 const attackerLoss=nativeSideLoss(w,0,q),defenderLoss=nativeSideLoss(w,1,q),occupation=clamp(f(defenderLoss-attackerLoss),-1,1);
 const attackerKills=nativeSideKills(w,0),defenderKills=nativeSideKills(w,1),sum=f(defenderKills+attackerKills);
 const battle=sum<=f(.0001)?0:clamp(f(f(attackerKills-defenderKills)/sum),-1,1);
 const attackerGoal=nativeAverageGoal(w,0,q),defenderGoal=nativeAverageGoal(w,1,q),goal=clamp(f(attackerGoal-defenderGoal),-1,1);
 let combined=f(f(battle*f(.2))+f(occupation*.5));combined=f(combined+f(goal*f(.3)));
 return {occupation,battle,goal,score:f(clamp(combined,-1,1)*100)};
}
