import { Delaunay } from 'd3-delaunay';
import { initializeStatecraft, validateWorld } from '../sim/core';
import type { Point, Terrain, World } from '../sim/types';
import type { BrushTool, DraftCell, DraftNation, EditorDraft } from './types';

const WIDTH = 1000;
const HEIGHT = 700;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const distance2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) { value ^= character.codePointAt(0)!; value = Math.imul(value, 16777619); }
  return value >>> 0;
}
function random(seed: string) {
  let value = hash(seed);
  return () => { value += 0x6D2B79F5; let t = Math.imul(value ^ value >>> 15, 1 | value); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function lattice(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = lattice(ix, iy, seed) * (1 - sx) + lattice(ix + 1, iy, seed) * sx;
  const bottom = lattice(ix, iy + 1, seed) * (1 - sx) + lattice(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}
function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.58 + noise(x * 2.13, y * 2.13, seed + 17) * 0.27 + noise(x * 4.31, y * 4.31, seed + 37) * 0.15;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (pointSegmentDistance2(point, a, b) < 1e-12) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function pointSegmentDistance2(point: Point, a: Point, b: Point): number {
  const length = distance2(a, b);
  const t = length === 0 ? 0 : clamp(((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length);
  return distance2(point, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}
function intersectsBrush(cell: DraftCell, points: Point[], radius: number): boolean {
  const r2 = radius * radius;
  if (points.some(point => pointInPolygon(point, cell.polygon))) return true;
  for (let index = 0; index < Math.max(1, points.length - 1); index++) {
    const a = points[index], b = points[Math.min(index + 1, points.length - 1)];
    for (let edge = 0; edge < cell.polygon.length; edge++) {
      const c = cell.polygon[edge], d = cell.polygon[(edge + 1) % cell.polygon.length];
      if (segmentsCross(a, b, c, d) || Math.min(pointSegmentDistance2(a, c, d), pointSegmentDistance2(b, c, d), pointSegmentDistance2(c, a, b), pointSegmentDistance2(d, a, b)) <= r2) return true;
    }
  }
  return false;
}

/** The sites are jittered; the editable topology is genuine clipped Voronoi. */
export function createDraft(seed: string, blank = false): EditorDraft {
  const safeSeed = seed.trim() || '列国纪';
  if (!validText(safeSeed, 200)) throw new Error('种子必须是最多 200 个字符的有效文本。');
  const rng = random(`${safeSeed}:sites`);
  const sites: [number, number][] = [];
  for (let row = 0; row < 20; row++) for (let column = 0; column < 32; column++) sites.push([(column + 0.2 + rng() * 0.6) * WIDTH / 32, (row + 0.2 + rng() * 0.6) * HEIGHT / 20]);
  const voronoi = Delaunay.from(sites).voronoi([0, 0, WIDTH, HEIGHT]);
  const cells: DraftCell[] = sites.map(([x, y], index) => ({
    id: `cell-${index}`, polygon: voronoi.cellPolygon(index)!.slice(0, -1).map(([px, py]) => ({ x: clamp(px, 0, WIDTH), y: clamp(py, 0, HEIGHT) })),
    center: { x, y }, neighbors: [...voronoi.neighbors(index)].map(neighbor => `cell-${neighbor}`).sort(), land: false, elevation: 0, moisture: 0.5, terrain: 'plain', ownerId: null,
  }));
  const draft: EditorDraft = { schemaVersion: 1, id: `world-${hash(safeSeed).toString(36)}`, name: '未命名世界', seed: safeSeed, width: WIDTH, height: HEIGHT, cells, nations: [], cities: [], rivers: [] };
  return blank ? draft : generateTerrain(generateLand(draft));
}

export function generateLand(draft: EditorDraft): EditorDraft {
  assertDraft(draft);
  const next = structuredClone(draft), rng = random(`${draft.seed}:land`), noiseSeed = hash(`${draft.seed}:coast`);
  const continents = Array.from({ length: 4 + Math.floor(rng() * 3) }, () => ({ x: 155 + rng() * 690, y: 100 + rng() * 500, rx: 110 + rng() * 125, ry: 75 + rng() * 105 }));
  for (const cell of next.cells) {
    const { x, y } = cell.center;
    const shape = Math.max(...continents.map(continent => Math.exp(-(((x - continent.x) / continent.rx) ** 2 + ((y - continent.y) / continent.ry) ** 2))));
    const edge = clamp(Math.min(x, WIDTH - x, y, HEIGHT - y) / 70);
    const coast = shape * 0.82 + fbm(x / 155, y / 155, noiseSeed) * 0.52;
    cell.land = coast * edge > 0.54;
    cell.elevation = cell.land ? clamp((coast - 0.5) * 0.8, 0.08, 0.8) : 0;
    cell.ownerId = null;
  }
  next.cities = []; next.rivers = [];
  return next;
}

export function generateTerrain(draft: EditorDraft): EditorDraft {
  assertDraft(draft);
  const next = structuredClone(draft), cells = new Map(next.cells.map(cell => [cell.id, cell]));
  const coastDistance = new Map<string, number>(), queue: DraftCell[] = [];
  for (const cell of next.cells) if (!cell.land || cell.polygon.some(point => point.x === 0 || point.y === 0 || point.x === WIDTH || point.y === HEIGHT)) { coastDistance.set(cell.id, 0); queue.push(cell); }
  for (let i = 0; i < queue.length; i++) for (const id of queue[i].neighbors) if (!coastDistance.has(id)) { coastDistance.set(id, coastDistance.get(queue[i].id)! + 1); queue.push(cells.get(id)!); }
  const elevationSeed = hash(`${draft.seed}:height`), moistureSeed = hash(`${draft.seed}:moisture`);
  const maxDistance = Math.max(1, ...coastDistance.values());
  for (const cell of next.cells) {
    cell.moisture = fbm(cell.center.x / 205, cell.center.y / 205, moistureSeed);
    if (!cell.land) { cell.elevation = 0; cell.terrain = 'plain'; continue; }
    const ridge = 1 - Math.abs(noise(cell.center.x / 210, cell.center.y / 145, elevationSeed + 701) * 2 - 1);
    const inland = (coastDistance.get(cell.id) ?? 0) / maxDistance;
    cell.elevation = clamp(0.06 + inland * 0.45 + fbm(cell.center.x / 155, cell.center.y / 155, elevationSeed) * 0.3 + ridge ** 3 * 0.3, 0.05, 1);
    cell.terrain = cell.elevation > 0.64 ? 'mountain' : cell.moisture > 0.48 ? 'forest' : 'plain';
  }
  const rivers: Point[][] = [], used = new Set<string>();
  const sources = next.cells.filter(cell => cell.land && cell.elevation > 0.58 && cell.moisture > 0.35).sort((a, b) => b.elevation - a.elevation || a.id.localeCompare(b.id));
  for (const source of sources) {
    if (rivers.length >= 16 || used.has(source.id) || rivers.some(river => distance2(river[0], source.center) < 70 ** 2)) continue;
    const path: DraftCell[] = [source];
    let current = source;
    while (current.land) {
      const downhill = current.neighbors.map(id => cells.get(id)!).filter(cell => cell.elevation < current.elevation - 1e-8).sort((a, b) => a.elevation - b.elevation || a.id.localeCompare(b.id))[0];
      if (!downhill) break;
      path.push(downhill); current = downhill;
    }
    if (path.length >= 3) { rivers.push(path.map(cell => ({ ...cell.center }))); for (const cell of path) used.add(cell.id); }
  }
  next.rivers = rivers;
  return next;
}

export function cellAt(draft: EditorDraft, point: Point): DraftCell | undefined {
  return draft.cells.find(cell => pointInPolygon(point, cell.polygon));
}

export function paintStroke(draft: EditorDraft, points: Point[], tool: BrushTool, radius: number, nationId?: string): EditorDraft {
  assertDraft(draft);
  if (!['land', 'sea', 'plain', 'forest', 'mountain', 'claim', 'unclaim'].includes(tool) || !Number.isFinite(radius) || radius <= 0 || radius > 250 || points.length > 1000 || !points.every(validPoint)) throw new Error('笔刷参数无效。');
  if (tool === 'claim' && !draft.nations.some(nation => nation.id === nationId)) throw new Error('请先选择一个已创建的国家。');
  const next = structuredClone(draft);
  if (!points.length) return next;
  const changed = new Set<string>(), transferred = new Set<string>();
  for (const cell of next.cells) {
    if (!intersectsBrush(cell, points, radius)) continue;
    if (tool === 'sea') { cell.land = false; cell.elevation = 0; cell.ownerId = null; changed.add(cell.id); }
    else if (tool === 'land') { if (!cell.land) { cell.land = true; cell.elevation = 0.3; cell.terrain = 'plain'; changed.add(cell.id); } }
    else if (cell.land && (tool === 'claim' || tool === 'unclaim')) { if (cell.ownerId !== (nationId ?? null) || tool === 'unclaim') transferred.add(cell.id); cell.ownerId = tool === 'claim' ? nationId! : null; }
    else if (cell.land) { cell.terrain = tool as Terrain; cell.elevation = tool === 'mountain' ? 0.82 : tool === 'forest' ? 0.48 : 0.3; changed.add(cell.id); }
  }
  const byId = new Map(next.cells.map(cell => [cell.id, cell]));
  next.cities = next.cities.filter(city => { const cell = byId.get(city.cellId)!; return cell.land && cell.ownerId !== null; }).map(city => transferred.has(city.cellId) ? { ...city, capital: false } : city);
  // Changing heights or erasing land invalidates the entire affected river;
  // it is removed, never silently redrawn uphill through the user's edits.
  if (changed.size) next.rivers = next.rivers.filter(river => !river.some(point => { const cell = cellAt(draft, point); return cell && changed.has(cell.id); }));
  return next;
}

function nextId(prefix: string, used: Set<string>): string { let number = 1; while (used.has(`${prefix}-${number}`)) number++; return `${prefix}-${number}`; }
const entityIds = (draft: EditorDraft) => new Set([...draft.cells, ...draft.nations, ...draft.cities].map(entity => entity.id));

export function addNation(draft: EditorDraft, name: string, color: string): EditorDraft {
  assertDraft(draft);
  if (draft.nations.length >= 50) throw new Error('当前最多支持 50 个国家。');
  if (!validText(name) || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('请输入 1—120 字国名和有效的十六进制颜色。');
  const next = structuredClone(draft);
  next.nations.push({ id: nextId('nation', entityIds(next)), name: name.trim(), color });
  return next;
}

function palette(index: number): string {
  const h = (index * 137.508 + 24) % 360, s = 0.39, l = 0.53;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => { const k = (n + h / 30) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
function landComponents(draft: EditorDraft): DraftCell[][] {
  const map = new Map(draft.cells.map(cell => [cell.id, cell])), unseen = new Set(draft.cells.filter(cell => cell.land).map(cell => cell.id)), components: DraftCell[][] = [];
  while (unseen.size) {
    const first = unseen.values().next().value as string, component = [map.get(first)!]; unseen.delete(first);
    for (let index = 0; index < component.length; index++) for (const id of component[index].neighbors) if (unseen.delete(id)) component.push(map.get(id)!);
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id));
}

type Frontier = { cell: DraftCell; owner: string; cost: number };
class MinQueue {
  items: Frontier[] = [];
  push(value: Frontier) { this.items.push(value); let index = this.items.length - 1; while (index > 0) { const parent = (index - 1) >> 1; if (this.items[parent].cost <= value.cost) break; this.items[index] = this.items[parent]; index = parent; } this.items[index] = value; }
  pop(): Frontier | undefined {
    const first = this.items[0], last = this.items.pop(); if (!last || !this.items.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.items.length) { let child = index * 2 + 1; if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++; if (last.cost <= this.items[child].cost) break; this.items[index] = this.items[child]; index = child; }
    this.items[index] = last; return first;
  }
}

/** Multi-source terrain-cost expansion. Existing user claims are fixed seeds. */
function expandClaims(draft: EditorDraft) {
  const map = new Map(draft.cells.map(cell => [cell.id, cell]));
  const owned = draft.cells.filter(cell => cell.land && cell.ownerId);
  if (!owned.length) throw new Error('请先在陆地上为至少一个国家划定起始领土。');
  for (const component of landComponents(draft)) {
    if (component.some(cell => cell.ownerId)) continue;
    let best = { cell: component[0], owner: owned[0].ownerId!, distance: Infinity };
    for (const cell of component) for (const source of owned) { const distance = distance2(cell.center, source.center); if (distance < best.distance) best = { cell, owner: source.ownerId!, distance }; }
    best.cell.ownerId = best.owner;
  }
  const fixed = new Set(draft.cells.filter(cell => cell.ownerId).map(cell => cell.id));
  const frontier = new MinQueue(), costs = new Map<string, number>();
  for (const cell of draft.cells) if (cell.land && cell.ownerId) { frontier.push({ cell, owner: cell.ownerId, cost: 0 }); costs.set(cell.id, 0); }
  for (let current = frontier.pop(); current; current = frontier.pop()) {
    if (current.cost !== costs.get(current.cell.id)) continue;
    current.cell.ownerId = current.owner;
    for (const id of current.cell.neighbors) {
      const cell = map.get(id)!;
      if (!cell.land || fixed.has(id)) continue;
      const cost = current.cost + Math.sqrt(distance2(current.cell.center, cell.center)) * (cell.terrain === 'mountain' ? 1.8 : cell.terrain === 'forest' ? 1.3 : 1);
      if (cost < (costs.get(id) ?? Infinity)) { costs.set(id, cost); frontier.push({ cell, owner: current.owner, cost }); }
    }
  }
}

export function generateNations(draft: EditorDraft, count: number): EditorDraft {
  assertDraft(draft);
  const land = draft.cells.filter(cell => cell.land);
  if (!Number.isInteger(count) || count < 1 || count > 50 || count > land.length) throw new Error('国家数必须为 1—50，且不能超过陆地单元数量。');
  const next = structuredClone(draft); next.nations = []; next.cities = [];
  for (const cell of next.cells) cell.ownerId = null;
  const components = landComponents(next), seeds = components.slice(0, count).map(component => [...component].sort((a, b) => habitability(b, next) - habitability(a, next) || a.id.localeCompare(b.id))[0]);
  while (seeds.length < count) {
    const available = next.cells.filter(cell => cell.land && !seeds.includes(cell));
    available.sort((a, b) => Math.min(...seeds.map(seed => distance2(b.center, seed.center))) - Math.min(...seeds.map(seed => distance2(a.center, seed.center))) || a.id.localeCompare(b.id));
    seeds.push(available[0]);
  }
  const names = ['青岚', '沧原', '云川', '临海', '霜岭', '南泽', '赤原', '东岑', '苍梧', '西淮'];
  for (let index = 0; index < count; index++) {
    const nation: DraftNation = { id: `nation-${index + 1}`, name: `${names[index % names.length]}${index >= names.length ? Math.floor(index / names.length) + 1 : ''}国`, color: palette(index) };
    next.nations.push(nation); seeds[index].ownerId = nation.id;
  }
  expandClaims(next);
  return next;
}

export function fillUnclaimed(draft: EditorDraft): EditorDraft {
  assertDraft(draft);
  if (!draft.nations.length) throw new Error('请先创建至少一个国家，再分配剩余领土。');
  const next = structuredClone(draft), land = next.cells.filter(cell => cell.land);
  if (!land.length) throw new Error('请先绘制或生成陆地。');
  const owned = land.filter(cell => cell.ownerId), unclaimed = land.filter(cell => !cell.ownerId);
  const missing = next.nations.filter(nation => !owned.some(cell => cell.ownerId === nation.id));
  if (unclaimed.length < missing.length) throw new Error(`还有 ${missing.length} 个国家没有领土，但仅有 ${unclaimed.length} 个未认领陆地单元；请先增加陆地或手动调整归属，已有领土未改动。`);
  const nearest = new Map(unclaimed.map(cell => [cell.id, owned.length ? Math.min(...owned.map(source => distance2(cell.center, source.center))) : Infinity]));
  let hasSeed = owned.length > 0;
  for (const nation of missing) {
    let chosen: DraftCell | undefined, highest = -Infinity;
    for (const cell of unclaimed) if (cell.ownerId === null) {
      const score = hasSeed ? nearest.get(cell.id)! : habitability(cell, next);
      if (score > highest || (score === highest && chosen && cell.id.localeCompare(chosen.id) < 0)) { chosen = cell; highest = score; }
    }
    chosen!.ownerId = nation.id; hasSeed = true;
    for (const cell of unclaimed) nearest.set(cell.id, Math.min(nearest.get(cell.id)!, distance2(cell.center, chosen!.center)));
  }
  expandClaims(next);
  return next;
}

const habitatIndexes = new WeakMap<EditorDraft, Map<string, DraftCell>>();
function habitability(cell: DraftCell, draft: EditorDraft): number {
  let map = habitatIndexes.get(draft);
  if (!map) { map = new Map(draft.cells.map(item => [item.id, item])); habitatIndexes.set(draft, map); }
  return (cell.terrain === 'plain' ? 2 : cell.terrain === 'forest' ? 1 : 0) + 1 - Math.abs(cell.moisture - 0.6) + (cell.neighbors.some(id => !map.get(id)!.land) ? 0.4 : 0) + (draft.rivers.some(river => river.some(point => distance2(point, cell.center) < 28 ** 2)) ? 0.5 : 0);
}

export function generateCities(draft: EditorDraft, perNation: number): EditorDraft {
  assertDraft(draft);
  if (!Number.isInteger(perNation) || perNation < 1 || perNation > 20) throw new Error('每国城市数必须为 1—20。');
  const next = structuredClone(draft); next.cities = [];
  const used = entityIds(next);
  for (const nation of next.nations) {
    const candidates = next.cells.filter(cell => cell.land && cell.ownerId === nation.id);
    const chosen: DraftCell[] = [];
    while (candidates.length && chosen.length < perNation) {
      candidates.sort((a, b) => (habitability(b, next) + (chosen.length ? Math.min(...chosen.map(cell => Math.sqrt(distance2(cell.center, b.center)))) / 55 : 0)) - (habitability(a, next) + (chosen.length ? Math.min(...chosen.map(cell => Math.sqrt(distance2(cell.center, a.center)))) / 55 : 0)) || a.id.localeCompare(b.id));
      const cell = candidates.shift()!, id = nextId('city', used); used.add(id);
      next.cities.push({ id, name: chosen.length === 0 ? `${nation.name.slice(0, 110)}都` : `${nation.name.slice(0, 110)}第${chosen.length + 1}城`, cellId: cell.id, capital: chosen.length === 0 });
      chosen.push(cell);
    }
  }
  return next;
}

export function placeCity(draft: EditorDraft, point: Point, name: string, capital: boolean): EditorDraft {
  assertDraft(draft);
  const source = cellAt(draft, point);
  if (!source?.land || !source.ownerId) throw new Error('城市必须放在已有国家归属的陆地上。');
  if (!validText(name)) throw new Error('城市名称必须为 1—120 字。');
  const next = structuredClone(draft), map = new Map(next.cells.map(cell => [cell.id, cell]));
  if (capital) for (const city of next.cities) if (map.get(city.cellId)!.ownerId === source.ownerId) city.capital = false;
  const existing = next.cities.find(city => city.cellId === source.id);
  if (existing) { existing.name = name.trim(); existing.capital = capital; }
  else next.cities.push({ id: nextId('city', entityIds(next)), name: name.trim(), cellId: source.id, capital });
  return next;
}

export function draftProblems(draft: EditorDraft): string[] {
  if (!validateDraft(draft)) return ['草稿数据损坏或版本不兼容。'];
  const problems: string[] = [], land = draft.cells.filter(cell => cell.land), map = new Map(draft.cells.map(cell => [cell.id, cell]));
  if (!land.length) problems.push('请先绘制或生成陆地。');
  if (!draft.nations.length) problems.push('请至少创建一个国家。');
  const unclaimed = land.filter(cell => !cell.ownerId).length;
  if (unclaimed) problems.push(`还有 ${unclaimed} 个陆地单元尚未划分国家。`);
  for (const nation of draft.nations) {
    if (!land.some(cell => cell.ownerId === nation.id)) problems.push(`${nation.name}尚无领土。`);
    const capitals = draft.cities.filter(city => city.capital && map.get(city.cellId)!.ownerId === nation.id);
    if (capitals.length !== 1) problems.push(`${nation.name}需要且只能有一座首都（当前 ${capitals.length} 座）。`);
  }
  return problems;
}

export function compileWorld(draft: EditorDraft): World {
  const problems = draftProblems(draft);
  if (problems.length) throw new Error(problems.join('\n'));
  const cells = new Map(draft.cells.map(cell => [cell.id, cell]));
  const used = entityIds(draft);
  const generatedId = (prefix: string) => { const value = nextId(prefix, used); used.add(value); return value; };
  const nations = draft.nations.map(nation => ({ ...nation, capitalId: draft.cities.find(city => city.capital && cells.get(city.cellId)!.ownerId === nation.id)!.id, regimeId: generatedId('regime'), dynastyId: generatedId('dynasty') }));
  const world: World = {
    schemaVersion: 1, rulesVersion: '0.1.0', scenario: 'custom-world', mode: 'sandbox', day: 0,
    custom: { id: draft.id, name: draft.name, seed: draft.seed, rivers: structuredClone(draft.rivers) }, nations,
    provinces: draft.cells.filter(cell => cell.land).map((cell, index) => ({ id: cell.id, name: `${nations.find(nation => nation.id === cell.ownerId)!.name.slice(0, 100)} · 辖区 ${index + 1}`, polygon: structuredClone(cell.polygon), center: { ...cell.center }, label: { x: cell.center.x, y: Math.max(0, cell.center.y - 12) }, terrain: cell.terrain, legalOwner: cell.ownerId!, controller: cell.ownerId!, neighbors: cell.neighbors.filter(id => cells.get(id)!.land), supply: cell.terrain === 'plain' ? 18 : cell.terrain === 'forest' ? 12 : 8 })),
    cities: draft.cities.map(city => ({ id: city.id, name: city.name, provinceId: city.cellId, position: { ...cells.get(city.cellId)!.center }, label: { x: cells.get(city.cellId)!.center.x, y: Math.min(HEIGHT, cells.get(city.cellId)!.center.y + 12) }, fort: city.capital ? 2 : 1 })),
    armies: nations.map(nation => { const provinceId = draft.cities.find(city => city.id === nation.capitalId)!.cellId; return { id: generatedId('army'), name: `${nation.name.slice(0, 118)}军`, nationId: nation.id, provinceId, originId: provinceId, troops: Math.min(1500, 550 + draft.cells.filter(cell => cell.ownerId === nation.id).length * 12), morale: 85, supplies: 100, status: 'idle', route: [], progress: 0 }; }),
    events: [{ id: 1, day: 0, kind: 'system', text: `${draft.name}开始模拟`, reason: `玩家自建世界，种子「${draft.seed}」。地形、国家与城市由草稿编译；经营数值和外交初值采用沙盒规则，不代表正式世界史，没有预定赢家。` }], nextEventId: 2,
  };
  if (!validateWorld(world)) throw new Error('编译结果未通过模拟状态校验，原草稿保留。');
  return initializeStatecraft(world, 'peace');
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function id(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value); }
function finite(value: unknown, low: number, high: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high; }
function validText(value: unknown, max = 120): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max && [...value].every(character => character.charCodeAt(0) >= 32); }
function validPoint(value: unknown): value is Point { return record(value) && keys(value, ['x', 'y']) && finite(value.x, 0, WIDTH) && finite(value.y, 0, HEIGHT); }
function array(value: unknown, min: number, max: number): value is unknown[] { return Array.isArray(value) && value.length >= min && value.length <= max && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean); }
function assertDraft(draft: EditorDraft) { if (!validateDraft(draft)) throw new Error('草稿数据无效，未修改原草稿。'); }

export function validateDraft(raw: unknown): raw is EditorDraft {
  if (!record(raw) || !keys(raw, ['schemaVersion', 'id', 'name', 'seed', 'width', 'height', 'cells', 'nations', 'cities', 'rivers']) || raw.schemaVersion !== 1 || !id(raw.id) || !validText(raw.name) || !validText(raw.seed, 200) || raw.width !== WIDTH || raw.height !== HEIGHT || !array(raw.cells, 1, 1000) || !array(raw.nations, 0, 50) || !array(raw.cities, 0, 1000) || !array(raw.rivers, 0, 128)) return false;
  const ids = new Set<string>(), unique = (value: unknown): value is string => { if (!id(value) || ids.has(value)) return false; ids.add(value); return true; };
  for (const nation of raw.nations) if (!record(nation) || !keys(nation, ['id', 'name', 'color']) || !unique(nation.id) || !validText(nation.name) || typeof nation.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(nation.color)) return false;
  const nationIds = new Set((raw.nations as DraftNation[]).map(nation => nation.id));
  for (const cell of raw.cells) {
    if (!record(cell) || !keys(cell, ['id', 'polygon', 'center', 'neighbors', 'land', 'elevation', 'moisture', 'terrain', 'ownerId']) || !unique(cell.id) || !validPoint(cell.center) || !array(cell.polygon, 3, 200) || !cell.polygon.every(validPoint) || !array(cell.neighbors, 0, 1000) || !cell.neighbors.every(id) || new Set(cell.neighbors).size !== cell.neighbors.length || cell.neighbors.includes(cell.id) || typeof cell.land !== 'boolean' || !finite(cell.elevation, 0, 1) || !finite(cell.moisture, 0, 1) || !['plain', 'forest', 'mountain'].includes(cell.terrain as string) || (cell.ownerId !== null && !nationIds.has(cell.ownerId as string)) || (!cell.land && cell.ownerId !== null)) return false;
    const polygon = cell.polygon as Point[];
    if (new Set(polygon.map(point => `${point.x},${point.y}`)).size !== polygon.length || Math.abs(polygon.reduce((area, point, index) => { const next = polygon[(index + 1) % polygon.length]; return area + point.x * next.y - next.x * point.y; }, 0)) < 0.01 || !pointInPolygon(cell.center, polygon)) return false;
  }
  const cells = new Map((raw.cells as DraftCell[]).map(cell => [cell.id, cell]));
  for (const cell of cells.values()) if (!cell.neighbors.every(neighbor => cells.get(neighbor)?.neighbors.includes(cell.id))) return false;
  const cityCells = new Set<string>();
  for (const city of raw.cities) {
    if (!record(city) || !keys(city, ['id', 'name', 'cellId', 'capital']) || !unique(city.id) || !validText(city.name) || !id(city.cellId) || !cells.get(city.cellId)?.land || !cells.get(city.cellId)?.ownerId || cityCells.has(city.cellId) || typeof city.capital !== 'boolean') return false;
    cityCells.add(city.cellId);
  }
  let riverPoints = 0;
  for (const river of raw.rivers) { if (!array(river, 2, 1000) || !river.every(validPoint)) return false; riverPoints += river.length; }
  return riverPoints <= 5000;
}
