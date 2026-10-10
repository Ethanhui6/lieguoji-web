import {IDBFactory} from 'fake-indexeddb';
import {saveCulture47,loadCulture47} from './culture47-storage';
import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,assertCulture47Journal,type Culture47Opening,type Culture47Journal} from './culture47-session';
import {currentRuler47} from './civilization47-names';
import {previewFamilySuccession47} from './civilization47-succession';
import {verifyWar46Compatibility} from '../../../scripts/fms-war47-compat';
const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},30000);
describe('playable real culture owner',()=>{
  it('creates both actual world naming modes and returns real position maps',()=>{
    for(const mode of ['culture-generated','historical-names'] as const){const s=new Culture47Session().create({...opening,setup:{...opening.setup,mode}});expect(s.run.civilization.mode).toBe(mode);expect(currentRuler47(s.run.civilization,s.run.chronicle,'n-1')?.title).toBe('天皇');expect(s.run.world.armies.length).toBeGreaterThan(0);expect(s.frame.armies.size).toBe(s.run.world.armies.length);expect(s.run.world.cities.every(c=>!/[0-9]/.test(c.name))).toBe(true);}
  },30000);
  it('plays through daily closeout, edits polity/religion/city and reproduces all state from saved commands',()=>{
    const owner=new Culture47Session();owner.load(journal);owner.execute({kind:'advance',ticks:120},0);
    owner.execute({kind:'identity',edit:{kind:'nation',id:'n-0',patch:{polity:'Republic',religionId:'catholic',customName:null}}},1);
    const s=owner.execute({kind:'identity',edit:{kind:'city',id:'c-0',customName:'云津'}},2);
    expect(s.run.world.day).toBe(1);expect(s.run.dailyEconomy.lastDay).toBe(1);expect(s.run.upperCombat.nations['n-0'].polity).toBe('Republic');expect(currentRuler47(s.run.civilization,s.run.chronicle,'n-0')?.title).toBe('总统');expect(s.run.world.nations[0].name).toMatch(/共和国$/);expect(s.run.world.cities[0].name).toBe('云津');
    const restored=new Culture47Session().load(s.journal);expect(restored).toEqual(s);
  },60000);
  it('uses an existing heir and keeps historical accession office on a reform',()=>{
    const owner=new Culture47Session(),initial=owner.load(journal),heir=previewFamilySuccession47(initial.run,'n-1'),count=Object.keys(initial.run.kin.persons).length;
    const changed=owner.execute({kind:'succession',nationId:'n-1'},0);expect(changed.run.people.nations['n-1'].leaderId).toBe(heir.personId);expect(Object.keys(changed.run.kin.persons)).toHaveLength(count);expect(changed.run.chronicle.leaders['n-1']).toHaveLength(2);
    const reformed=owner.execute({kind:'identity',edit:{kind:'nation',id:'n-1',patch:{polity:'Republic'}}},1);expect(reformed.run.civilization.rulers['ruler-n-1-1'].titleAtAccession).toBe('天皇');expect(currentRuler47(reformed.run.civilization,reformed.run.chronicle,'n-1')?.title).toBe('总统');expect(new Culture47Session().load(reformed.journal)).toEqual(reformed);
  },30000);
  it('rejects stale, failed and future actions without changing the current candidate or journal',()=>{
    const owner=new Culture47Session(),s=owner.load(journal);
    expect(()=>owner.execute({kind:'advance',ticks:1},3)).toThrow();expect(()=>owner.execute({kind:'identity',edit:{kind:'city',id:'missing',customName:'wrong'}},0)).toThrow();
    const invalid=structuredClone(journal);Object.assign(invalid,{future:true});expect(()=>owner.load(invalid)).toThrow();expect(owner.snapshot()).toEqual(s);
    const another=structuredClone(journal);another.actions=[{kind:'identity',edit:{kind:'city',id:'missing',customName:'bad'}}];expect(()=>owner.load(another)).toThrow();expect(owner.snapshot()).toEqual(s);
  },30000);
  it('replays monthly population through the real IndexedDB save path with military and diplomacy active',async()=>{
    const owner=new Culture47Session();owner.create({...opening,terrain:{...opening.terrain,worldId:'00000000-0000-4000-8000-00000000065b'}});
    for(let day=0;day<32;day++)owner.executeDisplay([{kind:'advance',ticks:120}],day);
    const result=owner.snapshot();expect(result.run.kin.lifecycle.deaths).toContainEqual(expect.objectContaining({personId:2,day:31,tick:3720,wasLeaderOf:'n-1'}));expect(result.run.people.nations['n-1'].leaderId).toBe(10);expect(result.run.world.day).toBe(32);expect(result.run.kin.lifecycle.lastMonth).toBe(13);expect(result.run.kin.lifecycle.random.draws).toBeGreaterThan(0);
    const db=new IDBFactory();await saveCulture47(result.journal,null,db);const saved=await loadCulture47(db);expect(saved).not.toBeNull();const other=new Culture47Session(),restored=other.load(saved!.journal);expect(restored).toEqual(result);
    for(let day=32;day<62;day++){owner.executeDisplay([{kind:'advance',ticks:120}],day);other.executeDisplay([{kind:'advance',ticks:120}],day);}
    expect(other.snapshot()).toEqual(owner.snapshot());expect(other.snapshot().run.kin.lifecycle.lastMonth).toBe(14);
  },120000);
  it('fails closed on a different engine, sparse log and oversized steps',()=>{
    expect(()=>assertCulture47Journal({...journal,engine:'0'.repeat(64)})).toThrow();expect(()=>assertCulture47Journal({...journal,actions:new Array(1)})).toThrow();expect(()=>assertCulture47Journal({...journal,actions:[{kind:'advance',ticks:121}]})).toThrow();
  });
  it('keeps frozen46 execution bytes unchanged',()=>{expect(verifyWar46Compatibility()).toMatch(/^[a-f0-9]{64}$/);},30000);
});
