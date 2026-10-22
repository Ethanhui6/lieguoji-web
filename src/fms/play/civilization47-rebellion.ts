import {releaseRebelProvince47} from './civilization47-nobility-fate';
import type {NobilityRun47} from './civilization47-nobility';
import {inCivilWar47,startCivilWar47} from './civilization47-nobility-civil-war';
import {startFamilyRebellion47} from './civilization47-nobility-rebellion';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {assertPolitics47,finishPoliticalTick47,politicalStamp47,type PoliticalStamp47} from './civilization47-political-owner';
import {assertFoundings47,enableFoundings47,foundState47,type FoundingRun47,type Foundings47} from './civilization47-founding';
import {nativeGetMonthSince,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './civilization47-iso-calendar';
import {war26Strength} from './war26-strength';
import {nationsAtWar} from './realtime-statecraft';
import {nativeRebellionResistance} from './native-war/vassal-rebellion';
import traits from './native-economy/character-traits.json';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {relocateLostCapitals47} from './civilization47-capitals';
import {reconcileCore} from './core-refresh51';
import {reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {reconcileGovernmentContinuity47} from './civilization47-political-owner';
import {actualForces47} from './force-runtime47';
import {readArmySpace47} from './army-space47';
import {haltArmyTravel47} from './army-travel47-state';
import {registerWar46,reconcileWar28Identities,stateNumber} from './war47-wars';
import {buildParticipants47,openCoalitionRelations47} from './civilization47-diplomatic-world';
import {createForce47} from './civilization47-monthly-muster';
import {initializedArmySpeed47} from './force-speed47';
import {traitProjection} from './upper14-state';
import {initializedArmyBase} from './native-combat/state-traits';
import {initializedArmyCombat47} from './civilization47-combat-state';
import {initialArmyDecision47} from './civilization47-army-ai-state';
import {announce} from './civilization47-history';
import {reconcileNativeDiplomacy46} from './civilization47-diplomatic-state';
import {reconcileMilitaryClock47} from './force-tick47';
import {reconcileLosses} from './war27-losses';
import {reconcileAlliances47} from './civilization47-alliance';

/** Original province rebellion (Province.TryRebel). This slice: the explicit
 * rule switch for new worlds and the forced uprising of one province
 * (ProvinceInfoUI 煽动叛乱 → TryRebel(true)), which records the original
 * RebellionEvent "{0}发生叛乱" and founds the rebel state. */
export function enableRebellion47<T extends PoliticalRun47>(input:T,expected:PopulationStamp47):T{
  const r=input as T&FoundingRun47;
  if(r.foundings||!sameCulture47Value(expected,populationStamp47(r)))throw Error('叛乱规则只能在世界未变化时启用，请重新操作。');
  const next=enableFoundings47(r);assignUpdateDays47(next,next.foundings!);return next;
}
export function rebellionBlocker47(r:FoundingRun47,provinceId:string):string|null{
  if(!r.foundings)return '本世界未启用叛乱规则。';
  const p=r.world.provinces.find(v=>v.id===provinceId);if(!p)return '选择的行省不存在。';
  const nation=r.world.nations.find(n=>n.id===p.controller);if(!nation)return '该行省不属于任何国家。';
  if(r.world.cities.find(c=>c.id===nation.capitalId)?.provinceId===p.id)return '首都不能发生叛乱。';
  if(!r.world.cities.some(c=>c.provinceId===p.id))return '该行省没有城市。';
  if(r.world.provinces.filter(v=>v.controller===nation.id).length<2)return '国家最后一块领土不能叛乱。';
  if(r.world.nations.length>=50)return '本局国家记录已达上限。';
  return null;
}
export function applyRebellion47<T extends PoliticalRun47>(input:T,provinceId:string,expected:PoliticalStamp47):T{
  const stamp=politicalStamp47(input),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const blocked=rebellionBlocker47(input as FoundingRun47,provinceId);if(blocked)throw Error(blocked);
  const r=structuredClone(input) as T&FoundingRun47,p=r.world.provinces.find(v=>v.id===provinceId)!,parentId=p.controller;
  if(!tryRebel47(r,p.id,true))throw Error('叛乱未能发生，原世界未改动。');void parentId;
  reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);reconcileAlliances47(r);
  finishPoliticalTick47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);reconcileMilitaryClock47(r,r.clock.tick);
  assertFoundings47(r);assertPolitics47(r);
  return r;
}

