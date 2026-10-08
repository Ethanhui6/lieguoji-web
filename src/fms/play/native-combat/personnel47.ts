import type {NativePolity} from './upper-efficiency';
const f=Math.fround;
const finite=(n:number)=>{if(!Number.isFinite(n))throw Error('人物战力输入无效。');return f(n);};
/** Army.CalculateLeadershipModifier 345C20; missing family is a distinct
 * branch from an absent/dead head. Officials are resolved by the caller. */
export function nativeLeadership47(officialSkill:number,command:{kind:'central'}|{kind:'local'}|{kind:'family';exists:boolean;livingHeadSkill:number|null;polity:NativePolity}){
  const official=finite(officialSkill);let skill=official,divisor=150;
  if(command.kind==='local')divisor=300;
  if(command.kind==='family'){
    if(!command.exists)return 1;
    if(command.livingHeadSkill===null)divisor=300;
    else {const weights:Record<NativePolity,[number,number]>={Kingdom:[.6,.4],Empire:[.2,.8],Federation:[.5,.5],Republic:[.5,.5],Tribal:[.8,.2],Theocracy:[.3,.7]},[family,office]=weights[command.polity];skill=f(f(finite(command.livingHeadSkill)*f(family))+f(official*f(office)));}
  }
  return Math.max(f(.5),Math.min(f(1.5),f(1+f(f(skill-50)/f(divisor)))));
}
/** Character.GetNavalCombatModifier 83C010: ordered addss, no clamp or
 * deduplication. Rejecting nonfinite values is a WEB input guard. */
export function nativeNavalCharacter47(traits:readonly ({navalCombatModifier:number}|null)[]|null){
  let sum=0;for(const t of traits??[]){if(!t)throw Error('海军人物特性缺失。');sum=f(sum+finite(t.navalCombatModifier));}return sum;
}
/** State.UpdateLeaderCombatModifier 5DE580: first nonzero trait, not a sum.
 * The State owner caches this at its data update, not each Army attack. */
export function nativeLeaderEnemies47(traits:readonly ({combatModifierPerEnemy:number}|null)[]|null,enemyCount:number){
  if(!Number.isSafeInteger(enemyCount)||enemyCount<0)throw Error('敌国数量无效。');
  for(const t of traits??[]){if(!t)throw Error('陆战人物特性缺失。');const v=finite(t.combatModifierPerEnemy);if(v!==0)return Math.max(f(-.5),Math.min(f(.5),f(f(enemyCount)*v)));}return 0;
}
export type DamageTrait47='FieldCombatElite'|'SiegeCapture';
/** State resets both fields to 1, then ordered trait effects replace them. */
export function nativeDamageSnapshot47(traits:readonly DamageTrait47[]){
  let field=1,siege=1;for(const t of traits){if(t==='FieldCombatElite')field=f(1.5);else if(t==='SiegeCapture')siege=f(1.5);else throw Error('军队伤害特性无效。');}
  return {damageToArmy:f(field*40),damageToProvince:f(siege*10)};
}
