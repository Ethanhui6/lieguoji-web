import { describe, expect, it } from 'vitest';
import { advanceWorld, canCommandArmy, issueOrder, validateWorld } from '../sim/core';
import { createWorld } from '../sim/demo';
import { addNation, cellAt, compileWorld, createDraft, draftProblems, fillUnclaimed, generateCities, generateLand, generateNations, generateTerrain, paintStroke, placeCity, validateDraft } from './engine';
import type { DraftCell, EditorDraft } from './types';
import type { World } from '../sim/types';
import legacyCustomFixture from '../../tests/fixtures/legacy-custom-0.1.json';

const seed = '山海生成回归-2026';
const readyDraft = () => generateCities(generateNations(createDraft(seed), 5), 3);
function componentCount(cells: DraftCell[]): number {
  const remaining = new Set(cells.map(cell => cell.id)), map = new Map(cells.map(cell => [cell.id, cell])); let count = 0;
  while (remaining.size) { count++; const queue = [remaining.values().next().value as string]; remaining.delete(queue[0]); for (let i = 0; i < queue.length; i++) for (const id of map.get(queue[i])!.neighbors) if (remaining.delete(id)) queue.push(id); }
  return count;
}

describe('deterministic Voronoi geography', () => {
  it('creates 640 independent clipped Voronoi cells, deterministic for the same seed', () => {
    const first = createDraft(seed), second = createDraft(seed);
    expect(first).toEqual(second); expect(first.cells).toHaveLength(640); expect(validateDraft(first)).toBe(true);
    expect(first.cells.some(cell => cell.polygon.length !== 4)).toBe(true);
    expect(first.cells.filter(cell => cell.land).length).toBeGreaterThan(20);
    expect(first.cells.filter(cell => !cell.land).length).toBeGreaterThan(20);
    first.cells[0].polygon[0].x = 999;
    expect(second).toEqual(createDraft(seed));
    expect(createDraft('另一个种子').cells).not.toEqual(second.cells);
  });

  it('has symmetric geometric adjacency and locates each site inside its cell', () => {
    const draft = createDraft(seed, true), cells = new Map(draft.cells.map(cell => [cell.id, cell]));
    for (const cell of draft.cells) {
      expect(cellAt(draft, cell.center)?.id).toBe(cell.id);
      for (const neighbor of cell.neighbors) expect(cells.get(neighbor)!.neighbors).toContain(cell.id);
    }
    expect(draft.cells.every(cell => !cell.land && cell.ownerId === null)).toBe(true);
    expect(cellAt(draft, { x: -20, y: -20 })).toBeUndefined();
  });

  it('rebuilds terrain without changing the coastline and rivers always descend', () => {
    const draft = generateLand(createDraft(seed, true)), before = structuredClone(draft);
    const result = generateTerrain(draft), byCenter = new Map(result.cells.map(cell => [`${cell.center.x},${cell.center.y}`, cell]));
    expect(result.cells.map(cell => cell.land)).toEqual(draft.cells.map(cell => cell.land));
    expect(draft).toEqual(before);
    expect(new Set(result.cells.filter(cell => cell.land).map(cell => cell.terrain)).size).toBeGreaterThan(1);
    expect(result.rivers.length).toBeGreaterThan(0);
    for (const river of result.rivers) for (let i = 1; i < river.length; i++) {
      const previous = byCenter.get(`${river[i - 1].x},${river[i - 1].y}`)!, next = byCenter.get(`${river[i].x},${river[i].y}`)!;
      expect(previous.neighbors).toContain(next.id);
      expect(next.elevation).toBeLessThan(previous.elevation);
    }
  });
});

