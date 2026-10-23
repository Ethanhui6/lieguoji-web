import type {FmsDocument} from '../model';
import type {Point,World} from '../../sim/types';
import {landFaces,polygonArea} from './settlement25-mesh';
import {contains} from './settlement25-terrain';
import {seaGraph} from './sea-path';
import {nativeArmyCellDistance,nativeArmyRouteCost} from './native-war/army-path';

export type TravelLink47={to:number;gate:Point;distance:number;toGate:number};
export type TravelCell47={id:number;face:number;surface:'land'|'sea';provinceId:string|null;center:Point;polygon:Point[];links:TravelLink47[]};
export type TravelGraph47={cells:Map<number,TravelCell47>;byProvince:Map<string,number[]>;scale:number;polygonWork:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Closed polygon membership, including a stopped shore gate. The caller's
 * persisted cell identity resolves the two valid sides of a shared boundary. */
export function insideTravelCell47(cell:TravelCell47,p:Point):boolean{
 if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
 // Reject distant cells before polygon tests and shore-distance arithmetic.
 // Compute bounds from current vertices: callers may supply mutable graphs.
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const v of cell.polygon){minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
 if(p.x<minX-1e-8||p.x>maxX+1e-8||p.y<minY-1e-8||p.y>maxY+1e-8)return false;
 if(contains(cell.polygon,p))return true;
 return cell.polygon.some((a,i)=>{const b=cell.polygon[(i+1)%cell.polygon.length],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2)):0;return distance(p,{x:a.x+t*dx,y:a.y+t*dy})<=1e-8;});
}
export function locateTravelCell47(g:TravelGraph47,p:Point,provinceId?:string):TravelCell47|null{
 let found:TravelCell47|null=null;
 const visit=(c:TravelCell47)=>{if((!found||c.id<found.id)&&insideTravelCell47(c,p))found=c;};
 if(provinceId===undefined){for(const c of g.cells.values())visit(c);}
 else for(const id of g.byProvince.get(provinceId)??[])visit(g.cells.get(id)!);
 return found;
}
const edgeKey=(a:Point,b:Point)=>{const x=`${a.x},${a.y}`,y=`${b.x},${b.y}`;return x<y?x+'/'+y:y+'/'+x;};
const sourceKey=(ids:readonly number[])=>[...ids].sort((a,b)=>a-b).join('/');
/** New-version geometry adapter. Native uses Voronoi cells; this uses the
 * actual h=20 clipped render faces. Land and sea are distinct halves of one
 * triangle and meet only through a positive-width shared edge. No sea node
 * becomes a taxable province and no port is required to cross a shoreline.
 * Caller supplies a validated immutable terrain/world, never reruns zoning. */
export function buildArmyTravelGraph47(doc:FmsDocument,world:World):TravelGraph47{
 const scale=1000/Math.max(doc.width,doc.height),cells=new Map<number,TravelCell47>(),byProvince=new Map<string,number[]>();
 const groups=world.provinces.map(p=>({p,minX:Math.min(...p.polygon.map(v=>v.x)),maxX:Math.max(...p.polygon.map(v=>v.x)),minY:Math.min(...p.polygon.map(v=>v.y)),maxY:Math.max(...p.polygon.map(v=>v.y)),area:0}));
 const bin=(v:number)=>Math.min(31,Math.max(0,Math.floor(v/1000*32))),bins=new Map<number,typeof groups>();
 for(const g of groups)for(let y=bin(g.minY);y<=bin(g.maxY);y++)for(let x=bin(g.minX);x<=bin(g.maxX);x++){const key=y*32+x,list=bins.get(key)??[];list.push(g);bins.set(key,list);}
 const sources=new Map<string,number>();for(let i=0;i<doc.triangles.length;i+=3){const k=sourceKey([...doc.triangles.slice(i,i+3)]);if(sources.has(k))throw Error('行军地形存在重复面。');sources.set(k,i/3);}
 let polygonWork=0;
 for(const face of landFaces(doc)){
  const id=sources.get(sourceKey(face.source));if(id===undefined)throw Error('行军陆面缺少真实三角引用。');
  const polygon=face.ring.map(p=>({x:p.x*scale,y:p.y*scale})),center={x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};
  const matches=(bins.get(bin(center.y)*32+bin(center.x))??[]).filter(g=>{if(center.x<g.minX||center.x>g.maxX||center.y<g.minY||center.y>g.maxY)return false;polygonWork+=g.p.polygon.length;if(polygonWork>40_000_000)throw Error('行军地理归属超出预算，已保留原世界。');return contains(g.p.polygon,center);});
  if(matches.length!==1)throw Error('行军陆面无法唯一匹配当前辖区。');const g=matches[0];g.area+=polygonArea(polygon);
  const cell:TravelCell47={id:id*2,face:id,surface:'land',provinceId:g.p.id,center,polygon,links:[]};cells.set(cell.id,cell);
  const owned=byProvince.get(g.p.id)??[];owned.push(cell.id);byProvince.set(g.p.id,owned);
 }
 for(const g of groups)if(!byProvince.has(g.p.id)||Math.abs(g.area-polygonArea(g.p.polygon))>Math.max(1e-7,g.area*1e-7))throw Error('行军陆面面积与当前辖区不一致。');
 const water=seaGraph(doc,world);
 for(const n of water.nodes.values())cells.set(n.id*2+1,{id:n.id*2+1,face:n.id,surface:'sea',provinceId:null,center:{...n.center},polygon:n.polygon.map(p=>({...p})),links:[]});
 const edges=new Map<string,{cell:TravelCell47;a:Point;b:Point;paired:boolean}>();
 for(const cell of cells.values())for(let i=0;i<cell.polygon.length;i++){
  const a=cell.polygon[i],b=cell.polygon[(i+1)%cell.polygon.length];if(distance(a,b)<=0)continue;
  const k=edgeKey(a,b),old=edges.get(k);if(!old){edges.set(k,{cell,a,b,paired:false});continue;}
  if(old.paired||old.cell.id===cell.id)throw Error('行军网格共享边重叠。');old.paired=true;
  // A shared h20/h20 edge is a dry ridge. Retain the terrain graph's
  // positive-width wet-edge decision instead of reconnecting separated seas.
  if(old.cell.surface==='sea'&&cell.surface==='sea'&&!water.nodes.get(old.cell.face)!.links.some(l=>l.to===cell.face))continue;
  const gate={x:(a.x+b.x)/2,y:(a.y+b.y)/2},left=distance(old.cell.center,gate),right=distance(cell.center,gate);
  old.cell.links.push({to:cell.id,gate,distance:left+right,toGate:left});cell.links.push({to:old.cell.id,gate,distance:left+right,toGate:right});
 }
 for(const n of cells.values())n.links.sort((a,b)=>a.to-b.to);
 return{cells,byProvince,scale,polygonWork};
}
export type TravelPolicy47={allowLand:boolean;allowSea:boolean;preferPorts:boolean;portSeaFaces:ReadonlySet<number>;oceanRouteFaces:ReadonlySet<number>;canEnter:(provinceId:string)=>boolean};
export const unrestrictedTravel47:TravelPolicy47={allowLand:true,allowSea:true,preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set(),canEnter:()=>true};
/** Native scalar weights on actual web geometry; Dijkstra is deliberate here:
 * the unscaled native octile A* heuristic is not admissible for .02 sea-route
 * edges. Native equal-cost tie order/cache are not claimed reproduced. */
