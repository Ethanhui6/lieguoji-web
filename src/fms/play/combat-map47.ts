import type {Graphics} from 'pixi.js';
import type {Point} from '../../sim/types';
import type {FoundingForces47} from './civilization47-forces';
import {armySpatialFor47} from './army-geography47';
import {readArmySpace47,landHolders47} from './army-space47';
import {nationsAtWar} from './realtime-statecraft';

export type CombatMarker47={id:string;kind:'contact'|'siege';point:Point;participants:number;progress:number|null};
/** Read the actual 47 contact ledger. Legacy battle/sea-contact collections
 * intentionally stay empty; neither old province anchors nor clock pulses
 * imply a hit. Group by authoritative area to avoid a marker per force pair. */
export function activeSiegeProvinces47(r:FoundingForces47):Set<string>{
 if(!r.occupation.sieges.length)return new Set();
 const space=readArmySpace47(r.world,armySpatialFor47(r));
 return new Set(r.occupation.sieges.filter(s=>{const p=r.world.provinces.find(p=>p.id===s.provinceId);return p&&landHolders47(space,p.id).some(a=>nationsAtWar(r.world,a.nationId,p.controller));}).map(s=>s.provinceId));
}
export function combatMarkers47(r:Pick<FoundingForces47,'forceContacts'|'occupation'|'world'>,activeSieges:ReadonlySet<string>):CombatMarker47[]{
 const areas=new Map<string,{x:number;y:number;count:number;forces:Set<string>}>();
 for(const p of r.forceContacts.pairs){const row=areas.get(p.area)??{x:0,y:0,count:0,forces:new Set<string>()};row.x+=(p.pointA.x+p.pointB.x)/2;row.y+=(p.pointA.y+p.pointB.y)/2;row.count++;row.forces.add(p.a);row.forces.add(p.b);areas.set(p.area,row);}
 const markers:CombatMarker47[]=[...areas].map(([id,v])=>({id,kind:'contact',point:{x:v.x/v.count,y:v.y/v.count},participants:v.forces.size,progress:null}));
 for(const s of r.occupation.sieges){const p=r.world.provinces.find(p=>p.id===s.provinceId);if(p&&activeSieges.has(p.id))markers.push({id:'siege/'+p.id,kind:'siege',point:p.center,participants:0,progress:Math.max(0,Math.min(1,1-s.resistance/s.maximum))});}
 return markers;
}
/** Pulse denotes an ongoing contact, never fabricated damage. All coordinates
 * share the real terrain transform; stopped/reduced-motion views stay still. */
export function drawCombatMarkers47(g:Graphics,markers:CombatMarker47[],mapScale:number,cameraScale:number,pulse=0){
 g.clear();const unit=1/cameraScale;
 for(const m of markers){const x=m.point.x/mapScale,y=m.point.y/mapScale;
  if(m.kind==='contact'){
   g.circle(x,y,(10+2*pulse)*unit).fill({color:0x672b28,alpha:.18}).stroke({color:0x793b35,width:1.3*unit,alpha:.6});
   g.moveTo(x-4*unit,y-4*unit).lineTo(x+4*unit,y+4*unit).moveTo(x+4*unit,y-4*unit).lineTo(x-4*unit,y+4*unit).stroke({color:0xfff1d6,width:2.5*unit});
  }else{
   g.roundRect(x-10*unit,y+10*unit,20*unit,4*unit,2*unit).fill({color:0x493f31,alpha:.8});
   g.roundRect(x-10*unit,y+10*unit,20*unit*(m.progress??0),4*unit,2*unit).fill({color:0xf3cc75,alpha:1});
  }
 }
}
