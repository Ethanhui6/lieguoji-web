/** State.FilterBorderEnemyProvince (RVA 0x5C67E0), set collection only.
 * Native border generation, frame caches and WarManager classifications are
 * supplied by the caller, not invented here. Three memberships are independent.
 */
export function nativeBorderEnemies55<T,S>(state:S,borders:readonly T[],neighbors:(id:T)=>readonly T[],owner:(id:T)=>S,enemies:ReadonlySet<S>,regular:ReadonlySet<S>,rebels:ReadonlySet<S>){
 const all=new Set<T>(),regularProvinces=new Set<T>(),rebelProvinces=new Set<T>();
 for(const border of borders)for(const id of neighbors(border)){
  const other=owner(id);if(other===state)continue;
  if(enemies.has(other))all.add(id);
  if(regular.has(other))regularProvinces.add(id);
  if(rebels.has(other))rebelProvinces.add(id);
 }
 return {all,regular:regularProvinces,rebels:rebelProvinces};
}