describe('continuous editing brushes', () => {
  it('paints the full segment between sparse pointer samples, without changing the input', () => {
    const draft = createDraft(seed, true), before = structuredClone(draft);
    const painted = paintStroke(draft, [{ x: 30, y: 350 }, { x: 970, y: 350 }], 'land', 8);
    for (let x = 40; x <= 960; x += 20) expect(cellAt(painted, { x, y: 350 })!.land).toBe(true);
    expect(painted.cells.filter(cell => cell.land).length).toBeGreaterThan(20);
    expect(draft).toEqual(before); expect(validateDraft(painted)).toBe(true);
  });

  it('only paints terrain or claims onto land and rejects a nonexistent nation', () => {
    const blank = createDraft(seed, true);
    expect(paintStroke(blank, [{ x: 300, y: 300 }], 'mountain', 30).cells.every(cell => !cell.land)).toBe(true);
    expect(() => paintStroke(blank, [{ x: 300, y: 300 }], 'claim', 30, 'missing')).toThrow();
    expect(() => paintStroke(blank, [], 'land', NaN)).toThrow();
    let draft = addNation(paintStroke(blank, [{ x: 300, y: 300 }], 'land', 50), '自建国', '#ab7654');
    draft = paintStroke(draft, [{ x: 300, y: 300 }], 'claim', 40, draft.nations[0].id);
    expect(cellAt(draft, { x: 300, y: 300 })!.ownerId).toBe(draft.nations[0].id);
    expect(draft.cells.filter(cell => !cell.land).every(cell => cell.ownerId === null)).toBe(true);
  });

  it('erasing the sea removes affected cities and claims and never leaves a broken river', () => {
    const draft = readyDraft(), capital = draft.cities.find(city => city.capital)!;
    const cell = draft.cells.find(item => item.id === capital.cellId)!;
    draft.rivers.push([{ ...cell.center }, { x: cell.center.x + 1, y: cell.center.y + 1 }]);
    const result = paintStroke(draft, [cell.center], 'sea', 1);
    expect(result.cells.find(item => item.id === cell.id)).toMatchObject({ land: false, ownerId: null, elevation: 0 });
    expect(result.cities.some(city => city.cellId === cell.id)).toBe(false);
    expect(result.rivers.some(river => river.some(point => point.x === cell.center.x && point.y === cell.center.y))).toBe(false);
    expect(draft.cities.some(city => city.id === capital.id)).toBe(true);
    expect(validateDraft(result)).toBe(true);
  });

  it('claiming an existing capital transfers the city without duplicating a capital', () => {
    const draft = readyDraft(), capital = draft.cities.find(city => city.capital)!;
    const cell = draft.cells.find(item => item.id === capital.cellId)!;
    const other = draft.nations.find(nation => nation.id !== cell.ownerId)!;
    const result = paintStroke(draft, [cell.center], 'claim', 1, other.id);
    expect(result.cities.find(city => city.id === capital.id)?.capital).toBe(false);
    expect(validateDraft(result)).toBe(true);
  });
});

