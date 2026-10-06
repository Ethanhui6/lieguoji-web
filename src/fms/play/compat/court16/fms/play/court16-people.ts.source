import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import {nativeInitialCharacter,seededCharacterRandom,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeCharacterSkills,nativeTaxModifier,type NativeBaseSkills} from './native-economy/character-income';
import {nativeOfficeHolder,type NativeOfficeData,type NativeOfficeQuery} from './native-economy/office-assignment';
import {nativeOfficeSuitability,nativeCentralIncome,nativeLocalIncome,type NativeEconomicOffice,type ResolvedOfficeHolder} from './native-economy/office-income';
import {f} from './native-economy/numeric';
export type CourtPerson={id:number;stateId:number;nationId:string;rulerId:string;name:string;family:string;alive:boolean;recordedDay:number;base:NativeBaseSkills;traits:string[]};
export type CourtNation={id:number;leaderId:number|null;offices:NativeOfficeData};
export type CourtPeople={version:1;origin:'native-skills-web-ruler-observation-v1';nextPersonId:number;nextStateId:number;revision:number;persons:Record<string,CourtPerson>;nations:Record<string,CourtNation>};
type PeopleWorld={world:World;chronicle:Chronicle};
export type CourtOffice=Exclude<NativeEconomicOffice,'DistrictGovernor'>;
export type Appointment={nationId:string;office:CourtOffice;provinceId:string|null;personId:number|null};
export const COURT_OFFICES={Chancellor:'宰相',Steward:'财政官',Governor:'省总督'} as const;
export function initialPeople(r:PeopleWorld):CourtPeople{
 const data:CourtPeople={version:1,origin:'native-skills-web-ruler-observation-v1',nextPersonId:1,nextStateId:1,revision:0,persons:{},nations:{}};reconcilePeople(r,data);return data;
}
/** Only observed current rulers acquire new records. Historic ended reigns are
 * not retroactively declared alive or dead; abdication isn't a death event. */
export function reconcilePeople(r:PeopleWorld,data:CourtPeople):void{
 for(const n of r.world.nations){
  const nation=data.nations[n.id]??(data.nations[n.id]={id:data.nextStateId++,leaderId:null,offices:{assignments:[],normalized:true,revision:0}});
  const ruler=r.chronicle.leaders[n.id]?.at(-1),active=ruler&&ruler.endedDay===null&&!Object.hasOwn(r.chronicle.ended,n.id);
  if(!active){nation.leaderId=null;continue;}
  let person=Object.values(data.persons).find(p=>p.rulerId===ruler.id);
  if(!person){
   if(data.nextPersonId>=2147483647)throw Error('人物编号已达安全上限，请保留存档。');
   const generated=nativeInitialCharacter(seededCharacterRandom(`${r.world.custom?.seed??''}/native-person/${ruler.id}`)),id=data.nextPersonId++;
   person={id,stateId:nation.id,nationId:n.id,rulerId:ruler.id,name:ruler.name,family:ruler.family,alive:true,recordedDay:r.world.day,base:generated.base,traits:generated.traits.map(t=>t.name)};data.persons[String(id)]=person;data.revision++;
  }
  nation.leaderId=person.alive?person.id:null;
 }
}
export function personTraits(person:CourtPerson){return person.traits.map(name=>{const trait=NATIVE_CHARACTER_POOL.find(t=>t.name===name);if(!trait)throw Error('未知人物特性，已保留原档。');return trait;});}
export function personSkills(person:CourtPerson){return nativeCharacterSkills(person.base,personTraits(person));}
export function courtQuery(people:CourtPeople,w:World,a:Pick<Appointment,'nationId'|'office'|'provinceId'>):NativeOfficeQuery{
 const n=people.nations[a.nationId];if(!n)throw Error('国家人物档案不存在。');
 return {officeId:a.office,scopeKind:a.office==='Governor'?1:0,scopeId:a.office==='Governor'?w.provinces.findIndex(p=>p.id===a.provinceId)+1:n.id,warSystemKind:0};
}
export function courtHolder(people:CourtPeople,w:World,a:Pick<Appointment,'nationId'|'office'|'provinceId'>):ResolvedOfficeHolder|null{
 const nation=people.nations[a.nationId];if(!nation)return null;
 const map=new Map(Object.values(people.persons).map(p=>[p.id,{...p,skills:personSkills(p)}]));
 // All stored office tables are normalized. Queries do not repair user saves.
 return nativeOfficeHolder(nation.id,nation.offices,courtQuery(people,w,a),map);
}
export function courtIncome(people:CourtPeople,w:World,nationId:string,provinceId?:string){
 const n=people.nations[nationId];if(!n)return {tax:1,central:1,local:1};
 const leader=n.leaderId===null?null:people.persons[n.leaderId];
 const suitable=(office:CourtOffice)=>nativeOfficeSuitability(n.id,courtHolder(people,w,{nationId,office,provinceId:office==='Governor'?provinceId??null:null}),office);
 return {tax:leader&&leader.id>0&&leader.alive&&leader.stateId===n.id?f(1+nativeTaxModifier(personTraits(leader))):1,central:nativeCentralIncome(suitable('Chancellor'),suitable('Steward')),local:provinceId&&w.provinces.some(p=>p.id===provinceId&&p.controller===nationId)?nativeLocalIncome(suitable('Governor'),0):1};
}
/** God-view appointment is a web intervention, not claimed original AI hiring.
 * Districts/kinship/deaths remain outside this economic slice. */
