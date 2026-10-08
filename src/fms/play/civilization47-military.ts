import type {Population47} from './civilization47-population-types';
import {assertFamilyCalendar47,advanceFamilyCalendar47} from './civilization47-calendar';
import {advanceMilitaryWindow47,type MilitaryRun47,type MilitaryRules47} from './force-tick47';
import type {ArmyRouteWeights47} from './army-commands47';
import {assertForceSpeed47,actualForceSpeed47,type ForceSpeed47} from './force-speed47';
import {TICKS_PER_DAY} from './clock';

type Run=MilitaryRun47&Population47&{forceSpeed:ForceSpeed47};
/** Fixed real47 military/calendar owner. Combat's still-unresolved personnel
 * inputs remain explicit; callers cannot omit calendar or choose fake speed.
 * This returns PRIVATE dailyPending state, not a complete tick/save session. */
export function advanceCivilizationMilitary47<T extends Run>(input:T,ticks:number,weights:ArmyRouteWeights47,combat:MilitaryRules47<T>['combat']){
  assertFamilyCalendar47(input);assertForceSpeed47(input.forceSpeed,input.world,input.clock.tick);
  if(input.forceClock.secondsPerTick!==input.life.secondsPerDay/TICKS_PER_DAY)throw Error('军事与人物时间单位不一致，原世界保留。');
  const out=advanceMilitaryWindow47(input,ticks,weights,{speed:actualForceSpeed47,combat,afterTick:(r,pending)=>advanceFamilyCalendar47(r,r.clock.tick,pending)});
  assertFamilyCalendar47(out.run,out.dailyPending);assertForceSpeed47(out.run.forceSpeed,out.run.world,out.run.clock.tick);return out;
}
