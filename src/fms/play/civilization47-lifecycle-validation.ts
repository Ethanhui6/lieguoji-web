import type {Population47} from './civilization47-population-types';
import {nativeDeathStatsDefaults} from './native-economy/character-month';
import {nativeRoundToEven} from './native-economy/native-round';
import {foundingTimeOfState47} from './civilization47-founding-time';

const exact=(v:unknown,keys:readonly string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const int=(v:unknown,min=0,max=2147483647):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const dense=(v:unknown):v is unknown[]=>Array.isArray(v)&&Object.keys(v).length===v.length&&Array.from(v).every(v=>v!==undefined);
const roleKeys=['roleType','roleTitle','stateId','familyId','startTime','endTime','endReason','officeId','officeScopeKind','officeScopeId','officeWarSystemKind','politicalSystemAtAppointment'];
export function assertLifecycle47(r:Population47){
 const fail=():never=>{throw Error('人物生命周期、死亡或职位履历证据不一致。');},s=r.kin.lifecycle,month=r.life.currentDate.year*12+r.life.currentDate.month-1;
 if(!exact(s,['version','rule','revision','lastMonth','random','stats','deaths','vacancies'])||s.version!==1||s.rule!=='native-month-death-known-emergency-v1'||!int(s.revision)||s.lastMonth!==month||!exact(s.random,['state','draws'])||!int(s.random.state,0,4294967295)||!int(s.random.draws,0,Number.MAX_SAFE_INTEGER)||JSON.stringify(s.stats)!==JSON.stringify(nativeDeathStatsDefaults())||!dense(s.deaths)||!s.vacancies||Array.isArray(s.vacancies))return fail();
 const deaths=new Map<number,typeof s.deaths[number]>();let lastTick=0;
 for(const d of s.deaths){const p=r.kin.persons[d?.personId];
  if(!exact(d,['personId','day','tick','age','wasLeaderOf','deathHistoryId'])||!p||p.isAlive||deaths.has(d.personId)||!int(d.day,0,r.world.day)||!int(d.tick,lastTick,r.clock.tick)||Math.floor(d.tick/120)!==d.day||d.age!==p.age||p.deathTime!==Math.fround(d.tick/120*r.life.secondsPerDay)||d.wasLeaderOf!==null&&!Object.hasOwn(r.people.nations,d.wasLeaderOf))return fail();
  if(d.wasLeaderOf!==null){const entry=r.chronicle.entries.find(e=>e.id===d.deathHistoryId),reigns=r.chronicle.leaders[d.wasLeaderOf];
   if(!entry||entry.kind!=='diplomacy'||entry.day!==d.day||entry.tick!==d.tick||entry.nationIds.length!==1||entry.nationIds[0]!==d.wasLeaderOf||entry.people.length!==1||r.sovereignty.reigns[entry.people[0].id]!==p.id||!reigns.some(v=>v.id===entry.people[0].id&&v.endedDay===d.day))return fail();
  }else if(d.deathHistoryId!==null)return fail();
  deaths.set(p.id,d);lastTick=d.tick;
 }
 for(const [id,v] of Object.entries(s.vacancies)){
  const n=r.people.nations[id],p=r.kin.persons[v?.previousPersonId],last=r.chronicle.leaders[id]?.at(-1);
  const death=p&&deaths.get(p.id);
  const cause=v.reason==='no-known-candidate'?!!death&&!p.isAlive&&v.sinceDay>=death.day:v.reason==='restoration-no-known-candidate'&&r.chronicle.entries.some(e=>e.kind==='restoration'&&e.day===v.sinceDay&&e.nationIds.includes(id)&&e.people.length===0);
  if(!exact(v,['sinceDay','previousPersonId','reason'])||!n||!p||!cause||p.stateId!==n.id||n.leaderId!==null||Object.hasOwn(r.chronicle.ended,id)||!int(v.sinceDay,0,r.world.day)||!last||last.endedDay===null||r.sovereignty.reigns[last.id]!==p.id)return fail();
 }
 for(const [id,n] of Object.entries(r.people.nations))if(n.leaderId===null&&!Object.hasOwn(r.chronicle.ended,id)&&!Object.hasOwn(s.vacancies,id))return fail();
 for(const p of Object.values(r.kin.persons)){
  const d=deaths.get(p.id),leaderRoles=p.roles.filter(v=>v.nativeKind==='leader');
  if(p.isAlive?!!d||p.deathTime!==0:!d||p.roles.length!==0)return fail();
  if(typeof p.isHistoricallyImportant!=='boolean'||leaderRoles.length>1||!dense(p.roles)||!dense(p.pastRoles))return fail();
  if(d?.wasLeaderOf!=null){const deathEntry=r.chronicle.entries.find(e=>e.id===d.deathHistoryId)!,title=r.civilization.rulers[deathEntry.people[0].id].titleAtAccession;
   if(p.pastRoles.filter(role=>role.roleType==='NationalLeader'&&role.endReason==='death'&&role.stateId===p.stateId&&role.roleTitle===title&&role.endTime===nativeRoundToEven(p.deathTime,2)).length!==1)return fail();
  }
  for(const role of p.roles){
   if(role.nativeKind==='leader'){
    const n=r.people.nations[r.kin.families[p.familyId].nationId],last=r.chronicle.leaders[r.kin.families[p.familyId].nationId].at(-1)!;
    // A state founded mid-run records its first reign on the founding (uprising) entry.
    const entry=r.chronicle.entries.find(e=>(e.kind==='accession'||e.kind==='uprising')&&e.people.some(v=>v.id===last.id));
    if(!entry||!exact(role,['nativeKind','holderId','startTime','roleType','title','reignStartTime','stateId'])||role.roleType!=='NationalLeader'||role.holderId!==p.id||role.stateId!==p.stateId||n.leaderId!==p.id||last.endedDay!==null||role.startTime!==0||role.reignStartTime!==Math.fround(entry.tick/120*r.life.secondsPerDay)||role.title!==r.civilization.rulers[last.id].titleAtAccession)return fail();
   }else if(role.nativeKind==='spouse'){
    const spouse=r.kin.persons[role.spouseOfId];
    if(!exact(role,['nativeKind','roleType','holderId','startTime','spouseOfId','stateId'])||role.roleType!=='Spouse'||role.holderId!==p.id||role.stateId!==p.stateId||(role.startTime!==0&&role.startTime!==foundingTimeOfState47(r,p.stateId)&&!r.generations?.marriages.some(m=>(m.aId===p.id&&m.bId===role.spouseOfId||m.bId===p.id&&m.aId===role.spouseOfId)&&role.startTime===Math.fround(m.tick/120*r.life.secondsPerDay)))||!spouse||spouse.familyId!==p.familyId||spouse.isAlive&&p.spouseId!==spouse.id||!spouse.isAlive&&p.spouseId!==0)return fail();
   }else return fail();
  }
  const nation=r.people.nations[r.kin.families[p.familyId].nationId];if(nation.leaderId===p.id&&leaderRoles.length!==1)return fail();
  for(const role of p.pastRoles){
   if(!exact(role,roleKeys)||!['NationalLeader','Spouse'].includes(role.roleType??'')||!['death','abdication','extinction'].includes(role.endReason??'')||(role.startTime!==0&&!(role.roleType==='Spouse'&&role.startTime===nativeRoundToEven(foundingTimeOfState47(r,p.stateId),2))&&!(role.roleType==='Spouse'&&r.generations?.marriages.some(m=>(m.aId===p.id||m.bId===p.id)&&role.startTime===nativeRoundToEven(Math.fround(m.tick/120*r.life.secondsPerDay),2))))||!Number.isFinite(role.endTime)||role.endTime<0||role.endTime>nativeRoundToEven(r.life.gameTime,2)||role.familyId!==0||role.officeId!==null||role.officeScopeKind!==0||role.officeScopeId!==0||role.officeWarSystemKind!==0||role.politicalSystemAtAppointment!==0)return fail();
   if(role.endReason==='death'&&(!d||role.endTime!==nativeRoundToEven(p.deathTime,2)))return fail();
   if(role.roleType==='Spouse'){if(role.roleTitle!==null||role.stateId!==0||role.endReason!=='death')return fail();}
   else {
    const reign=Object.values(r.chronicle.leaders).flatMap(history=>history.filter((v,i)=>{
     const end=role.endReason==='abdication'?r.chronicle.entries.find(e=>e.kind==='accession'&&e.people.some(p=>p.id===history[i+1]?.id)):role.endReason==='death'?r.chronicle.entries.find(e=>e.id===d?.deathHistoryId&&e.people.some(p=>p.id===v.id)):r.chronicle.entries.find(e=>e.kind==='extinction'&&e.people.some(p=>p.id===v.id));
     return r.sovereignty.reigns[v.id]===p.id&&v.endedDay!==null&&end&&end.day===v.endedDay&&nativeRoundToEven(Math.fround(end.tick/120*r.life.secondsPerDay),2)===role.endTime&&r.civilization.rulers[v.id].titleAtAccession===role.roleTitle;
    })).at(0);
    if(!reign||role.stateId!==p.stateId)return fail();
   }
  }
 }
 for(const f of Object.values(r.kin.families)){
  if(!int(f.heirId)||f.heirId!==0&&(!r.kin.persons[f.heirId]||r.kin.persons[f.heirId].familyId!==f.id))return fail();
  const head=r.kin.persons[f.headId];if(f.headId===0?f.memberIds.some(id=>r.kin.persons[id]?.isAlive):!head?.isAlive)return fail();
 }
}
