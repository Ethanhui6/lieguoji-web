import type {Point,World} from '../../sim/types';
import {seaGraph,type SeaGraph} from './sea-path';
import type {FmsDocument} from '../model';
import {landFaces,polygonArea} from './settlement25-mesh';
import type {NativeWarProvince} from './war26-native';

export type WaterProvince={id:number;faces:number[];neighbors:number[];landIds:string[];area:number;center:Point;component:number;ocean:boolean};
export type DiplomaticGeography={version:1;method:'wet-face-area-unions-v1';binding:string;landIds:string[];targetArea:number;water:WaterProvince[]};
type MapInput={terrain:FmsDocument;world:World};
const edge=(a:Point,b:Point)=>{const x=`${a.x},${a.y}`,y=`${b.x},${b.y}`;return x<y?x+'/'+y:y+'/'+x;};
// Translate before the sum: very small positive wet faces at a large world
// coordinate must not collapse to zero through cancellation.
const wetArea=(p:Point[])=>{const o=p[0];return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);},0))/2;};
/** Fast geometry identity, not an authentication checksum. The save envelope
 * additionally hashes the whole world with SHA-256; validation also verifies
 * coverage, connectivity, areas and all actual shared-edge adjacency below. */
export function geographyBinding(r:MapInput){
 const text=JSON.stringify([r.terrain.width,r.terrain.height,r.terrain.points,Array.from(r.terrain.triangles),Array.from(r.terrain.elevations),r.world.provinces.map(p=>[p.id,p.polygon,p.neighbors])]);
 let a=2166136261,b=0x9e3779b9;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),0x85ebca6b);b^=b>>>13;}
 return `${text.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
type Cluster={live:boolean;revision:number;faces:number[];area:number;x:number;y:number;adjacent:Map<number,number>};
type Merge={a:number;b:number;ar:number;br:number;cost:number};
class Queue{
 private data:Merge[]=[];
 private less(a:Merge,b:Merge){return a.cost<b.cost||a.cost===b.cost&&(a.a<b.a||a.a===b.a&&a.b<b.b);}
 push(v:Merge){let i=this.data.push(v)-1;while(i){const p=(i-1)>>1;if(!this.less(v,this.data[p]))break;this.data[i]=this.data[p];i=p;}this.data[i]=v;}
 pop(){const first=this.data[0],last=this.data.pop();if(!this.data.length)return first;let i=0;while(i*2+1<this.data.length){let c=i*2+1;if(c+1<this.data.length&&this.less(this.data[c+1],this.data[c]))c++;if(!this.less(this.data[c],last!))break;this.data[i]=this.data[c];i=c;}this.data[i]=last!;return first;}
}
/** Every positive-length coast segment, including inland lakes. Never derive
 * diplomatic adjacency from the transport graph's ocean-only port shortlist. */
function contacts(r:MapInput,g:SeaGraph){
 const owners=new Map<string,string>();for(const p of r.world.provinces)for(let i=0;i<p.polygon.length;i++){const key=edge(p.polygon[i],p.polygon[(i+1)%p.polygon.length]);if(owners.has(key))owners.delete(key);else owners.set(key,p.id);}
 // Verify coastal coverage against the same clipped land faces, including
 // h20 edges. A zero-area h20 ridge has no land face and creates no owner.
 // Legacy geometry that cannot be mapped exactly remains playable in its
 // old version; do not manufacture a nearest city or silently omit shores.
 const landBoundary=new Set<string>(),scale=1000/Math.max(r.terrain.width,r.terrain.height);
 for(const f of landFaces(r.terrain))for(let i=0;i<f.ring.length;i++){
  const a=f.ring[i],b=f.ring[(i+1)%f.ring.length],key=edge({x:a.x*scale,y:a.y*scale},{x:b.x*scale,y:b.y*scale});
  if(landBoundary.has(key))landBoundary.delete(key);else landBoundary.add(key);
 }
 const result=new Map<number,Set<string>>();for(const n of g.nodes.values())for(let i=0;i<n.polygon.length;i++){
  const a=n.polygon[i],b=n.polygon[(i+1)%n.polygon.length];if(a.x===b.x&&a.y===b.y)continue;
  const key=edge(a,b);if(!landBoundary.has(key))continue;const id=owners.get(key);
  if(!id)throw Error('当前辖区海岸与地形边界无法精确对应，未建立新版外交；原存档仍可继续。');
  const ids=result.get(n.id)??new Set<string>();ids.add(id);result.set(n.id,ids);
 }return result;
}
/** Web water-province partition: merge real connected wet faces to roughly
 * the existing mean LAND province area. This does not recover the original
 * generator or claim equal sea distances. Holes retain their actual member
 * faces; no convex hull, moved coast, land replacement or extra city is used. */
export function buildDiplomaticGeography(r:MapInput):DiplomaticGeography{
 const g=seaGraph(r.terrain,r.world),nodes=[...g.nodes.values()],indices=new Map(nodes.map((n,i)=>[n.id,i]));
 const landIds=r.world.provinces.map(p=>p.id),targetArea=r.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0)/landIds.length;
 if(!(targetArea>0)||!Number.isFinite(targetArea))throw Error('陆地分区面积无效，未建立外交海域。');
 const clusters:Cluster[]=nodes.map(n=>({live:true,revision:0,faces:[n.id],area:wetArea(n.polygon),x:n.center.x,y:n.center.y,adjacent:new Map()}));
 const wetEdges=new Map<string,{index:number;a:Point;b:Point}>();
 nodes.forEach((n,i)=>n.polygon.forEach((a,k)=>{const b=n.polygon[(k+1)%n.polygon.length],key=edge(a,b),old=wetEdges.get(key);if(old){const length=Math.hypot(a.x-b.x,a.y-b.y);if(length>0&&n.links.some(l=>l.to===nodes[old.index].id)){clusters[i].adjacent.set(old.index,length);clusters[old.index].adjacent.set(i,length);}}else wetEdges.set(key,{index:i,a,b});}));
 const components=new Set(nodes.map(n=>n.component)).size,total=clusters.reduce((s,c)=>s+c.area,0),countGoal=Math.min(nodes.length,Math.max(components,Math.ceil(total/targetArea))),heap=new Queue();
 const offer=(aa:number,bb:number)=>{const a=Math.min(aa,bb),b=Math.max(aa,bb),x=clusters[a],y=clusters[b],length=x.adjacent.get(b);if(!x.live||!y.live||!length)return;
  const ward=((x.x-y.x)**2+(x.y-y.y)**2)*x.area*y.area/(x.area+y.area),neck=1+Math.min(4,Math.sqrt(Math.min(x.area,y.area))/length);
  heap.push({a,b,ar:x.revision,br:y.revision,cost:ward*neck});
 };
 clusters.forEach((c,i)=>{for(const j of c.adjacent.keys())if(i<j)offer(i,j);});let count=nodes.length;
 while(count>countGoal){const e=heap.pop();if(!e)throw Error('水域连通分区无法完成，原世界未改变。');const a=clusters[e.a],b=clusters[e.b];if(!a.live||!b.live||a.revision!==e.ar||b.revision!==e.br)continue;
  const area=a.area+b.area;a.x=(a.x*a.area+b.x*b.area)/area;a.y=(a.y*a.area+b.y*b.area)/area;a.area=area;a.faces.push(...b.faces);a.revision++;b.live=false;count--;a.adjacent.delete(e.b);
  for(const [j,length]of b.adjacent){if(j===e.a)continue;const total=(a.adjacent.get(j)??0)+length;a.adjacent.set(j,total);clusters[j].adjacent.delete(e.b);clusters[j].adjacent.set(e.a,total);}
  b.adjacent.clear();for(const j of a.adjacent.keys())offer(e.a,j);
 }
 const ids=clusters.flatMap((c,i)=>c.live?[i]:[]),number=new Map(ids.map((id,i)=>[id,landIds.length+i+1])),coast=contacts(r,g);
 const water=ids.map(id=>{const c=clusters[id],first=nodes[indices.get(c.faces[0])!]!;return {id:number.get(id)!,faces:c.faces.sort((a,b)=>a-b),neighbors:[...c.adjacent.keys()].map(j=>number.get(j)!).sort((a,b)=>a-b),landIds:[...new Set(c.faces.flatMap(face=>[...(coast.get(face)??[])]))].sort(),area:c.area,center:{x:c.x,y:c.y},component:first.component,ocean:first.ocean};});
 return {version:1,method:'wet-face-area-unions-v1',binding:geographyBinding(r),landIds,targetArea,water};
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertGeographySchema(v:unknown){
 const s=v as DiplomaticGeography|undefined;
 if(unknown(s,['version','method','binding','landIds','targetArea','water'])||s?.version!=null&&s.version!==1||s?.method!=null&&s.method!=='wet-face-area-unions-v1'||Array.isArray(s?.water)&&s.water.some(c=>unknown(c,['id','faces','neighbors','landIds','area','center','component','ocean'])||unknown(c?.center,['x','y'])))throw Error('外交海域含未来规则或未知字段，已锁定读写。');
}
/** Validates saved geometry without rerunning the partitioner (no silent
 * migration). Country ownership may change; terrain/land IDs may not. */
export function assertDiplomaticGeography(s:DiplomaticGeography,r:MapInput){
 assertGeographySchema(s);const fail=()=>{throw Error('外交海域数据与实际地图不一致，已保留原档。');};
 if(!record(s)||s.version!==1||s.method!=='wet-face-area-unions-v1'||s.binding!==geographyBinding(r)||JSON.stringify(s.landIds)!==JSON.stringify(r.world.provinces.map(p=>p.id))||!Array.isArray(s.water)||!(s.targetArea>0)||!Number.isFinite(s.targetArea))return fail();
 const target=r.world.provinces.reduce((a,p)=>a+polygonArea(p.polygon),0)/s.landIds.length;if(s.targetArea!==target)return fail();
 const g=seaGraph(r.terrain,r.world),coast=contacts(r,g),byFace=new Map<number,WaterProvince>(),byId=new Map<number,WaterProvince>();
 for(const [i,c]of s.water.entries()){
  if(!record(c)||c.id!==s.landIds.length+i+1||!Array.isArray(c.faces)||!c.faces.length||!Array.isArray(c.neighbors)||!Array.isArray(c.landIds)||new Set(c.neighbors).size!==c.neighbors.length||new Set(c.landIds).size!==c.landIds.length||!record(c.center)||!Number.isFinite(c.center.x)||!Number.isFinite(c.center.y)||!Number.isFinite(c.area)||c.area<=0)return fail();
  byId.set(c.id,c);let area=0,x=0,y=0,last=-1;const land=new Set<string>();for(const id of c.faces){const n=g.nodes.get(id);if(!Number.isSafeInteger(id)||id<=last||!n||byFace.has(id)||n.component!==c.component||n.ocean!==c.ocean)return fail();last=id;byFace.set(id,c);const a=wetArea(n.polygon);area+=a;x+=n.center.x*a;y+=n.center.y*a;for(const id of coast.get(n.id)??[])land.add(id);}
  if(Math.abs(c.area-area)>Math.max(1e-7,area*1e-9)||Math.abs(c.center.x-x/area)>1e-7||Math.abs(c.center.y-y/area)>1e-7||JSON.stringify(c.landIds)!==JSON.stringify([...land].sort()))return fail();
 }
 if(byFace.size!==g.nodes.size)return fail();
 const total=[...g.nodes.values()].reduce((sum,n)=>sum+wetArea(n.polygon),0),components=new Set([...g.nodes.values()].map(n=>n.component)).size;
 if(s.water.length!==Math.min(g.nodes.size,Math.max(components,Math.ceil(total/target))))return fail();
 for(const c of s.water){const seen=new Set([c.faces[0]]),queue=[c.faces[0]],adjacent=new Set<number>();
  for(let i=0;i<queue.length;i++)for(const link of g.nodes.get(queue[i])!.links){const next=byFace.get(link.to)!;if(next!==c){adjacent.add(next.id);continue;}if(!seen.has(link.to)){seen.add(link.to);queue.push(link.to);}}
  if(seen.size!==c.faces.length||JSON.stringify(c.neighbors)!==JSON.stringify([...adjacent].sort((a,b)=>a-b))||c.neighbors.some(id=>!byId.has(id)))return fail();
 }
}

/** Adapter for the recovered province queries. It never inserts water into
 * World.provinces or nativeWars.provinceIds. Rebuild this small view after
 * ownership changes; all query results share the same stable object identity
 * during a declaration. Land IDs stay index+1, as in the existing war ledger.
 * Call only after the persisted geography has been validated on install. */
export function diplomaticProvinceView(s:DiplomaticGeography,world:World,stateNumber:(id:string)=>number){
 const numbers=new Map(s.landIds.map((id,i)=>[id,i+1])),coasts=new Map(s.landIds.map(id=>[id,[] as number[]]));
 for(const water of s.water)for(const id of water.landIds)coasts.get(id)!.push(water.id);
 const provinces:NativeWarProvince[]=world.provinces.map(p=>({id:numbers.get(p.id)!,center:numbers.get(p.id)!-1,stateId:stateNumber(p.controller),isLand:true,neighbors:[...p.neighbors.map(id=>numbers.get(id)!),...coasts.get(p.id)!]}));
 provinces.push(...s.water.map(p=>({id:p.id,center:p.id-1,stateId:0,isLand:false,neighbors:[...p.landIds.map(id=>numbers.get(id)!),...p.neighbors]})));
 const byId=new Map(provinces.map(p=>[p.id,p]));
 return {provinces,lookup:(id:number)=>{const p=byId.get(id);if(!p)throw Error('外交地理索引无效。');return p;}};
}
