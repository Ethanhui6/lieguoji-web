import {describe,expect,it,vi} from 'vitest';
import {nativeFamilyDefaults,nativeFamilyManagerDefaults,nativeAssignFamilyColor,nativeColorHtmlRgba} from './family-defaults';
describe('original Family and manager construction',()=>{
 it('allocates ten distinct collections, separate across families',()=>{
  const a=nativeFamilyDefaults(),b=nativeFamilyDefaults(),collections=[a.memberIds,a.collateralMemberIds,a.matrilinealSpouses,a.historicalClaims,a.controlledProvinces,a.relations,a.historicalStateIds,a.lastRulingTime,a.rulingDuration,a.stateResidenceMonths];
  expect(new Set(collections).size).toBe(10);a.memberIds.push(1);a.relations.set(2,.5);a.historicalStateIds.add(3);a.lastRulingTime.set(4,5);
  expect(a.collateralMemberIds).toEqual([]);expect(b.memberIds).toEqual([]);expect(b.relations.size).toBe(0);expect(b.historicalStateIds.size).toBe(0);expect(b.lastRulingTime.size).toBe(0);
 });
 it('uses original defaults without creating a ruler, family members or random color',()=>{
  expect(nativeFamilyDefaults()).toMatchObject({id:0,founderId:0,patriarchId:0,heirId:0,surname:null,cultureName:null,religionId:null,influence:50,wealth:100,extendedMembers:50,updateDay:1,poleCellIndex:-1,polePos:{x:0,y:0},color:{r:0,g:0,b:0,a:0},colorString:null,allowFemaleInheritance:false,isRulingFamily:false,isNeedNameLabelUpdate:false,isNeedBorderLineUpdate:false,foundingTime:0,memberIds:[],collateralMemberIds:[]});
 });
 it('manager begins ID 1, color index 0, records founding events, and separates registries',()=>{
  const m=nativeFamilyManagerDefaults(),n=nativeFamilyManagerDefaults();m.families.set(1,nativeFamilyDefaults());
  expect(m).toMatchObject({nextId:1,nextColorIndex:0,recordFamilyCreateEvent:true,pendingRemovePlaceholderStateFamilyIds:[],validFamiliesForNextMonth:[]});expect(m.historicalFamilies.size).toBe(0);expect(n.families.size).toBe(0);
 });
});
describe('native family color wrapper and HTML conversion',()=>{
 it('copies the returned struct before HTML conversion and adds no hash prefix',()=>{
  const family=nativeFamilyDefaults(),color={r:.1,g:.3,b:.5,a:1},getNextColor=vi.fn(()=>color),toHtml=vi.fn(c=>{expect(family.color).toEqual(c);return nativeColorHtmlRgba(c);});
  nativeAssignFamilyColor(family,{getNextColor,toHtml});expect(family.colorString).toBe('1A4C80FF');expect(getNextColor).toHaveBeenCalledTimes(1);expect(toHtml).toHaveBeenCalledTimes(1);color.r=1;expect(family.color.r).toBe(Math.fround(.1));expect(family.isNeedNameLabelUpdate).toBe(false);
 });
 it('uses half-even quantization after scaling, then integer clamping',()=>{
  expect(nativeColorHtmlRgba({r:0,g:.3,b:1,a:.5})).toBe('004CFF80');
  expect(nativeColorHtmlRgba({r:-1,g:2,b:.9,a:0})).toBe('00FFE600');
 });
 it('upstream color failure leaves both values, HTML failure leaves new color and old string',()=>{
  const a=nativeFamilyDefaults();a.colorString='old';
  expect(()=>nativeAssignFamilyColor(a,{getNextColor:()=>{throw Error('palette');},toHtml:()=>''})).toThrow('palette');expect(a.color).toEqual({r:0,g:0,b:0,a:0});expect(a.colorString).toBe('old');
  expect(()=>nativeAssignFamilyColor(a,{getNextColor:()=>({r:1,g:0,b:0,a:1}),toHtml:()=>{throw Error('html');}})).toThrow('html');expect(a.color).toEqual({r:1,g:0,b:0,a:1});expect(a.colorString).toBe('old');
 });
 it('stores a null HTML result directly without retry or fallback',()=>{
  const a=nativeFamilyDefaults();nativeAssignFamilyColor(a,{getNextColor:()=>({r:1,g:0,b:0,a:1}),toHtml:()=>null});expect(a.colorString).toBeNull();
 });
});
