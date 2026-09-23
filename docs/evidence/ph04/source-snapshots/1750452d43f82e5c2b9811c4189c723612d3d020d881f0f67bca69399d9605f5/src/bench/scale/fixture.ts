import type { ScaleAtlas, ScaleBudget, ScaleControl, ScaleEntities, ScaleFixture, ScaleOptions, ScalePoint, ScaleProfile, ScaleState } from './types';

export const OCEAN = 0xffffffff;
export const SCALE_DIMENSIONS: Record<ScaleProfile, number> = { basic: 128, standard: 256, extended: 512 };
export const SCALE_BUDGETS: Record<ScaleProfile, ScaleBudget> = {
  basic: { regions: 256, nations: 16, cities: 512, groups: 4096, people: 2048, families: 256, organizations: 64, armies: 64 },
  standard: { regions: 1024, nations: 32, cities: 2048, groups: 16384, people: 8192, families: 1024, organizations: 256, armies: 256 },
  extended: { regions: 4096, nations: 64, cities: 8192, groups: 65536, people: 32768, families: 4096, organizations: 1024, armies: 1024 },
};
const LIMITATIONS = ['独立本地结构实验，不能导入生产游戏。', '结构批次只计算合成群体的定量生产与消耗，不代表完整社会日结。', '迁徙、家族生命周期、信仰传播、财政物流、真实战斗与自主决策尚未测量。'];
const encoder = new TextEncoder();
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: object, names: string[]) => Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

