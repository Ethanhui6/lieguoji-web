import {assertPeopleSchema,COURT_OFFICES,type CourtPeople,type CourtPerson} from './court16-people';
import {nativeInitialCharacter,seededCharacterRandom,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import type {NativeBaseSkills} from './native-economy/character-income';
import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import type {Sovereignty} from './restoration19-sovereignty';
type PeopleWorld={world:World;chronicle:Chronicle};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Existing person records keep their first-observed reign and date. Every
 * later tenure points to the same person through the explicit reign table. */
export function reconcilePeople(r:PeopleWorld,data:CourtPeople,s:Sovereignty):void{
 for(const n of r.world.nations){
  const nation=data.nations[n.id]??(data.nations[n.id]={id:data.nextStateId++,leaderId:null,offices:{assignments:[],normalized:true,revision:0}});
  const ruler=r.chronicle.leaders[n.id]?.at(-1),active=ruler&&ruler.endedDay===null&&!Object.hasOwn(r.chronicle.ended,n.id);
  if(!active){nation.leaderId=null;continue;}
  let person=s.reigns[ruler.id]===undefined?Object.values(data.persons).find(p=>p.rulerId===ruler.id):data.persons[s.reigns[ruler.id]];
  if(!person){
   if(Object.hasOwn(s.reigns,ruler.id))throw Error('任次人物关联损坏。');
   if(data.nextPersonId>=2147483647)throw Error('人物编号已达安全上限，请保留存档。');
   const generated=nativeInitialCharacter(seededCharacterRandom((r.world.custom?.seed??'')+'/native-person/'+ruler.id)),id=data.nextPersonId++;
   person={id,stateId:nation.id,nationId:n.id,rulerId:ruler.id,name:ruler.name,family:ruler.family,alive:true,recordedDay:r.world.day,base:generated.base,traits:generated.traits.map(t=>t.name)};data.persons[String(id)]=person;data.revision++;
  }
  if(s.reigns[ruler.id]!==person.id){s.reigns[ruler.id]=person.id;s.revision++;}
  nation.leaderId=person.alive?person.id:null;
 }
}
/** Explicit temporary web bridge until the original family/member lifecycle is
 * populated: latest known living former ruler, not an invented patriarch. */
export function knownRestorationPerson(r:PeopleWorld&{people:CourtPeople;sovereignty:Sovereignty},nationId:string):CourtPerson|null{
 for(const reign of [...(r.chronicle.leaders[nationId]??[])].reverse()){const id=r.sovereignty.reigns[reign.id],p=r.people.persons[id];if(p?.alive&&p.nationId===nationId&&p.stateId===r.people.nations[nationId]?.id)return p;}
 return null;
}
export function assertPeople(data:CourtPeople,r:PeopleWorld,s:Sovereignty):void{
 assertPeopleSchema(data);const fail=()=>{throw Error('人物或官职存档损坏，已保留原档。');},integer=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
 if(!data||data.version!==1||data.origin!=='native-skills-web-ruler-observation-v1'||!record(data.persons)||!record(data.nations)||!integer(data.nextPersonId,1)||!integer(data.nextStateId,1)||!integer(data.revision))return fail();
 if(Object.keys(data.nations).length!==r.world.nations.length||r.world.nations.some(n=>!data.nations[n.id]))fail();
 const stateIds=new Set<number>(),rulerIds=new Set<string>();
 for(const [id,n]of Object.entries(data.nations)){
  if(!record(n)||!integer(n.id,1,data.nextStateId-1)||stateIds.has(n.id)||(n.leaderId!==null&&!integer(n.leaderId,1,data.nextPersonId-1))||!record(n.offices)||n.offices.normalized!==true||!integer(n.offices.revision)||!Array.isArray(n.offices.assignments))return fail();stateIds.add(n.id);
  const ruler=r.chronicle.leaders[id]?.at(-1),active=ruler&&ruler.endedDay===null&&!Object.hasOwn(r.chronicle.ended,id),person=n.leaderId===null?null:data.persons[n.leaderId];
  if(active?(!person||person.id!==n.leaderId||!person.alive||s.reigns[ruler.id]!==person.id||person.stateId!==n.id):n.leaderId!==null)fail();
  for(const a of n.offices.assignments){if(!a||!Object.hasOwn(COURT_OFFICES,a.officeId??'')||a.warSystemKind!==0||!integer(a.holderCharacterId,1,data.nextPersonId-1)||!data.persons[a.holderCharacterId]||!integer(a.scopeId,1)||!(a.officeId==='Governor'?a.scopeKind===1&&a.scopeId<=r.world.provinces.length:a.scopeKind===0&&a.scopeId===n.id))fail();}
 }
 for(const [key,p]of Object.entries(data.persons)){
  if(!record(p)||!integer(p.id,1,data.nextPersonId-1)||key!==String(p.id)||!data.nations[p.nationId]||p.stateId!==data.nations[p.nationId].id||typeof p.alive!=='boolean'||typeof p.name!=='string'||typeof p.family!=='string'||!integer(p.recordedDay,0,r.world.day)||typeof p.rulerId!=='string'||rulerIds.has(p.rulerId)||!r.chronicle.leaders[p.nationId]?.some(v=>v.id===p.rulerId)||!record(p.base)||['charisma','military','diplomatic','administrative'].some(k=>typeof p.base[k as keyof NativeBaseSkills]!=='number'||!Number.isFinite(p.base[k as keyof NativeBaseSkills])||p.base[k as keyof NativeBaseSkills]<0||p.base[k as keyof NativeBaseSkills]>100)||!Array.isArray(p.traits)||p.traits.length>27||new Set(p.traits).size!==p.traits.length||p.traits.some(t=>typeof t!=='string'||!NATIVE_CHARACTER_POOL.some(v=>v.name===t)))return fail();
  const ruler=r.chronicle.leaders[p.nationId].find(v=>v.id===p.rulerId)!;if(p.name!==ruler.name||p.family!==ruler.family||p.recordedDay<ruler.ascendedDay||ruler.endedDay!==null&&p.recordedDay>ruler.endedDay)fail();rulerIds.add(p.rulerId);
 }
}
