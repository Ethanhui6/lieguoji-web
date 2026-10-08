import {describe,it,expect,beforeAll} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {initialForceClock47,assertForceClock47,reconcileAttackClock47,rescheduleAttack47} from './force-clock47';
import {initializedArmySpeed47,assertForceSpeed47,actualForceSpeed47} from './force-speed47';
import {actualForces47} from './force-runtime47';
import {nativeArmyMovementSpeed} from './native-war/army-path';
import {unitProfile} from './military-profile';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {assertFamilyCalendar47,advanceFamilyCalendar47} from './civilization47-calendar';
import {beginArmyTravel47} from './army-travel47-state';
import {forceKey47} from './force-motion47';
import {applyArmyCommand47,armyStamp47} from './army-commands47';

let base:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
// Explicit fixture combat only. Production personnel adapter remains pending.
const combat=()=>({navyCountToHull:1,army:()=>({efficiency:1,damageToArmy:40,multiplier:1}),navy:()=>({destiny:30,maritime:false,livingLeaderModifier:null})});
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),4,24,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab']});},20000);
/** Fixture clock setup only; it does NOT perform economic/AI day settlement. */
function atTick(tick:number){const r=structuredClone(base);for(let i=1;i<=tick;i++){r.clock.tick=i;r.world.day=Math.floor(i/120);advanceFamilyCalendar47(r,i);}r.forceClock.now=tick;return r;}

