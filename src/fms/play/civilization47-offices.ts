import type {NobilityRun47,NobleFamily47} from './civilization47-nobility';
import type {FamilyPerson47} from './civilization47-population-types';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {courtIncome} from './court16-people';
import {sameCulture47Value} from './culture47-equal';
import {nativeCharacterSkills,type NativeBaseSkills} from './native-economy/character-income';
import {nativeGetMonthSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {combatTraits47} from './civilization47-combat-state';
import {familyWarMerit47} from './civilization47-nobility-territory';
import {familyRelation47} from './civilization47-nobility-relations';
import {DotNetRandom} from './native-economy/dotnet-random';
import {f} from './native-economy/numeric';

/** Original government offices (8月6日更新 官职系统): central Chancellor /
 * Steward / Marshal and provincial Governors, filled by GovernmentOfficeAI each
 * month (State.AdvanceOneMonth → ProcessMonthlyAppointments) and reviewed once a
 * year (ReviewAnnualAppointments). Districts and wartime commanders are not on
 * the web yet. Holders are real family characters (kin persons). */
export const OFFICE_RULE47='original-government-office-v1';
export type Office47Id='Chancellor'|'Steward'|'Marshal'|'Governor';
/** scopeKind 0 = state (scopeId = state id), 1 = province (scopeId = province index + 1).
 * source: GovernmentOfficeAppointmentSource (0 AI, 3 Emergency). */
export type Office47Assignment={officeId:Office47Id;holderId:number;scopeKind:0|1;scopeId:number;startTime:number;source:0|3};
export type Offices47={version:1;rule:typeof OFFICE_RULE47;revision:number;nations:Record<string,{assignments:Office47Assignment[];reviewYear:number}>};
export type OfficeRun47=NobilityRun47&{offices47?:Offices47};

/** GovernmentOfficeDefinitionCatalog: AI weights (administrative, military,
 * diplomatic, charisma), category (0 central, 1 local) and effect caps. */
export const OFFICE_DEFS47:Record<Office47Id,{w:[number,number,number,number];category:0|1;economic:number;rebellion:number;leadership:number}>={
  Chancellor:{w:[.45,.05,.3,.2],category:0,economic:.06,rebellion:0,leadership:0},
  Steward:{w:[.65,.05,.15,.15],category:0,economic:.08,rebellion:0,leadership:0},
  Marshal:{w:[.2,.6,.05,.15],category:0,economic:0,rebellion:0,leadership:.1},
  Governor:{w:[.5,.1,.2,.2],category:1,economic:.08,rebellion:.15,leadership:0},
};
export const OFFICE_LABELS47:Record<Office47Id,string>={Chancellor:'行政首脑',Steward:'财政主管',Marshal:'常备军统帅',Governor:'总督'};
const CENTRAL:Office47Id[]=['Chancellor','Steward','Marshal'];
const MAX_APPOINTMENTS_PER_MONTH=4,MAX_ANNUAL_REPLACEMENTS=2,MIN_TENURE_MONTHS=48;
/** GetReplacementThreshold by PoliticalSystem. */
const REPLACEMENT:Record<string,number>={Kingdom:18,Empire:18,Federation:12,Republic:12,Tribal:15,Theocracy:18};

const FNV_OFFSET=0x811c9dc5,FNV_PRIME=0x1000193;
const fnv=(h:number,v:number)=>Math.imul((h^v)>>>0,FNV_PRIME)>>>0;
const fnvStart=(v:number)=>Math.imul((v^FNV_OFFSET)>>>0,FNV_PRIME)>>>0;
const clamp=(v:number,lo:number,hi:number)=>lo>v?lo:v>hi?hi:v;

export function enableOffices47<T extends NobilityRun47>(input:T,expected:PopulationStamp47):T{
  const r=input as T&OfficeRun47;
  if(r.offices47||!sameCulture47Value(expected,populationStamp47(r)))throw Error('官职规则只能在世界未变化时启用，请重新操作。');
  const next=structuredClone(r) as T&OfficeRun47;
  next.offices47={version:1,rule:OFFICE_RULE47,revision:0,nations:Object.fromEntries(next.world.nations.map(n=>[n.id,{assignments:[],reviewYear:-1}]))};
  return next;
}

type Ctx={r:OfficeRun47;nationId:string;stateId:number;governance:number;leaderId:number;rulingFamily:string|null;relationCache:Map<string,number>};
const stateIdOf=(r:OfficeRun47,nationId:string)=>r.people.nations[nationId]?.id??0;
const book=(r:OfficeRun47,nationId:string)=>r.offices47!.nations[nationId]??(r.offices47!.nations[nationId]={assignments:[],reviewYear:-1});
const personSkills47=(p:FamilyPerson47):NativeBaseSkills=>nativeCharacterSkills(p.base,combatTraits47(p.traits));
const validHolder=(p:FamilyPerson47|undefined,stateId:number):p is FamilyPerson47=>!!p&&p.isAlive&&p.stateId===stateId;
const provinceAt=(r:OfficeRun47,scopeId:number)=>r.world.provinces[scopeId-1];
const ownsProvince=(r:OfficeRun47,nationId:string,scopeId:number)=>provinceAt(r,scopeId)?.controller===nationId;

/** GetGovernanceFactor: leader acumen (0.6 adm + 0.4 cha, 25 without a leader)
 * and destiny, remapped from [0.45, 0.85] to [0, 1]. */
export function governanceFactor47(r:OfficeRun47,nationId:string){
  const leaderId=r.people.nations[nationId]?.leaderId??null,leader=leaderId===null?undefined:r.kin.persons[leaderId];
  let acumen=25;
  if(validHolder(leader,stateIdOf(r,nationId))){const s=personSkills47(leader);acumen=f(f(s.administrative*f(.6))+f(s.charisma*f(.4)));}
  const destiny=clamp(f(f((r as unknown as {destiny:{nations:Record<string,{destiny:number}>}}).destiny.nations[nationId]?.destiny??0)/100),0,1);
  const a=clamp(f(acumen/100),0,1);
  return clamp(f(f(f(f(a*f(.45))+f(destiny*f(.55)))-f(.45))/f(.4)),0,1);
}
function context(r:OfficeRun47,nationId:string):Ctx{
  const ruling=r.nobility?.rulingFamilies[nationId]??0;
  return {r,nationId,stateId:stateIdOf(r,nationId),governance:governanceFactor47(r,nationId),leaderId:r.people.nations[nationId]?.leaderId??0,rulingFamily:ruling>0&&r.nobility?.families[String(ruling)]?String(ruling):null,relationCache:new Map()};
}
/** The holder of a slot when still valid (alive, same state), else null. */
export function officeHolder47(r:OfficeRun47,nationId:string,officeId:Office47Id,scopeId:number):FamilyPerson47|null{
  const a=r.offices47?.nations[nationId]?.assignments.find(v=>v.officeId===officeId&&v.scopeId===scopeId);if(!a)return null;
  const p=r.kin.persons[a.holderId];return validHolder(p,stateIdOf(r,nationId))?p:null;
}
/** GovernmentOfficeEffects.GetNormalizedOfficeSuitability: (Σ weight×skill − 50) / 50 in [−1, 1]; 0 without a valid holder. */
export function officeSuitability47(r:OfficeRun47,nationId:string,officeId:Office47Id,scopeId:number){
  const p=officeHolder47(r,nationId,officeId,scopeId);if(!p)return 0;
  const s=personSkills47(p),w=OFFICE_DEFS47[officeId].w;
  const score=f(f(f(f(w[1]*s.military)+f(w[0]*s.administrative))+f(w[2]*s.diplomatic))+f(s.charisma*w[3]));
  return clamp(f(f(score-50)/50),-1,1);
}
/** GetCentralIncomeMultiplier: 1 + clamp(Chancellor×6% + Steward×8%, ±12%). */
export function centralIncome47(r:OfficeRun47,nationId:string){
  const id=stateIdOf(r,nationId),c=f(officeSuitability47(r,nationId,'Chancellor',id)*OFFICE_DEFS47.Chancellor.economic),s=f(officeSuitability47(r,nationId,'Steward',id)*OFFICE_DEFS47.Steward.economic);
  return f(clamp(f(s+c),-.12,.12)+1);
}
/** GetLocalIncomeMultiplier without districts: 1 + clamp(Governor×8%, ±12%). */
export function localIncome47(r:OfficeRun47,provinceId:string){
  const index=r.world.provinces.findIndex(p=>p.id===provinceId),p=r.world.provinces[index];if(!p)return 1;
  const g=f(f(officeSuitability47(r,p.controller,'Governor',index+1)*OFFICE_DEFS47.Governor.economic)+1);
  return f(clamp(f(g-1),-.12,.12)+1);
}
/** GetLocalRebellionChanceMultiplier without districts: 1 − Governor×15%. */
export function localRebellion47(r:OfficeRun47,provinceId:string){
  const index=r.world.provinces.findIndex(p=>p.id===provinceId),p=r.world.provinces[index];if(!p)return 1;
  return f(1-f(officeSuitability47(r,p.controller,'Governor',index+1)*OFFICE_DEFS47.Governor.rebellion));
}
/** GetMilitaryLeader (no wartime commander on the web): the Marshal, then the live state leader; skill 50 without either. */
export function militaryLeaderSkill47(r:OfficeRun47,nationId:string):number|null{
  const marshal=officeHolder47(r,nationId,'Marshal',stateIdOf(r,nationId));
  return marshal?personSkills47(marshal).military:null;
}

/** CanAppointHolderForValidSlot: alive in the state, aged 18–75, not leading
 * another state, one central office only, no central+local mix, at most two local offices. */
function canHold(ctx:Ctx,p:FamilyPerson47,officeId:Office47Id,scopeId:number){
  const {r,stateId}=ctx;
  if(!validHolder(p,stateId)||p.age<18||p.age>75)return false;
  if(p.roles.some(v=>v.nativeKind==='leader'&&(v as {stateId?:number}).stateId!==undefined&&(v as {stateId:number}).stateId>0&&(v as {stateId:number}).stateId!==stateId))return false;
  let central=false,local=0;
  for(const a of book(r,ctx.nationId).assignments){if(a.holderId!==p.id||a.officeId===officeId&&a.scopeId===scopeId)continue;if(OFFICE_DEFS47[a.officeId].category===0)central=true;else local++;}
  const category=OFFICE_DEFS47[officeId].category;
  if(category===0&&central)return false;
  if(category===0&&local>0||category===1&&central)return false;
  if(category===1&&local>=2)return false;
  return true;
}
const nobleFamily=(r:OfficeRun47,p:FamilyPerson47):[string,NobleFamily47]|null=>{const fam=p.familyId>0?r.nobility?.families[String(p.familyId)]:undefined;return fam?[String(p.familyId),fam]:null;};
/** GetFamilyAdjustment. */
function familyAdjustment(ctx:Ctx,family:[string,NobleFamily47]|null,officeId:Office47Id,scopeId:number){
  if(!family)return 0;const {r}=ctx,[id,fam]=family;
  let v=clamp(f(fam.influence/100),0,10);
  if(ctx.rulingFamily){
    if(ctx.rulingFamily===id)v=f(v+8);
    else{let rel=ctx.relationCache.get(id);if(rel===undefined){rel=clamp(f(familyRelation47(r,id,ctx.rulingFamily)/10),-10,10);ctx.relationCache.set(id,rel);}v=f(rel+v);}
  }
  if(officeId==='Governor'){
    const p=provinceAt(r,scopeId);
    if(p){if(fam.controlledProvinces.includes(p.id))v=f(v+15);if(fam.homeProvinceId===p.id||fam.originalHomeProvinceId===p.id)v=f(v+8);}
  }
  if(officeId==='Marshal')v=f(v+clamp(f(familyWarMerit47(fam)/25),0,12));
  let held=0;for(const a of book(r,ctx.nationId).assignments){const h=r.kin.persons[a.holderId];if(h&&h.familyId>0&&String(h.familyId)===id)held++;}
  if(held>1){const polity=r.civilization.nations[ctx.nationId]?.polity;v=f(v-f((held-1)*(polity==='Federation'||polity==='Republic'?10:6)));}
  return v;
}
/** GetWorkloadAdjustment: −12 per other office, −6 per other governorship. */
function workload(ctx:Ctx,p:FamilyPerson47,officeId:Office47Id,scopeId:number){
  let n=0,gov=0;for(const a of book(ctx.r,ctx.nationId).assignments){if(a.holderId!==p.id||a.officeId===officeId&&a.scopeId===scopeId)continue;n++;if(a.officeId==='Governor')gov++;}
  return f(f(n*-12)-f(gov*6));
}
/** GetTraitAdjustment. */
function traitAdjustment(p:FamilyPerson47,officeId:Office47Id){
  const admin=officeId!=='Marshal',military=officeId==='Marshal',t=new Set(p.traits??[]);
  let v=t.has('Incompetent')?-15:0;
  if(t.has('Administrator')&&admin)v=f(v+8);
  if(t.has('Strategist')&&military)v=f(v+10);
  if(t.has('BattleHardened')&&military)v=f(v+6);
  if(t.has('Craven')&&military)v=f(v-10);
  if(t.has('Ambitious'))v=f(v-3);
  return v;
}
/** Age factor inside TryComputeScoreComponents. */
function ageFactor(age:number){
  if(age<18||age>75)return 0;
  if(age<25)return f(f(clamp(f(f(age-18)/7),0,1)*f(.3))+f(.7));
  if(age<=55)return 1;
  return f(f(clamp(f(f(age-55)/20),0,1)*f(-.35))+1);
}
/** TryComputeScoreComponents → total score. */
export function officeScore47(ctx:Ctx,p:FamilyPerson47,officeId:Office47Id,scopeId:number){
  const {r}=ctx,s=personSkills47(p),w=OFFICE_DEFS47[officeId].w;
  const suit=f(f(f(f(w[1]*s.military)+f(w[0]*s.administrative))+f(w[2]*s.diplomatic))+f(s.charisma*w[3]));
  const competence=f(suit*ageFactor(p.age));
  const family=nobleFamily(r,p),kin=p.familyId>0?r.kin.families[String(p.familyId)]:undefined;
  const culture=p.cultureName||kin?.cultureName||'',religion=p.religionId||family?.[1].religionId||'';
  const nation=r.civilization.nations[ctx.nationId];
  let cr=0;if(nation?.cultureId&&nation.cultureId===culture)cr=8;
  if(nation?.religionId&&nation.religionId===religion)cr=f(cr+(nation.polity==='Theocracy'?15:5));
  const fam=familyAdjustment(ctx,family,officeId,scopeId);
  let gov=0;
  switch(nation?.polity){
    case 'Kingdom':if(family)gov=clamp(f(family[1].influence/200),0,5);break;
    case 'Empire':if(s.administrative>=65)gov=5;break;
    case 'Federation':if(family&&!family[1].ruling)gov=4;break;
    case 'Republic':if(officeId!=='Marshal'){if(s.administrative>=65)gov=4;}else if(family)gov=clamp(f(familyWarMerit47(family[1])/40),0,8);break;
    case 'Tribal':gov=f(f(f(s.military+s.charisma)-100)*f(.08));break;
    case 'Theocracy':if(s.charisma>=65)gov=5;break;
  }
  const load=workload(ctx,p,officeId,scopeId),traits=traitAdjustment(p,officeId),gender=p.gender===1?-30:0;
  const g=ctx.governance,weight=f(f(g*f(.6))+f(.4)),famEff=fam>0?f(f(f(f(1-g)*f(1.5))+1)*fam):fam;
  let noise=0;
  if(g<1){const h=fnv(fnv(fnvStart(ctx.stateId),ctx.leaderId),p.id);noise=f(f(f(f(h%1000)/999)*30)*f(1-g));}
  return f(f(f(f(f(f(f(f(weight*competence)+cr)+famEff)+gov)+load)+traits)+noise)+gender);
}
type Candidate={p:FamilyPerson47;score:number};
function candidates(ctx:Ctx,officeId:Office47Id,scopeId:number,exclude=-1):Candidate[]{
  const list:Candidate[]=[];
  for(const p of Object.values(ctx.r.kin.persons))if(p.id!==exclude&&p.stateId===ctx.stateId&&canHold(ctx,p,officeId,scopeId))list.push({p,score:officeScore47(ctx,p,officeId,scopeId)});
  return list.sort((a,b)=>b.score-a.score||a.p.id-b.p.id);
}
/** SelectFromTopCandidates: top 3, weighted max(1, score − min + 2) with a System.Random seeded by FNV(state, scope, year, office). */
function select(ctx:Ctx,list:Candidate[],officeId:Office47Id,scopeKind:0|1,scopeId:number){
  const top=list.slice(0,3);if(top.length===1)return top[0];
  let h=fnv(fnv(fnv(fnv(fnvStart(ctx.stateId),scopeKind),scopeId),0),ctx.r.life.currentDate.year);
  for(let i=0;i<officeId.length;i++)h=fnv(h,officeId.charCodeAt(i));
  const random=new DotNetRandom(h|0),min=Math.min(...top.map(c=>c.score));
  const weights=top.map(c=>Math.max(1,f(c.score-min)+2));let total=0;for(const w of weights)total+=w;
  let roll=random.nextDouble()*total;
  for(let i=0;i<top.length;i++){roll-=weights[i];if(!(0<roll))return top[i];}
  return top[0];
}
function appoint(ctx:Ctx,officeId:Office47Id,scopeKind:0|1,scopeId:number,holderId:number){
  const list=book(ctx.r,ctx.nationId).assignments,a=list.find(v=>v.officeId===officeId&&v.scopeId===scopeId);
  const value:Office47Assignment={officeId,holderId,scopeKind,scopeId,startTime:ctx.r.life.gameTime,source:0};
  if(a)Object.assign(a,value);else list.push(value);ctx.r.offices47!.revision++;
}
function tryFill(ctx:Ctx,officeId:Office47Id,scopeKind:0|1,scopeId:number){
  const list=candidates(ctx,officeId,scopeId);if(!list.length)return false;
  const chosen=select(ctx,list,officeId,scopeKind,scopeId);if(!chosen)return false;
  appoint(ctx,officeId,scopeKind,scopeId,chosen.p.id);return true;
}
/** ReconcileState: drop assignments whose holder or scope is no longer valid. */
function reconcile(r:OfficeRun47,nationId:string){
  const b=book(r,nationId),stateId=stateIdOf(r,nationId),before=b.assignments.length;
  b.assignments=b.assignments.filter(a=>validHolder(r.kin.persons[a.holderId],stateId)&&(a.scopeKind===0?a.scopeId===stateId:ownsProvince(r,nationId,a.scopeId)));
  if(b.assignments.length!==before)r.offices47!.revision++;
}
const monthsSince=(r:OfficeRun47,time:number)=>nativeGetMonthSince(time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));

