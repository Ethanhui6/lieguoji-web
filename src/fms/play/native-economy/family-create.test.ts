import {describe,expect,it,vi} from 'vitest';
import {nativeCreateFamily,nativeCreateFamilyWithoutReligion,type NativeCreatedFamily,type NativeFamilyCreationPorts,type NativeFamilyCreationState,type NativeFamilyProvince,type NativeFamilyRegistry} from './family-create';
type F=NativeCreatedFamily&{controlled:number[]};type S=NativeFamilyCreationState&{id:number};type P=NativeFamilyProvince&{owner:number};
type E={id:number;founder:number;time:number;reason:string};
const object=():F=>({id:0,surname:null,cultureName:null,religionId:null,stateId:0,homeProvinceId:0,originalHomeProvinceId:0,foundingTime:0,founderId:0,isNeedNameLabelUpdate:false,isNeedBorderLineUpdate:false,controlled:[]});
function setup(){
 const f=object(),state:S={id:5,isBlankState:false,isConquerable:true,stateReligionId:'state-faith'},province:P={i:7,familyId:0,owner:99};
 const registry:NativeFamilyRegistry<F>={nextId:2,families:new Map()};
 const p:NativeFamilyCreationPorts<F,S,P,string,E>={
  containsState:vi.fn(()=>true),getState:vi.fn(()=>state),constructFamily:vi.fn(()=>f),generateRandomColor:vi.fn(),gameTime:vi.fn(()=>10.123456789),
  getProvince:vi.fn(()=>province),mainReligion:vi.fn(()=> 'province-faith'),randomReligion:vi.fn(()=> 'random-faith'),
  removeControlledProvince:vi.fn((x:F,id:number)=>{x.controlled=x.controlled.filter(i=>i!==id);}),addControlledProvince:vi.fn((x:F,id:number)=>{x.controlled.push(id);}),updateMaterial:vi.fn(),
  getReligion:vi.fn(()=> 'Faith Display'),logCreated:vi.fn(),warn:vi.fn(),recordFamilyCreateEvent:false,
  prepareHistory:vi.fn(),createFoundedEvent:vi.fn((id,founder,reason,time)=>({id,founder,reason,time})),recordGlobal:vi.fn(),recordState:vi.fn(),
 };
 return {f,state,province,registry,p,create:(religion:string|null='provided',home=0)=>nativeCreateFamily('Surname','Culture',religion,5,home,registry,p)};
}
describe('native family creation registry transaction',()=>{
 it.each([0,-1])('invalid state ID %s returns before querying state or constructing',id=>{
  const x=setup();expect(nativeCreateFamily('',null,null,id,0,x.registry,x.p)).toBeNull();expect(x.p.containsState).not.toHaveBeenCalled();expect(x.p.constructFamily).not.toHaveBeenCalled();expect(x.registry.nextId).toBe(2);
 });
 it('missing, blank or unconquerable state never consumes an ID/color',()=>{
  const x=setup();x.p.containsState=()=>false;expect(x.create()).toBeNull();expect(x.p.getState).not.toHaveBeenCalled();
  const y=setup();y.state.isBlankState=true;expect(y.create()).toBeNull();
  const z=setup();z.state.isConquerable=false;expect(z.create()).toBeNull();
  for(const v of [x,y,z]){expect(v.registry.nextId).toBe(2);expect(v.p.generateRandomColor).not.toHaveBeenCalled();}
 });
 it('Contains true and null GetState still creates, and never records state history',()=>{
  const x=setup();x.p.getState=()=>null;x.p.recordFamilyCreateEvent=true;
  expect(x.create()).toBe(x.f);expect(x.p.logCreated).toHaveBeenCalledWith(x.f,null,'Faith Display');expect(x.p.recordGlobal).toHaveBeenCalledTimes(1);expect(x.p.recordState).not.toHaveBeenCalled();
 });
 it('constructs and colors before ID consumption, preserves text and rounds time as float',()=>{
  const x=setup(),calls:string[]=[];x.p.constructFamily=()=>{calls.push('ctor');expect(x.registry.nextId).toBe(2);return x.f;};
  x.p.generateRandomColor=()=>{calls.push('color');expect(x.f.id).toBe(0);expect(x.registry.nextId).toBe(2);};
  nativeCreateFamily('',null,' ',5,-1,x.registry,x.p);
  expect(calls).toEqual(['ctor','color']);expect(x.f).toMatchObject({id:2,surname:'',cultureName:null,religionId:' ',stateId:5,homeProvinceId:-1,originalHomeProvinceId:-1,foundingTime:Math.fround(10.123456789),founderId:0});expect(x.registry.nextId).toBe(3);expect(x.p.randomReligion).not.toHaveBeenCalled();
 });
 it.each([
  ['explicit','province','state','explicit',0,0],
  ['','province','state','province',1,0],
  [null,'','state','state',1,0],
  [null,null,'','random-faith',1,1],
  [' ','province','state',' ',0,0],
 ] as const)('religion source obeys lazy precedence: %s / %s / %s',(input,province,state,result,mainCalls,randomCalls)=>{
  const x=setup();x.p.mainReligion=vi.fn(()=>province);x.state.stateReligionId=state;x.create(input,7);
  expect(x.f.religionId).toBe(result);expect(x.p.mainReligion).toHaveBeenCalledTimes(mainCalls);expect(x.p.randomReligion).toHaveBeenCalledTimes(randomCalls);
 });
 it('re-reads state for religion and accepts null random religion without retry',()=>{
  const x=setup(),second={...x.state,stateReligionId:''};x.p.getState=vi.fn().mockReturnValueOnce(x.state).mockReturnValueOnce(second);x.p.getProvince=()=>null;x.p.randomReligion=vi.fn(()=>null);
  expect(x.create(null,7)).toBe(x.f);expect(x.f.religionId).toBeNull();expect(x.p.getState).toHaveBeenCalledTimes(2);expect(x.p.randomReligion).toHaveBeenCalledExactlyOnceWith(null);expect(x.p.getReligion).toHaveBeenCalledWith(null);
 });
 it('writes the empty province religion before a later state lookup fails',()=>{
  const x=setup();x.p.mainReligion=()=>'';x.p.getState=vi.fn().mockReturnValueOnce(x.state).mockImplementationOnce(()=>{expect(x.f.religionId).toBe('');throw Error('state failed');});
  expect(()=>x.create(null,7)).toThrow('state failed');expect(x.f.religionId).toBe('');expect(x.registry.families.size).toBe(0);expect(x.registry.nextId).toBe(3);
 });
 it('writes the empty state religion before the random religion port runs or fails',()=>{
  const x=setup();x.p.mainReligion=()=>null;x.state.stateReligionId='';x.p.randomReligion=()=>{expect(x.f.religionId).toBe('');throw Error('religion failed');};
  expect(()=>x.create(null,7)).toThrow('religion failed');expect(x.f.religionId).toBe('');expect(x.registry.families.size).toBe(0);
 });
 it('religion-less overload performs the same fallback instead of inventing a faith',()=>{
  const x=setup();expect(nativeCreateFamilyWithoutReligion('N','C',5,0,x.registry,x.p)?.religionId).toBe('state-faith');expect(x.p.getProvince).not.toHaveBeenCalled();expect(x.p.getState).toHaveBeenCalledTimes(2);
 });
 it('transfers a foreign-owned province before registration and records actual province ID',()=>{
  const x=setup(),old={...object(),id:9,controlled:[7]},calls:string[]=[];x.province.familyId=9;x.registry.families.set(9,old);
  x.p.removeControlledProvince=(f,id)=>{calls.push('remove');expect(f).toBe(old);expect(id).toBe(7);expect(x.province.familyId).toBe(9);};
  x.p.addControlledProvince=(f,id)=>{calls.push('add');expect(x.province.familyId).toBe(2);expect(old.isNeedNameLabelUpdate&&old.isNeedBorderLineUpdate).toBe(true);expect(x.registry.families.has(2)).toBe(false);f.controlled.push(id);};
  x.p.updateMaterial=()=>{calls.push('material');expect(x.f.homeProvinceId).toBe(7);expect(x.registry.families.has(2)).toBe(false);};
  x.p.getReligion=()=>{calls.push('religion-log');expect(x.registry.families.get(2)).toBe(x.f);return null;};
  x.create('provided',99);expect(calls).toEqual(['remove','add','material','religion-log']);expect(x.f.originalHomeProvinceId).toBe(7);expect(x.province.owner).toBe(99);expect(x.f.controlled).toEqual([7]);
 });
 it('same family ID or missing previous family skips removal but still adds and updates',()=>{
  for(const previousId of [2,50]){const x=setup();x.province.familyId=previousId;x.create('x',7);expect(x.p.removeControlledProvince).not.toHaveBeenCalled();expect(x.p.addControlledProvince).toHaveBeenCalledWith(x.f,7);expect(x.p.updateMaterial).toHaveBeenCalledTimes(1);}
 });
 it('does not require a home province to exist or fix invalid home references',()=>{
  const x=setup();x.p.getProvince=()=>null;x.create('x',999);expect(x.f.homeProvinceId).toBe(999);expect(x.p.addControlledProvince).not.toHaveBeenCalled();expect(x.registry.families.get(2)).toBe(x.f);
 });
 it('wraps the int32 counter and overwrites a conflicting current registry key',()=>{
  const x=setup(),old=object();x.registry.nextId=2147483647;x.registry.families.set(2147483647,old);
  x.create();expect(x.f.id).toBe(2147483647);expect(x.registry.nextId).toBe(-2147483648);expect(x.registry.families.size).toBe(1);expect(x.registry.families.get(2147483647)).toBe(x.f);
 });
 it('logs even without history; history uses original requested home and a second time read',()=>{
  const x=setup();x.create();expect(x.p.getReligion).toHaveBeenCalledTimes(1);expect(x.p.logCreated).toHaveBeenCalledTimes(1);expect(x.p.prepareHistory).not.toHaveBeenCalled();
  const y=setup(),calls:string[]=[];y.p.recordFamilyCreateEvent=true;y.p.gameTime=vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11.123456789);
  y.p.prepareHistory=(f,s,home)=>{calls.push('prepare');expect([f,s,home]).toEqual([y.f,y.state,99]);expect(y.registry.families.get(2)).toBe(y.f);};
  y.p.recordGlobal=e=>{calls.push('global');expect(e).toEqual({id:2,founder:0,reason:'noble_appointment',time:Math.fround(11.123456789)});};
  y.p.recordState=s=>{calls.push('state');expect(s).toBe(y.state);};y.create('x',99);expect(calls).toEqual(['prepare','global','state']);expect(y.f.foundingTime).toBe(10);
 });
 it('color failure leaves ID counter and registry untouched',()=>{
  const x=setup();x.p.generateRandomColor=()=>{throw Error('color failed');};expect(()=>x.create()).toThrow('color failed');expect(x.registry.nextId).toBe(2);expect(x.registry.families.size).toBe(0);
 });
 it('province-add failure retains changed province and consumed ID but no registration',()=>{
  const x=setup();x.p.addControlledProvince=()=>{throw Error('control failed');};expect(()=>x.create('x',99)).toThrow('control failed');expect(x.province.familyId).toBe(2);expect(x.f.homeProvinceId).toBe(99);expect(x.registry.nextId).toBe(3);expect(x.registry.families.size).toBe(0);
 });
 it('religion log failure occurs after registration and does not undo it',()=>{
  const x=setup();x.p.getReligion=()=>{throw Error('log failed');};expect(()=>x.create()).toThrow('log failed');expect(x.registry.families.get(2)).toBe(x.f);expect(x.registry.nextId).toBe(3);
 });
 it('global history failure retains registration without calling state history',()=>{
  const x=setup();x.p.recordFamilyCreateEvent=true;x.p.recordGlobal=()=>{throw Error('history failed');};expect(()=>x.create()).toThrow('history failed');expect(x.registry.families.get(2)).toBe(x.f);expect(x.p.recordState).not.toHaveBeenCalled();
 });
});
