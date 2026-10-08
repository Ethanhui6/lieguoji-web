import type {World} from '../../sim/types';
import type {TerrainContext} from './fiscal15-state';
import type {TravelGraph47} from './army-travel47-graph';
import type {TacticsState} from './tactics-model';
import {initialArmyPositions47} from './army-presence47';
import {analyzeElevation} from './terrain13-native';
import {reconcileCore} from './upper14-state';

/** Two tiny land squares with a sea cell between them. Real consumer formulas,
 * synthetic geometry/countries: this fixture makes no native visual claim. */
export function spatialFixture47() {
  const graph: TravelGraph47 = {scale: 1, polygonWork: 0, byProvince: new Map([['home', [0]], ['far', [2]]]), cells: new Map()};
  for (let id = 0; id < 3; id++) graph.cells.set(id, {
    id, face: id, surface: id === 1 ? 'sea' : 'land', provinceId: id === 0 ? 'home' : id === 2 ? 'far' : null,
    center: {x: id * 10 + 5, y: 5}, polygon: [{x: id * 10, y: 0}, {x: id * 10 + 10, y: 0}, {x: id * 10 + 10, y: 10}, {x: id * 10, y: 10}],
    links: [...(id ? [{to: id - 1, gate: {x: id * 10, y: 5}, distance: 10, toGate: 5}] : []), ...(id < 2 ? [{to: id + 1, gate: {x: id * 10 + 10, y: 5}, distance: 10, toGate: 5}] : [])],
  });
  const world: World = {
    schemaVersion: 2, rulesVersion: '0.2.0', scenario: 'custom-world', mode: 'sandbox', day: 1, events: [], nextEventId: 1,
    nations: ['a', 'b'].map((id, i) => ({id, name: id, color: '#ffffff', capitalId: 'city-' + i, regimeId: 'kingdom', dynastyId: 'dynasty-' + id})),
    provinces: ['home', 'far'].map((id, i) => ({id, name: id, polygon: graph.cells.get(i * 2)!.polygon, center: graph.cells.get(i * 2)!.center, label: graph.cells.get(i * 2)!.center, terrain: 'plain', legalOwner: i ? 'b' : 'a', controller: i ? 'b' : 'a', neighbors: [], supply: 20})),
    cities: ['home', 'far'].map((provinceId, i) => ({id: 'city-' + i, name: provinceId, provinceId, position: graph.cells.get(i * 2)!.center, label: graph.cells.get(i * 2)!.center, fort: 0})),
    armies: ['a', 'b'].map((nationId, i) => ({id: 'army-' + nationId, name: nationId, nationId, provinceId: i ? 'far' : 'home', originId: i ? 'far' : 'home', troops: 600, morale: 100, supplies: 50, status: 'idle', route: [], progress: 0})),
    statecraft: {
      version: 1, provinces: ['home', 'far'].map(provinceId => ({provinceId, population: 1000, grain: 20000})),
      nations: ['a', 'b'].map(nationId => ({nationId, priority: 'balanced', lastLedger: null, lastDecision: null})),
      relations: [{a: 'a', b: 'b', status: 'war', sinceDay: 0, truceUntilDay: 0}],
    },
  };
  const context: TerrainContext = {
    version: 1, algorithm: 'clipped-face-biome-area-v1',
    provinces: Object.fromEntries(world.provinces.map(p => [p.id, {...analyzeElevation([45, 45, 45]), biomes: [0], samples: 3, area: 100}])),
    upper: {
      version: 1, initialization: 'native-combat-web-inputs-v1',
      nations: Object.fromEntries(world.nations.map(n => [n.id, {polity: 'Kingdom', traits: [], destiny: 50, coreThreshold: 2, coreYear: 0, provinceOrder: []}])),
      armies: Object.fromEntries(world.armies.map(a => [a.id, {base: 10, initializedTick: 0}])),
      provinces: Object.fromEntries(world.provinces.map(p => [p.id, {biomeCounts: [3, ...new Array<number>(12).fill(0)], biomeOrder: [0], storedDefense: 1, locked: false, manualSet: false, manualFortress: false, distance: 0, connected: true}])),
    },
    finance: {
      version: 1, initialization: 'native-fiscal-web-cells-v1',
      provinces: Object.fromEntries(world.provinces.map(p => [p.id, {cellBiomes: [0, 0, 0], seaNeighbor: true, maxPopulation: 2000, resources: []}])),
      nations: Object.fromEntries(world.nations.map(n => [n.id, {gold: 1000, goldPerMonth: 0, armyCostGold: 0, goldBattleModifier: 1, initializedDay: 0, lastMonth: 0, ledger: null}])),
    },
  };
  reconcileCore(world, context.upper);
  const positions = initialArmyPositions47(world.armies.map((a, i) => ({armyId: a.id, provinceId: a.provinceId, point: graph.cells.get(i * 2)!.center})), graph, 'synthetic-two-shores');
  const spatial = {positions, graph, binding: 'synthetic-two-shores'};
  const tactics: TacticsState = {version: 1, nextArmyId: 1, seed: 1, forces: {}, rounds: {}, mobilizations: {}, unopposed: 'takeover'};
  return {world, context, spatial, tactics, units: {'army-a': 'Infantry', 'army-b': 'Infantry'} as const};
}
