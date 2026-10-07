import {nativeCountLand} from './score';
import {nativeRoundToEven} from '../native-economy/native-round';
import type {NativeFatigueNation} from './weariness';
import type {NativeSettlementGoal} from './settlement-verdict';
import type {NativeEffect,NativeEffectResult} from './settlement-classification';

export type NativeEffectNation=NativeFatigueNation&{id:number;name:string;religionId:string|null};
export type NativeReligionFamily={religionId:string|null};
export type NativeReligionLeader=NativeReligionFamily&{isAlive:boolean};
export type NativeConversionReligions=Map<string,{religion:{name:string|null}|null}|null>|null;
export type NativeEffectQueries={
 state:(id:number)=>NativeEffectNation|null;
 isVassalOf:(target:NativeEffectNation,beneficiary:NativeEffectNation)=>boolean;
 makeVassalImmediate:(target:NativeEffectNation,beneficiary:NativeEffectNation)=>{success:boolean;reason:string|null};
 religions:NativeConversionReligions;
 rulingFamily:(stateId:number)=>NativeReligionFamily|null;
 leader:(state:NativeEffectNation)=>NativeReligionLeader|null;
 markStateNameDirty:(state:NativeEffectNation,updateImmediately:false)=>void;
 // Original WarLog is debug output, not a chronicle event.
 logApplied:(effect:NativeEffect,warId:number,beneficiary:NativeEffectNation,target:NativeEffectNation,detail:{amount?:number;oldReligion?:string|null;newReligion?:string})=>void;
};
export function nativeEffectResult(e:NativeEffect|null,status:0|1|2,reason:string|null):NativeEffectResult{
 return {sourceGoalId:e?.sourceGoalId??-1,type:e?.type??-1,beneficiary:e?.beneficiary??-1,target:e?.target??-1,status,reason};
}
export function nativeBuildEffect(g:NativeSettlementGoal):NativeEffect|null{
 return [4,6,11].includes(g.type)?{sourceGoalId:g.id,type:g.type,beneficiary:g.beneficiary,target:g.target}:null;
}
export function nativeReparationAmount(gold:number,goldPerMonth:number){
 const half=Math.max(0,nativeRoundToEven(Math.fround(Math.fround(gold)*.5),0));
 const income=Math.max(1,Math.imul(Math.max(0,goldPerMonth),6));return Math.max(half,income);
}
export function nativeValidConversionReligion(id:string|null,religions:NativeConversionReligions):id is string{
 if(id===null||id===''||id==='Atheism'||religions===null)return false;
 const religion=religions.get(id)?.religion;return !!religion&&religion.name!=='AtheismName';
}
/** These are the three ordinary settlement Apply methods. They intentionally
 * do not impose a shared dead/land/treasury check: native contracts differ. */
export function nativeApplySettlementEffect(e:NativeEffect,war:{id:number}|null,q:NativeEffectQueries):NativeEffectResult{
 if(e.type!==4&&e.type!==6&&e.type!==11)throw Error('Unsupported native settlement effect');
 const beneficiary=q.state(e.beneficiary),target=q.state(e.target),result=(status:0|1|2,reason:string|null)=>nativeEffectResult(e,status,reason);
 if(e.type===6){
  if(!beneficiary||!target||target.dead)return result(2,'赔款受益方或承担方不存在/已灭亡');
  const amount=nativeReparationAmount(target.gold,target.goldPerMonth);
  target.gold=(target.gold-amount)|0;beneficiary.gold=(beneficiary.gold+amount)|0;
  q.logApplied(e,war?.id??-1,beneficiary,target,{amount});return result(0,null);
 }
 if(e.type===4){
  if(!beneficiary||!target||beneficiary.dead||target.dead)return result(2,'宗主或目标不存在/已灭亡');
  if(nativeCountLand(target)<1)return result(2,'目标已无陆地行省');
  if(q.isVassalOf(target,beneficiary))return result(1,'目标已是该受益方的附庸');
  const made=q.makeVassalImmediate(target,beneficiary);if(!made.success)return result(2,made.reason);
  q.logApplied(e,war?.id??-1,beneficiary,target,{});return result(0,null);
 }
 if(!beneficiary||!target||beneficiary.dead||target.dead)return result(2,'改宗受益方或目标不存在/已灭亡');
 if(nativeCountLand(target)<1)return result(2,'改宗目标已无陆地行省');
 const religion=beneficiary.religionId;if(!nativeValidConversionReligion(religion,q.religions))return result(2,'受益方当前没有有效的可传播国教');
 const family=q.rulingFamily(target.id),leader=q.leader(target);
 if(target.religionId===religion&&(!family||family.religionId===religion)&&(!leader||!leader.isAlive||leader.religionId===religion))return result(1,'目标国家与统治集团已信奉该宗教');
 const oldReligion=target.religionId;target.religionId=religion;if(family)family.religionId=religion;if(leader?.isAlive)leader.religionId=religion;
 q.markStateNameDirty(target,false);q.logApplied(e,war?.id??-1,beneficiary,target,{oldReligion,newReligion:religion});return result(0,null);
}
