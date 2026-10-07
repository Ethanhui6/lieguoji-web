/** 839920 ProcessNaturalDeath and 3A1FE0 LeaderDeathEvent construction.
 * No scheduling, age update, alive guard or rollback is hidden in these ports. */
import {nativeRollNaturalDeath} from './character-lifecycle';
import {f,iadd} from './numeric';
export interface NativeMonthlyDeathStats {
 totalDeaths:number;deathAges:number[]|null;below40:number;from40To60:number;
 from61To70:number;from71To80:number;above80:number;
}
export function nativeProcessNaturalDeath<C extends {age:number}>(person:C,ports:{randomValue:()=>number;stats:()=>NativeMonthlyDeathStats|null;die:(person:C)=>void}):boolean{
 if(!nativeRollNaturalDeath(person.age,ports.randomValue))return false;
 const total=ports.stats();if(total===null)throw Error('Null monthly death stats');
 total.totalDeaths=iadd(total.totalDeaths,1);
 const ageStats=ports.stats();if(ageStats===null)throw Error('Null monthly death stats');
 const ages=ageStats.deathAges;if(ages===null)throw Error('Null death ages');ages.push(f(person.age));
 const age=person.age,key=age<40?'below40':age<=60?'from40To60':age<=70?'from61To70':age<=80?'from71To80':'above80';
 const bucket=ports.stats();if(bucket===null)throw Error('Null monthly death stats');
 bucket[key]=iadd(bucket[key],1);ports.die(person);return true;
}
export interface NativeLeaderDeathEvent {timestamp:number;type:number;stateId:number;leaderId:number;causeOfDeath:string|null;reignYears:number}
/** The caller supplies a newly constructed empty event; timestamp/type writes
 * precede the reached null-state exception. No name snapshots or ID allocation. */
export function nativeFillLeaderDeathEvent(event:NativeLeaderDeathEvent,state:{i:number}|null,leaderId:number,cause:string|null,reignYears:number,timestamp:number):void{
 event.timestamp=timestamp;event.type=19;
 if(state===null)throw Error('Null leader death state');
 event.stateId=state.i;event.leaderId=leaderId;event.causeOfDeath=cause;event.reignYears=reignYears;
}
