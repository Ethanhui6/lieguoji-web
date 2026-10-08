import {areaFor45} from './war45-geography';
import type {Fleet} from './navy';
import type {SeaGraph} from './sea-path';

/** PE 410640/4143A0: connected sea expansion, depth 5. The web seed is its
 * existing coastline anchor; native capital-neighbor seed selection differs.
 * This is geometry shared by occupation, deployment and visible highlighting. */
export const HARBOR_DEPTH=5;
const cache=new WeakMap<SeaGraph,Map<string,ReadonlySet<number>>>();
export function harborCells45(g:SeaGraph,portId:string):ReadonlySet<number>{
 const actual=areaFor45(g,portId);if(actual)return actual;
 let all=cache.get(g);if(!all){all=new Map();cache.set(g,all);}const old=all.get(portId);if(old)return old;
 const p=g.ports.find(p=>p.id===portId),seen=new Set<number>();if(!p)return seen;
 const component=g.nodes.get(p.node)?.component,queue:[number,number][]=[[p.node,0]];seen.add(p.node);
 for(let i=0;i<queue.length;i++){const [id,depth]=queue[i];if(depth>=HARBOR_DEPTH)continue;for(const e of g.nodes.get(id)!.links){const n=g.nodes.get(e.to);if(n?.ocean&&n.component===component&&!seen.has(e.to)){seen.add(e.to);queue.push([e.to,depth+1]);}}}
 all.set(portId,seen);return seen;
}
/** The shared wet edge gate is the physical transition between triangles. */
export function fleetSeaCell45(g:SeaGraph,f:Fleet){if(!f.route.length)return f.node;const n=g.nodes.get(f.node)!,e=n.links.find(e=>e.to===f.route[0])!;return f.progress<Math.hypot(n.center.x-e.gate.x,n.center.y-e.gate.y)?f.node:e.to;}
export const inHarbor45=(g:SeaGraph,portId:string,f:Fleet)=>harborCells45(g,portId).has(fleetSeaCell45(g,f));
export function harborRoute45(g:SeaGraph,portId:string,start:number,end:number):number[]|null{
 const area=harborCells45(g,portId);if(!area.has(start)||!area.has(end))return null;
 const q=[start],from=new Map<number,number>();from.set(start,start);
 for(let i=0;i<q.length;i++){const id=q[i];if(id===end){const out=[end];while(out[0]!==start)out.unshift(from.get(out[0])!);return out;}for(const e of g.nodes.get(id)!.links)if(area.has(e.to)&&!from.has(e.to)){from.set(e.to,id);q.push(e.to);}}
 return null;
}
export const loiterDelay45=(atWar:boolean,random:()=>number)=>atWar?0:Math.fround(Math.fround(1.8)+Math.fround(Math.fround(3.4-1.8)*Math.fround(random())));
