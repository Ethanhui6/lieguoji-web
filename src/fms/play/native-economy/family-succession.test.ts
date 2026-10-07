import {describe,expect,it,vi} from 'vitest';
import {nativeFamilyFallback,nativeFindSuccessor,nativeSuccessionPriority,type NativeSuccessionFamily,type NativeSuccessionPerson,type NativeFamilyFallbackPorts} from './family-succession';
import {nativeFamilyLivingMembers} from '../native-culture/restoration-leader';
const person=(id:number,patch:Partial<NativeSuccessionPerson>={}):NativeSuccessionPerson=>({id,familyId:10,isAlive:true,gender:0,age:30,childrenIds:[],...patch});
const family=(patch:Partial<NativeSuccessionFamily>={}):NativeSuccessionFamily=>({id:10,allowFemaleInheritance:false,memberIds:[],collateralMemberIds:[],...patch});
const lookup=(people:NativeSuccessionPerson[])=>vi.fn((id:number)=>people.find(p=>p.id===id)??null);
const noVirtual=()=>vi.fn<()=>NativeSuccessionPerson|null>(()=>null);

describe('original family succession priority, unchecked int32',()=>{
 it.each([
  [0,false,false,false,30,70],[1,false,false,false,30,10070],
  [1,true,false,false,30,70],[1,true,true,true,30,1570],
  [0,false,false,false,-2147483648,-2147483548],
  [1,false,true,true,-2147483648,-2147472048],
 ])('gender %i female flag %s collateral %s female tier %s age %i => %i',(gender,allowed,collateral,female,age,score)=>{
  expect(nativeSuccessionPriority(person(1,{gender,age}),family({allowFemaleInheritance:allowed}),collateral,female)).toBe(score);
 });
 it('reads nullable family only for a female and rejects a null character',()=>{
  expect(nativeSuccessionPriority(person(1),null)).toBe(70);
  expect(()=>nativeSuccessionPriority(person(1,{gender:1}),null)).toThrow();
  expect(()=>nativeSuccessionPriority(null,family())).toThrow();
 });
});

