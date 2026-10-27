import {nativeBiomeSpeed} from './native-war/biome-speed';
import type {World} from '../../sim/types';
import type {MovingForce47} from './force-motion47';
import type {TravelCell47} from './army-travel47-graph';
import type {TerrainContext} from './settlement25-terrain';
import type {ForceClock47} from './force-clock47';
import {isUnitKey,unitProfile,type UnitAssignments} from './military-profile';
import {nativeArmyMovementSpeed} from './native-war/army-path';

type ArmySpeed47={nationAtInitialization:string;initializedTick:number;cavalryTradition:boolean;base:number};
/** World.Start -> SetResolution(1600,900,1) -> UpdateBounds: 240x135.
 * Map the standard native long side to the web world's normalized 1000.
 * Non-16:9 web worlds explicitly retain this long-side calibration; native
 * scale=2 and custom save day lengths are separate, not inferred from faces.
 * Delivered journals retain their byte-frozen engine. */
export const MAP_UNITS_PER_NATIVE_UNIT47=1000/240;
export type ForceSpeed47={version:2;basis:'native-standard-map-v2';mapUnitsPerNativeUnit:number;armies:Record<string,ArmySpeed47>} & ({biomePolicy:'neutral-unrecovered-v1'}|{biomePolicy:'native-biome-face-v1';faceBiomes:number[]});
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
/** The founding state's explicit trait ledger supplies the tradition;
 * legacy worlds without that ledger retain their original ordinary speeds. */
export function initialForceSpeed47(world:World,tick:number,cavalryTradition:(id:string)=>boolean=()=>false,faceBiomes?:number[]):ForceSpeed47{
  const state:ForceSpeed47={version:2,basis:'native-standard-map-v2',mapUnitsPerNativeUnit:MAP_UNITS_PER_NATIVE_UNIT47,...(faceBiomes?{biomePolicy:'native-biome-face-v1' as const,faceBiomes:[...faceBiomes]}:{biomePolicy:'neutral-unrecovered-v1' as const}),armies:{}};
  for(const a of world.armies)state.armies[a.id]=initializedArmySpeed47(world.custom!.seed,a.id,a.nationId,tick,cavalryTradition(a.nationId));
  assertForceSpeed47(state,world,tick);return state;
}
export function assertForceSpeed47(s:ForceSpeed47,world:World,tick:number){
  const fail=()=>{throw Error('军队速度快照或网页换算规则无效，原世界保留。');};
  const native=s?.biomePolicy==='native-biome-face-v1';
  if(native&&(!Array.isArray(s.faceBiomes)||!s.faceBiomes.length||Object.keys(s.faceBiomes).length!==s.faceBiomes.length||s.faceBiomes.some(id=>!Number.isInteger(id)||id<0||id>12)))return fail();
  if(!exact(s,['version','basis','mapUnitsPerNativeUnit','biomePolicy','armies',...(native?['faceBiomes']:[])])||s.version!==2||s.basis!=='native-standard-map-v2'||s.mapUnitsPerNativeUnit!==MAP_UNITS_PER_NATIVE_UNIT47||!['neutral-unrecovered-v1','native-biome-face-v1'].includes(s.biomePolicy)||!exact(s.armies,world.armies.map(a=>a.id))||!Number.isSafeInteger(tick)||tick<0)return fail();
  for(const [id,row] of Object.entries(s.armies)){
    if(!exact(row,['nationAtInitialization','initializedTick','cavalryTradition','base'])||!world.nations.some(n=>n.id===row.nationAtInitialization)||!Number.isSafeInteger(row.initializedTick)||row.initializedTick<0||row.initializedTick>tick||typeof row.cavalryTradition!=='boolean'||row.base!==initializedArmySpeed47(world.custom!.seed,id,row.nationAtInitialization,row.initializedTick,row.cavalryTradition).base)return fail();
  }
}
type SpeedRun47={forceSpeed:ForceSpeed47;forceClock:ForceClock47;terrainContext:TerrainContext;units:UnitAssignments};
/** Actual current cell, never Army.provinceId/target/renderer position.
 * One native speed unit is interpreted as 1000/240 normalized map units, for
 * movement AND voyage ration estimates. Never apply camera/document scale.
 * New original-family worlds use the recovered biome table with saved face sampling.
 * All forces use the same saved scaled-seconds/tick as their attack clocks. */
export function actualForceSpeed47(r:SpeedRun47,force:Readonly<MovingForce47>,cell:Readonly<TravelCell47>):number{
  const s=r.forceSpeed,seconds=r.forceClock.secondsPerTick;
  if(s.basis!=='native-standard-map-v2'||s.mapUnitsPerNativeUnit!==MAP_UNITS_PER_NATIVE_UNIT47||!['neutral-unrecovered-v1','native-biome-face-v1'].includes(s.biomePolicy)||!Number.isFinite(seconds)||seconds<1e-8||seconds>1)throw Error('统一行军单位缺失。');
  if(force.kind==='fleet'){if(cell.surface!=='sea')throw Error('舰队不能在陆地行军。');return f(2.2)*s.mapUnitsPerNativeUnit*seconds;}
  const row=s.armies[force.id],key=r.units[force.id];if(!row||!isUnitKey(key))throw Error('实际军队缺少保存的速度或兵种。');
  const land=cell.surface==='land'?r.terrainContext.provinces[cell.provinceId!]:null;if(cell.surface==='land'&&!land)throw Error('实际军队所在陆地缺少地貌。');
  const value=nativeArmyMovementSpeed({base:row.base,onLand:cell.surface==='land',unitMultiplier:unitProfile(key).speed,mountain:land?.mountain,plateau:land?.plateau,biomeMultiplier:s.biomePolicy==='native-biome-face-v1'&&cell.surface==='land'?nativeBiomeSpeed(s.faceBiomes[cell.face]):1});
  return value*s.mapUnitsPerNativeUnit*seconds;
}
