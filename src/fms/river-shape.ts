import { FMS_SEA_LEVEL, type FmsDocument, type FmsPoint } from './model';
import { clipFmsRiverSegments } from './river-geometry';

export const FMS_RIVER_SHAPE = 'recovered-meander-native-taper-land-clip-v1';
export const FMS_RIVER_MAX_FLOATS = 3_000_000;
export interface FmsRiverShape {
  /** Non-indexed triangles, ready for one GPU mesh; never stored in a world. */
  positions:Float32Array;
  stats:{algorithm:string;paths:number;curves:number;mouths:number;triangles:number;bytes:number};
}
const lerp=(a:FmsPoint,b:FmsPoint,t:number):FmsPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const distance=(a:FmsPoint,b:FmsPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:FmsPoint,b:FmsPoint,p:FmsPoint)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);

/** Active installed JS addMeandering, land-source branch (step starts at 10).
 * The graph and endpoint positions are supplied by the web adapter. */
export function recoveredRiverMidpoint(a:FmsPoint,b:FmsPoint,edge:number,pathLength:number):FmsPoint|undefined {
  const d=distance(a,b);if(!d||(d*d<=25&&pathLength>=6))return;
  const step=10+edge,amount=.5+1/step+Math.max(.5-step/100,0);
  return [(a[0]+b[0])/2-(b[1]-a[1])/d*amount,(a[1]+b[1])/2+(b[0]-a[0])/d*amount];
}
/** DrawSingleRiver 0x4e97b0: point thickness, not JS discharge/width metadata.
 * World-to-Unity/prefab scale is not recovered: web maps one unit to one map unit. */
export function recoveredRiverThickness(i:number,count:number):number {
  const f=Math.fround,base=f(.7);
  return f(f(f(i*f(base/count))+base)*1.5);
}
/** BuildRiverPath 0x4e5840 uses normalized next-minus-previous tangents.
 * .ctor default curveAmount=.5; serialized scene overrides remain unverified. */
export function recoveredRiverControls(points:readonly FmsPoint[],i:number):[FmsPoint,FmsPoint] {
  const a=points[i],b=points[i+1],length=distance(a,b);
  const handle=(at:number,sign:number):FmsPoint=>{
    const p=points[at];if(at===0||at===points.length-1)return [...p];
    const before=points[at-1],after=points[at+1],d=distance(before,after);
    return d?[p[0]+sign*(after[0]-before[0])/d*length*.5,p[1]+sign*(after[1]-before[1])/d*length*.5]:[...p];
  };
  return [handle(i,1),handle(i+1,-1)];
}
function cubic(a:FmsPoint,c:FmsPoint,d:FmsPoint,b:FmsPoint,t:number):FmsPoint {
  const s=1-t;return [0,1].map(k=>s*s*s*a[k]+3*s*s*t*c[k]+3*s*t*t*d[k]+t*t*t*b[k]) as FmsPoint;
}
/** Sutherland-Hodgman against a convex land part of the actual float32 mesh.
 * Clipping the whole ribbon (including joins), not only its centerline, prevents
 * thick curves painting into water on small islands and narrow land bridges. */
function intersect(subject:FmsPoint[],clip:readonly FmsPoint[]):FmsPoint[] {
  let result=subject;
  for(let i=0;i<clip.length&&result.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=result;result=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=0)result.push(p);
      if((dp>=0)!==(dq>=0))result.push(lerp(p,q,dp/(dp-dq)));
    }
  }
  return result;
}
function landTriangle(doc:FmsDocument,t:number):FmsPoint[] {
  const ids=Array.from(doc.triangles.slice(t,t+3)),result:FmsPoint[]=[];
  for(let j=0;j<3;j++){
    const i=ids[j],k=ids[(j+1)%3],a=doc.points[i].map(Math.fround) as FmsPoint,b=doc.points[k].map(Math.fround) as FmsPoint,ha=doc.elevations[i],hb=doc.elevations[k];
    if(ha>=FMS_SEA_LEVEL)result.push(a);
    if((ha>=FMS_SEA_LEVEL)!==(hb>=FMS_SEA_LEVEL))result.push(lerp(a,b,(FMS_SEA_LEVEL-ha)/(hb-ha)));
  }
  if(result.length>=3&&cross(result[0],result[1],result[2])<0)result.reverse();
  return result;
}
/** Derives display geometry in the climate Worker. Original accepted paths,
 * meander points, cubic tangent rule and thickness ramp are reused. Mouths use
 * the web's h20 intersections instead of original Voronoi shared-edge middles.
 * Web adaptation: ribbons are clipped to actual adjacent land triangles; no
 * erosion, new drainage edges, sea bridges or changes to rainfall/moisture. */