describe('national borders and cities', () => {
  it('partitions connected land with connected expansion, rather than independent colors', () => {
    const blank = createDraft(seed, true);
    // A continuous disk guarantees one land component for this topology test.
    const continent = paintStroke(blank, [{ x: 500, y: 350 }], 'land', 245);
    const result = generateNations(continent, 5);
    expect(result.cells.filter(cell => cell.land).every(cell => cell.ownerId)).toBe(true);
    for (const nation of result.nations) expect(componentCount(result.cells.filter(cell => cell.ownerId === nation.id))).toBe(1);
    expect(result).toEqual(generateNations(continent, 5));
  });

  it('assigns separate islands without creating cross-sea adjacency', () => {
    let draft = createDraft(seed, true);
    draft = paintStroke(draft, [{ x: 160, y: 200 }], 'land', 70);
    draft = paintStroke(draft, [{ x: 800, y: 520 }], 'land', 70);
    const result = generateCities(generateNations(draft, 1), 2);
    expect(componentCount(result.cells.filter(cell => cell.land))).toBe(2);
    expect(result.cells.filter(cell => cell.land).every(cell => cell.ownerId === result.nations[0].id)).toBe(true);
    const world = compileWorld(result), landIds = new Set(world.provinces.map(province => province.id));
    expect(world.provinces.every(province => province.neighbors.every(id => landIds.has(id)))).toBe(true);
    expect(componentCount(result.cells.filter(cell => cell.land))).toBe(2);
  });

  it('fills unclaimed land while preserving every manual claim', () => {
    let draft = generateNations(createDraft(seed), 3);
    const owned = draft.cells.filter(cell => cell.land);
    draft = paintStroke(draft, [owned[0].center], 'unclaim', 35);
    const claims = new Map(draft.cells.filter(cell => cell.ownerId).map(cell => [cell.id, cell.ownerId]));
    const result = fillUnclaimed(draft);
    for (const cell of result.cells) if (claims.has(cell.id)) expect(cell.ownerId).toBe(claims.get(cell.id));
    expect(result.cells.filter(cell => cell.land).every(cell => cell.ownerId)).toBe(true);
  });

  it('supports blank map → hand drawn land → new nation → assign remaining → cities → simulation', () => {
    const painted = paintStroke(createDraft(seed, true), [{ x: 220, y: 350 }, { x: 720, y: 350 }], 'land', 45);
    const nation = addNation(painted, '云国', '#739ca3');
    const result = generateCities(fillUnclaimed(nation), 3);
    expect(result.cells.filter(cell => cell.land).every(cell => cell.ownerId === result.nations[0].id)).toBe(true);
    expect(result.cities).toHaveLength(3);
    expect(result.cities.filter(city => city.capital)).toHaveLength(1);
    expect(draftProblems(result)).toEqual([]);
    expect(validateWorld(compileWorld(result))).toBe(true);
    expect(nation.cells.every(cell => cell.ownerId === null)).toBe(true);
  });

  it('seeds newly added countries only into unclaimed land and refuses to steal existing claims', () => {
    let draft = addNation(createDraft(seed), '手绘国', '#739ca3');
    const first = draft.cells.find(cell => cell.land)!;
    draft = paintStroke(draft, [first.center], 'claim', 1, draft.nations[0].id);
    draft = addNation(draft, '新国', '#be8656');
    const preserved = new Map(draft.cells.filter(cell => cell.ownerId).map(cell => [cell.id, cell.ownerId]));
    const result = fillUnclaimed(draft);
    for (const [id, owner] of preserved) expect(result.cells.find(cell => cell.id === id)!.ownerId).toBe(owner);
    expect(result.nations.every(nation => result.cells.some(cell => cell.ownerId === nation.id))).toBe(true);
    const noSpace = addNation(result, '无地国', '#9ca367'), before = structuredClone(noSpace);
    expect(() => fillUnclaimed(noSpace)).toThrow('已有领土未改动');
    expect(noSpace).toEqual(before);
  });

  it('generates one capital per nation and physically distinct ordinary cities on land', () => {
    const draft = readyDraft(), cells = new Map(draft.cells.map(cell => [cell.id, cell]));
    for (const nation of draft.nations) {
      const cities = draft.cities.filter(city => cells.get(city.cellId)!.ownerId === nation.id);
      expect(cities.filter(city => city.capital)).toHaveLength(1);
      expect(cities.length).toBeGreaterThan(0);
      expect(new Set(cities.map(city => city.cellId)).size).toBe(cities.length);
    }
    expect(draft.cities.every(city => cells.get(city.cellId)!.land)).toBe(true);
    expect(draftProblems(draft)).toEqual([]);
    expect(() => placeCity(draft, draft.cells.find(cell => !cell.land)!.center, '海上城', true)).toThrow();
  });

  it('placing a new capital demotes the old one and editing names preserves coordinates', () => {
    const draft = readyDraft(), nation = draft.nations[0];
    const cell = draft.cells.find(item => item.ownerId === nation.id && !draft.cities.some(city => city.cellId === item.id))!;
    const result = placeCity(draft, cell.center, '我的新首都', true);
    const map = new Map(result.cells.map(item => [item.id, item]));
    expect(result.cities.filter(city => city.capital && map.get(city.cellId)!.ownerId === nation.id)).toHaveLength(1);
    expect(result.cities.find(city => city.cellId === cell.id)?.name).toBe('我的新首都');
    expect(result.cells).toEqual(draft.cells);
  });
});

