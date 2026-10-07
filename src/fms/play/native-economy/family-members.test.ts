import {describe,expect,it,vi} from 'vitest';
import {nativeGenerateLeaderSpouse,nativeGenerateLeaderChildren,nativeGenerateCollateralMembers,nativeGenerateCollateralHousehold,nativeSpouseRoleDefaults,type NativeFamilyMemberPorts,type NativeInitialFamily} from './family-members';
import {nativeCharacterDefaults,type NativeRegisteredCharacter} from './character-registry';
import {nativeFindSuccessor} from './family-succession';
type C=NativeRegisteredCharacter<string>;
const person=(id:number,age=40,gender=0):C=>({...nativeCharacterDefaults<string>(),id,age,gender,familyId:10,stateId:5,lastName:'Head'});
function setup(){
 const head=person(1),spouse=person(2,30,1),people=new Map<number,C>([[1,head],[2,spouse]]),generated:C[]=[],birthAges:number[]=[];
 head.spouseId=2;spouse.spouseId=1;
 const family:NativeInitialFamily&{collateralMemberIds:number[]}={id:10,stateId:5,cultureName:'family-culture',memberIds:[1],collateralMemberIds:[]};
 const p:NativeFamilyMemberPorts<C>={
  generateInit:vi.fn((_culture:string|null,gender:number,_father:C|null)=>{const c=person(100+generated.length,0,gender);c.familyId=0;c.stateId=0;people.set(c.id,c);generated.push(c);return c;}),
  getCharacter:vi.fn((id:number)=>people.get(id)??null),lastName:vi.fn((c:C)=>c.lastName),
  random:{floatRange:vi.fn((min:number)=>min),intRange:vi.fn((min:number)=>min),value:vi.fn(()=>.5)},
  birthTimeFromAge:vi.fn((age:number)=>{birthAges.push(age);return age;}),updateAge:vi.fn((c:C)=>{c.age=Math.trunc(c.birthTime);}),gameTime:vi.fn(()=>12.123456789),createSpouseRole:vi.fn(nativeSpouseRoleDefaults),reportMissingSpouse:vi.fn(),generateCollateralHousehold:vi.fn(),
 };
 return {head,spouse,people,generated,birthAges,family,p};
}
describe('leader spouse, actual pair and one spouse role',()=>{
 it('generation failure consumes no age draws and leaves existing spouse untouched',()=>{
  const x=setup();x.p.generateInit=vi.fn(()=>null);nativeGenerateLeaderSpouse(x.head,x.family,{i:5},'input-culture',x.p);
  expect(x.head.spouseId).toBe(2);expect(x.p.random.floatRange).not.toHaveBeenCalled();expect(x.p.createSpouseRole).not.toHaveBeenCalled();
 });
 it('pairs both IDs, uses leader family but passed family list, and adds a role only to spouse',()=>{
  const x=setup();x.head.familyId=77;x.head.marriageType=9;
  nativeGenerateLeaderSpouse(x.head,x.family,{i:8},'input-culture',x.p);const s=x.generated[0];
  expect(x.p.generateInit).toHaveBeenCalledWith('input-culture',1,null);expect(x.head.spouseId).toBe(s.id);expect(s.spouseId).toBe(1);expect(s.familyId).toBe(77);expect(x.family.memberIds).toEqual([1,s.id]);expect(s.stateId).toBe(8);expect(s.lastName).toBe('Head');
  expect(x.head.marriageType).toBe(0);expect(s.marriageType).toBe(0);expect(x.head.roles).toEqual([]);expect(s.roles).toEqual([{roleType:'Spouse',holderId:s.id,startTime:Math.fround(12.123456789),spouseOfId:1,stateId:8}]);expect(s.originalFamilyId).toBe(0);
 });
 it('reads age after drawing offset, applies under-16 redraw, and does not assign estimated age first',()=>{
  const x=setup();x.p.random.floatRange=vi.fn((min:number)=>{if(min===-10){x.head.age=10;return 0;}return 18.5;});
  x.p.updateAge=c=>{expect(c.age).toBe(0);c.age=17;};nativeGenerateLeaderSpouse(x.head,null,{i:5},'C',x.p);
  expect(x.birthAges).toEqual([18.5]);expect(x.generated[0].age).toBe(17);expect(x.p.random.floatRange).toHaveBeenNthCalledWith(2,16,20);
 });
 it('null family skips membership; null reached member list fails after pairing but before role',()=>{
  const x=setup();nativeGenerateLeaderSpouse(x.head,null,{i:5},'C',x.p);expect(x.generated[0].roles).toHaveLength(1);
  const y=setup();y.family.memberIds=null;expect(()=>nativeGenerateLeaderSpouse(y.head,y.family,{i:5},'C',y.p)).toThrow();expect(y.head.spouseId).toBe(100);expect(y.generated[0]).toMatchObject({spouseId:1,familyId:10,stateId:0});expect(y.p.createSpouseRole).not.toHaveBeenCalled();
 });
 it('a null captured role list throws only after role construction and clock read',()=>{
  const x=setup(),s=person(100);Object.defineProperty(s,'roles',{value:null});x.p.generateInit=()=>s;
  expect(()=>nativeGenerateLeaderSpouse(x.head,x.family,{i:5},'C',x.p)).toThrow();expect(x.p.createSpouseRole).toHaveBeenCalledTimes(1);expect(x.p.gameTime).toHaveBeenCalledTimes(1);expect(x.family.memberIds).toEqual([1,100]);
 });
 it('a role constructor replacing the property does not replace the captured destination list',()=>{
  const x=setup(),s=person(100),original=s.roles;x.p.generateInit=()=>s;x.p.createSpouseRole=()=>{s.roles=[];return nativeSpouseRoleDefaults();};
  nativeGenerateLeaderSpouse(x.head,x.family,{i:5},'C',x.p);expect(original).toHaveLength(1);expect(s.roles).toEqual([]);
 });
});

