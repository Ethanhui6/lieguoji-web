import type {FmsDocument} from '../model';
import {FmsClimateError} from './terrain13-climate/climate';
/** Exact v13 drainage calculations, without allocating display triangles.
 * Only v25 initialization uses this data-only path; old engines stay frozen. */
export function settlementRiverData(doc:FmsDocument,precipitation:Uint8Array){
  const count=doc.points.length;
  if(precipitation.length!==count||!(precipitation instanceof Uint8Array))throw new FmsClimateError();
  const height=Uint8Array.from(doc.elevations,h=>Math.min(100,Math.max(0,h)));
  const coastDistance=new Int16Array(count),haven=new Int32Array(count).fill(-1),queue:number[]=[];
  for(let i=0;i<count;i++)if(height[i]>=20){
    let nearest=Infinity;
    for(const j of doc.neighbors[i])if(height[j]<20){
      coastDistance[i]=1;
      const d=(doc.points[i][0]-doc.points[j][0])**2+(doc.points[i][1]-doc.points[j][1])**2;
      if(d<nearest){nearest=d;haven[i]=j;}
    }
    if(coastDistance[i])queue.push(i);
  }else coastDistance[i]=-1;
  for(let head=0;head<queue.length;head++){
    const i=queue[head];
    for(const j of doc.neighbors[i])if(!coastDistance[j]&&height[j]>=20){coastDistance[j]=Math.min(127,coastDistance[i]+1);queue.push(j);}
  }
  // Border is derived from the displayed mesh, not guessed by point ordering.
  const edges=new Map<string,{a:number;b:number;count:number}>(),border=new Uint8Array(count);
  for(let t=0;t<doc.triangles.length;t+=3)for(let k=0;k<3;k++){
    const a=Math.min(doc.triangles[t+k],doc.triangles[t+(k+1)%3]),b=Math.max(doc.triangles[t+k],doc.triangles[t+(k+1)%3]),key=`${a}:${b}`,edge=edges.get(key);
    if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
  for(const edge of edges.values())if(edge.count===1){border[edge.a]=1;border[edge.b]=1;}
  const altered=Float64Array.from(height,(h,i)=>h<20||coastDistance[i]<1?h:h+coastDistance[i]/100+doc.neighbors[i].reduce((s,j)=>s+coastDistance[j],0)/doc.neighbors[i].length/10000);
  // Original FIFO fill, including float32 writes, is deliberately not replaced
  // with the web priority flood. No source heights are changed or saved.
  const routingHeight=new Float32Array(count).fill(100000),visited=new Uint8Array(count);queue.length=0;
  for(let i=0;i<count;i++){
    if(height[i]<20){routingHeight[i]=altered[i];visited[i]=1;}
    else if(haven[i]>=0){routingHeight[i]=altered[i];visited[i]=1;queue.push(i);}
  }
  for(let head=0;head<queue.length;head++){
    const i=queue[head];for(const j of doc.neighbors[i])if(height[j]>=20&&!visited[j]){
      routingHeight[j]=Math.max(routingHeight[i]+1e-5,altered[j]);visited[j]=1;queue.push(j);
    }
  }
  const flux=new Uint16Array(count),activeRiver=new Uint16Array(count),confluence=new Uint8Array(count),receiver=new Int32Array(count).fill(-1);
  const paths:number[][]=[[]];let overflowWrites=0;
  const addFlux=(i:number,value:number)=>{const next=flux[i]+value;if(next>=65536)overflowWrites++;flux[i]=next;};
  const land=Array.from({length:count},(_,i)=>i).filter(i=>height[i]>=20).sort((a,b)=>routingHeight[b]-routingHeight[a]);
  for(const i of land){
    addFlux(i,precipitation[i]/4**.25);
    if(border[i]&&activeRiver[i]){paths[activeRiver[i]].push(-1);continue;}
    let to=haven[i];
    if(to<0){to=doc.neighbors[i][0];for(const j of doc.neighbors[i])if(routingHeight[j]<routingHeight[to])to=j;}
    if(routingHeight[i]<=routingHeight[to])continue;
    receiver[i]=to;
    if(flux[i]<30){if(height[to]>=20)addFlux(to,flux[i]);continue;}
    if(!activeRiver[i]){activeRiver[i]=paths.length;paths.push([i]);}
    const river=activeRiver[i],toFlux=flux[to]-confluence[to];
    if(activeRiver[to]){
      if(flux[i]>toFlux){confluence[to]+=flux[to];activeRiver[to]=river;}
      else confluence[to]+=flux[i];
    }else activeRiver[to]=river;
    if(height[to]>=20)addFlux(to,flux[i]);
    paths[river].push(to);
  }
  // Only accepted paths (>=3 entries, including a sea/off-map terminal) can
  // give moisture. Tiny discarded paths must not leave invisible river ids.
  const riverIds=new Uint16Array(count),segments:[number,number][]=[],seen=new Set<string>();let riverCount=0;
  for(let id=1;id<paths.length;id++){
    const path=paths[id];if(path.length<3)continue;riverCount++;
    for(const cell of path)if(cell>=0&&height[cell]>=20&&!riverIds[cell])riverIds[cell]=id;
    for(let n=1;n<path.length;n++){
      const a=path[n-1],b=path[n];if(a<0||b<0||height[a]<20)continue;
      // An original river list follows drainage adjacency; reject no geometry
      // and never invent a shortcut when tributaries meet.
      const key=`${a}:${b}`;if(!seen.has(key)){seen.add(key);segments.push([a,b]);}
    }
  }
  return {flux,riverIds,receiver,routingHeight,segments,riverCount,overflowWrites};
}
