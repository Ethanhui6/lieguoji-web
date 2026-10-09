import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Opening} from './culture47-session';
import {assertPolitics47,initializeOpeningWars47,recordPoliticalOccupation47,reconcileGovernmentContinuity47} from './civilization47-political-owner';
import {settleWar47} from './civilization47-war-settlement';
import {relocateLostCapitals47} from './civilization47-capitals';
const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}};
let peaceful:ReturnType<Culture47Session['snapshot']>;
beforeAll(()=>{peaceful=new Culture47Session().create(opening);},30000);
describe('live major history and complete opening wars',()=>{
  it('creates genuine day-zero declarations with targets, no military/resource teleport and deterministic replay',()=>{
    const s=new Culture47Session(),out=s.create({...opening,relations:'war'}),r=out.run;
    expect(r.nativeWars.campaigns.length).toBeGreaterThan(0);
    for(const w of r.nativeWars.campaigns){expect(w.history).toBe('complete');expect(w.attacker).toBeTruthy();expect(w.startTime).toBe(0);expect(w.initialOwners.length).toBeGreaterThan(0);expect(w.goals.length).toBeGreaterThan(0);expect(r.nativeDiplomacy.declarations.some(d=>d.warId===w.id)).toBe(true);}
    expect(r.armyPositions).toEqual(peaceful.run.armyPositions);expect(r.fleetPositions).toEqual(peaceful.run.fleetPositions);expect(r.world.statecraft!.provinces).toEqual(peaceful.run.world.statecraft!.provinces);expect(r.clock.tick).toBe(0);
    expect(r.chronicle.entries.filter(e=>e.kind==='diplomacy').every(e=>e.reason.includes('进攻阵营')&&e.reason.includes('目标：'))).toBe(true);
    expect(new Culture47Session().load(out.journal)).toEqual(out);expect(()=>initializeOpeningWars47(r)).toThrow(/只能初始化/);
  },30000);
  it('records an actual lost capital and new seat once; only real remaining holdings qualify',()=>{
    const r=structuredClone(peaceful.run),n=r.world.nations[0],old=r.world.cities.find(c=>c.id===n.capitalId)!,p=r.world.provinces.find(p=>p.id===old.provinceId)!,before={provinces:r.world.provinces.map(p=>({id:p.id,controller:p.controller}))};
    p.controller=r.world.nations[1].id;recordPoliticalOccupation47(r,before);
    expect(n.capitalId).not.toBe(old.id);const next=r.world.cities.find(c=>c.id===n.capitalId)!;expect(r.world.provinces.find(p=>p.id===next.provinceId)?.controller).toBe(n.id);
    const events=r.chronicle.entries.filter(e=>e.kind==='capital');expect(events).toHaveLength(1);expect(events[0].nationIds).toEqual([n.id,p.controller]);expect(events[0].place?.id).toBe(next.provinceId);
    const snap=structuredClone(r);relocateLostCapitals47(r);expect(r).toEqual(snap);assertPolitics47(r);
  },30000);
  it('keeps the historical seat at extinction and relocates a restored state without inventing a new capture',()=>{
    const r=structuredClone(peaceful.run),n=r.world.nations[0],old=n.capitalId;
    for(const p of r.world.provinces)if(p.controller===n.id)p.controller=r.world.nations[1].id;
    reconcileGovernmentContinuity47(r);expect(n.capitalId).toBe(old);expect(r.people.nations[n.id].leaderId).toBeNull();expect(r.chronicle.entries.filter(e=>e.kind==='capital')).toEqual([]);assertPolitics47(r);
    const oldProvince=r.world.cities.find(c=>c.id===old)!.provinceId,p=r.world.provinces.find(p=>p.legalOwner===n.id&&p.id!==oldProvince)!,city=r.world.cities.find(c=>c.provinceId===p.id)!;p.controller=n.id;
    reconcileGovernmentContinuity47(r);const event=r.chronicle.entries.filter(e=>e.kind==='capital').at(-1)!;expect(event.text).toContain('迁都');expect(event.text+event.reason).not.toContain('攻陷');expect(n.capitalId).toBe(city.id);
    const text=event.text;city.name='新名字';expect(event.text).toBe(text);
  },30000);
  it('settlement captures duration, sides and actual results once without touching another war',()=>{
    const r=new Culture47Session().create({...opening,relations:'war'}).run,w=r.nativeWars.campaigns[0],other=r.nativeWars.campaigns.find(c=>c!==w)!;
    settleWar47(r,w,11);const e=r.chronicle.entries.at(-1)!;expect(e.reason).toContain('历时0日');expect(e.reason).toContain('不执行割地和赔款');expect(e.reason).toContain('非阵亡人数');expect(other.endedTick).toBeNull();
    const before=structuredClone(r.chronicle);expect(settleWar47(r,w,11)).toBe(false);expect(r.chronicle).toEqual(before);assertPolitics47(r);
  },30000);
});
