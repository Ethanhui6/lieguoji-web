const f = Math.fround;
export type NavalCombatInput47 = {destiny: number; maritime: boolean; livingLeaderModifier: number | null};
/** Navy.BattleInSeaProvince 4211A0..421D30, current authorized Windows build.
 * Modifier is an explicit recovered dependency input, NOT guessed from skill.
 * Hull/crew/display conversion and death removal belong to the web adapter. */
export function nativeNavalFactor47(v: NavalCombatInput47) {
  if (!Number.isFinite(v.destiny) || typeof v.maritime !== 'boolean' || v.livingLeaderModifier !== null && !Number.isFinite(v.livingLeaderModifier)) throw Error('海军战力输入无效。');
  let factor = Math.max(f(.1), Math.min(10, f(f(v.destiny) / f(30))));
  if (v.maritime) factor = f(factor * f(1.5));
  const modifier = v.livingLeaderModifier === null ? 0 : f(v.livingLeaderModifier);
  if (Math.abs(modifier) > f(.001)) factor = f(factor * Math.max(f(.1), f(1 + modifier)));
  if (!Number.isFinite(factor)) throw Error('海军战力溢出。');
  return factor;
}
/** Separate 40/Navy and 320/Army budgets. No Elite reduction, troop weighting
 * or attacking navyCount multiplier exists in this bounded native method. */
export function nativeNavyHit47(factor: number, victims: number, kind: 'army' | 'fleet') {
  if (!Number.isFinite(factor) || factor < 0 || !Number.isSafeInteger(victims) || victims < 1 || !['army', 'fleet'].includes(kind)) throw Error('海军伤害目标输入无效。');
  const damage = f(f(f(factor) * f(kind === 'army' ? 320 : 40)) / f(victims));
  if (!Number.isFinite(damage)) throw Error('海军伤害溢出。');
  return damage;
}
