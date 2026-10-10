import type {FoundingForces47} from './civilization47-forces';
import {assertFamilyCalendar47} from './civilization47-calendar';
import {assertForceSpeed47} from './force-speed47';
import {actualForces47} from './force-runtime47';
import {assertForceClock47} from './force-clock47';
import {forceKey47} from './force-motion47';
import {assertLosses} from './war27-losses';
import {createArmyEconomy47} from './war47-economy';
import {settleFiscalMonth47,assertMonthlyAccounts47} from './civilization47-fiscal';
import {musterMonth47} from './civilization47-monthly-muster';
import {settleDestinyMonth} from './destiny20-state';
import {settleFleetFood47,settleArmyFoodConsequences47,finishDailyForces47,dailyEvent47,assertDailyResources47} from './civilization47-upkeep';
import {LOGISTICS_DAY_FACTOR47} from './logistics-clock47';
import {TICKS_PER_DAY} from './clock';
import {assertCombatPersonnel47,refreshLeaderCombat47} from './civilization47-combat-state';
import {cloneMilitaryCandidate47} from './geography-content47';
import {readSessionAdvanceCandidate47,type SessionAdvanceLease47} from './session-advance47';
import {advancePeopleMonthOwned47} from './civilization47-lifecycle';

export type DailyEconomy47={version:1;lastDay:number;lastMusterMonth:number};
export function assertDailyEconomy47(r:{world:{day:number};dailyEconomy:DailyEconomy47}){
  const s=r.dailyEconomy;
  if(!s||Object.keys(s).sort().join('/')!=='lastDay/lastMusterMonth/version'||s.version!==1||!Number.isSafeInteger(s.lastDay)||s.lastDay!==r.world.day||s.lastMusterMonth!==Math.floor(s.lastDay/30))throw Error('日结回执缺失、重复或属于未来规则。');
}
/** One atomic real economic day. The caller MUST supply its autonomous-order
 * stage at the established between-tax-and-muster position. A no-op test hook
 * is not a playable AI. This does not complete political/chronicle/save work. */
export function settleCivilizationDay47<T extends FoundingForces47>(input:T,dailyOrders:(owned:T)=>undefined):T{
  return settleCivilizationDayCore47(input,dailyOrders);
}
export function settleSessionCivilizationDay47(lease:SessionAdvanceLease47,dailyOrders:(owned:ReturnType<typeof readSessionAdvanceCandidate47>)=>undefined){
  const input=readSessionAdvanceCandidate47(lease);return settleCivilizationDayCore47(input,dailyOrders,input);
}
function settleCivilizationDayCore47<T extends FoundingForces47>(input:T,dailyOrders:(owned:T)=>undefined,owned?:T):T{
  assertFamilyCalendar47(input,true);assertDailyEconomy47(input);assertForceSpeed47(input.forceSpeed,input.world,input.clock.tick);assertDailyResources47(input);assertMonthlyAccounts47(input);
  assertCombatPersonnel47(input.combatPersonnel,input.world,input.clock.tick,input);
  if(input.clock.tick!==(input.world.day+1)*TICKS_PER_DAY||input.forceClock.secondsPerTick!==input.life.secondsPerDay/TICKS_PER_DAY||input.transports.cargo.length)throw Error('只能结算真实日界，旧承运状态不得混入新规则。');
  const initial=actualForces47(input);assertForceClock47(input.forceClock,input.clock.tick,new Set(initial.forces.map(forceKey47)));assertLosses(input.losses,input.world,input.warfare,input.clock.tick);
  const r=owned??cloneMilitaryCandidate47(input);r.world.day++;
  // Native UpdateStateData refreshes the leader's cached per-enemy modifier.
  // This web monthly bridge runs before this day's autonomous orders.
  if(advancePeopleMonthOwned47(r)||r.world.day%30===0)refreshLeaderCombat47(r,r.combatPersonnel);
  settleFleetFood47(r);
  const economy=createArmyEconomy47(r.finance,()=>({...actualForces47(r).spatial,positions:r.armyPositions}),LOGISTICS_DAY_FACTOR47);
  economy.advanceEconomy(r.world,(world,kind,text,reason)=>dailyEvent47({world},kind,text,reason));
  settleArmyFoodConsequences47(r);finishDailyForces47(r);
  settleFiscalMonth47(r);
  const result:unknown=dailyOrders(r);
  // A Promise must never continue mutating a returned candidate after final
  // validation. Discard this private candidate; observe rejection only to
  // avoid an unhandled asynchronous error, never to resume the transaction.
  if(result!==undefined){if(result&&typeof (result as {then?:unknown}).then==='function')void Promise.resolve(result).catch(()=>undefined);throw Error('日结命令阶段必须同步完成并返回 undefined。');}
  musterMonth47(r);settleDestinyMonth(r,r.destiny);finishDailyForces47(r,true);
  r.dailyEconomy.lastDay=r.world.day;
  assertFamilyCalendar47(r);assertDailyEconomy47(r);assertForceSpeed47(r.forceSpeed,r.world,r.clock.tick);assertDailyResources47(r);assertMonthlyAccounts47(r);assertLosses(r.losses,r.world,r.warfare,r.clock.tick);
  assertCombatPersonnel47(r.combatPersonnel,r.world,r.clock.tick,r);
  const final=actualForces47(r);assertForceClock47(r.forceClock,r.clock.tick,new Set(final.forces.map(forceKey47)));
  return r;
}
