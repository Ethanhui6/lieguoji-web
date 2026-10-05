import type { Point, World } from '../../compat/v0_4/sim/types';

export interface SeaTerrain { width:number; height:number; points:[number,number][]; triangles:Uint32Array; elevations:Int32Array }
export interface SeaLink { to:number; gate:Point; distance:number }
export interface SeaNode { id:number; center:Point; polygon:Point[]; links:SeaLink[]; component:number; ocean:boolean }
export interface Port { id:string; provinceId:string; node:number; shore:Point }
export interface SeaGraph { nodes:Map<number,SeaNode>; ports:Port[] }
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const midpoint=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const key=(a:Point,b:Point)=>{const x=`${a.x},${a.y}`,y=`${b.x},${b.y}`;return x<y?`${x}/${y}`:`${y}/${x}`;};
const cache=new WeakMap<SeaTerrain,{geometry:string;terrain:SeaTerrain;graph:SeaGraph}>();
const unchanged=(a:SeaTerrain,b:SeaTerrain)=>a.width===b.width&&a.height===b.height&&a.points.length===b.points.length&&a.triangles.length===b.triangles.length&&a.elevations.length===b.elevations.length&&a.points.every((p,i)=>p[0]===b.points[i][0]&&p[1]===b.points[i][1])&&a.triangles.every((v,i)=>v===b.triangles[i])&&a.elevations.every((v,i)=>v===b.elevations[i]);
/** Actual renderer triangles, clipped at h=20. Face centers connect THROUGH
 * their shared wet-edge midpoint; a direct center chord can cut across land. */
export function seaGraph(terrain:SeaTerrain,world:World):SeaGraph {
  const cached=cache.get(terrain);
  const geometry=JSON.stringify(world.provinces.map(p=>[p.id,p.polygon]));
  if(cached?.geometry===geometry&&unchanged(terrain,cached.terrain))return cached.graph;
  const scale=1000/Math.max(terrain.width,terrain.height),points=terrain.points.map(p=>({x:Math.fround(p[0]),y:Math.fround(p[1])}));
  const h=Array.from(terrain.elevations,Math.fround),nodes=new Map<number,SeaNode>();
  const edges=new Map<string,{ids:number[];a:number;b:number}>(),coasts:{node:number;a:Point;b:Point}[]=[];
  const scaled=(p:Point)=>({x:p.x*scale,y:p.y*scale});
  const crossing=(a:number,b:number)=>{if(a>b)[a,b]=[b,a];if(h[a]===20)return points[a];if(h[b]===20)return points[b];const t=(20-h[a])/(h[b]-h[a]);return {x:points[a].x+(points[b].x-points[a].x)*t,y:points[a].y+(points[b].y-points[a].y)*t};};
  for(let offset=0;offset<terrain.triangles.length;offset+=3){
    const ids=Array.from(terrain.triangles.slice(offset,offset+3)),id=offset/3,ring:{p:Point;shore:boolean}[]=[];
    for(let i=0;i<3;i++){
      const a=ids[i],b=ids[(i+1)%3],ek=a<b?`${a}/${b}`:`${b}/${a}`,e=edges.get(ek);
      if(e){e.ids.push(id);if(e.ids.length>2)throw Error('海路网格存在重叠边，已取消生成。');}else edges.set(ek,{ids:[id],a,b});
      if(h[a]<20)ring.push({p:points[a],shore:false});
      if((h[a]<20)!==(h[b]<20))ring.push({p:crossing(a,b),shore:true});
    }
    if(ring.length<3)continue;
    const polygon=ring.map(v=>scaled(v.p)),origin=polygon[0],area=Math.abs(polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length];return s+(a.x-origin.x)*(b.y-origin.y)-(a.y-origin.y)*(b.x-origin.x);},0));
    if(area<=0)continue;
    const center={x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};
    nodes.set(id,{id,center,polygon,links:[],component:-1,ocean:false});
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a.shore&&b.shore&&distance(a.p,b.p)>0)coasts.push({node:id,a:scaled(a.p),b:scaled(b.p)});}
  }
  const exterior=new Set<number>();
  for(const e of edges.values()){
    if(h[e.a]>=20&&h[e.b]>=20)continue; // Includes a h20/h20 ridge and zero-width point contact.
    const a=h[e.a]<20?points[e.a]:crossing(e.a,e.b),b=h[e.b]<20?points[e.b]:crossing(e.a,e.b);
    if(distance(a,b)<=0)continue;
    const gate=scaled(midpoint(a,b)),[left,right]=e.ids.map(id=>nodes.get(id));
    const onBoundary=(a.x===0&&b.x===0)||(a.y===0&&b.y===0)||(a.x===Math.fround(terrain.width)&&b.x===Math.fround(terrain.width))||(a.y===Math.fround(terrain.height)&&b.y===Math.fround(terrain.height));
    if(e.ids.length===1&&left&&onBoundary)exterior.add(left.id);
    if(!left||!right)continue;
    const cost=distance(left.center,gate)+distance(gate,right.center);
    left.links.push({to:right.id,gate,distance:cost});right.links.push({to:left.id,gate,distance:cost});
  }
  let component=0;
  for(const start of nodes.values())if(start.component<0){const queue=[start];start.component=component;let ocean=false;for(let i=0;i<queue.length;i++){const n=queue[i];ocean||=exterior.has(n.id);for(const link of n.links){const next=nodes.get(link.to)!;if(next.component<0){next.component=component;queue.push(next);}}}for(const n of queue)n.ocean=ocean;component++;}
  const owners=new Map<string,string>();
  for(const p of world.provinces)for(let i=0;i<p.polygon.length;i++)owners.set(key(p.polygon[i],p.polygon[(i+1)%p.polygon.length]),p.id);
  const best=new Map<string,{port:Port;length:number}>();
  for(const coast of coasts){const n=nodes.get(coast.node)!,provinceId=owners.get(key(coast.a,coast.b));if(!provinceId||!n.ocean)continue;const id=`port-${provinceId}-${n.component}`,length=distance(coast.a,coast.b);if(length>(best.get(id)?.length??0))best.set(id,{length,port:{id,provinceId,node:n.id,shore:midpoint(coast.a,coast.b)}});}
  const graph={nodes,ports:[...best.values()].map(v=>v.port)};cache.set(terrain,{geometry,terrain:{width:terrain.width,height:terrain.height,points:terrain.points.map(p=>[...p]),triangles:terrain.triangles.slice(),elevations:terrain.elevations.slice()},graph});return graph;
}

