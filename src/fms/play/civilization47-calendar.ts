import {fastChecks47} from './checks47';
import {nativeGetYearSince,nativeBirthTimeFromAge} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './civilization47-iso-calendar';
import {assertPopulation47} from './civilization47-population-validation';
import type {Population47} from './civilization47-population-types';
import {TICKS_PER_DAY} from './clock';
import {advancePeopleMonthOwned47} from './civilization47-lifecycle';
import {foundingMonthOfState47,foundingTimeOfState47} from './civilization47-founding-time';

export type FamilyCalendarRun47=Pick<Population47,'clock'|'life'|'kin'>&{world:{day:number}};
/** Calendar-only runtime contract; it does not validate kinship/identity,
 * economic settlement or a full save. Pending is an explicit PRIVATE phase. */
export function assertFamilyCalendar47(r:FamilyCalendarRun47,dailyPending=false):void{if(fastChecks47())return;
  const fail=()=>{throw Error('真实人物运行日历不一致，原世界保留。');},l=r.life,k=r.kin,tick=r.clock.tick,day=Math.floor(tick/TICKS_PER_DAY),integer=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
  if(!Number.isSafeInteger(tick)||tick<0||tick>(Number.MAX_SAFE_INTEGER-1000000)||r.world.day!==day-(dailyPending?1:0)||dailyPending&&(tick===0||tick%TICKS_PER_DAY!==0)||l.version!==1||l.schedule!=='iso-age-web-ticks-v1'||l.originDay!==0||l.secondsPerDay!==Math.fround(.1)||l.lastTick!==tick||l.gameTime!==Math.fround(tick/TICKS_PER_DAY*l.secondsPerDay)||k.version!==1||k.origin!=='native-family-real-culture-v1'||!integer(l.revision)||!integer(k.revision))return fail();
  const date=isoPlusDays(l.startDate,day),ageDay=dailyPending&&date.day===1?day-1:day,ageDate=isoPlusDays(l.startDate,ageDay),month=ageDate.year*12+ageDate.month-1,ageTime=Math.fround((ageDay-ageDate.day+1)*l.secondsPerDay),calendar=createNativeIsoCalendar(l.startDate);
  if(l.startDate.year!==1||l.startDate.month!==1||l.startDate.day!==1||l.currentDate.year!==date.year||l.currentDate.month!==date.month||l.currentDate.day!==date.day||l.lastAgeMonth!==month||k.lastAgeMonth!==month||k.lifecycle.lastMonth!==month||k.ageTime!==ageTime||!l.persons||!k.persons||Array.isArray(l.persons)||Array.isArray(k.persons)||Object.keys(l.persons).length!==Object.keys(k.persons).length)return fail();
  for(const [id,p] of Object.entries(k.persons)){
    const b=l.persons[id],foundedTime=foundingTimeOfState47(r,p.stateId),foundedMonth=foundingMonthOfState47(r,p.stateId);if(!b||!Object.hasOwn(l.persons,id)||String(p.id)!==id||!Number.isFinite(p.birthTime)||p.birthTime!==Math.fround(p.birthTime)||(p.source==='newborn'?p.birthTime>l.gameTime:p.source==='collateral'?p.birthTime>ageTime:p.birthTime>foundedTime)||b.birthTime!==p.birthTime||!integer(p.age)||p.age>20000||b.age!==p.age||typeof p.isAlive!=='boolean'||b.updatedMonth===null||!Number.isSafeInteger(b.updatedMonth)||b.updatedMonth<12||b.updatedMonth>month||p.source==='founding'&&b.source!=='native-founding'||(p.source==='initial-family'||p.source==='collateral')&&b.source!=='native-family'||p.source==='newborn'&&b.source!=='web-newborn'||!['founding','initial-family','newborn','collateral'].includes(p.source))return fail();
    if(p.source==='founding'){
      if(p.initialAge===null||!integer(p.initialAge)||p.initialAge<35||p.initialAge>54||b.initialAge!==p.initialAge||p.birthTime!==nativeBirthTimeFromAge(p.initialAge,foundedTime,l.secondsPerDay)||month===foundedMonth&&p.age!==p.initialAge)return fail();
    }else if(p.initialAge!==null||b.initialAge!==null)return fail();
    if(p.isAlive&&(b.updatedMonth!==month||!(p.source==='founding'&&month===foundedMonth)&&p.age!==(p.birthTime>ageTime?0:nativeGetYearSince(p.birthTime,ageTime,l.secondsPerDay,calendar))))return fail();
  }
}

/** Full47 tick owner calls this on its already-private candidate after setting
 * clock.tick. At the day boundary calendar advances once while settlement
 * still owns world.day. All relatives age, including those not yet in court. */
export function advanceFamilyCalendar47(r:FamilyCalendarRun47,tick:number,dailyPending=false):void {
  const l=r.life,k=r.kin;
  if(!Number.isSafeInteger(tick)||tick!==l.lastTick+1||r.clock.tick!==tick||r.world.day!==Math.floor(tick/TICKS_PER_DAY)-(dailyPending?1:0)||dailyPending&&tick%TICKS_PER_DAY!==0)throw Error('人物时刻不连续，取消本次候选。');
  l.gameTime=Math.fround(tick/TICKS_PER_DAY*l.secondsPerDay);l.lastTick=tick;
  if(tick%TICKS_PER_DAY!==0)return;
  l.currentDate=isoPlusDays(l.startDate,tick/TICKS_PER_DAY);
  if(!Number.isSafeInteger(l.revision)||!Number.isSafeInteger(k.revision)||l.revision>=2147483647||k.revision>=2147483647)throw Error('人物日历版本已达上限，取消本次候选。');
}
/** Isolated pre-muster population fixture/creation owner. Not a playable game
 * tick: active military worlds must advance through the full47 simulation. */
export function advanceFoundingPopulation47<T extends Population47>(input:T,ticks:number):T {
  assertPopulation47(input);
  if(input.world.armies.length||!Number.isSafeInteger(ticks)||ticks<1||ticks>120*366||input.clock.tick+ticks>(Number.MAX_SAFE_INTEGER-1000000))throw Error('仅支持未征募候选的有界人物日历验证。');
  const r=structuredClone(input);
  for(let i=0;i<ticks;i++){r.clock.tick++;r.world.day=Math.floor(r.clock.tick/120);advanceFamilyCalendar47(r,r.clock.tick);if(r.clock.tick%120===0)advancePeopleMonthOwned47(r);}
  assertPopulation47(r);return r;
}
