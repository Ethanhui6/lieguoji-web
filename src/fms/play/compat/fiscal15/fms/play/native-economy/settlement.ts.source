/** State.UpdateEcnomic 0x5DDCE0 and Province.GetEcnomicPerMonth 0x454070.
 * Pure resolved-input kernels; not yet wired into v14 or the web food ledger.
 * Evidence: docs/evidence/fms-upper14-v5-2026-10-07/GOLD_RECOVERY.md. */
import { nativeGoldBattleModifier, type NativeEthnic } from '../native-combat/upper-efficiency';
import { f, int32, finite, iadd, imul, idiv, roundInt, clamp01 } from './numeric';
export interface EconomicResource { name: string; baseValue: number; probability: number; affectedBy: readonly NativeEthnic[] }
export interface ProvinceIncomeInput {
  population: number; maxPopulation: number; cellCount: number;
  resources: readonly EconomicResource[]; ethnic: NativeEthnic; destiny: number;
  nationProvinceCount: number; worldProvinceCount: number; localIncomeMultiplier: number;
}
export function nativeProvinceIncome(i: ProvinceIncomeInput): number {
  for (const value of [i.population, i.maxPopulation, i.cellCount, i.nationProvinceCount, i.worldProvinceCount]) int32(value);
  if (i.population < 0 || i.maxPopulation <= 0 || i.cellCount <= 0 || i.nationProvinceCount < 0 || i.worldProvinceCount <= 0 || i.nationProvinceCount > i.worldProvinceCount) throw Error('Invalid province income references');
  finite(i.destiny); finite(i.localIncomeMultiplier);
  const base = roundInt(f(f(i.population) * f(.001)));
  const utilization = clamp01(f(f(i.population) / f(i.maxPopulation)));
  let resources = 0;
  for (const r of i.resources) {
    let value = f(f(int32(r.baseValue)) * finite(r.probability));
    if (r.affectedBy.includes(i.ethnic)) value = f(value * f(1.2));
    resources = iadd(resources, roundInt(f(f(utilization * f(.5)) * value)));
  }
  const density = Math.min(2, Math.max(f(.5), f(f(f(i.population) / f(i.cellCount)) / 100)));
  const resourceIncome = roundInt(f(f(resources) * density));
  const destinyFactor = f(1 - f(f(f(100 - f(i.destiny)) / 100) / 3));
  let income = roundInt(f(f(iadd(base, resourceIncome)) * destinyFactor));
  const size = i.nationProvinceCount >= 10 ? f(1 - f(clamp01(f(f(i.nationProvinceCount) / f(i.worldProvinceCount))) * f(.5))) : 1;
  income = roundInt(f(f(income) * size));
  return roundInt(f(f(income) * f(i.localIncomeMultiplier)));
}
export interface GoldSettlementInput {
  gold: number; provinceIncome: readonly number[]; leaderTaxMultiplier: number;
  centralIncomeMultiplier: number; armyCostGold: number; goldProductionModifier: number; ethnic: NativeEthnic;
}
export interface GoldSettlement {
  gold: number; goldPerMonth: number; armyCostGold: number; goldBattleModifier: number;
  /** Explanatory ledger values, not additional credits or original saved fields. */
  baseIncome: number; inventoryFactor: number; goldBeforeArmyCost: number;
}
export function nativeGoldSettlement(i: GoldSettlementInput): GoldSettlement {
  int32(i.gold); int32(i.armyCostGold); finite(i.goldProductionModifier);
  let sum = 0; for (const income of i.provinceIncome) sum = iadd(sum, int32(income));
  const income = roundInt(f(f(f(sum) * finite(i.leaderTaxMultiplier)) * finite(i.centralIncomeMultiplier)));
  const five = imul(5, income), fifteen = imul(15, income), twentyFive = imul(25, income), ten = imul(10, income);
  let factor = 1;
  if (i.gold > five && i.gold > 20000) {
    if (i.gold <= fifteen) factor = f(1 + f(clamp01(f(idiv(iadd(i.gold, -five), ten))) * f(-.9)));
    else if (i.gold <= twentyFive && i.gold > 30000) factor = f(f(.1) + f(clamp01(f(idiv(iadd(i.gold, -fifteen), ten))) * f(-.05)));
    else if (i.gold > twentyFive && i.gold > 30000) factor = f(.05);
  }
  const credited = roundInt(f(f(income) * factor));
  let gold = iadd(i.gold, credited);
  if (gold < 0 && Math.abs(f(gold)) > f(imul(15, credited))) gold = imul(-15, credited);
  const goldBattleModifier = nativeGoldBattleModifier(gold, i.goldProductionModifier, i.ethnic), goldBeforeArmyCost = gold;
  gold = iadd(gold, -i.armyCostGold);
  return { gold, goldPerMonth: credited, armyCostGold: i.armyCostGold, goldBattleModifier, baseIncome: income, inventoryFactor: factor, goldBeforeArmyCost };
}

export interface NativeFeeProvince { id: number; owner: string | null; land: boolean; distance: number; neighbors: readonly number[] }
export interface NativeFeeArmy { state: 'Attacking' | 'Reorganization' | 'Other'; provinceId: number }
/** Native predicate only. Web status/current-road/transport mapping is pending. */
export function nativeMonthlyArmyCost(owner: string, armies: readonly NativeFeeArmy[], provinces: readonly NativeFeeProvince[]): number {
  const byId = new Map(provinces.map(p => [p.id, p]));
  if (byId.size !== provinces.length) throw Error('Duplicate fee province');
  for (const p of provinces) { int32(p.id); int32(p.distance); if (p.distance < 0) throw Error('Negative capital distance'); }
  let cost = 0;
  for (const army of armies) {
    if (army.state === 'Other') continue;
    const p = byId.get(army.provinceId); if (!p) throw Error('Unresolved fee position');
    if (p.owner === owner) {
      if (p.distance > 4) cost = iadd(cost, idiv(imul(p.distance, Math.min(p.distance, 12)), 2));
    } else if (!p.land) cost = iadd(cost, 420);
    else {
      let neighbor: NativeFeeProvince | undefined;
      for (const id of p.neighbors) {
        const candidate = byId.get(id); if (!candidate) throw Error('Unresolved fee neighbor');
        if (candidate.owner === owner) { neighbor = candidate; break; }
      }
      if (neighbor && neighbor.id !== 0) cost = iadd(cost, imul(neighbor.distance, 60));
    }
  }
  return cost;
}
