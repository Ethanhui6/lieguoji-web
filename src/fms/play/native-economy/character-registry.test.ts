import {describe,expect,it,vi} from 'vitest';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter,type NativeCharacterRegistry,type NativeRegisteredCharacter} from './character-registry';
import {nativeInitialCharacter,nativeRandomTraits,NATIVE_CHARACTER_POOL,seededCharacterRandom} from './character-generation';
import type {NativeCharacterTrait} from './character-generation';
type C=NativeRegisteredCharacter<string>;
const registry=():NativeCharacterRegistry<C>=>({nextId:1,characters:new Map()});
describe('original character registry and named initialization',()=>{
 it('new characters have independent empty collections and scalar defaults without random draws',()=>{
  const a=nativeCharacterDefaults<string>(),b=nativeCharacterDefaults<string>();
  expect(a).toMatchObject({id:0,age:0,birthTime:0,deathTime:0,gender:0,lastName:'',firstName:null,cultureName:null,familyId:0,originalFamilyId:0,stateId:0,spouseId:0,fatherId:0,motherId:0,isAlive:true,isHistoricallyImportant:false,base:{charisma:50,military:50,diplomatic:50,administrative:50}});
  a.childrenIds.push(1);a.traits!.push('trait');a.roles.push('role');a.pastRoles.push('past');a.base.charisma=20;
  expect(b.childrenIds).toEqual([]);expect(b.traits).toEqual([]);expect(b.roles).toEqual([]);expect(b.pastRoles).toEqual([]);expect(b.base.charisma).toBe(50);
 });
 it('constructs before ID allocation, then consumes ID before reading birthday and registration',()=>{
  const r=registry(),c=nativeCharacterDefaults<string>(),calls:string[]=[];
  expect(nativeCreateBlankCharacter(r,{construct:()=>{calls.push('ctor');expect(r.nextId).toBe(1);return c;},gameTime:()=>{calls.push('time');expect(c.id).toBe(1);expect(r.nextId).toBe(2);expect(r.characters!.size).toBe(0);return 10.123456789;}})).toBe(c);
  expect(calls).toEqual(['ctor','time']);expect(c.birthTime).toBe(Math.fround(10.123456789));expect(r.characters!.get(1)).toBe(c);expect(c.base.charisma).toBe(50);expect(c.traits).toEqual([]);
 });
 it('uses set_Item conflict replacement and unchecked int32 next ID',()=>{
  const r=registry();r.nextId=2147483647;r.characters!.set(2147483647,nativeCharacterDefaults());
  const c=nativeCreateBlankCharacter(r,{construct:()=>nativeCharacterDefaults<string>(),gameTime:()=>0});
  expect(r.nextId).toBe(-2147483648);expect(r.characters!.size).toBe(1);expect(r.characters!.get(2147483647)).toBe(c);
 });
 it('constructor failure consumes no ID, but clock failure does consume the assigned ID',()=>{
  const r=registry();expect(()=>nativeCreateBlankCharacter(r,{construct:()=>{throw Error('allocation');},gameTime:()=>0})).toThrow('allocation');expect(r.nextId).toBe(1);
  const c=nativeCharacterDefaults<string>();expect(()=>nativeCreateBlankCharacter(r,{construct:()=>c,gameTime:()=>{throw Error('clock');}})).toThrow('clock');expect(c.id).toBe(1);expect(r.nextId).toBe(2);expect(r.characters!.size).toBe(0);
 });
 it('null registry fails after consuming ID and assigning birthday',()=>{
  const r=registry(),c=nativeCharacterDefaults<string>();r.characters=null;
  expect(()=>nativeCreateBlankCharacter(r,{construct:()=>c,gameTime:()=>7})).toThrow('registry');expect(c).toMatchObject({id:1,birthTime:7});expect(r.nextId).toBe(2);
 });
 it('named creation is already registered and names are set before the first random draw',()=>{
  const r=registry(),c=nativeCharacterDefaults<string>(),calls:string[]=[],draws=[22,33,44,55];
  const p=nativeCreateNamedCharacter(null,' ',1,null,{createBlank:()=>nativeCreateBlankCharacter(r,{construct:()=>c,gameTime:()=>10}),random:{floatRange:(min,max)=>{expect([min,max]).toEqual([20,80]);expect(r.characters!.get(1)).toBe(c);expect(c).toMatchObject({firstName:null,lastName:' ',gender:1,cultureName:null});calls.push('float');return draws.shift()!;},intRange:(min,max)=>{expect([min,max]).toEqual([1,4]);calls.push('count');return 2;}},selectTraits:n=>{calls.push('traits');expect(n).toBe(2);expect(c.base).toEqual({charisma:22,military:33,diplomatic:44,administrative:55});return ['a','b'];}});
  expect(p).toBe(c);expect(calls).toEqual(['float','float','float','float','count','traits']);expect(c.traits).toEqual(['a','b']);
 });
 it('has the same successful single skill/trait stream as the existing generation kernel',()=>{
  const a=seededCharacterRandom('same'),b=seededCharacterRandom('same');
  const expected=nativeInitialCharacter(a),blank=nativeCharacterDefaults<NativeCharacterTrait>();
  // A separate selector port is required to expose the native registration boundary.
  const result=nativeCreateNamedCharacter('a','b',0,'c',{createBlank:()=>blank,random:b,selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,b)});
  expect(result.base).toEqual(expected.base);expect(result.traits).toEqual(expected.traits);expect(b.value()).toBe(a.value());
 });
 it('a failed second random draw leaves the first skill changed on the registered person',()=>{
  const r=registry(),c=nativeCharacterDefaults<string>(),draw=vi.fn().mockReturnValueOnce(24).mockImplementationOnce(()=>{throw Error('draw failed');}),selectTraits=vi.fn(()=>[]);
  expect(()=>nativeCreateNamedCharacter('A','B',1,'C',{createBlank:()=>nativeCreateBlankCharacter(r,{construct:()=>c,gameTime:()=>0}),random:{floatRange:draw,intRange:()=>1},selectTraits})).toThrow('draw failed');
  expect(r.characters!.get(1)).toBe(c);expect(c.base).toEqual({charisma:24,military:50,diplomatic:50,administrative:50});expect(c.firstName).toBe('A');expect(c.traits).toEqual([]);expect(selectTraits).not.toHaveBeenCalled();
 });
 it('trait-manager failure happens after count and all four skill writes',()=>{
  const c=nativeCharacterDefaults<string>(),calls:string[]=[];
  expect(()=>nativeCreateNamedCharacter('A','B',0,'C',{createBlank:()=>c,random:{floatRange:()=>23,intRange:()=>{calls.push('count');return 1;}},selectTraits:()=>{calls.push('manager');throw Error('traits');}})).toThrow('traits');
  expect(c.base).toEqual({charisma:23,military:23,diplomatic:23,administrative:23});expect(calls).toEqual(['count','manager']);expect(c.traits).toEqual([]);
 });
 it('a null traits list is assigned directly; null blank creation fails before any draws',()=>{
  const c=nativeCharacterDefaults<string>(),random={floatRange:vi.fn(()=>21),intRange:vi.fn(()=>1)};
  nativeCreateNamedCharacter('A','B',0,'C',{createBlank:()=>c,random,selectTraits:()=>null});expect(c.traits).toBeNull();
  random.floatRange.mockClear();expect(()=>nativeCreateNamedCharacter('A','B',0,'C',{createBlank:()=>null,random,selectTraits:()=>[]})).toThrow('Null');expect(random.floatRange).not.toHaveBeenCalled();
 });
});
