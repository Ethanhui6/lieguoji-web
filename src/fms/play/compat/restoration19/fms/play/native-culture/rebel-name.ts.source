import type {NativeNamingCulture} from './localized-name';
/** Province.TryRebel 45C160 selectors 462E60/462EB0/462BA0;
 * State.IsValid 5D2820. Independent recovery, not wired into v18. */
export type NativeRebelNameState={i:number;isDead:boolean;name:string|null;cultureName:string|null};
export function nativeRebelNameSets(states:readonly (NativeRebelNameState|null)[],cultureName:string|null){
 const used=new Set<string>(),current=new Set<string>();
 for(const s of states){if(!s||s.name===null||s.name===''||s.cultureName!==cultureName)continue;used.add(s.name);if(!s.isDead&&s.i!==0)current.add(s.name);}
 return {used,current};
}
type NameMembership={has(name:string):boolean};
/** MapCulture 3D4380. Independent preferred/fallback pools compare DISPLAY
 * names in the current language; returned entries are keys. No fallback
 * translation, shuffle, trim or deduplication of identically translated keys. */
export function nativeRebelNameKey(culture:NativeNamingCulture,language:string,used:NameMembership|null,current:NameMembership|null,intRange:(min:number,max:number)=>number):string|null{
 if(!culture.languages.has(language))return null;
 const index=culture.languages.get(language)!,keys=[...culture.states.keys()],preferred:string[]=[],fallback:string[]=[];
 for(const key of keys){if(!culture.states.has(key))continue;const row=culture.states.get(key);if(!row||!row.names)throw Error('Missing native state name row');if(row.names.length<=index)continue;if(!Number.isInteger(index)||index<0)throw Error('Invalid native language index');const name=row.names[index];if(name===null||name==='')continue;if(!used?.has(name))preferred.push(key);if(!current?.has(name))fallback.push(key);}
 const pool=preferred.length?preferred:fallback;if(!pool.length)return null;const at=intRange(0,pool.length);if(!Number.isInteger(at)||at<0||at>=pool.length)throw Error('Invalid native country name draw');return pool[at];
}
/** Manager 3CBA30 resolves only the exact MAP culture identity. */
export function nativeMapRebelNameKey(cultures:ReadonlyMap<string,NativeNamingCulture|null>,id:string|null,language:string|(()=>string),used:NameMembership|null,current:NameMembership|null,intRange:(min:number,max:number)=>number):string|null{
 if(id===null||id===''||!cultures.has(id))return null;const culture=cultures.get(id);if(!culture)throw Error('Missing map culture');return nativeRebelNameKey(culture,typeof language==='function'?language():language,used,current,intRange);
}
