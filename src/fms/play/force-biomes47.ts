import type {FmsDocument} from '../model';
import {deriveFmsBiomeSurface} from './terrain13-climate/biome-surface';

/** Explicit web bridge: travel cells are clipped triangle faces, not native Voronoi cells.
 * Each face samples its nearest land source vertex to the triangle centroid (ties by vertex id).
 * Persist once at world creation; never classify by province average, camera position or target. */
export function forceFaceBiomes47(doc:FmsDocument):number[]{
 const ids=deriveFmsBiomeSurface(doc).ids,out:number[]=[];
 for(let i=0;i<doc.triangles.length;i+=3){
  const vertices=Array.from(doc.triangles.slice(i,i+3));
  const x=vertices.reduce((n,v)=>n+Math.fround(doc.points[v][0]),0)/3,y=vertices.reduce((n,v)=>n+Math.fround(doc.points[v][1]),0)/3;
  const distance=(v:number)=>(Math.fround(doc.points[v][0])-x)**2+(Math.fround(doc.points[v][1])-y)**2;
  const land=vertices.filter(v=>doc.elevations[v]>20).sort((a,b)=>distance(a)-distance(b)||a-b);
  out.push(land.length?ids[land[0]]:0);
 }
 return out;
}
