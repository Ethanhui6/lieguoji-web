/** Narrow native projection, not wired into v13. See STATE_BASE_RECOVERY.md.
 * Effects unrelated to these six properties remain outside this projection. */
export interface CombatTraits {
  IsWellTrained: boolean;
  IsHomelandDefense: boolean;
  IsConqueror: boolean;
  CoreDefenseEfficiencyBoost: number;
  BaseBattleEfficiencyBounus: number;
  CoreProvinceRate: number;
}
export interface TraitEffect { key: string; isBool: boolean; value: number }
export interface NativeStateTrait { effects: readonly TraitEffect[] }
const booleanKeys = ['IsWellTrained', 'IsHomelandDefense', 'IsConqueror'] as const;
const numericKeys = ['CoreDefenseEfficiencyBoost', 'BaseBattleEfficiencyBounus', 'CoreProvinceRate'] as const;
export function projectCombatTraits(traits: readonly NativeStateTrait[]): CombatTraits {
  const result: CombatTraits = {
    IsWellTrained: false, IsHomelandDefense: false, IsConqueror: false,
    CoreDefenseEfficiencyBoost: Math.fround(1.15), BaseBattleEfficiencyBounus: 1,
    CoreProvinceRate: Math.fround(.15),
  };
  for (const trait of traits) for (const effect of trait.effects) {
    const bool = booleanKeys.find(key => key === effect.key);
    const numeric = numericKeys.find(key => key === effect.key);
    if (!bool && !numeric) continue;
    if (!Number.isFinite(effect.value) || effect.isBool !== Boolean(bool)) {
      throw new Error('Unsupported combat trait effect type or value');
    }
    if (bool) result[bool] = Math.fround(effect.value) !== 0;
    if (numeric) result[numeric] = Math.fround(effect.value);
  }
  return result;
}
/** Called only for new/reorganized army snapshots, not each efficiency read. */
export const initializedArmyBase = (traits: CombatTraits) => Math.fround(Math.fround(traits.BaseBattleEfficiencyBounus) * 1.25);
