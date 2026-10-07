/** Recovered 88F250 / 88F560 / 88FA10. Selection, election, appointment and
 * diagnostic enumeration remain explicit ports. Out failure is written before
 * any callback, so exceptions preserve the original partial state. */
export interface NativeSuccessionFailure {value:string|null}
export interface NativeHandlerState {leaderId:number;currentLeaderRecord:object|null}
export interface NativeHandlerCharacter {isAlive:boolean}
export type NativeHandlerKind='republic'|'theocracy'|'tribal';
export interface NativeHandlerPorts<S,C> {
 select:(state:S)=>C|null;
 appoint:(state:S,person:C,kind:'emergency_election'|'hereditary'|'emergency_theocracy'|'emergency_tribal',previous:C|null)=>void;
 diagnose:(state:S,kind:NativeHandlerKind)=>string;
}
const changed=(state:NativeHandlerState,oldId:number)=>state.leaderId>0&&state.leaderId!==oldId;
/** reasonTag is present in the native signature but unused in this body. */
export function nativeHandleRepublic<S extends NativeHandlerState,C extends NativeHandlerCharacter>(state:S,previous:C|null,oldId:number,reasonTag:string|null,failure:NativeSuccessionFailure,p:NativeHandlerPorts<S,C>&{holdElection:(state:S,emergency:true)=>void}):boolean{
 void reasonTag;failure.value='';p.holdElection(state,true);if(changed(state,oldId))return true;
 const candidate=p.select(state);
 if(candidate!==null&&candidate.isAlive){p.appoint(state,candidate,'emergency_election',previous);return changed(state,oldId);}
 failure.value=p.diagnose(state,'republic');return false;
}
export function nativeHandleTheocracy<S extends NativeHandlerState,C extends NativeHandlerCharacter>(state:S,previous:C|null,oldId:number,failure:NativeSuccessionFailure,p:NativeHandlerPorts<S,C>&{endReign:(state:S,reason:'vacancy')=>void}):boolean{
 failure.value='';const candidate=p.select(state);
 if(candidate!==null&&candidate.isAlive){p.appoint(state,candidate,previous!==null?'hereditary':'emergency_theocracy',previous);return changed(state,oldId);}
 failure.value=p.diagnose(state,'theocracy');if(state.currentLeaderRecord!==null)p.endReign(state,'vacancy');state.leaderId=0;return false;
}
export function nativeHandleTribal<S extends NativeHandlerState,C extends NativeHandlerCharacter>(state:S,previous:C|null,oldId:number,failure:NativeSuccessionFailure,p:NativeHandlerPorts<S,C>):boolean{
 failure.value='';const candidate=p.select(state);
 if(candidate!==null&&candidate.isAlive){p.appoint(state,candidate,previous!==null?'hereditary':'emergency_tribal',previous);return changed(state,oldId);}
 failure.value=p.diagnose(state,'tribal');return false;
}
