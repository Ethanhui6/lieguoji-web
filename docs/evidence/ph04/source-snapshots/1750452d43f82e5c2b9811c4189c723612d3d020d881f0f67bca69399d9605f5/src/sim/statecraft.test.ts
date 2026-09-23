import { describe, expect, it } from 'vitest';
import { advanceWorld, applyStateAction, initializeStatecraft, isAtWar, issueOrder, nationReports, previewOrder, previewStateAction, validateWorld } from './core';
import { createWorld } from './demo';
import type { Army, StateAction, World } from './types';

function legacyCustom(): World {
  const owners = ['a', 'a', 'b', 'c'];
  const ids = ['a-home', 'a-front', 'b-home', 'c-home'];
  return {
    schemaVersion: 1, rulesVersion: '0.1.0', scenario: 'custom-world', custom: { id: 'world-statecraft', name: '国家治理测试', seed: 'statecraft', rivers: [] }, mode: 'sandbox', day: 0,
    nations: ['a', 'b', 'c'].map((id, index) => ({ id, name: `${id}国`, color: ['#cc6655', '#559966', '#5577cc'][index], capitalId: `city-${id}`, regimeId: `regime-${id}`, dynastyId: `dynasty-${id}` })),
    provinces: ids.map((id, index) => ({ id, name: id, polygon: [{ x: index * 100, y: 0 }, { x: (index + 1) * 100, y: 0 }, { x: (index + 1) * 100, y: 100 }, { x: index * 100, y: 100 }], center: { x: index * 100 + 50, y: 50 }, label: { x: index * 100 + 50, y: 40 }, terrain: 'plain', legalOwner: owners[index], controller: owners[index], neighbors: ids.filter((_, neighbor) => Math.abs(neighbor - index) === 1), supply: 12 })),
    cities: ['a', 'b', 'c'].map((id, index) => ({ id: `city-${id}`, name: `${id}城`, provinceId: `${id}-home`, position: { x: (index === 0 ? 0 : index + 1) * 100 + 50, y: 50 }, label: { x: (index === 0 ? 0 : index + 1) * 100 + 50, y: 60 }, fort: 0 })),
    armies: ['a', 'b', 'c'].map((id, index) => ({ id: `army-${id}`, name: `${id}军`, nationId: id, provinceId: index === 0 ? 'a-front' : `${id}-home`, originId: index === 0 ? 'a-front' : `${id}-home`, troops: [1200, 600, 500][index], morale: 90, supplies: 100, status: 'idle', route: [], progress: 0 })),
    events: [], nextEventId: 1,
  };
}
function modern() { return initializeStatecraft(legacyCustom()); }
const army = (world: World, nation = 'a') => world.armies.find(item => item.nationId === nation)!;
const economy = (world: World, provinceId = 'a-front') => world.statecraft!.provinces.find(item => item.provinceId === provinceId)!;
const policy = (world: World, nation = 'a') => world.statecraft!.nations.find(item => item.nationId === nation)!;
const action = (world: World, request: StateAction) => applyStateAction(world, request, previewStateAction(world, request).basedOn);
const war = (world: World) => action(world, { type: 'declare-war', nationId: 'a', targetNationId: 'b' });
const peace = (world: World) => action(world, { type: 'make-peace', nationId: 'a', targetNationId: 'b' });
const march = { armyId: 'army-a', targetId: 'b-home', kind: 'march' as const };
function removeArmy(value: Army) { value.status = 'destroyed'; value.troops = 0; value.supplies = 0; value.morale = 0; value.route = []; value.progress = 0; }

