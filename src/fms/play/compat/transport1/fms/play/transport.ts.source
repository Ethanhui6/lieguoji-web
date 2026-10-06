import type {Army,World,StateVersion} from '../../sim/types';
import type {FmsRun} from './world';
import {createMilitaryCore} from './military-core';
import type {UnitKey,UnitAssignments} from './military-profile';
import {unitProfiles} from './military-profile';
import {NAVAL_SPEED,portName,type Navy,type NavalPreview} from './navy';
import {seaRoute,routeDistance,type SeaGraph} from './sea-path';
import {nationsAtWar} from './realtime-statecraft';
import {underSiege} from './occupation';
import {mobilize} from './mobilization';

export interface Cargo {fleetId:string;army:Army;unit:UnitKey;fromPortId:string;targetPortId:string|null}
export interface Transports {version:1;cargo:Cargo[]}
export type TransportAction={type:'embark';fleetId:string;armyId:string}|{type:'voyage';fleetId:string;portId:string}|{type:'land';fleetId:string};
export type ExpeditionRun=Extract<FmsRun,{version:7}>;
export const initialTransports=():Transports=>({version:1,cargo:[]});
export function recruitmentLimit(r:ExpeditionRun,nationId:string){
  if(r.world.armies.length+r.transports.cargo.length>=500)return '陆上与运输中的军团合计已达到历史上限。';
  const land=r.world.armies.filter(a=>a.nationId===nationId&&a.status!=='destroyed'&&a.troops>0).length;
  if(land+r.transports.cargo.filter(c=>c.army.nationId===nationId).length>=30)return '本国陆上与运输中的军团已达到30支编制上限。';
  return '';
}
const log=(w:World,text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind:'system',text,reason});w.events=w.events.slice(-160);};
const allowed=(w:World,nation:string,province:string)=>{const p=w.provinces.find(p=>p.id===province);return !!p&&(p.controller===nation||nationsAtWar(w,nation,p.controller));};
export function previewTransport(r:ExpeditionRun,g:SeaGraph,a:TransportAction):NavalPreview{
  const no=(reason:string):NavalPreview=>({valid:false,reason,details:[],route:[],days:0});
  const f=r.navy.fleets.find(f=>f.id===a.fleetId&&f.status!=='lost'),cargo=r.transports.cargo.find(c=>c.fleetId===a.fleetId),w=r.world;
  if(!f)return no('舰队不存在或已损失。');
  if(a.type==='embark'){
    const army=w.armies.find(v=>v.id===a.armyId),p=g.ports.find(p=>p.id===f.dockId);
    if(cargo)return no('这支舰队已搭载一支军团。');
    if(!army||army.nationId!==f.nationId||army.status!=='idle'||army.progress!==0||army.troops<=0)return no('只能搭载本国驻守中的军团；请先到沿海集结并结束战斗。');
    if(!p||f.status!=='docked'||f.route.length||army.provinceId!==p.provinceId||!w.provinces.some(v=>v.id===p.provinceId&&v.controller===f.nationId)||underSiege(w,p.provinceId))return no('军团与舰队须在同一本国、安全沿海港口集结。');
    if(army.troops>f.ships*1000)return no(`运力不足：${f.ships} 艘可载 ${f.ships*1000} 人，这支军团有 ${army.troops} 人。请编成更大的舰队。`);
    return {valid:true,reason:`${army.name}登上${f.name}。`,details:['保留兵种、军团编号、兵力和军粮；从陆上地图移除，不再在出发地作战或补员。',`网页运输规则：每艘运力 1000 人，当前 ${army.troops}/${f.ships*1000} 人；自动巡航停止。`],route:[],days:0};
  }
  if(!cargo)return no('请先在本国港口搭载陆军。');
  if(a.type==='voyage'){
    if(f.route.length||f.progress!==0)return no('运输途中请先完成当前航路，再改变目的岸。');
    const p=g.ports.find(p=>p.id===a.portId);if(!p||!allowed(w,f.nationId,p.provinceId))return no('只能驶向本国或交战国家的海岸；和平国家未授予军事通行。');
    const route=seaRoute(g,f.node,p.node);if(!route)return no('两地外海不连通，无法跨越陆地或内陆湖。');
    const days=Math.max(1,Math.ceil(routeDistance(g,route)/NAVAL_SPEED));
    if(f.food<f.crew*(days+3))return no(`预计航行 ${days} 日，船员需另留三日口粮；请先回本国港口补给。`);
    const rationDays=cargo.army.supplies/6;
    return {valid:true,reason:`运送${cargo.army.name}前往${portName(w,p)}。`,details:[`沿真实海路约 ${days} 日；到岸后仍需确认登陆。`,...(rationDays<days+3?[`军团自带粮约 ${Math.floor(rationDays)} 日，低于航程与三日储备。若断粮，每日损失2%兵员和5点士气；可取消本命令，先回本国岸上补粮。`]:[]),'途中停战或海岸易主时，登陆会重新检查外交关系；不会自动宣战或直接占领。'],route,days};
  }
  if(a.type!=='land')return no('未知运输命令。');
  const p=g.ports.find(p=>p.id===(cargo.targetPortId??cargo.fromPortId));
  if(!p||f.route.length||f.progress!==0||f.node!==p.node)return no('尚未抵达指定海岸，不能登陆。');
  if(!allowed(w,f.nationId,p.provinceId))return no('此岸现属于和平国家，禁止登陆；部队继续留船，可改航本国港口。');
  return {valid:true,reason:`${cargo.army.name}在${portName(w,p)}登陆。`,details:['恢复同一支军团与剩余军粮。敌岸登陆后仍需击退守军并持续围攻；不会直接吞并。'],route:[],days:0};
}
export function applyTransport(r:ExpeditionRun,g:SeaGraph,a:TransportAction,expected:StateVersion&{tick?:number}):ExpeditionRun{
  if(expected.day!==r.world.day||expected.nextEventId!==r.world.nextEventId||expected.tick!==r.clock.tick)throw Error('模拟时刻已变化，请重新预览运输命令。');
  const p=previewTransport(r,g,a);if(!p.valid)throw Error(p.reason);
  const n=structuredClone(r),assignments:Record<string,UnitKey>={...n.units};n.units=assignments;const f=n.navy.fleets.find(f=>f.id===a.fleetId)!,cargo=n.transports.cargo.find(c=>c.fleetId===a.fleetId);
  if(a.type==='embark'){const army=n.world.armies.find(v=>v.id===a.armyId)!;n.transports.cargo.push({fleetId:f.id,army,unit:n.units[army.id],fromPortId:f.dockId!,targetPortId:null});n.world.armies=n.world.armies.filter(v=>v.id!==army.id);delete assignments[army.id];delete n.battles.plans[army.id];f.patrol=false;}
  else if(a.type==='voyage'){cargo!.targetPortId=a.portId;f.route=p.route.slice(1);f.progress=0;f.targetId=a.portId;f.dockId=null;f.status='sailing';f.patrol=false;}
  else {const port=g.ports.find(p=>p.id===(cargo!.targetPortId??cargo!.fromPortId))!;n.world.armies.push({...cargo!.army,provinceId:port.provinceId,route:[],progress:0,status:'idle'});assignments[cargo!.army.id]=cargo!.unit;n.transports.cargo=n.transports.cargo.filter(c=>c.fleetId!==f.id);}
  log(n.world,p.reason,p.details.join(' '));return n;
}
/** Count passengers for quotas only during mobilization. The temporary marching
 * records never enter movement, combat, supply, occupation, rendering or saves. */
