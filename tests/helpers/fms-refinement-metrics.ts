import type { FmsDocument, FmsPoint } from '../../src/fms/model';
import { linearCoastMetrics } from './fms-coast-metrics';
type V=readonly[number,number,number];
const cross=(a:V,b:V,c:V)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const key=(ids:number[])=>[...ids].sort((a,b)=>a-b).join(':');
function area(vertices:V[]){let sum=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];sum+=a[0]*b[1]-b[0]*a[1];}return Math.abs(sum)/2;}
function land(vertices:V[]){
  const clipped:V[]=[];
  for(let i=0;i<3;i++){const a=vertices[i],b=vertices[(i+1)%3];if(a[2]>=20)clipped.push(a);
    if((a[2]<20)!==(b[2]<20)){const t=(20-a[2])/(b[2]-a[2]);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,20]);}}
  return area(clipped);
}
/** Independent clipping, grouped by original parent identity, not triangle index.
 * Does not read algorithm stats or splits. Works with changed topology. */
export function measureFmsRefinement(before:FmsDocument,after:FmsDocument,sectionX?:number){
  const vertices=(doc:FmsDocument)=>doc.points.map(([x,y],i)=>[Math.fround(x),Math.fround(y),doc.elevations[i]] as V);
  const old=vertices(before),now=vertices(after),parents=new Map<string,{ids:number[];signed:number;land:number;total:number;children:number;afterLand:number;afterTotal:number}>();
  for(let i=0;i<before.triangles.length;i+=3){const ids=Array.from(before.triangles.slice(i,i+3)),v=ids.map(id=>old[id]);parents.set(key(ids),{ids,signed:cross(v[0],v[1],v[2]),land:land(v),total:area(v),children:0,afterLand:0,afterTotal:0});}
  let wrongOrientation=0,unknownChildren=0,maxDisplacement=0;
  for(let i=0;i<after.triangles.length;i+=3){
    const ids=Array.from(after.triangles.slice(i,i+3)),added=ids.filter(id=>id>=old.length),v=ids.map(id=>now[id]);
    const parent=parents.get(key(added.length===0?ids:after.neighbors[added[0]]));
    if(!parent||added.length>1){unknownChildren++;continue;}
    parent.children++;parent.afterLand+=land(v);parent.afterTotal+=area(v);
    if(cross(v[0],v[1],v[2])*parent.signed<=0)wrongOrientation++;
  }
  let maxLandFraction=0,maxSeaFraction=0,maxCoverageError=0,splitParents=0;
  for(const parent of parents.values()){
    maxCoverageError=Math.max(maxCoverageError,Math.abs(parent.total-parent.afterTotal));
    const change=Math.abs(parent.afterLand-parent.land);
    if(parent.land>1e-10)maxLandFraction=Math.max(maxLandFraction,change/parent.land);
    if(parent.total-parent.land>1e-10)maxSeaFraction=Math.max(maxSeaFraction,change/(parent.total-parent.land));
    if(parent.children===3)splitParents++;
  }
  for(let id=old.length;id<now.length;id++){
    const ids=after.neighbors[id],hits:FmsPoint[]=[];
    for(let j=0;j<3;j++){const a=old[ids[j]],b=old[ids[(j+1)%3]];if((a[2]<20)===(b[2]<20))continue;
      const t=(20-a[2])/(b[2]-a[2]);hits.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    if(hits.length!==2)throw new Error('Invalid inserted coast site');
    maxDisplacement=Math.max(maxDisplacement,Math.hypot(now[id][0]-(hits[0][0]+hits[1][0])/2,now[id][1]-(hits[0][1]+hits[1][1])/2));
  }
  const a=linearCoastMetrics(before,before.elevations,sectionX),b=linearCoastMetrics(after,after.elevations,sectionX);
  let originalCrossingDisplacement=0,missingOriginalCrossings=0;
  for(const [edge,p] of a.crossings){const q=b.crossings.get(edge);if(!q)missingOriginalCrossings++;else originalCrossingDisplacement=Math.max(originalCrossingDisplacement,Math.hypot(p[0]-q[0],p[1]-q[1]));}
  return {splitParents,addedPoints:after.points.length-before.points.length,wrongOrientation,unknownChildren,maxCoverageError,
    maxLandFraction,maxSeaFraction,maxDisplacement,originalCrossingDisplacement,missingOriginalCrossings,
    landAreaBefore:a.landArea,landAreaAfter:b.landArea,sectionBefore:a.sectionIntervals,sectionAfter:b.sectionIntervals};
}
