import { describe, expect, it } from 'vitest';
import { advanceWorld, issueOrder, previewOrder, validateWorld } from './core';
import { createWorld } from './demo';
import type { Order, World } from './types';

const march: Order = { armyId: 'lie-main', targetId: 'ming-border', kind: 'march' };
const mainArmy = (world: World) => world.armies.find(army => army.id === 'lie-main')!;

describe('isolated test continent', () => {
  it('creates independent deterministic states with honest scenario metadata', () => {
    const first = createWorld();
    const second = createWorld();
    expect(first).toEqual(second);
    expect(validateWorld(first)).toBe(true);
    expect(first.scenario).toBe('test-continent');
    expect(first.mode).toBe('sandbox');
    expect(first.provinces).toHaveLength(12);
    expect(first.nations.map(nation => nation.name)).toEqual(['大野帝国', '烈帝国', '明反帝国', '平乃', '反国']);
    first.provinces[0].polygon[0].x = 999;
    first.nations[0].name = 'edited';
    expect(second).toEqual(createWorld());
  });

  it('separates nation, regime, dynasty, legal claim, control and editable city labels', () => {
    const world = createWorld();
    for (const nation of world.nations) expect(new Set([nation.id, nation.regimeId, nation.dynastyId]).size).toBe(3);
    const ping = world.provinces.filter(province => province.legalOwner === 'ping');
    expect(ping).toHaveLength(2);
    expect(ping[0].neighbors).not.toContain(ping[1].id);
    const capital = world.cities.find(city => city.id === world.nations.find(nation => nation.id === 'ping')!.capitalId)!;
    expect(capital.provinceId).toBe('ping-west');
    expect(capital.position.x).toBeLessThan(ping.find(province => province.id === 'ping-east')!.center.x);
    const originalPosition = { ...capital.position };
    capital.name = '可以编辑的城市文字';
    capital.label.x += 20;
    expect(capital.position).toEqual(originalPosition);
    expect(validateWorld(world)).toBe(true);
  });
});

describe('command previews and pure orders', () => {
  it('previews actual adjacency, terrain travel, supplies and defending troops', () => {
    const world = createWorld();
    const before = structuredClone(world);
    expect(previewOrder(world, march)).toMatchObject({ valid: true, route: ['lie-heart', 'ming-border'], days: 3, supplyCost: 18 });
    const preview = previewOrder(world, march);
    expect(preview.warnings.join('')).toContain('620');
    expect(preview.reason).toContain('森林');
    expect(world).toEqual(before);
  });

  it('issues an independent state using route[0] as the next province', () => {
    const original = createWorld();
    const before = structuredClone(original);
    const ordered = issueOrder(original, march);
    expect(mainArmy(ordered)).toMatchObject({ status: 'marching', provinceId: 'lie-heart', route: ['ming-border'], progress: 0 });
    ordered.provinces[0].label.x++;
    expect(original).toEqual(before);
    expect(ordered.events.at(-1)?.kind).toBe('order');
  });

  it.each([
    { ...march, armyId: 'unknown' },
    { ...march, armyId: 'ming-border-guard' },
    { ...march, targetId: 'unknown' },
    { ...march, targetId: 'lie-heart' },
    { ...march, kind: 'retreat' as const },
    { ...march, kind: 'invalid' as 'march' },
  ])('rejects illegal orders without changing any state: %j', order => {
    const world = createWorld();
    const before = structuredClone(world);
    expect(previewOrder(world, order).valid).toBe(false);
    expect(() => issueOrder(world, order)).toThrow();
    expect(world).toEqual(before);
  });

  it('does not reroute mid-leg and does not march away from an ongoing battle', () => {
    const ordered = issueOrder(createWorld(), march);
    expect(previewOrder(ordered, { ...march, targetId: 'lie-south' }).valid).toBe(false);
    const fighting = advanceWorld(ordered, 3);
    expect(mainArmy(fighting).status).toBe('fighting');
    expect(previewOrder(fighting, { ...march, targetId: 'ming-heart' }).reason).toContain('撤退');
  });

  it('finds the lowest terrain-time route and reports disconnected destinations', () => {
    const world = createWorld();
    const preview = previewOrder(world, { ...march, targetId: 'fan-border' });
    expect(preview.route).toEqual(['lie-heart', 'lie-south', 'fan-border']);
    expect(preview.days).toBe(6);
    const home = world.provinces.find(province => province.id === 'lie-heart')!;
    for (const province of world.provinces) province.neighbors = province.neighbors.filter(id => id !== home.id);
    home.neighbors = [];
    expect(validateWorld(world)).toBe(true);
    expect(previewOrder(world, march).valid).toBe(false);
  });

  it('warns about insufficient supply without disguising the base ETA', () => {
    const world = createWorld();
    mainArmy(world).supplies = 5;
    expect(previewOrder(world, march).warnings.join('')).toContain('不足');
    const moving = advanceWorld(issueOrder(world, march), 3);
    expect(mainArmy(moving).provinceId).toBe('lie-heart');
    expect(mainArmy(moving).troops).toBeLessThan(mainArmy(world).troops);
    expect(moving.events.some(item => item.kind === 'supply' && item.reason.includes('55%'))).toBe(true);
  });
});