describe('leader children creation and real parent links',()=>{
 it.each([[25,null],[26,[0,2]],[30,[0,2]],[31,[0,3]],[40,[0,3]],[41,[1,3]]] as const)('uses strict age boundaries at %s', (age,range)=>{
  const x=setup();x.head.age=age;nativeGenerateLeaderChildren(x.head,x.family,false,x.p);
  if(range===null)expect(x.p.random.intRange).not.toHaveBeenCalled();else expect(x.p.random.intRange).toHaveBeenNthCalledWith(1,...range);
  expect(x.p.getCharacter).toHaveBeenCalledWith(2);
 });
 it('initial null leader draws count before throwing, noninitial null does not',()=>{
  const x=setup();expect(()=>nativeGenerateLeaderChildren(null,x.family,true,x.p)).toThrow();expect(x.p.random.intRange).toHaveBeenCalledExactlyOnceWith(1,4);
  const y=setup();expect(()=>nativeGenerateLeaderChildren(null,y.family,false,y.p)).toThrow();expect(y.p.random.intRange).not.toHaveBeenCalled();
 });
 it('spouse absence consumes the initial count and logs only in initial mode',()=>{
  const x=setup();x.head.spouseId=0;nativeGenerateLeaderChildren(x.head,x.family,true,x.p);expect(x.p.random.intRange).toHaveBeenCalledTimes(1);expect(x.p.reportMissingSpouse).toHaveBeenCalledWith(x.head);expect(x.p.generateInit).not.toHaveBeenCalled();
  const y=setup();y.head.spouseId=99;nativeGenerateLeaderChildren(y.head,y.family,false,y.p);expect(y.p.getCharacter).toHaveBeenCalledWith(99);expect(y.p.reportMissingSpouse).not.toHaveBeenCalled();
 });
 it('zero attempts still queries spouse without reading family or children lists',()=>{
  const x=setup();x.head.age=25;Object.defineProperty(x.head,'childrenIds',{get(){throw Error('unreached');}});
  nativeGenerateLeaderChildren(x.head,null,false,x.p);expect(x.p.getCharacter).toHaveBeenCalledWith(2);expect(x.p.generateInit).not.toHaveBeenCalled();
 });
 it('balances living genders each attempt, includes previous new children and retains the .5 female tie',()=>{
  const x=setup();x.p.random.intRange=()=>3;x.spouse.isAlive=false;
  nativeGenerateLeaderChildren(x.head,x.family,true,x.p);
  expect(x.generated.map(c=>c.gender)).toEqual([1,0,1]);expect(x.p.random.value).toHaveBeenCalledTimes(2);
  expect(x.generated.every(c=>c.fatherId===1&&c.motherId===2&&c.familyId===10&&c.stateId===5)).toBe(true);
  expect(x.head.childrenIds).toEqual([100,101,102]);expect(x.spouse.childrenIds).toEqual([100,101,102]);expect(x.family.memberIds).toEqual([1,100,101,102]);expect(x.family.collateralMemberIds).toEqual([]);
  expect(x.p.generateInit).toHaveBeenNthCalledWith(1,'family-culture',1,x.head);
 });
 it('counts repeated foreign living children, skips missing and dead entries, and avoids unnecessary sex draws',()=>{
  const x=setup(),male=person(3,5,0),dead=person(4,5,1);male.familyId=999;dead.isAlive=false;x.people.set(3,male);x.people.set(4,dead);x.head.childrenIds=[3,3,4,99];
  nativeGenerateLeaderChildren(x.head,x.family,true,x.p);expect(x.generated[0].gender).toBe(1);expect(x.p.random.value).not.toHaveBeenCalled();
 });
 it('null child consumes an attempt without age draws or retry',()=>{
  const x=setup();x.p.random.intRange=()=>3;x.p.generateInit=vi.fn(()=>null);nativeGenerateLeaderChildren(x.head,x.family,true,x.p);
  expect(x.p.generateInit).toHaveBeenCalledTimes(3);expect(x.p.random.floatRange).not.toHaveBeenCalled();expect(x.head.childrenIds).toEqual([]);
 });
 it('uses younger parent minus 20..35, with a negative-age integer 0..4 fallback',()=>{
  const x=setup();x.spouse.age=10;x.p.random.floatRange=()=>35;x.p.random.intRange=vi.fn((min:number)=>min===1?1:4);
  nativeGenerateLeaderChildren(x.head,x.family,true,x.p);expect(x.birthAges).toEqual([4]);expect(x.p.random.intRange).toHaveBeenLastCalledWith(0,5);expect(x.generated[0].age).toBe(4);
 });
 it('invalid leader gender uses spouse twice, retaining two appends to that one list',()=>{
  const x=setup();x.head.gender=2;nativeGenerateLeaderChildren(x.head,x.family,true,x.p);
  expect(x.generated[0]).toMatchObject({fatherId:2,motherId:2});expect(x.spouse.childrenIds).toEqual([100,100]);expect(x.head.childrenIds).toEqual([]);expect(x.p.generateInit).toHaveBeenCalledWith('family-culture',1,x.spouse);
 });
 it('list failure after age update retains family append, without inventing rollback',()=>{
  const x=setup();x.p.updateAge=c=>{c.age=10;Object.defineProperty(x.head,'childrenIds',{value:null});};
  expect(()=>nativeGenerateLeaderChildren(x.head,x.family,true,x.p)).toThrow();expect(x.family.memberIds).toEqual([1,100]);expect(x.spouse.childrenIds).toEqual([]);expect(x.generated[0].age).toBe(10);
 });
});

