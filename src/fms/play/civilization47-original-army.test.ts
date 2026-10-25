import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {ORIGINAL_ARMY_RULE47,originalPaths47,armyKills47,creditArmyKills47,originalArmy47,progressOriginalReorganization47,reorganizeDefeatedArmy47} from './civilization47-original-army';
import {armySpatialFor47} from './army-geography47';
import {forceStrength47} from './civilization47-monthly-muster';
import {armyTravelPolicy47} from './army-commands47';

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
    expect((r as unknown as {originalArmy47:{kills:Record<string,number>}}).originalArmy47.kills).toBeDefined();
    const replay=new Culture47Session().load(x.journal);
    expect(replay.run.world.armies).toEqual(r.world.armies);
    expect((replay.run as unknown as {originalArmy47:unknown}).originalArmy47).toEqual((r as unknown as {originalArmy47:unknown}).originalArmy47);
  },600000);
  it('every army hit on an army counts for the attacker, in soldiers (enemyArmyDestroyedCount)',()=>{
    const r={originalArmy47:{version:1,rule:ORIGINAL_ARMY_RULE47,kills:{}}},armyOf=(k:string)=>k.startsWith('army:')?k.slice(5):null;
    creditArmyKills47(r,[{attacker:'army:a',victim:'army:b',nativeDamage:12.34},{attacker:'army:a',victim:'army:c',nativeDamage:.5},{attacker:'fleet:f',victim:'army:b',nativeDamage:9},{attacker:'army:b',victim:'fleet:g',nativeDamage:3}],armyOf);
    expect(armyKills47(r,'a')).toBe(128);expect(armyKills47(r,'b')).toBe(0);expect(armyKills47(r,'f')).toBe(0);
    expect(armyKills47({},'a')).toBeNull();
  });
  it('a regular army beaten to zero is rebuilt at home with a tenth and refilled over the original duration',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    x=s.execute({kind:'enable-original-army',rule:ORIGINAL_ARMY_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    const r=structuredClone(x.run),a=r.world.armies.find(a=>r.tactics.forces[a.id]?.kind==='regular')!,home=r.tactics.forces[a.id].homeId;
    const graph=armySpatialFor47(r).graph;a.troops=0;
    expect(reorganizeDefeatedArmy47(r,a,graph)).toBe(true);
    const full=forceStrength47(r,home);
    expect(a.provinceId).toBe(home);expect(a.status).toBe('idle');expect(a.troops).toBe(Math.max(1,Math.floor(full*.1)));expect(r.reorganization.active[a.id]).toBeDefined();
    let days=0;while(r.reorganization.active[a.id]&&days<10000){progressOriginalReorganization47(r);days++;}
    expect(a.troops).toBe(full);
    const pop=Math.max(0,Math.min(25000,r.world.statecraft!.provinces.find(p=>p.provinceId===home)!.population));
    expect(days).toBe(Math.ceil((full-Math.floor(full*.1))/(full*r.life.secondsPerDay/(20-10*pop/25000))-1e-9));
    const emergency={...a,id:'x'};r.tactics.forces.x={...r.tactics.forces[a.id],kind:'emergency'};r.world.armies.push(emergency);
    expect(reorganizeDefeatedArmy47(r,emergency,graph)).toBe(false);
  });
  it('an army may always walk through the state it stands in (FindProvincePath start state), in new worlds only',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    x=s.execute({kind:'enable-original-army',rule:ORIGINAL_ARMY_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    const r=structuredClone(x.run);expect(originalPaths47(r)).toBe(true);
    const a=r.world.armies.find(a=>a.troops>0)!,foreign=r.world.provinces.find(p=>p.controller!==a.nationId)!;
    const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
    expect(armyTravelPolicy47(r,a,weights,true).canEnter(foreign.id)).toBe(false);
    const stranded={...a,provinceId:foreign.id};
    expect(armyTravelPolicy47(r,stranded,weights,true).canEnter(foreign.id)).toBe(true);
    const older=structuredClone(r);delete (older as unknown as {originalArmy47:{paths?:1}}).originalArmy47.paths;
    expect(armyTravelPolicy47(older,stranded,weights,true).canEnter(foreign.id)).toBe(false);
  });
});

