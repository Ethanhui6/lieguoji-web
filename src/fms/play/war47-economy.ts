import type {GameEvent, NationReport, Province, World} from '../../sim/types';
import {nationsAtWar} from './realtime-statecraft';
import type {FiscalState} from './fiscal15-state';
import {canRefill47, landHolders47, rationPoints47, readArmySpace47, type ArmySpace47, type ArmySpaceInput47} from './army-space47';

type EmitEvent = (world: World, kind: GameEvent['kind'], text: string, reason: string) => void;
const MAX_GRAIN = 1_000_000_000_000;
const contested = (world: World, p: Province, space: ArmySpace47) =>
  landHolders47(space, p.id).some(a => nationsAtWar(world, a.nationId, p.controller));

/** Fork of war29-food's daily grain ledger/report only. Diplomacy commands and
 * schema validation remain separate; this does not run their old land-anchor
 * queries. Consumption rates, population and finite grain accounting persist.
 * Runtime supplies a current, trusted spatial input for each operation. */
export function createArmyEconomy47(finance: FiscalState, spatial: () => ArmySpaceInput47, dayFactor=1) {
  if(!Number.isFinite(dayFactor)||dayFactor<=0)throw Error('口粮日长无效。');
  const capacity = (p: Province) => finance.provinces[p.id].maxPopulation;
  const production = (p: Province, population: number, occupied: boolean) =>
    Math.floor(Math.min(population, capacity(p)) * (p.terrain === 'plain' ? 1.12 : p.terrain === 'forest' ? 1.04 : 0.82) * (occupied ? 0.5 : 1));

  function buildNationReports(world: World): NationReport[] {
    if (!world.statecraft) return [];
    const space = readArmySpace47(world, spatial());
    const economies = new Map(world.statecraft.provinces.map(p => [p.provinceId, p]));
    return world.nations.map(nation => {
      const policy = world.statecraft!.nations.find(n => n.nationId === nation.id)!;
      const provinces = world.provinces.filter(p => p.controller === nation.id);
      const armies = [...space.byArmy.values()].filter(v => v.army.nationId === nation.id);
      const population = provinces.reduce((sum, p) => sum + economies.get(p.id)!.population, 0);
      const productionPerDay = provinces.reduce((sum, p) => sum + production(p, economies.get(p.id)!.population, contested(world, p, space)), 0);
      const militaryNeedPerDay = armies.reduce((sum, v) => sum + Math.ceil(rationPoints47(v,dayFactor) * (v.army.troops / 10) / 6), 0);
      return {
        nationId: nation.id, population, grain: provinces.reduce((sum, p) => sum + economies.get(p.id)!.grain, 0),
        productionPerDay, civilianNeedPerDay: population, militaryNeedPerDay,
        balancePerDay: productionPerDay - population - militaryNeedPerDay,
        territoryCount: provinces.length, armyCount: armies.length,
        warCount: world.statecraft!.relations.filter(r => (r.a === nation.id || r.b === nation.id) && r.status === 'war').length,
        priority: policy.priority, lastLedger: policy.lastLedger ? {...policy.lastLedger} : null,
        lastDecision: policy.lastDecision ? {...policy.lastDecision} : null,
      };
    });
  }

  /** Mutates only the caller's candidate transaction, after spatial validation.
   * Sea armies consume carried supplies but have no land-store membership. */
  function advanceEconomy(world: World, emit: EmitEvent) {
    const space = readArmySpace47(world, spatial());
    const management = world.statecraft!;
    const policies = new Map(management.nations.map(p => [p.nationId, p]));
    const provinces = new Map(world.provinces.map(p => [p.id, p]));
    for (const v of space.byArmy.values()) v.army.supplies = Math.max(0, v.army.supplies - rationPoints47(v,dayFactor));
    for (const p of management.nations) p.lastLedger = {day: world.day, openingGrain: 0, production: 0, civilianConsumed: 0, militaryConsumed: 0, territoryTransfer: 0, closingGrain: 0, starvationDeaths: 0};
    for (const economy of management.provinces) {
      const province = provinces.get(economy.provinceId)!;
      const policy = policies.get(province.controller)!, ledger = policy.lastLedger!;
      const population = economy.population, occupied = contested(world, province, space);
      ledger.openingGrain += economy.grain;
      const produced = Math.min(MAX_GRAIN - economy.grain, production(province, population, occupied));
      economy.grain += produced; ledger.production += produced;
      const refill = (reserve: number) => {
        if (occupied) return;
        const local = (space.land.get(province.id) ?? []).filter(v => canRefill47(v) && v.army.nationId === province.controller);
        for (const {army} of local.sort((a, b) => a.army.id.localeCompare(b.army.id))) {
          const strength = army.troops / 10;
          const points = Math.max(0, Math.floor(Math.min(province.supply, 100 - army.supplies, Math.max(0, economy.grain - reserve) * 6 / strength)));
          const consumed = Math.ceil(points * strength / 6);
          economy.grain -= consumed; ledger.militaryConsumed += consumed; army.supplies += points;
        }
      };
      if (policy.priority === 'military') refill(0);
      const consumed = Math.min(economy.grain, population); economy.grain -= consumed; ledger.civilianConsumed += consumed;
      const shortage = population - consumed;
      const deaths = shortage > 0 ? Math.min(population, Math.ceil(shortage * 0.002)) : 0;
      economy.population -= deaths; ledger.starvationDeaths += deaths;
      if (!shortage && population < capacity(province)) economy.population = Math.min(capacity(province), population + Math.floor(population * 0.0001));
      if (policy.priority !== 'military') refill(population * (policy.priority === 'civilian' ? 3 : 1));
      ledger.closingGrain += economy.grain;
    }
    for (const policy of management.nations) {
      const ledger = policy.lastLedger!, nation = world.nations.find(n => n.id === policy.nationId)!;
      if (ledger.starvationDeaths || world.day % 7 === 0) emit(world, 'economy', `${nation.name}日粮结算${ledger.starvationDeaths ? `：饥荒死亡 ${ledger.starvationDeaths}` : ''}`, `期初 ${ledger.openingGrain} + 生产 ${ledger.production} − 民用 ${ledger.civilianConsumed} − 军用 ${ledger.militaryConsumed} = 期末 ${ledger.closingGrain} 人日粮。陆地粮库只补给实际停驻部队；海上部队消耗随身口粮。`);
    }
  }
  return {advanceEconomy, buildNationReports};
}
