const f=Math.fround;
/** Army.AddDamageToEnemyArmyInProvince: one due attack, divided among its
 * hostile army objects, then the victim's Elite factor. Raw damage includes
 * overkill; it is neither an integer casualty count nor a share of that count.
 * RVAs/bytes and the display factor are in NEXT_INTEGRATION.md. */
export function nativeArmyHit(efficiency:number,enemies:number,victimElite:boolean,damageToArmy=40,damageMultiplier=1){
 if(!Number.isFinite(efficiency)||efficiency<0||!Number.isInteger(enemies)||enemies<1||!Number.isFinite(damageToArmy)||damageToArmy<0||!Number.isFinite(damageMultiplier))throw Error('战斗军力伤害输入无效。');
 const raw=f(f(f(f(efficiency)*f(damageToArmy))*Math.max(1,f(damageMultiplier)))/f(enemies));
 const amount=victimElite?f(raw*f(.1)):raw;
 if(!Number.isFinite(amount))throw Error('战斗军力伤害溢出。');return amount;
}
