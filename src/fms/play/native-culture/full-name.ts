type CountedPool={readonly size:number}|null;
export type NativeNameOrderCulture={nameOrder:number;female:CountedPool;male:CountedPool;surnames:CountedPool};

/** GetNameOrder 714CC0: short-circuit female, male, surname. A reached null
 * dictionary throws; it is not an empty pool. Default ID is read lazily. */
export function nativeNameOrder(culture:NativeNameOrderCulture,defaultCultureId:()=>string|null):number{
 for(const pool of [()=>culture.female,()=>culture.male,()=>culture.surnames]){
  const value=pool();if(value===null)throw Error('Missing character name pool');
  if(!Number.isInteger(value.size)||value.size<0||value.size>2147483647)throw Error('Invalid name pool count');
  if(value.size!==0)return culture.nameOrder;
 }
 return defaultCultureId()==='EasternFantasy'?1:0;
}

/** get_FullName 83E070 / get_fullName 83E600. Caller supplies LastName GETTER
 * result and order from original/current FAMILY culture, not character culture.
 * null order means both family culture lookups failed. String.Concat keeps
 * spaces and treats null parts as empty. No caching, trimming or Unknown rule. */
export function nativeFullName(firstName:string|null,resolvedLastName:string|null,resolvedOrder:number|null):string{
 const first=firstName??'',last=resolvedLastName??'';
 return resolvedOrder===1?last+first:first+' '+last;
}

export type NativeNamingFamily={surname:string|null;cultureName:string|null};
type FamilyLookup=(id:number)=>NativeNamingFamily|null;
const familyId=(id:number)=>{if(!Number.isInteger(id)||id < -2147483648||id>2147483647)throw Error('Invalid native family id');return id;};
const present=(value:string|null)=>value!==null&&value!=='';

/** GetFamily 861DF0 then GetFamilyIncludingHistorical 861C90. A present null
 * current value falls through; a nonnull record is never field-merged with its
 * historical namesake. Null dictionaries throw only when actually accessed. */
export function nativeFamilyIncludingHistorical<T>(id:number,current:ReadonlyMap<number,T|null>|null,historical:ReadonlyMap<number,T|null>|null):T|null{
 familyId(id);if(current===null)throw Error('Missing current family dictionary');
 const active=current.get(id);if(active!==undefined&&active!==null)return active;
 if(historical===null)throw Error('Missing historical family dictionary');
 return historical.get(id)??null;
}

/** get_LastName 83E220. Original/current family lookup is independent of the
 * culture lookup below: a family may provide a surname but no usable culture. */
export function nativeLastName(originalFamilyId:number,currentFamilyId:number,storedLastName:string|null,lookup:FamilyLookup|null):string{
 for(const id of [familyId(originalFamilyId),familyId(currentFamilyId)]){
  if(id<=0||lookup===null)continue;
  const family=lookup(id);if(family&&present(family.surname))return family.surname!;
 }
 return storedLastName??'';
}

/** GetCultureDataForFullName 83BC90. No character/state culture or base-ID
 * fallback. Map-culture lookup returns its resolved m_CultureData or null. */
export function nativeFullNameCulture<T>(originalFamilyId:number,currentFamilyId:number,lookup:FamilyLookup|null,mapCulture:(id:string)=>T|null):T|null{
 for(const id of [familyId(originalFamilyId),familyId(currentFamilyId)]){
  if(id<=0||lookup===null)continue;
  const family=lookup(id);if(!family||!present(family.cultureName))continue;
  const culture=mapCulture(family.cultureName!);if(culture!==null)return culture;
 }
 return null;
}
