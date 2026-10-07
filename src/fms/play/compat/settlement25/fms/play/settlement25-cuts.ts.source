import {edgeKey,polygonArea,type Face,type Vertex} from './settlement25-mesh';
/** Bounded alternative for low city counts when bottom-up unions get stuck.
 * Split actual face sets, allocating a quota to each connected component.
 * This preserves every coast segment; it never draws a straight cut through
 * a source face or claims that a greedy failure proves a geometric minimum. */
export function cutSettlementFaces(faces:Face[],count:number):{ring:Vertex[];members:number[]}[]|null{
 const areas=faces.map(f=>polygonArea(f.ring)),points=faces.map(f=>({x:f.ring.reduce((s,p)=>s+p.x,0)/f.ring.length,y:f.ring.reduce((s,p)=>s+p.y,0)/f.ring.length}));
 function components(ids:number[]){const left=new Set(ids),out:number[][]=[];while(left.size){const first=left.values().next().value!,q=[first];left.delete(first);for(let h=0;h<q.length;h++)for(const j of faces[q[h]].neighbors)if(left.delete(j))q.push(j);out.push(q);}return out;}
 function ring(ids:number[]):Vertex[]|null{const edges=new Map<string,[Vertex,Vertex]>();for(const id of ids){const r=faces[id].ring;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],key=edgeKey(a,b);if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}
  if(edges.size<3||edges.size>200)return null;const out=new Map<string,[Vertex,Vertex]>();for(const e of edges.values()){if(out.has(e[0].key))return null;out.set(e[0].key,e);}const start=edges.values().next().value![0],result:Vertex[]=[];let p=start;while(out.has(p.key)){const [a,b]=out.get(p.key)!;result.push(a);out.delete(p.key);p=b;}return p.key===start.key&&!out.size?result:null;
 }
 let work=0;
 function allocate(groups:number[][],quota:number):number[]|null{if(groups.length>quota)return null;const counts=groups.map(()=>1),weights=groups.map(g=>g.reduce((s,i)=>s+areas[i],0));for(let n=groups.length;n<quota;n++){let best=-1;for(let i=0;i<groups.length;i++)if(counts[i]<groups[i].length&&(best<0||weights[i]/counts[i]>weights[best]/counts[best]))best=i;if(best<0)return null;counts[best]++;}return counts;}
 function divide(ids:number[],quota:number):{ring:Vertex[];members:number[]}[]|null{
  if(++work>Math.max(2048,count*32))return null;
  if(quota===1){const r=ring(ids);return r?[{ring:r,members:ids}]:null;}
  const total=ids.reduce((s,i)=>s+areas[i],0),cx=ids.reduce((s,i)=>s+points[i].x*areas[i],0)/total,cy=ids.reduce((s,i)=>s+points[i].y*areas[i],0)/total;
  let xx=0,yy=0,xy=0;for(const i of ids){const x=points[i].x-cx,y=points[i].y-cy;xx+=x*x*areas[i];yy+=y*y*areas[i];xy+=x*y*areas[i];}const angle=.5*Math.atan2(2*xy,xx-yy),leftQuota=Math.floor(quota/2);
  for(const rotate of [0,Math.PI/2]){
   const ux=Math.cos(angle+rotate),uy=Math.sin(angle+rotate),order=[...ids].sort((a,b)=>(points[a].x-points[b].x)*ux+(points[a].y-points[b].y)*uy||a-b);
   for(const adjustment of [0,-.04,.04]){
    const goal=total*(leftQuota/quota+adjustment);let sum=0,cut=0;while(cut<order.length-1&&sum<goal)sum+=areas[order[cut++]];
    let left=components(order.slice(0,cut)),right=components(order.slice(cut));
    // A centroid cut can strand one face at a jagged edge. Reattach such
    // pieces to the opposite side instead of spending a city's whole quota
    // on an artificial sliver. Original islands were separated before divide.
    if(left.length!==1||right.length!==1){const weight=(g:number[])=>g.reduce((s,i)=>s+areas[i],0);left.sort((a,b)=>weight(b)-weight(a));right.sort((a,b)=>weight(b)-weight(a));const a=[...left[0],...right.slice(1).flat()],b=[...right[0],...left.slice(1).flat()];left=components(a);right=components(b);if(left.length!==1||right.length!==1)continue;}
    const lq=allocate(left,leftQuota),rq=allocate(right,quota-leftQuota);if(!lq||!rq)continue;
    const groups=[...left,...right],quotas=[...lq,...rq],result:{ring:Vertex[];members:number[]}[]=[];let valid=true;
    for(let i=0;i<groups.length;i++){const pieces=divide(groups[i],quotas[i]);if(!pieces){valid=false;break;}result.push(...pieces);}if(valid)return result;
   }
  }return null;
 }
 const groups=components(faces.map((_,i)=>i)),quotas=allocate(groups,count);if(!quotas)return null;const result:{ring:Vertex[];members:number[]}[]=[];
 for(let i=0;i<groups.length;i++){const pieces=divide(groups[i],quotas[i]);if(!pieces)return null;result.push(...pieces);}return result;
}
