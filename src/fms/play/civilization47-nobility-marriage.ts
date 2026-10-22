import {personNameFromParts47} from './civilization47-names';
import {culture47} from './civilization47-catalog';
import {nativeCharacterSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import {recordHistory,type HistoricalKind} from './chronicle-records';
import type {FamilyPerson47,Family47} from './civilization47-population-types';
import type {NobilityRun47,Nobility47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** Original FamilyManager.ProcessSingleFamilyMarriage 868E80: every unmarried
 * adult (Family.GetUnmarriedAdults 84AE10, 18–45) takes the best of the ten
 * best-scored living candidates (FindMarriageCandidates 860980,
 * CalculateMarriageScore 855F30) and marries (ExecuteMarriage 85FDB0):
 * matrilineal when the bride is head/heir or the line has no son
 * (NeedsMatrilinealMarriage 865810) and the groom may marry in (CanMarryInto
 * 8573F0); the spouse who moves joins the other family.
 * Web adaptations, kept explicit: a spouse moving family also takes that
 * family's state; a person already married earlier in the same pass, a family
 * head or a sitting ruler is never moved (the next candidate is taken); a
 * surname outside the mover's culture keeps the birth surname. */
const charisma=(p:FamilyPerson47)=>nativeCharacterSkills(p.base,combatTraits47(p.traits)).charisma;
const alive=(r:NobilityRun47,id:number)=>{const p=r.kin.persons[id];return !!p&&p.isAlive;};
const unmarried=(r:NobilityRun47,p:FamilyPerson47)=>p.spouseId===0||!alive(r,p.spouseId);
/** IsCloseRelative: parent, child or a shared father/mother. */
export function closeRelative47(a:FamilyPerson47,b:FamilyPerson47){
  return a.childrenIds.includes(b.id)||b.childrenIds.includes(a.id)||a.fatherId===b.id||a.motherId===b.id||b.fatherId===a.id||b.motherId===a.id||a.fatherId>0&&a.fatherId===b.fatherId||a.motherId>0&&a.motherId===b.motherId;
}
/** CalculateMarriageScore: family standing + compatibility × 50. */
export function marriageScore47(r:NobilityRun47,n:Nobility47,a:FamilyPerson47,b:FamilyPerson47){
  const fa=r.kin.families[a.familyId],fb=r.kin.families[b.familyId];if(!fa||!fb)return 0;
  const influence=n.families[String(fb.id)]?.influence??50;
  let v=f(f(f(fa.stateId===fb.stateId?.8:.2)*50)+f(f(influence/10)+0));
  if(a.stateId!==b.stateId)v=f(v+20);
  let c=f(f(f(1-f(Math.abs(f(charisma(a)-charisma(b)))/100))*f(.3))+f(.5));
  c=f(c+f(a.cultureName===b.cultureName?.4:.1));
  if(a.religionId===b.religionId)c=f(c+f(.3));
  c=0>c?0:c>1?1:c;
  return f(f(c*50)+v);
}
const head=(k:Family47|undefined,p:FamilyPerson47)=>!!k&&(k.headId===p.id||k.heirId===p.id);
/** NeedsMatrilinealMarriage. */
function needsMatrilineal(r:NobilityRun47,n:Nobility47,p:FamilyPerson47,k:Family47|undefined){
  if(p.gender!==1||!k)return false;if(head(k,p))return true;
  if(!k.allowFemaleInheritance)return false;
  const patriarch=r.kin.persons[k.headId];if(!patriarch)return false;
  return !patriarch.childrenIds.some(id=>alive(r,id)&&r.kin.persons[id].gender===0);
}
/** CanMarryInto: a man who is neither head, heir nor the head's eldest living son. */
function canMarryInto(r:NobilityRun47,p:FamilyPerson47,k:Family47|undefined){
  if(p.gender!==0)return false;if(!k)return true;if(head(k,p))return false;
  const patriarch=r.kin.persons[k.headId];if(!patriarch)return true;
  let eldest:FamilyPerson47|null=null;
  for(const id of patriarch.childrenIds){const c=r.kin.persons[id];if(!c?.isAlive||c.gender!==0)continue;if(!eldest||c.age>eldest.age)eldest=c;}
  return !eldest||eldest.id!==p.id;
}
export function processMarriages47(r:NobilityRun47,n:Nobility47,id:string){
  const k=r.kin.families[id];
  const adults=k.memberIds.map(m=>r.kin.persons[m]).filter((p):p is FamilyPerson47=>!!p&&p.isAlive&&p.familyId===k.id&&p.age>=18&&p.age<=45&&unmarried(r,p));
  let married=0;
  for(const p of adults){
    if(!unmarried(r,p)||!p.isAlive)continue;
    if(p.spouseId&&!alive(r,p.spouseId))p.spouseId=0;
    const self=r.kin.families[p.familyId],isHead=self?.headId===p.id;
    const candidates=Object.values(r.kin.persons).filter(c=>c.isAlive&&c.gender!==p.gender&&c.age>=18&&c.age<=45&&unmarried(r,c)&&c.id!==p.id&&!closeRelative47(p,c)&&(!isHead||r.kin.families[c.familyId]?.headId!==c.id))
      .map((c,i)=>({c,i,s:marriageScore47(r,n,p,c)})).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,10);
    for(const {c} of candidates){if(executeMarriage(r,n,p,c)){married++;break;}}
  }
  return married;
}
/** ExecuteMarriage; false when the web cannot move the spouse (see above). */
function executeMarriage(r:NobilityRun47,n:Nobility47,a:FamilyPerson47,b:FamilyPerson47){
  const fa=r.kin.families[a.familyId],fb=r.kin.families[b.familyId];
  let matrilineal=false;
  if(needsMatrilineal(r,n,a,fa))matrilineal=b.gender===0&&canMarryInto(r,b,fb);
  else if(needsMatrilineal(r,n,b,fb))matrilineal=a.gender===0&&canMarryInto(r,a,fa);
  const mover=matrilineal?(a.gender===0?a:b):(a.gender===1?a:b),stay=mover===a?b:a;
  const from=r.kin.families[mover.familyId],to=r.kin.families[stay.familyId];
  const moves=!!from&&!!to&&from.id!==to.id;
  if(moves&&(from.headId===mover.id||r.people.persons[mover.id]?.alive))return false;
  if(a.spouseId&&alive(r,a.spouseId)||b.spouseId&&alive(r,b.spouseId))return false;
  a.spouseId=b.id;b.spouseId=a.id;a.marriageType=b.marriageType=matrilineal?1:0;
  const birthFamily=r.kin.families[String(mover.originalFamilyId||mover.familyId)];
  if(moves){
    from.memberIds=from.memberIds.filter(v=>v!==mover.id);from.collateralMemberIds=from.collateralMemberIds.filter(v=>v!==mover.id);if(from.heirId===mover.id)from.heirId=0;
    if(!mover.originalFamilyId)mover.originalFamilyId=from.id;
    mover.familyId=to.id;mover.stateId=to.stateId;to.memberIds.push(mover.id);
    // lastName = the new family's surname, when the mover's culture can carry it.
    const cultureId=culture47(mover.cultureName!).id;
    if(culture47(cultureId).houses.includes(to.surname)){mover.lastName=to.surname;mover.identity=personNameFromParts47(cultureId,mover.firstName!,to.surname,mover.gender as 0|1);}
  }
  n.marriages.push({aId:a.id,bId:b.id,moverId:moves?mover.id:0,fromFamilyId:moves?from.id:0,toFamilyId:moves?to.id:0,matrilineal,day:r.world.day});
  r.kin.revision++;
  // Recorded when a ruling family, a head/heir, a family above 300 influence, two states or a matrilineal match is involved.
  const nfa=n.families[String(fa?.id)],nfb=n.families[String(fb?.id)];
  const notable=!!(nfa?.ruling||nfb?.ruling)||head(fa,a)||head(fb,b)||(nfa?.influence??0)>300||(nfb?.influence??0)>300||fa?.stateId!==fb?.stateId||matrilineal;
  if(notable&&fa&&fb){
    const sa=mover===a?birthFamily?.surname??fa.surname:fa.surname,sb=mover===b?birthFamily?.surname??fb.surname:fb.surname;
    recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,`${sa}家族的${a.identity.name}与${sb}家族的${b.identity.name}结婚（${matrilineal?'从妻居':'从夫居'}）`,'原作家族婚姻：按家族声望、同国、魅力、文化与宗教择偶。',[...new Set([fa.nationId,fb.nationId])],null);
  }
  return true;
}