function hashSeed(seed: string) { let result = 2166136261; for (const char of seed) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }
function randomAt(x: number, y: number, seed: number) { let v = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ seed; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967295; }
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = randomAt(ix, iy, seed), b = randomAt(ix + 1, iy, seed), c = randomAt(ix, iy + 1, seed), d = randomAt(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function field(x: number, y: number, seed: number, scenario: ScaleOptions['scenario']) {
  const base = noise(x * 5, y * 5, seed), detail = noise(x * 17, y * 17, seed ^ 0x37c8);
  const edge = Math.min(x, y, 1 - x, 1 - y);
  let coast: number;
  if (scenario === 'archipelago') coast = Math.sin(x * 23 + (seed % 17)) * Math.cos(y * 21 + (seed % 11)) * 0.42 + (base - 0.5) * 0.5 + 0.19;
  else coast = 1 - ((x - 0.48) / 0.47) ** 2 - ((y - 0.51) / 0.44) ** 2 + (base - 0.5) * 0.95 + (detail - 0.5) * 0.2;
  const land = edge > 0.025 && coast > 0;
  const ridge = scenario === 'mountains' ? Math.abs(Math.sin((x + y * 0.6) * 19 + base * 3)) ** 6 : Math.abs(Math.sin(x * 10 + y * 9 + base * 4)) ** 5;
  return { land, elevation: land ? Math.min(0.98, 0.12 + base * 0.42 + ridge * (scenario === 'mountains' ? 0.45 : 0.32)) : 0.02 + base * 0.06, moisture: Math.min(1, Math.max(0, noise(x * 9, y * 9, seed ^ 0x5a92) * 0.8 + (1 - ridge) * 0.2)) };
}

export async function scaleYield(control: ScaleControl | undefined, stage: string, completed: number, total: number) {
  if (control?.signal?.aborted) throw new Error('规模实验已取消；原数据保持不变。');
  control?.onProgress?.({ stage, completed, total });
  if (control?.yieldTask) await control.yieldTask();
  else await new Promise<void>(resolve => setTimeout(resolve, 0));
  if (control?.signal?.aborted) throw new Error('规模实验已取消；原数据保持不变。');
}

export function validOptions(raw: unknown): raw is ScaleOptions {
  return record(raw) && keys(raw, ['seed', 'scenario', 'geoProfile', 'entityProfile']) && text(raw.seed, 120) && ['continent', 'archipelago', 'mountains'].includes(raw.scenario as string) && Object.hasOwn(SCALE_DIMENSIONS, raw.geoProfile as string) && Object.hasOwn(SCALE_BUDGETS, raw.entityProfile as string);
}

/** Deterministic continuous fields at three resolutions over the same 4096-square extent. */
export async function createFixture(options: ScaleOptions, control?: ScaleControl): Promise<ScaleFixture> {
  if (!validOptions(options)) throw new Error('规模实验的种子、场景或规模档无效。');
  const config = { ...options }, columns = SCALE_DIMENSIONS[config.geoProfile], rows = columns, count = columns * rows;
  const budget = SCALE_BUDGETS[config.entityProfile], seed = hashSeed(config.seed), step = 4096 / columns;
  const atlas: ScaleAtlas = { columns, rows, width: 4096, height: 4096, vertexX: new Float32Array((columns + 1) * (rows + 1)), vertexY: new Float32Array((columns + 1) * (rows + 1)), land: new Uint8Array(count), elevation: new Float32Array(count), moisture: new Float32Array(count), regionByCell: new Uint32Array(count).fill(OCEAN) };
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const id = row * (columns + 1) + col;
      atlas.vertexX[id] = col * step + (col === 0 || col === columns ? 0 : (randomAt(col, row, seed ^ 0xa32) - 0.5) * step * 0.22);
      atlas.vertexY[id] = row * step + (row === 0 || row === rows ? 0 : (randomAt(col, row, seed ^ 0xb47) - 0.5) * step * 0.22);
    }
    if (row % 32 === 0) await scaleYield(control, '共享地理顶点', row, rows);
  }
  const landCells: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = row * columns + col, values = field((col + 0.5) / columns, (row + 0.5) / rows, seed, config.scenario);
      atlas.land[id] = Number(values.land); atlas.elevation[id] = values.elevation; atlas.moisture[id] = values.moisture;
      if (values.land) landCells.push(id);
    }
    if (row % 32 === 0) await scaleYield(control, '连续海陆与地形场', row, rows);
  }
  if (landCells.length < budget.regions) throw new Error(`当前种子只有 ${landCells.length} 个陆地样本，不足以安置 ${budget.regions} 个模拟区。`);
  const entities: ScaleEntities = { nations: [], administration: [], regions: [], cities: [], groups: [], people: [], families: [], organizations: [], armies: [] };
  const leaves: number[][] = [], palette = [0xd8b973, 0x669993, 0xb97d74, 0x909aba, 0x9fa773, 0xb192aa, 0x76a9ba, 0xc79b77];
  for (let nation = 0; nation < budget.nations; nation++) {
    const depth = 1 + nation % 4;
    entities.nations.push({ id: nation, name: `合成国 ${nation + 1}`, color: palette[nation % palette.length], depth });
    let parentId: number | null = null;
    for (let level = 1; level < depth; level++) {
      const id = entities.administration.length;
      entities.administration.push({ id, nationId: nation, parentId, level, leaf: false, name: `国${nation + 1} · 第${level}层行政` }); parentId = id;
    }
    leaves[nation] = [];
    for (let index = 0; index < budget.regions / budget.nations; index++) {
      const id = entities.administration.length;
      entities.administration.push({ id, nationId: nation, parentId, level: depth, leaf: true, name: `国${nation + 1} · 辖区${index + 1}` }); leaves[nation].push(id);
    }
  }
  const queue = new Uint32Array(landCells.length); let tail = 0;
  for (let id = 0; id < budget.regions; id++) {
    const anchorCell = landCells[Math.floor(id * landCells.length / budget.regions)], nationId = id % budget.nations;
    const initialAdminId = leaves[nationId][Math.floor(id / budget.nations)];
    entities.regions.push({ id, anchorCell, initialAdminId }); atlas.regionByCell[anchorCell] = id; queue[tail++] = anchorCell;
  }
  // Multi-source land flood fill: bounded implicit four-neighbor topology.
  for (let head = 0; head < tail; head++) {
    const id = queue[head], region = atlas.regionByCell[id], col = id % columns;
    for (const next of [col > 0 ? id - 1 : -1, col < columns - 1 ? id + 1 : -1, id - columns, id + columns]) {
      if (next >= 0 && next < count && atlas.land[next] && atlas.regionByCell[next] === OCEAN) { atlas.regionByCell[next] = region; queue[tail++] = next; }
    }
    if (head % 16384 === 0) await scaleYield(control, '联合模拟区拓扑', head, landCells.length);
  }
  // Small islands without a seed remain real land and join a nearby anchor;
  // administrative regions may contain separate islands (no invented land bridge).
  const regionCells = Array.from({ length: budget.regions }, () => [] as number[]);
  for (let index = 0; index < landCells.length; index++) {
    const cell = landCells[index];
    if (atlas.regionByCell[cell] === OCEAN) atlas.regionByCell[cell] = Math.min(budget.regions - 1, Math.floor(index * budget.regions / landCells.length));
    regionCells[atlas.regionByCell[cell]].push(cell);
  }
  for (let id = 0; id < budget.cities; id++) { const regionId = id % budget.regions, candidates = regionCells[regionId]; entities.cities.push({ id, regionId, cellId: candidates[Math.floor(id / budget.regions) % candidates.length], name: `合成城 ${id + 1}` }); }
  for (let id = 0; id < budget.groups; id++) entities.groups.push({ id, cityId: id % budget.cities, cultureId: id % 12, faithId: id % 7 });
  for (let id = 0; id < budget.families; id++) entities.families.push({ id, originNationId: id % budget.nations, name: `合成家族 ${id + 1}` });
  for (let id = 0; id < budget.people; id++) entities.people.push({ id, groupId: id % budget.groups, familyId: id % budget.families, name: `合成人物 ${id + 1}` });
  for (let id = 0; id < budget.organizations; id++) entities.organizations.push({ id, cityId: id % budget.cities, memberIds: Array.from({ length: 8 }, (_, offset) => (id * 8 + offset) % budget.people) });
  for (let id = 0; id < budget.armies; id++) { const homeCityId = id % budget.cities, region = entities.cities[homeCityId].regionId; entities.armies.push({ id, nationId: entities.administration[entities.regions[region].initialAdminId].nationId, homeCityId, personnel: 300 + id % 17 * 25 }); }
  const population = Float64Array.from(entities.groups, group => 500 + Math.floor(randomAt(group.id, 0, seed ^ 0xaff) * 4500));
  const state: ScaleState = { revision: 0, batch: 0, elevationOverrides: [], regionAdmin: Uint32Array.from(entities.regions, region => region.initialAdminId), population, grain: Float64Array.from(population, value => value * 30), armyCell: Uint32Array.from(entities.armies, army => entities.cities[army.homeCityId].cellId) };
  const fixture: ScaleFixture = { format: 'lieguoji-scale-fixture', version: 1, generatorVersion: 'ph03-structure-v1', options: config, atlas, entities, state, counts: { ...budget, samples: count, land: landCells.length, adminParents: entities.administration.length - budget.regions, adminTotal: entities.administration.length }, limitations: [...LIMITATIONS] };
  await scaleYield(control, '联合引用与数据校验', 0, 1);
  if (!validateFixture(fixture)) throw new Error('规模实验生成结果未通过拓扑及实体引用校验。');
  await scaleYield(control, '完成', 1, 1);
  return fixture;
}