/** The office step of State.AdvanceOneMonth: ProcessMonthlyAppointments, then
 * ReviewAnnualAppointments in the state's review month ((state id mod 12) + 1). */
export function stateOfficeMonth47(input:NobilityRun47,nationId:string){
  const r=input as OfficeRun47;if(!r.offices47||!r.people.nations[nationId]||!r.world.provinces.some(p=>p.controller===nationId))return;
  processMonthly(r,nationId);
  const stateId=stateIdOf(r,nationId);
  if(r.life.currentDate.month===stateId%12+1)reviewAnnual(r,nationId);
}
function processMonthly(r:OfficeRun47,nationId:string){
  reconcile(r,nationId);
  const b=book(r,nationId);let ctx=context(r,nationId);
  // Holders who can no longer hold their office are dismissed ('ineligible'), then their slots are refilled first.
  const ineligible=b.assignments.filter(a=>!canHold(ctx,r.kin.persons[a.holderId],a.officeId,a.scopeId));
  if(ineligible.length){b.assignments=b.assignments.filter(a=>!ineligible.includes(a));r.offices47!.revision++;ctx=context(r,nationId);}
  let count=0;
  for(const a of ineligible){if(count>=MAX_APPOINTMENTS_PER_MONTH)return;if(tryFill(ctx,a.officeId,a.scopeKind,a.scopeId))count++;}
  for(const office of CENTRAL){
    if(count>=MAX_APPOINTMENTS_PER_MONTH)return;
    if(!b.assignments.some(a=>a.officeId===office&&a.scopeId===ctx.stateId)&&tryFill(ctx,office,0,ctx.stateId))count++;
  }
  // Provinces in id order (land provinces of this state).
  for(let i=0;i<r.world.provinces.length;i++){
    if(count>=MAX_APPOINTMENTS_PER_MONTH)return;
    if(r.world.provinces[i].controller!==nationId)continue;
    if(!b.assignments.some(a=>a.officeId==='Governor'&&a.scopeId===i+1)&&tryFill(ctx,'Governor',1,i+1))count++;
  }
}
function reviewAnnual(r:OfficeRun47,nationId:string){
  const b=book(r,nationId),year=r.life.currentDate.year;
  if(b.reviewYear===year)return;b.reviewYear=year;
  reconcile(r,nationId);
  const ctx=context(r,nationId),threshold=REPLACEMENT[r.civilization.nations[nationId]?.polity??'']??15;
  const list=[...b.assignments].sort((a,c)=>a.scopeKind-c.scopeKind||a.scopeId-c.scopeId);
  let replaced=0;
  for(const a of list){
    if(replaced>=MAX_ANNUAL_REPLACEMENTS)break;
    if(monthsSince(r,a.startTime)<MIN_TENURE_MONTHS)continue;
    const holder=r.kin.persons[a.holderId];if(!holder)continue;
    const current=officeScore47(ctx,holder,a.officeId,a.scopeId);
    const best=candidates(ctx,a.officeId,a.scopeId,holder.id)[0];
    if(!best||threshold+current>best.score)continue;
    appoint(ctx,a.officeId,a.scopeKind,a.scopeId,best.p.id);replaced++;
  }
}

/** The fiscal multipliers: original offices when this world runs them, the
 * older court records otherwise (worlds created before offices keep their rules). */
export function courtIncome47(r:{people:Parameters<typeof courtIncome>[0];world:Parameters<typeof courtIncome>[1]},nationId:string,provinceId?:string){
  const base=courtIncome(r.people,r.world,nationId,provinceId),o=r as unknown as OfficeRun47;
  if(!o.offices47)return base;
  return {tax:base.tax,central:centralIncome47(o,nationId),local:provinceId?localIncome47(o,provinceId):1};
}
