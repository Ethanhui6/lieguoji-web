import type {NobilityRun47} from './civilization47-nobility';
import type {FoundingRun47} from './civilization47-founding';
import {familyRelation47} from './civilization47-nobility-relations';
import {rulingFamilyId47} from './civilization47-nobility-succession';
import {inCivilWar47,startCivilWar47} from './civilization47-nobility-civil-war';

/** Original StateInfoUI.OnTriggerCivilWarButtonClicked (国家行为 → 触发内战), messages from the original
 * localization: a living state with a ruling family; with exactly two families the other one must
 * hold land, have relation below −30 to the ruling family and influence above 100; with three or
 * more, the two non-ruling families with the worst relation to the ruling family rise
 * (FamilyManager.StartCivilWar decides the kind of civil war). */
type Run=NobilityRun47&FoundingRun47;
export function civilWarRebels47(r:Run,state:string):{rebels:string[]}|{reason:string}{
  const n=r.nobility;if(!n)return {reason:'这个世界没有启用原作家族。'};
  if(!r.foundings)return {reason:'这个世界没有启用叛乱建国规则。'};
  if(!r.world.nations.some(v=>v.id===state)||!r.world.provinces.some(p=>p.controller===state))return {reason:'当前国家无效或已灭亡'};
  const ruling=String(rulingFamilyId47(r,state));if(!n.families[ruling])return {reason:'当前国家没有统治家族，无法发动内战'};
  const families=Object.keys(n.families).filter(id=>n.families[id].nationId===state),others=families.filter(id=>id!==ruling);
  if(families.length===2){
    const other=others[0],fam=n.families[other],relation=familyRelation47(r,other,ruling);
    if(!fam.controlledProvinces.length)return {reason:'唯一的非统治家族没有领地'};
    if(!(relation<-30&&fam.influence>100))return {reason:`内战条件不满足：与统治家族关系为${relation.toFixed(1)}（需要<-30），影响力为${fam.influence.toFixed(0)}（需要>100）`};
    return {rebels:[other]};
  }
  if(families.length<3)return {reason:`家族总数不足（只有${families.length}个家族），无法发动内战`};
  if(others.length<2)return {reason:'非统治家族数量不足，无法发动内战'};
  if(inCivilWar47(r,state))return {reason:'该国已在内战中。'};
  return {rebels:others.map(id=>({id,relation:familyRelation47(r,id,ruling)})).sort((a,b)=>a.relation-b.relation||Number(a.id)-Number(b.id)).slice(0,2).map(v=>v.id)};
}
export function triggerCivilWar47(r:Run,state:string){
  const v=civilWarRebels47(r,state);if('reason' in v)throw Error(v.reason);
  if(!startCivilWar47(r,state,v.rebels))throw Error('叛乱家族都与统治者同属宫廷，无法发动内战。');
}
