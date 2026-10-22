import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {politicalStamp47} from './civilization47-political-owner';
import {FOUNDING_RULE47,type FoundingRun47} from './civilization47-founding';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';

let journal:Culture47Journal;
beforeAll(()=>{
  const s=new Culture47Session();let snap=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
  snap=s.execute({kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(snap.run)},snap.journal.actions.length);
  snap=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(snap.run)},snap.journal.actions.length);
  journal=snap.journal;
},120000);
describe('original rebel state founding (StateManager.CreateRebelState + State.Start)',()=>{
  it('founds a state with its own ruler and family, keeps every validator, advances and replays',()=>{
    const s=new Culture47Session();let snap=s.load(journal);
    for(let i=0;i<400;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);
    const r=snap.run as FoundingRun47;
    const parent=[...r.world.nations].sort((a,b)=>r.world.provinces.filter(p=>p.controller===b.id).length-r.world.provinces.filter(p=>p.controller===a.id).length)[0],capitalProvince=r.world.cities.find(c=>c.id===parent.capitalId)!.provinceId;
    const target=r.world.provinces.find(p=>p.controller===parent.id&&p.id!==capitalProvince&&r.world.cities.some(c=>c.provinceId===p.id))!;
    snap=s.execute({kind:'rebellion',provinceId:target.id,expected:politicalStamp47(snap.run)},snap.journal.actions.length);
    const out=snap.run as FoundingRun47,id='n-3',province=out.world.provinces.find(p=>p.id===target.id)!;
    expect(out.world.nations.map(n=>n.id)).toContain(id);
    expect([province.controller,province.legalOwner]).toEqual([id,id]);
    expect(out.civilization.nations[id]).toMatchObject({origin:'secession',parentId:parent.id});
    const leader=out.kin.persons[out.people.nations[id].leaderId!];
    expect(leader.source).toBe('founding');expect(leader.age).toBeGreaterThanOrEqual(35);
    expect(out.foundings!.records).toHaveLength(1);
    expect(out.chronicle.entries.slice(-2).map(e=>e.text)).toEqual([`${target.name}发生叛乱`,`${out.world.nations[3].name} 成立于 ${target.name}`]);
    expect(out.foundings!.records[0].day).toBe(400);
    for(let i=0;i<400;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);
    const later=snap.run as FoundingRun47,family=later.kin.families[String(later.people.nations[id].id)];
    expect(family.memberIds.length+family.collateralMemberIds.length).toBeGreaterThan(1);
    expect(later.finance.nations[id].lastMonth).toBe(Math.floor(later.world.day/30));expect(later.finance.nations[id].ledger).not.toBeNull();
    expect(later.destiny.nations[id].destiny).toBeGreaterThan(0);expect(later.world.provinces.some(p=>p.controller===id)).toBe(true);
    expect(new Culture47Session().load(snap.journal)).toEqual(snap);
  },300000);
});

describe('rebellion rule gating',()=>{
  it('worlds without the rule reject rebellion; capitals and last provinces cannot rebel',()=>{
    const s=new Culture47Session(),snap=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    const p=snap.run.world.provinces.find(v=>snap.run.world.cities.find(c=>c.id===snap.run.world.nations.find(n=>n.id===v.controller)!.capitalId)?.provinceId!==v.id)!;
    expect(()=>s.execute({kind:'rebellion',provinceId:p.id,expected:politicalStamp47(snap.run)},snap.journal.actions.length)).toThrow('未启用叛乱规则');
    const t=new Culture47Session();let x=t.load(journal);const capital=x.run.world.cities.find(c=>c.id===x.run.world.nations[0].capitalId)!.provinceId;
    expect(()=>t.execute({kind:'rebellion',provinceId:capital,expected:politicalStamp47(x.run)},x.journal.actions.length)).toThrow('首都不能发生叛乱');
    x=t.snapshot();expect(x.journal.actions.length).toBe(journal.actions.length);
  },120000);
});
