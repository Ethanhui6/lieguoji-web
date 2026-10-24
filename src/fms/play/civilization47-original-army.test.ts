import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {ORIGINAL_ARMY_RULE47,originalArmy47} from './civilization47-original-army';

describe('original armies without rations',()=>{
  it('a war world never starves its armies and replays exactly',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    expect(()=>s.execute({kind:'enable-original-army',rule:ORIGINAL_ARMY_RULE47,expected:{...populationStamp47(x.run),day:x.run.world.day+1}},x.journal.actions.length)).toThrow();
    x=s.execute({kind:'enable-original-army',rule:ORIGINAL_ARMY_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    expect(originalArmy47(x.run)).toBe(true);
    for(let i=0;i<40;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run;
    for(const a of r.world.armies)if(a.troops>0&&a.status!=='destroyed'){expect(a.supplies).toBe(100);expect(a.morale).toBe(100);}
    expect(r.world.events.some(e=>e.text.includes('断粮'))).toBe(false);
    expect(Object.values(r.armyAutonomy.armies).some(v=>v.decision==='resting'||v.decision==='staging')).toBe(false);
    const replay=new Culture47Session().load(x.journal);
    expect(replay.run.world.armies).toEqual(r.world.armies);
  },600000);
});
