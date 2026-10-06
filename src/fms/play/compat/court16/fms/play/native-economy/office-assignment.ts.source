/** Recovered State.EnsureGovernmentOfficeData/GetGovernmentOfficeAssignment,
 * Assignment.Matches and GetHolder: 5C64D0/5CB0A0/879A50/883010.
 * Mutation is only on the caller's private transaction; no lifecycle guessing. */
import {int32} from './numeric';
import {resolvedNativeOfficeHolder,type NativeOfficeCharacter} from './office-income';
export interface NativeOfficeQuery {officeId:string|null;scopeKind:number;scopeId:number;warSystemKind:number}
export interface NativeOfficeAssignment extends NativeOfficeQuery {holderCharacterId:number}
export interface NativeOfficeData {assignments:(NativeOfficeAssignment|null)[]|null;normalized:boolean;revision:number}
export function nativeNormalizeWarSystem(scopeKind:number,warSystemKind:number):number{
 int32(scopeKind);int32(warSystemKind);return scopeKind===2?warSystemKind:0;
}
export function nativeOfficeMatches(a:NativeOfficeAssignment,q:NativeOfficeQuery):boolean{
 return a.officeId===q.officeId&&a.scopeKind===q.scopeKind&&a.scopeId===q.scopeId&&a.warSystemKind===nativeNormalizeWarSystem(q.scopeKind,q.warSystemKind);
}
export function ensureNativeOfficeData(data:NativeOfficeData):void{
 data.assignments??=[];
 if(data.normalized)return;
 for(const a of data.assignments)if(a)a.warSystemKind=nativeNormalizeWarSystem(a.scopeKind,a.warSystemKind);
 data.normalized=true;
 // Native normalization doesn't increment GovernmentOfficeAssignmentsVersion.
}
export function nativeOfficeAssignment(data:NativeOfficeData,q:NativeOfficeQuery):NativeOfficeAssignment|null{
 ensureNativeOfficeData(data);
 return data.assignments!.find(a=>a!==null&&nativeOfficeMatches(a,q))??null;
}
export function nativeOfficeHolder<T extends NativeOfficeCharacter>(stateId:number|null,data:NativeOfficeData,q:NativeOfficeQuery,characters:ReadonlyMap<number,T>|null):T|null{
 if(stateId===null)return null;
 return resolvedNativeOfficeHolder(stateId,nativeOfficeAssignment(data,q),characters);
}
