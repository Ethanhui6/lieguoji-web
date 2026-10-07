/** HandleMonarchySuccession 88EB70. Dynasty change/appointment remain ports:
 * the body does not silently create a replacement family or reset the state. */
import type {NativeSuccessionFailure} from './succession-handlers';

export interface NativeMonarchyPerson {isAlive:boolean;familyId:number}
export interface NativeMonarchyFamily {id:number}
export interface NativeMonarchyState {i:number;leaderId:number}
export interface NativeMonarchyManager<S,F,C> {
 getRulingFamily:(stateId:number)=>F|null;
 findSuccessor:(family:F,previous:C)=>C|null;
 setRulingFamily:(stateId:number,familyId:number)=>void;
 handleDynastyChange:(state:S)=>void;
}
export interface NativeMonarchyPorts<S,F,C> {
 familyManager:()=>NativeMonarchyManager<S,F,C>|null;
 fallback:(family:F)=>C|null;
 counts:(family:F)=>{living:number;collateral:number};
 selectAlternative:(state:S,excluded:F|null)=>F|null;
 appoint:(state:S,person:C,kind:'hereditary'|'emergency_hereditary'|'emergency_dynasty',previous:C|null)=>void;
}
export function nativeHandleMonarchy<S extends NativeMonarchyState,F extends NativeMonarchyFamily,C extends NativeMonarchyPerson>(state:S|null,previous:C|null,oldId:number,reasonTag:string|null,failure:NativeSuccessionFailure,p:NativeMonarchyPorts<S,F,C>):boolean{
 void reasonTag;failure.value='';const manager=p.familyManager();
 if(manager===null){failure.value='[Monarchy] FamilyManager 实例为空';return false;}
 if(state===null)throw Error('Missing reached native monarchy state');
 const changed=()=>state.leaderId>0&&state.leaderId!==oldId,family=manager.getRulingFamily(state.i);
 let living=0,collateral=0;
 if(family!==null){
  let candidate=previous!==null&&previous.familyId===family.id?manager.findSuccessor(family,previous):null;
  if(candidate===null)candidate=p.fallback(family);
  // Native diagnostics enumerate even when a candidate has already been found.
  ({living,collateral}=p.counts(family));
  if(candidate!==null&&candidate.isAlive){p.appoint(state,candidate,previous!==null?'hereditary':'emergency_hereditary',previous);return changed();}
 }
 failure.value=`[Monarchy] 统治家族没有可用的继承人 (familyId=${family?.id??'null'}, livingMembers=${living}, collateralAlive=${collateral})`;
 const alternative=p.selectAlternative(state,family);
 if(alternative!==null){
  manager.setRulingFamily(state.i,alternative.id);
  const candidate=p.fallback(alternative);
  if(candidate!==null&&candidate.isAlive){p.appoint(state,candidate,'emergency_dynasty',previous);return changed();}
 }
 manager.handleDynastyChange(state);
 if(changed())return true;
 failure.value+='，王朝更迭仍未成功任命新领导人';return false;
}