export function findArmyTravelPath47(g:TravelGraph47,start:number,end:number,p:TravelPolicy47):{nodes:number[];cost:number}|null{
 return createArmyTravelSearch47(g,start,p)(end);
}
/** One immutable decision phase and origin. Continue the same ordered Dijkstra
 * frontier for successive targets; discard on any policy/geography change.
 * Settled routes retain the exact Float32 costs and equal-cost node ordering
 * (cost, then cell id): dense indices follow ascending cell id. */
export function createArmyTravelSearch47(g:TravelGraph47,start:number,p:TravelPolicy47){
 const c=compiledTravelGraph47(g),n=c.ids.length,s=c.index.get(start);
 const allowed=new Int8Array(c.provinceIds.length);
 const enter=(i:number)=>{const q=c.province[i];if(q<0)return p.allowSea;if(!p.allowLand)return false;if(!allowed[q])allowed[q]=p.canEnter(c.provinceIds[q])?1:2;return allowed[q]===1;};
 const valid=s!==undefined&&(c.province[s]<0?p.allowSea:p.allowLand);
 const plain=!p.preferPorts&&!p.oceanRouteFaces.size;
 const cost=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),settled=new Uint8Array(n);
 // Binary heap ordered by (cost, index); index order is cell id order.
 const hi:number[]=[],hc:number[]=[];
 const before=(ca:number,ia:number,cb:number,ib:number)=>ca<cb||ca===cb&&ia<ib;
 const push=(id:number,v:number)=>{let i=hi.length;hi.push(id);hc.push(v);while(i){const j=(i-1)>>1;if(!before(v,id,hc[j],hi[j]))break;hi[i]=hi[j];hc[i]=hc[j];i=j;}hi[i]=id;hc[i]=v;};
 let popId=0,popCost=0;
 const pop=()=>{popId=hi[0];popCost=hc[0];const ti=hi.pop()!,tc=hc.pop()!;const len=hi.length;if(len){let i=0;while(i*2+1<len){let j=i*2+1;if(j+1<len&&before(hc[j+1],hi[j+1],hc[j],hi[j]))j++;if(!before(hc[j],hi[j],tc,ti))break;hi[i]=hi[j];hc[i]=hc[j];i=j;}hi[i]=ti;hc[i]=tc;}};
 if(valid){cost[s]=0;push(s,0);}
 return(end:number):{nodes:number[];cost:number}|null=>{
 const e=c.index.get(end);if(!valid||e===undefined||!enter(e))return null;
 while(!settled[e]&&hi.length){pop();const a=popId;if(cost[a]!==popCost||settled[a])continue;settled[a]=1;
  // Expand even the requested target so a later query can continue from it.
  for(let k=c.start[a],last=c.start[a+1];k<last;k++){const b=c.to[k];if(settled[b]||!enter(b))continue;
   // Native weights use cell-coordinate distance, while web movement follows
   // both sides of the real gate. Keep cost units in source terrain space.
   const value=plain&&c.plainCost[k]===c.plainCost[k]?c.plainCost[k]:nativeArmyRouteCost(c.distance[k],c.seaFace[k]>=0&&p.oceanRouteFaces.has(c.seaFace[k]),p.preferPorts,c.shore[k]===1,p.portSeaFaces.has(c.portFace[k]));
   const next=Math.fround(popCost+value);if(!Number.isFinite(next))throw Error('行军路径代价溢出。');if(next<cost[b]){cost[b]=next;prev[b]=a;push(b,next);}
  }
 }
 if(!settled[e])return null;
 const nodes=[end];for(let i=e;i!==s;){i=prev[i];nodes.push(c.ids[i]);}nodes.reverse();return{nodes,cost:cost[e]};
 };
}
type CompiledTravelGraph47={size:number;ids:number[];index:Map<number,number>;province:Int32Array;provinceIds:string[];start:Int32Array;to:Int32Array;distance:Float64Array;plainCost:Float64Array;seaFace:Int32Array;portFace:Int32Array;shore:Uint8Array;links:unknown[];centers:unknown[]};
const compiled=new WeakMap<TravelGraph47,CompiledTravelGraph47>(),sealed=new WeakSet<TravelGraph47>();
/** The session geography cache deep-freezes its graphs: their compiled
 * topology is reused without rechecking every cell on each new search. */
