import type { Army, City, Nation, Point, Province, Terrain, World } from './types';

// This is a deliberately isolated, hand-authored engineering map. These
// coordinates, provincial names and force sizes are NOT approved world history.
const grid: Point[][] = [
  [{ x: 90, y: 65 }, { x: 280, y: 45 }, { x: 480, y: 65 }, { x: 700, y: 40 }, { x: 905, y: 80 }],
  [{ x: 65, y: 245 }, { x: 295, y: 240 }, { x: 500, y: 260 }, { x: 710, y: 230 }, { x: 950, y: 255 }],
  [{ x: 90, y: 455 }, { x: 280, y: 440 }, { x: 480, y: 465 }, { x: 730, y: 460 }, { x: 925, y: 455 }],
  [{ x: 120, y: 650 }, { x: 305, y: 665 }, { x: 500, y: 640 }, { x: 700, y: 670 }, { x: 885, y: 625 }],
];

type ProvinceSeed = { id: string; name: string; nation: string; terrain: Terrain; supply: number };
const provinceSeeds: ProvinceSeed[] = [
  { id: 'ping-west', name: '平乃西区', nation: 'ping', terrain: 'plain', supply: 16 },
  { id: 'dayan-west', name: '大野西区', nation: 'dayan', terrain: 'forest', supply: 12 },
  { id: 'dayan-east', name: '测试·北岭', nation: 'dayan', terrain: 'mountain', supply: 7 },
  { id: 'ping-east', name: '平乃东区', nation: 'ping', terrain: 'forest', supply: 10 },
  { id: 'lie-heart', name: '烈城辖区', nation: 'lie', terrain: 'plain', supply: 18 },
  { id: 'ming-border', name: '测试·中林', nation: 'ming', terrain: 'forest', supply: 9 },
  { id: 'ming-heart', name: '明反城辖区', nation: 'ming', terrain: 'plain', supply: 17 },
  { id: 'east-coast', name: '测试·东岸', nation: 'ming', terrain: 'plain', supply: 11 },
  { id: 'lie-south', name: '测试·南营', nation: 'lie', terrain: 'plain', supply: 14 },
  { id: 'fan-border', name: '测试·南岭', nation: 'fan', terrain: 'mountain', supply: 6 },
  { id: 'fan-heart', name: '反城辖区', nation: 'fan', terrain: 'plain', supply: 15 },
  { id: 'fan-coast', name: '测试·南湾', nation: 'fan', terrain: 'forest', supply: 10 },
];

const nations: Nation[] = [
  { id: 'dayan', name: '大野帝国', color: '#718a67', capitalId: 'city-dayan', regimeId: 'regime-dayan', dynastyId: 'dynasty-yelu' },
  { id: 'lie', name: '烈帝国', color: '#bd7359', capitalId: 'city-lie', regimeId: 'regime-lie', dynastyId: 'dynasty-xu-lie' },
  { id: 'ming', name: '明反帝国', color: '#778ba8', capitalId: 'city-ming', regimeId: 'regime-ming', dynastyId: 'dynasty-xu-ming' },
  { id: 'ping', name: '平乃', color: '#baaa6e', capitalId: 'city-ping', regimeId: 'regime-ping', dynastyId: 'dynasty-zhou' },
  // The surname of the royal house of 反国 remains unconfirmed.
  { id: 'fan', name: '反国', color: '#9d80a2', capitalId: 'city-fan', regimeId: 'regime-fan', dynastyId: 'dynasty-fan-unconfirmed' },
];

function makeProvinces(): Province[] {
  return provinceSeeds.map((seed, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const polygon = [grid[row][col], grid[row][col + 1], grid[row + 1][col + 1], grid[row + 1][col]].map(point => ({ ...point }));
    const center = { x: polygon.reduce((sum, point) => sum + point.x, 0) / 4, y: polygon.reduce((sum, point) => sum + point.y, 0) / 4 };
    const neighbors = [index - 4, index + 4, ...(col > 0 ? [index - 1] : []), ...(col < 3 ? [index + 1] : [])]
      .filter(other => other >= 0 && other < provinceSeeds.length).map(other => provinceSeeds[other].id);
    return { id: seed.id, name: seed.name, polygon, center, label: { x: center.x, y: center.y - 46 }, terrain: seed.terrain, legalOwner: seed.nation, controller: seed.nation, neighbors, supply: seed.supply };
  });
}

function makeArmy(id: string, name: string, nationId: string, provinceId: string, troops: number): Army {
  return { id, name, nationId, provinceId, troops, morale: 85, supplies: 100, status: 'idle', route: [], progress: 0, originId: provinceId };
}

/** A fresh, fully independent state; no RNG, wall clock or shared mutable data. */
export function createWorld(): World {
  const provinces = makeProvinces();
  const citySeeds = [
    { id: 'city-ping', name: '平乃城', provinceId: 'ping-west', fort: 2 },
    { id: 'city-dayan', name: '大野城', provinceId: 'dayan-west', fort: 2 },
    { id: 'city-lie', name: '烈城', provinceId: 'lie-heart', fort: 2 },
    { id: 'city-ming', name: '明反城', provinceId: 'ming-heart', fort: 2 },
    { id: 'city-fan', name: '反城', provinceId: 'fan-heart', fort: 2 },
    { id: 'city-border', name: '测试·林营', provinceId: 'ming-border', fort: 1 },
    { id: 'city-south', name: '测试·南营城', provinceId: 'lie-south', fort: 1 },
  ];
  const cities: City[] = citySeeds.map(seed => {
    const center = provinces.find(province => province.id === seed.provinceId)!.center;
    return { ...seed, position: { x: center.x, y: center.y - 10 }, label: { x: center.x, y: center.y + 16 } };
  });
  return {
    schemaVersion: 1, rulesVersion: '0.1.0', scenario: 'test-continent', mode: 'sandbox', day: 0,
    nations: nations.map(nation => ({ ...nation })), provinces, cities,
    armies: [
      makeArmy('lie-main', '烈军·先锋', 'lie', 'lie-heart', 1250),
      makeArmy('lie-reserve', '烈军·南营', 'lie', 'lie-south', 460),
      makeArmy('ming-border-guard', '明反·林营守军', 'ming', 'ming-border', 620),
      makeArmy('ming-capital-guard', '明反·都城守军', 'ming', 'ming-heart', 700),
      makeArmy('dayan-guard', '大野·守军', 'dayan', 'dayan-west', 720),
      makeArmy('ping-west-guard', '平乃·西境守军', 'ping', 'ping-west', 580),
      makeArmy('ping-east-guard', '平乃·东境守军', 'ping', 'ping-east', 420),
      makeArmy('fan-guard', '反国·守军', 'fan', 'fan-heart', 700),
    ],
    events: [{ id: 1, day: 0, kind: 'system', text: '测试大陆已建立', reason: '沙盒演练：地图、兵力与数值均为测试参数，不代表正式地图或正史。选择烈军后可预览行军；守军将按同一战斗规则防御。' }],
    nextEventId: 2,
  };
}
