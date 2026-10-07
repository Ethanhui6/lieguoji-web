import {nativeCountLand,nativeCurrentProvinceCount,nativeEnemyStates,nativeEffectiveRange,nativeGoalProgress,nativeInitialLand,type NativeScoreWar,type NativeWarGoal,type NativeWarNation,type NativeWarQueries} from './score';
import type {NativeFatigueWar} from './weariness';
import {nativeEnforceableGoal} from './peace';

export type NativeCollapseQueries=NativeWarQueries&{rawTerritoryLossThreshold:(state:NativeWarNation,stateId:number)=>number};
export type NativeAchievementQueries=NativeWarQueries&{monthsSince:(startTime:number)=>number};
const f=Math.fround;
/** 68E440: a missing state defaults to .5; missing political attributes are
 * not a default and must be rejected by the raw-attribute adapter. */
export function nativeTerritoryLossThreshold(id:number,q:NativeCollapseQueries){
 if(!q.state(id))return .5;
 const state=q.state(id);if(!state)throw new TypeError('State disappeared during threshold query');
 const raw=q.rawTerritoryLossThreshold(state,id);return raw<f(.3)?f(.3):raw>f(.8)?f(.8):raw;
}
export function nativeHasStateCollapsed(w:NativeScoreWar|null,id:number,q:NativeCollapseQueries){
 if(!w)return false;const initial=w.initialProvinceCounts.get(id)??0;if(initial<=0)return false;
 const current=nativeCurrentProvinceCount(id,q),threshold=nativeTerritoryLossThreshold(id,q);
 return f(f((initial-current)|0)/f(initial))>threshold;
}
/** 681990: count and reparations goals require at least one actually achieved
 * province even when CalculateProgress's empty-range result is one. */
export function nativeGoalAchieved(w:NativeScoreWar|null,g:NativeWarGoal|null,q:NativeWarQueries){
 if(!w||!g)return false;if(g.type!==2&&g.type!==6)return nativeGoalProgress(w,g,q)>=1;
 const enemies=nativeEnemyStates(w,g),range=nativeEffectiveRange(w,g,enemies,q);let achieved=0;
 for(const id of range){const province=q.province(id);if(!province||!enemies.has(province.stateId))achieved=(achieved+1)|0;}
 const required=Math.max(1,Math.min(Math.max(1,range.length),g.scope!.requiredCount));return achieved>=required;
}
export const nativeIndependenceLandHeld=(initial:number,current:number)=>f(current)>=f(f(initial)*.5);
/** 681820: only Independence checks elapsed months, after the target has
 * survived. The method itself does not require war.internal to be true. */
export function nativeInternalGoalAchieved(w:NativeFatigueWar|null,g:NativeWarGoal|null,minimumMonths:number,q:NativeAchievementQueries){
 if(!w||!g||g.type<7||g.type>10)return false;
 const target=q.state(g.target);if(!target||target.dead||nativeCountLand(target)<=0)return true;
 if(g.type!==7)return false;
 if(q.monthsSince(w.startTime)<minimumMonths)return false;
 const beneficiary=q.state(g.beneficiary);if(!beneficiary||beneficiary.dead||nativeCountLand(beneficiary)<=0)return false;
 const initial=nativeInitialLand(w,g.beneficiary,q);if(initial<=0)return false;
 return nativeIndependenceLandHeld(initial,nativeCountLand(q.state(g.beneficiary)));
}
export function nativeAllInternalGoalsAchieved(w:NativeFatigueWar,minimumMonths:number,q:NativeAchievementQueries){
 let any=false;for(const goal of w.goals)if(nativeEnforceableGoal(goal.type)){any=true;if(!nativeInternalGoalAchieved(w,goal,minimumMonths,q))return false;}return any;
}
