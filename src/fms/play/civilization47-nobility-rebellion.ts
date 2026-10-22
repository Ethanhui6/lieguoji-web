import type {FoundingRun47} from './civilization47-founding';
import {foundState47} from './civilization47-founding';
import type {NobilityRun47,Nobility47} from './civilization47-nobility';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import {familyRelation47} from './civilization47-nobility-relations';
import {moveFamily47} from './civilization47-nobility-fate';
import {setRulingFamily47,rulingFamilyId47} from './civilization47-nobility-succession';
import {nativeRebellionResistance} from './native-war/vassal-rebellion';
import {nativeCharacterSkills} from './native-economy/character-income';
import {nativeGetMonthSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {combatTraits47} from './civilization47-combat-state';
import traits from './native-economy/character-traits.json';
import {announce} from './civilization47-history';
import {transferRebelArmies47,startInternalWar47} from './civilization47-rebellion';
import type {FamilyPerson47} from './civilization47-population-types';
import {f} from './native-economy/numeric';

/** Original family rebellion (FamilyManager.CheckFamilyRebellions 857F50 in
 * months 6 and 12, ShouldFamilyRebel 86B570, StartFamilyRebellion 86D910,
 * RallyFamiliesForRebellion 869220 with CalculateRallyResponseProbability
 * 856590, TransferFamilyArmiesToRebelState 86FB30; the mother state wages a
 * WarType 4 / CB 15 war on the rebels). Restoration of a fallen state the
 * family once ruled (TryFamilyRestoration) is decided here too, but the web
 * founds a new state for it (recorded as a restoration attempt in the text).
 * Web adaptation: families with a ruler's court record do not join. */
type Run=NobilityRun47&FoundingRun47;
export const NEVER_FAMILY_REBELLION47=-10000;
const POLITIES=['Kingdom','Empire','Federation','Republic','Tribal','Theocracy'];
const monthsSince=(r:Run,time:number)=>nativeGetMonthSince(time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
const alive=(r:Run,id:string)=>r.world.provinces.some(p=>p.controller===id);
const hasCourt=(r:Run,id:string)=>{const k=r.kin.families[id];return [...k.memberIds,...k.collateralMemberIds].some(p=>Object.hasOwn(r.people.persons,String(p)));};
const skills=(p:FamilyPerson47)=>nativeCharacterSkills(p.base,combatTraits47(p.traits));

/** ShouldFamilyRebel. */
export function shouldFamilyRebel47(r:Run,id:string){
  const n=r.nobility!,fam=n.families[id];
  if(!fam||fam.ruling||!fam.controlledProvinces.length||200>fam.influence||!alive(r,fam.nationId))return false;
  const state=fam.nationId,d=r.destiny.nations[state];
  let min=n.settings.familyRebelMinMonths;if(d?.manifest&&d.manifestCount>0)min*=4;
  if(min>monthsSince(r,n.lastFamilyRebellion[state]??NEVER_FAMILY_REBELLION47))return false;
  const ruling=String(rulingFamilyId47(r,state));if(!n.families[ruling])return false;
  const rel=familyRelation47(r,id,ruling);if(rel>-50)return false;
  let chance=f(f(f(f(Math.abs(rel)/100)*f(.1))+f(f(f(100-(d?.destiny??0))/100)*f(.1)))+f(.05));
  const p=POLITIES.indexOf(r.civilization.nations[state].polity);
  if(p===2||p===3)chance=f(chance*f(.5));else if(p===4)chance=f(chance*f(1.5));
  const leaderId=r.people.nations[state].leaderId,leader=leaderId==null?null:r.kin.persons[leaderId];
  if(leader?.isAlive)chance=f(chance*f(1-nativeRebellionResistance((leader.traits??[]).map(t=>{const v=traits.traits.find(x=>x.name===t);if(!v)throw Error('人物特性缺失。');return v;}))));
  return chance>nobilityRandom47(n).value();
}
/** CalculateRallyResponseProbability (no restoration in the web founding). */
export function rallyProbability47(r:Run,rebel:string,target:string){
  const n=r.nobility!,a=n.families[rebel],b=n.families[target],ka=r.kin.families[rebel],kb=r.kin.families[target];
  let base=f(.2);const here=b.stateResidenceMonths[b.nationId]??0;
  if(12>here)base=f(base+f(.3));else if(60>here)base=f(base+f(.1));else if(here>=240)base=f(base-f(.2));
  let p=f(f(familyRelation47(r,rebel,target)/200)+base);
  if(ka.cultureName===kb.cultureName)p=f(p+f(.15));
  if(a.religionId&&a.religionId===b.religionId)p=f(p+f(.1));
  p=f(p+f(f(f(a.influence-b.influence)/1000)*f(.1)));
  const ruling=String(rulingFamilyId47(r,b.nationId));
  if(n.families[ruling]&&ruling!==target){const rel=familyRelation47(r,target,ruling);if(-50>rel)p=f(p+f(.2));else if(rel>50)p=f(p-f(.2));}
  if(b.rallyCooldown>0)return 0;
  return 0>p?0:p>1?1:p;
}
function changeRelation(n:Nobility47,a:string,b:string,d:number){const row=n.relations[a]??(n.relations[a]={});row[b]=Math.max(-100,Math.min(100,f((row[b]??0)+d)));}
/** RallyFamiliesForRebellion. */
function rally(r:Run,rebel:string){
  const n=r.nobility!,state=n.families[rebel].nationId,random=nobilityRandom47(n),joined:string[]=[];
  for(const id of Object.keys(n.families).filter(v=>n.families[v].nationId===state&&v!==rebel&&!n.families[v].ruling)){
    const p=rallyProbability47(r,rebel,id);
    if(p>random.value()){joined.push(id);n.families[id].rallyCooldown=24;changeRelation(n,rebel,id,20);changeRelation(n,id,rebel,20);}
    else {changeRelation(n,rebel,id,-5);changeRelation(n,id,rebel,-5);}
  }
  return joined.filter(id=>!hasCourt(r,id));
}
/** Leader: the living patriarch, else a living member 16–60, men first, then
 * charisma+military+administrative, then age closest to 35. */
function rebelLeader(r:Run,id:string){
  const k=r.kin.families[id],head=r.kin.persons[k.headId];
  if(head?.isAlive)return head;
  return k.memberIds.map(v=>r.kin.persons[v]).filter(p=>!!p&&p.isAlive&&p.familyId===k.id&&p.age>=16&&p.age<=60).map((p,i)=>({p,i}))
    .sort((a,b)=>Number(b.p.gender===0)-Number(a.p.gender===0)||f(skills(b.p).charisma+skills(b.p).military+skills(b.p).administrative)-f(skills(a.p).charisma+skills(a.p).military+skills(a.p).administrative)||Math.abs(a.p.age-35)-Math.abs(b.p.age-35)||a.i-b.i)[0]?.p??null;
}
/** The shared tail of StartFamilyRebellion and StartCivilWar: a new state on
 * the members' land (home province first) ruled by the leading family, the
 * members move there, their armies change sides, and the mother state wages
 * the internal war. Returns the new state id or null. */
export function launchNobleRevolt47(r:Run,id:string,members:string[],reason:string,war:{cb:10|11|12|13|15;legacy:4|8|9|10|11;goal:7|8|9|10},before:()=>void=()=>{}):string|null{
  const n=r.nobility!,fam=n.families[id],mother=fam.nationId,leader=rebelLeader(r,id);if(!leader)return null;
  const provinces=[...new Set(members.flatMap(v=>n.families[v].controlledProvinces))].filter(p=>r.world.provinces.find(v=>v.id===p)?.controller===mother);
  if(!provinces.length||provinces.length>=r.world.provinces.filter(p=>p.controller===mother).length)return null;
  // The capital province (the home) leads the list.
  provinces.sort((a,b)=>Number(b===fam.homeProvinceId)-Number(a===fam.homeProvinceId));
  if(!r.world.cities.some(c=>c.provinceId===provinces[0]))return null;
  before();
  const keep=new Map(members.map(v=>[v,[...n.families[v].controlledProvinces]] as [string,string[]]));
  const founding=foundState47(r,mother,provinces,reason,{familyId:Number(id),leaderId:leader.id,moveFamilies:state=>{
    for(const v of members){moveFamily47(r,v,state);n.families[v].controlledProvinces=keep.get(v)!;}
    setRulingFamily47(r,state,Number(id));
  }});
  const rebel=founding.nationId;
  transferRebelArmies47(r,mother,rebel,new Set(provinces),new Set(members.map(Number)));
  startInternalWar47(r,rebel,mother,war.cb,war.legacy,war.goal);
  return rebel;
}
/** RallyFamiliesForRebellion, without families that hold a ruler's court record. */
export const rallyFamilies47=(r:Run,rebel:string)=>rally(r,rebel);
export const hasCourtRecord47=(r:Run,id:string)=>hasCourt(r,id);
/** StartFamilyRebellion; returns the new state id or null. */
export function startFamilyRebellion47(r:Run,id:string):string|null{
  const n=r.nobility!,fam=n.families[id],mother=fam?.nationId;
  if(!fam||!alive(r,mother)||hasCourt(r,id)||!r.foundings)return null;
  if(!rebelLeader(r,id))return null;
  const joined=rally(r,id),name=r.kin.families[id].surname;
  const rebel=launchNobleRevolt47(r,id,[id,...joined],`${name}家族起兵，以家族领地建立新的国家。`,{cb:15,legacy:4,goal:7},()=>{
    announce(r.chronicle,r.world,r.clock.tick,'uprising',`${name}家族叛乱`,`${name}家族对统治家族的关系降至冰点，联合${joined.length}个家族起兵。`,[mother],fam.homeProvinceId);
  });
  if(rebel)n.lastFamilyRebellion[mother]=r.life.gameTime;
  return rebel;
}
/** CheckFamilyRebellions. */
export function checkFamilyRebellions47(r:Run){
  const n=r.nobility;if(!n||!n.settings.allowFamilyRebellion)return;
  for(const id of Object.keys(n.families))if(n.families[id]&&shouldFamilyRebel47(r,id))startFamilyRebellion47(r,id);
}
