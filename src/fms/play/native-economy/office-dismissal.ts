/** DismissAllForCharacter 8820D0 / DismissAssignment 882810 and their exact
 * predicates. Old assignment normalization is reused, never replaced. */
import {ensureNativeOfficeData,nativeNormalizeWarSystem,type NativeOfficeAssignment,type NativeOfficeData} from './office-assignment';
import {f,iadd} from './numeric';
import {nativeHasSameStartTime,type NativeHistoryRole,type NativePastRole} from './role-history';
export interface NativeDismissAssignment extends NativeOfficeAssignment {stateId:number;startTime:number;politicalSystemAtAppointment:number}
export interface NativeOfficeRole extends NativeHistoryRole {holderId:number;officeId:string|null;stateId:number;scopeKind:number;scopeId:number;warSystemKind:number;politicalSystemAtAppointment:number}
export interface NativeDismissState<A extends NativeDismissAssignment=NativeDismissAssignment> extends NativeOfficeData {i:number;assignments:(A|null)[]|null}
function required<T>(value:T|null):T{if(value===null)throw Error('Missing reached native office dismissal input');return value;}
/** 5D2B20 increments the version first, then invalidates normalization. */
export function nativeMarkOfficeDirty(data:NativeOfficeData):void{data.revision=iadd(data.revision,1);data.normalized=false;}
/** 881FF0 copies the raw double start and raw war system, without a clock. */
export function nativeOfficeRoleMirror(a:NativeDismissAssignment|null):NativeOfficeRole{
 const assignment=required(a);return {roleType:'GovernmentOffice',holderId:assignment.holderCharacterId,startTime:assignment.startTime,officeId:assignment.officeId,stateId:assignment.stateId,scopeKind:assignment.scopeKind,scopeId:assignment.scopeId,warSystemKind:assignment.warSystemKind,politicalSystemAtAppointment:assignment.politicalSystemAtAppointment};
}
/** 88D3E0, after OfType. Holder and assignment.stateId matter here. */
export function nativeDismissRoleMatches(role:NativeOfficeRole|null,a:NativeDismissAssignment|null):boolean{
 const r=required(role);if(a===null)return false;
 return r.holderId===a.holderCharacterId&&r.stateId===a.stateId&&r.officeId===a.officeId&&r.scopeKind===a.scopeKind&&r.scopeId===a.scopeId&&r.warSystemKind===a.warSystemKind;
}
/** 88D460 deliberately has no stateId, holder, roleType, end-time or polity
 * comparison. Both timestamps are normalized even if the first is NaN. */
export function nativeDismissHistoryMatches(past:NativePastRole|null,a:NativeDismissAssignment|null,normalize:(time:number)=>number):boolean{
 const r=required(past),assignment=required(a);
 return r.officeId===assignment.officeId&&r.officeScopeKind===assignment.scopeKind&&r.officeScopeId===assignment.scopeId&&r.officeWarSystemKind===assignment.warSystemKind&&nativeHasSameStartTime(r.startTime,assignment.startTime,normalize);
}
/** 88D520 uses target state.i, ignores holder/start, normalizes warSystem. */
export function nativeDismissRemovalMatches(role:NativeOfficeRole|null,state:{i:number},a:NativeDismissAssignment):boolean{
 return role!==null&&role.stateId===state.i&&role.officeId===a.officeId&&role.scopeKind===a.scopeKind&&role.scopeId===a.scopeId&&role.warSystemKind===nativeNormalizeWarSystem(a.scopeKind,a.warSystemKind);
}
export interface NativeDismissPorts<C,R> {
 characterManager:()=>{getCharacter:(id:number)=>C|null}|null;
 roles:(person:C)=>(R|null)[]|null;pastRoles:(person:C)=>(NativePastRole|null)[]|null;
 governmentOffice:(role:R)=>NativeOfficeRole|null;
 createMirror:(assignment:NativeDismissAssignment)=>R|null;
 pastRole:(role:R|null,time:number,reason:string)=>NativePastRole;
 normalize:(time:number)=>number;gameTime:()=>number;
}
export function nativeDismissOfficeAssignment<A extends NativeDismissAssignment,C,R>(state:NativeDismissState<A>|null,a:A|null,reason:string|null,p:NativeDismissPorts<C,R>):boolean{
 if(state===null||a===null)return false;
 ensureNativeOfficeData(state);
 const assignments=required(state.assignments),index=assignments.indexOf(a);if(index<0)return false;
 assignments.splice(index,1);nativeMarkOfficeDirty(state);
 const manager=p.characterManager(),holder=manager===null?null:manager.getCharacter(a.holderCharacterId);if(holder===null)return true;
 let mirror:R|null=null;
 for(const r of required(p.roles(holder))){if(r===null)continue;const office=p.governmentOffice(r);if(office!==null&&nativeDismissRoleMatches(office,a)){mirror=r;break;}}
 if(mirror===null)mirror=p.createMirror(a);
 if(!required(p.pastRoles(holder)).some(past=>nativeDismissHistoryMatches(past,a,p.normalize))){
  const history=p.pastRoles(holder),time=f(p.gameTime()),past=p.pastRole(mirror,time,reason===null||reason===''?'dismissed':reason);
  required(history).push(past);
 }
 const roles=required(p.roles(holder));let retained=0;
 for(const r of roles)if(r===null||!nativeDismissRemovalMatches(p.governmentOffice(r),state,a))roles[retained++]=r;
 roles.length=retained;return true;
}
/** All nonnull states, including dead/foreign ones. Snapshot matching
 * assignments in each state before dismissing, count only successful removals. */
export function nativeDismissAllForCharacter<C extends {id:number},A extends NativeDismissAssignment,S extends NativeDismissState<A>>(person:C|null,reason:string|null,p:{stateManager:()=>{states:readonly (S|null)[]|null}|null;dismiss:(state:S,assignment:A,reason:string|null)=>boolean}):number{
 if(person===null)return 0;
 const first=p.stateManager();if(first===null||first.states===null)return 0;
 const states=required(required(p.stateManager()).states);let count=0;
 for(const state of states){
  if(state===null)continue;ensureNativeOfficeData(state);
  const assignments=required(state.assignments).filter((a):a is A=>a!==null&&a.holderCharacterId===person.id);
  for(const a of assignments)if(p.dismiss(state,a,reason))count=iadd(count,1);
 }
 return count;
}
