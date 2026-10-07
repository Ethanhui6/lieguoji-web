import {war28Queries,type War28Policy} from './war28-query';
import type {War28World,War28State} from './war28-state';
import {nativeAllInternalGoalsAchieved,nativeInternalGoalAchieved} from './native-war/achievement';
export function war39Queries(r:War28World,s:War28State,policy:War28Policy){
 const q=war28Queries(r,s,policy),external=q.goalAchieved;
 q.internalGoalsAchieved=(w,months)=>nativeAllInternalGoalsAchieved(w,months,q);
 q.goalAchieved=(w,g)=>w.internal?nativeInternalGoalAchieved(w,g,0,q):external(w,g);
 return q;
}
