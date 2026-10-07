import {nativeChooseOccupyCount} from '../war26-native';
import {nativeCasusCanUse,nativeCasusVassalFeasible,nativeCasusAnnexFeasible,nativeCedeableSameCulture,type NativeCasusBelliDefinition,type NativeCasusState,type NativeCasusQueries} from './casus-belli';
import type {NativeSettlementGoal} from './settlement-verdict';
import type {NativeDeclaration} from './declaration';
export type NativeDeclaredGoal=NativeSettlementGoal&{primary:boolean;scopeType:0|3;districtId:number;secondaryStateId:number};
export interface NativeCasusGoalQueries<S extends NativeCasusState> extends NativeCasusQueries<S> {
 cedeable:(a:S,d:S)=>number[];
 connected:(a:S,d:S,count:number)=>number[];
 strength:(s:S)=>number;
 randomValue:()=>number;
}
const goal=(a:NativeCasusState,d:NativeCasusState,type:number,provinceIds:number[],requiredCount=0):NativeDeclaredGoal=>({id:1,type,addedBy:a.id,target:d.id,beneficiary:a.id,primary:true,scopeType:[3,4,11].includes(type)?3:0,scope:{provinceIds,requiredCount},districtId:0,secondaryStateId:0});
/** BuildDefaultGoals 6678C0. Retains fields omitted by the older settlement
 * projection, including whole-state scope and primary/secondary identity.
 * Native province selection and Unity random remain explicit query ports. */
export function nativeBuildCasusGoals<S extends NativeCasusState>(cb:NativeCasusBelliDefinition,a:S|null,d:S|null,q:NativeCasusGoalQueries<S>):NativeDeclaredGoal[]{
 const result:NativeDeclaredGoal[]=[];
 if(!nativeCasusCanUse(cb,a,d,q)||!a||!d)return result;
 const allowed=cb.allowedGoals;
 if(allowed.includes(11))return [goal(a,d,11,[])];
 if(allowed.includes(4)&&nativeCasusVassalFeasible(d,q))return [goal(a,d,4,[])];
 const territorial=allowed.includes(0)||allowed.includes(1)||allowed.includes(2),reparations=allowed.includes(6);
 const cedeable=cb.minimumSameCulture>0?nativeCedeableSameCulture(a,d,q.province):territorial||reparations?q.cedeable(a,d):[];
 if(territorial&&cedeable.length){
  if(cb.forceDecisiveCede)return [goal(a,d,1,cedeable)];
  const count=cedeable.length<=1?1:nativeChooseOccupyCount(q.strength(a),q.strength(d),cedeable.length);
  let chosen=q.connected(a,d,count);if(!chosen.length)chosen=cedeable.slice(0,count);
  const f=Math.fround,attack=f(q.strength(a)),defend=f(q.strength(d)),sum=f(attack+defend),share=sum>0?f(attack/sum):f(.5);
  const cede=share>=f(.65)&&allowed.includes(1);
  result.push(goal(a,d,cede?1:2,chosen,cede?0:Math.min(count,chosen.length)));
  if(reparations&&f(q.randomValue())<f(.35))result.push({...goal(a,d,6,cedeable,1),id:2,primary:false});
  return result;
 }
 if(allowed.includes(3)&&nativeCasusAnnexFeasible(cb,d,q))result.push(goal(a,d,3,[]));
 return result;
}
/** TryBuildDeclaration 669F60 only builds a declaration. The caller must
 * still perform StartWar, preserving its actual result and side effects. */
export function nativeTryBuildDeclaration<S extends NativeCasusState>(a:S|null,d:S|null,cb:NativeCasusBelliDefinition|null,q:NativeCasusGoalQueries<S>):NativeDeclaration<NativeDeclaredGoal>|null{
 if(!a||!d||!cb)return null;const goals=nativeBuildCasusGoals(cb,a,d,q);
 return goals.length?{attackerId:a.id,defenderId:d.id,casusBelliId:cb.id,goals}:null;
}