describe('daily logistics, fighting, retreat and occupation', () => {
  it('takes an independent zero-day snapshot for consistent worker saves', () => {
    const world = issueOrder(createWorld(), march);
    const snapshot = advanceWorld(world, 0);
    expect(snapshot).toEqual(world);
    snapshot.armies[0].supplies = 0;
    expect(world.armies[0].supplies).toBe(100);
  });

  it('moves over real days and spends supply without aliasing the input', () => {
    const original = issueOrder(createWorld(), march);
    const before = structuredClone(original);
    const after = advanceWorld(original, 1);
    expect(after.day).toBe(1);
    expect(mainArmy(after).provinceId).toBe('lie-heart');
    expect(mainArmy(after).progress).toBeCloseTo(1 / 3);
    expect(mainArmy(after).supplies).toBe(94);
    expect(original).toEqual(before);
    expect(advanceWorld(original, 3)).toEqual(advanceWorld(advanceWorld(original, 1), 2));
  });

  it('gives actual defending forces casualties and explanatory events', () => {
    const world = advanceWorld(issueOrder(createWorld(), march), 3);
    expect(mainArmy(world).provinceId).toBe('ming-border');
    expect(mainArmy(world).status).toBe('fighting');
    expect(mainArmy(world).troops).toBeLessThan(1250);
    expect(world.armies.find(army => army.id === 'ming-border-guard')!.troops).toBeLessThan(620);
    expect(world.events.filter(item => item.kind === 'battle').at(-1)?.reason).toContain('同时结算');
    expect(world.provinces.find(province => province.id === 'ming-border')!.controller).toBe('ming');
    expect(validateWorld(world)).toBe(true);
  });

  it('lets the player retreat to controlled ground, pay pursuit losses and resupply', () => {
    const fighting = advanceWorld(issueOrder(createWorld(), march), 3);
    const retreat: Order = { ...march, kind: 'retreat', targetId: 'lie-heart' };
    expect(previewOrder(fighting, retreat)).toMatchObject({ valid: true, route: ['ming-border', 'lie-heart'], days: 1, supplyCost: 5 });
    const beforeTroops = mainArmy(fighting).troops;
    const escaped = advanceWorld(issueOrder(fighting, retreat), 1);
    expect(mainArmy(escaped)).toMatchObject({ provinceId: 'lie-heart', status: 'idle', route: [], progress: 0 });
    expect(mainArmy(escaped).troops).toBeLessThan(beforeTroops);
    expect(escaped.provinces.find(province => province.id === 'ming-border')!.controller).toBe('ming');
    const recovered = advanceWorld(escaped, 5);
    expect(mainArmy(recovered).supplies).toBe(100);
    expect(validateWorld(recovered)).toBe(true);
  });

  it('occupies only after defenders break, preserving the legal claim', () => {
    const original = issueOrder(createWorld(), march);
    const after = advanceWorld(original, 16);
    const border = after.provinces.find(province => province.id === 'ming-border')!;
    expect(border.controller).toBe('lie');
    expect(border.legalOwner).toBe('ming');
    expect(after.events.some(item => item.kind === 'occupation' && item.reason.includes('法理归属仍为明反帝国'))).toBe(true);
    expect(after.events.some(item => item.kind === 'retreat')).toBe(true);
    expect(after).toEqual(advanceWorld(original, 16));
    expect(validateWorld(after)).toBe(true);
  });

  it('allows a stronger defender to win instead of forcing a historical player victory', () => {
    const world = createWorld();
    mainArmy(world).troops = 400;
    world.armies.find(army => army.id === 'ming-border-guard')!.troops = 1500;
    const after = advanceWorld(issueOrder(world, march), 12);
    expect(after.provinces.find(province => province.id === 'ming-border')!.controller).toBe('ming');
    expect(mainArmy(after).provinceId).toBe('lie-heart');
    expect(mainArmy(after).troops).toBeLessThan(400);
    expect(validateWorld(after)).toBe(true);
  });

  it('keeps nation, regime, dynasty and armies alive when a capital is occupied', () => {
    const world = createWorld();
    for (const army of world.armies.filter(item => item.nationId === 'ming')) {
      army.provinceId = 'east-coast'; army.originId = 'east-coast';
    }
    const nationBefore = structuredClone(world.nations.find(nation => nation.id === 'ming'));
    const after = advanceWorld(issueOrder(world, { ...march, targetId: 'ming-heart' }), 6);
    expect(after.provinces.find(province => province.id === 'ming-heart')!.controller).toBe('lie');
    expect(after.nations.find(nation => nation.id === 'ming')).toEqual(nationBefore);
    expect(after.armies.filter(army => army.nationId === 'ming').every(army => army.troops > 0)).toBe(true);
    expect(after.events.some(item => item.reason.includes('首都失守'))).toBe(true);
    expect(validateWorld(after)).toBe(true);
  });

  it('caps the event log while preserving strict event sequence and valid state', () => {
    const world = createWorld();
    world.events = Array.from({ length: 160 }, (_, index) => ({ id: index + 1, day: 0, kind: 'system', text: '早期记录', reason: '验证日志上限，保留最新事件。' }));
    world.nextEventId = 161;
    const after = advanceWorld(issueOrder(world, march), 5);
    expect(after.events.length).toBe(160);
    expect(after.events[0].id).toBeGreaterThan(1);
    expect(after.nextEventId).toBeGreaterThan(after.events.at(-1)!.id);
    expect(validateWorld(after)).toBe(true);
  });

  it.each([-1, 366, 0.5, Infinity, NaN])('rejects invalid time increments %s', days => {
    expect(() => advanceWorld(createWorld(), days)).toThrow();
  });
});

