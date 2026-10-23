import {nativeFindSuccessor,nativeFamilyFallback} from './native-economy/family-succession';
import {nativeCharacterSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import {recordHistory,type HistoricalKind} from './chronicle-records';
import {familyStrength47,familyWarMerit47} from './civilization47-nobility-territory';
import type {FamilyPerson47,Family47,Population47} from './civilization47-population-types';
import type {NobilityRun47,Nobility47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** Ruling family and family succession of the original FamilyManager for
 * original-family worlds: StateManager.AppointLeader 506C10 makes the new
 * leader's family the ruling family (SetRulingFamily 86B290);
 * StateSuccessionUtility.HandleMonarchySuccession 88EB70 tries the ruling
 * family, then the best alternative family (SelectAlternativeFamily 88FF90,
 * CalculateFamilyEmergencyScore 88E820), then HandleDynastyChange 8633A0;
 * CheckFamilyExtinction 8577D0 retires a family without living members. */
export const rulingFamilyId47=(r:NobilityRun47,nationId:string)=>r.nobility?.rulingFamilies[nationId]??r.people.nations[nationId].id;
/** SetRulingFamily: exactly one ruling family per state. */
export function setRulingFamily47(r:Population47,nationId:string,familyId:number){
  const n=(r as NobilityRun47).nobility;if(!n||!n.families[String(familyId)])return;
  n.rulingFamilies[nationId]=familyId;
  for(const [id,fam] of Object.entries(n.families))if(fam.nationId===nationId)fam.ruling=id===String(familyId);
}
const living=(r:Population47,k:Pick<Family47,'id'|'memberIds'>)=>k.memberIds.map(id=>r.kin.persons[id]).filter((p):p is FamilyPerson47=>!!p&&p.isAlive&&p.familyId===k.id);
const skills=(p:FamilyPerson47)=>nativeCharacterSkills(p.base,combatTraits47(p.traits));
const fallback=(r:Population47,k:Family47)=>nativeFamilyFallback(k,{getCharacter:id=>r.kin.persons[id]??null,getLivingMembers:()=>living(r,k),charisma:p=>skills(p).charisma,administrative:p=>skills(p).administrative,military:p=>skills(p).military});
const familiesOf=(r:NobilityRun47,n:Nobility47,nationId:string)=>Object.keys(n.families).filter(id=>n.families[id].nationId===nationId&&r.kin.families[id]).map(id=>({id,k:r.kin.families[id],fam:n.families[id]}));
/** CalculateFamilyEmergencyScore: influence×0.8 + war merit×0.5 + living×10 + collateral×2. */
export function familyEmergencyScore47(r:NobilityRun47,id:string){
  const n=r.nobility!,k=r.kin.families[id],fam=n.families[id];
  return f(f(fam.influence*f(.8))+f(f(familyWarMerit47(fam)*f(.5))+f(f(living(r,k).length*10)+f(k.collateralMemberIds.length+k.collateralMemberIds.length))));
}
/** HandleMonarchySuccession without the appointment: the ruling family's
 * successor, else the best alternative family's fallback, else the dynasty
 * change pick (strongest family, its living head or eldest member). */
export function nobleMonarchySuccessor47(r:NobilityRun47,nationId:string,previous:FamilyPerson47):FamilyPerson47|null{
  const n=r.nobility!,family=r.kin.families[String(rulingFamilyId47(r,nationId))]??null,getCharacter=(id:number)=>r.kin.persons[id]??null;
  if(family){
    let candidate=previous.familyId===family.id?nativeFindSuccessor(family,previous,getCharacter,()=>null):null;
    if(candidate===null)candidate=fallback(r,family);
    if(candidate?.isAlive)return candidate;
  }
  const options=familiesOf(r,n,nationId).filter(v=>v.k!==family&&living(r,v.k).length>0);
  const alternative=options.map((v,i)=>({v,i,s:familyEmergencyScore47(r,v.id)})).sort((a,b)=>b.s-a.s||a.i-b.i)[0]?.v;
  if(alternative){const c=fallback(r,alternative.k);if(c?.isAlive)return c;}
  // HandleDynastyChange: families with living members by strength + war merit.
  const strongest=familiesOf(r,n,nationId).filter(v=>living(r,v.k).length>0).map((v,i)=>({v,i,s:f(familyStrength47(v.fam)+familyWarMerit47(v.fam))})).sort((a,b)=>b.s-a.s||a.i-b.i)[0]?.v;
  if(!strongest)return null;
  const head=r.kin.persons[strongest.k.headId];
  if(head?.isAlive)return head;
  return living(r,strongest.k).map((p,i)=>({p,i})).sort((a,b)=>b.p.age-a.p.age||a.i-b.i)[0]?.p??null;
}
/** Families of a state for the emergency elections (influence and war merit are real here). */
export function nobleFamiliesForElection47(r:NobilityRun47,nationId:string){
  const n=r.nobility!;return familiesOf(r,n,nationId).map(v=>({...v.k,influence:v.fam.influence,warMerit:familyWarMerit47(v.fam)}));
}
/** CheckFamilyExtinction: no living members left → FamilyExtinct, land freed, family retired. */
export function checkFamilyExtinction47(r:NobilityRun47,n:Nobility47,id:string){
  const k=r.kin.families[id],fam=n.families[id];if(!k||!fam||living(r,k).length>0)return false;
  let last:FamilyPerson47|null=null;
  for(const pid of [...new Set([...k.memberIds,...k.collateralMemberIds])]){const p=r.kin.persons[pid];if(!p||p.isAlive)continue;if(!last||p.deathTime>last.deathTime)last=p;}
  recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,`${k.surname}家族灭绝，最后成员${last?.identity.name??'未知'}去世`,'家族已无在世成员，领地失去家族控制。',[fam.nationId],null);
  delete n.families[id];n.extinct.push(Number(id));for(const c of Object.values(n.warContributions))delete c[id];n.monthFamilies=n.monthFamilies.filter(v=>v!==id);
  if(n.rulingFamilies[fam.nationId]===Number(id))n.rulingFamilies[fam.nationId]=0;
  return true;
}
