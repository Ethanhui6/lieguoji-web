import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {politicalStamp47} from './civilization47-political-owner';
import {FOUNDING_RULE47} from './civilization47-founding';
import type {NobilityRun47} from './civilization47-nobility';

let journal:ReturnType<Culture47Session['create']>['journal'];
beforeAll(()=>{
  const s=new Culture47Session();let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
  x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
  for(let i=0;i<40;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
  journal=x.journal;
},300000);
describe('original family rebellion (StartFamilyRebellion)',()=>{
  it('founds the rebel state ruled by the family, starts the CB15 war, advances and replays',()=>{
    const s=new Culture47Session();let x=s.load(journal);
    const r0=x.run as NobilityRun47,n0=r0.nobility!;
    const id=Object.keys(n0.families).find(v=>!n0.families[v].ruling&&n0.families[v].controlledProvinces.length>0&&r0.kin.persons[r0.kin.families[v].headId]?.isAlive)!;
    const mother=n0.families[id].nationId,head=r0.kin.families[id].headId,before=r0.world.nations.length;
    x=s.execute({kind:'family-rebellion',familyId:id,expected:politicalStamp47(x.run)},x.journal.actions.length);
    const r=x.run as NobilityRun47&{nativeWars:{campaigns:{endedTick:number|null;attacker:string;defender:string;internal?:Record<string,unknown>}[]}},n=r.nobility!;
    expect(r.world.nations.length).toBe(before+1);
    const rebel=r.world.nations.at(-1)!.id;
    expect(n.families[id].nationId).toBe(rebel);expect(n.families[id].ruling).toBe(true);expect(n.rulingFamilies[rebel]).toBe(Number(id));
    expect(r.people.nations[rebel].leaderId).toBe(head);expect(r.kin.persons[head].stateId).toBe(r.people.nations[rebel].id);
    for(const p of n.families[id].controlledProvinces)expect(r.world.provinces.find(v=>v.id===p)!.controller).toBe(rebel);
    const war=r.nativeWars.campaigns.find(c=>c.endedTick===null&&c.internal?.casusBelliId===15)!;
    expect(war.attacker).toBe(mother);expect(war.defender).toBe(rebel);
    expect(r.chronicle.entries.some(e=>e.text===`${r.kin.families[id].surname}家族叛乱`)).toBe(true);
    for(let i=0;i<120;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },600000);
});
