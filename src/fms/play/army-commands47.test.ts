import {beforeAll, describe, expect, it} from 'vitest';
import {War46Session} from './war46-session';
import type {War46Run} from './war46-model';
import {grid} from './fixture.test-support';
import {geographyBinding} from './war30-geography';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {initialArmyPositions47} from './army-presence47';
import {armySpatialFor47} from './army-geography47';
import {readArmySpace47} from './army-space47';
import {armyStamp47, previewArmyCommand47, applyArmyCommand47, advanceArmyMovement47, createArmyCommandSearch47,issueArmyOrderOwned47,type ArmyCommand47, type ArmyRouteWeights47} from './army-commands47';
import {createArmyEconomy47} from './war47-economy';
import {advanceTacticsOccupation47} from './war47-occupation';
import {initialOccupation} from './occupation';
import {context46} from './war46.test-support';
import {beginArmyTravel47} from './army-travel47-state';
import {advanceActualForces47, actualForces47, type ForceRun47} from './force-runtime47';
import {initialForceContacts47, forceKey47} from './force-motion47';
import {applyActualVolley47, initialForceDamage47} from './force-losses47';

const weights: ArmyRouteWeights47 = {preferPorts: false, portSeaFaces: new Set(), oceanRouteFaces: new Set()};
let base: War46Run;
beforeAll(() => {
  base = new War46Session().execute({type: 'create', terrain: grid((x, y) => y > 20 && y < 230 && (x > 20 && x < 105 || x > 145 && x < 230) ? 45 : 0), count: 4, cityCount: 24, relations: 'war'}).run as War46Run;
});
function fixture() {
  const old = structuredClone(base), graph = buildArmyTravelGraph47(old.terrain, old.world);
  const armyPositions = initialArmyPositions47(old.world.armies.map(a => ({armyId: a.id, provinceId: a.provinceId, point: old.world.provinces.find(p => p.id === a.provinceId)!.center})), graph, geographyBinding(old));
  const run = {...old, armyPositions};
  const army = run.world.armies[0], start = readArmySpace47(run.world, armySpatialFor47(run)).byArmy.get(army.id)!;
  const water = [...graph.cells.values()].filter(c => c.surface === 'sea').sort((a, b) => Math.hypot(a.center.x - start.point.x, a.center.y - start.point.y) - Math.hypot(b.center.x - start.point.x, b.center.y - start.point.y) || a.id - b.id)[0];
  const move: ArmyCommand47 = {type: 'army-move', armyId: army.id, kind: 'march', target: {kind: 'cell', id: water.id}};
  return {run, move, armyId: army.id, water};
}
const at = (r: ReturnType<typeof fixture>['run'], id: string) => readArmySpace47(r.world, armySpatialFor47(r)).byArmy.get(id)!;
const silent = () => {};

