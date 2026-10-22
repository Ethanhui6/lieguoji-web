import type {FoundingRun47} from './civilization47-founding';
import type {NobilityRun47,CivilWar47} from './civilization47-nobility';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import {familyRelation47} from './civilization47-nobility-relations';
import {rulingFamilyId47} from './civilization47-nobility-succession';
import {launchNobleRevolt47,rallyFamilies47,hasCourtRecord47} from './civilization47-nobility-rebellion';
import {civilWarCb47,civilWarGoal47,isCivilWarCb47,type CivilWarType47} from './civil-war47-types';
import {nativeGetMonthSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {nationName47} from './civilization47-names';
import {announce} from './civilization47-history';
import type {War46Campaign} from './war46-wars';
import {f} from './native-economy/numeric';

/** Original civil war (FamilyManager.CheckCivilWarConditions every December,
 * CheckStateForCivilWar 859B50, DetermineCivilWarType 85E9C0,
 * DetermineCivilWarCause 85E5F0, StartCivilWar 86B850; the peace effects
 * ClaimThrone / ReformGovernment / OverthrowRuler V2 make the winner inherit
 * the loser's identity, CivilWarSettlementUtil.InheritIdentity). Restoration
 * of a fallen state (TryFamilyRestoration) is not ported: a new state is
 * founded. Web adaptation: families with a ruler's court record stay out. */
type Run=NobilityRun47&FoundingRun47;
export const NEVER_CIVIL_WAR47=-10000;
const monthsSince=(r:Run,time:number)=>nativeGetMonthSince(time,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
const land=(r:Run,id:string)=>r.world.provinces.filter(p=>p.controller===id).length;
const stateNumber=(r:Run,id:string)=>r.people.nations[id].id;
const top=(r:Run,ids:string[])=>ids.reduce((a,b)=>r.nobility!.families[b].influence>r.nobility!.families[a].influence?b:a);
const titles:Record<CivilWarType47,string>={8:'爆发继承权内战',9:'爆发改革战争',10:'爆发分离主义叛乱',11:'爆发推翻战争'};

/** WarCompatibilityServiceV2.IsInCivilWar: an open CB10–13 war of the state. */
export function inCivilWar47(r:Run,id:string){
  const s=stateNumber(r,id);
  return r.nativeWars.campaigns.some(c=>c.endedTick===null&&c.internal&&isCivilWarCb47(c.internal.casusBelliId as number)&&(c.internal.motherStateId===s||c.internal.rebelStateId===s));
}
/** CheckCivilWarConditions: living states with at least 15 provinces. */
export function checkCivilWars47(r:Run){
  const n=r.nobility;if(!n||!n.settings.allowCivilWar||!r.foundings)return;
  for(const v of r.world.nations.map(v=>v.id))if(land(r,v)>=15)checkStateForCivilWar47(r,v);
}
/** Discontented families: landed, not ruling, relation to the ruling family
 * below −40 and influence above 100. */
export function discontentedFamilies47(r:Run,state:string){
  const n=r.nobility!,ruling=String(rulingFamilyId47(r,state));if(!n.families[ruling])return null;
  return Object.keys(n.families).filter(v=>{const fam=n.families[v];return fam.nationId===state&&!fam.ruling&&fam.controlledProvinces.length>0&&-40>familyRelation47(r,v,ruling)&&fam.influence>100;});
}
/** CheckStateForCivilWar. */
export function checkStateForCivilWar47(r:Run,state:string){
  const n=r.nobility!,d=r.destiny.nations[state];if(!n.families[String(rulingFamilyId47(r,state))])return;
  let min=n.settings.civilWarMinMonths;if(d?.manifest&&d.manifestCount>0)min*=4;
  if(min>monthsSince(r,n.lastCivilWar[state]??NEVER_CIVIL_WAR47))return;
  const rebels=discontentedFamilies47(r,state)!,destiny=d?.destiny??0;
  if(rebels.length<2||!(60>destiny))return;
  const chance=f(f(f(60-destiny)*f(.01))+f(.1));
  if(chance>nobilityRandom47(n).value())startCivilWar47(r,state,rebels);
}
/** Vector2.Distance from the capital province centre (original map units). */
function distanceFromCapital(r:Run,state:string,province:string){
  const capital=r.world.cities.find(c=>c.id===r.world.nations.find(v=>v.id===state)!.capitalId),scale=(r as unknown as {scale:number}).scale;
  const a=r.world.provinces.find(p=>p.id===capital?.provinceId)?.center,b=r.world.provinces.find(p=>p.id===province)?.center;
  if(!a||!b)throw Error('内战距离缺少行省中心。');
  return f(Math.hypot(f(a.x/scale-b.x/scale),f(a.y/scale-b.y/scale)));
}
/** DetermineCivilWarType: the strongest rebel shares the ruling surname →
 * succession; every rebel province at least 10 from the capital and on
 * average above 15 → independence; two or more rebels while destiny < 60 →
 * reform if one differs in culture from the state, else overthrow. */
export function determineCivilWarType47(r:Run,state:string,rebels:string[]):CivilWarType47{
  const n=r.nobility!,ruling=String(rulingFamilyId47(r,state)),lead=top(r,rebels);
  if(n.families[ruling]&&r.kin.families[lead].surname===r.kin.families[ruling].surname)return 8;
  let far=true,total=0,count=0;
  outer:for(const v of rebels)for(const p of n.families[v].controlledProvinces){const d=distanceFromCapital(r,state,p);total=f(total+d);count++;if(10>d){far=false;break outer;}}
  if(far&&count>0&&f(total/count)>15)return 10;
  if(rebels.length>=2&&60>(r.destiny.nations[state]?.destiny??0)){const culture=r.civilization.nations[state].cultureId;return rebels.some(v=>r.kin.families[v].cultureName!==culture)?9:11;}
  return 11;
}
/** DetermineCivilWarCause, as the original history text. */
export function civilWarCause47(r:Run,state:string,rebels:string[],type:CivilWarType47){
  const n=r.nobility!,lead=top(r,rebels),name=r.kin.families[lead].surname,rulingId=String(rulingFamilyId47(r,state)),ruling=n.families[rulingId]?r.kin.families[rulingId].surname:null;
  const nation=r.civilization.nations[state];
  if(type===8){
    const leaderId=r.people.nations[state].leaderId,leader=leaderId==null?null:r.kin.persons[leaderId];
    if(leader&&!leader.childrenIds.length)return `${name}家族因统治者无嗣而发起继承战争`;
    return name===(ruling??r.world.nations.find(v=>v.id===state)!.name)?`${name}家族旁支对王位继承权提出异议`:`${name}家族质疑${ruling}家族的统治合法性`;
  }
  if(type===9)return 40>(r.destiny.nations[state]?.destiny??0)?`${name}等家族联合起来反对腐败的${r.world.nations.find(v=>v.id===state)!.name}政权`:rebels.length>=3?`${name}等${rebels.length}个家族结成联盟推翻现政权`:`${name}家族要求进行彻底的政治改革`;
  if(type===10)return r.kin.families[lead].cultureName!==nation.cultureId?`${name}家族以文化差异为由寻求独立`:n.families[lead].religionId!==nation.religionId?`${name}家族因宗教分歧而要求独立`:`边远地区的${name}家族不再服从中央统治`;
  if(ruling&&-70>familyRelation47(r,lead,rulingId))return `${name}家族与${ruling}家族积怨已久决意推翻其统治`;
  return n.families[lead].influence>f((ruling?n.families[rulingId].influence:0)*f(1.5))?`势力强大的${name}家族不甘屈居人下`:`${name}家族不堪${ruling}家族的压迫而起兵`;
}
/** StartCivilWar; returns the rebel state id or null. */
export function startCivilWar47(r:Run,state:string,discontented:string[]):string|null{
  const n=r.nobility!;if(inCivilWar47(r,state)||!r.foundings)return null;
  const rebels=discontented.filter(v=>!hasCourtRecord47(r,v));if(!rebels.length)return null;
  const type=determineCivilWarType47(r,state,rebels);
  n.lastCivilWar[state]=r.life.gameTime;
  const lead=top(r,rebels),cause=civilWarCause47(r,state,rebels,type);
  for(const v of rallyFamilies47(r,lead))if(!rebels.includes(v))rebels.push(v);
  const motherName=r.world.nations.find(v=>v.id===state)!.name,surname=r.kin.families[lead].surname;
  const rebel=launchNobleRevolt47(r,lead,[lead,...rebels.filter(v=>v!==lead)],`${surname}家族领导内战，叛军以家族领地建立新的国家。`,{cb:civilWarCb47(type),legacy:type,goal:civilWarGoal47(type)});
  if(!rebel)return null;
  n.lastCivilWar[state]=r.life.gameTime;
  const rebelName=r.world.nations.find(v=>v.id===rebel)!.name,loyal=Object.values(n.families).filter(v=>v.nationId===state).length;
  n.civilWars[rebel]={motherId:state,type,cause,familyId:Number(lead),familyIds:rebels.map(Number),rebelName,motherName} satisfies CivilWar47;
  announce(r.chronicle,r.world,r.clock.tick,'uprising',`${motherName}${titles[type]}`,`${cause}，叛军成立了${rebelName}。${motherName}爆发内战，${surname}家族领导${rebels.length}个叛乱家族对抗${loyal}个忠诚家族。`,[state,rebel],null);
  return rebel;
}
/** CivilWarSettlementUtil.InheritIdentity: the winner takes the loser's
 * state name. A different culture keeps its own name pool, so the loser's
 * name is carried as the winner's custom name (web adaptation). */
export function inheritIdentity47(r:Run,winner:string,loser:string){
  const c=r.civilization,a=c.nations[winner],b=c.nations[loser];
  if(a.cultureId===b.cultureId)a.name=structuredClone(b.name);
  else a.name.custom=b.name.custom??nationName47({...b,polity:a.polity,religionId:a.religionId});
  r.world.nations.find(v=>v.id===winner)!.name=nationName47(a);c.revision++;
}
/** ClaimThrone / ReformGovernment / OverthrowRuler V2 effects (goal 10/9/8);
 * the overthrow also gives the winner's ruling family +100 influence. */
export function applyCivilWarEffect47(r:Run,type:8|9|10,winner:string,loser:string){
  inheritIdentity47(r,winner,loser);
  if(type===8){const fam=r.nobility?.families[String(rulingFamilyId47(r,winner))];if(fam)fam.influence=f(fam.influence+100);}
}
/** CivilWarEndEvent (rebels or government victory). */
export function recordCivilWarEnd47(r:Run,c:War46Campaign){
  const n=r.nobility,key=(id:number)=>r.nativeWars.nationIds.find(v=>v[0]===id)?.[1],rebel=key(c.internal!.rebelStateId);
  const w=rebel?n?.civilWars[rebel]:undefined;if(!n||!rebel||!w)return;
  delete n.civilWars[rebel];
  const rebelLand=land(r,rebel),won=c.settlement?.outcomes.some(([id,o])=>id===c.internal!.rebelStateId&&o===0)??false,R=w.rebelName,M=w.motherName;
  const days=Math.round(((c.endedTick??r.clock.tick)-c.openedTick)/120),loss=Math.round(c.deaths.reduce((sum,[,v])=>sum+v,0)*100)/100;
  const info=`。战争持续了${days}天，累计军力损失${loss}`;
  if(rebelLand&&won){
    const text={8:`${R}成功夺取了${M}的王位`,9:`${R}成功推翻了腐败政权，建立了新秩序`,10:`${R}成功独立，脱离了${M}的统治`,11:`${R}成功推翻了${M}的统治`}[w.type];
    announce(r.chronicle,r.world,r.clock.tick,'independence',`${M}的叛军取得了内战胜利`,text+info+'（原作 CivilWarEnd）。',[rebel,w.motherId],null);
  }else if(!rebelLand){
    const text={8:`${M}成功镇压了继承权叛乱，维护了王位`,9:`${M}成功镇压了改革派叛乱，维持了现有体制`,10:`${M}成功镇压了${R}的分离主义叛乱，维护了国家统一`,11:`${M}成功镇压了推翻叛乱，巩固了统治地位`}[w.type];
    announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${M}成功平定了内战`,text+info+'（原作 CivilWarEnd）。',[w.motherId,rebel],null);
  }
}
