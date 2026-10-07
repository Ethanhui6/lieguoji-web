import {describe,expect,it,vi} from 'vitest';
import {nativeCreateVirtualFamilyMember,type NativeVirtualPerson,type NativeVirtualFamily,type NativeVirtualPorts} from './family-virtual';
import {nativeBirthTimeFromAge,nativeGetYearSince,nativeUpdateCharacterAge} from './character-calendar';
import {createNativeIsoCalendar,isoDate} from './iso-calendar';
const family=():NativeVirtualFamily=>({id:2,stateId:3,religionId:'faith',cultureName:'culture',collateralMemberIds:[]});
const person=():NativeVirtualPerson&{isAlive:boolean}=>({id:7,familyId:0,stateId:0,religionId:null,age:0,birthTime:0,isAlive:true});
function ports(c:NativeVirtualPerson|null):NativeVirtualPorts<NativeVirtualPerson>{return {generate:vi.fn(()=>c),random:{floatRange:vi.fn(()=>29.875)},getBirthTimeFromAge:vi.fn(()=>-100),updateAge:vi.fn()};}
describe('original virtual collateral member creation',()=>{
 it('requires a family, but failed generation does not draw age or reach lists',()=>{
  const p=ports(null),f=family();f.collateralMemberIds=null;
  expect(()=>nativeCreateVirtualFamilyMember(null,0,p)).toThrow();expect(p.generate).not.toHaveBeenCalled();
  expect(nativeCreateVirtualFamilyMember(f,1,p)).toBeNull();expect(p.generate).toHaveBeenCalledWith('culture',1,null);
  expect(p.random.floatRange).not.toHaveBeenCalled();expect(p.getBirthTimeFromAge).not.toHaveBeenCalled();expect(p.updateAge).not.toHaveBeenCalled();
 });
 it('writes identity before float age, birthday before update, then appends the actual ID',()=>{
  const c=person(),f=family(),calls:string[]=[],p=ports(c);
  p.generate=(culture,gender,father)=>{calls.push('generate');expect([culture,gender,father]).toEqual(['culture',0,null]);return c;};
  p.random.floatRange=(min,max)=>{calls.push('draw');expect([min,max]).toEqual([25,35]);expect(c).toMatchObject({familyId:2,stateId:3,religionId:'faith',age:0});return 29.875;};
  p.getBirthTimeFromAge=age=>{calls.push('birth');expect(age).toBe(29);expect(c.age).toBe(29);return -100.123456789;};
  p.updateAge=x=>{calls.push('update');expect(x).toBe(c);expect(c.birthTime).toBe(Math.fround(-100.123456789));expect(f.collateralMemberIds).toEqual([]);c.age=28;};
  expect(nativeCreateVirtualFamilyMember(f,0,p)).toBe(c);expect(c.age).toBe(28);expect(f.collateralMemberIds).toEqual([7]);expect(calls).toEqual(['generate','draw','birth','update']);
 });
 it.each([[25,25],[34.999,34],[34.999999,35],[35,35]])('retains native float inclusive draw %s then truncates to %s',(draw,age)=>{
  const c=person(),p=ports(c);p.random.floatRange=()=>draw;nativeCreateVirtualFamilyMember(family(),0,p);expect(c.age).toBe(age);
 });
 it('uses the immediately updated real calendar age instead of the sampled age',()=>{
  const c=person(),p=ports(c),calendar=createNativeIsoCalendar(isoDate(1,1,1)),seconds=Math.fround(.1);
  p.random.floatRange=()=>35;p.getBirthTimeFromAge=age=>nativeBirthTimeFromAge(age,0,seconds);
  p.updateAge=()=>nativeUpdateCharacterAge(c,t=>nativeGetYearSince(t,0,seconds,calendar));
  nativeCreateVirtualFamilyMember(family(),0,p);expect(c.age).toBe(34);
 });
 it('does not deduplicate collateral or add inferred parent/ordinary-member links',()=>{
  const c={...person(),childrenIds:[9],fatherId:0,spouseId:0},f={...family(),memberIds:[2],patriarchId:2,collateralMemberIds:[7]};
  nativeCreateVirtualFamilyMember(f,0,ports(c));expect(f.collateralMemberIds).toEqual([7,7]);expect(f.memberIds).toEqual([2]);expect(f.patriarchId).toBe(2);expect(c.childrenIds).toEqual([9]);expect(c.fatherId).toBe(0);expect(c.spouseId).toBe(0);
 });
 it('does not roll back registered or identity-mutated objects on invalid random input',()=>{
  const c=person(),p=ports(c),f=family();p.random.floatRange=()=>40;
  expect(()=>nativeCreateVirtualFamilyMember(f,0,p)).toThrow('Invalid');expect(c).toMatchObject({familyId:2,stateId:3,religionId:'faith',age:0});expect(f.collateralMemberIds).toEqual([]);
 });
 it('propagates update failure without appending or undoing its earlier writes',()=>{
  const c=person(),p=ports(c),f=family();p.updateAge=x=>{x.age=28;throw Error('clock failed');};
  expect(()=>nativeCreateVirtualFamilyMember(f,0,p)).toThrow('clock failed');expect(c).toMatchObject({age:28,birthTime:-100,familyId:2});expect(f.collateralMemberIds).toEqual([]);
 });
 it('birthday failure keeps sampled age and previous birthday, without updating or appending',()=>{
  const c=person(),p=ports(c),f=family();c.birthTime=-8;p.getBirthTimeFromAge=()=>{throw Error('birth failed');};
  expect(()=>nativeCreateVirtualFamilyMember(f,0,p)).toThrow('birth failed');expect(c.age).toBe(29);expect(c.birthTime).toBe(-8);expect(p.updateAge).not.toHaveBeenCalled();expect(f.collateralMemberIds).toEqual([]);
 });
 it('reaches a null collateral list only after creation, birthday and update',()=>{
  const c=person(),p=ports(c),f=family();f.collateralMemberIds=null;
  expect(()=>nativeCreateVirtualFamilyMember(f,0,p)).toThrow('collateral');expect(p.updateAge).toHaveBeenCalledWith(c);expect(c.age).toBe(29);
 });
});