// ---- 12b: original rebellion gates, probabilities and monthly schedule ----
const f=Math.fround;
const monthKey47=(r:PoliticalRun47)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
const calendar47=(r:PoliticalRun47)=>createNativeIsoCalendar(r.life.startDate);
const monthsSince47=(r:PoliticalRun47,time:number)=>nativeGetMonthSince(time,r.life.gameTime,r.life.secondsPerDay,calendar47(r));
const yearsSince47=(r:PoliticalRun47,time:number)=>nativeGetYearSince(time,r.life.gameTime,r.life.secondsPerDay,calendar47(r));
/** Web stand-in for UnityEngine.Random: a persisted LCG stream in the ledger. */
function value47(s:Foundings47){if(!Number.isSafeInteger(s.random.draws+1))throw Error('叛乱随机记录已达精度上限。');s.random.state=(Math.imul(s.random.state,1664525)+1013904223)>>>0;s.random.draws++;return s.random.state/4294967296;}
const range47=(s:Foundings47,min:number,max:number)=>min+Math.floor(value47(s)*(max-min));
/** State.timeStampLastCivilWar / timeStampLastFamilyRebellion start at -10000
 * and no civil war or family rebellion exists yet, so both gates stay open. */
const NEVER47=-10000;
const alive47=(r:PoliticalRun47,id:string)=>r.world.provinces.some(p=>p.controller===id);
const capitalProvince47=(r:PoliticalRun47,id:string)=>r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===id)?.capitalId)?.provinceId;
const isCore47=(r:PoliticalRun47,provinceId:string,owner:string)=>r.upperCombat.provinces[provinceId].distance<=r.upperCombat.nations[owner].coreThreshold;
const manifest47=(r:PoliticalRun47,id:string)=>r.destiny.nations[id]?.manifestCount??0;
const destiny47=(r:PoliticalRun47,id:string)=>r.destiny.nations[id].destiny;
const bornTime47=(r:FoundingRun47,id:string)=>r.foundings?.records.find(v=>v.nationId===id)?.gameTime??0;
/** DiplomacyManager.IsSuperSuperPower: the only state, or one of the two
 * strongest with more than 30% of the total strength (SortStatesByStrength). */
