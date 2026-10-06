import {describe,it,expect,vi} from 'vitest';
import type {NativeNamingCulture} from './localized-name';
import {nativeCultureStateName,nativeCultureStateTranslations,nativeProvinceRebelIdentity,type NativeRebelIdentity} from './rebel-identity';

const culture=():NativeNamingCulture=>({languages:new Map([['Chinese',0],['English',1],['Japanese',2]]),states:new Map([
  ['a',{key:'a',names:['甲','Alpha',null]}],['b',{key:'b',names:['乙','Beta']}],
]),cities:new Map()});
const state=(more:Partial<NativeRebelIdentity>={}):NativeRebelIdentity=>({i:9,isDead:false,isAlive:false,name:'',cultureName:'unused',nameKey:'',translatedNames:new Map([['old','old']]),useCustomNaming:true,customNameTranslations:new Map([['Chinese','{name}王国']]),...more});
function input(){const created=state();return {created,states:[created] as (NativeRebelIdentity|null)[],province:{name:'河谷',mapCultureName:'map-c' as string|null,translatedNames:new Map([['Chinese','河谷'],['English','Valley']])},parentCultureName:'map-parent',cultures:new Map<string,NativeNamingCulture|null>([['map-c',culture()]]),currentLanguage:()=> 'Chinese',intRange:vi.fn(()=>0)};}

describe('original CultureData state names and translated dictionaries',()=>{
  it('queries current language only for null, even before returning a missing key',()=>{
    const current=vi.fn(()=> 'Chinese'),c=culture();
    expect(nativeCultureStateName(c,'absent',null,current)).toBe('absent');expect(current).toHaveBeenCalledTimes(1);
    expect(nativeCultureStateName(c,'a','English',current)).toBe('Alpha');expect(current).toHaveBeenCalledTimes(1);
    expect(()=>nativeCultureStateName(c,'a','',current)).toThrow('language');
    expect(nativeCultureStateName(c,'absent','not-registered',current)).toBe('absent');
  });
  it('throws on a missing language, uses GetName fallback only for an existing index',()=>{
    const c=culture();expect(()=>nativeCultureStateName(c,'a','French',()=> 'English')).toThrow('language');
    expect(nativeCultureStateName(c,'a','Japanese',()=> 'English')).toBe('a');
    expect(nativeCultureStateName(c,'b','Japanese',()=> 'English')).toBe('b');
    expect(()=>nativeCultureStateName(c,null,null,()=> 'English')).toThrow('state key');
    c.states=new Map([['a',null]]);expect(()=>nativeCultureStateName(c,'a','French',()=> 'English')).toThrow('language');
  });
  it('builds independent dictionaries, keeps registered order and includes fallback values',()=>{
    const c=culture(),a=nativeCultureStateTranslations(c,'a'),b=nativeCultureStateTranslations(c,'a');
    expect([...a]).toEqual([['Chinese','甲'],['English','Alpha'],['Japanese','a']]);expect(a).not.toBe(b);a.clear();expect(b.size).toBe(3);
    expect(nativeCultureStateTranslations(c,'absent').size).toBe(0);expect(()=>nativeCultureStateTranslations(c,null)).toThrow('state key');
  });
  it('does not read a null row when the language table is empty',()=>{
    const c=culture();c.states=new Map([['a',null]]);c.languages=new Map();expect([...nativeCultureStateTranslations(c,'a')]).toEqual([]);
    c.languages=new Map([['Chinese',0]]);expect(()=>nativeCultureStateTranslations(c,'a')).toThrow('row');
  });
});

