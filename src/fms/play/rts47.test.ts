import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {ORIGINAL_ARMY_RULE47} from './civilization47-original-army';
import {applyRtsOrder47} from './culture47-orders';

describe('即时战略模式 (original RTSController)',()=>{
  it('orders the selected armies of one state at once, under manual control, and replays exactly',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    x=s.execute({kind:'enable-original-army',rule:ORIGINAL_ARMY_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    const nation=x.run.world.nations[0].id,armies=x.run.world.armies.filter(a=>a.nationId===nation&&a.troops>0).slice(0,3);
    expect(armies.length).toBeGreaterThan(1);
    const target=x.run.world.provinces.find(p=>p.controller===nation&&!armies.some(a=>a.provinceId===p.id))!;
    const foreign=x.run.world.armies.find(a=>a.nationId!==nation)!;
    x=s.execute({kind:'rts',order:{nationId:nation,armyIds:[...armies.map(a=>a.id),foreign.id],target:{kind:'province',id:target.id},mode:'attack'}},x.journal.actions.length);
    for(const a of armies){
      expect(x.run.voyages.manualArmies).toContain(a.id);
      expect(x.run.armyAutonomy.armies[a.id].decision).toBe('manual');
    }
    // Another state's army in the selection is ignored.
    expect(x.run.voyages.manualArmies).not.toContain(foreign.id);
    for(let i=0;i<3;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const replay=new Culture47Session().load(x.journal);
    expect(replay.run.world.armies).toEqual(x.run.world.armies);
    expect(()=>applyRtsOrder47(x.run as never,{nationId:nation,armyIds:[foreign.id],target:{kind:'province',id:target.id},mode:'defend'})).toThrow('选中的军团都无法前往该行省。');
    expect(()=>s.execute({kind:'rts',order:{nationId:nation,armyIds:[],target:{kind:'province',id:target.id},mode:'attack'}} as never,x.journal.actions.length)).toThrow();
  },300000);
});
