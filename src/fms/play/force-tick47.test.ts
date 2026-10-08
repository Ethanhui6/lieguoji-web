import {beforeAll,describe,expect,it} from 'vitest';
import {War46Session} from './war46-session';
import type {War46Run} from './war46-model';
import {grid} from './fixture.test-support';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {beginArmyTravel47,armyTravelLocation47} from './army-travel47-state';
import {initialArmyPositions47} from './army-presence47';
import {geographyBinding} from './war30-geography';
import {forceKey47,initialForceContacts47} from './force-motion47';
import {initialForceDamage47} from './force-losses47';
import {initialForceClock47} from './force-clock47';
import {advanceMilitaryWindow47,type MilitaryRun47} from './force-tick47';
import {assertLosses} from './war27-losses';
import {assertWars46} from './war46-validation';
import {assertOccupation} from './occupation';

const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
let base:War46Run;
beforeAll(()=>{base=new War46Session().execute({type:'create',terrain:grid((x,y)=>y>20&&y<230&&(x>20&&x<105||x>145&&x<230)?45:0),count:4,cityCount:24,relations:'war'}).run as War46Run;});
function fixture() {
  const old=structuredClone(base),graph=buildArmyTravelGraph47(old.terrain,old.world),binding=geographyBinding(old);
  const armyPositions=initialArmyPositions47(old.world.armies.map(a=>({armyId:a.id,provinceId:a.provinceId,point:old.world.provinces.find(p=>p.id===a.provinceId)!.center})),graph,binding);
  const run:MilitaryRun47={...old,armyPositions,fleetPositions:{version:1,binding,revision:0,records:{}},forceContacts:initialForceContacts47(),forceDamage:initialForceDamage47(),forceClock:initialForceClock47(old.clock.tick,1234)};
  const a=run.world.armies[0],b=run.world.armies.find(b=>b.nationId!==a.nationId)!;
  for(const army of run.world.armies) {army.troops=0;army.status='destroyed';}
  const sea=[...graph.cells.values()].find(c=>c.surface==='sea')!;
  for(const army of [a,b]){army.troops=20000;army.status='idle';run.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],graph);}
  run.units={...run.units,[a.id]:'Infantry',[b.id]:'Infantry'};
  run.navy.fleets=[];run.maritime.hulls={};run.maritime.retreating={};run.tactics.unopposed='resistance';
  return {run,graph,a,b,sea,ak:forceKey47({kind:'army',id:a.id}),bk:forceKey47({kind:'army',id:b.id})};
}
const inputs={navyCountToHull:1,army:()=>({efficiency:1,damageToArmy:40,multiplier:1}),navy:()=>({destiny:30,maritime:false,livingLeaderModifier:null})};
const rules={speed:()=>1,combat:()=>inputs};
const advance=(r:MilitaryRun47,ticks:number)=>advanceMilitaryWindow47(r,ticks,weights,rules);
const jsonState=(r:MilitaryRun47):MilitaryRun47=>{const {terrain,...mutable}=r;return {...JSON.parse(JSON.stringify(mutable)),terrain};};

