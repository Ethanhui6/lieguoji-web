import {nativeGetYearSince,nativeUpdateCharacterAge} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';
import {assertPopulation47} from './civilization47-population-validation';
import type {Population47} from './civilization47-population-types';

/** Full47 tick owner calls this on its already-private candidate after setting
 * world.day/clock.tick. All relatives age, including those not yet in court. */
export function advanceFamilyCalendar47(r:Population47,tick:number):void {
  const l=r.life,k=r.kin;
  if(!Number.isSafeInteger(tick)||tick!==l.lastTick+1||r.clock.tick!==tick||r.world.day!==Math.floor(tick/120))throw Error('人物时刻不连续，取消本次候选。');
  l.gameTime=Math.fround(tick/120*l.secondsPerDay);l.lastTick=tick;
  if(tick%120!==0)return;
  l.currentDate=isoPlusDays(l.startDate,r.world.day);const month=l.currentDate.year*12+l.currentDate.month-1;
  if(month===l.lastAgeMonth)return;
  const calendar=createNativeIsoCalendar(l.startDate);
  for(const p of Object.values(k.persons)){const record=l.persons[p.id];if(!record)throw Error('亲属出生记录缺失。');if(!p.isAlive)continue;nativeUpdateCharacterAge(p,b=>nativeGetYearSince(b,l.gameTime,l.secondsPerDay,calendar));record.age=p.age;record.updatedMonth=month;}
  k.ageTime=l.gameTime;k.lastAgeMonth=month;k.revision++;l.lastAgeMonth=month;l.revision++;
}
/** Isolated pre-muster population fixture/creation owner. Not a playable game
 * tick: active military worlds must advance through the full47 simulation. */
export function advanceFoundingPopulation47<T extends Population47>(input:T,ticks:number):T {
  assertPopulation47(input);
  if(input.world.armies.length||!Number.isSafeInteger(ticks)||ticks<1||ticks>120*366||input.clock.tick+ticks>120_000_000_000)throw Error('仅支持未征募候选的有界人物日历验证。');
  const r=structuredClone(input);
  for(let i=0;i<ticks;i++){r.clock.tick++;r.world.day=Math.floor(r.clock.tick/120);advanceFamilyCalendar47(r,r.clock.tick);}
  assertPopulation47(r);return r;
}