describe('one saved motion and attack time scale, real family clock',()=>{
  it('persists one speed per Army, with nation tradition separate from Cavalry unit and real culture',()=>{
    assertForceSpeed47(base.forceSpeed,base.world,0);expect(new Set(Object.values(base.forceSpeed.armies).map(v=>v.base)).size).toBeGreaterThan(1);
    for(const a of base.world.armies){const v=base.forceSpeed.armies[a.id];expect(v.cavalryTradition).toBe(false);expect(v.base).toBeGreaterThanOrEqual(1.0499999);expect(v.base).toBeLessThanOrEqual(1.6500001);expect(v).toEqual(initializedArmySpeed47(base.world.custom!.seed,a.id,a.nationId,0,false));}
    const a=base.world.armies[0];expect(initializedArmySpeed47('seed',a.id,a.nationId,0,true).base).toBe(Math.fround(1.9499999284744263));
    const reload=JSON.parse(JSON.stringify(base.forceSpeed));assertForceSpeed47(reload,base.world,50);expect(reload).toEqual(base.forceSpeed);
  });
  it('gets speed from the current land/sea cell, with shared map units and no terrain scale multiplication',()=>{
    const r=structuredClone(base),{forces,spatial}=actualForces47(r),army=forces.find(f=>f.kind==='army')!,land=[...spatial.graph.cells.values()].find(c=>c.surface==='land')!,sea=[...spatial.graph.cells.values()].find(c=>c.surface==='sea')!,row=r.forceSpeed.armies[army.id],dt=r.forceClock.secondsPerTick;
    // A scalar Fleet speed probe, independent of starter harbor eligibility.
    const fleet={kind:'fleet' as const,id:'speed-probe',nationId:army.nationId,withdrawing:false,travel:beginArmyTravel47('speed-probe',[sea.id],spatial.graph)};
    expect(dt).toBe(r.life.secondsPerDay/120);const terrain=r.terrainContext.provinces[land.provinceId!];terrain.mountain=true;terrain.plateau=false;
    expect(actualForceSpeed47(r,army,land)).toBe(nativeArmyMovementSpeed({base:row.base,onLand:true,mountain:true,unitMultiplier:unitProfile(r.units[army.id]).speed})*dt);
    terrain.mountain=false;terrain.plateau=true;expect(actualForceSpeed47(r,army,land)).toBe(nativeArmyMovementSpeed({base:row.base,onLand:true,plateau:true,unitMultiplier:unitProfile(r.units[army.id]).speed})*dt);
    const seaSpeed=actualForceSpeed47(r,army,sea);r.units={...r.units,[army.id]:'Cavalry'};expect(actualForceSpeed47(r,army,sea)).toBe(seaSpeed);
    expect(actualForceSpeed47(r,fleet,sea)/dt).toBe(Math.fround(2.2));expect(()=>actualForceSpeed47(r,fleet,land)).toThrow(/陆地/);
    const before=actualForceSpeed47(r,army,sea);r.scale*=5;r.terrain.width*=2;expect(actualForceSpeed47(r,army,sea)).toBe(before);
  });
  it('keeps actual first and later deadlines through day boundaries and reload without redrawing',()=>{
    const dt=base.life.secondsPerDay/120,c=initialForceClock47(0,1234,dt),keys=new Set(['army:a']);reconcileAttackClock47(c,keys,0);
    expect(c.deadlines['army:a']).toBe(2/dt);expect(c.deadlines['army:a']).not.toBe(20);
    for(let day=1;day<20;day++){c.now=day*120;const saved=JSON.parse(JSON.stringify(c));assertForceClock47(saved,saved.now,keys);reconcileAttackClock47(saved,keys,saved.now);expect(saved.deadlines).toEqual(c.deadlines);expect(saved.draws).toBe(0);}
    const first=c.deadlines['army:a'];rescheduleAttack47(c,'army:a',first);expect((c.deadlines['army:a']-first)*dt).toBeGreaterThanOrEqual(2);expect((c.deadlines['army:a']-first)*dt).toBeLessThanOrEqual(6);expect(c.draws).toBe(1);
  });
  it('reaches the real two-second first attack across twenty military day windows and reloads',()=>{
    let r=structuredClone(base);const {spatial}=actualForces47(r),sea=[...spatial.graph.cells.values()].find(c=>c.surface==='sea')!,a=r.world.armies[0],b=r.world.armies.find(v=>v.nationId!==a.nationId)!;
    for(const army of r.world.armies){army.troops=0;army.status='destroyed';}
    for(const fleet of r.navy.fleets){fleet.status='lost';r.maritime.hulls[fleet.id]=0;}
    for(const army of [a,b]){army.troops=20000;army.status='idle';r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],spatial.graph);}
    for(const rel of r.world.statecraft!.relations)if([a.nationId,b.nationId].includes(rel.a)&&[a.nationId,b.nationId].includes(rel.b))rel.status='war';
    const first=2/r.forceClock.secondsPerTick,hits:number[]=[];
    for(let day=0;day<20;day++){
      const out=advanceCivilizationMilitary47(r,120,weights,combat);hits.push(...out.volleys.map(v=>v.at));expect(out.dailyPending).toBe(true);expect(out.run.world.day).toBe(day);
      if(day<19){expect(out.volleys).toEqual([]);expect(out.run.forceClock.draws).toBe(0);expect(out.run.forceClock.deadlines[forceKey47({kind:'army',id:a.id})]).toBe(first);}
      // Deliberately ONLY a settlement stub. No claim of finance/AI/Store49.
      out.run.world.day++;const {terrain,...state}=out.run;r={...JSON.parse(JSON.stringify(state)),terrain};
    }
    expect(hits).toEqual([first]);expect(r.forceClock.draws).toBe(2);expect(r.world.armies.find(v=>v.id===a.id)!.troops).toBe(19600);expect(r.life.lastTick).toBe(2400);expect(r.life.gameTime).toBe(Math.fround(20*r.life.secondsPerDay));assertFamilyCalendar47(r);
  },120000);
  it('matches split windows and reload for all clocks, RNG, positions, speeds, birthdays and family state',()=>{
    const a=base.world.armies.find(a=>base.world.provinces.find(p=>p.id===a.provinceId)!.neighbors.some(id=>base.world.provinces.find(p=>p.id===id)!.controller===a.nationId))!,target=base.world.provinces.find(p=>p.id===a.provinceId)!.neighbors.find(id=>base.world.provinces.find(p=>p.id===id)!.controller===a.nationId)!;
    const ordered=applyArmyCommand47(base,{type:'army-move',armyId:a.id,target:{kind:'province',id:target},kind:'march'},armyStamp47(base),weights),one=advanceCivilizationMilitary47(ordered,12,weights,combat);let r=ordered;
    for(const ticks of [3,4,5]){const {terrain,...state}=r;r=advanceCivilizationMilitary47({...JSON.parse(JSON.stringify(state)),terrain},ticks,weights,combat).run;}
    expect(r).toEqual(one.run);expect(r.life.lastTick).toBe(12);expect(r.forceSpeed).toEqual(base.forceSpeed);expect(base.clock.tick).toBe(0);
    expect(r.armyPositions.records[a.id]).not.toEqual(ordered.armyPositions.records[a.id]);
  },20000);
  it('holds the economic day pending while calendar advances once and rejects another military tick',()=>{
    const r=atTick(119),before=structuredClone(r),out=advanceCivilizationMilitary47(r,1,weights,combat);
    expect(out.dailyPending).toBe(true);expect(out.run.world.day).toBe(0);expect(out.run.life.currentDate).toEqual({year:1,month:1,day:2});expect(out.run.life.lastTick).toBe(120);assertFamilyCalendar47(out.run,true);
    expect(()=>advanceCivilizationMilitary47(out.run,1,weights,combat)).toThrow();expect(r).toEqual(before);
    // Explicit settlement stub: only verifies no second calendar update.
    out.run.world.day=1;const next=advanceCivilizationMilitary47(out.run,1,weights,combat);expect(next.run.life.lastTick).toBe(121);expect(next.run.life.currentDate).toEqual(out.run.life.currentDate);
  });
  it('updates non-court relatives at the ISO month boundary and preserves birthdays and relations',()=>{
    const r=atTick(31*120-1),relative=Object.values(r.kin.persons).find(p=>!r.people.persons[p.id])!,birth=relative.birthTime,out=advanceCivilizationMilitary47(r,1,weights,combat);
    expect(out.run.world.day).toBe(30);expect(out.run.life.currentDate).toEqual({year:1,month:2,day:1});expect(out.run.life.persons[relative.id].updatedMonth).toBe(13);expect(out.run.kin.persons[relative.id].birthTime).toBe(birth);expect(out.run.kin.persons[relative.id].childrenIds).toEqual(relative.childrenIds);expect(out.run.kin.revision).toBe(r.kin.revision+1);expect(out.run.life.revision).toBe(r.life.revision+1);assertFamilyCalendar47(out.run,true);
  });
  it.each([-1e-4,0,1e-4])('processes an attack %s ticks relative to the day edge without double firing',offset=>{
    const r=atTick(119),{spatial}=actualForces47(r),sea=[...spatial.graph.cells.values()].find(c=>c.surface==='sea')!,a=r.world.armies[0],b=r.world.armies.find(v=>v.nationId!==a.nationId)!,keys=[a,b].map(a=>forceKey47({kind:'army',id:a.id}));
    for(const relation of r.world.statecraft!.relations)if([a.nationId,b.nationId].includes(relation.a)&&[a.nationId,b.nationId].includes(relation.b))relation.status='war';
    for(const army of [a,b]){army.troops=20000;r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],spatial.graph);}
    r.forceClock.deadlines=Object.fromEntries(keys.map(k=>[k,120+offset]));const out=advanceCivilizationMilitary47(r,1,weights,combat);
    expect(out.volleys.length).toBe(offset<=0?1:0);expect(out.run.forceClock.draws).toBe(offset<=0?2:0);
    out.run.world.day=1;const next=advanceCivilizationMilitary47(out.run,1,weights,combat);expect(next.volleys.length).toBe(offset>0?1:0);expect(next.run.forceClock.draws).toBe(2);
  });
  it('rejects stale calendars, future speed data and the old independent military second atomically',()=>{
    for(const mutate of [(r:FoundingForces47)=>r.life.lastTick++, (r:FoundingForces47)=>{delete r.life.persons[Object.keys(r.life.persons)[0]];},(r:FoundingForces47)=>{Object.assign(r.kin,{origin:'native-initial-family-web-stream-v1'});},(r:FoundingForces47)=>{r.forceClock.secondsPerTick=.1;},(r:FoundingForces47)=>{Object.assign(r.forceSpeed,{future:1});},(r:FoundingForces47)=>{r.forceSpeed.armies[r.world.armies[0].id].base=1.5;}]){
      const r=structuredClone(base);mutate(r);const before=structuredClone(r);expect(()=>advanceCivilizationMilitary47(r,1,weights,combat)).toThrow();expect(r).toEqual(before);
    }
  });
  it('rolls back the whole candidate when the monthly revision overflows after earlier ticks',()=>{
    const r=atTick(31*120-3);r.kin.revision=2147483647;const before=structuredClone(r);expect(()=>advanceCivilizationMilitary47(r,3,weights,combat)).toThrow(/上限/);expect(r).toEqual(before);
  });
  it('rejects coherent-looking founder age edits and later birthdays without a recorded birth source',()=>{
    const r=atTick(1),founder=Object.values(r.kin.persons).find(p=>p.source==='founding')!;founder.age=0;r.life.persons[founder.id].age=0;expect(()=>advanceCivilizationMilitary47(r,1,weights,combat)).toThrow(/日历/);
    const s=atTick(1),relative=Object.values(s.kin.persons).find(p=>p.source==='initial-family')!;relative.birthTime=Math.fround(.0001);relative.age=0;s.life.persons[relative.id].birthTime=relative.birthTime;s.life.persons[relative.id].age=0;expect(()=>advanceCivilizationMilitary47(s,1,weights,combat)).toThrow(/日历/);
  });
});