export function superSuperPower47(r:PoliticalRun47,id:string){
  const living=r.world.nations.filter(n=>alive47(r,n.id)).map(n=>({id:n.id,strength:war26Strength(r.world,r,n.id)})).sort((a,b)=>b.strength-a.strength||a.id.localeCompare(b.id));
  if(!living.length)return false;if(living.length===1)return living[0].id===id;
  const sum=living.reduce((n,v)=>f(n+v.strength),0),own=living.slice(0,2).find(v=>v.id===id);
  return !!own&&own.strength>f(sum*f(.3));
}
/** State.GetMaxRecentRebellions (10000 without manifest destiny). */
function maxRecent47(r:PoliticalRun47,id:string){const m=manifest47(r,id);if(m===0)return 10000;const d=destiny47(r,id),base=d<13?12:d<20?7:d<25?5:4;return Math.max(1,base-m);}
function pruneRecent47(r:PoliticalRun47,s:Foundings47,id:string){const q=s.recent[id]??[];while(q.length&&monthsSince47(r,q[0])>26)q.shift();if(q.length)s.recent[id]=q;else delete s.recent[id];return q;}
/** State.CanAllowNewRebellion. */
function canAllowNewRebellion47(r:PoliticalRun47,s:Foundings47,id:string){return pruneRecent47(r,s,id).length<maxRecent47(r,id);}
/** State.RecordNewRebellion; the state's timeStampLastRebel moves to now. */
function recordNewRebellion47(r:PoliticalRun47,s:Foundings47,id:string){const q=pruneRecent47(r,s,id);q.push(r.life.gameTime);const max=maxRecent47(r,id);while(q.length>max)q.shift();s.recent[id]=q;s.lastRebel[id]=r.life.gameTime;}
/** State.CanProvinceRebel. */
function canProvinceRebel47(r:FoundingRun47,s:Foundings47,id:string,provinceId:string){
  if(monthsSince47(r,NEVER47)<24||!canAllowNewRebellion47(r,s,id))return false;
  const threshold=(r.upperCombat.provinces[provinceId].connected?s.destinyToRebelConnected:s.destinyToRebel)-manifest47(r,id)+5;
  if(destiny47(r,id)>threshold)return false;
  if(r.world.provinces.filter(p=>p.controller===id).length<30)return false;
  let interval=f(s.minMonths);if(destiny47(r,id)<15&&superSuperPower47(r,id))interval=f(interval/6);
  if(interval>monthsSince47(r,s.lastRebel[id]??0))return false;
  return monthsSince47(r,bornTime47(r,id))>=15;
}
/** Province.CheckWarStatus web stand-in: the province borders a state at war with its owner, or is besieged. */
function provinceAtWar47(r:PoliticalRun47,provinceId:string){
  const p=r.world.provinces.find(v=>v.id===provinceId)!;
  return r.occupation.sieges.some(v=>v.provinceId===provinceId)||p.neighbors.some(n=>{const q=r.world.provinces.find(v=>v.id===n);return !!q&&q.controller!==p.controller&&nationsAtWar(r.world,p.controller,q.controller);});
}
/** Province.TryRebel(isForceRebel). Returns true when a rebellion happened. */
export function tryRebel47(r:FoundingRun47,provinceId:string,force:boolean):boolean{
  const s=r.foundings!,p=r.world.provinces.find(v=>v.id===provinceId)!,owner=p.controller;
  if(!force){
    if(!s.enabled||capitalProvince47(r,owner)===p.id)return false;
    const c=r.upperCombat.provinces[p.id];
    if(c.distance<=r.upperCombat.nations[owner].coreThreshold&&manifest47(r,owner)>1)return false;
    if(!canProvinceRebel47(r,s,owner,p.id))return false;
    if(monthsSince47(r,s.conquered[p.id].time)<8)return false;
    if(provinceAtWar47(r,p.id))return false;
    // int arithmetic as in C#: an unreachable province (int.MaxValue distance) wraps negative.
    let chance=Math.min(80,Math.imul((c.distance+2)|0,5));
    if(monthsSince47(r,NEVER47)<18)chance=Math.trunc(chance*f(.1));
    chance=Math.max(0,Math.min(100,chance));
    if(!(range47(s,0,100)<chance))return false;
  }
  if(rebellionBlocker47(r,p.id))return false;
  // Province.TryRebel: the province leaves its family without a family fate.
  releaseRebelProvince47(r as unknown as NobilityRun47,p.id);
  announce(r.chronicle,r.world,r.clock.tick,'uprising',`${p.name}发生叛乱`,`${r.world.nations.find(n=>n.id===owner)!.name}的${p.name}起兵反抗。`,[owner],p.id);
  // Former owners for whom this province was core for over 20 months may be re-established.
  const candidates=Object.entries(s.coreMonths[p.id]??{}).filter(([id,months])=>id!==owner&&months>20&&!alive47(r,id)&&(force||(r.sovereignty.restorations[id]??0)<15)).map(([id])=>id);
  let rebel:string;
  if(candidates.length&&range47(s,0,100)<50){rebel=candidates[range47(s,0,candidates.length)];destroyArmiesIn47(r,owner,p.id);restoreState47(r,rebel,p.id);}
  else{destroyArmiesIn47(r,owner,p.id);rebel=foundState47(r,owner,[p.id],'叛军按行省文化建立新的国家，领袖与家族按原作新国家初始化生成。').nationId;}
  reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);reconcileAlliances47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);reconcileWar28Identities(r.nativeWars,r as never);
  startRebelWar47(r,rebel,owner);spawnInitialRebelArmies47(r,s,rebel);
  recordNewRebellion47(r,s,owner);
  return true;
}
/** ReestablishedEvent "{0}于{1}复国": the dead state regains the province; the
 * existing continuity owner restores its ruler (HandleRestorationRebellion). */