describe('untrusted save validation', () => {
  it('accepts JSON round trips and current in-flight states', () => {
    let world = issueOrder(createWorld(), march);
    for (let day = 0; day < 25; day++) {
      world = advanceWorld(world, 1);
      expect(validateWorld(JSON.parse(JSON.stringify(world)))).toBe(true);
    }
  });

  it.each([
    ['schema', (world: World) => { (world as unknown as { schemaVersion: number }).schemaVersion = 2; }],
    ['nonfinite day', (world: World) => { world.day = NaN; }],
    ['negative day', (world: World) => { world.day = -1; }],
    ['invalid point', (world: World) => { world.provinces[0].polygon[0].x = Infinity; }],
    ['degenerate polygon', (world: World) => { world.provinces[0].polygon = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]; }],
    ['sparse polygon', (world: World) => { delete (world.provinces[0].polygon as unknown[])[1]; }],
    ['duplicate ID', (world: World) => { world.armies[1].id = world.armies[0].id; }],
    ['missing nation', (world: World) => { world.provinces[0].controller = 'missing'; }],
    ['missing city', (world: World) => { world.nations[0].capitalId = 'missing'; }],
    ['invalid origin', (world: World) => { world.armies[0].originId = 'missing'; }],
    ['asymmetric adjacency', (world: World) => { world.provinces[0].neighbors = []; }],
    ['fractional soldiers', (world: World) => { world.armies[0].troops = 0.1; }],
    ['invalid morale', (world: World) => { world.armies[0].morale = 101; }],
    ['negative supply', (world: World) => { world.armies[0].supplies = -1; }],
    ['missing route for moving army', (world: World) => { world.armies[0].status = 'marching'; }],
    ['dead active army', (world: World) => { world.armies[0].troops = 0; }],
    ['invalid progress', (world: World) => { world.armies[0].progress = 1; }],
    ['disconnected route', (world: World) => { world.armies[0].status = 'marching'; world.armies[0].route = ['fan-coast']; }],
    ['future event', (world: World) => { world.events[0].day = 1; }],
    ['invalid event sequence', (world: World) => { world.nextEventId = 1; }],
    ['unexpected fields', (world: World) => { Object.assign(world, { secret: 'not-an-allowed-world-field' }); }],
  ])('rejects corrupt saves: %s', (_name, corrupt) => {
    const world = createWorld();
    corrupt(world);
    expect(validateWorld(world)).toBe(false);
    expect(() => advanceWorld(world, 1)).toThrow();
  });

  it.each([null, undefined, [], {}, 'world', 42])('rejects non-world value %j', value => {
    expect(validateWorld(value)).toBe(false);
  });
});
