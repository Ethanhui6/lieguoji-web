import { byteSize, createFixture, digestFixture, digestScaleValue, OCEAN, scaleYield, validateFixture } from './fixture';
import type { ScaleAtlas, ScaleControl, ScaleEntities, ScaleFixture, ScaleOptions } from './types';

export type EntityBudgetCaseId = 'baseline' | 'admin-leaves' | 'admin-depth' | 'cities' | 'groups' | 'people' | 'families' | 'organizations' | 'armies';
export type EntityBudgetQueryKind = 'administration' | 'cities' | 'groups' | 'people' | 'families' | 'organizations' | 'armies';
export const ENTITY_BUDGET_CASES: readonly EntityBudgetCaseId[] = ['baseline', 'admin-leaves', 'admin-depth', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'];
export const ENTITY_BUDGET_OPTIONS: Readonly<ScaleOptions> = { seed: 'ph03-entity-budget-v1', scenario: 'continent', geoProfile: 'standard', entityProfile: 'standard' };
const QUERY_KINDS: readonly EntityBudgetQueryKind[] = ['administration', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'];
export type EntityBudgetComponent = {
  format: 'lieguoji-entity-budget-component'; version: 1; caseId: EntityBudgetCaseId;
  source: ScaleOptions; geography: ScaleAtlas; entities: ScaleEntities;
  /** Independent administrative membership: never aliases regionByCell. */
  cellAdmin: Uint32Array; population: Float64Array; grain: Float64Array; armyCell: Uint32Array;
};
export type EntityBudgetIndex = {
  leaves: number[]; cellsByAdmin: Map<number, number[]>; childrenByAdmin: Map<number, number[]>;
  citiesByAdmin: Map<number, number[]>; groupsByCity: Map<number, number[]>;
  peopleByGroup: Map<number, number[]>; peopleByFamily: Map<number, number[]>;
  organizationsByPerson: Map<number, number[]>; armiesByCity: Map<number, number[]>;
};
export type EntityBudgetQueryResult = { selectedId: number; nationId: number; relatedCount: number; population: number; referenceChecksum: number; depth: number };
export type EntityBudgetChange = { section: string; addedRecords: number; changedRecords: number; reason: string };
export type EntityBudgetCaseMeasurement = {
  caseId: EntityBudgetCaseId; counts: ReturnType<typeof componentCounts>; changes: EntityBudgetChange[];
  createMs: number[]; validateMs: number[]; indexMs: number[]; geographyDigestMs: number[]; completeDigestMs: number[]; logicalByteCountMs: number[];
  geographyHash: string; completeHash: string; logicalBytes: number;
  queries: Partial<Record<EntityBudgetQueryKind, { rawMs: number[]; results: EntityBudgetQueryResult[]; checksum: number }>>;
};
export type EntityBudgetReport = {
  format: 'lieguoji-entity-budget-measurement'; version: 1; options: ScaleOptions;
  sourceCreationMs: number | null; sourceHashBefore: string; sourceHashAfter: string;
  geographyHash: string; cases: EntityBudgetCaseMeasurement[]; elapsedMs: number;
  interpretation: string[];
};

const int = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const keys = (value: object, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const finite = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const label = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
function add(index: Map<number, number[]>, key: number, value: number) { const bucket = index.get(key); if (bucket) bucket.push(value); else index.set(key, [value]); }

/** Independent component format; production and original ScaleFixture validators reject it. */
export function createEntityBudgetComponent(source: ScaleFixture, caseId: EntityBudgetCaseId): EntityBudgetComponent {
  if (!validateFixture(source) || source.options.geoProfile !== 'standard' || source.options.entityProfile !== 'standard' || !ENTITY_BUDGET_CASES.includes(caseId)) throw new Error('实体独立预算必须使用有效的标准地理与标准实体源。');
  const component: EntityBudgetComponent = {
    format: 'lieguoji-entity-budget-component', version: 1, caseId, source: { ...source.options },
    geography: source.atlas, entities: structuredClone(source.entities),
    cellAdmin: Uint32Array.from(source.atlas.regionByCell, region => region === OCEAN ? OCEAN : source.state.regionAdmin[region]),
    population: source.state.population.slice(), grain: source.state.grain.slice(), armyCell: source.state.armyCell.slice(),
  };
  const e = component.entities;
  if (caseId === 'admin-leaves') {
    const oldLeaves = e.administration.filter(admin => admin.leaf);
    for (const leaf of oldLeaves) e.administration.push({ ...leaf, id: e.administration.length, name: `${leaf.name} · 独立分片` });
    const nationCells = Array.from({ length: e.nations.length }, () => [] as number[]), nationLeaves = Array.from({ length: e.nations.length }, () => [] as number[]);
    for (const leaf of e.administration) if (leaf.leaf) nationLeaves[leaf.nationId].push(leaf.id);
    for (let cell = 0; cell < component.cellAdmin.length; cell++) if (component.cellAdmin[cell] !== OCEAN) nationCells[e.administration[component.cellAdmin[cell]].nationId].push(cell);
    for (let nation = 0; nation < e.nations.length; nation++) {
      if (nationCells[nation].length < nationLeaves[nation].length) throw new Error('该国实际陆地不足以赋予每个行政叶真实成员。');
      // Round-robin within the original nation's actual cells; no new land or region.
      nationCells[nation].forEach((cell, index) => { component.cellAdmin[cell] = nationLeaves[nation][index % nationLeaves[nation].length]; });
    }
  } else if (caseId === 'admin-depth') {
    for (const nation of e.nations) {
      const existing = e.administration.filter(admin => admin.nationId === nation.id), first = e.administration.length, second = first + 1;
      e.administration.push({ id: first, nationId: nation.id, parentId: null, level: 1, leaf: false, name: `${nation.name} · 新第一层` }, { id: second, nationId: nation.id, parentId: first, level: 2, leaf: false, name: `${nation.name} · 新第二层` });
      for (const admin of existing) { admin.level += 2; if (admin.parentId === null) admin.parentId = second; }
      nation.depth += 2;
    }
  } else if (caseId === 'cities') {
    const original = e.cities.slice();
    for (const city of original) e.cities.push({ ...city, id: e.cities.length, name: `${city.name} · 聚落分点` });
    // Every additional city receives actual existing groups, keeping totals fixed.
    for (const group of e.groups) group.cityId = group.id % e.cities.length;
  } else if (caseId === 'groups') {
    const original = e.groups.slice(), count = original.length, population = new Float64Array(count * 2), grain = new Float64Array(count * 2);
    for (const group of original) {
      const id = group.id; e.groups.push({ ...group, id: count + id });
      population[id] = Math.floor(component.population[id] / 2); population[count + id] = component.population[id] - population[id];
      grain[id] = Math.floor(component.grain[id] / 2); grain[count + id] = component.grain[id] - grain[id];
    }
    component.population = population; component.grain = grain;
  } else if (caseId === 'people') {
    const length = e.people.length;
    for (let id = length; id < length * 2; id++) e.people.push({ id, groupId: id % e.groups.length, familyId: id % e.families.length, name: `额外合成人物 ${id + 1}` });
  } else if (caseId === 'families') {
    const length = e.families.length;
    for (let id = length; id < length * 2; id++) e.families.push({ id, originNationId: id % e.nations.length, name: `额外合成家族 ${id + 1}` });
    for (const person of e.people) person.familyId = person.id % e.families.length;
  } else if (caseId === 'organizations') {
    const length = e.organizations.length;
    for (let id = length; id < length * 2; id++) e.organizations.push({ id, cityId: id % e.cities.length, memberIds: Array.from({ length: 8 }, (_, offset) => (id * 8 + offset) % e.people.length) });
  } else if (caseId === 'armies') {
    const length = e.armies.length, positions = new Uint32Array(length * 2); positions.set(component.armyCell);
    for (let id = length; id < length * 2; id++) { const homeCityId = id % e.cities.length, cell = e.cities[homeCityId].cellId; e.armies.push({ id, nationId: e.administration[component.cellAdmin[cell]].nationId, homeCityId, personnel: 300 + id % 17 * 25 }); positions[id] = cell; }
    component.armyCell = positions;
  }
  return component;
}

export function componentCounts(c: EntityBudgetComponent) {
  const e = c.entities, leaves = e.administration.filter(admin => admin.leaf).length;
  return { samples: c.geography.land.length, regions: e.regions.length, nations: e.nations.length, adminLeaves: leaves, adminParents: e.administration.length - leaves, adminDepthMin: Math.min(...e.nations.map(nation => nation.depth)), adminDepthMax: Math.max(...e.nations.map(nation => nation.depth)), cities: e.cities.length, groups: e.groups.length, people: e.people.length, families: e.families.length, organizations: e.organizations.length, armies: e.armies.length, population: c.population.reduce((sum, value) => sum + value, 0), grain: c.grain.reduce((sum, value) => sum + value, 0) };
}

export function validateEntityBudgetComponent(raw: unknown): raw is EntityBudgetComponent {
  try {
    if (!raw || typeof raw !== 'object') return false;
    const c = raw as EntityBudgetComponent;
    if (!keys(c, ['format', 'version', 'caseId', 'source', 'geography', 'entities', 'cellAdmin', 'population', 'grain', 'armyCell']) || c.format !== 'lieguoji-entity-budget-component' || c.version !== 1 || !ENTITY_BUDGET_CASES.includes(c.caseId) || !c.source || !keys(c.source, ['seed', 'scenario', 'geoProfile', 'entityProfile']) || !label(c.source.seed) || !['continent', 'archipelago', 'mountains'].includes(c.source.scenario) || c.source.geoProfile !== 'standard' || c.source.entityProfile !== 'standard') return false;
    const a = c.geography, e = c.entities, n = 65536, v = 257 ** 2;
    if (!a || !keys(a, ['columns', 'rows', 'width', 'height', 'vertexX', 'vertexY', 'land', 'elevation', 'moisture', 'regionByCell']) || a.columns !== 256 || a.rows !== 256 || a.width !== 4096 || a.height !== 4096 || !(a.vertexX instanceof Float32Array) || !(a.vertexY instanceof Float32Array) || a.vertexX.length !== v || a.vertexY.length !== v || !(a.land instanceof Uint8Array) || !(a.elevation instanceof Float32Array) || !(a.moisture instanceof Float32Array) || !(a.regionByCell instanceof Uint32Array) || [a.land, a.elevation, a.moisture, a.regionByCell].some(values => values.length !== n) || !(c.cellAdmin instanceof Uint32Array) || c.cellAdmin.length !== n) return false;
    if (!e || !keys(e, ['nations', 'administration', 'regions', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'])) return false;
    const counts = { nations: 32, regions: 1024, cities: c.caseId === 'cities' ? 4096 : 2048, groups: c.caseId === 'groups' ? 32768 : 16384, people: c.caseId === 'people' ? 16384 : 8192, families: c.caseId === 'families' ? 2048 : 1024, organizations: c.caseId === 'organizations' ? 512 : 256, armies: c.caseId === 'armies' ? 512 : 256 };
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) if (!Array.isArray(e[key]) || e[key].length !== counts[key] || !e[key].every((item, id) => item && item.id === id)) return false;
    if (!Array.isArray(e.administration) || e.administration.length !== (c.caseId === 'admin-leaves' ? 2096 : c.caseId === 'admin-depth' ? 1136 : 1072) || !e.administration.every((item, id) => item && item.id === id)) return false;
    const members = new Uint32Array(e.administration.length);
    for (let vertex = 0; vertex < v; vertex++) { const x = vertex % 257, y = Math.floor(vertex / 257); if (!finite(a.vertexX[vertex], Math.max(0, (x - 0.12) * 16), Math.min(4096, (x + 0.12) * 16)) || !finite(a.vertexY[vertex], Math.max(0, (y - 0.12) * 16), Math.min(4096, (y + 0.12) * 16))) return false; }
    for (let cell = 0; cell < n; cell++) {
      if ((a.land[cell] !== 0 && a.land[cell] !== 1) || !finite(a.elevation[cell], 0, 1) || !finite(a.moisture[cell], 0, 1)) return false;
      if (!a.land[cell]) { if (a.regionByCell[cell] !== OCEAN || c.cellAdmin[cell] !== OCEAN) return false; }
      else { if (a.regionByCell[cell] >= 1024 || c.cellAdmin[cell] >= members.length) return false; members[c.cellAdmin[cell]]++; }
    }
    for (const nation of e.nations) if (!keys(nation, ['id', 'name', 'color', 'depth']) || !label(nation.name) || !int(nation.color, 0, 0xffffff) || nation.depth !== 1 + nation.id % 4 + (c.caseId === 'admin-depth' ? 2 : 0)) return false;
    let leafCount = 0;
    for (const admin of e.administration) {
      if (!keys(admin, ['id', 'nationId', 'parentId', 'level', 'leaf', 'name']) || !int(admin.nationId, 0, 31) || !int(admin.level, 1, e.nations[admin.nationId].depth) || !label(admin.name) || admin.leaf !== (admin.level === e.nations[admin.nationId].depth)) return false;
      if (admin.parentId === null) { if (admin.level !== 1) return false; }
      else { const parent = e.administration[admin.parentId]; if (!int(admin.parentId, 0, e.administration.length - 1) || !parent || parent.leaf || parent.nationId !== admin.nationId || parent.level !== admin.level - 1) return false; }
      if (admin.leaf) { if (!members[admin.id]) return false; leafCount++; } else if (members[admin.id]) return false;
    }
    if (leafCount !== (c.caseId === 'admin-leaves' ? 2048 : 1024)) return false;
    for (const region of e.regions) if (!keys(region, ['id', 'anchorCell', 'initialAdminId']) || !int(region.anchorCell, 0, n - 1) || !a.land[region.anchorCell] || a.regionByCell[region.anchorCell] !== region.id || !e.administration[region.initialAdminId]?.leaf) return false;
    for (const city of e.cities) if (!keys(city, ['id', 'cellId', 'regionId', 'name']) || !int(city.cellId, 0, n - 1) || !a.land[city.cellId] || !int(city.regionId, 0, 1023) || a.regionByCell[city.cellId] !== city.regionId || !label(city.name)) return false;
    if (!(c.population instanceof Float64Array) || !(c.grain instanceof Float64Array) || c.population.length !== e.groups.length || c.grain.length !== e.groups.length || !(c.armyCell instanceof Uint32Array) || c.armyCell.length !== e.armies.length) return false;
    const namedByGroup = new Uint32Array(e.groups.length), familyMembers = new Uint32Array(e.families.length), cityGroups = new Uint32Array(e.cities.length);
    for (const group of e.groups) { if (!keys(group, ['id', 'cityId', 'cultureId', 'faithId']) || !int(group.cityId, 0, e.cities.length - 1) || !int(group.cultureId, 0, 11) || !int(group.faithId, 0, 6) || !int(c.population[group.id], 1, 1e9) || !int(c.grain[group.id], 0, 1e12)) return false; cityGroups[group.cityId]++; }
    for (const family of e.families) if (!keys(family, ['id', 'originNationId', 'name']) || !int(family.originNationId, 0, 31) || !label(family.name)) return false;
    for (const person of e.people) { if (!keys(person, ['id', 'groupId', 'familyId', 'name']) || !int(person.groupId, 0, e.groups.length - 1) || !int(person.familyId, 0, e.families.length - 1) || !label(person.name)) return false; namedByGroup[person.groupId]++; familyMembers[person.familyId]++; }
    if (familyMembers.some(count => count === 0) || cityGroups.some(count => count === 0) || namedByGroup.some((count, group) => count > c.population[group])) return false;
    for (const org of e.organizations) if (!keys(org, ['id', 'cityId', 'memberIds']) || !int(org.cityId, 0, e.cities.length - 1) || !Array.isArray(org.memberIds) || org.memberIds.length !== 8 || new Set(org.memberIds).size !== 8 || !org.memberIds.every(id => int(id, 0, e.people.length - 1))) return false;
    for (const army of e.armies) if (!keys(army, ['id', 'nationId', 'homeCityId', 'personnel']) || !int(army.nationId, 0, 31) || !int(army.homeCityId, 0, e.cities.length - 1) || !int(army.personnel, 1, 1e6) || !int(c.armyCell[army.id], 0, n - 1) || !a.land[c.armyCell[army.id]]) return false;
    return true;
  } catch { return false; }
}

export function buildEntityBudgetIndex(c: EntityBudgetComponent): EntityBudgetIndex {
  const index: EntityBudgetIndex = { leaves: [], cellsByAdmin: new Map(), childrenByAdmin: new Map(), citiesByAdmin: new Map(), groupsByCity: new Map(), peopleByGroup: new Map(), peopleByFamily: new Map(), organizationsByPerson: new Map(), armiesByCity: new Map() };
  for (const admin of c.entities.administration) { if (admin.leaf) index.leaves.push(admin.id); if (admin.parentId !== null) add(index.childrenByAdmin, admin.parentId, admin.id); }
  for (let cell = 0; cell < c.cellAdmin.length; cell++) if (c.cellAdmin[cell] !== OCEAN) add(index.cellsByAdmin, c.cellAdmin[cell], cell);
  for (const city of c.entities.cities) add(index.citiesByAdmin, c.cellAdmin[city.cellId], city.id);
  for (const group of c.entities.groups) add(index.groupsByCity, group.cityId, group.id);
  for (const person of c.entities.people) { add(index.peopleByGroup, person.groupId, person.id); add(index.peopleByFamily, person.familyId, person.id); }
  for (const org of c.entities.organizations) for (const member of org.memberIds) add(index.organizationsByPerson, member, org.id);
  for (const army of c.entities.armies) add(index.armiesByCity, army.homeCityId, army.id);
  return index;
}

/** A real indexed relationship walk; selected IDs span both existing and added records. */
export function queryEntityBudgetComponent(c: EntityBudgetComponent, index: EntityBudgetIndex, kind: EntityBudgetQueryKind, ordinal: number): EntityBudgetQueryResult {
  if (!int(ordinal, 0, 1_000_000) || !QUERY_KINDS.includes(kind)) throw new Error('实体关系查询参数无效。');
  const e = c.entities, length = kind === 'administration' ? index.leaves.length : e[kind].length, selected = Math.floor(ordinal * 2654435761 % 4294967296) % length;
  const result: EntityBudgetQueryResult = { selectedId: kind === 'administration' ? index.leaves[selected] : selected, nationId: 0, relatedCount: 0, population: 0, referenceChecksum: 0, depth: 0 };
  const addRef = (id: number) => { result.relatedCount++; result.referenceChecksum = (Math.imul(result.referenceChecksum, 31) + id + 1) >>> 0; };
  function adminPath(id: number) { let node = e.administration[id]; result.nationId = node.nationId; result.depth = node.level; for (;;) { addRef(node.id); if (node.parentId === null) break; node = e.administration[node.parentId]; } }
  function group(id: number) { addRef(id); result.population += c.population[id]; for (const person of index.peopleByGroup.get(id) ?? []) { addRef(person); addRef(e.people[person].familyId); } }
  function city(id: number) { const value = e.cities[id]; addRef(value.cellId); adminPath(c.cellAdmin[value.cellId]); for (const groupId of index.groupsByCity.get(id) ?? []) group(groupId); for (const armyId of index.armiesByCity.get(id) ?? []) addRef(armyId); }
  function person(id: number) { const value = e.people[id], g = e.groups[value.groupId]; addRef(value.groupId); addRef(value.familyId); addRef(g.cityId); result.population += c.population[g.id]; adminPath(c.cellAdmin[e.cities[g.cityId].cellId]); for (const org of index.organizationsByPerson.get(id) ?? []) addRef(org); }
  if (kind === 'administration') { const id = result.selectedId; adminPath(id); for (const cell of index.cellsByAdmin.get(id) ?? []) addRef(cell); for (const cityId of index.citiesByAdmin.get(id) ?? []) city(cityId); }
  else if (kind === 'cities') city(selected);
  else if (kind === 'groups') { group(selected); adminPath(c.cellAdmin[e.cities[e.groups[selected].cityId].cellId]); }
  else if (kind === 'people') person(selected);
  else if (kind === 'families') { result.nationId = e.families[selected].originNationId; for (const member of index.peopleByFamily.get(selected) ?? []) person(member); }
  else if (kind === 'organizations') { addRef(e.organizations[selected].cityId); for (const member of e.organizations[selected].memberIds) person(member); }
  else { const army = e.armies[selected]; addRef(c.armyCell[selected]); addRef(army.personnel); city(army.homeCityId); }
  return result;
}

export async function digestEntityBudgetComponent(component: EntityBudgetComponent): Promise<string> {
  if (!validateEntityBudgetComponent(component)) throw new Error('实体预算组件引用或字段无效，拒绝摘要。');
  return digestScaleValue(component);
}

function changesAgainst(baseline: EntityBudgetComponent, component: EntityBudgetComponent): EntityBudgetChange[] {
  const permitted: Record<EntityBudgetCaseId, string[]> = { baseline: [], 'admin-leaves': ['administration', 'cellAdmin'], 'admin-depth': ['administration', 'nations'], cities: ['cities', 'groups'], groups: ['groups', 'population', 'grain'], people: ['people'], families: ['families', 'people'], organizations: ['organizations'], armies: ['armies', 'armyCell'] };
  const reason: Record<EntityBudgetCaseId, string> = { baseline: '标准实体基线。', 'admin-leaves': '增加同国行政叶，独立重分该国真实陆地成员；模拟区不变。', 'admin-depth': '每国增加两层合法父节点，原节点层级及国家深度同步；叶成员不变。', cities: '增加同地理位置的聚落分点，并重映射已有群体到新增城市，保证每城有真实群体。', groups: '拆分已有群体及其人口/粮食，两项总量严格保持；其他实体数量不变。', people: '增加具名角色并引用已有群体/家族；不另增人口总量。', families: '增加真实有成员的家族，必要重映射现有人物familyId；人物数量不变。', organizations: '增加组织并关联已有城市和8名实际人物。', armies: '增加军队结构及驻地；未执行征募/战斗/补给规则。' };
  const output: EntityBudgetChange[] = [];
  const sections = [...Object.keys(baseline.entities), 'cellAdmin', 'population', 'grain', 'armyCell'];
  for (const section of sections) {
    const a = (section in baseline.entities ? baseline.entities[section as keyof ScaleEntities] : baseline[section as 'cellAdmin' | 'population' | 'grain' | 'armyCell']) as ArrayLike<unknown>;
    const b = (section in component.entities ? component.entities[section as keyof ScaleEntities] : component[section as 'cellAdmin' | 'population' | 'grain' | 'armyCell']) as ArrayLike<unknown>;
    let changedRecords = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) changedRecords++;
    if (changedRecords || a.length !== b.length) { if (!permitted[component.caseId].includes(section)) throw new Error(`实体独立对照意外改变了 ${section}。`); output.push({ section, addedRecords: b.length - a.length, changedRecords, reason: reason[component.caseId] }); }
  }
  return output;
}

/** One explicit sample per stage; raw samples are retained, never labelled p95. */
export async function measureEntityBudgets(control?: ScaleControl): Promise<EntityBudgetReport> {
  const started = performance.now(), source = await createFixture({ ...ENTITY_BUDGET_OPTIONS }, control), sourceCreationMs = performance.now() - started;
  const report = await measureEntityBudgetsForSource(source, control);
  return { ...report, sourceCreationMs, elapsedMs: performance.now() - started };
}

/** Worker may share its own measured standard source; null means creation was measured outside. */
export async function measureEntityBudgetsForSource(source: ScaleFixture, control?: ScaleControl): Promise<EntityBudgetReport> {
  const started = performance.now();
  if (!validateFixture(source) || source.options.geoProfile !== 'standard' || source.options.entityProfile !== 'standard') throw new Error('实体预算源必须是标准规模。');
  const sourceHashBefore = await digestFixture(source), geographyHash = await digestScaleValue(source.atlas), baseline = createEntityBudgetComponent(source, 'baseline');
  const cases: EntityBudgetCaseMeasurement[] = [];
  for (const caseId of ENTITY_BUDGET_CASES) {
    await scaleYield(control, `独立实体预算：${caseId}`, cases.length, ENTITY_BUDGET_CASES.length);
    let start = performance.now(); const component = createEntityBudgetComponent(source, caseId), createMs = performance.now() - start;
    start = performance.now(); const valid = validateEntityBudgetComponent(component), validateMs = performance.now() - start;
    if (!valid) throw new Error(`独立实体对照 ${caseId} 引用校验失败。`);
    start = performance.now(); const index = buildEntityBudgetIndex(component), indexMs = performance.now() - start;
    const queries: EntityBudgetCaseMeasurement['queries'] = {}, kinds = caseId === 'baseline' ? QUERY_KINDS : [caseId.startsWith('admin-') ? 'administration' as const : caseId as EntityBudgetQueryKind];
    for (const kind of kinds) {
      const rawMs: number[] = [], results: EntityBudgetQueryResult[] = []; let checksum = 0;
      for (let query = 0; query < 256; query++) { start = performance.now(); const result = queryEntityBudgetComponent(component, index, kind, query); rawMs.push(performance.now() - start); results.push(result); checksum = (checksum + result.referenceChecksum) >>> 0; }
      queries[kind] = { rawMs, results, checksum };
    }
    start = performance.now(); const geometry = await digestScaleValue(component.geography), geographyDigestMs = performance.now() - start;
    if (geometry !== geographyHash) throw new Error('独立实体对照改变了标准地理摘要。');
    start = performance.now(); const completeHash = await digestEntityBudgetComponent(component), completeDigestMs = performance.now() - start;
    start = performance.now(); const logicalBytes = byteSize(component), logicalByteCountMs = performance.now() - start;
    cases.push({ caseId, counts: componentCounts(component), changes: changesAgainst(baseline, component), createMs: [createMs], validateMs: [validateMs], indexMs: [indexMs], geographyDigestMs: [geographyDigestMs], completeDigestMs: [completeDigestMs], logicalByteCountMs: [logicalByteCountMs], geographyHash: geometry, completeHash, logicalBytes, queries });
  }
  const sourceHashAfter = await digestFixture(source);
  if (sourceHashAfter !== sourceHashBefore) throw new Error('实体独立测量改变了标准源数据。');
  await scaleYield(control, '独立实体预算完成', cases.length, ENTITY_BUDGET_CASES.length);
  return { format: 'lieguoji-entity-budget-measurement', version: 1, options: { ...source.options }, sourceCreationMs: null, sourceHashBefore, sourceHashAfter, geographyHash, cases, elapsedMs: performance.now() - started, interpretation: ['固定65,536地理样本、1024模拟区和32国家；每次只增加指定目标及明示的必要引用映射。', '各阶段为单次原始样本；查询保留256次真实关系遍历与结果，未把单次阶段耗时称为p95。', '完整字段摘要耗时包含自身的严格引用校验；地理摘要单列计时。', '各组件高点是有约束对照，不能拼接成可同时支持的总容量。', '行政叶数量对照有真实成员，不代表已实现有约束自动区划。城市分点共享样本位置，群体分别归属且总人口不变。', '未测完整人口/财政/家族/信仰/军事规则；人物是群体中的角色，不额外计入人口。', 'logicalBytes是逻辑载荷，不是浏览器堆、磁盘占用或设备内存承诺。'] };
}
