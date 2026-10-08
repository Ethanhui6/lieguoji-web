import type {World} from '../../sim/types';
import type {MovingForce47} from './force-motion47';
import type {TravelCell47} from './army-travel47-graph';
import type {TerrainContext} from './settlement25-terrain';
import type {ForceClock47} from './force-clock47';
import {isUnitKey,unitProfile,type UnitAssignments} from './military-profile';
import {nativeArmyMovementSpeed} from './native-war/army-path';

type ArmySpeed47={nationAtInitialization:string;initializedTick:number;cavalryTradition:boolean;base:number};
export type ForceSpeed47={version:1;basis:'native-speed-web-map-v1';mapUnitsPerNativeUnit:1;biomePolicy:'neutral-unrecovered-v1';armies:Record<string,ArmySpeed47>};
const f=Math.fround;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
/** Army.Init 34C720: one persistent instance draw, not a Cavalry unit rule.
 * Hash-to-draw is a deterministic WEB source, not Unity's global RNG. */
export function initializedArmySpeed47(seed:string,armyId:string,nationId:string,tick:number,cavalryTradition:boolean):ArmySpeed47{
  if(!armyId||!nationId||!Number.isSafeInteger(tick)||tick<0||typeof cavalryTradition!=='boolean')throw Error('军队初始化速度来源无效。');
  let h=2166136261;for(const c of JSON.stringify([seed,armyId,nationId,tick,'army-speed47']))h=Math.imul(h^c.charCodeAt(0),16777619);
  const draw=f((h>>>0)/4294967296),ordinary=f(f(f(.7)+f(f(f(1.1)-f(.7))*draw))*f(1.5));
  return {nationAtInitialization:nationId,initializedTick:tick,cavalryTradition,base:cavalryTradition?f(1.9499999284744263):ordinary};
}
/** No real culture implies a cavalry tradition. The current founding rule
 * has none; an explicit future state-trait command must own that lifecycle. */
export function initialForceSpeed47(world:World,tick:number):ForceSpeed47{
  const state:ForceSpeed47={version:1,basis:'native-speed-web-map-v1',mapUnitsPerNativeUnit:1,biomePolicy:'neutral-unrecovered-v1',armies:{}};
  for(const a of world.armies)state.armies[a.id]=initializedArmySpeed47(world.custom!.seed,a.id,a.nationId,tick,false);
  assertForceSpeed47(state,world,tick);return state;
}
export function assertForceSpeed47(s:ForceSpeed47,world:World,tick:number){
  const fail=()=>{throw Error('军队速度快照或网页换算规则无效，原世界保留。');};
  if(!exact(s,['version','basis','mapUnitsPerNativeUnit','biomePolicy','armies'])||s.version!==1||s.basis!=='native-speed-web-map-v1'||s.mapUnitsPerNativeUnit!==1||s.biomePolicy!=='neutral-unrecovered-v1'||!exact(s.armies,world.armies.map(a=>a.id))||!Number.isSafeInteger(tick)||tick<0)return fail();
  for(const [id,row] of Object.entries(s.armies)){
    if(!exact(row,['nationAtInitialization','initializedTick','cavalryTradition','base'])||!world.nations.some(n=>n.id===row.nationAtInitialization)||!Number.isSafeInteger(row.initializedTick)||row.initializedTick<0||row.initializedTick>tick||typeof row.cavalryTradition!=='boolean'||row.base!==initializedArmySpeed47(world.custom!.seed,id,row.nationAtInitialization,row.initializedTick,row.cavalryTradition).base)return fail();
  }
}
type SpeedRun47={forceSpeed:ForceSpeed47;forceClock:ForceClock47;terrainContext:TerrainContext;units:UnitAssignments};
/** Actual current cell, never Army.provinceId/target/renderer position.
 * One native speed unit is explicitly interpreted as one normalized WEB map
 * unit. Unity-to-map scale is NOT measured; no camera or document scale here.
 * Ordinary biome speed is explicitly neutral until its source table is known.
 * All forces use the same saved scaled-seconds/tick as their attack clocks. */
export function actualForceSpeed47(r:SpeedRun47,force:Readonly<MovingForce47>,cell:Readonly<TravelCell47>):number{
  const s=r.forceSpeed,seconds=r.forceClock.secondsPerTick;
  if(s.basis!=='native-speed-web-map-v1'||s.mapUnitsPerNativeUnit!==1||s.biomePolicy!=='neutral-unrecovered-v1'||!Number.isFinite(seconds)||seconds<1e-8||seconds>1)throw Error('统一行军单位缺失。');
  if(force.kind==='fleet'){if(cell.surface!=='sea')throw Error('舰队不能在陆地行军。');return f(2.2)*s.mapUnitsPerNativeUnit*seconds;}
  const row=s.armies[force.id],key=r.units[force.id];if(!row||!isUnitKey(key))throw Error('实际军队缺少保存的速度或兵种。');
  const land=cell.surface==='land'?r.terrainContext.provinces[cell.provinceId!]:null;if(cell.surface==='land'&&!land)throw Error('实际军队所在陆地缺少地貌。');
  const value=nativeArmyMovementSpeed({base:row.base,onLand:cell.surface==='land',unitMultiplier:unitProfile(key).speed,mountain:land?.mountain,plateau:land?.plateau,biomeMultiplier:1});
  return value*s.mapUnitsPerNativeUnit*seconds;
}
