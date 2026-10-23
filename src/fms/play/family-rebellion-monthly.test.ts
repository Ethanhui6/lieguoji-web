import {describe,expect,it,vi} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {FOUNDING_RULE47} from './civilization47-founding';
import type {NobilityRun47} from './civilization47-nobility';

// The monthly check (CheckFamilyRebellions) is forced to start one rebellion,
// so the automatic path founds a state inside the daily political owner.
const force={on:false,done:false};
vi.mock('./civilization47-nobility-rebellion',async importOriginal=>{
  const m=await importOriginal<typeof import('./civilization47-nobility-rebellion')>();
  return {...m,checkFamilyRebellions47:(r:Parameters<typeof m.checkFamilyRebellions47>[0])=>{
    if(!force.on||force.done)return m.checkFamilyRebellions47(r);
    const n=r.nobility!,id=Object.keys(n.families).find(v=>!n.families[v].ruling&&n.families[v].controlledProvinces.length>0&&r.kin.persons[r.kin.families[v].headId]?.isAlive);
    if(id&&m.startFamilyRebellion47(r,id))force.done=true;
  }};
});
describe('monthly family rebellion',()=>{
  it('gives the new state its loss ledger, so strict daily settlement continues',()=>{
    const s=new Culture47Session();let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
    x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    const before=x.run.world.nations.length;force.on=true;
    for(let i=0;i<220&&!force.done;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(force.done).toBe(true);expect(x.run.world.nations.length).toBe(before+1);
    const rebel=x.run.world.nations.at(-1)!.id;expect(Object.keys((x.run as NobilityRun47&{losses:{nations:object}}).losses.nations)).toContain(rebel);
    for(let i=0;i<30;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(x.run.world.nations.some(n=>n.id===rebel)).toBe(true);
  },600000);
});
