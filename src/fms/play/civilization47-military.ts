import type {FoundingForces47} from './civilization47-forces';
import {assertFamilyCalendar47,advanceFamilyCalendar47} from './civilization47-calendar';
import {advanceMilitaryWindow47} from './force-tick47';
import type {ArmyRouteWeights47} from './army-commands47';
import {assertForceSpeed47,actualForceSpeed47} from './force-speed47';
import {TICKS_PER_DAY} from './clock';
import {assertDailyEconomy47} from './civilization47-daily';
import {assertCombatPersonnel47} from './civilization47-combat-state';
import {combatReader47} from './civilization47-combat';

/** Fixed real47 military/calendar/personnel owner. No scalar combat override;
 * callers cannot omit calendar or choose fake speed/leadership/damage.
 * This returns PRIVATE dailyPending state, not a complete tick/save session. */
export function advanceCivilizationMilitary47<T extends FoundingForces47>(input:T,ticks:number,weights:ArmyRouteWeights47){
  assertFamilyCalendar47(input);assertDailyEconomy47(input);assertForceSpeed47(input.forceSpeed,input.world,input.clock.tick);
  assertCombatPersonnel47(input.combatPersonnel,input.world,input.clock.tick,input);
  if(input.forceClock.secondsPerTick!==input.life.secondsPerDay/TICKS_PER_DAY)throw Error('军事与人物时间单位不一致，原世界保留。');
  const out=advanceMilitaryWindow47(input,ticks,weights,{speed:actualForceSpeed47,combat:r=>combatReader47(r).volley,occupation:(r,w)=>combatReader47(r,w).province,afterTick:(r,pending)=>advanceFamilyCalendar47(r,r.clock.tick,pending)});
  assertFamilyCalendar47(out.run,out.dailyPending);assertForceSpeed47(out.run.forceSpeed,out.run.world,out.run.clock.tick);return out;
}
