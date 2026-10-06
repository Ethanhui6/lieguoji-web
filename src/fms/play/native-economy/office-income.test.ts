import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fingerprintFiscal15} from '../../../../scripts/fms-fiscal15-fingerprint';
import {ORIGINAL_CHARACTER_TRAITS,nativeTaxModifier,nativeAdministrativeSkill,nativeMilitarySkill} from './character-income';
import {NATIVE_ECONOMIC_OFFICES,nativeCentralIncome,nativeLocalIncome,nativeOfficeSuitability,resolvedNativeOfficeHolder,type NativeEconomicOffice,type ResolvedOfficeHolder} from './office-income';
const f=Math.fround;
const person=(v=50):ResolvedOfficeHolder=>({id:7,stateId:3,alive:true,skills:{administrative:v,military:v,diplomatic:v,charisma:v}});
const trait=(name:string)=>ORIGINAL_CHARACTER_TRAITS.find(t=>t.name===name)!;
const bits=(n:number)=>{const a=new DataView(new ArrayBuffer(4));a.setFloat32(0,n);return a.getUint32(0).toString(16);};

describe('original character and office fiscal inputs, not yet production gameplay',()=>{
 it('preserves exact original trait bytes and the current playable v15 engine',()=>{
  expect(createHash('sha256').update(readFileSync('src/fms/play/native-economy/character-traits.json')).digest('hex')).toBe('80364fe01c1759782e6dad8d9c52eeb44f7963fd88f53fb6f23b2f74157fb797');
  expect(fingerprintFiscal15()).toBe('eb95d5fcb6affb4f1ca405300adbefc69029adaa1e91f293871bfb47966389e4');
  expect(ORIGINAL_CHARACTER_TRAITS.filter(t=>t.taxEfficiencyModifier!==0).map(t=>[t.name,t.taxEfficiencyModifier])).toEqual([['Genius',.1],['Administrator',.15],['Just',.05],['Incompetent',-.1],['Greedy',.1]]);
 });
 it('applies actual tax values without confusing country traits or administrative points',()=>{
  expect(nativeTaxModifier([trait('Administrator')])).toBe(f(.15));expect(nativeTaxModifier([trait('Incompetent')])).toBe(f(-.1));
  expect(nativeAdministrativeSkill(50,[trait('Administrator')])).toBe(70);expect(nativeAdministrativeSkill(50,[trait('Greedy')])).toBe(45);
 });
 it('retains trait order, per-addition f32 and duplicates instead of averaging or deduplicating',()=>{
  const t=(n:number)=>({taxEfficiencyModifier:n,administrativeModifier:n});
  expect(nativeTaxModifier([t(16777216),t(1),t(-16777216)])).toBe(0);expect(nativeTaxModifier([t(16777216),t(-16777216),t(1)])).toBe(1);
  expect(nativeAdministrativeSkill(50,[t(16777216),t(1),t(-16777216)])).toBe(50);expect(nativeAdministrativeSkill(50,[t(16777216),t(-16777216),t(1)])).toBe(51);
  expect(nativeTaxModifier([trait('Administrator'),trait('Administrator')])).toBe(f(.3));expect(nativeAdministrativeSkill(50,[trait('Administrator'),trait('Administrator')])).toBe(90);
 });
 it('clamps final skills but never clamps the summed tax modifier',()=>{
  expect(nativeAdministrativeSkill(90,[trait('Administrator')])).toBe(100);expect(nativeAdministrativeSkill(5,[trait('Incompetent')])).toBe(0);
  expect(nativeTaxModifier([{taxEfficiencyModifier:-2}])).toBe(-2);expect(nativeTaxModifier(null)).toBe(0);expect(nativeAdministrativeSkill(37,null)).toBe(37);
  expect(nativeMilitarySkill(95,15)).toBe(100);expect(nativeMilitarySkill(5,-15)).toBe(0);expect(nativeMilitarySkill(40,2.5)).toBe(42.5);
 });
 it('rejects null trait elements and nonfinite inputs rather than fabricating defaults',()=>{
  expect(()=>nativeTaxModifier([null as never])).toThrow();expect(()=>nativeAdministrativeSkill(50,[null as never])).toThrow();expect(()=>nativeMilitarySkill(50,NaN)).toThrow();expect(()=>nativeAdministrativeSkill(Infinity,null)).toThrow();
 });
 it('matches original binary economic caps and actual scope identities',()=>{
  const p=NATIVE_ECONOMIC_OFFICES;expect([p.Chancellor.cap,p.Steward.cap,p.Governor.cap,p.DistrictGovernor.cap].map(bits)).toEqual(['3d75c28f','3da3d70a','3da3d70a','3d4ccccd']);
  expect([p.Chancellor.scope,p.Steward.scope,p.Governor.scope,p.DistrictGovernor.scope]).toEqual([0,0,1,3]);
 });
 it('does not invent a holder, use a foreign/dead holder or mutate the selected assignment',()=>{
  const p=person(),map=new Map([[7,p]]),a={holderCharacterId:7},before=structuredClone(a);
  expect(resolvedNativeOfficeHolder(3,a,map)).toBe(p);expect(resolvedNativeOfficeHolder(null,a,map)).toBeNull();expect(resolvedNativeOfficeHolder(3,null,map)).toBeNull();expect(resolvedNativeOfficeHolder(3,a,null)).toBeNull();expect(resolvedNativeOfficeHolder(3,{holderCharacterId:99},map)).toBeNull();
  expect(resolvedNativeOfficeHolder(9,a,map)).toBeNull();p.alive=false;expect(resolvedNativeOfficeHolder(3,a,map)).toBeNull();expect(a).toEqual(before);
  const zero={...person(),id:0};expect(resolvedNativeOfficeHolder(3,{holderCharacterId:0},new Map([[0,zero]]))).toBe(zero);
 });
 it.each(Object.keys(NATIVE_ECONOMIC_OFFICES) as NativeEconomicOffice[])('%s distinguishes unfilled office, poor skill, midpoint and excellence',office=>{
  expect(nativeOfficeSuitability(3,null,office)).toBe(0);expect(nativeOfficeSuitability(null,person(0),office)).toBe(0);expect(nativeOfficeSuitability(4,person(0),office)).toBe(0);expect(nativeOfficeSuitability(3,{...person(0),alive:false},office)).toBe(0);
  expect(nativeOfficeSuitability(3,person(0),office)).toBe(-1);expect(nativeOfficeSuitability(3,person(50),office)).toBe(0);expect(nativeOfficeSuitability(3,person(100),office)).toBe(1);expect(nativeOfficeSuitability(3,person(100),null)).toBe(0);
 });
 it('weights administrator and military skills by the office instead of a generic ruler score',()=>{
  const p=person(0);p.skills.administrative=100;expect(nativeOfficeSuitability(3,p,'Chancellor')).toBe(f(-.1));expect(nativeOfficeSuitability(3,p,'Steward')).toBe(f(.3));expect(nativeOfficeSuitability(3,p,'Governor')).toBe(0);
 });
 it('caps central income and treats unfilled offices as neutral, not low ability penalties',()=>{
  expect(nativeCentralIncome(0,0)).toBe(1);expect(nativeCentralIncome(1,0)).toBe(f(1.06));expect(nativeCentralIncome(0,1)).toBe(f(1.08));expect(nativeCentralIncome(1,1)).toBe(f(1.12));expect(nativeCentralIncome(-1,-1)).toBe(f(.88));
 });
 it('multiplies local office factors including the cross term before capping',()=>{
  expect(nativeLocalIncome(0,0)).toBe(1);expect(nativeLocalIncome(1,1)).toBe(f(1.12));expect(nativeLocalIncome(-1,-1)).toBe(f(.88));
  expect(nativeLocalIncome(.5,.8)).toBeCloseTo(1.0816,6);expect(nativeLocalIncome(.5,.8)).not.toBe(f(1.08));expect(nativeLocalIncome(-1,1)).toBeCloseTo(.966,6);
 });
 it('rejects unresolved suitability values',()=>{
  expect(()=>nativeCentralIncome(2,0)).toThrow();expect(()=>nativeLocalIncome(0,-2)).toThrow();expect(()=>nativeLocalIncome(NaN,0)).toThrow();
 });
});
