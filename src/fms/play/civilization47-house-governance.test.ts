import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {advanceFoundingPopulation47} from './civilization47-calendar';
import {advanceHouseGovernance47,setHousePolicy47} from './civilization47-house-governance';
import {assertPopulation47} from './civilization47-population-validation';
import {houseHousehold47,houseLands47,houseTitle47,previewHouseGrant47,grantHouse47} from './civilization47-houses';
import {populationStamp47} from './civilization47-population-types';
import {diePersonOwned47} from './civilization47-lifecycle';
import {Culture47Session} from './culture47-session';
import {loadCulture47,saveCulture47} from './culture47-storage';

const opening=()=>({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace' as const,setup:{mode:'culture-generated' as const,enabled:['chinese','japanese'] as ('chinese'|'japanese')[]}});
let base:ReturnType<typeof createCivilizationWorld47>;
beforeAll(()=>{const o=opening();base=createCivilizationWorld47(o.terrain,o.count,o.cityCount,o.relations,o.setup);},30000);
const nextMonth=(r:typeof base,days=31)=>{const next=advanceFoundingPopulation47(r,days*120);advanceHouseGovernance47(next);return next;};
describe('monthly autonomous households and actual fief returns',()=>{
 it('creates real branches only at a month boundary, preserving every identity and the life RNG',()=>{
  const r=advanceFoundingPopulation47(base,31*120),before=structuredClone(r);advanceHouseGovernance47(r);assertPopulation47(r);
  expect(r.houses.grants.length).toBeGreaterThan(0);expect(r.houseGovernance.automatic).toEqual(r.houses.grants.map(g=>g.familyId));
  expect(r.kin.lifecycle.random).toEqual(before.kin.lifecycle.random);expect(Object.keys(r.kin.persons)).toEqual(Object.keys(before.kin.persons));
  for(const [id,p] of Object.entries(r.kin.persons)){const {familyId:_,...actual}=p,{familyId:__,...original}=before.kin.persons[id];expect(actual).toEqual(original);void _;void __;}
  const once=structuredClone(r);advanceHouseGovernance47(r);expect(r).toEqual(once);
  expect(nextMonth(r,28).houses.grants).toEqual(r.houses.grants);
 });
 it('can disable one country without blocking the other; stale changes are atomic and re-enabling waits for a new month',()=>{
  const id=base.world.nations[0].id,r=setHousePolicy47(base,id,false,populationStamp47(base));expect(base.houseGovernance.enabled[id]).toBe(true);
  expect(()=>setHousePolicy47(r,id,true,populationStamp47(base))).toThrow(/过期/);
  const feb=nextMonth(r);expect(feb.houses.grants.some(g=>g.nationId===id)).toBe(false);expect(feb.houses.grants.length).toBeGreaterThan(0);
  const on=setHousePolicy47(feb,id,true,populationStamp47(feb));advanceHouseGovernance47(on);expect(on.houses.grants).toEqual(feb.houses.grants);
  const march=nextMonth(on,28);expect(march.houses.grants.some(g=>g.nationId===id)).toBe(true);
 });
 it('does not invent new people/news when no suitable household exists',()=>{
  let r=structuredClone(base);
  for(const n of r.world.nations){const main=r.people.nations[n.id].id,capital=r.world.cities.find(c=>c.id===n.capitalId)!.provinceId;
   while(true){const person=Object.values(r.kin.persons).find(p=>p.familyId===main&&houseHousehold47(r,p.id)),land=houseLands47(r,main).find(p=>p.id!==capital);if(!person||!land)break;
    const intent={nationId:n.id,personId:person.id,provinceId:land.id};r=grantHouse47(r,intent,previewHouseGrant47(r,intent).expected);}
  }
  const feb=advanceFoundingPopulation47(r,31*120),before=structuredClone(feb.chronicle);advanceHouseGovernance47(feb);expect(feb.chronicle).toEqual(before);expect(feb.houseGovernance.automatic).toEqual([]);
 });
 it('keeps occupied titles; extinction releases a locally controlled title and allows a new family to receive the same land',()=>{
  let r=nextMonth(base);const grant=r.houses.grants[0],other=r.world.nations.find(n=>n.id!==grant.nationId)!.id;
  for(const id of grant.memberIds)if(r.kin.persons[id].isAlive)diePersonOwned47(r,r.kin.persons[id]);assertPopulation47(r);
  const land=r.world.provinces.find(p=>p.id===grant.provinceId)!;land.controller=other;
  r=nextMonth(r,28);expect(r.houseGovernance.returns).toEqual([]);expect(houseTitle47(r,grant.provinceId)).toBe(grant.familyId);
  r.world.provinces.find(p=>p.id===grant.provinceId)!.controller=grant.nationId;r=nextMonth(r,31);
  expect(r.houseGovernance.returns).toHaveLength(1);expect(houseTitle47(r,grant.provinceId)).toBeNull();expect(r.houses.grants[0]).toEqual(grant);
  const person=Object.values(r.kin.persons).find(p=>p.familyId===grant.parentId&&houseHousehold47(r,p.id))!;expect(person).toBeDefined();
  const intent={nationId:grant.nationId,personId:person.id,provinceId:grant.provinceId},preview=previewHouseGrant47(r,intent),again=grantHouse47(r,intent,preview.expected);
  assertPopulation47(again);expect(houseTitle47(again,grant.provinceId)).toBe(preview.familyId);expect(houseLands47(again,grant.familyId)).toEqual([]);
  const bad=structuredClone(again);bad.houseGovernance.returns=[];expect(()=>assertPopulation47(bad)).toThrow(/分封/);
  const forged=structuredClone(again);forged.houseGovernance.returns[0].familyId=preview.familyId;expect(()=>assertPopulation47(forged)).toThrow(/归还/);
 });
 it('refuses duplicate creation event order and does not silently skip corrupt families',()=>{
  const r=nextMonth(base);expect(r.houses.grants).toHaveLength(2);
  const bad=structuredClone(r),[a,b]=bad.houses.grants,ea=bad.chronicle.entries.find(e=>e.id===a.entryId)!,eb=bad.chronicle.entries.find(e=>e.id===b.entryId)!;
  [a.entryId,b.entryId]=[b.entryId,a.entryId];[ea.id,eb.id]=[eb.id,ea.id];bad.chronicle.entries.sort((a,b)=>a.id-b.id);
  expect(()=>assertPopulation47(bad)).toThrow(/分封依据/);
  const invalid=advanceFoundingPopulation47(base,31*120);invalid.kin.persons[Object.keys(invalid.kin.persons)[0]].familyId=999999;
  const before=structuredClone(invalid);expect(()=>advanceHouseGovernance47(invalid)).toThrow();expect(invalid).toEqual(before);
 });
 it('enforces a six-month interval and the main-house land floor across repeated real months',()=>{
  let r=nextMonth(base);const first=structuredClone(r.houses.grants);
  for(const days of [28,31,30,31,30]){r=nextMonth(r,days);expect(r.houses.grants).toEqual(first);}
  r=nextMonth(r,31);expect(r.houseGovernance.lastMonth).toBe(19);
  expect(r.houses.grants.length).toBeGreaterThan(first.length);
  for(const g of r.houses.grants.filter(g=>!first.some(f=>f.familyId===g.familyId)))expect(g.day).toBeGreaterThanOrEqual(212);
  for(const n of r.world.nations){const owned=r.world.provinces.filter(p=>p.controller===n.id&&p.legalOwner===n.id);expect(houseLands47(r,r.people.nations[n.id].id).length).toBeGreaterThanOrEqual(Math.ceil(owned.length/2));}
 });
 it('replays batch month crossings, saved policy changes and the next month exactly',async()=>{
  const s=new Culture47Session();s.create(opening());
  for(let day=0;day<32;day+=4)s.executeDisplay(Array.from({length:4},()=>({kind:'advance' as const,ticks:120})),day);
  let live=s.snapshot();expect(live.run.houses!.grants.length).toBeGreaterThan(0);
  const n=live.run.world.nations[0].id;live=s.execute({kind:'family-policy',nationId:n,enabled:false,expected:populationStamp47(live.run)},32);
  const db=new IDBFactory();await saveCulture47(live.journal,0,db);const loaded=await loadCulture47(db);expect(loaded).not.toBeNull();
  const replay=new Culture47Session();expect(replay.load(loaded!.journal)).toEqual(live);
  for(let day=32;day<60;day+=4)s.executeDisplay(Array.from({length:4},()=>({kind:'advance' as const,ticks:120})),day+1);
  const full=s.snapshot(),again=new Culture47Session();expect(again.load(full.journal)).toEqual(full);
  const before=s.snapshot();expect(()=>s.execute({kind:'family-policy',nationId:n,enabled:true,expected:populationStamp47(live.run)},61)).toThrow(/过期/);expect(s.snapshot()).toEqual(before);
 },180000);
});