export function sealTravelGraph47(g:TravelGraph47):void{
 if(sealed.has(g))return;
 for(const cell of g.cells.values()){for(const link of cell.links){Object.freeze(link.gate);Object.freeze(link);}Object.freeze(cell.links);Object.freeze(cell.center);for(const v of cell.polygon)Object.freeze(v);Object.freeze(cell.polygon);Object.freeze(cell);}
 for(const ids of g.byProvince.values())Object.freeze(ids);
 sealed.add(g);
}
export const travelGraphSealed47=(g:TravelGraph47)=>sealed.has(g);
/** Dense, typed copy of the static search topology. Production graphs are
 * built once and never edited; a replaced cell, link list or center (or a
 * changed cell count) recompiles an unsealed graph, so edited test graphs
 * search their edits. */
function compiledTravelGraph47(g:TravelGraph47):CompiledTravelGraph47{
 const old=compiled.get(g);
 if(old&&sealed.has(g))return old;
 if(old&&old.size===g.cells.size&&old.ids.every((id,i)=>{const cell=g.cells.get(id);return !!cell&&cell.links===old.links[i]&&cell.center===old.centers[i];}))return old;
 const ids=[...g.cells.keys()].sort((a,b)=>a-b),index=new Map(ids.map((id,i)=>[id,i])),cells=ids.map(id=>g.cells.get(id)!);
 const provinceIds:string[]=[],provinceIndex=new Map<string,number>(),province=new Int32Array(ids.length);
 cells.forEach((cell,i)=>{if(cell.surface==='sea'){province[i]=-1;return;}let q=provinceIndex.get(cell.provinceId!);if(q===undefined){q=provinceIds.length;provinceIds.push(cell.provinceId!);provinceIndex.set(cell.provinceId!,q);}province[i]=q;});
 const total=cells.reduce((sum,cell)=>sum+cell.links.length,0),start=new Int32Array(ids.length+1),to=new Int32Array(total),distance=new Float64Array(total),plainCost=new Float64Array(total),seaFace=new Int32Array(total),portFace=new Int32Array(total),shore=new Uint8Array(total);
 let k=0;
 cells.forEach((a,i)=>{start[i]=k;for(const link of a.links){const j=index.get(link.to);if(j===undefined)throw Error('行军路径格不存在。');const b=cells[j];
  to[k]=j;distance[k]=nativeArmyCellDistance({x:a.center.x/g.scale,y:a.center.y/g.scale},{x:b.center.x/g.scale,y:b.center.y/g.scale});
  seaFace[k]=b.surface==='sea'?b.face:-1;portFace[k]=(a.surface==='sea'?a:b).face;shore[k]=a.surface!==b.surface?1:0;
  plainCost[k]=Number.isFinite(distance[k])&&distance[k]>=0?nativeArmyRouteCost(distance[k],false,false,shore[k]===1,false):NaN;k++;}});
 start[ids.length]=k;
 const value={size:g.cells.size,ids,index,province,provinceIds,start,to,distance,plainCost,seaFace,portFace,shore,links:cells.map(c=>c.links),centers:cells.map(c=>c.center)};
 compiled.set(g,value);return value;
}
export function armyTravelPathPoints47(g:TravelGraph47,nodes:readonly number[]):Point[]{
 const points:Point[]=[];nodes.forEach((id,i)=>{const n=g.cells.get(id);if(!n)throw Error('行军路径格不存在。');if(i){const link=g.cells.get(nodes[i-1])!.links.find(v=>v.to===id);if(!link)throw Error('行军路径不相邻。');points.push({...link.gate});}points.push({...n.center});});return points;
}
