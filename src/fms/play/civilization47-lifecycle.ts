import {nativeAdvanceCharacterMonth} from './native-economy/character-month';
import {nativeProcessNaturalDeath,nativeFillLeaderDeathEvent,type NativeLeaderDeathEvent} from './native-economy/natural-death';
import {nativeCharacterDie} from './native-economy/character-death';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {nativeExpiredCharacterIds} from './native-economy/character-lifecycle';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {nativeFindSuccessor,nativeFamilyFallback} from './native-economy/family-succession';
import {nativeHandlePatriarchSuccession} from './native-economy/patriarch-succession';
import {nativeRepublicEmergencyLeader,nativeTheocracyEmergencyLeader,nativeTribalEmergencyLeader} from './native-economy/succession-candidates';
import {nativeCharacterSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import {appointKnownPersonOwned47} from './civilization47-succession';
import {pastRole47} from './civilization47-roles';
import {announce} from './civilization47-history';
import {advanceGenerationsMonthOwned47} from './civilization47-generations';
import type {Population47,FamilyPerson47,Family47,Lifecycle47,PersonRole47} from './civilization47-population-types';

/** A dedicated persisted web RNG, not Unity's unrecovered global stream. */
export function drawLife47(random:Lifecycle47['random']){
 if(!Number.isSafeInteger(random.draws+1))throw Error('人物随机记录已达上限。');
 random.state=(Math.imul(random.state,1664525)+1013904223)>>>0;random.draws++;return Math.fround(random.state/4294967296);
}
const lookup47=(r:Population47)=>(id:number)=>r.kin.persons[id]??null;
const living47=(r:Population47,f:Pick<Family47,'memberIds'>)=>f.memberIds.map(lookup47(r)).filter((p):p is FamilyPerson47=>!!p?.isAlive);
export function knownSuccessor47(r:Population47,nationId:string,previous:FamilyPerson47){
 const family=r.kin.families[previous.familyId],getCharacter=lookup47(r),skills=(p:FamilyPerson47)=>nativeCharacterSkills(p.base,combatTraits47(p.traits));
 const abilities={charisma:(p:FamilyPerson47)=>skills(p).charisma,administrative:(p:FamilyPerson47)=>skills(p).administrative,military:(p:FamilyPerson47)=>skills(p).military,diplomatic:(p:FamilyPerson47)=>skills(p).diplomatic};
 const polity=r.civilization.nations[nationId].polity;
 if(polity==='Kingdom'||polity==='Empire')return nativeFindSuccessor(family,previous,getCharacter,()=>null)??nativeFamilyFallback(family,{...abilities,getCharacter,getLivingMembers:f=>living47(r,r.kin.families[f.id])});
 // Neutral influence/merit is explicit: only one real family per state exists
 // in this engine. Do not claim multi-house elections or fabricate votes.
 const families=Object.values(r.kin.families).map(f=>({...f,influence:0}));
 const ports={...abilities,familyManager:()=>({getFamiliesByState:(id:number)=>families.filter(f=>f.stateId===id)}),characterManager:()=>({getCharacter}),getLivingMembers:(f:Family47)=>living47(r,f),warMerit:()=>0,stateId:(s:{i:number})=>s.i};
 const state={i:r.people.nations[nationId].id};
 return polity==='Republic'||polity==='Federation'?nativeRepublicEmergencyLeader(state,ports):polity==='Theocracy'?nativeTheocracyEmergencyLeader(state,ports):nativeTribalEmergencyLeader(state,ports);
}
export function resolveKnownSuccessionOwned47(r:Population47,nationId:string,previous:FamilyPerson47,cause:'death'|'vacancy'|'restoration'){
 const heir=knownSuccessor47(r,nationId,previous);
 if(heir){appointKnownPersonOwned47(r,nationId,heir,cause);return true;}
 r.kin.lifecycle.vacancies[nationId]??={sinceDay:r.world.day,previousPersonId:previous.id,reason:cause==='restoration'?'restoration-no-known-candidate':'no-known-candidate'};
 return false;
}
function familyFacade47(f:Family47){return {id:f.id,get patriarchId(){return f.headId;},set patriarchId(v:number){f.headId=v;},get heirId(){return f.heirId;},set heirId(v:number){f.heirId=v;}};}
/** Private transaction primitive. The public Session/calendar caller owns
 * rollback of every death, role, event, candidate and random draw together. */
export function diePersonOwned47(r:Population47,person:FamilyPerson47){
 if(r.kin.persons[person.id]!==person||!person.isAlive||r.kin.lifecycle.deaths.some(d=>d.personId===person.id))throw Error('死亡人物缺失或已记录。');
 const stateById=(id:number)=>{const entry=Object.entries(r.people.nations).find(([,v])=>v.id===id);return entry?{nationId:entry[0],i:id}:null;};
 const getCharacter=lookup47(r),calendar=createNativeIsoCalendar(r.life.startDate),getYearSince=(time:number)=>nativeGetYearSince(time,r.life.gameTime,r.life.secondsPerDay,calendar);
 const leader=person.roles.find(role=>role.nativeKind==='leader'),state=leader?stateById(leader.stateId):null;
 const row:Lifecycle47['deaths'][number]={personId:person.id,day:r.world.day,tick:r.clock.tick,age:person.age,wasLeaderOf:state?.nationId??null,deathHistoryId:null};
 r.kin.lifecycle.deaths.push(row);
 const court=r.people.persons[person.id];if(court)court.alive=false;
 nativeCharacterDie<PersonRole47,FamilyPerson47,NonNullable<typeof state>,ReturnType<typeof familyFacade47>,NativeLeaderDeathEvent>(person,{
  gameTime:()=>r.life.gameTime,characterManager:()=>({getCharacter}),roles:p=>p.roles,nationalLeader:role=>role.nativeKind==='leader'?role:null,stateManager:()=>({getState:stateById}),
  familyManager:()=>({getFamily:id=>r.kin.families[id]?familyFacade47(r.kin.families[id]):null,handlePatriarchSuccession:f=>nativeHandlePatriarchSuccession(f,{getCharacter,findSuccessor:(_,old)=>nativeFindSuccessor(r.kin.families[f.id],old,getCharacter,()=>null),getLivingMembers:()=>living47(r,r.kin.families[f.id])})}),
  dismissOffices:p=>{if(Object.values(r.people.nations).some(n=>!n.offices.assignments||n.offices.assignments.some(a=>!a||a.holderCharacterId===p.id)))throw Error('人物尚有未接入生命周期的官职，本次候选已取消。');},getYearSince,
  createDeathEvent:(s,id,cause,years,time)=>{const e:NativeLeaderDeathEvent={timestamp:0,type:0,stateId:0,leaderId:0,causeOfDeath:null,reignYears:0};nativeFillLeaderDeathEvent(e,s,id,cause,years,time);return e;},
  recordGlobal:e=>{const s=stateById(e.stateId)!,history=r.chronicle.leaders[s.nationId],old=history.at(-1)!;
   if(r.people.nations[s.nationId].leaderId!==person.id||r.sovereignty.reigns[old.id]!==person.id||old.endedDay!==null)throw Error('死亡与现任任期不一致。');
   old.endedDay=r.world.day;r.people.nations[s.nationId].leaderId=null;
   // Chronicle's historical envelope is shared by old engines. Keep its kind
   // vocabulary immutable; the typed lifecycle ledger binds the death subtype
   // by ID for validation/UI, never by matching a person's displayed name.
   row.deathHistoryId=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===s.nationId)!.name}：${person.identity.name}去世，享年${person.age}岁`,'真实月检按原作年龄概率发生自然死亡；终止实际任期，保留人物及其家谱履历。',[s.nationId],null,[old]).id;
  },recordState:(s,e)=>{if(s.i!==e.stateId||row.deathHistoryId===null)throw Error('死亡历史国家归属不一致。');},
  pastRole:(role,time,reason)=>pastRole47(role,time,reason),resolveState:s=>resolveKnownSuccessionOwned47(r,s.nationId,person,'death'),
 });
 r.people.revision++;r.kin.revision++;r.kin.lifecycle.revision++;
}
/** Original sequential age -> death -> succession order, once per ISO month.
 * No timer synthesizes news and no person is created to fill a vacant office. */
export function advancePeopleMonthOwned47(r:Population47){
 const l=r.life,k=r.kin,s=k.lifecycle,month=l.currentDate.year*12+l.currentDate.month-1;
 if(month===s.lastMonth)return false;
 if(month!==s.lastMonth+1||l.lastAgeMonth!==s.lastMonth||k.lastAgeMonth!==s.lastMonth)throw Error('人物月份不连续。');
 const calendar=createNativeIsoCalendar(l.startDate),getYearSince=(time:number)=>nativeGetYearSince(time,l.gameTime,l.secondsPerDay,calendar),characters=new Map(Object.values(k.persons).map(p=>[p.id,p]));
 const manager={characters,stats:s.stats};
 nativeAdvanceCharacterMonth(manager,{
  getYearSince,currentMonth:()=>l.currentDate.month,processNaturalDeath:p=>{
   if(p.isAlive){l.persons[p.id].age=p.age;l.persons[p.id].updatedMonth=month;}
   return nativeProcessNaturalDeath(p,{randomValue:()=>drawLife47(s.random),stats:()=>manager.stats,die:p=>diePersonOwned47(r,p)});
  },cleanupOldCharacters:()=>{nativeExpiredCharacterIds(characters,getYearSince);/* Identity/history retained; do not delete a referenced dead person. */},
 });
 for(const [id,v] of Object.entries(s.vacancies))if(r.world.provinces.some(p=>p.controller===id))resolveKnownSuccessionOwned47(r,id,k.persons[v.previousPersonId],'vacancy');
 s.stats=manager.stats;s.lastMonth=month;s.revision++;k.ageTime=l.gameTime;k.lastAgeMonth=month;k.revision++;l.lastAgeMonth=month;l.revision++;
 advanceGenerationsMonthOwned47(r);return true;
}
