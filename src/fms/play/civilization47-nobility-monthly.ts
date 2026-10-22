import {culture47} from './civilization47-catalog';
import {personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {nativeRandomTraits,NATIVE_CHARACTER_POOL,type CharacterRandom} from './native-economy/character-generation';
import {nativeBirthTimeFromAge,nativeGetYearSince,nativeUpdateCharacterAge} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import type {FamilyPerson47,PersonRole47} from './civilization47-population-types';
import type {NativePastRole} from './native-economy/role-history';
import type {NobilityRun47,Nobility47,NobleFamily47} from './civilization47-nobility';
import {f} from './native-economy/numeric';
import {processBirths47} from './civilization47-nobility-births';
import {checkFamilyExtinction47} from './civilization47-nobility-succession';
import {processMarriages47} from './civilization47-nobility-marriage';

/** Original FamilyManager schedule (TimeManager.AdvanceOneDay):
 * month start AssignRandomUpdateDays 853C30 + MonthlyUpdate 865750, daily
 * UpdateFamilies 8710E0 (UpdateFamilyDuration 8712E0, UpdateSingleFamilyInfluence
 * 8732E0, MaintainCollateralBranches 865400), year start YearlyUpdate 873550
 * (UpdateFamilyHistoricalClaims 871BC0). CheckProvinceControlConflicts only
 * logs; the ledger validator already rejects a province held by two families. */
const monthKey=(r:NobilityRun47)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
export const nobilityMonth47=monthKey;
function value(n:Nobility47){if(!Number.isSafeInteger(n.random.draws+1))throw Error('家族随机记录已达精度上限。');n.random.state=(Math.imul(n.random.state,1664525)+1013904223)>>>0;n.random.draws++;return n.random.state/4294967296;}
/** Unity Random.Range: int max exclusive, float inclusive. */
export function nobilityRandom47(n:Nobility47):CharacterRandom{
  return {value:()=>f(value(n)),intRange:(min,max)=>max<=min?min:min+Math.floor(value(n)*(max-min)),floatRange:(min,max)=>f(min+f(value(n))*(max-min))};
}
/** A state that StateManager.Contains, not blank, conquerable: the web keeps
 * only real states, alive while they control a province. */
const stateAlive=(r:NobilityRun47,nationId:string)=>r.world.provinces.some(p=>p.controller===nationId);

export function advanceNobility47(r:NobilityRun47){
  const n=r.nobility;if(!n)return;
  // Province.ConqueredBy / TryRebel: land that left the family's state leaves the family
  // (controllingFamilyId = 0); the landless-family fate comes with war spoils (F4).
  const controller=new Map(r.world.provinces.map(p=>[p.id,p.controller]));
  for(const fam of Object.values(n.families))fam.controlledProvinces=fam.controlledProvinces.filter(p=>controller.get(p)===fam.nationId);
  const month=monthKey(r);
  if(month!==n.month){
    if(month!==n.month+1)throw Error('家族月份不连续。');n.month=month;
    // AssignRandomUpdateDays: Random.Range(1, 29) for families of living states.
    n.monthFamilies=[];const random=nobilityRandom47(n);
    for(const [id,fam] of Object.entries(n.families)){if(!stateAlive(r,fam.nationId))continue;fam.updateDay=random.intRange(1,29);n.monthFamilies.push(id);}
    // MonthlyUpdate: CheckFamilyRebellions (months 6/12) and CheckCivilWarConditions (12) come with F5/F6.
  }
  const day=r.life.currentDate.day;
  for(const id of n.monthFamilies){
    const fam=n.families[id];if(!fam||fam.updateDay!==day||!r.kin.families[id])continue;
    updateFamilyDuration(r,fam);
    // ProcessSingleFamilyPopulation: births while the state stands (extinction: F3c).
    if(stateAlive(r,fam.nationId)){processBirths47(r,n,id);if(checkFamilyExtinction47(r,n,id))continue;}
    // ProcessSingleFamilyMarriage.
    if(stateAlive(r,fam.nationId))processMarriages47(r,n,id);
    updateInfluence(r,id,fam);maintainCollateral(r,n,id);
  }
  if(r.life.currentDate.month===1&&day===1&&n.year!==r.life.currentDate.year){n.year=r.life.currentDate.year;for(const fam of Object.values(n.families))updateClaims(fam);}
}
/** UpdateFamilyDuration: residence months, ruling months and time, +0.5 claim on held provinces. */
function updateFamilyDuration(r:NobilityRun47,fam:NobleFamily47){
  const state=fam.nationId;if(!stateAlive(r,state))return;
  fam.stateResidenceMonths[state]=f((fam.stateResidenceMonths[state]??0)+1);
  if(!fam.ruling)return;
  fam.rulingDuration[state]=f((fam.rulingDuration[state]??0)+1);
  if(!fam.historicalStateIds.includes(state))fam.historicalStateIds.push(state);
  fam.lastRulingTime[state]=r.life.gameTime;
  for(const p of fam.controlledProvinces)fam.historicalClaims[p]=f((fam.historicalClaims[p]??0)+f(.5));
}
/** UpdateSingleFamilyInfluence: provinces×20 + 10 + members×5 + collateral×2
 * (+100 ruling) + ln(max(1,wealth))×10 + living patriarch trait modifiers, 0–1000. */
function updateInfluence(r:NobilityRun47,id:string,fam:NobleFamily47){
  const k=r.kin.families[id];
  // Float sum order: collateral×2 + (provinces×20 + 10 + members×5).
  let v=f(f(k.collateralMemberIds.length*2)+f(f(f(fam.controlledProvinces.length*20)+10)+f(k.memberIds.length*5)));
  if(fam.ruling)v=f(v+100);
  v=f(v+f(f(Math.log(f(Math.max(1,fam.wealth))))*10));
  const head=r.kin.persons[k.headId];
  if(k.headId>0&&head?.isAlive)for(const name of head.traits??[]){const t=NATIVE_CHARACTER_POOL.find(t=>t.name===name) as {familyInfluenceModifier?:number}|undefined;const m=f(t?.familyInfluenceModifier??0);if(m!==0)v=f(v+m);}
  fam.influence=0>v?0:v>1000?1000:v;
}
/** MaintainCollateralBranches: drop missing/dead collateral, keep at least 1
 * (CreateCollateralMember) and at most 4 (the newest are removed). */
function maintainCollateral(r:NobilityRun47,n:Nobility47,id:string){
  const k=r.kin.families[id];
  for(const pid of [...k.collateralMemberIds]){const p=r.kin.persons[pid];if(p&&p.isAlive)continue;k.collateralMemberIds.splice(k.collateralMemberIds.indexOf(pid),1);if(p)n.detached.push(pid);}
  while(k.collateralMemberIds.length<1)createCollateralMember(r,n,id);
  // Removal from the character manager: only when nothing else refers to the person.
  while(k.collateralMemberIds.length>4){
    const pid=k.collateralMemberIds[k.collateralMemberIds.length-1],p=r.kin.persons[pid];
    if(p.spouseId||p.childrenIds.length||p.fatherId||p.motherId||r.people.persons[pid])break;
    k.collateralMemberIds.pop();delete r.kin.persons[pid];delete r.life.persons[pid];n.collaterals=n.collaterals.filter(c=>c.personId!==pid);
  }
  r.kin.revision++;
}
/** CreateCollateralMember: gender by Random.value ≤ .5 (female), culture name,
 * the family surname, age Random.Range(20f,40f), base skills Random.Range(20f,80f). */
function createCollateralMember(r:NobilityRun47,n:Nobility47,id:string){
  const k=r.kin.families[id],random=nobilityRandom47(n),gender=random.value()<=f(.5)?1:0,profile=culture47(k.cultureName);
  const pool=gender===0?profile.givenMale:profile.givenFemale,first=pool[random.intRange(0,pool.length)],generatedLast=profile.houses[random.intRange(0,profile.houses.length)];
  const last=k.surname||generatedLast,life=r.life,registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()};
  const identity=personNameFromParts47(profile.id,first,last,gender as 0|1),religionId=r.civilization.nations[k.nationId].religionId;
  const p=nativeCreateNamedCharacter(first,last,gender,profile.id,{
    createBlank:()=>{if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');return nativeCreateBlankCharacter(registry,{construct:():FamilyPerson47=>({...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),source:'collateral',initialAge:null,religionId,identity}),gameTime:()=>life.gameTime});},random,
    selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name),
  });
  p.familyId=k.id;p.stateId=k.stateId;
  const age=random.floatRange(20,40);p.birthTime=f(nativeBirthTimeFromAge(age,life.gameTime,life.secondsPerDay));p.isAlive=true;
  const calendar=createNativeIsoCalendar(life.startDate);nativeUpdateCharacterAge(p,b=>nativeGetYearSince(b,r.kin.ageTime,life.secondsPerDay,calendar));
  p.base.charisma=random.floatRange(20,80);p.base.military=random.floatRange(20,80);p.base.diplomatic=random.floatRange(20,80);p.base.administrative=random.floatRange(20,80);
  r.kin.persons[p.id]=p;k.collateralMemberIds.push(p.id);
  life.persons[p.id]={source:'native-family',birthTime:p.birthTime,age:p.age,initialAge:null,updatedMonth:r.kin.lastAgeMonth};life.revision++;
  r.people.nextPersonId=registry.nextId;r.people.revision++;
  n.collaterals.push({personId:p.id,familyId:k.id,day:r.world.day});
}
/** UpdateFamilyHistoricalClaims: claims grow by 1 on held provinces and decay
 * by 1 elsewhere (kept while > 0); newly held provinces start at 1. */
function updateClaims(fam:NobleFamily47){
  const next:Record<string,number>={};
  for(const [p,v] of Object.entries(fam.historicalClaims)){const c=fam.controlledProvinces.includes(p)?f(v+1):f(v-1);if(c>0)next[p]=c;}
  for(const p of fam.controlledProvinces)if(!Object.hasOwn(fam.historicalClaims,p))next[p]=1;
  fam.historicalClaims=next;
}
