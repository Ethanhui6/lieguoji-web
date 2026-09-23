import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, digestFixture, digestScaleValue, OCEAN, validateFixture } from './fixture';
import { buildEntityBudgetIndex, componentCounts, createEntityBudgetComponent, digestEntityBudgetComponent, ENTITY_BUDGET_CASES, ENTITY_BUDGET_OPTIONS, measureEntityBudgets, measureEntityBudgetsForSource, queryEntityBudgetComponent, validateEntityBudgetComponent } from './entity-budget';
import type { EntityBudgetCaseId, EntityBudgetComponent, EntityBudgetQueryKind } from './entity-budget';
import type { ScaleFixture } from './types';

let source: ScaleFixture, sourceHash: string, baseline: EntityBudgetComponent;
const noWait = { yieldTask: async () => {} };
beforeAll(async () => { source = await createFixture({ ...ENTITY_BUDGET_OPTIONS }, noWait); sourceHash = await digestFixture(source); baseline = createEntityBudgetComponent(source, 'baseline'); });

describe('PH03 one-axis entity component experiments', () => {
  it('varies only its target counts with geography, regions and other totals fixed', async () => {
    const original = componentCounts(baseline), geoHash = await digestScaleValue(source.atlas);
    const permitted: Record<EntityBudgetCaseId, string[]> = { baseline: [], 'admin-leaves': ['adminLeaves'], 'admin-depth': ['adminParents', 'adminDepthMin', 'adminDepthMax'], cities: ['cities'], groups: ['groups'], people: ['people'], families: ['families'], organizations: ['organizations'], armies: ['armies'] };
    for (const caseId of ENTITY_BUDGET_CASES) {
      const component = createEntityBudgetComponent(source, caseId), counts = componentCounts(component);
      expect(validateEntityBudgetComponent(component)).toBe(true);
      expect(validateFixture(component)).toBe(false);
      expect(component.geography).toBe(source.atlas);
      expect(await digestScaleValue(component.geography)).toBe(geoHash);
      for (const key of Object.keys(original) as (keyof typeof original)[]) if (!permitted[caseId].includes(key)) expect(counts[key], `${caseId}/${key}`).toBe(original[key]);
    }
    expect(await digestFixture(source)).toBe(sourceHash);
  }, 20000);

  it('gives every extra administrative leaf real members without multiplying simulation regions', () => {
    const component = createEntityBudgetComponent(source, 'admin-leaves'), index = buildEntityBudgetIndex(component);
    expect(index.leaves).toHaveLength(2048); expect(component.entities.regions).toHaveLength(1024);
    for (const leaf of index.leaves) expect(index.cellsByAdmin.get(leaf)!.length).toBeGreaterThan(0);
    const region = new Map<number, Set<number>>();
    for (let cell = 0; cell < component.cellAdmin.length; cell++) { const id = component.geography.regionByCell[cell]; if (id !== OCEAN) { const admins = region.get(id) ?? new Set<number>(); admins.add(component.cellAdmin[cell]); region.set(id, admins); } }
    expect([...region.values()].some(admins => admins.size > 1)).toBe(true);
    const deep = createEntityBudgetComponent(source, 'admin-depth');
    expect(deep.cellAdmin).toEqual(baseline.cellAdmin);
    expect(componentCounts(deep)).toMatchObject({ adminLeaves: 1024, adminParents: 112, adminDepthMin: 3, adminDepthMax: 6 });
    expect(validateEntityBudgetComponent(deep)).toBe(true);
  });

  it('remaps necessary references and preserves population and grain in group splits', () => {
    const cities = createEntityBudgetComponent(source, 'cities'), families = createEntityBudgetComponent(source, 'families'), groups = createEntityBudgetComponent(source, 'groups');
    expect(new Set(cities.entities.groups.map(group => group.cityId)).size).toBe(4096);
    expect(new Set(families.entities.people.map(person => person.familyId)).size).toBe(2048);
    expect(cities.entities.groups.filter((group, id) => group.cityId !== baseline.entities.groups[id].cityId)).toHaveLength(8192);
    expect(families.entities.people.filter((person, id) => person.familyId !== baseline.entities.people[id].familyId)).toHaveLength(4096);
    expect(groups.population.every(value => value > 0)).toBe(true);
    expect(componentCounts(groups).population).toBe(componentCounts(baseline).population);
    expect(componentCounts(groups).grain).toBe(componentCounts(baseline).grain);
    expect(groups.entities.people).toEqual(baseline.entities.people);
  });

  it('performs real indexed queries over both old and added records', () => {
    for (const caseId of ENTITY_BUDGET_CASES.filter(value => value !== 'baseline')) {
      const component = createEntityBudgetComponent(source, caseId), index = buildEntityBudgetIndex(component);
      const kind: EntityBudgetQueryKind = caseId.startsWith('admin-') ? 'administration' : caseId as EntityBudgetQueryKind;
      const results = Array.from({ length: 256 }, (_, ordinal) => queryEntityBudgetComponent(component, index, kind, ordinal));
      expect(results.every(result => result.relatedCount > 0 && result.depth >= 1 && result.nationId < 32)).toBe(true);
      expect(new Set(results.map(result => result.selectedId)).size).toBeGreaterThan(100);
      if (caseId === 'people') expect(results.some(result => result.selectedId >= 8192)).toBe(true);
      if (caseId === 'armies') expect(results.some(result => result.selectedId >= 256)).toBe(true);
    }
  });

  it('rejects broken membership/refs/future fields and hashes every valid payload field', async () => {
    const noMembers = createEntityBudgetComponent(source, 'admin-leaves'), missing = noMembers.entities.administration.at(-1)!.id;
    for (let cell = 0; cell < noMembers.cellAdmin.length; cell++) if (noMembers.cellAdmin[cell] === missing) noMembers.cellAdmin[cell] = source.entities.regions[0].initialAdminId;
    expect(validateEntityBudgetComponent(noMembers)).toBe(false);
    const badFamily = structuredClone(baseline); badFamily.entities.people[0].familyId = 99999;
    expect(validateEntityBudgetComponent(badFamily)).toBe(false);
    const badTree = structuredClone(baseline); badTree.entities.administration[0].parentId = 0;
    expect(validateEntityBudgetComponent(badTree)).toBe(false);
    expect(validateEntityBudgetComponent({ ...baseline, version: 2 })).toBe(false);
    expect(validateEntityBudgetComponent({ ...baseline, extraFutureField: true })).toBe(false);
    const changed = structuredClone(baseline); changed.entities.people[0].name = '字段变更';
    expect(await digestEntityBudgetComponent(changed)).not.toBe(await digestEntityBudgetComponent(baseline));
    changed.geography.moisture[50] = 0.123;
    expect(await digestScaleValue(changed.geography)).not.toBe(await digestScaleValue(baseline.geography));
    expect(await digestFixture(source)).toBe(sourceHash);
  }, 10000);

  it('retains one-stage raw timings, 256 association results and explicit reference-change receipts', async () => {
    const report = await measureEntityBudgetsForSource(source, noWait);
    expect(report.sourceCreationMs).toBeNull(); expect(report.sourceHashBefore).toBe(sourceHash); expect(report.sourceHashAfter).toBe(sourceHash);
    expect(report.cases.map(item => item.caseId)).toEqual(ENTITY_BUDGET_CASES);
    for (const item of report.cases) {
      expect(item.geographyHash).toBe(report.geographyHash); expect(item.completeHash).toMatch(/^[a-f0-9]{64}$/); expect(item.logicalBytes).toBeGreaterThan(0);
      for (const raw of [item.createMs, item.validateMs, item.indexMs, item.geographyDigestMs, item.completeDigestMs, item.logicalByteCountMs]) { expect(raw).toHaveLength(1); expect(raw[0]).toBeGreaterThanOrEqual(0); }
      for (const query of Object.values(item.queries)) { expect(query.rawMs).toHaveLength(256); expect(query.results).toHaveLength(256); }
    }
    expect(report.cases.find(item => item.caseId === 'cities')!.changes.map(item => item.section).sort()).toEqual(['cities', 'groups']);
    expect(report.cases.find(item => item.caseId === 'families')!.changes.map(item => item.section).sort()).toEqual(['families', 'people']);
    expect(report.interpretation.join('')).toContain('不能拼接');
  }, 30000);

  it('cancels before publishing a report without changing the standard source', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(measureEntityBudgets({ signal: controller.signal, ...noWait })).rejects.toThrow('取消');
    await expect(measureEntityBudgetsForSource(source, { signal: controller.signal, ...noWait })).rejects.toThrow('取消');
    expect(await digestFixture(source)).toBe(sourceHash);
  });
});