describe('versioned statecraft actions and migration boundary', () => {
  it('creates an explicit independent upgrade, preserving legacy JSON and events', () => {
    const old = issueOrder(legacyCustom(), march), before = JSON.stringify(old);
    const copy = initializeStatecraft(old, 'war');
    expect(copy).toMatchObject({ schemaVersion: 2, rulesVersion: '0.2.0' });
    expect(validateWorld(copy)).toBe(true);
    expect(JSON.stringify(old)).toBe(before);
    expect(copy.armies).toEqual(old.armies);
    expect(copy.events.slice(0, -1)).toEqual(old.events);
    expect(copy.statecraft!.nations.every(item => item.lastLedger === null)).toBe(true);
    expect(isAtWar(copy, 'a', 'b')).toBe(true);
    expect(initializeStatecraft(copy)).toEqual(copy);
    expect(() => initializeStatecraft(createWorld())).toThrow('自建世界');
    expect(validateWorld(advanceWorld(createWorld(), 15))).toBe(true);
  });

  it('previews finite policy consequences and rejects stale confirmations without mutation', () => {
    const world = modern(), before = structuredClone(world);
    const request: StateAction = { type: 'policy', nationId: 'a', priority: 'military' };
    const preview = previewStateAction(world, request);
    expect(preview).toMatchObject({ valid: true, basedOn: { day: 0, nextEventId: world.nextEventId } });
    expect(preview.warnings.join('')).toContain('缺粮');
    const applied = applyStateAction(world, request, preview.basedOn);
    expect(policy(applied).priority).toBe('military');
    expect(world).toEqual(before);
    expect(() => applyStateAction(applied, { type: 'policy', nationId: 'a', priority: 'civilian' }, preview.basedOn)).toThrow('过期');
    expect(() => applyStateAction(advanceWorld(world, 1), request, preview.basedOn)).toThrow('过期');
  });

  it.each([
    { type: 'policy', nationId: 'unknown', priority: 'military' },
    { type: 'policy', nationId: 'a', priority: 'invalid' },
    { type: 'declare-war', nationId: 'a', targetNationId: 'a' },
    { type: 'declare-war', nationId: 'a', targetNationId: 'c' },
    { type: 'declare-war', nationId: 'a', targetNationId: 'b', surprise: true },
    { type: 'make-peace', nationId: 'a', targetNationId: 'b' },
  ])('rejects invalid state action %j', request => {
    const world = modern(), before = structuredClone(world);
    expect(previewStateAction(world, request as StateAction).valid).toBe(false);
    expect(() => action(world, request as StateAction)).toThrow();
    expect(world).toEqual(before);
  });
});

describe('peace applies to routes, combat, pursuit and control', () => {
  it('starts at peace, forbids foreign invasion and never damages neutral co-located troops', () => {
    const world = modern();
    expect(previewOrder(world, march).reason).toContain('和平');
    army(world, 'c').provinceId = 'b-home'; army(world, 'c').originId = 'b-home';
    const after = advanceWorld(world, 1);
    expect(after.armies.map(item => item.troops)).toEqual(world.armies.map(item => item.troops));
    expect(after.provinces.map(item => item.controller)).toEqual(world.provinces.map(item => item.controller));
    expect(after.events.some(item => item.kind === 'battle' || item.kind === 'occupation')).toBe(false);
  });

  it('blocks neutral intermediate territory even when the final target is an enemy', () => {
    const world = war(modern());
    world.provinces.find(item => item.id === 'a-front')!.controller = 'c';
    army(world).provinceId = 'a-home'; army(world).originId = 'a-home';
    expect(previewOrder(world, march).valid).toBe(false);
  });

  it('damages only warring opponents on a three-nation battlefield', () => {
    const world = war(modern());
    army(world).provinceId = 'b-home'; army(world).originId = 'b-home';
    army(world, 'c').provinceId = 'b-home'; army(world, 'c').originId = 'b-home';
    const after = advanceWorld(world, 1);
    expect(army(after).troops).toBeLessThan(army(world).troops);
    expect(army(after, 'b').troops).toBeLessThan(army(world, 'b').troops);
    expect(army(after, 'c').troops).toBe(army(world, 'c').troops);
    expect(army(after, 'c').morale).toBe(army(world, 'c').morale);
  });

  it('retains a started leg on ceasefire, finishes it, then physically withdraws without pursuit', () => {
    const moving = advanceWorld(issueOrder(war(modern()), march), 1);
    expect(army(moving).progress).toBe(0.5);
    const stopped = peace(moving);
    expect(army(stopped)).toMatchObject({ provinceId: 'a-front', progress: 0.5, route: ['b-home'], status: 'marching' });
    expect(previewStateAction(stopped, { type: 'declare-war', nationId: 'a', targetNationId: 'b' }).reason).toContain('保护');
    const arrived = advanceWorld(stopped, 1);
    expect(army(arrived).provinceId).toBe('b-home');
    expect(arrived.provinces.find(item => item.id === 'b-home')!.controller).toBe('b');
    expect(army(arrived).troops).toBe(army(stopped).troops);
    const returned = advanceWorld(arrived, 1);
    expect(army(returned).provinceId).toBe('a-front');
    expect(army(returned).troops).toBe(army(stopped).troops);
    expect(returned.events.filter(item => item.day > stopped.day).some(item => item.kind === 'occupation' || item.kind === 'battle')).toBe(false);
    expect(validateWorld(returned)).toBe(true);
  });

  it('stops an unstarted leg at its real origin and releases a battle without teleporting', () => {
    const ordered = issueOrder(war(modern()), march);
    const stopped = peace(ordered);
    expect(army(stopped)).toMatchObject({ provinceId: 'a-front', route: [], progress: 0, status: 'idle' });
    const fighting = advanceWorld(ordered, 2), before = army(fighting).provinceId;
    expect(army(fighting).status).toBe('fighting');
    const ceasefire = peace(fighting);
    expect(army(ceasefire).provinceId).toBe(before);
    expect(army(ceasefire).status).toBe('idle');
    expect(army(advanceWorld(ceasefire, 1)).troops).toBe(army(ceasefire).troops);
  });

  it('does not borrow a third neutral country as an evacuation corridor', () => {
    const world = modern();
    army(world).provinceId = 'c-home'; army(world).originId = 'c-home';
    const after = advanceWorld(world, 3);
    expect(army(after)).toMatchObject({ provinceId: 'c-home', route: [], progress: 0, status: 'idle' });
    expect(after.provinces.find(item => item.id === 'c-home')!.controller).toBe('c');
    expect(policy(after).lastDecision?.reason).toContain('第三国');
  });

  it('cancels an unstarted third-country attack from a host whose war just ended', () => {
    let world = war(modern());
    // Both fronts are genuine wars, with a legally adjacent declaration.
    world.provinces.find(item => item.id === 'b-home')!.controller = 'a';
    world = action(world, { type: 'declare-war', nationId: 'a', targetNationId: 'c' });
    world.provinces.find(item => item.id === 'b-home')!.controller = 'b';
    army(world).provinceId = 'b-home'; army(world).originId = 'b-home';
    army(world).route = ['c-home']; army(world).status = 'marching';
    const stopped = peace(world);
    expect(army(stopped)).toMatchObject({ provinceId: 'b-home', route: [], progress: 0, status: 'idle' });
    expect(army(advanceWorld(stopped, 1)).provinceId).toBe('a-front');
  });
});

