import {describe,it,expect,vi} from 'vitest';
import {nativeFamilyLivingMembers,nativeFamilyPatriarch,nativeRestorationCandidate,nativeRestoreLeader,type NativeRestorationFamily,type NativeRestorationPerson} from './restoration-leader';
const person=(id:number,age=35,gender=0):NativeRestorationPerson=>({id,age,gender,isAlive:true,familyId:1});
const family=():NativeRestorationFamily=>({id:1,stateId:8,isRulingFamily:true,patriarchId:0,memberIds:[]});
const skills={charisma:()=>10,military:()=>20,administrative:()=>30};
describe('native restoration candidate, distinct from normal succession',()=>{
 it('includes both age boundaries and excludes children/elderly before reading skills',()=>{
   const read=vi.fn(()=>0),sk={charisma:read,military:read,administrative:read};
   expect(nativeRestorationCandidate([person(1,15),person(2,61)],sk)).toBeNull();expect(read).not.toHaveBeenCalled();
   expect(nativeRestorationCandidate([person(3,16)],sk)?.id).toBe(3);expect(nativeRestorationCandidate([person(4,60)],sk)?.id).toBe(4);
 });
 it('prefers male even over stronger female, without removing females from an all-female family',()=>{
   const female=person(1,35,1),male=person(2,35,0),sk={...skills,charisma:(p:NativeRestorationPerson)=>p===female?100:0};
   expect(nativeRestorationCandidate([female,male],sk)).toBe(male);expect(nativeRestorationCandidate([female],sk)).toBe(female);
 });
 it('reads effective skills in native order and rounds the two additions at float32 precision',()=>{
   const calls:string[]=[],a=person(1),b=person(2),sk={charisma:(p:NativeRestorationPerson)=>{calls.push(`c${p.id}`);return p===a?16777216:1;},military:(p:NativeRestorationPerson)=>{calls.push(`m${p.id}`);return p===a?1:0;},administrative:(p:NativeRestorationPerson)=>{calls.push(`a${p.id}`);return p===a?-16777216:0;}};
   expect(nativeRestorationCandidate([a,b],sk)).toBe(b);expect(calls).toEqual(['c1','m1','a1','c2','m2','a2']);
 });
 it('uses distance to 35 then stable member order, never ID as a tie-break',()=>{
   const a=person(90,30),b=person(2,40);expect(nativeRestorationCandidate([person(1,50),a,b],skills)).toBe(a);expect(nativeRestorationCandidate([b,a],skills)).toBe(b);
 });
 it('rounds each getter result as a native float before the additions, retaining equal-score member order',()=>{
   const b=person(2),a=person(1),sk={charisma:(p:NativeRestorationPerson)=>p===a?1+2**-24:1,military:(p:NativeRestorationPerson)=>p===a?2**-24:0,administrative:()=>0};
   expect(nativeRestorationCandidate([b,a],sk)).toBe(b);
 });
 it('sorts a NaN skill below a finite skill like the native float comparer; null members throw',()=>{
   expect(nativeRestorationCandidate([person(1),person(2)],{...skills,charisma:p=>p.id===1?NaN:0})?.id).toBe(2);expect(()=>nativeRestorationCandidate([null],skills)).toThrow('Null native');
 });
});
describe('restored ruling family identity and failure paths',()=>{
 const setup=()=>({state:{i:8,leaderId:0},currentFamilies:[family()],getLivingMembers:vi.fn(()=>[person(1)]),getPatriarch:vi.fn<()=>NativeRestorationPerson|null>(()=>null),skills,initializeState:vi.fn()});
 it('resolves a patriarch without filtering age, family membership or life; living member query does filter',()=>{
   const f=family(),p=person(9,99,1);p.familyId=2;p.isAlive=false;f.patriarchId=9;f.memberIds=[9,1,1,3];const get=vi.fn((id:number)=>id===9?p:id===1?person(1):null);
   expect(nativeFamilyPatriarch(f,get)).toBe(p);expect(nativeFamilyLivingMembers(f,get).map(p=>p.id)).toEqual([1,1]);f.patriarchId=0;get.mockClear();expect(nativeFamilyPatriarch(f,get)).toBeNull();expect(get).not.toHaveBeenCalled();
 });
 it('accepts an alive patriarch directly even beyond candidate ages and does not change the family',()=>{
   const x=setup(),p=person(99,90,1);x.getPatriarch.mockReturnValue(p);expect(nativeRestoreLeader(x)).toMatchObject({kind:'restored',person:p,changedPatriarch:false});expect(x.state.leaderId).toBe(99);expect(x.currentFamilies[0].patriarchId).toBe(0);expect(x.getLivingMembers).toHaveBeenCalledTimes(1);expect(x.initializeState).not.toHaveBeenCalled();
 });
 it('selects from a second living query and updates patriarch plus leader to the same real identity',()=>{
   const x=setup(),winner=person(2);x.getLivingMembers.mockReturnValueOnce([person(1)]).mockReturnValueOnce([winner]);const result=nativeRestoreLeader(x);expect(result).toMatchObject({kind:'restored',changedPatriarch:true});expect(result.kind==='restored'&&result.person).toBe(winner);expect(x.state.leaderId).toBe(2);expect(x.currentFamilies[0].patriarchId).toBe(2);
 });
 it('does not try a second ruling family after the first match has no living members',()=>{
   const x=setup();x.currentFamilies.push({...family(),id:2});x.getLivingMembers.mockReturnValueOnce([]);expect(nativeRestoreLeader(x)).toEqual({kind:'initialized'});expect(x.getLivingMembers).toHaveBeenCalledTimes(1);expect(x.getLivingMembers).toHaveBeenCalledWith(x.currentFamilies[0]);expect(x.initializeState).toHaveBeenCalledWith(x.state,true);
 });
 it.each(['missing-family','no-candidate','missing-patriarch-empty-second'] as const)('initializes the full state on %s',reason=>{
   const x=setup();if(reason==='missing-family')x.currentFamilies=[];else if(reason==='no-candidate')x.getLivingMembers.mockReturnValue([person(1,12)]);else x.getLivingMembers.mockReturnValueOnce([person(1)]).mockReturnValueOnce([]);
   expect(nativeRestoreLeader(x)).toEqual({kind:'initialized'});expect(x.initializeState).toHaveBeenCalledTimes(1);expect(x.initializeState).toHaveBeenCalledWith(x.state,true);expect(x.state.leaderId).toBe(0);
 });
 it('retains the original dead reference edge when the second living list becomes empty',()=>{
   const x=setup(),old={...person(77),isAlive:false};x.getPatriarch.mockReturnValue(old);x.getLivingMembers.mockReturnValueOnce([person(1)]).mockReturnValueOnce([]);expect(nativeRestoreLeader(x)).toMatchObject({kind:'restored',person:old,changedPatriarch:false});expect(x.state.leaderId).toBe(77);expect(x.initializeState).not.toHaveBeenCalled();
 });
});