export function mobilizeWithCargo(w:World,units:UnitAssignments,state:Transports){
  const ids=new Set(state.cargo.map(c=>c.army.id));
  const formed=mobilize({...w,armies:[...w.armies,...state.cargo.map(c=>({...c.army,provinceId:'@transport/'+c.fleetId,status:'marching' as const,route:[]}))]}, {...units,...Object.fromEntries(state.cargo.map(c=>[c.army.id,c.unit]))});
  formed.world.armies=formed.world.armies.filter(a=>!ids.has(a.id));for(const id of ids)delete formed.units[id];return formed;
}
export function provisionCargo(w:World,navy:Navy,units:UnitAssignments,state:Transports){
  const world=structuredClone(w),transports=structuredClone(state),assignments={...units};
  for(const c of transports.cargo){const fleet=navy.fleets.find(f=>f.id===c.fleetId)!;
    c.army.supplies=Math.max(0,c.army.supplies-6);
    if(c.army.supplies===0){const loss=Math.min(c.army.troops,Math.max(1,Math.ceil(c.army.troops*.02)));c.army.troops-=loss;c.army.morale=Math.max(0,c.army.morale-5);log(world,`${c.army.name}运输途中断粮，损失 ${loss} 人`,'陆军自带口粮每日消耗6点；没有获得出发港的隔海补给。');}
    if(fleet.status==='lost'||c.army.troops<=0){world.armies.push({...c.army,troops:0,status:'destroyed',route:[],progress:0});assignments[c.army.id]=c.unit;log(world,`${c.army.name}在海上损失`,fleet.status==='lost'?'运输舰队船员耗尽，所载军团损失并保留历史编号。':'运输部队因断粮耗尽；不会以满编重新出现。');}
  }
  transports.cargo=transports.cargo.filter(c=>!world.armies.some(a=>a.id===c.army.id));return {world,transports,units:assignments};
}
export function assertTransports(value:unknown,r:Omit<ExpeditionRun,'transports'>,g:SeaGraph):asserts value is Transports{
  const s=value as Transports,fail=()=>{throw Error('运输状态或搭载引用损坏，已保留原档。');};
  if(!s||s.version!==1||Object.keys(s).sort().join()!=='cargo,version'||!Array.isArray(s.cargo)||s.cargo.length>200)fail();
  const ids=new Set(r.world.armies.map(a=>a.id)),fleets=new Set<string>();
  for(const c of s.cargo){
    if(!c||Object.keys(c).sort().join()!=='army,fleetId,fromPortId,targetPortId,unit'||!c.army)fail();
    const f=r.navy.fleets.find(f=>f.id===c.fleetId),origin=g.ports.find(p=>p.id===c.fromPortId);
    if(!f||f.status==='lost'||f.patrol||fleets.has(f.id)||!origin||c.army.provinceId!==origin.provinceId||c.army.nationId!==f.nationId||c.army.status!=='idle'||c.army.progress!==0||c.army.route.length||c.army.troops<=0||c.army.troops>f.ships*1000||ids.has(c.army.id)||!unitProfiles.some(u=>u.key===c.unit)||(c.targetPortId!==null&&!g.ports.some(p=>p.id===c.targetPortId)))fail();
    ids.add(c.army.id);fleets.add(f!.id);
    const target=g.ports.find(p=>p.id===(c.targetPortId??c.fromPortId));
    if(f!.status==='sailing'?(c.targetPortId!==f!.targetId):(!target||f!.node!==target.node))fail();
  }
  if(ids.size>500||!createMilitaryCore({...r.units,...Object.fromEntries(s.cargo.map(c=>[c.army.id,c.unit]))},true,true).validateWorld({...r.world,armies:[...r.world.armies,...s.cargo.map(c=>c.army)]}))fail();
}
