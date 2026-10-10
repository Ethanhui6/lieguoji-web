import {beforeAll,describe,it,expect,vi} from 'vitest';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {advanceFoundingPopulation47} from './civilization47-calendar';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type Population47} from './civilization47-population-types';
import {enableGenerations47,marriageEligible47,marryPeopleOwned47,birthEligible47,birthPersonOwned47} from './civilization47-generations';
import {closeKin47} from './civilization47-generations-ledger';
import {grantHouseOwned47,houseHousehold47} from './civilization47-houses';
import {advanceHouseGovernance47} from './civilization47-house-governance';
import {diePersonOwned47} from './civilization47-lifecycle';
import * as registry from './native-economy/character-registry';

let base:ReturnType<typeof createCivilizationWorld47>&Population47;
beforeAll(()=>{base=createCivilizationWorld47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),6,48,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']});},30000);
const enabled=()=>enableGenerations47(base,populationStamp47(base));
const month=()=>advanceFoundingPopulation47(enabled(),31*120);
function couple(r:Population47){return Object.values(r.kin.persons).find(p=>p.gender===0&&r.kin.persons[p.spouseId]&&birthEligible47(r,p,r.kin.persons[p.spouseId]));}
function singles(r:Population47){for(const a of Object.values(r.kin.persons))for(const b of Object.values(r.kin.persons))if(marriageEligible47(r,a,b))return [a,b] as const;throw Error('No eligible registered pair in fixture');}
describe('registered births, marriage, growth and house continuity',()=>{
 it('continues sixty years with grown newborn marriages and later-generation births',()=>{
  let r=enabled();for(let year=0;year<60;year++)r=advanceFoundingPopulation47(r,365*120);
  expect(r.generations!.marriages.some(m=>r.kin.persons[m.aId].source==='newborn'||r.kin.persons[m.bId].source==='newborn')).toBe(true);
  expect(r.generations!.births.some(b=>r.kin.persons[b.fatherId].source==='newborn'||r.kin.persons[b.motherId].source==='newborn')).toBe(true);
  expect(Object.values(r.kin.persons).some(p=>p.isAlive)).toBe(true);assertPopulation47(r);
 },60000);
 it('enables only a stamped new world, preserves source and disabled monthly randomness',()=>{
  const before=structuredClone(base),r=enabled();expect(base).toEqual(before);expect(r.generations?.births).toEqual([]);expect(()=>enableGenerations47(r,populationStamp47(r))).toThrow();
  expect(()=>enableGenerations47(base,{...populationStamp47(base),day:1})).toThrow();const old=advanceFoundingPopulation47(base,31*120);expect(old.generations).toBeUndefined();expect(()=>enableGenerations47(old,populationStamp47(old))).toThrow();
 });
 it('records real monthly children, both parents and the actual birthday; split progression and JSON restoration agree',()=>{
  const input=enabled(),before=structuredClone(input),whole=advanceFoundingPopulation47(input,365*120),half=advanceFoundingPopulation47(input,180*120),restored={...JSON.parse(JSON.stringify(half)),terrain:structuredClone(half.terrain)},split=advanceFoundingPopulation47(restored,185*120);
  expect(input).toEqual(before);expect(split).toEqual(whole);expect(whole.generations!.births.length).toBeGreaterThan(0);
  for(const b of whole.generations!.births){const p=whole.kin.persons[b.personId];expect(p.birthTime).toBe(Math.fround(b.day*whole.life.secondsPerDay));expect(p.age).toBe(0);expect(whole.kin.persons[b.fatherId].childrenIds).toContain(p.id);expect(whole.kin.persons[b.motherId].childrenIds).toContain(p.id);expect(p.identity.cultureId).toBeDefined();}
  assertPopulation47(whole);const bad=structuredClone(whole);bad.generations!.births[0].fatherId=bad.generations!.births[0].motherId;expect(()=>assertPopulation47(bad)).toThrow();
 });
 it('keeps immutable grants and a living newborn prevents false extinction',()=>{
  let r=month();const father=couple(r);expect(father).toBeDefined();const f=father!,mother=r.kin.persons[f.spouseId];
  // Find a legal household, not the reigning founding couple.
  const parent=Object.values(r.kin.persons).find(p=>p.gender===0&&houseHousehold47(r,p.id)&&r.kin.persons[p.spouseId]&&birthEligible47(r,p,r.kin.persons[p.spouseId]));expect(parent).toBeDefined();
  const nation=r.kin.families[parent!.familyId].nationId,capital=r.world.nations.find(n=>n.id===nation)!.capitalId,land=r.world.provinces.find(p=>p.controller===nation&&p.legalOwner===nation&&r.world.cities.find(c=>c.id===capital)?.provinceId!==p.id)!;
  const familyId=grantHouseOwned47(r,{nationId:nation,personId:parent!.id,provinceId:land.id}),snapshot=structuredClone(r.houses!.grants),child=birthPersonOwned47(r,parent!.id,parent!.spouseId);
  expect(r.houses!.grants).toEqual(snapshot);expect(r.kin.families[familyId].memberIds).toContain(child);expect(r.houses!.grants.at(-1)!.memberIds).not.toContain(child);
  r=advanceFoundingPopulation47(r,1);for(const id of snapshot.at(-1)!.memberIds)diePersonOwned47(r,r.kin.persons[id]);assertPopulation47(r);advanceHouseGovernance47(r);expect(r.houseGovernance!.returns.some(v=>v.familyId===familyId)).toBe(false);expect(r.kin.persons[child].isAlive).toBe(true);expect(mother.id).toBeGreaterThan(0);
 });
 it.each([false,true])('registered adult marriage moves one person and keeps roles valid after death, reverse=%s',reverse=>{
  let r=month();const [a,b]=singles(r),beforeCount=Object.keys(r.kin.persons).length;
  expect(closeKin47(r,a.id,b.id)).toBe(false);marryPeopleOwned47(r,a.id,b.id);expect(Object.keys(r.kin.persons)).toHaveLength(beforeCount);expect(a.spouseId).toBe(b.id);expect(b.familyId).toBe(a.familyId);assertPopulation47(r);
  r=advanceFoundingPopulation47(r,1);diePersonOwned47(r,r.kin.persons[(reverse?b:a).id]);assertPopulation47(r);diePersonOwned47(r,r.kin.persons[(reverse?a:b).id]);assertPopulation47(r);
 });
 it('marriage joins an existing branch, then birth adds members without changing the grant',()=>{
  const r=month();let pair:ReturnType<typeof singles>|undefined;
  for(const a of Object.values(r.kin.persons))for(const b of Object.values(r.kin.persons))if(!pair&&houseHousehold47(r,a.id)&&marriageEligible47(r,a,b)&&a.age<=(a.gender===1?42:65)&&b.age<=(b.gender===1?42:65))pair=[a,b];
  expect(pair).toBeDefined();const [a,b]=pair!,nation=r.kin.families[a.familyId].nationId,capital=r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===nation)!.capitalId)?.provinceId,land=r.world.provinces.find(p=>p.controller===nation&&p.legalOwner===nation&&p.id!==capital)!;
  const family=grantHouseOwned47(r,{nationId:nation,personId:a.id,provinceId:land.id}),grant=structuredClone(r.houses!.grants);
  marryPeopleOwned47(r,a.id,b.id);assertPopulation47(r);expect(r.generations!.marriages.at(-1)!.fromFamilyId).not.toBe(family);
  const father=a.gender===0?a:b,mother=a.gender===1?a:b,child=birthPersonOwned47(r,father.id,mother.id);assertPopulation47(r);expect(r.kin.families[family].memberIds).toContain(child);expect(r.houses!.grants).toEqual(grant);
 });
 it('birth transaction failure rolls back month, random stream and all relatives',()=>{
  const r=enabled(),before=structuredClone(r),spy=vi.spyOn(registry,'nativeCreateNamedCharacter').mockImplementation(()=>{throw Error('injected newborn failure');});
  try{expect(()=>advanceFoundingPopulation47(r,365*120)).toThrow('injected newborn failure');expect(r).toEqual(before);}finally{spy.mockRestore();}
 });
 it('newborns grow into real adults and can hold the national office without replacing their ancestry',()=>{
  let r=month();const father=couple(r)!;expect(father).toBeDefined();const child=birthPersonOwned47(r,father.id,father.spouseId),birth=structuredClone(r.kin.persons[child]),nation=r.kin.families[birth.familyId].nationId;
  for(let year=0;year<18;year++)r=advanceFoundingPopulation47(r,365*120);
  r=advanceFoundingPopulation47(r,40*120);expect(r.kin.persons[child].isAlive).toBe(true);expect(r.kin.persons[child].age).toBeGreaterThanOrEqual(18);
  for(const p of Object.values(r.kin.persons))if(p.id!==child&&p.isAlive&&p.stateId===r.people.nations[nation].id)diePersonOwned47(r,p);assertPopulation47(r);expect(r.people.nations[nation].leaderId).toBe(child);expect(r.kin.persons[child]).toMatchObject({birthTime:birth.birthTime,fatherId:birth.fatherId,motherId:birth.motherId,source:'newborn'});
 },60000);
});