/** Dijkstra heap. Paths store real triangle IDs; every rendered segment remains
 * in one convex water face. Disconnected seas never get a straight-line fallback. */
export function seaRoute(graph:SeaGraph,start:number,target:number):number[]|null {
  const first=graph.nodes.get(start),last=graph.nodes.get(target);if(!first||!last||first.component!==last.component)return null;
  const costs=new Map([[start,0]]),previous=new Map<number,number>(),heap:{id:number;cost:number}[]=[];
  const push=(v:{id:number;cost:number})=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].cost<=v.cost)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const top=heap[0],tail=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(heap[c].cost>=tail.cost)break;heap[i]=heap[c];i=c;}heap[i]=tail;}return top;};
  push({id:start,cost:0});while(heap.length){const {id,cost}=pop();if(cost!==costs.get(id))continue;if(id===target){const route=[id];while(route[0]!==start)route.unshift(previous.get(route[0])!);return route;}for(const link of graph.nodes.get(id)!.links){const next=cost+link.distance;if(next<(costs.get(link.to)??Infinity)){costs.set(link.to,next);previous.set(link.to,id);push({id:link.to,cost:next});}}}return null;
}
export function seaRoutePoints(graph:SeaGraph,route:number[]):Point[]{const points:Point[]=[];route.forEach((id,i)=>{if(i)points.push(graph.nodes.get(route[i-1])!.links.find(e=>e.to===id)!.gate);points.push(graph.nodes.get(id)!.center);});return points;}
export function routeDistance(graph:SeaGraph,route:number[]){return route.slice(1).reduce((sum,id,i)=>sum+graph.nodes.get(route[i])!.links.find(e=>e.to===id)!.distance,0);}
