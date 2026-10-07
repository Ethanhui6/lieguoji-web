/** State.TryRollDestinyAfterCivilWarSuppression 5DABF0. Does not reset the
 * monthly decrease, manifest counter or emergency-mobilization queue. */
export function nativeSuppressionDestiny(q:{eligible:boolean;otherEligibleAlive:boolean;totalLand:number;ownLand:number;manifest:boolean;manifestCount:number;value:()=>number;intRange:(min:number,max:number)=>number}):number|null{
 if(!q.eligible||!q.otherEligibleAlive||q.totalLand>0&&((q.ownLand*2)|0)>q.totalLand)return null;
 if(q.value()>=.5)return null;
 const special=q.manifest&&q.manifestCount>0;return q.intRange(special?70:50,special?91:81);
}