export function previewAppointment(r:PeopleWorld&{people:CourtPeople},a:Appointment){
 const n=r.people.nations[a.nationId],p=a.personId===null?null:r.people.persons[a.personId],province=r.world.provinces.find(p=>p.id===a.provinceId);
 let reason='任命从下次财政结算生效；已经入账的金币和财政战力保持原记录。';
 if(!n||!r.world.provinces.some(p=>p.controller===a.nationId))reason='国家已经失去全部领土，不能任命。';
 else if(!Object.hasOwn(COURT_OFFICES,a.office))reason='该官职尚未开放。';
 else if(a.office==='Governor'?(!province||province.controller!==a.nationId):a.provinceId!==null)reason='任职范围不属于当前国家。';
 else if(a.personId!==null&&(!p||!p.alive||p.stateId!==n.id))reason='必须选择仍然存活且属于本国的人物。';
 else return {valid:true,reason,title:a.personId===null?`撤下${COURT_OFFICES[a.office]}`:`任命${p!.name}为${COURT_OFFICES[a.office]}`};
 return {valid:false,reason,title:'无法任命'};
}
export function applyAppointment(r:PeopleWorld&{people:CourtPeople},a:Appointment):void{
 const preview=previewAppointment(r,a);if(!preview.valid)throw Error(preview.reason);
 const n=r.people.nations[a.nationId],query=courtQuery(r.people,r.world,a),list=n.offices.assignments!;
 const index=list.findIndex(v=>v&&v.officeId===query.officeId&&v.scopeKind===query.scopeKind&&v.scopeId===query.scopeId&&v.warSystemKind===0);
 if(a.personId===null){if(index>=0)list.splice(index,1);}else{const value={...query,holderCharacterId:a.personId};if(index<0)list.push(value);else list[index]=value;}
 n.offices.revision++;r.people.revision++;
 r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'system',text:preview.title,reason:preview.reason});r.world.events=r.world.events.slice(-160);
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertPeopleSchema(v:unknown):void{
 const p=v as CourtPeople|undefined;
 const futureOffice=(a:unknown)=>{if(!record(a))return false;return unknown(a,['officeId','scopeKind','scopeId','warSystemKind','holderCharacterId'])||typeof a.officeId==='string'&&!Object.hasOwn(COURT_OFFICES,a.officeId)||typeof a.scopeKind==='number'&&![0,1].includes(a.scopeKind)||typeof a.warSystemKind==='number'&&a.warSystemKind!==0;};
 if(unknown(p,['version','origin','nextPersonId','nextStateId','revision','persons','nations'])||p?.version!=null&&p.version!==1||p?.origin!=null&&p.origin!=='native-skills-web-ruler-observation-v1'||record(p?.persons)&&Object.values(p.persons).some(x=>unknown(x,['id','stateId','nationId','rulerId','name','family','alive','recordedDay','base','traits'])||unknown(x?.base,['administrative','military','diplomatic','charisma'])||Array.isArray(x?.traits)&&x.traits.some(t=>typeof t==='string'&&!NATIVE_CHARACTER_POOL.some(v=>v.name===t)))||record(p?.nations)&&Object.values(p.nations).some(n=>unknown(n,['id','leaderId','offices'])||unknown(n?.offices,['assignments','normalized','revision'])||Array.isArray(n?.offices?.assignments)&&n.offices.assignments.some(futureOffice)))throw Error('人物存档含未来规则或未知字段，已锁定读写。');
}
export function assertPeople(data:CourtPeople,r:PeopleWorld):void{
 assertPeopleSchema(data);const fail=()=>{throw Error('人物或官职存档损坏，已保留原档。');},integer=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
 if(!data||data.version!==1||data.origin!=='native-skills-web-ruler-observation-v1'||!record(data.persons)||!record(data.nations)||!integer(data.nextPersonId,1)||!integer(data.nextStateId,1)||!integer(data.revision))return fail();
 if(Object.keys(data.nations).length!==r.world.nations.length||r.world.nations.some(n=>!data.nations[n.id]))fail();
 const stateIds=new Set<number>(),rulerIds=new Set<string>();
 for(const [id,n]of Object.entries(data.nations)){
  if(!record(n)||!integer(n.id,1,data.nextStateId-1)||stateIds.has(n.id)||(n.leaderId!==null&&!integer(n.leaderId,1,data.nextPersonId-1))||!record(n.offices)||n.offices.normalized!==true||!integer(n.offices.revision)||!Array.isArray(n.offices.assignments))return fail();stateIds.add(n.id);
  const ruler=r.chronicle.leaders[id]?.at(-1),active=ruler&&ruler.endedDay===null&&!Object.hasOwn(r.chronicle.ended,id),person=n.leaderId===null?null:data.persons[n.leaderId];
  if(active?(!person||person.id!==n.leaderId||!person.alive||person.rulerId!==ruler.id||person.stateId!==n.id):n.leaderId!==null)fail();
  for(const a of n.offices.assignments){if(!a||!Object.hasOwn(COURT_OFFICES,a.officeId??'')||a.warSystemKind!==0||!integer(a.holderCharacterId,1,data.nextPersonId-1)||!data.persons[a.holderCharacterId]||!integer(a.scopeId,1)||!(a.officeId==='Governor'?a.scopeKind===1&&a.scopeId<=r.world.provinces.length:a.scopeKind===0&&a.scopeId===n.id))fail();}
 }
 for(const [key,p]of Object.entries(data.persons)){
  if(!record(p)||!integer(p.id,1,data.nextPersonId-1)||key!==String(p.id)||!data.nations[p.nationId]||p.stateId!==data.nations[p.nationId].id||typeof p.alive!=='boolean'||typeof p.name!=='string'||typeof p.family!=='string'||!integer(p.recordedDay,0,r.world.day)||typeof p.rulerId!=='string'||rulerIds.has(p.rulerId)||!r.chronicle.leaders[p.nationId]?.some(v=>v.id===p.rulerId)||!record(p.base)||['charisma','military','diplomatic','administrative'].some(k=>typeof p.base[k as keyof NativeBaseSkills]!=='number'||!Number.isFinite(p.base[k as keyof NativeBaseSkills])||p.base[k as keyof NativeBaseSkills]<0||p.base[k as keyof NativeBaseSkills]>100)||!Array.isArray(p.traits)||p.traits.length>27||new Set(p.traits).size!==p.traits.length||p.traits.some(t=>typeof t!=='string'||!NATIVE_CHARACTER_POOL.some(v=>v.name===t)))return fail();
  const ruler=r.chronicle.leaders[p.nationId].find(v=>v.id===p.rulerId)!;if(p.name!==ruler.name||p.family!==ruler.family||p.recordedDay<ruler.ascendedDay||ruler.endedDay!==null&&p.recordedDay>ruler.endedDay)fail();rulerIds.add(p.rulerId);
 }
}
