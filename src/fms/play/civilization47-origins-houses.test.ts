import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {assertPopulation47} from './civilization47-population-validation';
import {nationAge47,reignAge47} from './civilization47-origins';
import {previewHouseGrant47,grantHouse47,houseLands47} from './civilization47-houses';
import {previewFamilySuccession47,appointFamilyRuler47} from './civilization47-succession';
import {diePersonOwned47} from './civilization47-lifecycle';
import {advanceFoundingPopulation47} from './civilization47-calendar';
import type {Population47} from './civilization47-population-types';
import {Culture47Session} from './culture47-session';
import {IDBFactory} from 'fake-indexeddb';
import {saveCulture47,loadCulture47} from './culture47-storage';

let base:ReturnType<typeof createCivilizationWorld47>;
const opening=()=>({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace' as const,setup:{mode:'culture-generated' as const,enabled:['chinese','japanese'] as ('chinese'|'japanese')[]}});
beforeAll(()=>{const o=opening();base=createCivilizationWorld47(o.terrain,o.count,o.cityCount,o.relations,o.setup);},30000);
function candidate(r:Population47,filter=(id:number)=>!!id){
 for(const n of r.world.nations)for(const p of Object.values(r.kin.persons))if(filter(p.id))for(const land of houseLands47(r,r.people.nations[n.id].id))try{return previewHouseGrant47(r,{nationId:n.id,personId:p.id,provinceId:land.id});}catch{/* Try another actual family. */}
 throw Error('No eligible household in fixed test world');
}
describe('existing histories and recorded family branches',()=>{
 it('creates different country histories without altering clocks, birthdays or lifecycle randomness',()=>{
  assertPopulation47(base);const again=createCivilizationWorld47(base.terrain,2,24,'peace',opening().setup);
  expect(again.origins).toEqual(base.origins);expect(base.clock.tick).toBe(0);expect(base.life.gameTime).toBe(0);expect(base.kin.lifecycle.random.draws).toBe(0);
  expect(new Set(Object.values(base.origins.nations).map(n=>n.foundedBeforeDays)).size).toBe(2);
  for(const n of base.world.nations){const v=base.origins.nations[n.id];expect(v.reignBeforeDays).toBeLessThanOrEqual(v.foundedBeforeDays);expect(v.reignBeforeDays/365).toBeLessThanOrEqual(base.kin.persons[v.personId].initialAge!-18);expect(nationAge47(base,n.id).years).toBeGreaterThan(0);expect(reignAge47(base,n.id)!.days).toBeGreaterThan(0);}
  expect(base.chronicle.entries.every(e=>e.text.includes('开篇：'))).toBe(true);
  const bad=structuredClone(base);bad.origins.nations['n-0'].foundedBeforeDays++;expect(()=>assertPopulation47(bad)).toThrow(/开篇/);
 });
 it('does not grant the next ruler the opening reign, or retroactively invent old-world history',()=>{
  const p=previewFamilySuccession47(base,'n-0'),next=appointFamilyRuler47(base,'n-0',p.expected);
  expect(reignAge47(next,'n-0')).toMatchObject({days:0,opening:false});expect(next.origins).toEqual(base.origins);
  const old:Population47=structuredClone(base);delete old.origins;expect(nationAge47(old,'n-0')).toEqual({years:0,days:0,generated:false});
 });
 it('moves existing household identities, preserves parent links and can create a second branch',()=>{
  const before=structuredClone(base),p=candidate(base),a=grantHouse47(base,pick(p),p.expected);assertPopulation47(a);
  expect(base).toEqual(before);expect(Object.keys(a.kin.persons)).toEqual(Object.keys(base.kin.persons));expect(a.houses.grants).toHaveLength(1);
  for(const id of p.memberIds){const {familyId:_old,...old}=base.kin.persons[id],{familyId:now,...after}=a.kin.persons[id];expect(now).toBe(p.familyId);expect(after).toEqual(old);void _old;}
  expect(houseLands47(a,p.familyId).map(p=>p.id)).toEqual([p.provinceId]);expect(()=>grantHouse47(a,pick(p),p.expected)).toThrow(/过期/);
  const second=candidate(a),b=grantHouse47(a,pick(second),second.expected);assertPopulation47(b);expect(b.houses.grants).toHaveLength(2);
  const beforeConflict=structuredClone(b),bad={...pick(second),provinceId:b.world.cities.find(c=>c.id===b.world.nations.find(n=>n.id===second.nationId)!.capitalId)!.provinceId};expect(()=>previewHouseGrant47(b,bad)).toThrow();expect(b).toEqual(beforeConflict);
 });
 it('preserves dead-spouse references when a widow household branches, and keeps branch succession separate',()=>{
  const r=structuredClone(base),p=candidate(r,id=>{const p=r.kin.persons[id];return !!p.spouseId&&!r.kin.persons[p.spouseId].roles.some(v=>v.nativeKind==='leader')&&p.id!==r.kin.families[p.familyId].headId;});
  const spouse=r.kin.persons[p.personId].spouseId;diePersonOwned47(r,r.kin.persons[spouse]);assertPopulation47(r);
  const widow=previewHouseGrant47(r,pick(p));expect(widow.memberIds).toContain(spouse);
  const a=grantHouse47(r,pick(widow),widow.expected),leader=a.people.nations[p.nationId].leaderId;diePersonOwned47(a,a.kin.persons[p.personId]);assertPopulation47(a);
  expect(a.people.nations[p.nationId].leaderId).toBe(leader);expect(a.kin.families[p.familyId].headId).not.toBe(p.personId);
  const month=advanceFoundingPopulation47(a,31*120);assertPopulation47(month);expect(month.houses).toEqual(a.houses);
 });
 it('stops counting occupied/ceded land, retaining the historical grant and restoring actual control',()=>{
  const p=candidate(base),a=grantHouse47(base,pick(p),p.expected),land=a.world.provinces.find(v=>v.id===p.provinceId)!,other=a.world.nations.find(n=>n.id!==p.nationId)!.id;
  land.controller=other;expect(houseLands47(a,p.familyId)).toEqual([]);land.controller=p.nationId;expect(houseLands47(a,p.familyId)).toHaveLength(1);land.legalOwner=other;expect(houseLands47(a,p.familyId)).toEqual([]);expect(a.houses.grants).toHaveLength(1);
 });
 it('rejects moving a founding ancestor through a surviving spouse before confirmation',()=>{
  const r=structuredClone(base),founder=Object.values(r.kin.persons).find(p=>p.source==='founding'&&p.spouseId)!;
  expect(founder).toBeDefined();const spouse=r.kin.persons[founder.spouseId],family=r.kin.families[founder.familyId];
  diePersonOwned47(r,founder);assertPopulation47(r);expect(spouse.isAlive).toBe(true);expect(family.headId).not.toBe(spouse.id);expect(spouse.roles.some(v=>v.nativeKind==='leader')).toBe(false);
  const nationId=family.nationId,capital=r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===nationId)!.capitalId)!.provinceId;
  const provinceId=houseLands47(r,family.id).find(p=>p.id!==capital)!.id,before=structuredClone(r);
  expect(()=>previewHouseGrant47(r,{nationId,personId:spouse.id,provinceId})).toThrow(/主家始祖/);
  expect(r).toEqual(before);expect(founder.originalFamilyId).toBe(family.id);
 });
 it('replays real military Session grants after IndexedDB save and continues identically',async()=>{
  const s=new Culture47Session(),initial=s.create(opening()),p=candidate(initial.run);s.execute({kind:'family',intent:pick(p),expected:p.expected},0);let live=s.execute({kind:'advance',ticks:120},1);
  const db=new IDBFactory();await saveCulture47(live.journal,0,db);const stored=await loadCulture47(db);expect(stored).not.toBeNull();const restored=new Culture47Session();expect(restored.load(stored!.journal)).toEqual(live);
  live=s.execute({kind:'advance',ticks:120},2);expect(restored.execute({kind:'advance',ticks:120},2)).toEqual(live);
 },60000);
});
function pick(p:{nationId:string;personId:number;provinceId:string}){return {nationId:p.nationId,personId:p.personId,provinceId:p.provinceId};}
