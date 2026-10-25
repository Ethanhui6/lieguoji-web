import type {FoundingForces47} from './civilization47-forces';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {forceStrength47} from './civilization47-monthly-muster';
import {beginArmyTravel47} from './army-travel47-state';
import {locateTravelCell47,type TravelGraph47} from './army-travel47-graph';
import {dailyEvent47} from './civilization47-upkeep';

/** Original Army has no rations, morale or supply line: an army marches to the target
 * FindTargetProvince / FindTargetIdleProvince picked and fights until its armyCount reaches
 * zero (Army.Attacking / Idle / ShouldReorganization). New worlds drop the web's food layer
 * for armies: no ration gate on orders, no forward staging for food, no resting or returning
 * home for low food/morale, no starvation losses. (Grain the web economy books for armies is
 * unchanged; fleets keep their food until the navy batch.) */
export const ORIGINAL_ARMY_RULE47='original-army-no-rations-v1';
/** `kills`: Army.enemyArmyDestroyedCount per army, in soldiers (worlds from 0.5.20). */
/** Each later behaviour has its own marker so older worlds of the same rule replay unchanged:
 * `kills` (0.5.20: kill record and Reorganization), `paths` (0.5.24: start-state passability). */
export type OriginalArmy47={version:1;rule:typeof ORIGINAL_ARMY_RULE47;kills?:Record<string,number>;paths?:1};
type Run={originalArmy47?:OriginalArmy47};

export const originalArmy47=(r:object)=>!!(r as Run).originalArmy47;
/** Worlds from 0.5.20 (Reorganization) and 0.5.24 (start-state passability). */
export const originalReorganization47=(r:object)=>!!(r as Run).originalArmy47?.kills;
export const originalPaths47=(r:object)=>(r as Run).originalArmy47?.paths===1;
export function assertOriginalArmy47(r:object){
  const s=(r as Run).originalArmy47;if(s===undefined)return;
  const keys=Object.keys(s??{}).sort().join('/');
  if(!s||typeof s!=='object'||!['rule/version','kills/rule/version','kills/paths/rule/version'].includes(keys)||s.version!==1||s.rule!==ORIGINAL_ARMY_RULE47||s.paths!==undefined&&s.paths!==1)throw Error('原作军队规则记录无效。');
  if(s.kills&&(typeof s.kills!=='object'||Array.isArray(s.kills)||Object.values(s.kills).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)))throw Error('军团歼敌记录无效。');
}
/** Journalled switch for a newly created world only. */
export function enableOriginalArmy47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T{
  assertOriginalArmy47(input);
  if(originalArmy47(input)||!sameCulture47Value(expected,populationStamp47(input as never)))throw Error('原作军队规则只能在世界未变化时启用，请重新操作。');
  const next=structuredClone(input) as T&Run;
  next.originalArmy47={version:1,rule:ORIGINAL_ARMY_RULE47,kills:{},paths:1};
  for(const a of next.world.armies)if(a.troops>0&&a.status!=='destroyed'){a.supplies=100;a.morale=100;}
  return next;
}
/** Daily: armies never run short — keep the legacy fields at full so no web reader
 * (order previews, speed, combat) sees hunger. */
export function settleOriginalArmyDay47(r:FoundingForces47){
  if(!originalArmy47(r))return false;
  progressOriginalReorganization47(r);
  for(const a of r.world.armies)if(a.troops>0&&a.status!=='destroyed'){a.supplies=100;a.morale=100;}
  return true;
}
type Army=FoundingForces47['world']['armies'][number];
/** Army.ShouldReorganization: an army whose armyCount reaches zero is rebuilt instead of
 * destroyed when it is a regular (not emergency) army, its home province still belongs to
 * its state, and no other army of that home is alive (Province.armyLimit 1). Army.Reorganization
 * then puts it back at the home province centre with a tenth of a full legion. */
export function reorganizeDefeatedArmy47(r:FoundingForces47,a:Army,graph:TravelGraph47):boolean{
  if(!originalReorganization47(r))return false;
  const force=r.tactics.forces[a.id];if(!force||force.kind==='emergency')return false;
  const home=r.world.provinces.find(p=>p.id===force.homeId);if(!home||home.controller!==a.nationId)return false;
  if(r.world.armies.some(o=>o.id!==a.id&&o.troops>0&&o.status!=='destroyed'&&r.tactics.forces[o.id]?.homeId===home.id&&o.nationId===a.nationId))return false;
  const cell=locateTravelCell47(graph,home.center,home.id);if(!cell)return false;
  const full=forceStrength47(r,home.id);
  Object.assign(a,{provinceId:home.id,status:'idle',route:[],progress:0,troops:Math.max(1,Math.floor(full*.1)),morale:100,supplies:100});
  force.fullStrength=full;r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell.id],graph,home.center);
  delete r.battles.plans[a.id];delete r.tactics.rounds[a.id];
  r.reorganization.active[a.id]={startedTick:r.clock.tick,fraction:0};
  dailyEvent47(r,'battle',`${a.name}在故乡重组`,`兵力打光后于${home.name}以一成兵力重新集结，按原作重组时长逐步补满。`);
  return true;
}
/** Army.ReorganizationUpdate: armyCount grows by max × elapsed / duration, duration
 * Province.GetArmyReorganizationDuration = 20 − 10 × population / 25000 seconds (population
 * clamped to 0…25000), in game seconds (life.secondsPerDay per day). Full → Idle. The original
 * also charges the state gold on completion; the web has no matching treasury hook yet. */
export function progressOriginalReorganization47(r:FoundingForces47){
  for(const [id,state] of Object.entries(r.reorganization.active)){
    const a=r.world.armies.find(a=>a.id===id),force=r.tactics.forces[id];
    if(!a||a.troops<=0||a.status==='destroyed'||!force){delete r.reorganization.active[id];continue;}
    const stock=r.world.statecraft!.provinces.find(p=>p.provinceId===force.homeId),pop=Math.max(0,Math.min(25000,stock?.population??0));
    const full=forceStrength47(r,force.homeId),duration=20-10*pop/25000,amount=full*r.life.secondsPerDay/duration+state.fraction,whole=Math.floor(amount);
    state.fraction=amount-whole;a.troops=Math.min(full,a.troops+whole);force.fullStrength=full;
    if(a.troops>=full){delete r.reorganization.active[id];r.reorganization.completed[id]=(r.reorganization.completed[id]??0)+1;}
  }
}
/** Army.AddDamageToEnemyArmyInProvince adds every hit to the attacker's
 * enemyArmyDestroyedCount; BuildEnemyDestroyedRow shows it in soldiers. The web's army hit
 * is native damage × 10 soldiers, the same conversion its losses use. */
export function creditArmyKills47(r:object,hits:readonly {attacker:string;victim:string;nativeDamage:number}[],armyOf:(key:string)=>string|null){
  const kills=(r as Run).originalArmy47?.kills;if(!kills)return;
  for(const hit of hits){const id=armyOf(hit.attacker);if(id===null||armyOf(hit.victim)===null)continue;kills[id]=(kills[id]??0)+hit.nativeDamage*10;}
}
export const armyKills47=(r:object,armyId:string)=>(r as Run).originalArmy47?.kills?Math.floor((r as Run).originalArmy47!.kills![armyId]??0):null;
