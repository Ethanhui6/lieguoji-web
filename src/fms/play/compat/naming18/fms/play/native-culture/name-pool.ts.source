/** Resolved-input kernels from InitCultureNameSet 48DF10 and selectors
 * 726DE0 / 7276B0. Not yet used by the production naming/chronicle pipeline.
 * Evidence: fms-culture17-v5-2026-10-07/NATIVE_RECOVERY.md. */
const f=Math.fround;
const index=(i:number)=>{if(!Number.isInteger(i)||i<0||i>2147483647)throw Error('Invalid name index');return i;};
/** Native List.Remove removes one matching occurrence per used value. The
 * caller supplies state display names or locked city KEYS, not a common set. */
export function nativeAvailableNameKeys(keys:readonly string[],used:readonly string[],value:()=>number):string[]{
 const remaining=[...keys];for(const name of used){const at=remaining.indexOf(name);if(at!==-1)remaining.splice(at,1);}
 return remaining.map((key,i)=>{const raw=value();if(!Number.isFinite(raw)||raw<0||raw>1)throw Error('Invalid naming random value');return {key,i,rank:f(raw)};}).sort((a,b)=>a.rank-b.rank||a.i-b.i).map(v=>v.key);
}
/** null means the original diagnostic fallback changes only the display name;
 * existing key/translation fields must not be cleared by the eventual caller. */
export function nativeStateNameKey(ordered:readonly string[],at:number):string|null{return ordered[index(at)]??null;}
/** Each overflow city draws from the FULL original pool, with replacement,
 * including locked/previously assigned keys. Empty pool produces no draw. */
export function nativeCityNameKey(ordered:readonly string[],full:readonly string[],at:number,intRange:(min:number,max:number)=>number):string|null{
 index(at);if(at<ordered.length)return ordered[at];if(!full.length)return null;
 const selected=index(intRange(0,full.length));if(selected>=full.length)throw Error('Invalid city name draw');return full[selected];
}
/** Exact f32 Euclidean distance key; native coordinates are capital-cell
 * positions, not province centers or icon positions. Equal keys stay stable. */
export function nativeCultureSeedDistance(seed:{x:number;y:number},target:{x:number;y:number}):number{
 if(![seed.x,seed.y,target.x,target.y].every(Number.isFinite))throw Error('Unresolved culture seed coordinate');
 const dx=f(f(seed.x)-f(target.x)),dy=f(f(seed.y)-f(target.y));return f(Math.sqrt(f(f(dy*dy)+f(dx*dx))));
}