describe('collateral household differs from leader spouse/children',()=>{
 it('surname failure keeps distinct partial pair/marriage states for leader and collateral paths',()=>{
  const x=setup(),a=person(100);a.spouseId=0;a.marriageType=7;x.head.marriageType=9;x.p.generateInit=()=>a;x.p.lastName=()=>{throw Error('surname');};
  expect(()=>nativeGenerateLeaderSpouse(x.head,x.family,{i:5},'C',x.p)).toThrow('surname');expect(x.head).toMatchObject({spouseId:100,marriageType:0});expect(a).toMatchObject({spouseId:1,marriageType:0});expect(x.family.memberIds).toEqual([1]);
  const y=setup(),b=person(100);b.spouseId=0;b.marriageType=7;y.head.marriageType=9;y.p.generateInit=()=>b;y.p.lastName=()=>{throw Error('surname');};
  expect(()=>nativeGenerateCollateralHousehold(y.head,y.family,'C',false,y.p)).toThrow('surname');expect(y.head).toMatchObject({spouseId:2,marriageType:9});expect(b).toMatchObject({familyId:10,stateId:5,spouseId:0,marriageType:7});expect(y.family.memberIds).toEqual([1]);
 });
 it('reads member age before the offset and leaves marriage values/roles alone',()=>{
  const x=setup();x.head.marriageType=9;x.p.random.floatRange=()=>{x.head.age=90;return 0;};
  nativeGenerateCollateralHousehold(x.head,x.family,'input-culture',false,x.p);
  expect(x.birthAges).toEqual([40]);expect(x.head.marriageType).toBe(9);expect(x.generated[0].roles).toEqual([]);expect(x.p.createSpouseRole).not.toHaveBeenCalled();expect(x.p.random.intRange).toHaveBeenCalledExactlyOnceWith(0,2);
 });
 it('null family is reached only after generating and aging a spouse',()=>{
  const x=setup();expect(()=>nativeGenerateCollateralHousehold(x.head,null,'C',false,x.p)).toThrow();expect(x.generated).toHaveLength(1);expect(x.p.updateAge).toHaveBeenCalledTimes(1);expect(x.head.spouseId).toBe(2);expect(x.p.random.intRange).not.toHaveBeenCalled();
 });
 it('uses family identity for spouse and preserves its preexisting marriage value',()=>{
  const x=setup();x.head.familyId=99;const generate=x.p.generateInit;x.p.generateInit=(...args)=>{const c=generate(...args);if(c)c.marriageType=7;return c;};
  nativeGenerateCollateralHousehold(x.head,x.family,'C',false,x.p);expect(x.generated[0]).toMatchObject({familyId:10,stateId:5,marriageType:7});expect(x.family.memberIds).toEqual([1,100]);
 });
 it('uses member age minus 18..35 and cousin count, not younger-parent age or 20..35',()=>{
  const x=setup();x.head.age=20;x.p.random.intRange=vi.fn(()=>1);x.p.random.floatRange=vi.fn((min:number)=>min===-10?0:18);
  nativeGenerateCollateralHousehold(x.head,x.family,'input-culture',true,x.p);
  expect(x.birthAges).toEqual([20,2]);expect(x.p.random.intRange).toHaveBeenCalledExactlyOnceWith(0,3);expect(x.p.random.floatRange).toHaveBeenLastCalledWith(18,35);
  expect(x.p.generateInit).toHaveBeenNthCalledWith(1,'input-culture',1,null);expect(x.p.generateInit).toHaveBeenNthCalledWith(2,'family-culture',1,x.head);expect(x.generated[1]).toMatchObject({fatherId:1,motherId:100});
 });
 it('negative child age falls back to 0..14, preserving double parent append for invalid gender',()=>{
  const x=setup();x.head.age=10;x.head.gender=3;x.p.random.intRange=vi.fn((_min:number,max:number)=>max===15?14:1);x.p.random.floatRange=vi.fn((min:number)=>min===-10?0:min===16?16:35);
  nativeGenerateCollateralHousehold(x.head,x.family,'C',false,x.p);
  expect(x.birthAges).toEqual([16,14]);expect(x.p.random.intRange).toHaveBeenLastCalledWith(0,15);expect(x.generated[1]).toMatchObject({fatherId:100,motherId:100});expect(x.generated[0].childrenIds).toEqual([101,101]);expect(x.head.childrenIds).toEqual([]);
 });
});

