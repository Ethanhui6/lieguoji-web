import type {Point} from '../../sim/types';
import type {FoundingForces47} from './civilization47-forces';
import type {ArmyRouteWeights47} from './army-commands47';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47,haltArmyTravel47,redirectArmyTravelToPoint47,remainingArmyTravelPoints47} from './army-travel47-state';
import {assertForceContacts47,forceKey47,reconcileForceContactsOwned47} from './force-motion47';
import {graphFor46} from './war46-geography';
import {militaryAccess46} from './war46-access';
import {nationsAtWar} from './realtime-statecraft';
import {dailyEvent47} from './civilization47-upkeep';

export type FleetCommand47={type:'fleet-sail';fleetId:string;target:{kind:'port';id:string}|{kind:'cell';id:number}}|{type:'fleet-halt';fleetId:string};
export const fleetStamp47=(r:FoundingForces47)=>({runId:r.id,day:r.world.day,tick:r.clock.tick,nextEventId:r.world.nextEventId,binding:r.fleetPositions.binding,fleetRevision:r.fleetPositions.revision,armyRevision:r.armyPositions.revision,portRevision:r.portControl.revision});
export type FleetStamp47=ReturnType<typeof fleetStamp47>;
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const validCounter=(v:number)=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER;
function resolve(r:FoundingForces47,action:FleetCommand47,weights:ArmyRouteWeights47){
 if(!exact(action,action?.type==='fleet-halt'?['type','fleetId']:['type','fleetId','target'])||typeof action.fleetId!=='string'||!action.fleetId||!['fleet-halt','fleet-sail'].includes(action.type))throw Error('舰队军令格式无效。');
 if(action.type==='fleet-sail'&&(!exact(action.target,['kind','id'])||(action.target.kind==='port'?typeof action.target.id!=='string'||!action.target.id:action.target.kind!=='cell'||!validCounter(action.target.id))))throw Error('舰队目标格式无效。');
 if(!r.id||r.world.scenario!=='custom-world'||r.world.nextEventId<1||![r.world.day,r.clock.tick,r.world.nextEventId,r.fleetPositions.revision,r.armyPositions.revision,r.portControl.revision].every(validCounter))throw Error('舰队状态无法安全更新。');
 const {spatial,forces}=actualForces47(r),g=spatial.graph,f=r.navy.fleets.find(f=>f.id===action.fleetId&&f.status!=='lost');if(!f||!f.crew)throw Error('舰队不存在或已经失去战斗力。');
 const regions=new Map(r.diplomaticGeography.water.flatMap(p=>p.faces.map(face=>[face,p.id] as const))),region=(face:number)=>regions.get(face)!;
 assertForceContacts47(r.forceContacts,forces,g,region);
 const contact=reconcileForceContactsOwned47(forces,g,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),region);
 if(contact.held.has(forceKey47({kind:'fleet',id:f.id}))||r.maritime.retreating[f.id]>r.clock.tick)throw Error('舰队正在交锋或脱离战场，普通改令不能取消这段过程。');
 const current=r.fleetPositions.records[f.id],at=armyTravelLocation47(current,g);
 if(action.type==='fleet-halt'){
  if(['halted','arrived'].includes(current.status))throw Error('舰队已经停止航行。');
  return{f,g,travel:haltArmyTravel47(current,g),points:[at.point],portId:null,name:'当前位置'};
 }
 const sea=graphFor46(r),port=action.target.kind==='port'?sea.ports.find(p=>p.id===action.target.id):undefined;
 if(action.target.kind==='port'&&!port)throw Error('当前地图不存在这个海港。');
 const cellId=port?port.node*2+1:action.target.id as number,cell=g.cells.get(cellId);if(!cell||cell.surface!=='sea')throw Error('舰队目标必须位于真实海面。');
 if(port){const land=r.world.provinces.find(p=>p.id===port.provinceId)!;if(!militaryAccess46(r)(r.world,f.nationId,land.controller)&&!nationsAtWar(r.world,f.nationId,land.controller))throw Error('中立国家尚未授予港口通行权。');}
 const destination=port?sea.nodes.get(port.node)!.center:cell.center;
 if(current.status==='moving'&&current.version===2&&current.nodes.at(-1)===cellId&&current.destination.x===destination.x&&current.destination.y===destination.y)throw Error('舰队正在前往这个精确目标。');
 if(['arrived','halted'].includes(current.status)&&at.cell.id===cellId&&at.point.x===destination.x&&at.point.y===destination.y)throw Error('舰队已经抵达这个位置。');
 const travel=redirectArmyTravelToPoint47(current,g,cellId,destination,{...weights,allowLand:false,allowSea:true,canEnter:()=>false});if(!travel)throw Error('当前海域与目标之间没有相连的水路。');
 return{f,g,travel,points:remainingArmyTravelPoints47(travel,g),portId:port?.id??null,name:port?(r.world.cities.find(c=>c.provinceId===port.provinceId)?.name??r.world.provinces.find(p=>p.id===port.provinceId)!.name)+'港':'所选海域'};
}
export type FleetPreview47={valid:boolean;reason:string;basedOn:FleetStamp47;points:Point[];distance:number;warnings:string[]};
export function previewFleetCommand47(r:FoundingForces47,action:FleetCommand47,weights:ArmyRouteWeights47):FleetPreview47{
 const basedOn=fleetStamp47(r);try{const value=resolve(r,action,weights);return{valid:true,reason:action.type==='fleet-halt'?'停在当前位置。':`沿真实水路驶往${value.name}。`,basedOn,points:value.points,distance:value.points.reduce((n,p,i)=>i?n+Math.hypot(p.x-value.points[i-1].x,p.y-value.points[i-1].y):n,0),warnings:['航行和改令不自动补粮；实际停在安全本国港口锚点后才按日结补给。']};}
 catch(error){return{valid:false,reason:error instanceof Error?error.message:'舰令无法执行。',basedOn,points:[],distance:0,warnings:[]};}
}
/** Private candidate only; same owned core for manual and future AI orders. */
export function issueFleetOrderOwned47(r:FoundingForces47,action:FleetCommand47,weights:ArmyRouteWeights47,source:'player'|'autonomous'):void{
 if(source!=='player'&&source!=='autonomous')throw Error('舰令来源无效。');
 if(source==='autonomous'&&(r.voyages.manualFleets.includes(action.fleetId)||r.navy.fleets.find(f=>f.id===action.fleetId)?.patrol===false))throw Error('玩家控制或关闭自动调度的舰队保留当前命令。');
 if(source==='player'&&!validCounter(r.voyages.revision))throw Error('舰队接管版本已达上限。');
 const value=resolve(r,action,weights);
 // No legacy movement or fake dock assignment. Only the actual travel is
 // authoritative; food/crew/hull and contact clocks do not change here.
 r.fleetPositions.records[action.fleetId]=value.travel;r.fleetPositions.revision++;
 value.f.route=[];value.f.progress=0;value.f.dockId=null;value.f.targetId=value.portId;value.f.status=value.travel.status==='moving'?'sailing':'anchored';
 if(source==='player'){if(!r.voyages.manualFleets.includes(action.fleetId))r.voyages.manualFleets.push(action.fleetId);r.voyages.revision++;}
 dailyEvent47(r,'order',`${value.f.name}${action.type==='fleet-halt'?'停止航行':'驶往'+value.name}`,'军令从实际海面位置生效，抵达码头前不提前补粮；不依赖旧港口或城市锚点。');
 actualForces47(r);
}
export function applyFleetCommand47<T extends FoundingForces47>(r:T,action:FleetCommand47,expected:FleetStamp47,weights:ArmyRouteWeights47):T{
 const stamp=fleetStamp47(r),keys=Object.keys(stamp) as (keyof FleetStamp47)[];
 if(!exact(expected,keys)||keys.some(k=>expected[k]!==stamp[k]))throw Error('舰令预览已经过期，请重新预览并确认。');
 const {terrain,...mutable}=r,next={...structuredClone(mutable),terrain} as T;issueFleetOrderOwned47(next,action,weights,'player');return next;
}