describe('finite population and local grain accounts', () => {
  it('reports forecasts separately from actual ledgers and pays refill from the actual local store', () => {
    const world = modern();
    army(world).supplies = 30;
    expect(nationReports(world).find(item => item.nationId === 'a')!.lastLedger).toBeNull();
    const before = economy(world).grain;
    const after = advanceWorld(world, 1), ledger = policy(after).lastLedger!;
    expect(ledger.militaryConsumed).toBe(2400);
    expect(army(after).supplies).toBe(38);
    expect(economy(after).grain).toBe(before + 19600 - 17500 - 2400);
    expect(ledger.openingGrain + ledger.production - ledger.civilianConsumed - ledger.militaryConsumed + ledger.territoryTransfer).toBe(ledger.closingGrain);
    expect(nationReports(after).find(item => item.nationId === 'a')!.lastLedger).toEqual(ledger);
    expect(validateWorld(after)).toBe(true);
  });

  it('military priority can starve civilians while civilian priority preserves their food', () => {
    const original = modern();
    economy(original).population = 100; economy(original).grain = 100; army(original).supplies = 0; army(original).troops = 600;
    const civilian = advanceWorld(action(original, { type: 'policy', nationId: 'a', priority: 'civilian' }), 1);
    const military = advanceWorld(action(original, { type: 'policy', nationId: 'a', priority: 'military' }), 1);
    expect(economy(civilian).population).toBe(100);
    expect(economy(military).population).toBe(99);
    expect(policy(military).lastLedger!.militaryConsumed).toBe(200);
    expect(army(military).supplies).toBe(2);
    expect(army(civilian).supplies).toBe(0);
    expect(army(civilian).troops).toBeLessThan(army(military).troops);
  });

  it('cannot refill a poor province from another province or generate negative grain', () => {
    const world = modern();
    economy(world).population = 100; economy(world).grain = 0;
    world.provinces.find(item => item.id === 'a-front')!.terrain = 'mountain';
    army(world).supplies = 4;
    const after = advanceWorld(world, 1);
    expect(economy(after).grain).toBe(0);
    expect(economy(after).population).toBe(99);
    expect(economy(after, 'a-home').grain).toBeGreaterThan(300000);
    expect(army(after).supplies).toBe(0);
    expect(army(after).troops).toBeLessThan(army(world).troops);
  });

  it('occupation transfers the existing population and grain without rewriting legal claims or ending a nation', () => {
    const world = war(modern()); removeArmy(army(world, 'b'));
    const after = advanceWorld(issueOrder(world, march), 2);
    expect(after.provinces.find(item => item.id === 'b-home')).toMatchObject({ controller: 'a', legalOwner: 'b' });
    expect(after.nations).toEqual(world.nations);
    const captured = economy(after, 'b-home').grain;
    expect(policy(after).lastLedger!.territoryTransfer).toBe(captured);
    expect(policy(after, 'b').lastLedger!.territoryTransfer).toBe(-captured);
    expect(nationReports(after).find(item => item.nationId === 'b')).toMatchObject({ territoryCount: 0, population: 0, grain: 0 });
    expect(nationReports(after).find(item => item.nationId === 'a')!.population).toBeGreaterThan(50000);
    expect(validateWorld(after)).toBe(true);
  });
});

