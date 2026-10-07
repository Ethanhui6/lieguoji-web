import {lifeTime} from './life22-state';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';
import {reconcileKin} from './dynasty23-state';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {War35Session} from './war35-session';
import type {War35Run} from './war35-model';
import {grid} from './fixture.test-support';
export function allianceFixture35(){const r=new War35Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations:'peace'}).run as War35Run;r.diplomacy.worldAuto=false;return r;}
export const stamp35=(r:War35Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});

export function fixtureDate35(r:War35Run,day:number){
 r.world.day=day;r.clock.tick=day*120;r.life.lastTick=r.clock.tick;r.life.gameTime=lifeTime(r.life,r.clock.tick);r.life.currentDate=isoPlusDays(r.life.startDate,day);r.life.lastAgeMonth=r.life.currentDate.year*12+r.life.currentDate.month-1;
 const ageTime=Math.fround((day-r.life.currentDate.day+1)*r.life.secondsPerDay),calendar=createNativeIsoCalendar(r.life.startDate);
 for(const p of Object.values(r.life.persons))if(p.source==='native-founding'){p.updatedMonth=r.life.lastAgeMonth;p.age=nativeGetYearSince(p.birthTime!,ageTime,r.life.secondsPerDay,calendar);}
 reconcileKin(r.kin,{people:r.people,life:{...r.life,gameTime:ageTime}});r.nativeDiplomacy.lastDay=day;r.nativeDiplomacy.month=r.life.lastAgeMonth;r.tribute.lastDay=day;r.rebellion.lastDay=day;
}
