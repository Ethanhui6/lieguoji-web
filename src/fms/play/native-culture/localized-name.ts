/** LocalizedName.GetName 834BF0, CultureManager.GetStateName 71A290 and
 * GetCityName 719800. Dictionary order is irrelevant here; no implicit trim.
 * These independent kernels are not yet wired to production world naming. */
export type NativeLocalizedName={key:string|null;names:readonly (string|null)[]|null};
export type NativeNamingCulture={languages:ReadonlyMap<string,number>;states:ReadonlyMap<string,NativeLocalizedName|null>;cities:ReadonlyMap<string,NativeLocalizedName|null>};
const present=(s:string|null)=>s!==null&&s!=='';
export function nativeLocalizedName(row:NativeLocalizedName,index:number):string|null{
 if(!Number.isInteger(index)||index < -2147483648||index>2147483647)throw Error('Invalid localized name index');
 if(index<0)return row.key;
 if(row.names===null)throw Error('Missing localized names');
 if(index>=row.names.length)return row.key;
 const value=row.names[index];return present(value)?value:row.key;
}
/** Missing culture/name returns the input key, while language fallback returns
 * row.key. A present language's blank translation usually returns row.key
 * immediately, not English; Unknown is an ordinary nonempty place name. */
export function nativePlaceName(cultures:ReadonlyMap<string,NativeNamingCulture|null>,kind:'state'|'city',cultureName:string,key:string|null,currentLanguage:string|null):string|null{
 if(typeof cultureName!=='string')throw Error('Null culture dictionary key');
 if(!cultures.has(cultureName))return key;
 const culture=cultures.get(cultureName)!;if(!culture)throw Error('Missing culture object');
 if(typeof key!=='string')throw Error('Null name dictionary key');
 const names=kind==='state'?culture.states:culture.cities;if(!names.has(key))return key;
 const row=names.get(key);if(!row)throw Error('Missing localized name object');
 if(typeof currentLanguage!=='string')throw Error('Null language dictionary key');
 const languages=culture.languages;
 if(languages.has(currentLanguage)){const value=nativeLocalizedName(row,languages.get(currentLanguage)!);if(present(value))return value;}
 if(languages.has('English')){const value=nativeLocalizedName(row,languages.get('English')!);if(present(value))return value;}
 return row.key;
}
