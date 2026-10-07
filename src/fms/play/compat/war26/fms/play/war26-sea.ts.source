import type {World} from '../../sim/types';
import {seaRoute,routeDistance,type SeaGraph,type Port} from './sea-path';
import {landComponents} from './voyage24-geography';
import {war26Distances,type War26State} from './war26-state';
/** Filter the landing-to-goal land corridor BEFORE the bounded sea shortlist. */
export function war26SeaRoutes(w:World,g:SeaGraph,nationId:string,state:War26State,enemy:(id:string)=>boolean){
 const distances=war26Distances(w,state,nationId),lands=landComponents(w,g),owners=new Map(w.provinces.map(p=>[p.id,p.controller])),starts=g.ports.filter(p=>owners.get(p.provinceId)===nationId),ends=g.ports.filter(p=>enemy(owners.get(p.provinceId)!)&&distances.has(p.provinceId));
 const candidates:{from:Port;to:Port;distance:number;landSteps:number}[]=[];
 for(const from of starts){const water=g.nodes.get(from.node)!;for(const to of ends)if(lands.get(from.provinceId)!==lands.get(to.provinceId)&&g.nodes.get(to.node)!.component===water.component)candidates.push({from,to,distance:Math.hypot(from.shore.x-to.shore.x,from.shore.y-to.shore.y),landSteps:distances.get(to.provinceId)!});}
 candidates.sort((a,b)=>a.landSteps-b.landSteps||a.distance-b.distance||a.from.id.localeCompare(b.from.id)||a.to.id.localeCompare(b.to.id));
 return candidates.slice(0,12).flatMap(c=>{const route=seaRoute(g,c.from.node,c.to.node);return route?[{...c,route,distance:routeDistance(g,route)}]:[];}).sort((a,b)=>a.landSteps-b.landSteps||a.distance-b.distance);
}
