import {describe, it, expect} from 'vitest';
import {spatialFixture47} from './army-spatial47.test-support';
import {advanceArmyTravel47, beginArmyTravel47, haltArmyTravel47, type ArmyTravel47} from './army-travel47-state';
import {readArmySpace47} from './army-space47';
import {createArmyEconomy47} from './war47-economy';
import {advanceTacticsOccupation47, dueCombatRounds47, occupationForces47} from './war47-occupation';
import {initialOccupation, resistanceCapacity, type OccupationState} from './occupation';
import {createFiscalFood} from './war29-food';
import type {World} from '../../sim/types';

type Fixture = ReturnType<typeof spatialFixture47>;
function toSea(f: Fixture, status: ArmyTravel47['status'] = 'moving', id = 'army-a') {
  const nodes = id === 'army-a' ? [0, 1, 2] : [2, 1, 0], g = f.spatial.graph;
  let travel = advanceArmyTravel47(beginArmyTravel47(id, nodes, g), g, 12, () => 1, () => true).travel;
  if (status === 'halted') travel = haltArmyTravel47(travel, g);
  if (status === 'arrived') travel = advanceArmyTravel47(beginArmyTravel47(id, nodes.slice(0, 2), g), g, 30, () => 1, () => true).travel;
  if (status === 'blocked') travel = advanceArmyTravel47(travel, g, 100, () => 1, c => c.surface === 'sea').travel;
  f.spatial.positions.records[id] = travel; f.spatial.positions.revision++;
}
function occupation(f: Fixture, state = initialOccupation(), due = new Set<string>()) {
  return advanceTacticsOccupation47(f.world, state, f.units, 1, due, f.tactics.unopposed, f.context, f.spatial);
}
function balances(world: World) {
  for (const n of world.statecraft!.nations) {
    const l = n.lastLedger!;
    expect(l.openingGrain + l.production - l.civilianConsumed - l.militaryConsumed + l.territoryTransfer).toBe(l.closingGrain);
  }
}
const silent = () => {};

describe('v47 actual-position economic consumers', () => {
  it.each(['moving', 'halted', 'arrived', 'blocked'] as const)('%s at sea consumes carried food, counts nationally, and cannot refill from the stale friendly shore', status => {
    const f = spatialFixture47(); toSea(f, status);
    const {world: w, spatial, context} = f, ids = w.armies.map(a => a.id), ledger = structuredClone(spatial.positions);
    const food = createArmyEconomy47(context.finance, () => spatial), need = status === 'moving' || status === 'blocked' ? 6 : 4;
    const report = food.buildNationReports(w).find(n => n.nationId === 'a')!;
    expect(report.armyCount).toBe(1); expect(report.militaryNeedPerDay).toBe(need * 10); expect(report.productionPerDay).toBe(1120);
    food.advanceEconomy(w, silent);
    expect(w.armies[0].supplies).toBe(50 - need); expect(w.statecraft!.nations[0].lastLedger!.militaryConsumed).toBe(0);
    expect(w.armies.map(a => a.id)).toEqual(ids); expect(w.armies[0].provinceId).toBe('home'); expect(spatial.positions).toEqual(ledger); balances(w);
  });
  it('sea enemies do not cut farm production or block the actual defending garrison refill', () => {
    const f = spatialFixture47(); toSea(f); f.world.armies[0].provinceId = 'far';
    const food = createArmyEconomy47(f.context.finance, () => f.spatial);
    expect(food.buildNationReports(f.world).find(n => n.nationId === 'b')!.productionPerDay).toBe(1120);
    food.advanceEconomy(f.world, silent);
    expect(f.world.armies[1].supplies).toBe(66); expect(f.world.statecraft!.nations[1].lastLedger!.production).toBe(1120); balances(f.world);
  });
  it('real landed hostile presence reduces production and prevents defender resupply regardless of old anchor/progress', () => {
    const f = spatialFixture47(); toSea(f);
    f.spatial.positions.records['army-a'] = advanceArmyTravel47(f.spatial.positions.records['army-a'], f.spatial.graph, 4, () => 1, () => true).travel;
    f.world.armies[0].progress = .8;
    const food = createArmyEconomy47(f.context.finance, () => f.spatial);
    expect(readArmySpace47(f.world, f.spatial).byArmy.get('army-a')!.province!.id).toBe('far');
    expect(food.buildNationReports(f.world).find(n => n.nationId === 'b')!.productionPerDay).toBe(560);
    food.advanceEconomy(f.world, silent); expect(f.world.armies[0].supplies).toBe(44); expect(f.world.armies[1].supplies).toBe(46); balances(f.world);
  });
  it('preserves ordinary stationary-land economy exactly against frozen v29 consumption and reports', () => {
    const f = spatialFixture47(), old = structuredClone(f.world), fresh = structuredClone(f.world);
    const oldFood = createFiscalFood(f.context.finance), food = createArmyEconomy47(f.context.finance, () => f.spatial);
    oldFood.advanceEconomy(old, silent); food.advanceEconomy(fresh, silent);
    expect(fresh).toEqual(old); expect(food.buildNationReports(fresh)).toEqual(oldFood.buildNationReports(old));
  });
  it('resolves cloned world references, ignores destroyed membership, and rejects binding/cargo/roster before a debit', () => {
    const f = spatialFixture47(); toSea(f); const original = structuredClone(f.world), copy = structuredClone(f.world);
    const food = createArmyEconomy47(f.context.finance, () => f.spatial); food.advanceEconomy(copy, silent);
    expect(f.world).toEqual(original); expect(copy.armies[0].supplies).toBe(44);
    f.world.armies[0].status = 'destroyed'; const carried = f.world.armies[0].supplies;
    food.advanceEconomy(f.world, silent); expect(f.world.armies[0].supplies).toBe(carried); expect(food.buildNationReports(f.world)[0].armyCount).toBe(0);
    for (const invalid of [{...f.spatial, binding: 'other-world'}, {...f.spatial, cargoIds: ['army-a']}, {...f.spatial, positions: {...f.spatial.positions, records: {}}}]) {
      const before = structuredClone(f.world);
      expect(() => createArmyEconomy47(f.context.finance, () => invalid).advanceEconomy(f.world, silent)).toThrow(); expect(f.world).toEqual(before);
      const contextBefore = structuredClone(f.context);
      expect(() => advanceTacticsOccupation47(f.world, initialOccupation(), f.units, 1, new Set(), 'takeover', f.context, invalid)).toThrow();
      expect(f.world).toEqual(before); expect(f.context).toEqual(contextBefore);
    }
  });
});

