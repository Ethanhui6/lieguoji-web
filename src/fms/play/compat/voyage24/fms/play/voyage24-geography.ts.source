import type {World} from '../../sim/types';
import {seaRoute,routeDistance,type SeaGraph,type Port} from './sea-path';
const landCache=new WeakMap<SeaGraph,Map<string,string>>();
/** Physical land connectivity, independent of current sovereignty. */
export function landComponents(w:World,g:SeaGraph){let known=landCache.get(g);if(known)return known;known=new Map();const byId=new Map(w.provinces.map(p=>[p.id,p]));for(const p of w.provinces)if(!known.has(p.id)){const queue=[p.id];known.set(p.id,p.id);for(let i=0;i<queue.length;i++)for(const id of byId.get(queue[i])!.neighbors)if(!known.has(id)){known.set(id,p.id);queue.push(id);}}landCache.set(g,known);return known;}
export function coastalContact(w:World,g:SeaGraph,a:string,b:string){const owners=new Map(w.provinces.map(p=>[p.id,p.controller])),seas=new Set(g.ports.filter(p=>owners.get(p.provinceId)===a).map(p=>g.nodes.get(p.node)!.component));return g.ports.some(p=>owners.get(p.provinceId)===b&&seas.has(g.nodes.get(p.node)!.component));}
export function overseasRoutes(w:World,g:SeaGraph,nationId:string,enemy:(id:string)=>boolean){
 const lands=landComponents(w,g),owners=new Map(w.provinces.map(p=>[p.id,p.controller])),starts=g.ports.filter(p=>owners.get(p.provinceId)===nationId),ends=g.ports.filter(p=>enemy(owners.get(p.provinceId)!));
 const candidates:{from:Port;to:Port;distance:number}[]=[];
 for(const from of starts){const water=g.nodes.get(from.node)!;for(const to of ends)if(lands.get(from.provinceId)!==lands.get(to.provinceId)&&g.nodes.get(to.node)!.component===water.component){candidates.push({from,to,distance:Math.hypot(from.shore.x-to.shore.x,from.shore.y-to.shore.y)});}}
 candidates.sort((a,b)=>a.distance-b.distance||a.from.id.localeCompare(b.from.id)||a.to.id.localeCompare(b.to.id));
 // A bounded shortlist of coast pairs; no fake straight-line sea fallback.
 return candidates.slice(0,12).flatMap(c=>{const route=seaRoute(g,c.from.node,c.to.node);return route?[{...c,route,distance:routeDistance(g,route)}]:[];}).sort((a,b)=>a.distance-b.distance);
}