function restoreState47(r:FoundingRun47,id:string,provinceId:string){
  const p=r.world.provinces.find(v=>v.id===provinceId)!,from=p.controller;
  transferEconomy(r.world,p.id,from,id);p.controller=p.legalOwner=id;
  r.occupation={...r.occupation,sieges:r.occupation.sieges.filter(v=>v.provinceId!==provinceId)};
  r.world.nations.find(n=>n.id===id)!.capitalId=r.world.cities.find(c=>c.provinceId===provinceId)!.id;
  relocateLostCapitals47(r);reconcileCore(r.world,r.upperCombat);reconcilePortLandOwnersOwned47(r);
  reconcileGovernmentContinuity47(r);
  const entry=[...r.chronicle.entries].reverse().find(e=>e.kind==='restoration'&&e.tick===r.clock.tick&&e.nationIds.includes(id));
  if(entry){entry.text=`${r.world.nations.find(n=>n.id===id)!.name}于${p.name}复国`;const event=r.world.events.find(v=>v.id===entry.sourceEventId);if(event)event.text=entry.text;}
}
/** Province.UpdateProvinceData: MonthsCoreProvinceForState. */
function updateCoreMonths47(r:PoliticalRun47,s:Foundings47,provinceId:string){
  const p=r.world.provinces.find(v=>v.id===provinceId)!,owner=p.controller,core=isCore47(r,provinceId,owner),m=s.coreMonths[provinceId]??{};
  if(core)m[owner]=f((m[owner]??0)+1);
  const decay=f(core?.7:.3);
  for(const id of Object.keys(m))if(id!==owner){m[id]=f(m[id]-decay);if(0>m[id])delete m[id];}
  if(Object.keys(m).length)s.coreMonths[provinceId]=m;else delete s.coreMonths[provinceId];
}
/** State.ProcessRebellion for a weakened superpower (State.AdvanceOneMonth). */
export function processRebellion47(r:FoundingRun47,id:string){
  const s=r.foundings;if(!s||!s.enabled||!alive47(r,id))return;
  const destiny=destiny47(r,id);
  if(monthsSince47(r,NEVER47)<24||destiny>30||!superSuperPower47(r,id)||!canAllowNewRebellion47(r,s,id))return;
  const capital=capitalProvince47(r,id),owned=r.upperCombat.nations[id].provinceOrder.filter(pid=>r.world.provinces.find(p=>p.id===pid)?.controller===id);
  const list=owned.filter(pid=>destiny>13?!isCore47(r,pid,id)&&!provinceAtWar47(r,pid):!provinceAtWar47(r,pid)&&pid!==capital);
  if(!list.length)return;
  let chance=f(f(f(Math.min(1,Math.max(0,f(f(30-destiny)/20))))*f(.3))+f(.35));chance=f(chance/2);
  const leaderId=r.people.nations[id].leaderId,leader=leaderId===null?null:r.people.persons[leaderId];
  if(leader&&leader.alive)chance=f(f(1-nativeRebellionResistance(leader.traits.map(t=>{const found=traits.traits.find(v=>v.name===t);if(!found)throw Error('人物特性缺失。');return found;})))*chance);
  if(monthsSince47(r,NEVER47)<18)chance=f(chance*f(.1));
  if(value47(s)>chance)return;
  // SelectProvinceForRebellion: weighted by local office multipliers (all 1 here).
  const pick=list[Math.min(list.length-1,Math.floor(value47(s)*list.length))];
  if(tryRebel47(r,pick,true))recordNewRebellion47(r,s,id);
}
/** ProvinceManager.AssignRandomUpdateDays: day 1..days-in-month per province. */
export function assignUpdateDays47(r:PoliticalRun47,s:Foundings47){
  const d=r.life.currentDate;let days=28;while(isoPlusDays({year:d.year,month:d.month,day:1},days).month===d.month)days++;
  s.updateDays={};for(const p of r.world.provinces)s.updateDays[p.id]=range47(s,1,days+1);
}
/** Daily owner: conquest stamps, the month start (DiplomacyManager rebel
 * thresholds, random update days) and provinces due today (Province.AdvanceOneMonth). */
