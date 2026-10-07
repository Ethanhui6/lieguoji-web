export type PortAccess39=(id:string,nation:string)=>boolean;
import {underSiege} from './occupation';
import type { Point, StateVersion, World } from '../../compat/v0_4/sim/types';
import { routeDistance, seaRoute, type Port, type SeaGraph } from './sea-path';

// Web daily-economy parameters, NOT the original Unity 2.2 units/second clock.
export const NAVAL_SPEED=35, CREW_PER_SHIP=40, RATION_DAYS=60;
export interface Fleet { id:string; name:string; nationId:string; ships:number; crew:number; food:number; node:number; route:number[]; progress:number; dockId:string|null; targetId:string|null; patrol:boolean; status:'docked'|'sailing'|'anchored'|'lost' }
export interface Navy { version:1; fleets:Fleet[] }
export type NavalAction={type:'build-fleet';nationId:string;portId:string;ships:number}|{type:'sail';fleetId:string;portId:string}|{type:'patrol';fleetId:string;enabled:boolean};
export interface NavalPreview { valid:boolean; reason:string; details:string[]; route:number[]; days:number }
const owned=(w:World,p:Port,nationId:string,portAccess:PortAccess39=()=>true)=>portAccess(p.provinceId,nationId)&&!underSiege(w,p.provinceId)&&w.provinces.some(v=>v.id===p.provinceId&&v.controller===nationId&&v.legalOwner===nationId);
const event=(w:World,text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind:'system',text,reason});if(w.events.length>160)w.events.splice(0,w.events.length-160);};
export const portName=(w:World,p:Port)=>`${w.cities.find(c=>c.provinceId===p.provinceId)?.name??w.provinces.find(v=>v.id===p.provinceId)!.name}港`;
export function fleetPosition(graph:SeaGraph,f:Fleet):Point {
  const start=graph.nodes.get(f.node)!.center;if(!f.route.length)return start;
  const link=graph.nodes.get(f.node)!.links.find(e=>e.to===f.route[0])!,end=graph.nodes.get(link.to)!.center,d=Math.hypot(start.x-link.gate.x,start.y-link.gate.y);
  const a=f.progress<d?start:link.gate,b=f.progress<d?link.gate:end,t=f.progress<d?f.progress/d:(f.progress-d)/(link.distance-d);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
export function previewNaval(w:World,navy:Navy,graph:SeaGraph,action:NavalAction,portAccess:PortAccess39=()=>true):NavalPreview {
  const reject=(reason:string):NavalPreview=>({valid:false,reason,details:[],route:[],days:0});
  if(!action||typeof action!=='object')return reject('海军命令无效。');
  if(action.type==='build-fleet'){
    const p=graph.ports.find(p=>p.id===action.portId);if(!p||!owned(w,p,action.nationId,portAccess))return reject('只能在本国拥有并控制的沿海港口造船。');
    if(!Number.isInteger(action.ships)||action.ships<1||action.ships>5)return reject('每次编成 1—5 艘船。');
    if(navy.fleets.length>=200||navy.fleets.filter(f=>f.nationId===action.nationId&&f.status!=='lost').length>=8)return reject('已达到舰队上限（每国 8 支，历史 200 支）。');
    const crew=action.ships*CREW_PER_SHIP,grain=crew*RATION_DAYS,l=w.statecraft!.provinces.find(v=>v.provinceId===p.provinceId)!;
    if(l.population-crew<100||l.grain-grain<l.population*10)return reject('当地兵员或配粮不足，造船需保留 100 居民与十日民粮。');
    return {valid:true,reason:`在${portName(w,p)}编成舰队。`,details:[`${action.ships} 艘船，征用 ${crew} 名船员，扣除 ${grain} 人日粮。`,`配备 ${RATION_DAYS} 日口粮；由港外真实海格出发。造船费用为当前网页适配规则。`],route:[],days:0};
  }
  if(action.type!=='sail'&&action.type!=='patrol')return reject('未知海军命令。');
  const f=navy.fleets.find(f=>f.id===action.fleetId&&f.status!=='lost');if(!f)return reject('舰队不存在或已损失。');
  if(action.type==='patrol')return typeof action.enabled==='boolean'?{valid:true,reason:action.enabled?'开启本国港口间巡航。':'停止自动巡航；当前航线仍会完成。',details:['每十五日检查一次，港口可达且余粮足够才会出航。'],route:[],days:0}:reject('巡航设置无效。');
  if(f.route.length)return reject('正在航行，请抵达当前海格目的地后再下令。');
  const p=graph.ports.find(p=>p.id===action.portId);if(!p||!owned(w,p,f.nationId,portAccess))return reject('目的港必须由本国拥有并控制。');
  if(p.id===f.dockId)return reject('舰队已在此港。');
  const route=seaRoute(graph,f.node,p.node);if(!route)return reject('两地水域不连通，没有可行海路。');
  const days=Math.max(1,Math.ceil(routeDistance(graph,route)/NAVAL_SPEED));
  if(f.food<f.crew*(days+3))return reject(`余粮不足：航行约 ${days} 日，需另留三日储备。请先在本国港口补给。`);
  return {valid:true,reason:`驶往${portName(w,p)}。`,details:[`真实海路 ${Math.round(routeDistance(graph,route))} 地图单位，正常速度预计 ${days} 日。`,`逐段经过 ${route.length} 个海格；航线不穿陆，途中不改变当前陆军命令。`],route,days};
}
function perform(w:World,navy:Navy,graph:SeaGraph,action:NavalAction,p:NavalPreview){
  if(action.type==='build-fleet'){
    const port=graph.ports.find(p=>p.id===action.portId)!,l=w.statecraft!.provinces.find(v=>v.provinceId===port.provinceId)!,crew=action.ships*CREW_PER_SHIP,food=crew*RATION_DAYS;
    l.population-=crew;l.grain-=food;
    navy.fleets.push({id:`fleet-${w.nextEventId}-${navy.fleets.length}`,name:`${portName(w,port)}水师`,nationId:action.nationId,ships:action.ships,crew,food,node:port.node,route:[],progress:0,dockId:port.id,targetId:null,patrol:true,status:'docked'});
  }else{const f=navy.fleets.find(f=>f.id===action.fleetId)!;if(action.type==='patrol')f.patrol=action.enabled;else{f.route=p.route.slice(1);f.progress=0;f.dockId=null;f.targetId=action.portId;f.status='sailing';}}
  event(w,p.reason,p.details.join(' '));
}
export function applyNaval(world:World,state:Navy,graph:SeaGraph,action:NavalAction,expected:StateVersion,portAccess:PortAccess39=()=>true){
  if(expected.day!==world.day||expected.nextEventId!==world.nextEventId)throw Error('世界已变化，请重新预览海军命令。');
  const preview=previewNaval(world,state,graph,action,portAccess);if(!preview.valid)throw Error(preview.reason);
  const w=structuredClone(world),navy=structuredClone(state);perform(w,navy,graph,action,preview);return {world:w,navy};
}
export function initialNavy(world:World,graph:SeaGraph){
  const w=structuredClone(world),navy:Navy={version:1,fleets:[]};
  for(const n of w.nations){const ports=graph.ports.filter(p=>owned(w,p,n.id)).sort((a,b)=>w.statecraft!.provinces.find(p=>p.provinceId===b.provinceId)!.grain-w.statecraft!.provinces.find(p=>p.provinceId===a.provinceId)!.grain);for(const p of ports){const action:NavalAction={type:'build-fleet',nationId:n.id,portId:p.id,ships:1},preview=previewNaval(w,navy,graph,action);if(preview.valid){perform(w,navy,graph,action,preview);break;}}}return {world:w,navy};
}
/** Before daily land economy: real provisioning debit, ration consumption and
 * segmented navigation. Enemy-held ports cannot supply or teleport a fleet. */
export function advanceNavy(world:World,state:Navy,graph:SeaGraph,move=true,portAccess:PortAccess39=()=>true){
  const w=structuredClone(world),navy=structuredClone(state);
  for(const f of navy.fleets){
    if(f.status==='lost')continue;
    const dock=graph.ports.find(p=>p.id===f.dockId);
    if(dock&&!owned(w,dock,f.nationId,portAccess)){f.dockId=null;f.status='anchored';event(w,`${f.name}离港待命`,'母港已非本国控制；停留在港外海格，无法取得该港补给。');}
    if(f.dockId&&dock){const l=w.statecraft!.provinces.find(p=>p.provinceId===dock.provinceId)!;const amount=Math.max(0,Math.min(f.crew*RATION_DAYS-f.food,l.grain-l.population*10));l.grain-=amount;f.food+=amount;}
    const starving=f.food<f.crew;f.food=Math.max(0,f.food-f.crew);
    if(starving){f.crew=Math.max(0,f.crew-Math.max(1,Math.floor(f.crew*.05)));if(f.crew===0){f.status='lost';event(w,`${f.name}因断粮损失`,'全部船员耗尽，舰队停止航行。');continue;}}
    if(!move||f.status!=='sailing')continue;
    let budget=NAVAL_SPEED*(starving?.5:1);
    while(f.route.length){const link=graph.nodes.get(f.node)!.links.find(e=>e.to===f.route[0])!,remaining=link.distance-f.progress;if(budget<remaining){f.progress+=budget;break;}budget-=remaining;f.node=f.route.shift()!;f.progress=0;}
    if(!f.route.length){const target=graph.ports.find(p=>p.id===f.targetId)!;f.dockId=owned(w,target,f.nationId,portAccess)?target.id:null;f.status=f.dockId?'docked':'anchored';f.targetId=null;event(w,`${f.name}抵达${portName(w,target)}`,f.dockId?'已完成逐海格航行，下次日结从港口补粮。':'目的港已易主，停在港外等待命令，无法取得敌港补给。');}
  }
  return {world:w,navy};
}
/** Fractional movement consumes distance only. Rations are charged at the
 * day boundary; exactly one day's food permits full speed for that day. */
export function moveNavy(world:World,state:Navy,graph:SeaGraph,fraction:number,portAccess:PortAccess39=()=>true){
  // Movement touches fleet records and appends events only. Geography and
  // the economy remain unchanged until the daily settlement.
  const w={...world,events:[...world.events]},navy=structuredClone(state);
  for(const f of navy.fleets){
    if(f.status!=='sailing')continue;
    let budget=NAVAL_SPEED*fraction*(f.food<f.crew?.5:1);
    while(f.route.length){const link=graph.nodes.get(f.node)!.links.find(e=>e.to===f.route[0])!,remaining=link.distance-f.progress;if(budget<remaining){f.progress+=budget;break;}budget-=remaining;f.node=f.route.shift()!;f.progress=0;}
    if(!f.route.length){const target=graph.ports.find(p=>p.id===f.targetId)!;f.dockId=owned(w,target,f.nationId,portAccess)?target.id:null;f.status=f.dockId?'docked':'anchored';f.targetId=null;event(w,`${f.name}抵达${portName(w,target)}`,'日内海路完成；下一次日结补粮。');}
  }return {world:w,navy};
}
export function previewRealtimeNaval(w:World,navy:Navy,graph:SeaGraph,action:NavalAction,portAccess:PortAccess39=()=>true):NavalPreview {
  const f=action.type==='sail'?navy.fleets.find(f=>f.id===action.fleetId):undefined;
  if(!f?.route.length)return previewNaval(w,navy,graph,action,portAccess);
  const copy=structuredClone(navy),fleet=copy.fleets.find(v=>v.id===f.id)!;
  fleet.node=f.route[0];fleet.route=[];fleet.progress=0;fleet.dockId=null;fleet.targetId=null;fleet.status='anchored';
  const p=previewNaval(w,copy,graph,action,portAccess);if(!p.valid)return p;
  if(p.route.includes(f.node))return {...p,valid:false,reason:'航路需要原地折返，请先驶出当前海段。'};
  const route=[f.node,...p.route],distance=routeDistance(graph,route)-f.progress,days=Math.max(1,Math.ceil(distance/NAVAL_SPEED));
  if(f.food<f.crew*(days+3))return {...p,valid:false,reason:'当前海段与新路线的余粮不足。'};
  return {...p,route,days,reason:'保持当前位置，走完当前海段后转向目的港。',details:[`实际剩余海路 ${Math.round(distance)} 单位，约 ${days} 日。`,'途中改令保留当前海段进度，不瞬移或穿陆。']};
}
export function applyRealtimeNaval(world:World,state:Navy,graph:SeaGraph,action:NavalAction,expected:StateVersion,portAccess:PortAccess39=()=>true){
  if(expected.day!==world.day||expected.nextEventId!==world.nextEventId)throw Error('世界已变化，请重新预览海军命令。');
  const p=previewRealtimeNaval(world,state,graph,action,portAccess);if(!p.valid)throw Error(p.reason);
  const w=structuredClone(world),navy=structuredClone(state),old=action.type==='sail'?state.fleets.find(f=>f.id===action.fleetId):undefined;
  perform(w,navy,graph,action,p);if(old?.route.length)navy.fleets.find(f=>f.id===old.id)!.progress=old.progress;
  return {world:w,navy};
}
const exact=(v:object,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function assertNavy(state:unknown,world:World,graph:SeaGraph):asserts state is Navy {
  const fail=()=>{throw Error('海军数据或海路引用损坏，已保留原档。');};
  const n=state as Navy;if(!n||n.version!==1||!exact(n,['version','fleets'])||!Array.isArray(n.fleets)||n.fleets.length>200)fail();
  const seen=new Set<string>();
  for(const f of n.fleets){
    if(!f||!exact(f,['id','name','nationId','ships','crew','food','node','route','progress','dockId','targetId','patrol','status'])||typeof f.id!=='string'||f.id.length>100||!f.id||seen.has(f.id)||typeof f.name!=='string'||!f.name||f.name.length>100||!world.nations.some(n=>n.id===f.nationId)||!Number.isInteger(f.ships)||f.ships<1||f.ships>5||!Number.isInteger(f.crew)||f.crew<0||f.crew>f.ships*CREW_PER_SHIP||!Number.isSafeInteger(f.food)||f.food<0||f.food>f.ships*CREW_PER_SHIP*RATION_DAYS||!Number.isInteger(f.node)||!graph.nodes.get(f.node)?.ocean||!Array.isArray(f.route)||f.route.length>graph.nodes.size||!Number.isFinite(f.progress)||f.progress<0||typeof f.patrol!=='boolean'||!['docked','sailing','anchored','lost'].includes(f.status))fail();seen.add(f.id);
    const route=[f.node,...f.route];for(let i=1;i<route.length;i++)if(!Number.isInteger(route[i])||!graph.nodes.get(route[i-1])?.links.some(e=>e.to===route[i]))fail();
    if(new Set(route).size!==route.length)fail();
    const dock=graph.ports.find(p=>p.id===f.dockId),target=graph.ports.find(p=>p.id===f.targetId);
    if((f.dockId!==null&&!dock)||(f.targetId!==null&&!target)||(dock&&dock.node!==f.node)||(target&&target.node!==route.at(-1)))fail();
    if((f.status==='docked'&&(!dock||target||f.route.length))||(f.status==='sailing'&&(!target||dock))||(f.status==='anchored'&&(dock||target||f.route.length))||(f.status==='lost')!==(f.crew===0))fail();
    if(f.route.length?f.progress>=graph.nodes.get(f.node)!.links.find(e=>e.to===f.route[0])!.distance:f.progress!==0)fail();
  }
}
