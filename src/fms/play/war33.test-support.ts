import {War33Session} from './war33-session';
import type {War33Run} from './war33-model';
import {grid} from './fixture.test-support';
import {makeVassal33} from './war33-vassals';
import {war26Strength} from './war26-strength';
import {lifeTime} from './life22-state';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';
import {reconcileKin} from './dynasty23-state';
import {nativeGetYearSince} from './native-economy/character-calendar';
export function fixtureDate33(r:War33Run,day:number){
 r.world.day=day;r.clock.tick=day*120;r.life.lastTick=r.clock.tick;r.life.gameTime=lifeTime(r.life,r.clock.tick);r.life.currentDate=isoPlusDays(r.life.startDate,day);r.life.lastAgeMonth=r.life.currentDate.year*12+r.life.currentDate.month-1;
 const ageTime=Math.fround((day-r.life.currentDate.day+1)*r.life.secondsPerDay),calendar=createNativeIsoCalendar(r.life.startDate);
 for(const p of Object.values(r.life.persons))if(p.source==='native-founding'){p.updatedMonth=r.life.lastAgeMonth;p.age=nativeGetYearSince(p.birthTime!,ageTime,r.life.secondsPerDay,calendar);}
 reconcileKin(r.kin,{people:r.people,life:{...r.life,gameTime:ageTime}});r.nativeDiplomacy.lastDay=day;r.nativeDiplomacy.month=r.life.lastAgeMonth;r.tribute.lastDay=day;r.rebellion.lastDay=day;
}
export function fixtureDay33(r:War33Run,year:number,month:number,day:number){let i=(year-1)*365;while(true){const d=isoPlusDays(r.life.startDate,i);if(d.year===year&&d.month===month&&d.day===day)return i;i++;if(i>(year+1)*366)throw Error('Fixture calendar mismatch');}}
/** Deliberately synthetic calendar boundary; no claim of 12 years playtesting. */
export function rebellionFixture33(){
 const r=new War33Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War33Run;
 const ids=r.world.nations.map(n=>n.id).sort((a,b)=>war26Strength(r.world,r,a)-war26Strength(r.world,r,b));
 makeVassal33(r,ids.at(-1)!,ids[0],()=>{});r.vassals.records[0].updateDay=10;r.diplomacy.worldAuto=false;
 fixtureDate33(r,fixtureDay33(r,13,3,9));return r;
}