describe('original province rebel identity, separate from web secession scheduling',()=>{
  it('uses province culture rather than conqueror culture, creates actual translated name',()=>{
    const p=input(),custom=p.created.customNameTranslations,r=nativeProvinceRebelIdentity(p);
    expect(r).toMatchObject({state:p.created,restored:false,source:'culture'});expect(r.state).toMatchObject({name:'甲',nameKey:'a',cultureName:'map-c',useCustomNaming:false});
    expect([...r.state.translatedNames!]).toEqual([['Chinese','甲'],['English','Alpha'],['Japanese','a']]);expect(r.state.customNameTranslations).toBe(custom);expect(custom!.size).toBe(0);
    expect(p.intRange).toHaveBeenCalledExactlyOnceWith(0,2);
  });
  it('restores the first dead identity only after preferred names are exhausted, preserving its records/format',()=>{
    const p=input(),first=state({i:1,isDead:true,name:'甲',nameKey:'historic-key',cultureName:'map-c'}),second=state({...first,i:2}),live=state({i:3,isAlive:true,name:'乙',cultureName:'map-c'});
    p.states=[null,first,second,live,p.created];const ordinary=first.translatedNames,custom=first.customNameTranslations,r=nativeProvinceRebelIdentity(p);
    expect(r.state).toBe(first);expect(r.restored).toBe(true);expect(r.source).toBe('history');expect(first.nameKey).toBe('historic-key');expect(first.translatedNames).toBe(ordinary);expect(first.customNameTranslations).toBe(custom);expect(first.useCustomNaming).toBe(true);expect(first.isDead).toBe(true);
    expect(p.states).toContain(p.created);expect(p.created.name).toBe('');expect(p.created.nameKey).toBe('a');
    expect(p.intRange).toHaveBeenCalledExactlyOnceWith(0,1);
  });
  it('does not restore same-name history while unused names remain',()=>{
    const p=input(),old=state({i:1,isDead:true,name:'甲',cultureName:'map-c'});p.states=[old,p.created];
    const r=nativeProvinceRebelIdentity(p);expect(r.restored).toBe(false);expect(r.state.name).toBe('乙');expect(old.name).toBe('甲');
  });
  it('keeps IsAlive separate from IsValid when matching a historical candidate',()=>{
    const p=input(),alive=state({i:1,isDead:true,isAlive:true,name:'甲',cultureName:'map-c'}),otherCulture=state({i:2,isDead:true,name:'甲',cultureName:'other'}),blocker=state({i:3,isAlive:true,name:'乙',cultureName:'map-c'});
    p.states=[alive,otherCulture,blocker,p.created];expect(nativeProvinceRebelIdentity(p).restored).toBe(false);
  });
  it('uses local name and a translation copy when all names are current, leaving a blank key',()=>{
    const p=input();p.states.push(state({i:1,isAlive:true,name:'甲',cultureName:'map-c'}),state({i:2,isAlive:true,name:'乙',cultureName:'map-c'}));
    const r=nativeProvinceRebelIdentity(p);expect(r.state).toMatchObject({name:'河谷',nameKey:'',cultureName:'map-c'});expect(r.state.translatedNames).not.toBe(p.province.translatedNames);r.state.translatedNames!.clear();expect(p.province.translatedNames.size).toBe(2);expect(p.intRange).not.toHaveBeenCalled();
  });
  it.each([null,''])('empty province culture %s inherits parent only after local name fallback',mapCultureName=>{
    const p=input();p.province.mapCultureName=mapCultureName;p.currentLanguage=()=>{throw Error('Language system must not be touched');};const r=nativeProvinceRebelIdentity(p);expect(r.state).toMatchObject({name:'河谷',nameKey:null,cultureName:'map-parent',useCustomNaming:false});expect(p.intRange).not.toHaveBeenCalled();
  });
  it('missing map culture also falls back locally without querying the language system',()=>{
    const p=input();p.cultures.clear();p.currentLanguage=()=>{throw Error('Language system must not be touched');};
    expect(nativeProvinceRebelIdentity(p).state).toMatchObject({name:'河谷',nameKey:'',cultureName:'map-c'});expect(p.intRange).not.toHaveBeenCalled();
  });
  it('throws if culture disappears before the first historical-name lookup, after writing its chosen key',()=>{
    const p=input(),translations=p.created.translatedNames;p.intRange=vi.fn(()=>{p.cultures.clear();return 0;});
    expect(()=>nativeProvinceRebelIdentity(p)).toThrow('historical lookup');expect(p.created).toMatchObject({name:'',nameKey:'a',cultureName:'map-c',useCustomNaming:true});expect(p.created.translatedNames).toBe(translations);
  });
  it('a missing second culture lookup falls back only the display name, retaining key and translations',()=>{
    const p=input(),translations=p.created.translatedNames;let languageCalls=0;p.currentLanguage=()=>{if(++languageCalls===2)p.cultures.clear();return 'Chinese';};
    const r=nativeProvinceRebelIdentity(p);expect(languageCalls).toBe(2);expect(r.source).toBe('missing-culture');expect(r.state).toMatchObject({name:'河谷',nameKey:'a',cultureName:'map-c'});expect(r.state.translatedNames).toBe(translations);
  });
  it('uses current-language display names for historical identity matching, not fixed Chinese',()=>{
    const p=input();p.currentLanguage=()=> 'English';const old=state({i:1,isDead:true,name:'Alpha',cultureName:'map-c',customNameTranslations:null}),occupied=state({i:2,isAlive:true,name:'Beta',cultureName:'map-c'});p.states=[old,occupied,p.created];
    const r=nativeProvinceRebelIdentity(p);expect(r.state).toBe(old);expect(old.customNameTranslations).toEqual(new Map());expect(old.useCustomNaming).toBe(true);
  });
  it('rejects an uncleared factory result instead of silently overwriting an existing name',()=>{
    const p=input();p.created.name='existing';expect(()=>nativeProvinceRebelIdentity(p)).toThrow('cleared');expect(p.intRange).not.toHaveBeenCalled();
  });
});