describe('custom world compilation and military autonomy', () => {
  it('reports incomplete drafts and compiles only valid countries/capitals/land', () => {
    expect(draftProblems(createDraft(seed, true)).length).toBeGreaterThan(0);
    expect(() => compileWorld(createDraft(seed))).toThrow();
    const draft = readyDraft(), before = structuredClone(draft), world = compileWorld(draft);
    expect(validateWorld(world)).toBe(true); expect(world.scenario).toBe('custom-world'); expect(world.custom?.seed).toBe(seed);
    expect(world.schemaVersion).toBe(2); expect(world.rulesVersion).toBe('0.2.0');
    expect(world.statecraft?.relations).toHaveLength(10);
    expect(world.statecraft?.relations.every(relation => relation.status === 'peace')).toBe(true);
    expect(world.statecraft?.provinces).toHaveLength(world.provinces.length);
    expect(world.provinces.length).toBe(draft.cells.filter(cell => cell.land).length);
    expect(world.armies).toHaveLength(5);
    expect(world.armies.every(army => canCommandArmy(world, army))).toBe(true);
    expect(draft).toEqual(before);
    world.provinces[0].polygon[0].x++;
    expect(draft).toEqual(before);
  });

  it('keeps real autonomous military moves and deterministic continuation for a published legacy custom save', () => {
    const world = structuredClone(legacyCustomFixture.world) as World, before = structuredClone(world), after = advanceWorld(world, 18);
    expect(after.day).toBe(world.day + 18);
    expect(after.events.some(event => event.day > world.day && event.kind === 'order' && event.text.includes('自主'))).toBe(true);
    expect(after.events.some(event => event.day > world.day && event.kind === 'march')).toBe(true);
    expect(after.armies.some(army => army.provinceId !== world.armies.find(item => item.id === army.id)!.provinceId)).toBe(true);
    expect(after).toEqual(advanceWorld(world, 18));
    expect(validateWorld(after)).toBe(true);
    expect(world).toEqual(before); expect(after.schemaVersion).toBe(1); expect(after.rulesVersion).toBe('0.1.0');
    expect(Object.hasOwn(after, 'statecraft')).toBe(false);
  });

  it('does not overwrite an accepted player route and can command a custom non-Lie nation', () => {
    const world = compileWorld(readyDraft()), army = world.armies[0], province = world.provinces.find(item => item.id === army.provinceId)!;
    const target = world.provinces.find(item => province.neighbors.includes(item.id) && item.controller === army.nationId)!;
    const ordered = issueOrder(world, { armyId: army.id, targetId: target.id, kind: 'march' });
    const after = advanceWorld(ordered, 1), moved = after.armies.find(item => item.id === army.id)!;
    expect(moved.route).toEqual([target.id]); expect(moved.progress).toBeGreaterThan(0);
    expect(after.events.filter(event => event.text.startsWith(`${army.name}自主`))).toHaveLength(0);
  });

  it('preserves old demo serialization and its original player permissions', () => {
    const old = createWorld(), serialized = JSON.stringify(old);
    expect(validateWorld(JSON.parse(serialized))).toBe(true);
    expect(canCommandArmy(old, old.armies.find(army => army.nationId === 'ming')!)).toBe(false);
    expect(advanceWorld(old, 0)).toEqual(old);
    expect(JSON.stringify(old)).toBe(serialized);
    expect(Object.hasOwn(old, 'custom')).toBe(false);
    expect(validateWorld({ ...old, custom: { id: 'world-1', name: '错误', seed: 's', rivers: [] } })).toBe(false);
  });

  it('handles a full 640-land-cell custom world with indexed routing', () => {
    const draft = createDraft('640-cell-benchmark', true);
    for (const cell of draft.cells) { cell.land = true; cell.elevation = 0.4; }
    const started = performance.now();
    const world = compileWorld(generateCities(generateNations(draft, 12), 3));
    const after = advanceWorld(world, 30), elapsed = performance.now() - started;
    expect(world.provinces).toHaveLength(640); expect(validateWorld(after)).toBe(true);
    // A broad regression ceiling, not a mobile performance acceptance claim.
    expect(elapsed).toBeLessThan(10000);
    console.info(`640-cell generation+compile+30 simulated days: ${Math.round(elapsed)} ms`);
  });
});

describe('draft data boundaries', () => {
  it.each([
    ['nan coordinate', (draft: EditorDraft) => { draft.cells[0].center.x = NaN; }],
    ['invalid neighbor', (draft: EditorDraft) => { draft.cells[0].neighbors.push('unknown'); }],
    ['invalid owner', (draft: EditorDraft) => { draft.cells.find(cell => cell.land)!.ownerId = 'missing'; }],
    ['water owner', (draft: EditorDraft) => { draft.cells.find(cell => !cell.land)!.ownerId = draft.nations[0].id; }],
    ['duplicate ID', (draft: EditorDraft) => { draft.cells[1].id = draft.cells[0].id; }],
    ['short river', (draft: EditorDraft) => { draft.rivers = [[{ x: 1, y: 2 }]]; }],
    ['invalid city reference', (draft: EditorDraft) => { draft.cities[0].cellId = 'unknown'; }],
    ['unknown metadata', (draft: EditorDraft) => { Object.assign(draft, { executable: 'no' }); }],
  ])('rejects corrupt draft: %s', (_name, corrupt) => {
    const draft = readyDraft(); corrupt(draft);
    expect(validateDraft(draft)).toBe(false); expect(() => compileWorld(draft)).toThrow();
  });
});
