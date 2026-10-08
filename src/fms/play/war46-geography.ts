import {seaGraph,type SeaGraph,type SeaTerrain,type Port} from './sea-path';
import {harborCells42} from './war42-harbor';
import type {Point,World} from '../../sim/types';
export type HarborSite46={id:string;provinceId:string;capitalId:string;capitalCell:number;anchor:number;shore:Point;component:number;seeds:number[];cells:number[]};
export type HarborLayout46={version:1;method:'capital-neighbor-v1'|'preserved-anchor-v1';sites:HarborSite46[]};
type Input={terrain:SeaTerrain;world:World;harbors:HarborLayout46};
const key=(a:Point,b:Point)=>{const x=`${a.x},${a.y}`,y=`${b.x},${b.y}`;return x<y?x+'/'+y:y+'/'+x;};
const inside=(p:Point,ring:Point[])=>{const signs=ring.map((a,i)=>{const b=ring[(i+1)%3];return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);});return signs.every(x=>x>=-1e-8)||signs.every(x=>x<=1e-8);};
/** Recovered 4116A0/4143A0/41BF80: qualified capital-adjacent sea seeds,
 * depth-five wet expansion, FIRST qualified seed as anchor, same feature.
 * Adapter: capital's containing renderer triangle and its edge neighbors stand
 * for native cells. Twenty WET TRIANGLES is not twenty native Voronoi cells.
 * Stable triangle enumeration replaces native HashSet enumeration. */
export function buildHarbors46(r:Pick<Input,'terrain'|'world'>,method:HarborLayout46['method']='capital-neighbor-v1'):HarborLayout46{
 const g=seaGraph(r.terrain,r.world),sites:HarborSite46[]=[];
 if(method==='preserved-anchor-v1')return {version:1,method,sites:g.ports.map(p=>({id:p.id,provinceId:p.provinceId,capitalId:r.world.cities.find(c=>c.provinceId===p.provinceId)!.id,capitalCell:-1,anchor:p.node,shore:{...p.shore},component:g.nodes.get(p.node)!.component,seeds:[p.node],cells:[...harborCells42(g,p.id)]}))};
 const scale=1000/Math.max(r.terrain.width,r.terrain.height),tr=r.terrain.triangles,faces:Point[][]=[],owners=new Map<string,number>(),near=new Map<number,Set<number>>();
 for(let off=0;off<tr.length;off+=3){const id=off/3,ids=[tr[off],tr[off+1],tr[off+2]];faces.push(ids.map(i=>({x:Math.fround(r.terrain.points[i][0])*scale,y:Math.fround(r.terrain.points[i][1])*scale})));near.set(id,new Set([id]));for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],k=a<b?a+'/'+b:b+'/'+a,other=owners.get(k);if(other!==undefined){near.get(id)!.add(other);near.get(other)!.add(id);}else owners.set(k,id);}}
 const shoreOwners=new Map<string,string>();for(const p of r.world.provinces)for(let i=0;i<p.polygon.length;i++)shoreOwners.set(key(p.polygon[i],p.polygon[(i+1)%p.polygon.length]),p.id);
 const coasts=new Map<string,{node:number;shore:Point}[]>(),sizes=new Map<number,number>();
 for(const n of g.nodes.values()){sizes.set(n.component,(sizes.get(n.component)??0)+1);for(let i=0;i<n.polygon.length;i++){const a=n.polygon[i],b=n.polygon[(i+1)%n.polygon.length],owner=shoreOwners.get(key(a,b));if(owner){const rows=coasts.get(owner)??[];rows.push({node:n.id,shore:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}});coasts.set(owner,rows);}}}
 for(const province of r.world.provinces){const city=r.world.cities.find(c=>c.provinceId===province.id);if(!city)continue;const cell=faces.findIndex(f=>inside(city.position,f));if(cell<0)continue;
  const candidates=(coasts.get(province.id)??[]).filter(c=>near.get(cell)!.has(c.node)&&g.nodes.get(c.node)!.ocean&&(sizes.get(g.nodes.get(c.node)!.component)??0)>=20);
  const first=candidates[0];if(!first)continue;const component=g.nodes.get(first.node)!.component,seeds=[...new Set(candidates.filter(c=>g.nodes.get(c.node)!.component===component).map(c=>c.node))],cells=new Set(seeds),q=seeds.map(id=>({id,depth:0}));
  for(let i=0;i<q.length;i++){const {id,depth}=q[i];if(depth>=5)continue;for(const e of g.nodes.get(id)!.links){const n=g.nodes.get(e.to)!;if(n.ocean&&n.component===component&&!cells.has(n.id)){cells.add(n.id);q.push({id:n.id,depth:depth+1});}}}
  sites.push({id:`port-${province.id}-${component}`,provinceId:province.id,capitalId:city.id,capitalCell:cell,anchor:first.node,shore:first.shore,component,seeds,cells:[...cells]});
 }
 return {version:1,method,sites};
}
const graphs=new WeakMap<HarborLayout46,{terrain:SeaTerrain;graph:SeaGraph}>(),areas=new WeakMap<SeaGraph,Map<string,ReadonlySet<number>>>();
/** Layout is immutable throughout a live session. Load/create/copy validate
 * geometry completely before installing it; worker tick deltas cannot replace it. */
export function graphFor46(r:Input):SeaGraph{const old=graphs.get(r.harbors);if(old?.terrain===r.terrain)return old.graph;const base=seaGraph(r.terrain,r.world),ports:Port[]=r.harbors.sites.map(s=>({id:s.id,provinceId:s.provinceId,node:s.anchor,shore:s.shore})),graph={nodes:base.nodes,ports};areas.set(graph,new Map(r.harbors.sites.map(s=>[s.id,new Set(s.cells)])));graphs.set(r.harbors,{terrain:r.terrain,graph});return graph;}
export const areaFor46=(g:SeaGraph,id:string)=>areas.get(g)?.get(id);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function assertHarborSchema46(v:unknown){const h=v as HarborLayout46|undefined;if(object(h)&&Object.keys(h).some(k=>!['version','method','sites'].includes(k))||h?.version!=null&&h.version!==1||h?.method!=null&&!['capital-neighbor-v1','preserved-anchor-v1'].includes(h.method)||Array.isArray(h?.sites)&&h.sites.some(s=>object(s)&&Object.keys(s).some(k=>!['id','provinceId','capitalId','capitalCell','anchor','shore','component','seeds','cells'].includes(k))||object(s?.shore)&&Object.keys(s.shore).some(k=>!['x','y'].includes(k))))throw Error('港湾地理含未来规则或未知字段，已锁定读写。');}
export function assertHarbors46(r:Input){assertHarborSchema46(r.harbors);if(!r.harbors||r.harbors.version!==1||!['capital-neighbor-v1','preserved-anchor-v1'].includes(r.harbors.method)||JSON.stringify(r.harbors)!==JSON.stringify(buildHarbors46(r,r.harbors.method)))throw Error('首府港湾与实际地形不符，已保留原档。');}