export function cellPolygon(fixture: ScaleFixture, cellId: number): ScalePoint[] {
  const a = fixture.atlas;
  if (!integer(cellId, 0, a.columns * a.rows - 1)) throw new Error('地理样本编号无效。');
  const col = cellId % a.columns, row = Math.floor(cellId / a.columns), base = row * (a.columns + 1) + col;
  return [base, base + 1, base + a.columns + 2, base + a.columns + 1].map(id => ({ x: a.vertexX[id], y: a.vertexY[id] }));
}
export function cellCenter(fixture: ScaleFixture, cellId: number): ScalePoint { const points = cellPolygon(fixture, cellId); return { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 }; }
export function cellAt(fixture: ScaleFixture, point: ScalePoint): number | undefined {
  const a = fixture.atlas;
  if (!finite(point.x, 0, a.width) || !finite(point.y, 0, a.height)) return undefined;
  const col = Math.min(a.columns - 1, Math.floor(point.x / a.width * a.columns)), row = Math.min(a.rows - 1, Math.floor(point.y / a.height * a.rows));
  for (let y = Math.max(0, row - 1); y <= Math.min(a.rows - 1, row + 1); y++) for (let x = Math.max(0, col - 1); x <= Math.min(a.columns - 1, col + 1); x++) {
    const id = y * a.columns + x, polygon = cellPolygon(fixture, id);
    if (polygon.every((p, i) => { const q = polygon[(i + 1) % 4]; return (q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x) >= -0.00001; })) return id;
  }
  return undefined;
}
export function elevationAt(fixture: ScaleFixture, cellId: number): number {
  const entries = fixture.state.elevationOverrides; let low = 0, high = entries.length;
  while (low < high) { const mid = (low + high) >>> 1; if (entries[mid].cellId < cellId) low = mid + 1; else high = mid; }
  return entries[low]?.cellId === cellId ? entries[low].elevation : fixture.atlas.elevation[cellId];
}
export function nationAt(fixture: ScaleFixture, cellId: number): number | undefined {
  const region = fixture.atlas.regionByCell[cellId];
  return region === undefined || region === OCEAN ? undefined : fixture.entities.administration[fixture.state.regionAdmin[region]].nationId;
}

