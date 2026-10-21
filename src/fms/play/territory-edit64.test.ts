import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {politicalStamp47} from './civilization47-political-owner';
import {assertTerritoryEdit47} from './civilization47-territory-edit';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},60000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const grant=(s:Culture47Session,nationId:string,provinceIds:string[])=>{const run=s.snapshot().run;return s.execute({kind:'territory',edit:{nationId,provinceIds},expected:politicalStamp47(run)},s.snapshot().journal.actions.length);};

describe('in-game country editing (original 绘制国家 while paused)',()=>{
  it('moves legal and actual ownership, records history and replays exactly',()=>{
    const s=load(),run=s.snapshot().run,target=run.world.provinces.find(p=>p.controller==='n-1'&&!run.world.nations.some(n=>run.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!;
    const out=grant(s,'n-0',[target.id]),p=out.run.world.provinces.find(p=>p.id===target.id)!;
    expect([p.controller,p.legalOwner]).toEqual(['n-0','n-0']);
    expect(out.run.chronicle.entries.at(-1)?.text).toContain('地图编辑');
    expect(out.run.chronicle.entries.at(-1)?.nationIds).toEqual(['n-0','n-1']);
    expect(new Culture47Session().load(out.journal)).toEqual(out);
  },60000);
  it('taking a capital relocates it; taking all land ends the nation; the world keeps advancing',()=>{
    const s=load(),run=s.snapshot().run,capital=run.world.cities.find(c=>c.id===run.world.nations.find(n=>n.id==='n-2')!.capitalId)!.provinceId;
    const moved=grant(s,'n-0',[capital]).run;
    expect(moved.world.cities.find(c=>c.id===moved.world.nations.find(n=>n.id==='n-2')!.capitalId)!.provinceId).not.toBe(capital);
    const rest=moved.world.provinces.filter(p=>p.controller==='n-2').map(p=>p.id),ended=grant(s,'n-1',rest).run;
    expect(ended.world.provinces.some(p=>p.controller==='n-2')).toBe(false);
    expect(Object.hasOwn(ended.chronicle.ended,'n-2')).toBe(true);
    const after=s.execute({kind:'advance',ticks:120},s.snapshot().journal.actions.length);
    expect(after.run.clock.tick).toBe(ended.clock.tick+120);
  },60000);
  it('rejects stale stamps, no-op and malformed edits without changing the world',()=>{
    const s=load(),before=s.snapshot(),run=before.run,own=run.world.provinces.find(p=>p.controller==='n-0')!.id,other=run.world.provinces.find(p=>p.controller==='n-1')!.id;
    expect(()=>grant(s,'n-0',[own])).toThrow('已经属于');
    const stale=politicalStamp47(run);s.execute({kind:'advance',ticks:1},0);
    expect(()=>s.execute({kind:'territory',edit:{nationId:'n-0',provinceIds:[other]},expected:stale},1)).toThrow('已变化');
    for(const bad of [{nationId:'n-0',provinceIds:[]},{nationId:'n-0',provinceIds:['p-1','p-1']},{nationId:'x',provinceIds:['p-1']},{nationId:'n-0',provinceIds:['p-1'],extra:1}])expect(()=>assertTerritoryEdit47(bad)).toThrow();
    expect(()=>grant(s,'n-9',[other])).toThrow();
  },60000);
});

describe('editing during an active war',()=>{
  it('a besieged province can be redrawn; its siege ends and the war continues advancing',()=>{
    const s=new Culture47Session();s.create({...opening,relations:'war'});
    let snap=s.snapshot();
    for(let i=0;i<400&&!snap.run.occupation.sieges.length;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);
    const siege=snap.run.occupation.sieges[0];expect(siege,'no siege formed in 400 days').toBeDefined();
    const third=snap.run.world.nations.find(n=>n.id!==siege.controller&&n.id!==siege.attacker&&snap.run.world.provinces.some(p=>p.controller===n.id))??snap.run.world.nations.find(n=>n.id===siege.attacker)!;
    const out=s.execute({kind:'territory',edit:{nationId:third.id,provinceIds:[siege.provinceId]},expected:politicalStamp47(snap.run)},snap.journal.actions.length);
    expect(out.run.occupation.sieges.some(v=>v.provinceId===siege.provinceId)).toBe(false);
    let next=out;for(let i=0;i<30;i++)next=s.execute({kind:'advance',ticks:120},next.journal.actions.length);
    expect(next.run.clock.tick).toBe(out.run.clock.tick+30*120);
    expect(new Culture47Session().load(next.journal).run.clock.tick).toBe(next.run.clock.tick);
  },240000);
});
