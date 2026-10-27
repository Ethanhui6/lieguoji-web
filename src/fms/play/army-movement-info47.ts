import type {FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47} from './army-travel47-state';
import {actualForceSpeed47,MAP_UNITS_PER_NATIVE_UNIT47} from './force-speed47';
import {nativeBiomeSpeed} from './native-war/biome-speed';
import {unitProfile} from './military-profile';

export function armyMovementInfo47(r:FoundingForces47,id:string){
 const frame=actualForces47(r),force=frame.forces.find(f=>f.kind==='army'&&f.id===id);if(!force)return null;
 const cell=armyTravelLocation47(force.travel,frame.spatial.graph).cell,land=cell.surface==='land'?r.terrainContext.provinces[cell.provinceId!]:null;
 const biome=r.forceSpeed.biomePolicy==='native-biome-face-v1'&&land?nativeBiomeSpeed(r.forceSpeed.faceBiomes[cell.face]):1;
 const terrain=cell.surface==='sea'?1.5:land?.mountain ? .5 : land?.plateau ? .7 : biome;
 const reason=cell.surface==='sea'?'海上':land?.mountain?'山地':land?.plateau?'高原':biome<1?'沙漠／积雪':'普通地形';
 return {speed:actualForceSpeed47(r,force,cell)/(MAP_UNITS_PER_NATIVE_UNIT47*r.forceClock.secondsPerTick),terrain,reason,unit:land?unitProfile(r.units[id]).speed:1};
}