export function validateState(raw: unknown, fixture: Pick<ScaleFixture, 'atlas' | 'entities'>): raw is ScaleState {
  if (!record(raw) || !keys(raw, ['revision', 'batch', 'elevationOverrides', 'regionAdmin', 'population', 'grain', 'armyCell']) || !integer(raw.revision, 0, 1_000_000) || !integer(raw.batch, 0, 1_000_000) || !(raw.regionAdmin instanceof Uint32Array) || !(raw.population instanceof Float64Array) || !(raw.grain instanceof Float64Array) || !(raw.armyCell instanceof Uint32Array) || !Array.isArray(raw.elevationOverrides)) return false;
  const { atlas, entities } = fixture;
  if (raw.regionAdmin.length !== entities.regions.length || raw.population.length !== entities.groups.length || raw.grain.length !== entities.groups.length || raw.armyCell.length !== entities.armies.length || raw.elevationOverrides.length > atlas.land.length) return false;
  for (const id of raw.regionAdmin) if (!entities.administration[id]?.leaf) return false;
  for (let i = 0; i < raw.population.length; i++) if (!integer(raw.population[i], 0, 1e9) || !integer(raw.grain[i], 0, 1e12)) return false;
  for (const id of raw.armyCell) if (id >= atlas.land.length || !atlas.land[id]) return false;
  let previous = -1;
  for (const item of raw.elevationOverrides) { if (!record(item) || !keys(item, ['cellId', 'elevation']) || !integer(item.cellId, previous + 1, atlas.land.length - 1) || !finite(item.elevation, 0, 1)) return false; previous = item.cellId; }
  return true;
}

