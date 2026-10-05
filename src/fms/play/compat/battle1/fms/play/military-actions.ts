import type { StateVersion, World, StateActionPreview } from '../../compat/v0_4/sim/types';
import { createMilitaryCore } from './military-core';
import { isUnitKey, unitProfile, type UnitAssignments, type UnitKey } from './military-profile';
import { mobilize } from './mobilization';

export type MilitaryAction = {type:'relocate-capital';nationId:string;cityId:string}
  | {type:'recruit';nationId:string;cityId:string;unit:UnitKey;troops:number};
export const recruitmentGrain=(troops:number)=>Math.ceil(troops*100/6);
export function previewMilitaryAction(world:World,action:MilitaryAction):StateActionPreview {
  const basedOn={day:world.day,nextEventId:world.nextEventId};
  const no=(reason:string):StateActionPreview=>({valid:false,reason,changes:[],warnings:[],basedOn});
  // Structural validation uses the current empty-army contract; actual unit keys
  // are separately validated on the full run before Worker dispatch.
  if(!world||!Array.isArray(world.armies)||!createMilitaryCore(Object.fromEntries(world.armies.map(a=>[a?.id,'Infantry'])),true,true).validateWorld(world)||!world.statecraft)return no('世界状态无效。');
  if(!action||typeof action!=='object'||!['relocate-capital','recruit'].includes(action.type))return no('国家操作无效。');
  const keys=action.type==='recruit'?['type','nationId','cityId','unit','troops']:['type','nationId','cityId'];
  if(Object.keys(action).length!==keys.length||!keys.every(k=>Object.hasOwn(action,k)))return no('国家操作格式无效。');
  const nation=world.nations.find(n=>n.id===action.nationId),city=world.cities.find(c=>c.id===action.cityId);
  const province=world.provinces.find(p=>p.id===city?.provinceId);
  if(!nation||!city||!province||province.controller!==nation.id||province.legalOwner!==nation.id)return no('必须选择本国拥有且实际控制的城市。');
  if(world.armies.some(a=>a.provinceId===province.id&&a.progress===0&&a.status==='fighting'))return no('城市正在交战，暂不能执行。');
  if(action.type==='relocate-capital'){
    if(nation.capitalId===city.id)return no('这里已经是首都。');
    return {valid:true,reason:`将${nation.name}的首都迁至${city.name}。`,changes:['首都标记与国家首都定位即时更新。'],warnings:['当前规则没有迁都费用。城市、人口、驻军和疆界保持原位。'],basedOn};
  }
  if(!isUnitKey(action.unit)||!Number.isInteger(action.troops)||action.troops<100||action.troops>3000)return no('请选择有效兵种，征募人数须为100—3000。');
  if(world.armies.length>=500||world.armies.filter(a=>a.nationId===nation.id&&a.status!=='destroyed').length>=30)return no('已达到本版军团上限。');
  const local=world.statecraft.provinces.find(p=>p.provinceId===province.id)!;
  if(action.troops>Math.floor(local.population*.1)||local.population-action.troops<100)return no('每次最多征募当地人口的10%，并保留至少100名居民。');
  if(local.grain<recruitmentGrain(action.troops))return no('地方粮储不足以配发100点军粮。');
  const unit=unitProfile(action.unit);
  return {valid:true,reason:`在${city.name}征募${action.troops}名${unit.name}。`,changes:[`当地人口减少${action.troops}，地方粮储支出${recruitmentGrain(action.troops)}人日粮。`,`战力系数${unit.power}，移动速度${unit.speed}倍。`],warnings:['本版征募即时成军；训练期、装备与阶层尚未恢复。'],basedOn};
}
export function applyMilitaryAction(world:World,units:UnitAssignments,action:MilitaryAction,expected:StateVersion){
  if(expected.day!==world.day||expected.nextEventId!==world.nextEventId)throw new Error('世界已变化，请重新预览。');
  const preview=previewMilitaryAction(world,action);if(!preview.valid)throw new Error(preview.reason);
  const next=structuredClone(world),assigned={...units};
  const nation=next.nations.find(n=>n.id===action.nationId)!,city=next.cities.find(c=>c.id===action.cityId)!;
  if(action.type==='relocate-capital')nation.capitalId=city.id;
  else {
    const local=next.statecraft!.provinces.find(p=>p.provinceId===city.provinceId)!;
    local.population-=action.troops;local.grain-=recruitmentGrain(action.troops);
    let id=`recruit-${next.nextEventId}`;
    while(next.armies.some(a=>a.id===id))id+='a';
    assigned[id]=action.unit;
    next.armies.push({id,name:`${city.name}${unitProfile(action.unit).name}`,nationId:nation.id,provinceId:city.provinceId,originId:city.provinceId,troops:action.troops,morale:65,supplies:100,status:'idle',route:[],progress:0});
  }
  next.events.push({id:next.nextEventId++,day:next.day,kind:'system',text:preview.reason,reason:[...preview.changes,...preview.warnings].join('')});
  if(next.events.length>160)next.events.splice(0,next.events.length-160);
  return {world:next,units:assigned};
}

/** Explicitly chosen new-rule copy preserves existing troop totals and orders.
 * Existing aggregate armies become infantry; no hidden random specialization. */
export function initialUnitAssignments(world:World):UnitAssignments {
  return Object.fromEntries(world.armies.map(a=>[a.id,'Infantry']));
}

/** Recruit locally instead of splitting every nation into the same three armies. */
export function formStartingUnits(world:World){
  const next=structuredClone(world);
  for(const a of next.armies)next.statecraft!.provinces.find(p=>p.provinceId===a.provinceId)!.population+=a.troops;
  next.armies=[];
  return mobilize(next,{},true);
}