describe('v47 actual-position resistance and land capture', () => {
  it.each(['moving', 'halted', 'arrived', 'blocked'] as const)('%s sea army cannot attack/occupy its stale enemy land anchor', status => {
    const f = spatialFixture47(); toSea(f, status); f.world.armies[0].provinceId = 'far'; f.world.armies[1].status = 'destroyed';
    const before = structuredClone(f.world), out = occupation(f);
    expect(out.world.provinces.map(p => p.controller)).toEqual(['a', 'b']); expect(out.occupation.sieges).toEqual([]); expect(f.world).toEqual(before);
    expect(occupationForces47(f.world, 'far', f.units, f.spatial, f.context)).toEqual({attacker: null, attack: 0, defense: 0});
    f.tactics.rounds['army-a'] = 1;
    expect(dueCombatRounds47(f.world, f.tactics, 1, initialOccupation(), f.spatial, new Set()).size).toBe(0); expect(f.tactics.rounds).toEqual({});
  });
  it('sea combat uses the explicit real face conflict, without damaging any land resistance', () => {
    const f = spatialFixture47(); toSea(f); f.world.armies[0].provinceId = 'far'; f.tactics.rounds['army-a'] = 1;
    const due = dueCombatRounds47(f.world, f.tactics, 1, initialOccupation(), f.spatial, new Set([1]));
    expect(due.has('army-a')).toBe(true); expect(f.tactics.rounds['army-a']).toBeGreaterThan(1);
    const nextRound = f.tactics.rounds['army-a'];
    expect(dueCombatRounds47(f.world, f.tactics, 2, initialOccupation(), f.spatial, new Set([1])).has('army-a')).toBe(false);
    expect(f.tactics.rounds['army-a']).toBe(nextRound); expect(occupation(f, initialOccupation(), due).occupation.sieges).toEqual([]);
  });
  it('a stale fighting status at sea cannot keep a ghost land combat timer alive', () => {
    const f = spatialFixture47(); toSea(f); f.world.armies[0].provinceId = 'far'; f.world.armies[0].status = 'fighting'; f.tactics.rounds['army-a'] = 1;
    expect(dueCombatRounds47(f.world, f.tactics, 1, initialOccupation(), f.spatial, new Set()).has('army-a')).toBe(false);
    expect(f.tactics.rounds['army-a']).toBeUndefined(); expect(occupation(f).occupation.sieges).toEqual([]);
    createArmyEconomy47(f.context.finance, () => f.spatial).advanceEconomy(f.world, silent);
    expect(f.world.armies[0].supplies).toBe(42); balances(f.world);
  });
  it('stops at revoked landing access, then captures only the actually entered empty province and refills there', () => {
    const f = spatialFixture47(); toSea(f, 'blocked'); f.world.armies[1].status = 'destroyed';
    const oldWorld = structuredClone(f.world); expect(occupation(f).world.provinces[1].controller).toBe('b');
    // Save-shaped JSON roundtrip retains the pre-entry sea identity.
    f.spatial.positions = JSON.parse(JSON.stringify(f.spatial.positions));
    const saved = structuredClone(f.spatial.positions);
    f.spatial.positions.records['army-a'] = advanceArmyTravel47(saved.records['army-a'], f.spatial.graph, 1, () => 1, () => true).travel;
    f.world.armies[0].progress = .7;
    const landing = occupation(f); expect(landing.world.provinces.map(p => p.controller)).toEqual(['a', 'a']); expect(landing.world.events.filter(e => e.kind === 'occupation')).toHaveLength(1);
    expect(f.world.provinces).toEqual(oldWorld.provinces); expect(f.spatial.positions.records['army-a'].status).toBe('moving');
    f.world = landing.world;
    const food = createArmyEconomy47(f.context.finance, () => f.spatial); food.advanceEconomy(f.world, silent); expect(f.world.armies[0].supplies).toBe(44);
    f.spatial.positions.records['army-a'] = advanceArmyTravel47(f.spatial.positions.records['army-a'], f.spatial.graph, 10, () => 1, () => true).travel;
    // Only far has grain; the old friendly anchor cannot serve as a fallback.
    f.world.statecraft!.provinces[0].grain = 0; f.context.finance.provinces.home.maxPopulation = 0;
    food.advanceEconomy(f.world, silent); expect(f.world.armies[0].supplies).toBe(60); expect(f.world.armies[0].provinceId).toBe('home'); balances(f.world);
  });
  it('distinguishes the same coast coordinate before and after entry, including a zero-speed land step', () => {
    const f = spatialFixture47(); toSea(f, 'blocked'); f.world.armies[1].status = 'destroyed';
    const before = readArmySpace47(f.world, f.spatial).byArmy.get('army-a')!;
    expect(before.point).toEqual({x: 20, y: 5}); expect(before.province).toBeNull();
    expect(occupation(f).world.provinces[1].controller).toBe('b');
    f.spatial.positions.records['army-a'] = advanceArmyTravel47(f.spatial.positions.records['army-a'], f.spatial.graph, 1, c => c.surface === 'land' ? 0 : 1, () => true).travel;
    f.spatial.positions = JSON.parse(JSON.stringify(f.spatial.positions));
    const after = readArmySpace47(f.world, f.spatial).byArmy.get('army-a')!;
    expect(after.point).toEqual(before.point); expect(after.province!.id).toBe('far');
    expect(occupation(f).world.provinces[1].controller).toBe('a');
  });
  it('does not let a sea defender repair an abandoned siege; actual returned defender does repair it', () => {
    const f = spatialFixture47(); toSea(f, 'halted', 'army-b'); f.world.armies[0].status = 'destroyed';
    const p = f.world.provinces[1], maximum = resistanceCapacity(f.world, p);
    const state: OccupationState = {version: 1, sieges: [{provinceId: p.id, controller: 'b', attacker: 'a', maximum, resistance: maximum / 2, started: 0, pulse: 0}]};
    const out = occupation(f, state, new Set(['army-b'])); expect(out.occupation.sieges[0].resistance).toBe(maximum / 2);
    f.spatial.positions.records['army-b'] = beginArmyTravel47('army-b', [2], f.spatial.graph);
    const repaired = occupation(f, state, new Set(['army-b'])); expect(repaired.occupation.sieges[0]?.resistance ?? maximum).toBeGreaterThan(maximum / 2);
  });
  it('retreat, peace and destruction each prevent landed occupation and clear irrelevant combat rounds', () => {
    for (const reason of ['retreat', 'peace', 'destroyed']) {
      const f = spatialFixture47(); f.spatial.positions.records['army-a'] = beginArmyTravel47('army-a', [2], f.spatial.graph); f.world.armies[1].status = 'destroyed';
      if (reason === 'retreat') f.world.armies[0].status = 'retreating';
      if (reason === 'destroyed') f.world.armies[0].status = 'destroyed';
      if (reason === 'peace') f.world.statecraft!.relations[0].status = 'peace';
      f.tactics.rounds['army-a'] = 1;
      expect(occupation(f).world.provinces[1].controller).toBe('b');
      expect(dueCombatRounds47(f.world, f.tactics, 1, initialOccupation(), f.spatial, new Set()).size).toBe(0); expect(f.tactics.rounds).toEqual({});
    }
  });
});
