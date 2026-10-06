import {describe,it,expect} from 'vitest';
import {nativeLocalizedName,nativePlaceName,type NativeNamingCulture,type NativeLocalizedName} from './localized-name';
const culture=(row:NativeLocalizedName,languages:ReadonlyMap<string,number>=new Map([['Chinese',0],['English',1]]))=>new Map<string,NativeNamingCulture|null>([['C',{languages,states:new Map([['INPUT',row]]),cities:new Map([['INPUT',row]])}]]);
describe('original localized place name resolution',()=>{
 it('returns raw key for negative/out-of-range/empty translations without trimming',()=>{
  const r={key:'KEY',names:['',' ','English',null]};expect([-1,0,3,99].map(i=>nativeLocalizedName(r,i))).toEqual(['KEY','KEY','KEY','KEY']);expect(nativeLocalizedName(r,1)).toBe(' ');expect(nativeLocalizedName(r,2)).toBe('English');expect(nativeLocalizedName({key:null,names:[]},0)).toBeNull();
 });
 it('negative index bypasses a null translation list; nonnegative access throws',()=>{
  expect(nativeLocalizedName({key:'K',names:null},-1)).toBe('K');expect(()=>nativeLocalizedName({key:'K',names:null},0)).toThrow('Missing');
 });
 it.each(['state','city'] as const)('%s current empty translation falls to row key before English',kind=>{
  const c=culture({key:'CITY_A',names:['','English City']});expect(nativePlaceName(c,kind,'C','INPUT','Chinese')).toBe('CITY_A');expect(nativePlaceName(c,kind,'C','INPUT','French')).toBe('English City');expect(nativePlaceName(c,kind,'absent','INPUT','Chinese')).toBe('INPUT');expect(nativePlaceName(c,kind,'C','absent','Chinese')).toBe('absent');
 });
 it('attempts English only when current lookup is absent or resolved value still empty',()=>{
  expect(nativePlaceName(culture({key:'',names:['','English']}),'city','C','INPUT','Chinese')).toBe('English');expect(nativePlaceName(culture({key:'Unknown',names:['','English']}),'state','C','INPUT','Chinese')).toBe('Unknown');expect(nativePlaceName(culture({key:'row',names:['Chinese']},new Map()),'city','C','INPUT','French')).toBe('row');
 });
 it('does not invent Chinese or scan other languages after a missing English key',()=>{
  const c=culture({key:'ROW',names:['Chinese','Other']},new Map([['Chinese',0],['Other',1]]));expect(nativePlaceName(c,'city','C','INPUT','French')).toBe('ROW');
 });
 it('distinguishes dictionary miss from a present null object and preserves lookup order',()=>{
  const c=culture({key:'ROW',names:['Chinese','English']});expect(nativePlaceName(c,'city','absent',null,null)).toBeNull();expect(nativePlaceName(c,'city','C','absent',null)).toBe('absent');expect(()=>nativePlaceName(c,'city','C',null,'Chinese')).toThrow('Null name');expect(()=>nativePlaceName(c,'city','C','INPUT',null)).toThrow('Null language');expect(()=>nativePlaceName(new Map([['C',null]]),'city','C','INPUT','Chinese')).toThrow('Missing culture');c.get('C')!.cities=new Map([['INPUT',null]]);expect(()=>nativePlaceName(c,'city','C','INPUT','Chinese')).toThrow('Missing localized');
 });
});
