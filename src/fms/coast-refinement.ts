import { assertFmsDocument, FMS_MAX_POINTS, FmsModelError, type FmsDocument, type FmsPoint } from './model';
import { FIELD_Q, noiseQ12 } from '../world/generation/seed';

export const FMS_COAST_REFINEMENT = 'bounded-triangle-coast-detail-v1';
export interface FmsCoastOptions { seed: number; maxOffset: number }
export interface FmsCoastSplit { triangle: number; point: FmsPoint }
export interface FmsCoastResult {
  worldId: string; baseRevision: number; options: FmsCoastOptions; splits: FmsCoastSplit[];
  stats: { algorithm: typeof FMS_COAST_REFINEMENT; eligible: number; skipped: number; budgetLimited: boolean; maxDisplacement: number; maxAreaFraction: number };
}
const AREA_LIMIT = .02, INTERIOR_MARGIN = .02;
const cross = (a: FmsPoint,b: FmsPoint,c: FmsPoint) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance = (a: FmsPoint,b: FmsPoint) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const error = () => new FmsModelError('invalid-edit','海岸细化超出轮廓保护范围，原地图未改变。');
export function validFmsCoastOptions(value: unknown): value is FmsCoastOptions {
  if (!value || typeof value!=='object' || Array.isArray(value)) return false;
  const o=value as Record<string,unknown>;
  return Object.keys(o).length===2&&Object.hasOwn(o,'seed')&&Object.hasOwn(o,'maxOffset')
    &&typeof o.seed==='number'&&Number.isInteger(o.seed)&&o.seed>=0&&o.seed<=0xffffffff
    &&typeof o.maxOffset==='number'&&Number.isFinite(o.maxOffset)&&o.maxOffset>=0&&o.maxOffset<=4;
}
function geometry(doc: FmsDocument) {
  const points=doc.points.map(([x,y])=>[Math.fround(x),Math.fround(y)] as FmsPoint);
  const inland=doc.neighbors.map((row,i)=>doc.elevations[i]>20&&row.every(n=>doc.elevations[n]>20));
  const deepSea=doc.neighbors.map((row,i)=>doc.elevations[i]<20&&row.every(n=>doc.elevations[n]<20));
  const protectedSite=doc.elevations.map((h,i)=>Number(h===20||!!doc.terrainLocks?.[i]
    || !(h>20?doc.neighbors[i].some(n=>inland[n]):doc.neighbors[i].some(n=>deepSea[n]))));
  return {points,protectedSite};
}
function coastSegment(doc:FmsDocument, points:FmsPoint[], offset:number) {
  const ids=[doc.triangles[offset],doc.triangles[offset+1],doc.triangles[offset+2]], hits:FmsPoint[]=[];
  for(let i=0;i<3;i++){
    const a=ids[i],b=ids[(i+1)%3],ha=doc.elevations[a],hb=doc.elevations[b];
    if((ha<20)===(hb<20))continue;
    const t=(20-ha)/(hb-ha);
    hits.push([points[a][0]+(points[b][0]-points[a][0])*t,points[a][1]+(points[b][1]-points[a][1])*t]);
  }
  if(hits.length!==2)return null;
  const [p,q]=hits, length=distance(p,q), area=Math.abs(cross(points[ids[0]],points[ids[1]],points[ids[2]]))*.5;
  const solo=ids.find(id=>ids.filter(i=>(doc.elevations[i]<20)===(doc.elevations[id]<20)).length===1)!;
  const soloArea=Math.abs(cross(points[solo],p,q))*.5;
  return {ids,p,q,length,area,minSideArea:Math.min(soloArea,area-soloArea),mid:[(p[0]+q[0])*.5,(p[1]+q[1])*.5] as FmsPoint};
}
function strictlyInside(point:FmsPoint,vertices:FmsPoint[]):boolean {
  const [a,b,c]=vertices,total=cross(a,b,c);
  return Number.isFinite(total)&&Math.abs(total)>1e-8
    && [cross(a,b,point),cross(b,c,point),cross(c,a,point)].every(value=>value/total>INTERIOR_MARGIN);
}

/** Insert one actual h=20 vertex in an original mixed triangle. The replacement
 * coast P-C-Q has Hausdorff distance <= |C-M| from P-M-Q. Original edges/heights
 * remain intact, so adjacent triangles share their original crossing exactly.
 * Both sides' area change is bounded by 2% of min(original land, original sea).
 * All bounds are rechecked after float32 quantization, as rendered by WebGL.
 * Exact-level triangles are skipped, making repeated refinement non-accumulating.
 */
