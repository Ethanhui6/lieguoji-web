/** Province.IsAtSeaWar 0x4581C0 (1264 bytes), current authorized IL2CPP build.
 * Both Army and Navy state identities contribute. This is a province-global
 * trigger, NOT a per-army enemy check or a damage-target filter. The caller
 * must provide one actual sea province's presence, not nearby screen icons.
 * GetEnemyStates construction and presence refresh timing remain external. */
export function nativeSeaProvinceAtWar(isLand:boolean,armies:readonly (string|null)[],navies:readonly (string|null)[],isEnemy:(a:string,b:string)=>boolean):boolean{
 if(isLand)return false;
 const states=new Set([...armies,...navies].filter((v):v is string=>v!==null));
 for(const a of states)for(const b of states)if(a!==b&&isEnemy(a,b))return true;
 return false;
}
