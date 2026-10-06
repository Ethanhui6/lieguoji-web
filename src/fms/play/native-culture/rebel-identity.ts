import {nativeLocalizedName,type NativeNamingCulture} from './localized-name';
import {nativeMapRebelNameKey,nativeRebelNameSets,type NativeRebelNameState} from './rebel-name';

export type NativeTranslations=Map<string,string|null>;

/** CultureData.GetStateName 715470. This differs from CultureManager: a
 * present state with an unknown language throws instead of trying English. */
export function nativeCultureStateName(culture:NativeNamingCulture,key:string|null,language:string|null,currentLanguage:()=>string|null):string|null{
  const actualLanguage=language===null?currentLanguage():language;
  if(key===null)throw Error('Null native state key');
  if(!culture.states.has(key))return key;
  const row=culture.states.get(key);
  if(actualLanguage===null||!culture.languages.has(actualLanguage))throw Error('Missing native language key');
  const index=culture.languages.get(actualLanguage)!;
  if(!row)throw Error('Missing native state name row');
  return nativeLocalizedName(row,index);
}

/** CultureData.GetStateNameTranslations 715240 creates a new dictionary and
 * re-evaluates GetName for each registered language, including fallback keys. */
export function nativeCultureStateTranslations(culture:NativeNamingCulture,key:string|null):NativeTranslations{
  const translations:NativeTranslations=new Map();
  if(key===null)throw Error('Null native state key');
  if(!culture.states.has(key))return translations;
  for(const [language,index]of culture.languages){
    const row=culture.states.get(key);
    if(!row)throw Error('Missing native state name row');
    translations.set(language,nativeLocalizedName(row,index));
  }
  return translations;
}

export type NativeRebelIdentity=NativeRebelNameState&{
  // IsAlive is deliberately distinct from !isDead. The caller supplies the
  // actual predicate result; the naming kernel does not invent its rule.
  isAlive:boolean;
  nameKey:string|null;
  translatedNames:NativeTranslations|null;
  useCustomNaming:boolean;
  customNameTranslations:NativeTranslations|null;
};
export type NativeRebelProvince={name:string;mapCultureName:string|null;translatedNames:ReadonlyMap<string,string|null>|null};

/** The naming portion of Province.TryRebel 45C160, after CreateRebelState has
 * appended its temporary state and cleared its name/key. It mutates that
 * supplied state, or returns the first matching historical state by identity.
 * It neither removes the temporary state nor initializes simulation/families.
 * This independent recovery has no v18 production caller. */
export function nativeProvinceRebelIdentity(input:{
  created:NativeRebelIdentity;
  states:readonly (NativeRebelIdentity|null)[];
  province:NativeRebelProvince;
  parentCultureName:string|null;
  cultures:ReadonlyMap<string,NativeNamingCulture|null>;
  currentLanguage:()=>string;
  intRange:(min:number,max:number)=>number;
}):{state:NativeRebelIdentity;restored:boolean;source:'history'|'culture'|'province'|'missing-culture'}{
  const {created,states,province,cultures,currentLanguage,intRange}=input;
  if(created.name!=='')throw Error('Rebel naming requires the cleared CreateRebelState result');
  created.cultureName=province.mapCultureName;
  const sets=nativeRebelNameSets(states,province.mapCultureName);
  const key=nativeMapRebelNameKey(cultures,province.mapCultureName,currentLanguage,sets.used,sets.current,intRange);
  created.nameKey=key;
  let source:'culture'|'province'|'missing-culture'='province';
  const nonemptyKey=key!==null&&key!=='';
  if(nonemptyKey){
    const data=province.mapCultureName!==null?cultures.get(province.mapCultureName):null;
    if(!data)throw Error('Missing rebel culture during historical lookup');
    const display=nativeCultureStateName(data,key,null,currentLanguage);
    const historical=states.find(state=>state!==null&&!state.isAlive&&state.name===display&&state.cultureName===province.mapCultureName);
    if(historical){
      // ApplyCustomNamingByMode(..., 2): preserve its switch and any existing
      // dictionary object/content. Only ensure a missing dictionary exists.
      historical.customNameTranslations??=new Map();
      return {state:historical,restored:true,source:'history'};
    }
  }
  if(province.mapCultureName===null||province.mapCultureName===''){
    created.name=province.name;
    created.translatedNames=new Map(province.translatedNames??[]);
    created.nameKey=null;
    created.cultureName=input.parentCultureName;
  }else if(!nonemptyKey){
    created.name=province.name;
    created.translatedNames=new Map(province.translatedNames??[]);
    created.nameKey='';
  }else{
    // GetCulture is performed again after historical matching; only this
    // second missing result takes 45D051, rather than the earlier exception.
    const data=cultures.get(province.mapCultureName);
    if(data){
      created.name=nativeCultureStateName(data,key,null,currentLanguage);
      created.translatedNames=nativeCultureStateTranslations(data,key);
      source='culture';
    }else{
      created.name=province.name;
      source='missing-culture';
    }
  }
  // ApplyCustomNamingByMode(..., 0): clear this state's custom formatting;
  // never copy the parent's formatting or replace a non-null dictionary.
  created.customNameTranslations??=new Map();
  created.useCustomNaming=false;
  created.customNameTranslations.clear();
  return {state:created,restored:false,source};
}
