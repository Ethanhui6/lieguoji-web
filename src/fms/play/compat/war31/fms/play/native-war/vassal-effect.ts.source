import type {NativeEffectNation} from './settlement-effects';

export type NativeVassalState={vassal:NativeEffectNation;overlord:NativeEffectNation;vassalizationTime:number;tributeRate:number;armyCapMultiplier:number;rebellionReason:string;updateDayInMonth:number};
export type NativeVassalContext={pending:{vassal:NativeEffectNation;overlord:NativeEffectNation}[];vassalStates:Map<number,NativeVassalState>;overlordToVassals:Map<number,NativeEffectNation[]>};
export type NativeVassalQueries<War,Event>={
 legacyWars:(state:NativeEffectNation)=>readonly War[];
 leaveLegacyWar:(war:War,state:NativeEffectNation)=>void;
 forceLeaveAlliance:(state:NativeEffectNation)=>void;
 gameTime:()=>number;
 randomInt:(minimumInclusive:number,maximumExclusive:number)=>number;
 leaveAllWarV2:(stateId:number)=>void;
 createEvent:(overlord:NativeEffectNation,vassal:NativeEffectNation,time:number)=>Event;
 recordStateHistory:(state:NativeEffectNation,event:Event,isCameraFollow:false)=>void;
 recordWorldHistory:(event:Event)=>void;
 logMadeVassal:(vassal:NativeEffectNation,overlord:NativeEffectNation)=>void;
 drawVassalArrow:(vassal:NativeEffectNation,overlord:NativeEffectNation)=>void;
};
export function nativeIsVassalOf(c:NativeVassalContext,vassal:NativeEffectNation,overlord:NativeEffectNation){return c.vassalStates.has(vassal.id)&&c.vassalStates.get(vassal.id)!.overlord===overlord;}
/** Immediate path has checkPendingQueue=false. Reference identity matters. */
export function nativeCanMakeVassalImmediate(c:NativeVassalContext,vassal:NativeEffectNation|null,overlord:NativeEffectNation|null):string|null{
 if(!vassal||!overlord)return '附庸或宗主为空';if(vassal===overlord)return '国家不能成为自己的附庸';
 if(vassal.dead||overlord.dead)return '附庸或宗主已经灭亡';
 if(c.vassalStates.has(vassal.id))return `${vassal.name} 已经是附庸`;
 if(c.vassalStates.has(overlord.id))return `${overlord.name} 自身是附庸，不能拥有附庸`;
 return null;
}
/** MakeVassalCore 6575B0, immediate branch. V2 war exit runs AFTER registration
 * and can re-enter peace settlement. Upstream must supply a candidate world;
 * native callbacks can throw after earlier mutations without rollback. */
export function nativeMakeVassalImmediate<War,Event>(c:NativeVassalContext,vassal:NativeEffectNation|null,overlord:NativeEffectNation|null,q:NativeVassalQueries<War,Event>){
 const reason=nativeCanMakeVassalImmediate(c,vassal,overlord);if(reason!==null)return {success:false,reason};
 const target=vassal!,beneficiary=overlord!;
 for(let i=c.pending.length-1;i>=0;i--)if(c.pending[i].vassal===target)c.pending.splice(i,1);
 for(const war of [...q.legacyWars(target)])q.leaveLegacyWar(war,target);
 q.forceLeaveAlliance(target);
 const record:NativeVassalState={vassal:target,overlord:beneficiary,vassalizationTime:Math.fround(q.gameTime()),tributeRate:Math.fround(.3),armyCapMultiplier:.5,rebellionReason:'',updateDayInMonth:q.randomInt(1,28)};
 c.vassalStates.set(target.id,record);
 let dependents=c.overlordToVassals.get(beneficiary.id);if(!dependents){dependents=[];c.overlordToVassals.set(beneficiary.id,dependents);}dependents.push(target);
 q.leaveAllWarV2(target.id);
 const event=q.createEvent(beneficiary,target,Math.fround(q.gameTime()));
 q.recordStateHistory(target,event,false);q.recordStateHistory(beneficiary,event,false);q.recordWorldHistory(event);
 q.logMadeVassal(target,beneficiary);q.drawVassalArrow(target,beneficiary);
 return {success:true,reason:null};
}