describe('Army47 intent preview and atomic confirmation', () => {
  it('shares searches only in the same owned phase and rejects reuse after an issued order',()=>{
    const {run,move,armyId}=fixture(),search=createArmyCommandSearch47(run,weights,armyId);
    for(const p of run.world.provinces.slice(0,8)){
      const action={...move,target:{kind:'province',id:p.id}} as ArmyCommand47;expect(previewArmyCommand47(run,action,weights,search)).toEqual(previewArmyCommand47(run,action,weights));
    }
    const before=structuredClone(run),preview=previewArmyCommand47(run,move,weights,search);expect(preview.valid).toBe(true);expect(run).toEqual(before);
    issueArmyOrderOwned47(run,move,weights,'autonomous',search);
    const newer={...move,target:{kind:'province',id:run.world.provinces[0].id}} as ArmyCommand47;
    expect(previewArmyCommand47(run,newer,weights,search).valid).toBe(false);
  });
  it('previews without mutation, then takes over the old route and plan without resetting identity or resources', () => {
    const {run, move, armyId} = fixture(), army = run.world.armies[0];
    army.route = [run.world.provinces.find(p => p.id !== army.provinceId)!.id]; army.progress = .3;
    run.battles.plans[armyId] = {path: [...army.route], targets: [...army.route]};
    const before = structuredClone(run), preview = previewArmyCommand47(run, move, weights);
    expect(preview.valid, preview.reason).toBe(true); expect(preview.hasSea).toBe(true); expect(run).toEqual(before);
    const next = applyArmyCommand47(run, move, preview.basedOn, weights), changed = next.world.armies[0];
    expect(run).toEqual(before); expect(changed).toEqual({...army, route: [], progress: 0, status: 'idle'});
    expect(next.battles.plans[armyId]).toBeUndefined(); expect(next.voyages.manualArmies).toContain(armyId);
    expect(next.world.nextEventId).toBe(run.world.nextEventId + 1); expect(next.armyPositions.revision).toBe(1);
    expect(at(next, armyId).point).toEqual(at(run, armyId).point);
  });
  it.each(['runId', 'day', 'nextEventId', 'tick', 'positionsRevision', 'binding'] as const)('rejects a stale %s without any partial world/route/event change', field => {
    const {run, move} = fixture(), expected = armyStamp47(run), before = structuredClone(run);
    if (field === 'runId' || field === 'binding') expected[field] += '-stale'; else expected[field]++;
    expect(() => applyArmyCommand47(run, move, expected, weights)).toThrow(/过期/); expect(run).toEqual(before);
  });
  it('rejects replay, unknown intent fields, and exhausted position/voyage/event revisions', () => {
    const {run, move} = fixture(), stamp = armyStamp47(run), next = applyArmyCommand47(run, move, stamp, weights), saved = structuredClone(next);
    expect(() => applyArmyCommand47(next, move, stamp, weights)).toThrow(/过期/); expect(next).toEqual(saved);
    expect(previewArmyCommand47(run, {...move, nodes: [0, 1]} as ArmyCommand47, weights).valid).toBe(false);
    for (const key of ['positions', 'voyages', 'events']) {
      const bad = structuredClone(run);
      if (key === 'positions') bad.armyPositions.revision = Number.MAX_SAFE_INTEGER;
      if (key === 'voyages') bad.voyages.revision = Number.MAX_SAFE_INTEGER;
      if (key === 'events') bad.world.nextEventId = Number.MAX_SAFE_INTEGER;
      const before = structuredClone(bad); expect(() => applyArmyCommand47(bad, move, armyStamp47(bad), weights)).toThrow(); expect(bad).toEqual(before);
    }
  });
  it('same-cell redirect preserves the exact point, consumes a revision, and cannot be replayed', () => {
    const f = fixture(); let run = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    run = advanceArmyMovement47(run, .1, () => 1, weights); const before = at(run, f.armyId);
    const move: ArmyCommand47 = {...f.move, target: {kind: 'cell', id: before.travel.nodes[before.travel.leg]}};
    const preview = previewArmyCommand47(run, move, weights), next = applyArmyCommand47(run, move, preview.basedOn, weights);
    expect(preview.points).toEqual([before.point]); expect(preview.distance).toBe(0); expect(at(next, f.armyId).point).toEqual(before.point);
    expect(next.armyPositions.records[f.armyId].status).toBe('arrived'); expect(next.armyPositions.revision).toBe(run.armyPositions.revision + 1);
    expect(() => applyArmyCommand47(next, move, preview.basedOn, weights)).toThrow(/过期/);
  });
  it('halt is a real command and cannot be used to escape active contacts', () => {
    const f = fixture(), moving = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    const stepped = advanceArmyMovement47(moving, .1, () => 1, weights), halt: ArmyCommand47 = {type: 'army-halt', armyId: f.armyId};
    const stopped = applyArmyCommand47(stepped, halt, armyStamp47(stepped), weights);
    expect(at(stopped, f.armyId).point).toEqual(at(stepped, f.armyId).point); expect(stopped.armyPositions.records[f.armyId].status).toBe('halted');
    expect(previewArmyCommand47(stopped, halt, weights).valid).toBe(false);
    for (const kind of ['status', 'contact']) {
      const engaged = structuredClone(stepped);
      if (kind === 'status') engaged.world.armies[0].status = 'fighting';
      else engaged.battles.engagements.push({id: 'test-contact', a: engaged.world.armies[0].provinceId, b: null, t: 0, armies: [f.armyId], started: 0, pulse: 0, carry: {}, losses: {}});
      const before = structuredClone(engaged);
      expect(() => applyArmyCommand47(engaged, halt, armyStamp47(engaged), weights)).toThrow(/交锋/);
      expect(() => applyArmyCommand47(engaged, f.move, armyStamp47(engaged), weights)).toThrow(/交锋/); expect(engaged).toEqual(before);
    }
  });
  it.each(['assembling', 'returning'] as const)('cancels a %s mission and releases its existing fleet without teleporting or changing its sea leg', phase => {
    const f = fixture();
    const nationId = f.run.world.armies[0].nationId;
    // This small generated world need not contain an initial fleet. Seed an
    // existing synthetic vessel on two actual adjacent sea faces explicitly.
    const graph = armySpatialFor47(f.run).graph;
    const link = f.water.links.find(l => graph.cells.get(l.to)!.surface === 'sea')!;
    const fleet: War46Run['navy']['fleets'][number] = {id: 'fixture-fleet', name: '试航舰队', nationId, ships: 4, crew: 200, food: 90, node: f.water.face, route: [graph.cells.get(link.to)!.face], progress: .3, dockId: null, targetId: null, patrol: false, status: 'sailing'};
    f.run.navy.fleets = [fleet];
    f.run.voyages.missions[nationId] = {armyId: f.armyId, fleetId: fleet.id, fromPortId: 'fixture-from', toPortId: 'fixture-to', phase, startedTick: 0};
    const before = structuredClone(fleet), next = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    expect(next.voyages.missions[nationId]).toBeUndefined(); expect(next.navy.fleets[0]).toEqual({...before, patrol: true}); expect(f.run.navy.fleets[0]).toEqual(before);
  });
  it.each(['halt', 'same-cell', 'arrival'] as const)('retains retreat identity at sea after %s, then ends it only on safe land', stop => {
    const f = fixture(), entered = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    let run = advanceArmyMovement47(entered, 100000, () => 1, weights);
    const graph = armySpatialFor47(run).graph, link = f.water.links.find(l => graph.cells.get(l.to)!.surface === 'sea')!;
    const retreat: ArmyCommand47 = {...f.move, kind: 'retreat', target: {kind: 'cell', id: link.to}};
    run = applyArmyCommand47(run, retreat, armyStamp47(run), weights);
    if (stop === 'arrival') run = advanceArmyMovement47(run, 100000, () => 1, weights);
    else {
      run = advanceArmyMovement47(run, .1, () => 1, weights);
      const cell = armySpatialFor47(run).graph.cells.get(at(run, f.armyId).travel.nodes[at(run, f.armyId).travel.leg])!;
      const command: ArmyCommand47 = stop === 'halt' ? {type: 'army-halt', armyId: f.armyId} : {...retreat, target: {kind: 'cell', id: cell.id}};
      const before = at(run, f.armyId).point;
      run = applyArmyCommand47(run, command, armyStamp47(run), weights);
      expect(at(run, f.armyId).point).toEqual(before);
    }
    expect(at(run, f.armyId).province).toBeNull(); expect(run.world.armies[0].status).toBe('retreating');
    const home = {kind: 'province' as const, id: f.run.world.armies[0].provinceId};
    expect(previewArmyCommand47(run, {...f.move, target: home}, weights).valid).toBe(false);
    run = applyArmyCommand47(run, {...retreat, target: home}, armyStamp47(run), weights);
    run = advanceArmyMovement47(run, 100000, () => 1, weights);
    expect(at(run, f.armyId).province!.id).toBe(home.id); expect(run.world.armies[0].status).toBe('idle');
    expect(previewArmyCommand47(run, f.move, weights).valid).toBe(true);
  });
  it('allows a direct new order when a retreating army is already on actual safe land', () => {
    const f = fixture(); f.run.world.armies[0].status = 'retreating';
    expect(previewArmyCommand47(f.run, f.move, weights).valid).toBe(true);
    const next = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    expect(next.world.armies[0].status).toBe('idle');
  });
  it('does not accept a changed real terrain with the same IDs as the bound preview', () => {
    const {run, move} = fixture(), stamp = armyStamp47(run), changed = structuredClone(run);
    changed.terrain.elevations[0] += 1;
    const before = structuredClone(changed); expect(() => applyArmyCommand47(changed, move, stamp, weights)).toThrow(/地形/); expect(changed).toEqual(before);
  });
});

