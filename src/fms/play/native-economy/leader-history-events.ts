/** The constructors below keep only their own writes. They do not allocate a
 * global event ID, localize names or invent historical wars. */
export interface NativeAscensionEvent {timestamp:number;type:number;stateId:number;newLeaderId:number;previousLeaderId:number;successionType:string|null}
/** 3A1770: timestamp/type precede the reached null-state exception. */
export function nativeFillAscensionEvent(event:NativeAscensionEvent,state:{i:number}|null,newId:number,previousId:number,kind:string|null,time:number):void{
 event.timestamp=time;event.type=18;if(state===null)throw Error('Null native ascension state');
 const stateId=state.i;event.successionType=kind;event.stateId=stateId;event.newLeaderId=newId;event.previousLeaderId=previousId;
}
export interface NativeStateSnapshot {provinceCount:number;vassalCount:number;allianceCount:number;atWar:boolean;totalWars:number}
export function nativeSnapshotDefaults():NativeStateSnapshot{return {provinceCount:0,vassalCount:0,allianceCount:0,atWar:false,totalWars:0};}
export interface NativeSnapshotState {provinces:readonly unknown[]|null;alliance:object|null}
function required<T>(value:T|null):T{if(value===null)throw Error('Missing reached native state snapshot input');return value;}
/** 511970: allianceCount is 0/1, not alliance-member count. A null state leaves
 * constructor defaults unchanged. CountWarsFromHistory is an explicit port. */
export function nativeFillStateSnapshot<S extends NativeSnapshotState>(snapshot:NativeStateSnapshot,state:S|null,p:{vassalManager:()=>{getVassals:(state:S)=>readonly unknown[]|null}|null;warManager:()=>{getWars:(state:S)=>readonly unknown[]|null}|null;countWarsFromHistory:(state:S)=>number}):void{
 if(state===null)return;
 snapshot.provinceCount=required(state.provinces).length;
 snapshot.vassalCount=required(required(p.vassalManager()).getVassals(state)).length;
 snapshot.allianceCount=state.alliance===null?0:1;
 snapshot.atWar=required(required(p.warManager()).getWars(state)).length>0;
 snapshot.totalWars=p.countWarsFromHistory(state);
}
