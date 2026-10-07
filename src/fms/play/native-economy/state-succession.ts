/** StateSuccessionUtility.TryResolve 891750. Only the dispatch/commit result
 * contract is resolved here; candidate generation belongs to each handler. */
export interface NativeSuccessionState {isDead:boolean;isBlankState:boolean;isConquerable:boolean;leaderId:number;politicalSystem:number;cachedName:string|null}
export interface NativeSuccessionResult {handled:boolean;failureReason:string|null}
export interface NativeStateSuccessionPorts<S,C> {
 getCharacter:(id:number)=>C|null;
 monarchy:(state:S,previous:C|null,previousId:number,reason:string|null)=>NativeSuccessionResult;
 republic:(state:S,previous:C|null,previousId:number,reason:string|null)=>NativeSuccessionResult;
 tribal:(state:S,previous:C|null,previousId:number)=>NativeSuccessionResult;
 theocracy:(state:S,previous:C|null,previousId:number)=>NativeSuccessionResult;
 nullStateError:()=>void;
 warning:(cachedName:string|null,reason:string|null,failure:string)=>void;
 defaultFailure:string;unsupportedFailure:string;
}
export function nativeTryStateSuccession<S extends NativeSuccessionState,C>(state:S|null,previous:C|null,reason:string|null,p:NativeStateSuccessionPorts<S,C>):boolean{
 if(state===null){p.nullStateError();return false;}
 if(state.isDead||state.isBlankState||!state.isConquerable)return false;
 const oldId=state.leaderId;if(previous===null&&oldId>0)previous=p.getCharacter(oldId);
 let result:NativeSuccessionResult;
 switch(state.politicalSystem){
  case 0:case 1:result=p.monarchy(state,previous,oldId,reason);break;
  case 2:case 3:result=p.republic(state,previous,oldId,reason);break;
  case 4:result=p.tribal(state,previous,oldId);break;
  case 5:result=p.theocracy(state,previous,oldId);break;
  default:result={handled:false,failureReason:p.unsupportedFailure};
 }
 const changed=state.leaderId>0&&state.leaderId!==oldId;
 if(changed)return result.handled;
 const failure=result.failureReason===null||result.failureReason===''?p.defaultFailure:result.failureReason;
 p.warning(state.cachedName,reason,failure);state.leaderId=0;return false;
}
