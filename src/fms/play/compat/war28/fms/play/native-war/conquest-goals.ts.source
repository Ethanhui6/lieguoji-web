import {nativeChooseOccupyCount} from '../war26-native';
import type {NativeSettlementGoal} from './settlement-verdict';
export type NativeConquestQueries={canUse:()=>boolean;cedeable:()=>number[];connected:(count:number)=>number[];strength:(id:number)=>number;defenderLand:()=>number;randomValue:()=>number};
/** BuildDefaultGoals 6678C0, ordinary catalog ID=1 only. Geography,
 * eligibility and random stream stay explicit rather than guessed defaults. */
export function nativeConquestGoals(attacker:number,defender:number,q:NativeConquestQueries):NativeSettlementGoal[]{
 if(!q.canUse())return [];
 const common={addedBy:attacker,target:defender,beneficiary:attacker},land=q.cedeable(),f=Math.fround;
 if(!land.length)return q.defenderLand()===1?[{id:1,type:3,...common,scope:null}]:[];
 const count=land.length<=1?1:nativeChooseOccupyCount(q.strength(attacker),q.strength(defender),land.length);
 let claims=q.connected(count);if(!claims.length)claims=land.slice(0,count);
 const a=f(q.strength(attacker)),d=f(q.strength(defender)),sum=f(a+d),cede=sum>0&&f(a/sum)>=f(.65);
 const goals:NativeSettlementGoal[]=[{id:1,type:cede?1:2,...common,scope:{provinceIds:claims,requiredCount:cede?0:Math.min(count,claims.length)}}];
 if(q.randomValue()<f(.35))goals.push({id:2,type:6,...common,scope:{provinceIds:land,requiredCount:1}});
 return goals;
}
