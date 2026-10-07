import {War32Session} from './war32-session';
import type {War32Run} from './war32-model';
import {grid} from './fixture.test-support';
import {makeVassal32} from './war32-vassals';
import {lifeTime} from './life22-state';
import {isoPlusDays} from './native-economy/iso-calendar';
import {reconcileKin} from './dynasty23-state';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
/** Synthetic boundary fixture, not an organically played year. Tests then use
 * the real session/Worker to cross the payment date. Never user-origin data. */
export function fixtureDate32(r:War32Run,day:number){
 r.world.day=day;r.clock.tick=day*120;r.life.lastTick=r.clock.tick;r.life.gameTime=lifeTime(r.life,r.clock.tick);r.life.currentDate=isoPlusDays(r.life.startDate,day);r.life.lastAgeMonth=r.life.currentDate.year*12+r.life.currentDate.month-1;
 const ageTime=Math.fround((day-r.life.currentDate.day+1)*r.life.secondsPerDay),calendar=createNativeIsoCalendar(r.life.startDate);
 for(const p of Object.values(r.life.persons))if(p.source==='native-founding'){p.updatedMonth=r.life.lastAgeMonth;p.age=nativeGetYearSince(p.birthTime!,ageTime,r.life.secondsPerDay,calendar);}
 reconcileKin(r.kin,{people:r.people,life:{...r.life,gameTime:ageTime}});r.nativeDiplomacy.lastDay=day;r.nativeDiplomacy.month=r.life.lastAgeMonth;r.tribute.lastDay=day;
}
export function tributeFixture32(){
 const r=new War32Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War32Run;
 const [a,b]=r.world.nations.map(n=>n.id);makeVassal32(r,b,a,()=>{});r.vassals.records[0].updateDay=10;
 r.diplomacy.worldAuto=false;fixtureDate32(r,342);r.finance.nations[b].gold=10000;r.finance.nations[b].goldPerMonth=100;r.finance.nations[a].gold=5000;
 return r;
}
