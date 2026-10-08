import type {Point} from '../../../sim/types';
const f=Math.fround;
/** Current Windows IL2CPP build, ArmyPathfinding 0x7FDC10/0x803180/
 * 0x802F90 and Army.GetSpeed 0x34BC00. These are scalar contracts, not a
 * claim that web triangles reproduce native cells or native A* tie ordering. */
export function nativeArmyCellDistance(a:Point,b:Point):number{
 const dx=Math.abs(f(f(a.x)-f(b.x))),dy=Math.abs(f(f(a.y)-f(b.y)));
 return f(f(dx+dy)+f(Math.min(dx,dy)*f(-.5859999656677246)));
}
export function nativeArmyRouteCost(distance:number,seaRoute:boolean,preferPorts:boolean,crossesShore:boolean,seaCellInPort:boolean):number{
 if(!Number.isFinite(distance)||distance<0)throw Error('行军路径距离无效。');
 const move=Math.max(f(.05),f(f(distance)*(seaRoute?f(.02):1)));
 const value=f(move+(preferPorts&&crossesShore&&!seaCellInPort?450:0));
 if(!Number.isFinite(value))throw Error('行军路径代价溢出。');return value;
}
export type NativeArmySpeedInput={base:number;onLand:boolean;unitMultiplier?:number;mountain?:boolean;plateau?:boolean;biomeMultiplier?:number};
/** Sea ignores the land unit multiplier; mountainous/plateau provinces replace
 * the biome modifier. Base speed and real-time scale are caller inputs: their
 * initialization has not been recovered here. Current false Douyin stub only. */
export function nativeArmyMovementSpeed(v:NativeArmySpeedInput):number{
 if(!Number.isFinite(v.base)||v.base<0||[v.unitMultiplier,v.biomeMultiplier].some(n=>n!==undefined&&!Number.isFinite(n)))throw Error('军队移动速度输入无效。');
 const base=f(v.base),unit=Math.max(f(.05),f(v.unitMultiplier??1));
 const value=!v.onLand?f(base*f(1.5)):v.mountain?f(f(base*f(.5))*unit):v.plateau?f(f(base*f(.7))*unit):v.biomeMultiplier!==undefined?f(f(base*f(v.biomeMultiplier))*unit):f(base*unit);
 if(!Number.isFinite(value)||value<0)throw Error('军队移动速度无效。');return value;
}
