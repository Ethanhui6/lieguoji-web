import {beforeAll,describe,it,expect,vi} from 'vitest';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {advanceFoundingPopulation47} from './civilization47-calendar';
import {assertPopulation47} from './civilization47-population-validation';
import {diePersonOwned47,knownSuccessor47} from './civilization47-lifecycle';
import {appointFamilyRuler47,previewFamilySuccession47} from './civilization47-succession';
import * as appointment from './civilization47-succession';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {assertChronicleState} from './chronicle-model';
import type {Population47} from './civilization47-population-types';
import {POLITIES47} from './civilization47-catalog';

let base:ReturnType<typeof createCivilizationWorld47>;
beforeAll(()=>{base=createCivilizationWorld47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),6,24,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german'],nations:Object.fromEntries(POLITIES47.map((polity,i)=>['n-'+i,{polity,cultureId:(['chinese','japanese','english','arab','roman','german'] as const)[i],religionId:'none' as const}]))});},30000);
const copy=()=>structuredClone(base);
// Choose an explicit test RNG witness so a real monthly roll hits the selected
// eligible founder; production rates and ages are never modified.
function hitFounder(r:Population47){
 const people=Object.values(r.kin.persons),calendar=createNativeIsoCalendar(r.life.startDate),index=people.findIndex(p=>p.source==='founding'&&nativeGetYearSince(p.birthTime,Math.fround(31*r.life.secondsPerDay),r.life.secondsPerDay,calendar)>=40);
 if(index<0)throw Error('Fixture requires adult founder');let state=1n;const mod=0x100000000n,inv=4276115653n;
 for(let i=0;i<=index;i++)state=((state-1013904223n)*inv%mod+mod)%mod;
 r.kin.lifecycle.random.state=Number(state);return people[index].id;
}
describe('real47 monthly death and known-person government continuity',()=>{
 it('runs natural selection at an actual month boundary, ends the office, records death and known successor, keeps spouse history',()=>{
  const input=copy(),id=hitFounder(input),before=structuredClone(input),old=input.kin.persons[id],nation=input.kin.families[old.familyId].nationId,spouse=old.spouseId;
  const next=advanceFoundingPopulation47(input,31*120);
  expect(input).toEqual(before);expect(next.kin.persons[id].isAlive).toBe(false);expect(next.people.persons[id].alive).toBe(false);
  expect(next.kin.persons[id].spouseId).toBe(spouse);expect(next.kin.persons[spouse].spouseId).toBe(0);expect(next.kin.persons[id].roles).toEqual([]);expect(next.kin.persons[id].pastRoles.some(p=>p.endReason==='death'&&p.roleType==='NationalLeader')).toBe(true);
  const death=next.kin.lifecycle.deaths.find(d=>d.personId===id)!;expect(death).toMatchObject({day:31,tick:3720,wasLeaderOf:nation});expect(next.chronicle.entries.find(e=>e.id===death.deathHistoryId)?.text).toContain('去世');
  expect(next.chronicle.leaders[nation][0].endedDay).toBe(31);expect(next.people.nations[nation].leaderId).not.toBe(id);expect(next.chronicle.ended[nation]).toBeUndefined();expect(next.kin.lifecycle.random.draws).toBe(Object.keys(input.kin.persons).length);assertPopulation47(next);
 });
 it('replays split month steps and JSON population restoration exactly without changing other randomness',()=>{
  const input=copy();hitFounder(input);const whole=advanceFoundingPopulation47(input,60*120+17),first=advanceFoundingPopulation47(input,30*120+60);
  // Dynamic population is JSON data; immutable typed geometry is supplied by
  // the terrain codec, not by JSON.stringify(Int32Array). Full journals are
  // tested separately through Culture47Session.load.
  const restored={...JSON.parse(JSON.stringify(first)),terrain:structuredClone(first.terrain)},second=advanceFoundingPopulation47(restored,30*120-43);
  expect(second).toEqual(whole);expect(second.world.statecraft?.relations).toEqual(input.world.statecraft?.relations);
 });
 it.each(POLITIES47)('%s uses the matching recovered candidate selector, never a virtual person',polity=>{
  const r=copy(),nation=Object.keys(r.civilization.nations).find(id=>r.civilization.nations[id].polity===polity)!,old=r.kin.persons[r.people.nations[nation].leaderId!],count=Object.keys(r.kin.persons).length;
  // Direct death transaction tests office continuity, not natural frequency.
  old.isAlive=false;const expected=knownSuccessor47(r,nation,old);old.isAlive=true;diePersonOwned47(r,old);assertPopulation47(r);
  expect(r.people.nations[nation].leaderId).toBe(expected?.id??null);expect(Object.keys(r.kin.persons)).toHaveLength(count);
  if(polity==='Republic'||polity==='Federation'){expect(expected?.age).toBeGreaterThanOrEqual(25);expect(r.chronicle.entries.at(-1)?.reason).toContain('紧急候选');}
 });
 it('records a real vacancy and an empty family, continues months and rejects an unproven living-ruler vacancy',()=>{
  const r=copy(),nation='n-0',head=r.people.nations[nation].leaderId!,family=r.kin.families[r.kin.persons[head].familyId];
  for(const id of [...family.memberIds,...family.collateralMemberIds])if(id!==head)diePersonOwned47(r,r.kin.persons[id]);diePersonOwned47(r,r.kin.persons[head]);
  expect(r.people.nations[nation].leaderId).toBeNull();expect(family.headId).toBe(0);assertPopulation47(r);expect(()=>assertChronicleState(r.chronicle,r.world,r.clock.tick)).toThrow();
  const after=advanceFoundingPopulation47(r,32*120);expect(after.people.nations[nation].leaderId).toBeNull();assertPopulation47(after);
  const bad=copy(),person=bad.kin.persons[bad.people.nations[nation].leaderId!];bad.chronicle.leaders[nation][0].endedDay=0;bad.people.nations[nation].leaderId=null;person.roles=[];bad.kin.lifecycle.vacancies[nation]={sinceDay:0,previousPersonId:person.id,reason:'no-known-candidate'};expect(()=>assertPopulation47(bad)).toThrow();
 });
 it('keeps the patriarch independent from abdication and accepts a precise half-day appointment',()=>{
  const r=advanceFoundingPopulation47(copy(),60),nation='n-0',head=r.kin.families[r.people.nations[nation].id].headId,preview=previewFamilySuccession47(r,nation),next=appointFamilyRuler47(r,nation,preview.expected);
  expect(next.kin.families[r.people.nations[nation].id].headId).toBe(head);expect(next.kin.persons[head].isAlive).toBe(true);expect(next.kin.persons[preview.personId].roles.find(v=>v.nativeKind==='leader')).toMatchObject({reignStartTime:Math.fround(.05)});assertPopulation47(next);
  diePersonOwned47(next,next.kin.persons[head]);expect(next.people.nations[nation].leaderId).toBe(preview.personId);assertPopulation47(next);
 });
 it('rolls back the month and every random draw when successor appointment throws after death writes',()=>{
  const input=copy();hitFounder(input);const before=structuredClone(input),spy=vi.spyOn(appointment,'appointKnownPersonOwned47').mockImplementation(()=>{throw Error('injected appointment failure');});
  try{expect(()=>advanceFoundingPopulation47(input,31*120)).toThrow('injected appointment failure');expect(input).toEqual(before);}finally{spy.mockRestore();}
 });
 it.each(['deathRemoved','falseAlive','roleRemoved','pastRemoved','futureMonth','deathHistoryWrong','unknownHistoryKind'] as const)('rejects %s corruption of a real monthly result',fault=>{
  const input=copy(),id=hitFounder(input),r=advanceFoundingPopulation47(input,31*120),d=r.kin.lifecycle.deaths.find(d=>d.personId===id)!;
  if(fault==='deathRemoved')r.kin.lifecycle.deaths=[];if(fault==='falseAlive')r.kin.persons[id].isAlive=true;if(fault==='roleRemoved')r.kin.persons[r.people.nations[d.wasLeaderOf!]!.leaderId!].roles=[];if(fault==='futureMonth')r.kin.lifecycle.lastMonth++;if(fault==='deathHistoryWrong')d.deathHistoryId=1;
  if(fault==='pastRemoved')r.kin.persons[id].pastRoles=[];if(fault==='unknownHistoryKind')Object.assign(r.chronicle.entries.find(e=>e.id===d.deathHistoryId)!,{kind:'death'});
  expect(()=>assertPopulation47(r)).toThrow();
 });
});