export function advanceRebellion47(r:FoundingRun47){
  const s=r.foundings;if(!s)return;
  for(const p of r.world.provinces){const c=s.conquered[p.id];if(c.controller!==p.controller)s.conquered[p.id]={controller:p.controller,time:r.life.gameTime};}
  const month=monthKey47(r);
  if(month!==s.month){
    if(month!==s.month+1)throw Error('叛乱月份不连续。');s.month=month;
    if(yearsSince47(r,s.recalTime)>10){s.recalTime=r.life.gameTime;s.destinyToRebelConnected=range47(s,5,10);s.destinyToRebel=s.destinyToRebelConnected+10;}
    assignUpdateDays47(r,s);
  }
  const day=r.life.currentDate.day,even=r.life.currentDate.month%2===0;
  for(const p of [...r.world.provinces]){
    if(s.updateDays[p.id]!==day)continue;
    updateCoreMonths47(r,s,p.id);
    if(even&&tryRebel47(r,p.id,false)){reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);reconcileAlliances47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);}
  }
}

// ---- 12c: rebel war (CB14), mother armies in the province, rebel armies ----
/** ArmyManager.DestroyArmy for the mother state's armies standing in the rebel province. */
function destroyArmiesIn47(r:FoundingRun47,nationId:string,provinceId:string){
  const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions});
  for(const v of space.byArmy.values()){const a=v.army;if(a.nationId!==nationId||a.status==='destroyed'||v.province?.id!==provinceId)continue;
    a.troops=0;a.status='destroyed';a.morale=0;a.supplies=0;a.route=[];a.progress=0;r.armyPositions.records[a.id]=haltArmyTravel47(v.travel,spatial.graph);delete r.battles.plans[a.id];delete r.reorganization.active[a.id];delete r.tactics.rounds[a.id];}
}
/** CasusBelliServiceV2.BuildInternalWarDeclaration(mother, rebel, rebel, mother,
 * goal 7, WarType 2, CB 14) + WarManagerV2.StartWar: the mother state declares. */
function startRebelWar47(r:FoundingRun47,rebelId:string,motherId:string){startInternalWar47(r,rebelId,motherId,14,2);}
/** The mother state declares an internal war: CB 14 / WarType 2 (province
 * rebellion) or CB 15 / WarType 4 (family rebellion). */