describe('two collateral generation groups and downstream probability',()=>{
 it('appends ordinary members only, and equality at .3/.4 does not generate households',()=>{
  const x=setup(),values=[.5,Math.fround(.3),.5,Math.fround(.4)];x.p.random.value=()=>values.shift()!;nativeGenerateCollateralMembers(x.head,x.family,'C',x.p);
  expect(x.generated).toHaveLength(2);expect(x.family.memberIds).toEqual([1,100,101]);expect(x.family.collateralMemberIds).toEqual([]);expect(x.head.childrenIds).toEqual([]);expect(x.generated.every(c=>c.fatherId===0&&c.motherId===0)).toBe(true);expect(x.p.generateCollateralHousehold).not.toHaveBeenCalled();expect(values).toEqual([]);
 });
 it('first group uses updated age gate; second group draws probability without that gate',()=>{
  const x=setup(),values=[.5,.5,.9];x.p.random.value=vi.fn(()=>values.shift()!);x.p.updateAge=c=>{c.age=24;};nativeGenerateCollateralMembers(x.head,x.family,'C',x.p);
  expect(x.p.random.value).toHaveBeenCalledTimes(3);expect(x.p.generateCollateralHousehold).toHaveBeenCalledExactlyOnceWith(x.generated[1],x.family,'C',true);
 });
 it('finishes first household before drawing second count, and reads the two ages in different orders',()=>{
  const x=setup(),values=[.5,.9,.5,.9];x.p.random.value=()=>values.shift()!;
  x.p.random.floatRange=(min)=>{if(min===-15){x.head.age=50;return -5;}if(min===10){x.head.age=90;return 10;}throw Error('Unexpected range');};
  x.p.random.intRange=vi.fn((_min:number,max:number)=>{if(max===3)expect(x.p.generateCollateralHousehold).toHaveBeenCalledWith(x.generated[0],x.family,'C',false);return 1;});
  nativeGenerateCollateralMembers(x.head,x.family,'C',x.p);expect(x.birthAges).toEqual([45,60]);expect(x.p.generateCollateralHousehold).toHaveBeenCalledTimes(2);
 });
 it('has separate upper-age redraws for the two groups',()=>{
  const x=setup();x.head.age=80;x.p.random.floatRange=vi.fn((min:number)=>min===-15?15:min===50?60:min===10?30:65);
  nativeGenerateCollateralMembers(x.head,x.family,'C',x.p);expect(x.birthAges).toEqual([60,65]);expect(x.p.random.floatRange).toHaveBeenNthCalledWith(2,50,70);expect(x.p.random.floatRange).toHaveBeenNthCalledWith(4,60,80);
 });
 it('null created members consume both attempts but no age or household draws',()=>{
  const x=setup();x.p.generateInit=vi.fn(()=>null);nativeGenerateCollateralMembers(x.head,x.family,'C',x.p);expect(x.p.generateInit).toHaveBeenCalledTimes(2);expect(x.p.random.value).toHaveBeenCalledTimes(2);expect(x.p.random.floatRange).not.toHaveBeenCalled();expect(x.p.generateCollateralHousehold).not.toHaveBeenCalled();
 });
 it('new children are eligible for real staged succession without fabricating a new person',()=>{
  const x=setup();nativeGenerateLeaderSpouse(x.head,x.family,{i:5},'C',x.p);nativeGenerateLeaderChildren(x.head,x.family,true,x.p);
  const child=x.generated[1];x.head.isAlive=false;
  const successor=nativeFindSuccessor({...x.family,allowFemaleInheritance:false},x.head,id=>x.people.get(id)??null,()=>{throw Error('No virtual person should be needed');});
  expect(successor).toBe(child);expect(x.generated).toHaveLength(2);expect(child.fatherId).toBe(x.head.id);expect(child.motherId).toBe(x.generated[0].id);
 });
});