describe('FindSuccessor first nonempty relation stage',()=>{
 it('null inputs return before lookup or virtual creation',()=>{
  const get=lookup([]),create=noVirtual();
  expect(nativeFindSuccessor(null,person(1),get,create)).toBeNull();
  expect(nativeFindSuccessor(family(),null,get,create)).toBeNull();
  expect(get).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
 });
 it('a living daughter beats collateral men even when female inheritance is disallowed',()=>{
  const daughter=person(2,{gender:1,age:2}),get=lookup([daughter]),create=noVirtual();
  const f=family({collateralMemberIds:null,memberIds:null});
  expect(nativeFindSuccessor(f,person(1,{childrenIds:[2]}),get,create)).toBe(daughter);
  expect(get.mock.calls).toEqual([[2]]);expect(create).not.toHaveBeenCalled();
 });
 it('penalizes women within the same stage; permitting women restores age ranking',()=>{
  const a=person(2,{gender:1,age:60}),b=person(3,{age:1}),dead=person(1,{childrenIds:[2,3]});
  expect(nativeFindSuccessor(family(),dead,lookup([a,b]),noVirtual())).toBe(b);
  expect(nativeFindSuccessor(family({allowFemaleInheritance:true}),dead,lookup([a,b]),noVirtual())).toBe(a);
 });
 it('filters missing, dead and foreign children then uses collateral without family matching',()=>{
  const f=family({collateralMemberIds:[8],memberIds:null}),c=person(8,{familyId:90});
  const get=lookup([person(3,{isAlive:false}),person(4,{familyId:90}),c]);
  expect(nativeFindSuccessor(f,person(1,{childrenIds:[2,3,4]}),get,noVirtual())).toBe(c);
 });
 it('retains the female-only second read when the first query yielded no candidates',()=>{
  const c=person(2,{gender:1}),get=vi.fn().mockReturnValueOnce(null).mockReturnValue(c);
  const f=family({allowFemaleInheritance:true,collateralMemberIds:null});
  expect(nativeFindSuccessor(f,person(1,{childrenIds:[2]}),get,noVirtual())).toBe(c);
  expect(get.mock.calls).toEqual([[2],[2]]);
 });
 it('second child read excludes a male appearing after the first read',()=>{
  const c=person(2),collateral=person(3),get=vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(c).mockReturnValue(collateral);
  expect(nativeFindSuccessor(family({allowFemaleInheritance:true,collateralMemberIds:[3]}),person(1,{childrenIds:[2]}),get,noVirtual())).toBe(collateral);
 });
 it('chooses a collateral tier before an older ordinary member and preserves stable ties',()=>{
  const a=person(9,{age:10}),b=person(2,{age:10}),get=lookup([a,b]);
  expect(nativeFindSuccessor(family({collateralMemberIds:[9,2,9],memberIds:null}),person(1),get,noVirtual())).toBe(a);
  expect(get.mock.calls).toEqual([[9],[2],[9]]);
 });
 it('ordinary member exclusion tests list ID before lookup, not the resolved object ID',()=>{
  const deceased=person(1),other=person(1,{familyId:999}),get=vi.fn(()=>other);
  expect(nativeFindSuccessor(family({memberIds:[1,7]}),deceased,get,noVirtual())).toBe(other);
  expect(get.mock.calls).toEqual([[7]]);
 });
 it('does not reject a living deceased reference in a child or collateral list',()=>{
  const c=person(1,{childrenIds:[1]});expect(nativeFindSuccessor(family(),c,lookup([c]),noVirtual())).toBe(c);
  c.childrenIds=[];expect(nativeFindSuccessor(family({collateralMemberIds:[1]}),c,lookup([c]),noVirtual())).toBe(c);
 });
 it('does not replace signed wrapped priority with unbounded JS age ranking',()=>{
  const a=person(2,{age:40}),b=person(3,{age:-2147483648});
  expect(nativeFindSuccessor(family(),person(1,{childrenIds:[2,3]}),lookup([a,b]),noVirtual())).toBe(b);
 });
 it('ordinary-member tier offset wraps before comparing priorities',()=>{
  const a=person(2),b=person(3,{age:-2147481600});
  expect(nativeFindSuccessor(family({memberIds:[2,3]}),person(1),lookup([a,b]),noVirtual())).toBe(b);
 });
 it.each(['children','collateral','members'] as const)('throws when the reached %s list is null',stage=>{
  const f=family({collateralMemberIds:stage==='collateral'?null:[],memberIds:stage==='members'?null:[]});
  expect(()=>nativeFindSuccessor(f,person(1,{childrenIds:stage==='children'?null:[]}),lookup([]),noVirtual())).toThrow();
 });
 it('calls male virtual creation exactly once and returns the object without refiltering',()=>{
  const c=person(8,{familyId:99,isAlive:false,gender:1,age:-20}),f=family(),create=vi.fn(()=>c);
  expect(nativeFindSuccessor(f,person(1),lookup([]),create)).toBe(c);
  expect(create.mock.calls).toEqual([[f,0]]);
 });
 it('does not retry a null or thrown virtual generation',()=>{
  const create=noVirtual();expect(nativeFindSuccessor(family(),person(1),lookup([]),create)).toBeNull();expect(create).toHaveBeenCalledTimes(1);
  const error=Error('private draft failed'),fail=vi.fn(()=>{throw error;});
  expect(()=>nativeFindSuccessor(family(),person(1),lookup([]),fail)).toThrow(error);expect(fail).toHaveBeenCalledTimes(1);
 });
});

