import {reconcileVassals47} from './civilization47-vassal';
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
function applyOwned(r:PoliticalRun47,e:TerritoryEdit47,annexed?:string):number{
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
  if(annexed===undefined)announce(r.chronicle,r.world,r.clock.tick,'occupation',`地图编辑：${nation.name}获得${changed.length}个行省`,
    `暂停时在编辑国家中重新分配领土，法理与实控同时转移；${changed.slice(0,6).map(p=>p.name).join('、')}${changed.length>6?'等':''}。`,[nation.id,...losers],changed[0].id);
  reconcileGovernmentContinuity47(r);
  if(annexed!==undefined){
    // The extinction entry (with the ended reign) carries the original Destroyed text.
    const entry=[...r.chronicle.entries].reverse().find(v=>v.kind==='extinction'&&v.tick===r.clock.tick&&v.nationIds.includes(annexed));if(!entry)throw Error('吞并未能结束目标国家。');
    const target=r.world.nations.find(n=>n.id===annexed)!.name;entry.text=`${target}被${nation.name}灭亡`;entry.reason=`吞并：${target}的${changed.length}个行省全部并入${nation.name}，法理与实控同时转移；结束当前任期，人物、家族、城市与历史保留。`;
    const event=r.world.events.find(v=>v.id===entry.sourceEventId);if(event){event.text=entry.text;event.reason=entry.reason;}
  }
  reconcileDiplomaticForces47(r,new Set());finishPoliticalTick47(r);reconcileVassals47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);
  reconcileMilitaryClock47(r,r.clock.tick);
  assertPolitics47(r);
  return changed.length;
}
/** PlayerController.AnnexSelectedState: every province of the clicked state
 * not already the annexer's is ConqueredBy the annexer. No war is required.
 * History text is the original Destroyed "{0}被{1}灭亡". */
export function annexOwned47(r:PoliticalRun47,nationId:string,targetId:string){
  if(nationId===targetId)throw Error('不能吞并自己。');
  const target=r.world.nations.find(n=>n.id===targetId);if(!target)throw Error('选择的国家不存在。');
  const provinceIds=r.world.provinces.filter(p=>p.controller===targetId).map(p=>p.id);
  if(!provinceIds.length)throw Error('该国已经没有领土。');
  return applyOwned(r,{nationId,provinceIds},target.id);
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