describe('47 atomic motion, persisted timers, occupation and accounting',()=>{
  it('waits the first 20 ticks, settles at the exact endpoint and keeps raw damage separate from actual deaths',()=>{
    const f=fixture(),before=structuredClone(f.run),waiting=advance(f.run,19);
    expect(waiting.volleys).toEqual([]);expect(waiting.run.forceClock.deadlines).toEqual({[f.ak]:20,[f.bk]:20});expect(waiting.run.forceClock.draws).toBe(0);
    const hit=advance(jsonState(waiting.run),1);
    expect(f.run).toEqual(before);expect(hit.volleys.map(v=>v.at)).toEqual([20]);expect(hit.run.forceClock.draws).toBe(2);
    for(const id of [f.a.id,f.b.id])expect(hit.run.world.armies.find(a=>a.id===id)!.troops).toBe(19600);
    for(const n of [f.a.nationId,f.b.nationId])expect(hit.run.losses.nations[n].total.combat).toBe(400);
    expect(()=>assertLosses(hit.run.losses,hit.run.world,hit.run.warfare,hit.run.clock.tick)).not.toThrow();
    expect(()=>assertWars46(hit.run.nativeWars,hit.run)).not.toThrow();
    const war=hit.run.nativeWars.campaigns.find(c=>c.nations.includes(f.a.nationId)&&c.nations.includes(f.b.nationId))!;
    expect(war.kills.map(x=>x[1])).toEqual([40,40]);
  });
  it('matches one window against split windows and JSON reload, including deadlines, draws, positions and all ledgers',()=>{
    const f=fixture(),one=advance(f.run,95);let split=f.run;const volleys=[];
    for(const dt of [7,12,1,13,29,33]){const out=advance(jsonState(split),dt);split=out.run;volleys.push(...out.volleys);}
    expect(split).toEqual(one.run);expect(volleys).toEqual(one.volleys);expect(one.volleys.length).toBeGreaterThan(2);
  },20000);
  it('lets both simultaneously dying armies fire, draws in typed order and never attributes overkill as people',()=>{
    const f=fixture();f.a.troops=1;f.b.troops=1;
    const hit=advance(f.run,20),reversed=structuredClone(f.run);reversed.world.armies.reverse();
    const other=advance(reversed,20);expect(other.run.forceClock).toEqual(hit.run.forceClock);expect(other.run.losses).toEqual(hit.run.losses);
    expect(hit.volleys[0].hits).toBe(2);expect(hit.volleys[0].losses).toBe(2);expect(hit.run.forceClock.draws).toBe(2);expect(hit.run.forceClock.deadlines).toEqual({});expect(hit.run.forceContacts.pairs).toEqual([]);
    for(const n of [f.a.nationId,f.b.nationId])expect(hit.run.losses.nations[n].total.combat).toBe(1);
  });
  it('removes a due attack when peace is applied before its deadline without consuming randomness',()=>{
    const f=fixture(),waiting=advance(f.run,19).run;
    for(const rel of waiting.world.statecraft!.relations)rel.status='peace';
    const out=advance(waiting,1);expect(out.volleys).toEqual([]);expect(out.run.forceClock.draws).toBe(0);expect(out.run.forceClock.deadlines).toEqual({});
    expect(out.run.world.armies.find(a=>a.id===f.a.id)!.troops).toBe(f.a.troops);
  });
  it('stops at actual entry, starts the attack clock there, then resumes within the same tick after killing the blocker',()=>{
    const f=fixture(),from=[...f.graph.cells.values()].find(c=>c.surface==='land'&&f.run.world.provinces.find(p=>p.id===c.provinceId)!.controller===f.a.nationId&&c.links.some(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.graph.cells.get(l.to)!.provinceId!==c.provinceId))!,edge=from.links.find(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.graph.cells.get(l.to)!.provinceId!==from.provinceId)!,to=f.graph.cells.get(edge.to)!;
    f.run.armyPositions.records[f.a.id]=beginArmyTravel47(f.a.id,[from.id,to.id],f.graph);
    f.run.armyPositions.records[f.b.id]=beginArmyTravel47(f.b.id,[to.id],f.graph);f.b.troops=1;
    const speed=Math.hypot(edge.gate.x-from.center.x,edge.gate.y-from.center.y)*4;
    const out=advanceMilitaryWindow47(f.run,21,weights,{speed:()=>speed,combat:()=>({...inputs,army:v=>({...inputs.army(),efficiency:v.id===f.a.id?1:0})})});
    expect(out.volleys.find(v=>v.due.includes(f.ak))!.at).toBe(20.25);expect(out.run.world.armies.find(a=>a.id===f.b.id)!.status).toBe('destroyed');
    const point=armyTravelLocation47(out.run.armyPositions.records[f.a.id],f.graph).point;
    expect(point).not.toEqual(edge.gate);expect(out.run.clock.tick).toBe(21);expect(out.run.forceContacts.pairs).toEqual([]);
  });
  it('captures an actually entered empty hostile land cell immediately, without waiting a combat timer',()=>{
    const f=fixture(),from=[...f.graph.cells.values()].find(c=>c.surface==='sea'&&c.links.some(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.run.world.provinces.find(p=>p.id===f.graph.cells.get(l.to)!.provinceId)!.controller!==f.a.nationId))!,edge=from.links.find(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.run.world.provinces.find(p=>p.id===f.graph.cells.get(l.to)!.provinceId)!.controller!==f.a.nationId)!,to=f.graph.cells.get(edge.to)!;
    f.b.troops=0;f.b.status='destroyed';f.run.tactics.unopposed='takeover';f.run.armyPositions.records[f.a.id]=beginArmyTravel47(f.a.id,[from.id,to.id],f.graph);
    const before=f.run.world.provinces.map(p=>p.controller),out=advanceMilitaryWindow47(f.run,1,weights,{...rules,speed:()=>Math.hypot(edge.gate.x-from.center.x,edge.gate.y-from.center.y)*4});
    expect(out.run.world.provinces.find(p=>p.id===to.provinceId)!.controller).toBe(f.a.nationId);expect(out.volleys).toEqual([]);
    expect(out.run.world.provinces.filter((p,i)=>p.controller!==before[i]).map(p=>p.id)).toEqual([to.provinceId]);
    expect(()=>assertOccupation(out.run.occupation,out.run.world,out.run.clock.tick)).not.toThrow();
  });
  it('does not let simultaneously dead holders lower resistance or change a land flag',()=>{
    const f=fixture(),cell=[...f.graph.cells.values()].find(c=>c.surface==='land'&&f.run.world.provinces.find(p=>p.id===c.provinceId)!.controller===f.b.nationId)!;
    for(const a of [f.a,f.b]){a.troops=1;f.run.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell.id],f.graph);}
    const waiting=advance(f.run,19).run,prior=waiting.occupation.sieges.find(s=>s.provinceId===cell.provinceId)!;
    // A valid already-damaged fort makes both skipped attack and skipped
    // repair observable; a fresh full fort is simply removed when abandoned.
    prior.resistance=prior.maximum*.6;const out=advance(waiting,1),siege=out.run.occupation.sieges.find(s=>s.provinceId===cell.provinceId)!;
    expect(out.volleys[0].hits).toBe(2);expect(out.run.world.provinces.find(p=>p.id===cell.provinceId)!.controller).toBe(f.b.nationId);expect(siege.resistance).toBe(prior.resistance);
  });
  it('also rolls back earlier empty-land ownership, economy and upper-core edits if a later battle fails',()=>{
    const f=fixture(),from=[...f.graph.cells.values()].find(c=>c.surface==='sea'&&c.links.some(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.run.world.provinces.find(p=>p.id===f.graph.cells.get(l.to)!.provinceId)!.controller!==f.a.nationId))!,edge=from.links.find(l=>f.graph.cells.get(l.to)!.surface==='land'&&f.run.world.provinces.find(p=>p.id===f.graph.cells.get(l.to)!.provinceId)!.controller!==f.a.nationId)!,to=f.graph.cells.get(edge.to)!;
    const battle=[...f.graph.cells.values()].find(c=>c.surface==='land'&&c.provinceId!==to.provinceId)!;
    const third=f.run.world.armies.find(a=>a.nationId!==f.b.nationId&&a.id!==f.a.id)!;third.status='idle';third.troops=10000;
    for(const a of [f.b,third])f.run.armyPositions.records[a.id]=beginArmyTravel47(a.id,[battle.id],f.graph);
    f.run.tactics.unopposed='takeover';f.run.armyPositions.records[f.a.id]=beginArmyTravel47(f.a.id,[from.id,to.id],f.graph);
    const before=structuredClone(f.run);let captured=false;
    expect(()=>advanceMilitaryWindow47(f.run,21,weights,{speed:()=>Math.hypot(edge.gate.x-from.center.x,edge.gate.y-from.center.y)*4,combat:r=>{captured=r.world.provinces.find(p=>p.id===to.provinceId)!.controller===f.a.nationId;throw Error('fixture after capture');}})).toThrow(/after capture/);
    expect(captured).toBe(true);expect(f.run).toEqual(before);
  });
  it('settles Navy hull, crew and ships, while keeping unrecovered Navy raw war callbacks absent',()=>{
    const f=fixture();for(const a of [f.a,f.b]){a.troops=0;a.status='destroyed';}
    for(const [i,a] of [f.a,f.b].entries()){const id='fixture-fleet-'+i;f.run.navy.fleets.push({id,name:id,nationId:a.nationId,ships:1,crew:12,food:2400,node:f.sea.face,route:[],progress:0,dockId:null,targetId:null,patrol:false,status:'anchored'});f.run.maritime.hulls[id]=30;f.run.fleetPositions.records[id]=beginArmyTravel47(id,[f.sea.id],f.graph);}
    const before=structuredClone(f.run.nativeWars),out=advance(f.run,20);
    expect(out.volleys[0].hits).toBe(2);expect(out.run.forceClock.draws).toBe(2);expect(out.run.navy.fleets.every(f=>f.status==='lost')).toBe(true);expect(out.run.nativeWars).toEqual(before);
    for(const n of [f.a.nationId,f.b.nationId])expect(out.run.losses.nations[n].total).toMatchObject({hull:30,crew:12,ships:1,combat:0});
  });
  it('leaves inherited fractional and multiple-enemy loss unassigned rather than crediting every campaign',()=>{
    const f=fixture();f.run.forceDamage.carry[f.bk]=.5;
    const out=advance(f.run,20);expect(out.run.losses.nations[f.b.nationId].unassigned.combat).toBe(400);
    const g=fixture(),third=g.run.world.armies.find(a=>a.nationId!==g.a.nationId&&a.nationId!==g.b.nationId)!;third.troops=20000;third.status='idle';g.run.armyPositions.records[third.id]=beginArmyTravel47(third.id,[g.sea.id],g.graph);
    const multi=advance(g.run,20);expect(multi.run.losses.nations[g.a.nationId].total.combat).toBe(400);expect(multi.run.losses.nations[g.a.nationId].unassigned.combat).toBe(400);
  });
  it('rolls back positions, deadlines, randomness and earlier damage after a later rule or accounting failure',()=>{
    const f=fixture(),before=structuredClone(f.run);let calls=0;
    expect(()=>advanceMilitaryWindow47(f.run,95,weights,{...rules,combat:()=>{if(++calls===2)throw Error('fixture late failure');return inputs;}})).toThrow(/late failure/);expect(f.run).toEqual(before);
    f.run.losses.nations[f.b.nationId].total.combat=Number.MAX_SAFE_INTEGER;const saved=structuredClone(f.run);
    expect(()=>advance(f.run,20)).toThrow(/安全范围/);expect(f.run).toEqual(saved);
  });
  it('rejects forged clock versions, stale/overdue/unknown deadlines and unsafe draw counters',()=>{
    const f=fixture();for(const change of [{version:2},{now:1},{basis:'future'},{deadlines:{[f.ak]:0}},{deadlines:{unknown:20}},{deadlines:{[f.ak]:Infinity}},{draws:-1}]) {
      const bad=structuredClone(f.run);Object.assign(bad.forceClock,change);const before=structuredClone(bad);expect(()=>advance(bad,1)).toThrow();expect(bad).toEqual(before);
    }
    const bad=structuredClone(f.run);bad.forceClock.draws=Number.MAX_SAFE_INTEGER;const before=structuredClone(bad);expect(()=>advance(bad,20)).toThrow(/上限/);expect(bad).toEqual(before);
  });
  it('returns a private day-boundary candidate and refuses another tick before daily settlement',()=>{
    const f=fixture();for(const rel of f.run.world.statecraft!.relations)rel.status='peace';f.run.clock.tick=119;f.run.forceClock.now=119;
    const out=advance(f.run,1);expect(out.dailyPending).toBe(true);expect(out.run.world.day).toBe(0);expect(()=>advance(out.run,1)).toThrow(/日结/);expect(()=>advance(f.run,2)).toThrow(/日界/);
  });
  it('validates the new damage ledger even in a peaceful interval without any due attacks',()=>{
    const f=fixture();for(const rel of f.run.world.statecraft!.relations)rel.status='peace';
    for(const change of [{version:2},{carry:4},{carry:{[f.ak]:1}},{losses:{unknown:1}}]) {
      const bad=structuredClone(f.run);Object.assign(bad.forceDamage,change);const before=structuredClone(bad);expect(()=>advance(bad,1)).toThrow(/战损/);expect(bad).toEqual(before);
    }
  });
});