export function refineFmsCoast(doc:FmsDocument,options:FmsCoastOptions):FmsCoastResult {
  if(!validFmsCoastOptions(options))throw error();
  assertFmsDocument(doc);
  if(doc.elevations.some(h=>h<0||h>100))throw error();
  const {points,protectedSite}=geometry(doc),splits:FmsCoastSplit[]=[];
  let eligible=0,skipped=0,budgetLimited=false,maxDisplacement=0,maxAreaFraction=0;
  const budget=FMS_MAX_POINTS-doc.points.length;
  for(let offset=0;offset<doc.triangles.length;offset+=3){
    const part=coastSegment(doc,points,offset);if(!part)continue;
    if(part.ids.some(id=>protectedSite[id])||part.length<1e-4||part.minSideArea<1e-8){skipped++;continue;}
    eligible++;
    if(options.maxOffset===0)continue;
    if(splits.length>=budget){budgetLimited=true;continue;}
    const wave=Math.max(8,Math.sqrt(doc.width*doc.height/doc.points.length)*3);
    const field=noiseQ12(options.seed,79,Math.round(part.mid[0]*256),Math.round(part.mid[1]*256),Math.round(wave*256))/FIELD_Q;
    const limit=Math.min(options.maxOffset,part.length*.2,2*AREA_LIMIT*part.minSideArea/part.length);
    let delta=limit*field,accepted:FmsPoint|undefined;
    for(let attempt=0;attempt<12;attempt++){
      const point:FmsPoint=[Math.fround(part.mid[0]-(part.q[1]-part.p[1])/part.length*delta),Math.fround(part.mid[1]+(part.q[0]-part.p[0])/part.length*delta)];
      const displacement=distance(point,part.mid), areaChange=Math.abs(cross(part.p,part.q,point))*.5;
      if(displacement<1e-5)break;
      if(displacement<=limit&&areaChange>1e-8&&areaChange<=AREA_LIMIT*part.minSideArea
        &&strictlyInside(point,part.ids.map(i=>points[i]))&&strictlyInside(point,part.ids.map(i=>doc.points[i]))){accepted=point;break;}
      delta*=.5;
    }
    if(!accepted){skipped++;continue;}
    splits.push({triangle:offset/3,point:accepted});
    maxDisplacement=Math.max(maxDisplacement,distance(accepted,part.mid));
    maxAreaFraction=Math.max(maxAreaFraction,Math.abs(cross(part.p,part.q,accepted))*.5/part.minSideArea);
  }
  return {worldId:doc.worldId,baseRevision:doc.revision,options:{...options},splits,
    stats:{algorithm:FMS_COAST_REFINEMENT,eligible,skipped,budgetLimited,maxDisplacement,maxAreaFraction}};
}

/** Revalidate untrusted Worker geometry before exposing a candidate. No request
 * may replace old sites, heights, constraints, or any protected triangle. */
export function prepareFmsCoastPreview(doc:FmsDocument,raw:FmsCoastResult,expected:FmsCoastOptions):FmsDocument {
  if(!validFmsCoastOptions(expected)||!raw||raw.worldId!==doc.worldId||raw.baseRevision!==doc.revision)throw error();
  if(!validFmsCoastOptions(raw.options)||raw.options.seed!==expected.seed||raw.options.maxOffset!==expected.maxOffset
    ||!Array.isArray(raw.splits)||raw.splits.length>FMS_MAX_POINTS-doc.points.length)throw error();
  assertFmsDocument(doc);
  const stats=raw.stats;
  if(!stats||stats.algorithm!==FMS_COAST_REFINEMENT||typeof stats.budgetLimited!=='boolean'
    ||![stats.eligible,stats.skipped].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=doc.triangles.length/3)
    ||![stats.maxDisplacement,stats.maxAreaFraction].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)
    ||stats.eligible<raw.splits.length)throw error();
  const {points,protectedSite}=geometry(doc), splitByTriangle=new Map<number,FmsPoint>();
  let maxDisplacement=0,maxAreaFraction=0;
  for(const split of raw.splits){
    if(!split||!Number.isInteger(split.triangle)||split.triangle<0||split.triangle>=doc.triangles.length/3||splitByTriangle.has(split.triangle)
      ||!Array.isArray(split.point)||split.point.length!==2||split.point.some(v=>!Number.isFinite(v)||v!==Math.fround(v)))throw error();
    const part=coastSegment(doc,points,split.triangle*3);
    if(!part||part.ids.some(i=>protectedSite[i])||part.length<1e-4||part.minSideArea<1e-8||expected.maxOffset===0)throw error();
    const displacement=distance(split.point,part.mid),areaFraction=Math.abs(cross(part.p,part.q,split.point))*.5/part.minSideArea;
    if(displacement<1e-5||Math.abs(cross(part.p,part.q,split.point))*.5<=1e-8||displacement>Math.min(expected.maxOffset,part.length*.2,2*AREA_LIMIT*part.minSideArea/part.length)
      ||Math.abs(cross(part.p,part.q,split.point))*.5>AREA_LIMIT*part.minSideArea
      ||!strictlyInside(split.point,part.ids.map(i=>points[i]))||!strictlyInside(split.point,part.ids.map(i=>doc.points[i])))throw error();
    splitByTriangle.set(split.triangle,[...split.point]);
    maxDisplacement=Math.max(maxDisplacement,displacement);maxAreaFraction=Math.max(maxAreaFraction,areaFraction);
  }
  if(stats.maxDisplacement!==maxDisplacement||stats.maxAreaFraction!==maxAreaFraction)throw error();
  if(!splitByTriangle.size)return doc;
  const newPoints=doc.points.map(p=>[...p] as FmsPoint), triangles:number[]=[], heights=Array.from(doc.elevations), locks=doc.terrainLocks?Array.from(doc.terrainLocks):undefined;
  for(let t=0;t<doc.triangles.length/3;t++){
    const [a,b,c]=doc.triangles.slice(t*3,t*3+3),point=splitByTriangle.get(t);
    if(!point){triangles.push(a,b,c);continue;}
    const id=newPoints.length;newPoints.push(point);heights.push(20);locks?.push(0);
    triangles.push(a,b,id,b,c,id,c,a,id);
  }
  const adjacency=newPoints.map(()=>new Set<number>());
  for(let i=0;i<triangles.length;i+=3){const [a,b,c]=triangles.slice(i,i+3);adjacency[a].add(b).add(c);adjacency[b].add(a).add(c);adjacency[c].add(a).add(b);}
  const candidate:FmsDocument={...doc,revision:doc.revision+1,points:newPoints,triangles:Uint32Array.from(triangles),neighbors:adjacency.map(row=>[...row].sort((a,b)=>a-b)),elevations:Int32Array.from(heights),...(locks?{terrainLocks:Uint8Array.from(locks)}:{})};
  assertFmsDocument(candidate);return candidate;
}
