import {describe,it,expect} from 'vitest';
import {originalNamingCulture,originalNamingCultureIds} from './original-naming';
import {nativeCharacterName} from './character-name';
import {nativeFullName,nativeNameOrder} from './full-name';
import {nativePlaceName} from './localized-name';

describe('reviewed original six-culture naming resources',()=>{
 it('keeps all 14 languages and ordered unique source keys in every pool',()=>{
  const counts=[[50,250,100,100,50],[171,1010,90,90,80],[47,250,100,100,50],[50,250,100,100,50],[197,1000,100,100,50],[50,250,100,100,50]];
  expect(originalNamingCultureIds).toEqual(['Ciestundu','EasternFantasy','Leffathou','Oeczea','WesternFantasy','Wristhos']);
  for(const [i,id]of originalNamingCultureIds.entries()){
   const c=originalNamingCulture(id)!;expect(c.languages.size).toBe(14);expect([c.states.size,c.cities.size,c.male.size,c.female.size,c.surnames.size]).toEqual(counts[i]);
   for(const p of [c.states,c.cities,c.male,c.female,c.surnames])for(const [key,row]of p){expect(row!.key).toBe(key);expect(row!.names!.length).toBe(14);}
  }
 });
 it('uses actual six-culture place/person rows without numeric placeholder names',()=>{
  const expected=[['加洛维迪亚','维恩博罗纳','格里姆 穆勒'],['巴','阿坝','赵轩'],['福雷兹','柳迪姆','亚历山大 杜波依斯'],['奥雷利奥斯','贝平汉姆','马可 罗西'],['亚斯图顿','斯卡塔','格里姆 穆勒'],['亚斯图顿','斯卡塔','阿尔坦 巴特尔']];
  for(const [i,id]of originalNamingCultureIds.entries()){
   const c=originalNamingCulture(id)!,cultures=new Map([[id,c]]),name=nativeCharacterName(c,{gender:0,language:'Chinese',currentLanguage:()=>{throw Error('Unexpected language fallback');},usePatronymic:false,fatherFirstName:null,defaultCulture:()=>{throw Error('Unexpected culture fallback');},intRange:()=>0});
   expect([nativePlaceName(cultures,'state',id,[...c.states.keys()][0],'Chinese'),nativePlaceName(cultures,'city',id,[...c.cities.keys()][0],'Chinese'),nativeFullName(name.first,name.last,nativeNameOrder(c,()=>null))]).toEqual(expected[i]);
  }
 });
 it('retains source whitespace and shared Western/Ciestundu person vocabulary',()=>{
  const east=originalNamingCulture('EasternFantasy')!,english=east.languages.get('English')!;expect([...east.cities.values()].filter(row=>row!.names![english]!==row!.names![english]!.trim())).toHaveLength(1);
  const west=originalNamingCulture('WesternFantasy')!,ciest=originalNamingCulture('Ciestundu')!;expect([...west.male]).toEqual([...ciest.male]);expect([...west.female]).toEqual([...ciest.female]);expect([...west.surnames]).toEqual([...ciest.surnames]);
 });
 it('does not infer unknown IDs and does not leak map/row mutations between worlds',()=>{
  expect(originalNamingCulture('map-eastern')).toBeNull();expect(originalNamingCulture('Unknown')).toBeNull();const c=originalNamingCulture('EasternFantasy')!;(c.male as Map<string,unknown>).clear();expect(originalNamingCulture('EasternFantasy')!.male.size).toBe(90);
 });
});
