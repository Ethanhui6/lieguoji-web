import {describe,it,expect} from 'vitest';
import {NATIVE_CHARACTER_POOL,nativeInitialCharacter,nativeRandomTraits,nativeTraitsCompatible,nativeTraitType,seededCharacterRandom,type NativeCharacterTrait} from './character-generation';
const t=(name:string,skill=0,conflict:string[]=[]):NativeCharacterTrait=>({name,militaryModifier:skill,charismaModifier:0,diplomaticModifier:0,administrativeModifier:0,taxEfficiencyModifier:0,incompatibleTraits:conflict});
describe('original character generation flow',()=>{
 it('reclassifies original 27 entries from skill sum instead of JSON type',()=>{
  expect(['Positive','Neutral','Negative'].map(type=>NATIVE_CHARACTER_POOL.filter(t=>nativeTraitType(t)===type).length)).toEqual([11,10,6]);
  expect(nativeTraitType(NATIVE_CHARACTER_POOL.find(t=>t.name==='Ambitious')!)).toBe('Positive');expect(nativeTraitType(NATIVE_CHARACTER_POOL.find(t=>t.name==='Merciful')!)).toBe('Neutral');expect(nativeTraitType(t('threshold',5))).toBe('Neutral');expect(nativeTraitType(t('threshold',-5))).toBe('Neutral');
 });
 it('uses strict f32 category boundaries and a single index draw for each successful item',()=>{
  const pool=[t('positive',10),t('neutral'),t('negative',-10)];for(const [value,name]of [[0,'positive'],[Math.fround(.4),'neutral'],[Math.fround(.7),'negative'],[1,'negative']] as const){const calls:number[][]=[];expect(nativeRandomTraits(1,pool,{value:()=>value,intRange:(a,b)=>{calls.push([a,b]);return a;}})[0].name).toBe(name);expect(calls).toEqual([[0,1]]);}
 });
 it('checks incompatibility in both directions and exact names, and stops when exhausted',()=>{
  const a=t('A',10,['B']),b=t('B',10),c=t('b',10);expect(nativeTraitsCompatible(b,[a])).toBe(false);expect(nativeTraitsCompatible(a,[b])).toBe(false);expect(nativeTraitsCompatible(a,[c])).toBe(true);expect(nativeTraitsCompatible(null,[a])).toBe(true);
  let values=0,indices=0;expect(nativeRandomTraits(3,[a,b],{value:()=>{values++;return 0;},intRange:()=>{indices++;return 0;}})).toEqual([a]);expect([values,indices]).toEqual([2,1]);
 });
 it('falls back by original condition order and then to the whole compatible pool',()=>{
  const n=t('neutral'),bad=t('negative',-10),p=t('positive',10);expect(nativeRandomTraits(1,[n,bad],{value:()=>0,intRange:()=>0})).toEqual([n]);expect(nativeRandomTraits(1,[p,n],{value:()=>1,intRange:()=>0})).toEqual([p]);expect(nativeRandomTraits(2,[p,n],{value:()=>0,intRange:()=>0})).toEqual([p,n]);
 });
 it('deduplicates object identity, not names; no retries for nonpositive count or empty pool',()=>{
  const a=t('same'),b=t('same');expect(nativeRandomTraits(3,[a,b],{value:()=>.5,intRange:()=>0})).toEqual([a,b]);const random={value:()=>{throw Error('must not draw');},intRange:()=>0};expect(nativeRandomTraits(0,[a],random)).toEqual([]);expect(nativeRandomTraits(1,[],random)).toEqual([]);
 });
 it('generates base in charisma/military/diplomatic/admin order then count and traits',()=>{
  const calls:string[]=[];let i=0;const v=nativeInitialCharacter({floatRange:(a,b)=>{calls.push(`float ${a} ${b}`);return [20,30,70,80][i++];},intRange:(a,b)=>{calls.push(`int ${a} ${b}`);return a;},value:()=>{calls.push('value');return 0;}},[t('p',10)]);
  expect(v.base).toEqual({charisma:20,military:30,diplomatic:70,administrative:80});expect(calls).toEqual(['float 20 80','float 20 80','float 20 80','float 20 80','int 1 4','value','int 0 1']);
 });
 it('web seeded stream is repeatable, retains f32 skills and only valid compatible unique traits',()=>{
  for(let i=0;i<60;i++){const a=nativeInitialCharacter(seededCharacterRandom(`person/${i}`)),b=nativeInitialCharacter(seededCharacterRandom(`person/${i}`));expect(a).toEqual(b);for(const v of Object.values(a.base)){expect(v).toBe(Math.fround(v));expect(v).toBeGreaterThanOrEqual(20);expect(v).toBeLessThanOrEqual(80);}expect(a.traits.length).toBeGreaterThanOrEqual(1);expect(a.traits.length).toBeLessThanOrEqual(3);expect(new Set(a.traits).size).toBe(a.traits.length);for(const t of a.traits)expect(nativeTraitsCompatible(t,a.traits.filter(o=>o!==t))).toBe(true);}
 });
});
