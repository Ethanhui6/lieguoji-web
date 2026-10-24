import type {FoundingForces47} from './civilization47-forces';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';

/** Original Army has no rations, morale or supply line: an army marches to the target
 * FindTargetProvince / FindTargetIdleProvince picked and fights until its armyCount reaches
 * zero (Army.Attacking / Idle / ShouldReorganization). New worlds drop the web's food layer
 * for armies: no ration gate on orders, no forward staging for food, no resting or returning
 * home for low food/morale, no starvation losses. (Grain the web economy books for armies is
 * unchanged; fleets keep their food until the navy batch.) */
export const ORIGINAL_ARMY_RULE47='original-army-no-rations-v1';
export type OriginalArmy47={version:1;rule:typeof ORIGINAL_ARMY_RULE47};
type Run={originalArmy47?:OriginalArmy47};

export const originalArmy47=(r:object)=>!!(r as Run).originalArmy47;
export function assertOriginalArmy47(r:object){
  const s=(r as Run).originalArmy47;if(s===undefined)return;
  if(!s||typeof s!=='object'||Object.keys(s).sort().join('/')!=='rule/version'||s.version!==1||s.rule!==ORIGINAL_ARMY_RULE47)throw Error('原作军队规则记录无效。');
}
/** Journalled switch for a newly created world only. */
export function enableOriginalArmy47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T{
  assertOriginalArmy47(input);
  if(originalArmy47(input)||!sameCulture47Value(expected,populationStamp47(input as never)))throw Error('原作军队规则只能在世界未变化时启用，请重新操作。');
  const next=structuredClone(input) as T&Run;
  next.originalArmy47={version:1,rule:ORIGINAL_ARMY_RULE47};
  for(const a of next.world.armies)if(a.troops>0&&a.status!=='destroyed'){a.supplies=100;a.morale=100;}
  return next;
}
/** Daily: armies never run short — keep the legacy fields at full so no web reader
 * (order previews, speed, combat) sees hunger. */
export function settleOriginalArmyDay47(r:FoundingForces47){
  if(!originalArmy47(r))return false;
  for(const a of r.world.armies)if(a.troops>0&&a.status!=='destroyed'){a.supplies=100;a.morale=100;}
  return true;
}