/** Strict format/count/reference validation; never widens the production validators. */
export function validateFixture(raw: unknown): raw is ScaleFixture {
  try {
    if (!record(raw) || !keys(raw, ['format', 'version', 'generatorVersion', 'options', 'atlas', 'entities', 'state', 'counts', 'limitations']) || raw.format !== 'lieguoji-scale-fixture' || raw.version !== 1 || raw.generatorVersion !== 'ph03-structure-v1' || !validOptions(raw.options) || !record(raw.atlas) || !record(raw.entities) || !record(raw.counts) || !Array.isArray(raw.limitations) || raw.limitations.length !== LIMITATIONS.length || !raw.limitations.every((v, i) => v === LIMITATIONS[i])) return false;
    const f = raw as unknown as ScaleFixture, a = f.atlas, e = f.entities, b = SCALE_BUDGETS[f.options.entityProfile], size = SCALE_DIMENSIONS[f.options.geoProfile], count = size * size, vertices = (size + 1) ** 2;
    if (!keys(a, ['columns', 'rows', 'width', 'height', 'vertexX', 'vertexY', 'land', 'elevation', 'moisture', 'regionByCell']) || !keys(e, ['nations', 'administration', 'regions', 'cities', 'groups', 'people', 'families', 'organizations', 'armies']) || !keys(f.counts, [...Object.keys(b), 'samples', 'land', 'adminParents', 'adminTotal']) || a.width !== 4096 || a.height !== 4096 || a.columns !== size || a.rows !== size || !(a.vertexX instanceof Float32Array) || !(a.vertexY instanceof Float32Array) || a.vertexX.length !== vertices || a.vertexY.length !== vertices || !(a.land instanceof Uint8Array) || !(a.elevation instanceof Float32Array) || !(a.moisture instanceof Float32Array) || !(a.regionByCell instanceof Uint32Array) || [a.land, a.elevation, a.moisture, a.regionByCell].some(arr => arr.length !== count)) return false;
    for (let i = 0; i < vertices; i++) { const col = i % (size + 1), row = Math.floor(i / (size + 1)), step = 4096 / size; if (!finite(a.vertexX[i], Math.max(0, (col - 0.12) * step), Math.min(4096, (col + 0.12) * step)) || !finite(a.vertexY[i], Math.max(0, (row - 0.12) * step), Math.min(4096, (row + 0.12) * step))) return false; }
    for (const key of Object.keys(b) as (keyof ScaleBudget)[]) if (!Array.isArray(e[key]) || e[key].length !== b[key] || f.counts[key] !== b[key] || !e[key].every((item, index) => record(item) && item.id === index)) return false;
    if (!Array.isArray(e.administration) || e.administration.length > b.regions + b.nations * 3 || f.counts.adminTotal !== e.administration.length || f.counts.adminParents !== e.administration.length - b.regions || f.counts.samples !== count) return false;
    let land = 0;
    for (let id = 0; id < count; id++) { if (!finite(a.elevation[id], 0, 1) || !finite(a.moisture[id], 0, 1) || (a.land[id] !== 0 && a.land[id] !== 1) || (a.land[id] ? a.regionByCell[id] >= b.regions : a.regionByCell[id] !== OCEAN)) return false; land += a.land[id]; }
    if (f.counts.land !== land || land < b.regions) return false;
    for (const nation of e.nations) if (!keys(nation, ['id', 'name', 'color', 'depth']) || !text(nation.name) || !integer(nation.color, 0, 0xffffff) || nation.depth !== 1 + nation.id % 4) return false;
    let leaves = 0;
    for (let index = 0; index < e.administration.length; index++) {
      const admin = e.administration[index];
      if (!record(admin) || !keys(admin, ['id', 'nationId', 'parentId', 'level', 'leaf', 'name']) || admin.id !== index || !integer(admin.nationId, 0, b.nations - 1) || !integer(admin.level, 1, e.nations[admin.nationId].depth) || typeof admin.leaf !== 'boolean' || admin.leaf !== (admin.level === e.nations[admin.nationId].depth) || !text(admin.name)) return false;
      if (admin.parentId === null) { if (admin.level !== 1) return false; }
      else if (!integer(admin.parentId, 0, index - 1) || e.administration[admin.parentId].nationId !== admin.nationId || e.administration[admin.parentId].level !== admin.level - 1 || e.administration[admin.parentId].leaf) return false;
      leaves += Number(admin.leaf);
    }
    if (leaves !== b.regions) return false;
    const seenLeaves = new Set<number>();
    for (const region of e.regions) { if (!keys(region, ['id', 'anchorCell', 'initialAdminId']) || !integer(region.anchorCell, 0, count - 1) || !a.land[region.anchorCell] || a.regionByCell[region.anchorCell] !== region.id || !e.administration[region.initialAdminId]?.leaf || seenLeaves.has(region.initialAdminId)) return false; seenLeaves.add(region.initialAdminId); }
    for (const city of e.cities) if (!keys(city, ['id', 'cellId', 'regionId', 'name']) || !integer(city.cellId, 0, count - 1) || !a.land[city.cellId] || !integer(city.regionId, 0, b.regions - 1) || a.regionByCell[city.cellId] !== city.regionId || !text(city.name)) return false;
    for (const group of e.groups) if (!keys(group, ['id', 'cityId', 'cultureId', 'faithId']) || !integer(group.cityId, 0, b.cities - 1) || !integer(group.cultureId, 0, 11) || !integer(group.faithId, 0, 6)) return false;
    for (const family of e.families) if (!keys(family, ['id', 'originNationId', 'name']) || !integer(family.originNationId, 0, b.nations - 1) || !text(family.name)) return false;
    for (const person of e.people) if (!keys(person, ['id', 'groupId', 'familyId', 'name']) || !integer(person.groupId, 0, b.groups - 1) || !integer(person.familyId, 0, b.families - 1) || !text(person.name)) return false;
    for (const org of e.organizations) if (!keys(org, ['id', 'cityId', 'memberIds']) || !integer(org.cityId, 0, b.cities - 1) || !Array.isArray(org.memberIds) || org.memberIds.length !== 8 || new Set(org.memberIds).size !== org.memberIds.length || !org.memberIds.every(id => integer(id, 0, b.people - 1))) return false;
    for (const army of e.armies) if (!keys(army, ['id', 'nationId', 'homeCityId', 'personnel']) || !integer(army.nationId, 0, b.nations - 1) || !integer(army.homeCityId, 0, b.cities - 1) || !integer(army.personnel, 1, 1e6)) return false;
    return validateState(f.state, f);
  } catch { return false; }
}

