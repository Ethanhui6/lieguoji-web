/** Current installed PE: State.UpdateNavy 5DE860, GetNavyBuildMonths 5CDAA0,
 * Character.GetWarshipBuildTimeMultiplier 83CE70, port multiplier 417FB0.
 * Queue arithmetic only; crew/economy/transport remain explicit web adapters. */
export const nativeNavyQuota=(ports:number,portsPerNavy=3)=>ports===1?1:Math.trunc(ports/Math.max(1,portsPerNavy));
export function nativeNavyBuildMonths(ethnic:string,traits:readonly number[],blocked:boolean,base=6){
 const f=Math.fround;let value=f(Math.max(1,base)),leader=f(1);
 if(ethnic==='Maritime')value=f(value*f(.5));else if(ethnic==='Commercial')value=f(value/f(1.5));
 for(const t of traits)leader=f(leader*f(t>0?t:1));
 return Math.max(1,Math.ceil(f(f(value*Math.max(f(.1),leader))*f(blocked?2:1))));
}
export type NativeNavyQueue={queued:number;remaining:number;totalMonths:number};
/** Starting a hull consumes its first month in the SAME monthly update.
 * A quota reduction cancels waiting hulls, not the current countdown. */
export function nativeNavyQueueMonth(s:NativeNavyQueue,ports:number,active:number,months:number){
 if(ports===0){s.queued=0;s.remaining=0;s.totalMonths=0;return false;}
 const quota=nativeNavyQuota(ports),deficit=Math.max(0,quota-active);
 s.queued=Math.max(0,deficit-(s.remaining>0?1:0));
 if(s.remaining<=0&&s.queued>0){s.queued--;s.remaining=months;s.totalMonths=months;}
 if(s.remaining<=0)return false;
 s.remaining--;
 return s.remaining===0&&active<quota;
}
