import {describe,it,expect,vi} from 'vitest';
import {nativeCharacterName,type NativeCharacterNamingCulture} from './character-name';
import type {NativeLocalizedName} from './localized-name';
const pool=(key:string,translated:string|null=key)=>new Map<string,NativeLocalizedName>([[key,{key,names:[translated]}]]);
const culture=(first='Given',last='Family'):NativeCharacterNamingCulture=>({languages:new Map([['Chinese',0]]),male:pool(first),female:pool('Female'),surnames:pool(last)});
const options=()=>({gender:0,language:'Chinese',currentLanguage:vi.fn(()=> 'Chinese'),usePatronymic:false,fatherFirstName:null as string|null,defaultCulture:vi.fn(()=>culture('Default','Fallback')),intRange:vi.fn(()=>0)});
describe('original CultureData character naming',()=>{
 it('draws male or female and surname in order, with replacement',()=>{
  const o=options();expect(nativeCharacterName(culture(),o)).toEqual({first:'Given',last:'Family'});expect(nativeCharacterName(culture(),o)).toEqual({first:'Given',last:'Family'});expect(o.intRange.mock.calls).toHaveLength(4);expect(o.defaultCulture).not.toHaveBeenCalled();expect(o.currentLanguage).not.toHaveBeenCalled();o.gender=-1;expect(nativeCharacterName(culture(),o).first).toBe('Female');
 });
 it('resolves blank language once; missing language returns Unknown pair without draws/default fallback',()=>{
  const o=options();o.language='';expect(nativeCharacterName(culture(),o).first).toBe('Given');expect(o.currentLanguage).toHaveBeenCalledTimes(1);o.language='Missing';o.intRange.mockClear();expect(nativeCharacterName(culture(),o)).toEqual({first:'Unknown',last:'Unknown'});expect(o.intRange).not.toHaveBeenCalled();expect(o.defaultCulture).not.toHaveBeenCalled();
 });
 it('patronymics append literal son/dottir and skip surname draws',()=>{
  const o=options();o.usePatronymic=true;o.fatherFirstName='Thor';expect(nativeCharacterName(culture(),o)).toEqual({first:'Given',last:'Thorson'});expect(o.intRange).toHaveBeenCalledTimes(1);o.gender=1;expect(nativeCharacterName(culture(),o)).toEqual({first:'Female',last:'Thordottir'});
 });
 it('empty pools trigger one lazy default lookup and first-then-last replacement',()=>{
  const c=culture();c.male=new Map();c.surnames=new Map();const o=options();expect(nativeCharacterName(c,o)).toEqual({first:'Default',last:'Fallback'});expect(o.defaultCulture).toHaveBeenCalledTimes(1);expect(o.intRange).toHaveBeenCalledTimes(2);
 });
 it('blank father still draws a surname, but true patronymic forbids default surname replacement',()=>{
  const o=options();o.usePatronymic=true;o.fatherFirstName='';expect(nativeCharacterName(culture('Given','Unknown'),o)).toEqual({first:'Given',last:'Unknown'});expect(o.intRange).toHaveBeenCalledTimes(2);expect(o.defaultCulture).toHaveBeenCalledTimes(1);
 });
 it('blank translation returns its key first; null/empty initial names are not Unknown fallbacks',()=>{
  const c=culture();c.male=pool('KEY','');c.surnames=new Map([['S',{key:null,names:[null]}]]);const o=options();expect(nativeCharacterName(c,o)).toEqual({first:'KEY',last:null});expect(o.defaultCulture).not.toHaveBeenCalled();
 });
 it('fallback requires the same language and a nonempty non-Unknown resolved name',()=>{
  const c=culture('Unknown','Unknown'),o=options();const fallback=culture('','Unknown');o.defaultCulture=vi.fn(()=>fallback);expect(nativeCharacterName(c,o)).toEqual({first:'Unknown',last:'Unknown'});fallback.languages=new Map([['English',0]]);o.intRange.mockClear();expect(nativeCharacterName(c,o)).toEqual({first:'Unknown',last:'Unknown'});expect(o.intRange).toHaveBeenCalledTimes(2);
 });
 it('rejects invalid draws rather than silently coercing indices',()=>{
  for(const invalid of [-1,1,0.5,NaN]){const o=options();o.intRange=vi.fn(()=>invalid);expect(()=>nativeCharacterName(culture(),o)).toThrow('Invalid character');}
 });
});
