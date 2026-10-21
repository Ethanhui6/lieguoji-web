import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {reconcileCore} from './core-refresh51';
import {reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {announce} from './civilization47-history';
import {reconcileGovernmentContinuity47,finishPoliticalTick47,assertPolitics47,politicalStamp47,type PoliticalStamp47} from './civilization47-political-owner';
import {reconcileDiplomaticForces47} from './civilization47-war-settlement';
import {reconcileNativeDiplomacy46} from './civilization47-diplomatic-state';
import {reconcileMilitaryClock47} from './force-tick47';

/** Original map editor "绘制国家" while the game is paused: provinces are
 * redistributed to one nation (TerritoryRedistribution / ProvinceGranted).
 * Both legal and actual ownership move; the same economy, core, port,
 * siege, capital and extinction reconciliation as a real occupation runs. */
export type TerritoryEdit47={nationId:string;provinceIds:string[]};
const MAX_PROVINCES=480;

export function assertTerritoryEdit47(v:unknown):asserts v is TerritoryEdit47{
  const e=v as TerritoryEdit47;
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join('/')!=='nationId/provinceIds'||typeof e.nationId!=='string'||!/^n-\d+$/.test(e.nationId)
    ||!Array.isArray(e.provinceIds)||!e.provinceIds.length||e.provinceIds.length>MAX_PROVINCES||e.provinceIds.some(id=>typeof id!=='string'||!/^p-\d+$/.test(id))||new Set(e.provinceIds).size!==e.provinceIds.length)throw Error('领土编辑无效。');
}
function applyOwned(r:PoliticalRun47,e:TerritoryEdit47):number{
  assertTerritoryEdit47(e);
  const nation=r.world.nations.find(n=>n.id===e.nationId);if(!nation)throw Error('选择的国家不存在。');
  const provinces=e.provinceIds.map(id=>{const p=r.world.provinces.find(p=>p.id===id);if(!p)throw Error('选择的行省不存在。');return p;});
  const changed=provinces.filter(p=>p.controller!==nation.id||p.legalOwner!==nation.id);
  if(!changed.length)throw Error('这些行省已经属于该国。');
  const losers=[...new Set(changed.map(p=>p.controller))].filter(id=>id!==nation.id);
  for(const p of changed){
    if(p.controller!==nation.id)transferEconomy(r.world,p.id,p.controller,nation.id);
    p.controller=p.legalOwner=nation.id;
  }
  const moved=new Set(changed.map(p=>p.id));
  r.occupation={...r.occupation,sieges:r.occupation.sieges.filter(s=>!moved.has(s.provinceId))};
  reconcileCore(r.world,r.upperCombat);
  reconcilePortLandOwnersOwned47(r);
  announce(r.chronicle,r.world,r.clock.tick,'occupation',`地图编辑：${nation.name}获得${changed.length}个行省`,
    `暂停时在编辑国家中重新分配领土，法理与实控同时转移；${changed.slice(0,6).map(p=>p.name).join('、')}${changed.length>6?'等':''}。`,[nation.id,...losers],changed[0].id);
  reconcileGovernmentContinuity47(r);
  reconcileDiplomaticForces47(r,new Set());finishPoliticalTick47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);
  reconcileMilitaryClock47(r,r.clock.tick);
  assertPolitics47(r);
  return changed.length;
}
export function previewTerritoryEdit47(r:PoliticalRun47,edit:TerritoryEdit47){
  const expected=politicalStamp47(r);
  try{const copy=structuredClone(r),count=applyOwned(copy,edit);return {valid:true,reason:`${count}个行省将划入该国。`,expected,edit:structuredClone(edit)};}
  catch(e){return {valid:false,reason:e instanceof Error?e.message:'领土编辑预览失败。',expected,edit:structuredClone(edit)};}
}
export function applyTerritoryEdit47(r:PoliticalRun47,edit:TerritoryEdit47,expected:PoliticalStamp47){
  const stamp=politicalStamp47(r),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新编辑；原世界未改动。');
  const next=structuredClone(r);applyOwned(next,edit);return next;
}
