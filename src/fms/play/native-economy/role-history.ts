/** PastRole 88ABF0, timestamp normalization 88AB60 and comparison 88AB10.
 * The role projection must resolve native runtime type inheritance, not compare
 * the roleType label. Mutating construction is intentionally non-atomic. */
export interface NativeHistoryRole {roleType:string|null;startTime:number}
export interface NativePastRole {
 roleType:string|null;roleTitle:string|null;stateId:number;familyId:number;
 startTime:number;endTime:number;endReason:string|null;
 officeId:string|null;officeScopeKind:number;officeScopeId:number;
 officeWarSystemKind:number;politicalSystemAtAppointment:number;
}
export interface NativeRoleKinds<R> {
 nationalLeader:(role:R)=>{title:string|null;stateId:number}|null;
 patriarch:(role:R)=>{familyId:number}|null;
 governmentOffice:(role:R)=>{stateId:number;officeId:string|null;scopeKind:number;scopeId:number;warSystemKind:number;politicalSystemAtAppointment:number}|null;
}
/** Three Die predicates 84F9D0/84FA50/84FAD0 share this runtime-type contract. */
export function nativeIsNationalLeaderRole<R>(role:R|null,resolve:NativeRoleKinds<R>['nationalLeader']):boolean{return role!==null&&resolve(role)!==null;}
export function nativePastRoleDefaults():NativePastRole{return {roleType:null,roleTitle:null,stateId:0,familyId:0,startTime:0,endTime:0,endReason:null,officeId:null,officeScopeKind:0,officeScopeId:0,officeWarSystemKind:0,politicalSystemAtAppointment:0};}
/** Exact native call contract. The injected Round remains double throughout. */
export function nativeNormalizeTimestamp(value:number,round:(value:number,digits:number,mode:number)=>number):number{return round(value,2,0);}
export function nativeHasSameStartTime(a:number,b:number,normalize:(value:number)=>number):boolean{const first=normalize(a),second=normalize(b);return first===second;}
export function nativeFillPastRole<R extends NativeHistoryRole>(past:NativePastRole,role:R|null,endTime:number,reason:string|null,ports:NativeRoleKinds<R>&{normalize:(value:number)=>number}):void{
 if(role===null){past.endTime=ports.normalize(endTime);past.endReason=reason;return;}
 past.roleType=role.roleType;past.startTime=ports.normalize(role.startTime);past.endTime=ports.normalize(endTime);past.endReason=reason;
 const leader=ports.nationalLeader(role);if(leader!==null){past.roleTitle=leader.title;past.stateId=leader.stateId;return;}
 const patriarch=ports.patriarch(role);if(patriarch!==null){past.familyId=patriarch.familyId;return;}
 const office=ports.governmentOffice(role);if(office!==null){past.stateId=office.stateId;past.officeId=office.officeId;past.officeScopeKind=office.scopeKind;past.officeScopeId=office.scopeId;past.officeWarSystemKind=office.warSystemKind;past.politicalSystemAtAppointment=office.politicalSystemAtAppointment;}
}