describe('SelectFamilyFallbackCandidate age then abilities',()=>{
 function ports(people:NativeSuccessionPerson[],members:(NativeSuccessionPerson|null)[]=people):NativeFamilyFallbackPorts<NativeSuccessionPerson>{
  return {getLivingMembers:vi.fn(()=>members),getCharacter:lookup(people),charisma:()=>10,administrative:()=>20,military:()=>30};
 }
 it('null family does not read any port',()=>{
  const p=ports([]);expect(nativeFamilyFallback(null,p)).toBeNull();expect(p.getLivingMembers).not.toHaveBeenCalled();
 });
 it('always appends collateral, including foreign-family people and repeated IDs',()=>{
  const a=person(1),b=person(2,{familyId:999,age:70}),p=ports([a,b],[a]);
  expect(nativeFamilyFallback(family({collateralMemberIds:[2,2]}),p)).toBe(b);
  expect(p.getCharacter).toHaveBeenCalledTimes(2);
 });
 it('reads collateral even if direct members exist, and rejects reached null lists',()=>{
  expect(()=>nativeFamilyFallback(family({collateralMemberIds:null}),ports([person(1)]))).toThrow();
  expect(()=>nativeFamilyFallback(family(),{...ports([]),getLivingMembers:()=>null})).toThrow();
 });
 it('uses actual living-member contract without deduplication or foreign direct members',()=>{
  const a=person(1),b=person(2,{familyId:90}),get=lookup([a,b]),f=family({memberIds:[2,1,1,99]});
  const members=nativeFamilyLivingMembers({...f,memberIds:f.memberIds!,stateId:1,isRulingFamily:true,patriarchId:0},get);
  expect(members).toEqual([a,a]);expect(get.mock.calls).toEqual([[2],[1],[1],[99]]);
  expect(nativeFamilyFallback(f,ports([a,b],members))).toBe(a);
 });
 it('rechecks alive on the merged direct list and skips nulls before abilities',()=>{
  const live=person(3,{age:1}),dead=person(2,{age:100,isAlive:false}),p=ports([dead,live],[null,dead,live]);
  const read=vi.fn(()=>0);p.charisma=read;
  expect(nativeFamilyFallback(family(),p)).toBe(live);expect(read.mock.calls).toEqual([[live]]);
 });
 it('age outranks abilities, gender and adulthood do not filter',()=>{
  const a=person(1,{age:12,gender:1}),b=person(2,{age:11}),p=ports([b,a]);p.military=c=>c===b?100000:0;
  expect(nativeFamilyFallback(family(),p)).toBe(a);
 });
 it('uses recovered charisma, administrative, military order and f32 grouping',()=>{
  const a=person(1),b=person(2),p=ports([a,b]),calls:string[]=[];
  p.charisma=c=>{calls.push(`c${c.id}`);return c===a?16777216:.5;};
  p.administrative=c=>{calls.push(`a${c.id}`);return c===a?1:0;};
  p.military=c=>{calls.push(`m${c.id}`);return c===a?-16777216:0;};
  expect(nativeFamilyFallback(family(),p)).toBe(b);expect(calls).toEqual(['c1','a1','m1','c2','a2','m2']);
 });
 it('rounds each getter before addition and retains the first tied object',()=>{
  const a=person(8),b=person(1),p=ports([a,b]);p.charisma=c=>c===a?1:1+2**-24;p.administrative=()=>0;p.military=()=>0;
  expect(nativeFamilyFallback(family(),p)).toBe(a);
 });
 it('a direct member wins a full tie with a collateral member appended later',()=>{
  const direct=person(90),collateral=person(1),p=ports([direct,collateral],[direct]);
  expect(nativeFamilyFallback(family({collateralMemberIds:[1]}),p)).toBe(direct);
 });
 it('retains stable ties even when finite inputs overflow their sum',()=>{
  const a=person(8),b=person(1),p=ports([a,b]);p.charisma=()=>3e38;p.administrative=()=>3e38;p.military=()=>3e38;
  expect(nativeFamilyFallback(family(),p)).toBe(a);
 });
 it('empty direct and collateral return null without virtual generation',()=>{
  expect(nativeFamilyFallback(family(),ports([]))).toBeNull();
 });
});