export function deriveFmsRiverShape(doc:FmsDocument,paths:readonly (readonly number[])[]):FmsRiverShape {
  const stars:number[][]=Array.from({length:doc.points.length},()=>[]),land=new Map<number,FmsPoint[]>();
  const coastal=new Uint8Array(doc.points.length);
  for(let t=0;t<doc.triangles.length;t+=3){
    if([0,1,2].some(k=>doc.elevations[doc.triangles[t+k]]<=FMS_SEA_LEVEL))for(let k=0;k<3;k++)coastal[doc.triangles[t+k]]=1;
    const polygon=landTriangle(doc,t);if(polygon.length<3)continue;land.set(t,polygon);
    for(let k=0;k<3;k++)stars[doc.triangles[t+k]].push(t);
  }
  const output:number[]=[];let curves=0,mouths=0,pathCount=0,work=0;
  const emit=(polygon:FmsPoint[],support:number[])=>{
    const minX=Math.min(...polygon.map(p=>p[0])),maxX=Math.max(...polygon.map(p=>p[0])),minY=Math.min(...polygon.map(p=>p[1])),maxY=Math.max(...polygon.map(p=>p[1]));
    for(const id of support){
      if(++work>8_000_000)throw Error('河道显示超出本次计算预算，请使用高度视图。');
      const clip=land.get(id)!;
      if(clip.every(p=>p[0]<minX)||clip.every(p=>p[0]>maxX)||clip.every(p=>p[1]<minY)||clip.every(p=>p[1]>maxY))continue;
      const p=intersect(polygon,clip);
      for(let k=1;k+1<p.length;k++)if(Math.abs(cross(p[0],p[k],p[k+1]))>1e-10){output.push(...p[0],...p[k],...p[k+1]);}
      if(output.length>Math.min(FMS_RIVER_MAX_FLOATS,doc.points.length*768))throw Error('河道显示超出本次内存预算，请使用高度视图。');
    }
  };
  for(const path of paths){
    const pairs:[number,number][]=[];for(let i=1;i<path.length;i++)if(path[i-1]>=0&&path[i]>=0)pairs.push([path[i-1],path[i]]);
    const lines=clipFmsRiverSegments(doc,pairs);if(!lines.length)continue;pathCount++;
    const points:FmsPoint[]=[lines[0].a],owners:number[]=[];
    for(let i=0;i<lines.length;i++){
      const {a,b,mouth}=lines[i];if(mouth)mouths++;
      // Freeze curves in the mixed-height coastal ring: keep thin isthmuses
      // connected and mouths fixed. Only inland geometry is meandered.
      const mid=coastal[lines[i].from]||coastal[lines[i].to]?undefined:recoveredRiverMidpoint(a,b,i,path.length);
      if(mid){points.push(mid);owners.push(i);}points.push(b);owners.push(i);
    }
    const samples:FmsPoint[]=[points[0]],sampleOwners:number[]=[];
    for(let i=0;i+1<points.length;i++){
      const a=points[i],b=points[i+1],owner=lines[owners[i]];
      const [c,d]=coastal[owner.from]||coastal[owner.to]?[a,b]:recoveredRiverControls(points,i);curves++;
      // Native interpolation count is round(length+6), clamped 6..12.
      // Uniform map-unit sampling is an explicit web scale adaptation.
      const count=Math.min(12,Math.max(6,Math.round(distance(a,b)+6)));
      for(let k=1;k<=count;k++){samples.push(k===count?b:cubic(a,c,d,b,k/count));sampleOwners.push(owners[i]);}
    }
    const support=lines.map(({from,to})=>Array.from(new Set([...stars[from],...stars[to]])));
    const left:FmsPoint[]=[],right:FmsPoint[]=[];
    for(let i=0;i<samples.length;i++){
      const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],d=distance(a,b),r=recoveredRiverThickness(i,samples.length)/2;
      const nx=d?-(b[1]-a[1])/d*r:0,ny=d?(b[0]-a[0])/d*r:0;
      left.push([samples[i][0]+nx,samples[i][1]+ny]);right.push([samples[i][0]-nx,samples[i][1]-ny]);
    }
    for(let i=0;i+1<samples.length;i++){
      const s=support[sampleOwners[i]];
      emit([left[i],right[i],left[i+1]],s);emit([right[i],right[i+1],left[i+1]],s);
    }
  }
  const positions=Float32Array.from(output);
  return {positions,stats:{algorithm:FMS_RIVER_SHAPE,paths:pathCount,curves,mouths,triangles:positions.length/6,bytes:positions.byteLength}};
}