describe('causal autonomous diplomacy', () => {
  it('lets a well supplied stronger balanced nation declare after observation, with a recorded reason', () => {
    const world = modern();
    army(world).troops = 2400;
    for (const item of world.statecraft!.provinces) item.grain *= 3;
    const before = advanceWorld(world, 13);
    expect(isAtWar(before, 'a', 'b')).toBe(false);
    const after = advanceWorld(before, 1);
    expect(isAtWar(after, 'a', 'b')).toBe(true);
    expect(after.events.some(item => item.kind === 'diplomacy' && item.reason.includes('均衡政策') && item.reason.includes('1.9'))).toBe(true);
    expect(policy(after).lastDecision).not.toBeNull();
  });

  it('preserves peace under civilian policy and when food or strength is inadequate', () => {
    const world = modern(); army(world).troops = 2400;
    const civilian = action(world, { type: 'policy', nationId: 'a', priority: 'civilian' });
    expect(isAtWar(advanceWorld(civilian, 21), 'a', 'b')).toBe(false);
    const weak = modern(); army(weak).troops = 600;
    expect(isAtWar(advanceWorld(weak, 21), 'a', 'b')).toBe(false);
    const poor = modern(); army(poor).troops = 2400;
    for (const item of poor.statecraft!.provinces) item.grain = 0;
    expect(isAtWar(advanceWorld(poor, 21), 'a', 'b')).toBe(false);
  });

  it('honors truce even for a strong military policy and keeps confirmed player routes', () => {
    let world = peace(war(modern()));
    world = action(world, { type: 'policy', nationId: 'a', priority: 'military' }); army(world).troops = 2400;
    const after = advanceWorld(world, 7);
    expect(isAtWar(after, 'a', 'b')).toBe(false);
    expect(previewStateAction(after, { type: 'declare-war', nationId: 'a', targetNationId: 'b' }).reason).toContain('保护');
    const ordered = issueOrder(war(modern()), { armyId: 'army-a', targetId: 'a-home', kind: 'march' });
    expect(army(advanceWorld(ordered, 1))).toMatchObject({ provinceId: 'a-front', route: ['a-home'], progress: 0.5 });
  });

  it('has identical results in one batch and repeated daily steps', () => {
    const world = modern();
    let stepped = world;
    for (let day = 0; day < 20; day++) stepped = advanceWorld(stepped, 1);
    expect(advanceWorld(world, 20)).toEqual(stepped);
  });
});

describe('strict statecraft save validation', () => {
  it('round trips both versions and rejects cross-version fields and event kinds', () => {
    const roundTrip: unknown = JSON.parse(JSON.stringify(advanceWorld(modern(), 3)));
    expect(validateWorld(roundTrip)).toBe(true);
    const old = legacyCustom(); expect(validateWorld(old)).toBe(true);
    old.statecraft = modern().statecraft; expect(validateWorld(old)).toBe(false);
    const wrong = modern(); wrong.rulesVersion = '0.1.0'; expect(validateWorld(wrong)).toBe(false);
    const missing = modern(); delete missing.statecraft; expect(validateWorld(missing)).toBe(false);
    const eventOld = legacyCustom(); eventOld.events = [{ id: 1, day: 0, kind: 'economy', text: 'invalid', reason: 'schema1' }]; eventOld.nextEventId = 2;
    expect(validateWorld(eventOld)).toBe(false);
  });

  it.each([
    (world: World) => { economy(world).grain = -1; },
    (world: World) => { economy(world).population = Infinity; },
    (world: World) => { economy(world).population = 1.5; },
    (world: World) => { economy(world).provinceId = 'unknown'; },
    (world: World) => { world.statecraft!.provinces[1] = { ...world.statecraft!.provinces[0] }; },
    (world: World) => { world.statecraft!.relations.pop(); },
    (world: World) => { world.statecraft!.relations[0].a = world.statecraft!.relations[0].b; },
    (world: World) => { world.statecraft!.relations[0].sinceDay = world.day + 1; },
    (world: World) => { world.statecraft!.relations[0].truceUntilDay = 55; },
    (world: World) => { policy(world).lastLedger!.closingGrain++; },
    (world: World) => { policy(world).lastDecision = { day: world.day + 1, action: 'x', reason: 'x' }; },
  ])('rejects corrupt finite values, references, pairs, dates and nonclosing accounts %#', mutate => {
    const world = advanceWorld(modern(), 1); mutate(world);
    expect(validateWorld(world)).toBe(false);
    expect(() => advanceWorld(world, 1)).toThrow('校验');
  });
});
