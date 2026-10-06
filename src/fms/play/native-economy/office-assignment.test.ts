import {describe,it,expect} from 'vitest';
import {ensureNativeOfficeData,nativeNormalizeWarSystem,nativeOfficeAssignment,nativeOfficeHolder,nativeOfficeMatches,type NativeOfficeData,type NativeOfficeAssignment} from './office-assignment';
import {nativeCharacterSkills,nativeSkillModifier,ORIGINAL_CHARACTER_TRAITS} from './character-income';
const assignment=(v:Partial<NativeOfficeAssignment>={}):NativeOfficeAssignment=>({officeId:'Chancellor',scopeKind:0,scopeId:0,warSystemKind:0,holderCharacterId:7,...v});
const data=(assignments:NativeOfficeData['assignments'],normalized=false):NativeOfficeData=>({assignments,normalized,revision:42});
describe('recovered office selection and full trait skills',()=>{
 it('creates a missing list, skips nulls and normalizes only once without changing revision',()=>{
  const d=data(null);ensureNativeOfficeData(d);expect(d).toEqual({assignments:[],normalized:true,revision:42});
  const a=assignment({warSystemKind:9}),war=assignment({scopeKind:2,warSystemKind:99}),d2=data([null,a,war]);ensureNativeOfficeData(d2);expect(a.warSystemKind).toBe(0);expect(war.warSystemKind).toBe(99);expect(d2.revision).toBe(42);expect(d2.assignments![0]).toBeNull();
  a.warSystemKind=1;ensureNativeOfficeData(d2);expect(a.warSystemKind).toBe(1);expect(nativeOfficeAssignment(d2,assignment())).toBeNull();
 });
 it('uses exact ordinal case-sensitive strings and exact scope IDs including zero',()=>{
  const a=assignment();expect(nativeOfficeMatches(a,assignment())).toBe(true);expect(nativeOfficeMatches(a,assignment({officeId:'chancellor'}))).toBe(false);expect(nativeOfficeMatches(a,assignment({officeId:'Chancellor '}))).toBe(false);expect(nativeOfficeMatches(a,assignment({scopeId:1}))).toBe(false);expect(nativeOfficeMatches(a,assignment({scopeKind:3}))).toBe(false);
  expect(nativeOfficeMatches(assignment({officeId:null}),assignment({officeId:null}))).toBe(true);expect(nativeOfficeMatches(assignment({officeId:''}),assignment({officeId:''}))).toBe(true);
 });
 it('normalizes query war only; war scope preserves unknown integers without clamping',()=>{
  expect(nativeNormalizeWarSystem(2,99)).toBe(99);expect(nativeNormalizeWarSystem(3,99)).toBe(0);expect(nativeOfficeMatches(assignment(),assignment({warSystemKind:99}))).toBe(true);expect(nativeOfficeMatches(assignment({warSystemKind:1}),assignment())).toBe(false);
 });
 it('keeps first matching record even if dead, missing or foreign; never substitutes a duplicate',()=>{
  for(const first of [{id:7,stateId:3,alive:false},{id:7,stateId:8,alive:true},null]){
   const a=assignment(),b=assignment({holderCharacterId:9}),d=data([null,a,b]),map=new Map([[9,{id:9,stateId:3,alive:true}]]);if(first)map.set(7,first);
   expect(nativeOfficeAssignment(d,assignment())).toBe(a);expect(nativeOfficeHolder(3,d,assignment(),map)).toBeNull();expect(d.assignments).toEqual([null,a,b]);
  }
 });
 it('resolves live same-state ID zero and leaves null-state data uninitialized',()=>{
  const person={id:0,stateId:0,alive:true},d=data([assignment({holderCharacterId:0})]);expect(nativeOfficeHolder(0,d,assignment(),new Map([[0,person]]))).toBe(person);
  const absent=data(null);expect(nativeOfficeHolder(null,absent,assignment(),null)).toBeNull();expect(absent.normalized).toBe(false);
 });
 it('applies all four original trait fields, clamps only final skills and preserves order',()=>{
  const t=ORIGINAL_CHARACTER_TRAITS.find(t=>t.name==='Brave')!;
  expect(nativeCharacterSkills({administrative:40,military:95,diplomatic:20,charisma:30},[t])).toEqual({administrative:40,military:100,diplomatic:20,charisma:35});
  for(const key of ['militaryModifier','diplomaticModifier','charismaModifier'] as const){expect(nativeSkillModifier([{[key]:16777216},{[key]:1},{[key]:-16777216}],key)).toBe(0);expect(nativeSkillModifier([{[key]:16777216},{[key]:-16777216},{[key]:1}],key)).toBe(1);expect(nativeSkillModifier(null,key)).toBe(0);expect(()=>nativeSkillModifier([null as never],key)).toThrow();}
 });
});