export function startInternalWar47(r:FoundingRun47,rebelId:string,motherId:string,casusBelliId:10|11|12|13|14|15,legacyType:2|4|8|9|10|11,goalType:7|8|9|10=7){
  if(nationsAtWar(r.world,rebelId,motherId))return;
  const rebel=stateNumber(r,rebelId),mother=stateNumber(r,motherId),internal={casusBelliId,legacyType,rebelStateId:rebel,motherStateId:mother} as unknown as {casusBelliId:16;legacyType:10;rebelStateId:number;motherStateId:number};
  const members=buildParticipants47(r,motherId,rebelId,internal);openCoalitionRelations47(r,members);
  registerWar46(r.nativeWars,r,motherId,rebelId,[{id:1,type:goalType as 7,addedBy:rebel,target:mother,beneficiary:rebel,scope:{provinceIds:[],requiredCount:0}}],'complete',internal,members);
  r.nativeDiplomacy.nations[motherId].activeTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.nations[rebelId].passiveTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.revision++;
}
/** CreateArmies(emergency) in `count` random provinces of the rebel state. */
function spawnRebelArmies47(r:FoundingRun47,s:Foundings47,rebelId:string,count:number){
  const owned=r.world.provinces.filter(p=>p.controller===rebelId);if(!owned.length)return;
  const {spatial}=actualForces47(r);
  for(let i=0;i<count;i++){if(r.world.armies.length>=500)break;createForce47(r,spatial,rebelId,owned[range47(s,0,owned.length)].id,'emergency');}
}
/** State.SpawnProvinceRebellionInitialArmies: max(1, floor(destiny / 15)). */
function spawnInitialRebelArmies47(r:FoundingRun47,s:Foundings47,rebelId:string){
  spawnRebelArmies47(r,s,rebelId,Math.max(1,Math.floor(f(destiny47(r,rebelId)/15))));
}
const rebelWar47=(r:FoundingRun47,rebelId:string)=>{const id=stateNumber(r,rebelId);return r.nativeWars.campaigns.find(c=>c.endedTick===null&&(c.internal?.casusBelliId as number|undefined)===14&&c.internal!.rebelStateId===id)??null;};
/** State.UpdateArmy → TrySpawnProvinceRebellionReinforcement: while the rebel war
 * has lasted at most 36 months, one more army every third war month. */
function reinforceRebels47(r:FoundingRun47,id:string){
  const s=r.foundings,war=s&&alive47(r,id)?rebelWar47(r,id):null;if(!s||!war)return;
  const months=monthsSince47(r,war.startTime??Math.fround(war.openedTick/120*r.life.secondsPerDay));
  if(months<=36&&months%3===0)spawnRebelArmies47(r,s,id,1);
}
/** State.AdvanceOneMonth: rebel reinforcements (UpdateArmy), then a weakened
 * superpower's own rebellion check (ProcessRebellion). */
export function stateRebellionMonth47(r:FoundingRun47,id:string){reinforceRebels47(r,id);processRebellion47(r,id);}

/** TransferFamilyArmiesToRebelState: the mother's armies of the rebel families,
 * and those raised in the rebel land, change sides (out of battle, orders
 * cleared); with none, one army is raised in the rebel land. */
export function transferRebelArmies47(r:FoundingRun47,motherId:string,rebelId:string,land:ReadonlySet<string>,familyIds:ReadonlySet<number>){
  const ledger=(r as unknown as {nobility?:{armies:Record<string,{familyId:number;central:boolean}>}}).nobility?.armies??{};
  const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions});let moved=0;
  for(const v of space.byArmy.values()){
    const a=v.army,row=ledger[a.id];if(a.nationId!==motherId||a.status==='destroyed')continue;
    if(!(row&&familyIds.has(row.familyId))&&!land.has(a.originId))continue;
    if(row&&row.central&&land.has(a.originId)){row.familyId=[...familyIds][0];row.central=false;}
    a.nationId=rebelId;a.status='idle';a.route=[];a.progress=0;r.armyPositions.records[a.id]=haltArmyTravel47(v.travel,spatial.graph);
    delete r.battles.plans[a.id];delete r.reorganization.active[a.id];delete r.tactics.rounds[a.id];
    r.forceSpeed.armies[a.id]=initializedArmySpeed47(r.world.custom!.seed,a.id,rebelId,r.clock.tick,false);
    r.combatPersonnel.armies[a.id]=initializedArmyCombat47(rebelId,r.clock.tick,r.combatPersonnel.nations[rebelId].damageTraits);
    r.armyAutonomy.armies[a.id]=initialArmyDecision47();
    r.upperCombat.armies[a.id]={base:initializedArmyBase(traitProjection(r.upperCombat.nations[rebelId].traits)),initializedTick:r.clock.tick};
    moved++;
  }
  if(!moved){const home=[...land].find(p=>r.world.provinces.find(v=>v.id===p)?.controller===rebelId);if(home&&r.world.armies.length<500)createForce47(r,spatial,rebelId,home,'emergency');}
}