describe('Army47 continuous movement transaction', () => {
  it('moves to real sea without a transport fleet, halts/reloads there, and never draws a detour through its old center', () => {
    const f = fixture(); f.run.navy.fleets = [];
    const entered = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights), sailing = advanceArmyMovement47(entered, 100000, () => 1, weights);
    expect(at(sailing, f.armyId).province).toBeNull(); expect(at(sailing, f.armyId).point).toEqual(f.water.center);
    expect(sailing.world.armies.map(a => a.id)).toEqual(f.run.world.armies.map(a => a.id)); expect(sailing.transports.cargo).toHaveLength(0);
    const restored = {...sailing, armyPositions: JSON.parse(JSON.stringify(sailing.armyPositions))};
    const landId = f.run.world.armies[0].provinceId;
    const back: ArmyCommand47 = {...f.move, target: {kind: 'province', id: landId}};
    const p = previewArmyCommand47(restored, back, weights); expect(p.valid, p.reason).toBe(true); expect(p.points[0]).toEqual(f.water.center);
    const beforeFood = restored.world.armies[0].supplies, food = createArmyEconomy47(restored.finance, () => armySpatialFor47(restored)); food.advanceEconomy(restored.world, silent);
    expect(restored.world.armies[0].supplies).toBe(beforeFood - 4);
    const returning = applyArmyCommand47(restored, back, armyStamp47(restored), weights), arrived = advanceArmyMovement47(returning, 100000, () => 1, weights);
    expect(at(arrived, f.armyId).province!.id).toBe(landId);
    const before = arrived.world.armies[0].supplies; createArmyEconomy47(arrived.finance, () => armySpatialFor47(arrived)).advanceEconomy(arrived.world, silent); expect(arrived.world.armies[0].supplies).toBeGreaterThan(before - 4);
  });
  it('rolls back every army when a later movement callback throws or produces NaN', () => {
    const f = fixture(); let run = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    const other = run.world.armies.find(a => a.id !== f.armyId)!;
    const second: ArmyCommand47 = {...f.move, armyId: other.id}; run = applyArmyCommand47(run, second, armyStamp47(run), weights);
    const ids = [f.armyId, other.id].sort(), before = structuredClone(run);
    for (const kind of ['throw', 'nan']) {
      expect(() => advanceArmyMovement47(run, 5, (candidate, a) => {candidate.clock.tick++; if (a.id === ids[1]) {if (kind === 'throw') throw Error('fixture speed failure'); return NaN;} return 1;}, weights)).toThrow();
      expect(run).toEqual(before);
    }
  });
  it('returns an isolated candidate for the remaining clock/economy phases, including extra run fields', () => {
    const f = fixture(), moving = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights), before = structuredClone(moving);
    const next = advanceArmyMovement47(moving, .1, () => 1, weights);
    next.clock.tick++; next.finance.nations[next.world.nations[0].id].gold--;
    next.vassals.revision++; next.voyages.revision++;
    expect(moving).toEqual(before); expect(next.clock).not.toBe(moving.clock); expect(next.transports).not.toBe(moving.transports);
  });
  it('rechecks changed diplomatic access before entry and keeps the actual location through stopped JSON recovery', () => {
    const f = fixture(), target = f.run.world.provinces.find(p => p.controller !== f.run.world.armies[0].nationId)!;
    const move: ArmyCommand47 = {...f.move, target: {kind: 'province', id: target.id}};
    let run = applyArmyCommand47(f.run, move, armyStamp47(f.run), weights);
    for (const rel of run.world.statecraft!.relations) rel.status = 'peace';
    run = advanceArmyMovement47(run, 100000, () => 1, weights);
    expect(run.armyPositions.records[f.armyId].status).toBe('blocked'); expect(at(run, f.armyId).province?.controller).not.toBe(target.controller);
    const restored = {...run, armyPositions: JSON.parse(JSON.stringify(run.armyPositions))}, before = at(restored, f.armyId).point;
    const stopped = applyArmyCommand47(restored, {type: 'army-halt', armyId: f.armyId}, armyStamp47(restored), weights);
    expect(at(stopped, f.armyId).point).toEqual(before); expect(previewArmyCommand47(stopped, move, weights).valid).toBe(false);
  });
  it('restricts reorganizing units from sea paths while retaining ordinary land orders', () => {
    const f = fixture(); f.run.reorganization.active[f.armyId] = {startedTick: 0, fraction: 0};
    expect(previewArmyCommand47(f.run, f.move, weights).valid).toBe(false);
    const army = f.run.world.armies[0], target = f.run.world.provinces.find(p => p.id !== army.provinceId && p.controller === army.nationId)!;
    const land: ArmyCommand47 = {...f.move, target: {kind: 'province', id: target.id}};
    expect(previewArmyCommand47(f.run, land, weights).valid).toBe(true);
  });
  it('links the confirmed real movement to one empty-land capture, not to the stale compatibility anchor', () => {
    const f = fixture(), a = f.run.world.armies[0], target = f.run.world.provinces.find(p => p.controller !== a.nationId && (p.center.x < 500) !== (at(f.run, a.id).point.x < 500))!;
    expect(target).toBeDefined();
    for (const other of f.run.world.armies) if (other.id !== a.id && other.provinceId === target.id) {other.status = 'destroyed'; other.troops = 0;}
    const move: ArmyCommand47 = {...f.move, target: {kind: 'province', id: target.id}}, marching = applyArmyCommand47(f.run, move, armyStamp47(f.run), weights);
    const landed = advanceArmyMovement47(marching, 100000, () => 1, weights), before = structuredClone(landed.world);
    expect(at(landed, a.id).province!.id).toBe(target.id); expect(landed.world.armies[0].provinceId).toBe(a.provinceId);
    const out = advanceTacticsOccupation47(landed.world, initialOccupation(), landed.units, 1, new Set(), 'takeover', context46(landed), armySpatialFor47(landed));
    expect(out.world.provinces.find(p => p.id === target.id)!.controller).toBe(a.nationId); expect(landed.world).toEqual(before);
    expect(out.world.provinces.filter((p, i) => p.controller !== before.provinces[i].controller).map(p => p.id)).toEqual([target.id]);
  });
  it('rejects exhausted revisions and invalid elapsed time before any movement', () => {
    const f = fixture(), r = applyArmyCommand47(f.run, f.move, armyStamp47(f.run), weights);
    for (const seconds of [0, -1, NaN, Infinity]) {const before = structuredClone(r); expect(() => advanceArmyMovement47(r, seconds, () => 1, weights)).toThrow(); expect(r).toEqual(before);}
    r.armyPositions.revision = Number.MAX_SAFE_INTEGER; const before = structuredClone(r); expect(() => advanceArmyMovement47(r, 1, () => 1, weights)).toThrow(); expect(r).toEqual(before);
  });
});

