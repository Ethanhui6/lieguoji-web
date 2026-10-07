import type {NativeWarLookup,NativeWarProvince} from '../war26-native';

/** Native State identity matters: CanUse compares references, not IDs. The
 * caller supplies the installed version's neighbor collections and province
 * order; a web port/transport graph is not a substitute for sea neighbors. */
export interface NativeDeclarationGeography {
 id:number;
 dead:boolean;
 blankState:boolean;
 conquerable:boolean;
 neighbors:ReadonlySet<number>|null;
 seaNeighbors:ReadonlySet<number>|null;
 provinces:readonly (NativeWarProvince|null)[]|null;
}
export const nativeBlankConquerable=(s:Pick<NativeDeclarationGeography,'blankState'|'conquerable'>)=>s.blankState&&s.conquerable;
const required=<T>(value:T|null|undefined):T=>{if(value==null)throw Error('Native null reference');return value;};

/** IsLandAdjacentTo 68B7E0. Missing neighboring provinces are ignored. */
export function nativeLandAdjacent(p:NativeWarProvince|null,attackerId:number,lookup:NativeWarLookup):boolean{
 for(const id of required(required(p).neighbors)){
  const neighbor=lookup(id);if(neighbor&&neighbor.isLand&&neighbor.stateId===attackerId)return true;
 }
 return false;
}
/** IsCoastal 68B670: any resolved water neighbor, without a port condition. */
export function nativeCoastal(p:NativeWarProvince|null,lookup:NativeWarLookup):boolean{
 for(const id of required(required(p).neighbors)){const neighbor=lookup(id);if(neighbor&&!neighbor.isLand)return true;}
 return false;
}
/** HasCedeableProvince 68B300. The state-level sea lookup precedes province
 * enumeration even when a later province is land-adjacent. Do not suppress a
 * malformed native collection by taking the one-province annex fallback. */
export function nativeHasCedeableProvince(a:NativeDeclarationGeography|null,d:NativeDeclarationGeography|null,lookup:NativeWarLookup):boolean{
 if(!a||!d||!d.provinces)return false;
 const sea=required(a.seaNeighbors).has(d.id);
 for(const p of d.provinces){
  if(!p||!p.isLand)continue;
  if(nativeLandAdjacent(p,a.id,lookup)||sea&&nativeCoastal(p,lookup))return true;
 }
 return false;
}
/** CasusBelliDefinition.CanUse 6684F0, catalog 1 only. Other catalog entries
 * have separate political/faith/annexation conditions, not inferred here. */
export function nativeTerritorialConquestCanUse(a:NativeDeclarationGeography|null,d:NativeDeclarationGeography|null,lookup:NativeWarLookup,landCount:(s:NativeDeclarationGeography)=>number):boolean{
 if(!a||!d||a===d||d.dead||nativeBlankConquerable(d))return false;
 if(!required(a.neighbors).has(d.id)&&!required(a.seaNeighbors).has(d.id))return false;
 const cedeable=nativeHasCedeableProvince(a,d,lookup);
 // BuildCatalog 668DA0 gives CB1 the ordered goals [2,1,3,6].
 if(cedeable)return true;
 return landCount(d)===1;
}
