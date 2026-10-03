import type { FmsDocument, FmsPoint } from '../../src/fms/model';
import { linearCoastMetrics } from './fms-coast-metrics';

type Vertex={p:FmsPoint;h:number;key:string};
const area=(p:Vertex[])=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.p[0]*b.p[1]-a.p[1]*b.p[0];},0))/2;
function polygons(doc:FmsDocument,land:boolean,round=true){
  const result:Vertex[][]=[];
  for(let t=0;t<doc.triangles.length;t+=3){const ids=Array.from(doc.triangles.slice(t,t+3)),poly:Vertex[]=[];
    for(let j=0;j<3;j++){
      const i=ids[j],k=ids[(j+1)%3],a:Vertex={p:round?doc.points[i].map(Math.fround) as FmsPoint:doc.points[i],h:doc.elevations[i],key:`v${i}`};
      const b:Vertex={p:round?doc.points[k].map(Math.fround) as FmsPoint:doc.points[k],h:doc.elevations[k],key:`v${k}`};
      const inside=(h:number)=>land?h>=20:h<20;
      if(inside(a.h))poly.push(a);
      if(inside(a.h)!==inside(b.h)){const f=(20-a.h)/(b.h-a.h);poly.push({p:[a.p[0]+f*(b.p[0]-a.p[0]),a.p[1]+f*(b.p[1]-a.p[1])],h:20,
        key:a.h===20?a.key:b.h===20?b.key:`e${Math.min(i,k)}:${Math.max(i,k)}`});}
    }
    result.push(poly.filter((p,i)=>p.key!==poly[(i+poly.length-1)%poly.length].key));
  }
  return result;
}
function turningEnergy(doc:FmsDocument,round=true){
  const graph=new Map<string,{p:FmsPoint;next:Set<string>}>();
  for(const polygon of polygons(doc,true,round)){
    const contour=polygon.filter(p=>p.h===20);if(contour.length!==2||contour[0].key===contour[1].key)continue;
    const[a,b]=contour;for(const v of [a,b])if(!graph.has(v.key))graph.set(v.key,{p:v.p,next:new Set()});
    graph.get(a.key)!.next.add(b.key);graph.get(b.key)!.next.add(a.key);
  }
  let sum=0;for(const {p,next}of graph.values()){if(next.size!==2)continue;const[a,b]=[...next].map(k=>graph.get(k)!.p);
    const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],length=Math.hypot(ax,ay)*Math.hypot(bx,by);
    if(length)sum+=Math.acos(Math.max(-1,Math.min(1,-(ax*bx+ay*by)/length)))**2;
  }return sum;
}
/** Independent clipping and polygon-edge connectivity. No production metrics
 * or displacement-gradient implementation is used. Also measure singular
 * values of the affine deformation, not only source/target signed areas. */
export function measureFmsSmoothing(before:FmsDocument,after:FmsDocument,sectionX=205,roundBefore=true){
  let maxComponentAreaFraction=0,minStretch=1,maxStretch=1,flippedFaces=0,maxFaceAreaFraction=0,componentCount=0;
  const components:{land:boolean;before:number;after:number;fraction:number}[]=[];
  for(const land of [true,false]){
    const a=polygons(before,land,roundBefore),b=polygons(after,land),areas=a.map(area),next=a.map(()=>new Set<number>()),edges=new Map<string,number>();
    a.forEach((polygon,id)=>{if(!areas[id])return;for(let j=0;j<polygon.length;j++){
      const p=polygon[j],q=polygon[(j+1)%polygon.length];if(p.key===q.key||Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1])===0)continue;
      const key=[p.key,q.key].sort().join('/'),other=edges.get(key);
      if(other===undefined)edges.set(key,id);else {next[id].add(other);next[other].add(id);}
    }});
    const seen=new Set<number>();for(let id=0;id<a.length;id++){if(!areas[id]||seen.has(id))continue;
      let oldArea=0,newArea=0;const queue=[id];seen.add(id);
      for(let at=0;at<queue.length;at++){const face=queue[at];oldArea+=areas[face];newArea+=area(b[face]);for(const n of next[face])if(!seen.has(n)){seen.add(n);queue.push(n);}}
      const fraction=Math.abs(newArea/oldArea-1);components.push({land,before:oldArea,after:newArea,fraction});componentCount++;
      maxComponentAreaFraction=Math.max(maxComponentAreaFraction,fraction);
    }
  }
  const determinant=(p:FmsPoint,q:FmsPoint)=>p[0]*q[1]-p[1]*q[0],difference=(p:FmsPoint,q:FmsPoint):FmsPoint=>[p[0]-q[0],p[1]-q[1]];
  for(let t=0;t<before.triangles.length;t+=3){
    const ids=Array.from(before.triangles.slice(t,t+3)),p=ids.map(i=>roundBefore?before.points[i].map(Math.fround) as FmsPoint:before.points[i]),q=ids.map(i=>after.points[i].map(Math.fround) as FmsPoint);
    const a=difference(p[1],p[0]),b=difference(p[2],p[0]),c=difference(q[1],q[0]),d=difference(q[2],q[0]),D=determinant(a,b),ratio=determinant(c,d)/D;
    if(ratio<=0)flippedFaces++;maxFaceAreaFraction=Math.max(maxFaceAreaFraction,Math.abs(ratio-1));
    const F=[(c[0]*b[1]-d[0]*a[1])/D,(-c[0]*b[0]+d[0]*a[0])/D,(c[1]*b[1]-d[1]*a[1])/D,(-c[1]*b[0]+d[1]*a[0])/D];
    const trace=F.reduce((sum,v)=>sum+v*v,0),disc=Math.sqrt(Math.max(0,trace*trace-4*ratio*ratio));
    minStretch=Math.min(minStretch,Math.sqrt(Math.max(0,(trace-disc)/2)));maxStretch=Math.max(maxStretch,Math.sqrt((trace+disc)/2));
  }
  const a=linearCoastMetrics(before,before.elevations,sectionX,roundBefore),b=linearCoastMetrics(after,after.elevations,sectionX);let maxCoastDisplacement=0,missingCrossings=0;
  for(const[key,p]of a.crossings){const q=b.crossings.get(key);if(!q)missingCrossings++;else maxCoastDisplacement=Math.max(maxCoastDisplacement,Math.hypot(p[0]-q[0],p[1]-q[1]));}
  return {maxCoastDisplacement,missingCrossings,componentCount,components,maxComponentAreaFraction,minStretch,maxStretch,flippedFaces,maxFaceAreaFraction,
    sectionBefore:a.sectionIntervals,sectionAfter:b.sectionIntervals,landAreaBefore:a.landArea,landAreaAfter:b.landArea,
    turningEnergyBefore:turningEnergy(before,roundBefore),turningEnergyAfter:turningEnergy(after)};
}