/** Deterministic metadata + exact typed-array bytes, including array constructor tags. */
async function digestValue(value: unknown): Promise<string> {
  const buffers = new Map<ArrayBufferView, { type: string; bytes: number; sha256: string }>();
  const pending: Promise<void>[] = [];
  function collect(item: unknown) {
    if (ArrayBuffer.isView(item)) { if (!buffers.has(item)) { buffers.set(item, { type: item.constructor.name, bytes: item.byteLength, sha256: '' }); pending.push(sha(new Uint8Array(item.buffer, item.byteOffset, item.byteLength)).then(hash => { buffers.get(item)!.sha256 = hash; })); } return; }
    if (item && typeof item === 'object') {
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('结构摘要不支持此对象类型，拒绝遗漏字段。');
      for (const nested of Object.values(item)) collect(nested);
    } else if (item !== null && (typeof item !== 'string' && typeof item !== 'boolean' && (typeof item !== 'number' || !Number.isFinite(item)))) throw new Error('结构摘要不支持缺失或非有限数值。');
  }
  collect(value); await Promise.all(pending);
  // All metadata fields remain in the canonical representation. No mutable-input cache.
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (ArrayBuffer.isView(item)) return buffers.get(item);
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    return item;
  });
  return sha(encoder.encode(serialized));
}
async function sha(bytes: Uint8Array) { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer))].map(value => value.toString(16).padStart(2, '0')).join(''); }
export async function digestFixture(fixture: ScaleFixture): Promise<string> { if (!validateFixture(fixture)) throw new Error('规模数据无效，无法生成校验和。'); return digestValue(fixture); }
export async function digestScaleValue(value: unknown): Promise<string> { return digestValue(value); }

/** Logical serialized bytes: UTF-8 JSON metadata, typed buffers counted once per occurrence. */
export function byteSize(value: unknown): number {
  if (ArrayBuffer.isView(value)) return value.byteLength + encoder.encode(JSON.stringify({ type: value.constructor.name, bytes: value.byteLength })).byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (Array.isArray(value)) return 2 + Math.max(0, value.length - 1) + value.reduce((sum, item) => sum + byteSize(item), 0);
  if (value && typeof value === 'object') { const entries = Object.entries(value); return 2 + Math.max(0, entries.length - 1) + entries.reduce((sum, [key, item]) => sum + encoder.encode(JSON.stringify(key)).byteLength + 1 + byteSize(item), 0); }
  const serialized = JSON.stringify(value); if (serialized === undefined) throw new Error('逻辑字节测量不支持 undefined。'); return encoder.encode(serialized).byteLength;
}
