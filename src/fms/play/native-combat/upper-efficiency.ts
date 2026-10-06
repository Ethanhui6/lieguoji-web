/** Recovered Army.RecalCombatEfficiency order for finite resolved inputs.
 * Does not resolve characters, treasury, current-cell geography or campaign.
 * No active runtime imports this yet; v13 keeps its published web adaptation.
 * Source: docs/evidence/fms-terrain13-v5-2026-10-07/UPPER_EFFICIENCY_RECOVERY.md. */
export interface ResolvedCombatInput {
  baseCombatEfficiency: number;
  destiny: number;
  leadershipModifier: number;
  leaderCombatModifier: number;
  provinceDefense: number;
  coreDefense: number;
  politicalAttack: number;
  politicalDefense: number;
  goldBattleModifier: number;
  attacking: boolean;
  sameNationId: boolean;
  protruding: boolean;
  wellTrained: boolean;
  homelandDefense: boolean;
  conqueror: boolean;
  unitModifier: number | null;
  elite: boolean;
}
const f = Math.fround;
const clamp = (n: number, low: number, high: number) => Math.min(f(high), Math.max(f(low), n));
export function nativeUpperEfficiency(input: ResolvedCombatInput): number {
  const i = input;
  let result = f(f(i.baseCombatEfficiency) * Math.max(f(.1), f(f(i.destiny) / 30)));
  result = f(result * f(i.leadershipModifier));
  if (i.leaderCombatModifier !== 0) result = f(f(1 + f(i.leaderCombatModifier)) * result);
  if (i.attacking) {
    if (i.conqueror) result = f(result * 1.5);
    result = f(f(1 / f(i.provinceDefense)) * result);
    if (!i.wellTrained) result = f(f(1 / f(i.coreDefense)) * result);
    result = f(result * f(i.politicalAttack));
  } else {
    if (i.homelandDefense) result = f(result * 1.5);
    result = f(f(i.provinceDefense) * result);
    result = f(result * f(i.coreDefense));
    result = f(f(i.politicalDefense) * result);
  }
  const protrusion = i.protruding ? 2 : 1;
  result = f((i.sameNationId ? f(1 / protrusion) : protrusion) * result);
  result = f(result * f(i.goldBattleModifier));
  const unit = i.unitModifier === null ? 1 : Math.max(f(.05), f(i.unitModifier));
  result = f(clamp(result, .1, 10) * unit);
  return i.elite ? f(result * 10) : result;
}

/** Native generic province table, separate from unit-weighted land biome data. */
export const GENERIC_BIOME_DEFENSE = [1, 2.5, 2.5, 1.3, 1, 1, 1, 1.2, 1.2, 1, 2, 4, 1.5] as const;
export interface ProvinceDefenseInput {
  mountain: boolean; plateau: boolean;
  /** Counts include Marine; array order is original first-encounter order. */
  biomeCounts: readonly { biome: number; count: number }[];
  locked: boolean; stored: number;
}
export function resetNativeProvinceDefense(input: ProvinceDefenseInput): number {
  let dominant = 0, maximum = 0;
  for (const { biome, count } of input.biomeCounts) {
    if (!Number.isInteger(biome) || biome < 0 || biome >= GENERIC_BIOME_DEFENSE.length || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Unsupported native province biome counts');
    }
    if (count > maximum) { maximum = count; dominant = biome; }
  }
  const candidate = Math.max(input.mountain ? 3 : input.plateau ? 1.5 : 1, f(GENERIC_BIOME_DEFENSE[dominant]));
  return input.locked ? clamp(f(input.stored), 1, 10) : clamp(candidate, 1, 3);
}
export function nativeProvinceDefense(stored: number, locked: boolean, manualSet: boolean, manualFortress: boolean): number {
  return !locked && manualSet && manualFortress ? 3 : clamp(f(stored), 1, 10);
}

export type NativePolity = 'Kingdom' | 'Empire' | 'Federation' | 'Republic' | 'Tribal' | 'Theocracy';
export type NativeEthnic = 'FishAndHunting' | 'Agriculture' | 'Nomadic' | 'Maritime' | 'Commercial' | 'Other';
/** Defaults only; the original consumes current attributes after trait/ethnic changes. */
export function defaultPoliticalCombat(polity: NativePolity) {
  const values: Record<NativePolity, readonly [number, number, number]> = {
    Kingdom: [1, 1.05, 1], Empire: [1.05, 1, 1], Federation: [1, 1, 1.05],
    Republic: [1, 1, 1.1], Tribal: [1.05, .95, .9], Theocracy: [1, 1, .95],
  };
  const [attack, defense, goldProduction] = values[polity].map(f);
  return { attack, defense, goldProduction };
}
export function nativeGoldBattleModifier(gold: number, production: number, ethnic: NativeEthnic): number {
  const factors: Record<NativeEthnic, readonly [number, number]> = {
    FishAndHunting: [1.02, .98], Agriculture: [1.03, .97], Nomadic: [1.01, .99],
    Maritime: [1.04, .96], Commercial: [1.05, .95], Other: [1, 1],
  };
  const positive = gold > 0, ethnicFactor = factors[ethnic][positive ? 0 : 1];
  return clamp(f(f(f(production) * f(positive ? 1.1 : .9)) * f(ethnicFactor)), .8, 1.2);
}
