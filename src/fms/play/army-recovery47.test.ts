import {beforeAll,describe,expect,it} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {populationStamp47} from './civilization47-population-types';
import {enableArmyRetirement47} from './army-retirement47';
import {ARMY_RECOVERY_RULE47,enableArmyRecovery47} from './army-recovery47';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {settleCivilizationDay47} from './civilization47-daily';
import {advanceFamilyCalendar47} from './civilization47-calendar';
import {Culture47Session} from './culture47-session';
import {loadCulture47,saveCulture47} from './culture47-storage';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47} from './army-travel47-state';

let base:FoundingForces47;
const noOrders=()=>undefined;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
const stock=(r:FoundingForces47,id:string)=>r.world.statecraft!.provinces.find(p=>p.provinceId===id)!;
function pending(day:number){
  const r=structuredClone(base);
  for(let tick=1;tick<=day*120;tick++){
    r.clock.tick=tick;r.world.day=Math.floor(tick/120)-(tick===day*120?1:0);
    advanceFamilyCalendar47(r,tick,tick===day*120);
  }
  r.forceClock.now=r.clock.tick;r.navalAutonomy.lastTick=r.clock.tick;r.dailyEconomy.lastDay=r.world.day;r.dailyEconomy.lastMusterMonth=Math.floor(r.world.day/30);
  return r;
}
function enabled(r:FoundingForces47){const retired=enableArmyRetirement47(r,populationStamp47(r));return enableArmyRecovery47(retired,populationStamp47(retired));}
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),2,8,'peace',{mode:'culture-generated',enabled:['chinese','japanese']});},30000);

describe('opt-in wounded regular replacement from the real local stock',()=>{
  it('crosses the departure threshold across days without replacing a live force or losing monthly slots',()=>{
    const input=enabled(pending(30)),army=input.world.armies.find(a=>input.tactics.forces[a.id].kind==='regular')!,id=army.id,home=army.provinceId,resources=stock(input,home),initialPopulation=resources.population;
    army.troops=1;resources.grain=initialPopulation*10+10000;const before=structuredClone(input);
    let run=settleCivilizationDay47(input,noOrders),days=1;
    while(run.world.armies.find(a=>a.id===id)!.troops<=180&&days<8){run=settleCivilizationDay47(advanceCivilizationMilitary47(run,120,weights).run,noOrders);days++;}
    const restored=run.world.armies.find(a=>a.id===id)!;
    expect(input).toEqual(before);expect(restored.troops).toBeGreaterThan(180);expect(restored.troops).toBeLessThanOrEqual(input.tactics.forces[id].fullStrength);
    expect(restored.status).not.toBe('destroyed');expect(run.world.armies.filter(a=>a.id===id)).toHaveLength(1);expect(run.tactics.forces[id].homeId).toBe(home);
    expect(run.world.statecraft!.provinces.find(p=>p.provinceId===home)!.population).toBeLessThan(initialPopulation);
    expect(run.world.events.filter(e=>e.text.includes('补员后恢复出征能力')&&e.text.includes(army.name))).toHaveLength(1);
  },60000);

  it('debits exactly local population and grain after food settlement, and balances the daily ledger',()=>{
    const input=enabled(pending(1)),army=input.world.armies[0],id=army.id,resource=stock(input,army.provinceId);
    army.troops=150;resource.grain=resource.population*10+10000;
    const before=structuredClone(input),legacy=structuredClone(input);delete legacy.armyRecovery;
    const old=settleCivilizationDay47(legacy,noOrders),out=settleCivilizationDay47(input,noOrders),recruits=out.world.armies.find(a=>a.id===id)!.troops-old.world.armies.find(a=>a.id===id)!.troops;
    const a=stock(old,army.provinceId),b=stock(out,army.provinceId),ledger=out.world.statecraft!.nations.find(n=>n.nationId===army.nationId)!.lastLedger!,oldLedger=old.world.statecraft!.nations.find(n=>n.nationId===army.nationId)!.lastLedger!;
    expect(input).toEqual(before);expect(recruits).toBeGreaterThan(30);expect(recruits).toBeLessThanOrEqual(120);
    expect(a.population-b.population).toBe(Math.ceil(recruits/10));expect(a.grain-b.grain).toBe(recruits);
    expect(ledger.militaryConsumed-oldLedger.militaryConsumed).toBe(recruits);expect(oldLedger.closingGrain-ledger.closingGrain).toBe(recruits);
    expect(ledger.openingGrain+ledger.production-ledger.civilianConsumed-ledger.militaryConsumed).toBe(ledger.closingGrain);
    expect(out.armyRecovery).toEqual({version:1,rule:ARMY_RECOVERY_RULE47,enabledTick:120});
  },30000);

  it('never draws recruits for sea transit or from a civilian-reserved grain store',()=>{
    for(const condition of ['sea','grain'] as const){
      const r=enabled(pending(1)),a=r.world.armies[0],resource=stock(r,a.provinceId);a.troops=80;
      if(condition==='sea'){
        const graph=actualForces47(r).spatial.graph,cell=[...graph.cells.values()].find(c=>c.surface==='sea')!;
        r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell.id],graph);
      }else resource.grain=0;
      const baseline=structuredClone(r);delete baseline.armyRecovery;
      const old=settleCivilizationDay47(baseline,noOrders),out=settleCivilizationDay47(r,noOrders);
      expect(out.world.armies.find(v=>v.id===a.id)!.troops).toBe(old.world.armies.find(v=>v.id===a.id)!.troops);
    }
  },30000);

  it('does not silently alter an existing world, rejects stale switches and cold-replays only the explicit saved action',async()=>{
    const old=pending(1),wound=old.world.armies[0];wound.troops=150;stock(old,wound.provinceId).grain+=10000;const before=structuredClone(old);
    const oldResult=settleCivilizationDay47(old,noOrders);expect(oldResult.armyRecovery).toBeUndefined();expect(oldResult.world.armies.find(a=>a.id===wound.id)!.troops).toBe(150);expect(old).toEqual(before);
    const retirement=enableArmyRetirement47(old,populationStamp47(old));
    expect(()=>enableArmyRecovery47(retirement,{...populationStamp47(retirement),tick:0})).toThrow();
    const prepared=enableArmyRecovery47(retirement,populationStamp47(retirement));expect(()=>enableArmyRecovery47(prepared,populationStamp47(prepared))).toThrow();
    const missingParent=structuredClone(prepared);delete missingParent.armyRetirement;expect(()=>settleCivilizationDay47(missingParent,noOrders)).toThrow(/补员规则/);
    const created=new Culture47Session().create({terrain:base.terrain,count:2,cityCount:8,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}});
    const session=new Culture47Session(),fresh=session.load(created.journal),ret=session.execute({kind:'enable-retirement',rule:'retired-roster-web-v1',expected:populationStamp47(fresh.run)},0);
    const switched=session.execute({kind:'enable-recovery',rule:ARMY_RECOVERY_RULE47,expected:populationStamp47(ret.run)},1);
    const step=session.execute({kind:'advance',ticks:120},2),db=new IDBFactory(),revision=await saveCulture47(step.journal,null,db),saved=await loadCulture47(db),replayed=new Culture47Session().load(saved!.journal);
    expect(revision).toBe(1);expect(saved!.recovered).toBe(false);expect(replayed.run).toEqual(step.run);expect(replayed.journal).toEqual(step.journal);expect(switched.run.armyRecovery).toMatchObject({rule:ARMY_RECOVERY_RULE47});
    expect(new Culture47Session().load(created.journal).run.armyRecovery).toBeUndefined();
  },60000);
});