function forceFixture() {
  const f = fixture(); f.run.navy.fleets = []; f.run.maritime.hulls = {};
  const run = {...f.run, fleetPositions: {version: 1 as const, binding: f.run.armyPositions.binding, revision: 0, records: {} as ForceRun47['fleetPositions']['records']}, forceContacts: initialForceContacts47(), forceDamage: initialForceDamage47()};
  return {...f, run};
}
function seaBattleFixture() {
  const f = forceFixture(), graph = armySpatialFor47(f.run).graph;
  const a = f.run.world.armies[0], b = f.run.world.armies.find(b => b.nationId !== a.nationId)!;
  for (const army of [a,b]) {army.troops = 10000; f.run.armyPositions.records[army.id] = beginArmyTravel47(army.id,[f.water.id],graph);}
  f.run.units = {...f.run.units, [b.id]: 'Elite'};
  for (const [i,army] of [a,b].entries()) {
    const id = 'sea-fixture-' + i;
    f.run.navy.fleets.push({id,name:id,nationId:army.nationId,ships:1,crew:40,food:2400,node:f.water.face,route:[],progress:0,dockId:null,targetId:null,patrol:false,status:'anchored'});
    f.run.maritime.hulls[id] = 100; f.run.fleetPositions.records[id] = beginArmyTravel47(id,[f.water.id],graph);
  }
  const run = advanceActualForces47(f.run,1,weights,()=>1).run;
  return {...f,run,aId:a.id,bId:b.id};
}
const combatInputs = {navyCountToHull:1, army:()=>({efficiency:1,damageToArmy:40,multiplier:1}), navy:()=>({destiny:30,maritime:false,livingLeaderModifier:null})};
describe('actual-world Army/Fleet contact and loss transactions', () => {
  it('connects a confirmed real command to a persistent encountered defender before completing the destination', () => {
    const f = forceFixture(), enemy = f.run.world.armies.find(a => a.nationId !== f.run.world.armies[0].nationId)!;
    const action: ArmyCommand47 = {...f.move,target:{kind:'province',id:enemy.provinceId}};
    const ordered = applyArmyCommand47(f.run,action,armyStamp47(f.run),weights), before = structuredClone(ordered);
    const stopped = advanceActualForces47(ordered,100000,weights,()=>1).run;
    expect(ordered).toEqual(before); expect(stopped.forceContacts.pairs.length).toBeGreaterThan(0);
    expect(stopped.world.armies.find(a=>a.id===f.armyId)!.status).toBe('fighting');
    expect(stopped.armyPositions.records[f.armyId].status).not.toBe('arrived');
    expect(previewArmyCommand47(stopped,{type:'army-halt',armyId:f.armyId},weights).valid).toBe(false);
    const restored = {...stopped,forceContacts:JSON.parse(JSON.stringify(stopped.forceContacts)),armyPositions:JSON.parse(JSON.stringify(stopped.armyPositions))};
    const again = advanceActualForces47(restored,1,weights,()=>1).run;
    expect(at(again,f.armyId).point).toEqual(at(stopped,f.armyId).point);
  });
  it('applies both native Navy budgets to real sea Army/Fleet once, preserves identities and ignores Army elite discount', () => {
    const f = seaBattleFixture(), before = structuredClone(f.run), due = new Set(f.run.navy.fleets.map(v=>forceKey47({kind:'fleet',id:v.id})));
    const result = applyActualVolley47(f.run,due,combatInputs);
    expect(f.run).toEqual(before); expect(result.nativeHits).toHaveLength(4);
    expect(result.run.world.armies.find(a=>a.id===f.aId)!.troops).toBe(6800); expect(result.run.world.armies.find(a=>a.id===f.bId)!.troops).toBe(6800);
    expect(Object.values(result.run.maritime.hulls)).toEqual([60,60]); expect(result.run.navy.fleets.map(f=>f.crew)).toEqual([24,24]);
    expect(result.run.world.armies.map(a=>a.id)).toEqual(f.run.world.armies.map(a=>a.id)); expect(result.run.transports.cargo).toHaveLength(0);
  });
  it('settles simultaneous sinking and old cargo loss without killing nearby independent Army or cloning passengers', () => {
    const f = seaBattleFixture(), carrier = f.run.navy.fleets[0];
    for(const navy of f.run.navy.fleets){f.run.maritime.hulls[navy.id]=30;navy.crew=12;}
    f.run.maritime.retreating[carrier.id] = f.run.clock.tick + 120;
    const passenger = {...f.run.world.armies[0],id:'fixture-passenger',troops:500};
    f.run.transports.cargo.push({fleetId:carrier.id,army:passenger,unit:'Infantry',fromPortId:'fixture-port',targetPortId:null});
    const due = new Set(f.run.navy.fleets.map(v=>forceKey47({kind:'fleet',id:v.id})));
    const result = applyActualVolley47(f.run,due,combatInputs);
    expect(result.run.navy.fleets.every(f=>f.status==='lost')).toBe(true); expect(result.run.transports.cargo).toHaveLength(0);
    expect(result.run.maritime.retreating).toEqual({});
    expect(result.run.world.armies.filter(a=>a.id===passenger.id)).toHaveLength(1); expect(result.run.world.armies.find(a=>a.id===passenger.id)!.status).toBe('destroyed');
    expect(result.run.world.armies.find(a=>a.id===f.aId)!.troops).toBe(6800); expect(result.run.world.armies.find(a=>a.id===f.bId)!.troops).toBe(6800);
    expect(result.casualties.filter(c=>c.cargo>0).map(c=>c.cargo)).toEqual([500]);
    expect(()=>actualForces47(result.run)).not.toThrow();
  });
  it('rejects unconverted sea or road contacts in either phase without touching the source run', () => {
    for (const kind of ['sea', 'road']) {
      const f = seaBattleFixture();
      if (kind === 'sea') f.run.maritime.contacts.push({a:f.run.navy.fleets[0].id,b:f.run.navy.fleets[1].id,started:0,pulse:0});
      else f.run.battles.engagements.push({} as typeof f.run.battles.engagements[number]);
      const before = structuredClone(f.run);
      expect(()=>advanceActualForces47(f.run,1,weights,()=>1)).toThrow(/尚未明确转换/);
      expect(()=>applyActualVolley47(f.run,new Set(),combatInputs)).toThrow(/尚未明确转换/);
      expect(f.run).toEqual(before);
    }
  });
  it('rejects missing, nonfinite, negative or mismatched hulls and land-bound lost fleets', () => {
    const f = seaBattleFixture(), id = f.run.navy.fleets[0].id;
    for (const value of [undefined,NaN,Infinity,-1,0,101,.5]) {
      const run = structuredClone(f.run);
      if (value === undefined) delete run.maritime.hulls[id]; else run.maritime.hulls[id] = value;
      const before = structuredClone(run);
      expect(()=>advanceActualForces47(run,1,weights,()=>1)).toThrow();
      expect(()=>applyActualVolley47(run,new Set(),combatInputs)).toThrow(); expect(run).toEqual(before);
    }
    const run = structuredClone(f.run), graph = armySpatialFor47(run).graph, land = [...graph.cells.values()].find(c=>c.surface==='land')!;
    run.navy.fleets[0].status='lost';run.maritime.hulls[id]=0;
    run.fleetPositions.records[id]=beginArmyTravel47(id,[land.id],graph);
    expect(()=>actualForces47(run)).toThrow(/陆地/);
  });
  it('clears a defeated endpoint and releases the surviving Army without moving either record', () => {
    const f = seaBattleFixture(), attacker = f.run.world.armies.find(a=>a.id===f.aId)!, victim = f.run.world.armies.find(a=>a.id===f.bId)!;
    f.run.navy.fleets=[];f.run.maritime.hulls={};f.run.fleetPositions.records={};f.run.forceContacts=initialForceContacts47();
    victim.troops=1;
    const engaged=advanceActualForces47(f.run,1,weights,()=>1).run, before=at(engaged,attacker.id).point;
    expect(engaged.world.armies.find(a=>a.id===attacker.id)!.status).toBe('fighting');
    const result=applyActualVolley47(engaged,new Set([forceKey47({kind:'army',id:attacker.id})]),combatInputs);
    expect(result.run.world.armies.find(a=>a.id===victim.id)!.status).toBe('destroyed');
    expect(result.run.world.armies.find(a=>a.id===attacker.id)!.status).toBe('idle');
    expect(result.run.forceContacts.pairs).toHaveLength(0);expect(at(result.run,attacker.id).point).toEqual(before);
  });
  it('preserves fractional Army losses through JSON and rejects a late overflow without partial deductions', () => {
    const f = seaBattleFixture(), key = forceKey47({kind:'army',id:f.aId}), due = new Set([key]);
    const inputs = {...combatInputs,army:()=>({efficiency:.001,damageToArmy:40,multiplier:1})};
    let run = applyActualVolley47(f.run,due,inputs).run;
    const victim = forceKey47({kind:'army',id:f.bId}); expect(run.forceDamage.carry[victim]).toBeGreaterThan(0);
    run = {...run,forceDamage:JSON.parse(JSON.stringify(run.forceDamage))};
    expect(applyActualVolley47(run,due,inputs).run.forceDamage.carry[victim]).toBeGreaterThan(run.forceDamage.carry[victim]);
    const before = structuredClone(f.run), fleets = new Set(f.run.navy.fleets.map(v=>forceKey47({kind:'fleet',id:v.id})));
    expect(()=>applyActualVolley47(f.run,fleets,{...combatInputs,navyCountToHull:Number.MAX_VALUE})).toThrow(/溢出/); expect(f.run).toEqual(before);
  });
});
