import {nativeLocalizedName,type NativeLocalizedName} from './localized-name';

export type NativeCharacterNamingCulture={languages:ReadonlyMap<string,number>;male:ReadonlyMap<string,NativeLocalizedName>;female:ReadonlyMap<string,NativeLocalizedName>;surnames:ReadonlyMap<string,NativeLocalizedName>};
export type NativeCharacterName={first:string|null;last:string|null};
const present=(s:string|null)=>s!==null&&s!=='';

/** CultureData.GenerateCharacterName 713040. Resolved cultures and Unity-style
 * integer draws are supplied by the caller. No production caller yet. */
export function nativeCharacterName(culture:NativeCharacterNamingCulture,options:{gender:number;language:string|null;currentLanguage:()=>string|null;usePatronymic:boolean;fatherFirstName:string|null;defaultCulture:()=>NativeCharacterNamingCulture|null;intRange:(min:number,max:number)=>number}):NativeCharacterName{
 const {gender,usePatronymic,fatherFirstName,intRange}=options;
 if(!Number.isInteger(gender)||gender < -2147483648||gender>2147483647)throw Error('Invalid native gender');
 const language=present(options.language)?options.language:options.currentLanguage();
 if(language===null)throw Error('Null language dictionary key');
 const index=culture.languages.get(language);
 if(index===undefined)return {first:'Unknown',last:'Unknown'};
 function draw(pool:ReadonlyMap<string,NativeLocalizedName>,languageIndex:number):string|null{
  if(!pool.size)return 'Unknown';
  const keys=[...pool.keys()],i=intRange(0,keys.length);
  if(!Number.isInteger(i)||i<0||i>=keys.length)throw Error('Invalid character name draw');
  return nativeLocalizedName(pool.get(keys[i])!,languageIndex);
 }
 let first=draw(gender===0?culture.male:culture.female,index);
 let last=usePatronymic&&present(fatherFirstName)?fatherFirstName+(gender===0?'son':'dottir'):draw(culture.surnames,index);
 if(first==='Unknown'||last==='Unknown'){
  const fallback=options.defaultCulture(),fallbackIndex=fallback?.languages.get(language);
  if(fallback&&fallbackIndex!==undefined){
   if(first==='Unknown'){const replacement=draw(gender===0?fallback.male:fallback.female,fallbackIndex);if(present(replacement)&&replacement!=='Unknown')first=replacement;}
   if(last==='Unknown'&&!usePatronymic){const replacement=draw(fallback.surnames,fallbackIndex);if(present(replacement)&&replacement!=='Unknown')last=replacement;}
  }
 }
 return {first,last};
}
