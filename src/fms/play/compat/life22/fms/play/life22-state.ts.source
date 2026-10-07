import type {CourtPeople} from './court16-people';
import type {World} from '../../sim/types';
import {nativeGetDate,nativeGetYearSince,nativeUpdateCharacterAge,nativeBirthTimeFromAge} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoDate,isoPlusDays,type IsoDate} from './native-economy/iso-calendar';
import {f} from './native-economy/numeric';

export type LifePerson={source:'native-founding'|'legacy-unknown'|'web-observed';birthTime:number|null;age:number|null;initialAge:number|null;updatedMonth:number|null};
export type LifeState={version:1;schedule:'iso-age-web-ticks-v1';revision:number;originDay:number;startDate:IsoDate;secondsPerDay:number;gameTime:number;lastTick:number;currentDate:IsoDate;lastAgeMonth:number;persons:Record<string,LifePerson>};
type LifeWorld={world:World;clock:{tick:number};people:CourtPeople};
const monthKey=(d:IsoDate)=>d.year*12+d.month-1;
export const lifeTime=(s:LifeState,tick:number)=>f(((tick-s.originDay*120)/120)*s.secondsPerDay);
export const unknownLife=(source:'legacy-unknown'|'web-observed'):LifePerson=>({source,birthTime:null,age:null,initialAge:null,updatedMonth:null});
/** Explicit new clock basis for a new world or an explicitly requested copy.
 * Loading never calls this. Existing people are never assigned invented dates. */
export function initialLife22(r:LifeWorld):LifeState{
 const s:LifeState={version:1,schedule:'iso-age-web-ticks-v1',revision:0,originDay:r.world.day,startDate:isoDate(1,1,1),secondsPerDay:f(.1),gameTime:0,lastTick:r.clock.tick,currentDate:isoDate(1,1,1),lastAgeMonth:12,persons:Object.fromEntries(Object.keys(r.people.persons).map(id=>[id,unknownLife('legacy-unknown')]))};
 s.gameTime=lifeTime(s,s.lastTick);return s;
}
/** Reigns may reuse a person. The key is person ID, never the current ruler ID. */
export function reconcileLife22(s:LifeState,people:CourtPeople):void{
 for(const id of Object.keys(people.persons))if(!Object.hasOwn(s.persons,id)){s.persons[id]=unknownLife('web-observed');s.revision++;}
}
/** Called on a private draft before the next world tick. The 120-tick clock is
 * a web bridge; it does not claim Unity frame-by-frame float accumulation.
 * Calendar month starts are independent of the old 30-day financial buckets. */
export function advanceLife22(s:LifeState,people:CourtPeople,tick:number):void{
 if(!Number.isSafeInteger(tick)||tick!==s.lastTick+1)throw Error('人物日历时刻不连续，已取消推进。');
 s.gameTime=lifeTime(s,tick);s.lastTick=tick;
 if(tick%120!==0)return;
 s.currentDate=isoPlusDays(s.startDate,tick/120-s.originDay);
 const month=monthKey(s.currentDate);
 if(s.currentDate.day!==1||month===s.lastAgeMonth)return;
 const calendar=createNativeIsoCalendar(s.startDate);
 for(const [id,person]of Object.entries(people.persons)){
  const record=s.persons[id];if(!record)throw Error('人物生日记录缺失，已取消推进。');
  if(record.source!=='native-founding'||!person.alive)continue;
  const value={isAlive:person.alive,age:record.age!,birthTime:record.birthTime!};
  nativeUpdateCharacterAge(value,birthTime=>nativeGetYearSince(birthTime,s.gameTime,s.secondsPerDay,calendar));record.age=value.age;record.updatedMonth=month;
 }
 s.lastAgeMonth=month;s.revision++;
}
export function lifeBirthday(s:LifeState,p:LifePerson):IsoDate|null{return p.birthTime===null?null:nativeGetDate(p.birthTime,s.secondsPerDay,createNativeIsoCalendar(s.startDate));}
export function lifeDateLabel(d:IsoDate):string{return d.year<=0?`公元前 ${1-d.year} 年 ${d.month} 月 ${d.day} 日`:`${d.year} 年 ${d.month} 月 ${d.day} 日`;}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const personKeys=['source','birthTime','age','initialAge','updatedMonth'];
const stateKeys=['version','schedule','revision','originDay','startDate','secondsPerDay','gameTime','lastTick','currentDate','lastAgeMonth','persons'];
export function assertLifeSchema(v:unknown):void{
 const s=v as LifeState|undefined;
 if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||s?.schedule!=null&&s.schedule!=='iso-age-web-ticks-v1'||unknown(s?.startDate,['year','month','day'])||unknown(s?.currentDate,['year','month','day'])||record(s?.persons)&&Object.values(s.persons).some(p=>unknown(p,personKeys)||p?.source!=null&&!['native-founding','legacy-unknown','web-observed'].includes(p.source)))throw Error('人物日历含未来规则或未知字段，已锁定读写。');
}
export function assertLife22(s:LifeState,r:LifeWorld):void{
 assertLifeSchema(s);const fail=()=>{throw Error('人物日历或生日记录损坏，已保留原档。');},integer=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||s.schedule!=='iso-age-web-ticks-v1'||!integer(s.revision)||!integer(s.originDay,0,r.world.day)||!record(s.startDate)||!record(s.currentDate)||!record(s.persons)||s.secondsPerDay!==f(.1)||s.lastTick!==r.clock.tick||!Number.isFinite(s.gameTime)||s.gameTime!==lifeTime(s,s.lastTick)||Object.keys(s.persons).length!==Object.keys(r.people.persons).length)return fail();
 try{const expected=isoPlusDays(isoDate(s.startDate.year,s.startDate.month,s.startDate.day),r.world.day-s.originDay);if(s.startDate.year!==1||s.startDate.month!==1||s.startDate.day!==1||expected.year!==s.currentDate.year||expected.month!==s.currentDate.month||expected.day!==s.currentDate.day||s.lastAgeMonth!==monthKey(expected))fail();}catch{return fail();}
 for(const [id,p]of Object.entries(s.persons)){
  if(!r.people.persons[id]||!record(p)||Object.keys(p).length!==personKeys.length)return fail();
  if(p.source==='native-founding'){
   if(s.originDay!==0||r.people.persons[id].recordedDay!==0||!integer(p.initialAge,35,54)||!integer(p.age,0,20000)||p.birthTime!==nativeBirthTimeFromAge(p.initialAge!,0,s.secondsPerDay)||!integer(p.updatedMonth,12,s.lastAgeMonth)||p.updatedMonth===12&&p.age!==p.initialAge||r.people.persons[id].alive&&p.updatedMonth!==s.lastAgeMonth)fail();
  }else if(!['legacy-unknown','web-observed'].includes(p.source)||p.birthTime!==null||p.age!==null||p.initialAge!==null||p.updatedMonth!==null)fail();
 }
}