/** FamilyManager.DebugTriggerFamilyRebellion / 家族面板「发动家族叛乱」: the
 * selected noble family rebels at once (StartFamilyRebellion). */
export function familyRebellionBlocker47(r:FoundingRun47,familyId:string):string|null{
  const n=(r as unknown as NobilityRun47).nobility;if(!n)return '本世界未使用原作家族规则。';
  if(!r.foundings)return '本世界未启用叛乱规则。';
  const fam=n.families[familyId];if(!fam)return '家族不存在。';
  if(fam.ruling)return '统治家族不能发动家族叛乱。';
  if(!fam.controlledProvinces.length)return '没有领地的家族不能发动叛乱。';
  if(r.world.nations.length>=50)return '本局国家记录已达上限。';
  return null;
}
/** StateInfoUI.OnTriggerCivilWarButtonClicked checks. */
export function civilWarBlocker47(r:FoundingRun47,nationId:string):string|null{
  const run=r as unknown as NobilityRun47&FoundingRun47,n=run.nobility;if(!n)return '本世界未使用原作家族规则。';
  if(!r.foundings)return '本世界未启用叛乱规则。';
  if(!Object.hasOwn(r.people.nations,nationId)||!r.world.provinces.some(p=>p.controller===nationId))return '国家不存在或已灭亡。';
  const families=Object.keys(n.families).filter(v=>n.families[v].nationId===nationId);
  if(!families.some(v=>n.families[v].ruling))return '当前国家没有统治家族，无法发动内战';
  const others=families.filter(v=>!n.families[v].ruling);
  if(!others.length)return `国家家族数量太少（只有${others.length}个非统治家族），无法发动内战`;
  const landed=others.filter(v=>n.families[v].controlledProvinces.length>0);
  if(landed.length<2)return `需要至少2个拥有领地的非统治家族才能发动内战（当前只有${landed.length}个）`;
  if(inCivilWar47(run,nationId))return '该国已处于进行中的内战。';
  if(r.world.nations.length>=50)return '本局国家记录已达上限。';
  return null;
}
/** FamilyManager.DebugTriggerCivilWar: the two most influential landed non-ruling families. */
export function applyCivilWar47<T extends PoliticalRun47>(input:T,nationId:string,expected:PoliticalStamp47):T{
  const stamp=politicalStamp47(input),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const blocked=civilWarBlocker47(input as FoundingRun47,nationId);if(blocked)throw Error(blocked);
  const r=structuredClone(input) as T&FoundingRun47,n=(r as unknown as NobilityRun47).nobility!;
  const rebels=Object.keys(n.families).filter(v=>n.families[v].nationId===nationId&&!n.families[v].ruling&&n.families[v].controlledProvinces.length>0).map((v,i)=>({v,i})).sort((a,b)=>n.families[b.v].influence-n.families[a.v].influence||a.i-b.i).slice(0,2).map(x=>x.v);
  if(startCivilWar47(r as never,nationId,rebels)===null)throw Error('内战未能发生，原世界未改动。');
  reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);reconcileAlliances47(r);
  finishPoliticalTick47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);reconcileMilitaryClock47(r,r.clock.tick);
  assertFoundings47(r);assertPolitics47(r);
  return r;
}
export function applyFamilyRebellion47<T extends PoliticalRun47>(input:T,familyId:string,expected:PoliticalStamp47):T{
  const stamp=politicalStamp47(input),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const blocked=familyRebellionBlocker47(input as FoundingRun47,familyId);if(blocked)throw Error(blocked);
  const r=structuredClone(input) as T&FoundingRun47;
  if(startFamilyRebellion47(r as never,familyId)===null)throw Error('家族叛乱未能发生，原世界未改动。');
  reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);reconcileAlliances47(r);
  finishPoliticalTick47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);reconcileMilitaryClock47(r,r.clock.tick);
  assertFoundings47(r);assertPolitics47(r);
  return r;
}
