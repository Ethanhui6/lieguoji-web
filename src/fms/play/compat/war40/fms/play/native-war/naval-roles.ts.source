/** PE/IL2CPP 430080 + 44BEC0. 354640 calls ceil (2EC110 roundsd 0xA).
 * Sorting is frontline descending, strength descending, integer navy ID ascending.
 * This kernel has no browser map, diplomacy or timing assumptions. */
export const NATIVE_NAVAL_ATTACK_RATIO=Math.fround(.35);
export function nativeAttackFleetCount(count:number,ratio=NATIVE_NAVAL_ATTACK_RATIO){
 if(count<=0)return 0;
 let n=Math.max(0,Math.min(count,Math.ceil(Math.fround(Math.fround(count)*Math.fround(Math.max(0,Math.min(1,ratio)))))));
 if(count>=2)n=Math.min(n,count-1);
 return Math.max(1,n);
}
export type NativeNavalCandidate={id:string;ordinal:number;frontline:boolean;strength:number};
export function nativeAttackFleets(fleets:NativeNavalCandidate[]){return [...fleets].sort((a,b)=>Number(b.frontline)-Number(a.frontline)||Math.fround(b.strength)-Math.fround(a.strength)||a.ordinal-b.ordinal).slice(0,nativeAttackFleetCount(fleets.length)).map(f=>f.id);}
/** Navy.UpdateState 427C50: any of the three conditions selects Attacking. */
export const nativeNavalAttacking=(atWar:boolean,selected:boolean,homeLost:boolean,validTarget:boolean)=>atWar&&(selected||homeLost||validTarget);
