import fs from 'node:fs';
import {createHash} from 'node:crypto';
// This is our isolated test fixture, never a personal save or install file.
const input='.autopilot/fms-map-typography47-browser/desktop/fixture.json';
const bytes=fs.readFileSync(input),dbs=JSON.parse(bytes),d=dbs.find(x=>x.name==='lieguoji-fms-web-v1').rows.find(x=>x[0]==='current')[1].document;
const triangles=d.triangles.values,h=d.elevations.values,edges=new Set(),lengths=[],coast=[];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
for(let i=0;i<triangles.length;i+=3){
 const ids=triangles.slice(i,i+3),cross=[];
 for(let j=0;j<3;j++){
  const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join('/');
  if(!edges.has(key)){edges.add(key);lengths.push(distance(d.points[a],d.points[b]));}
  if((h[a]>=20)!==(h[b]>=20)){const t=(20-h[a])/(h[b]-h[a]);cross.push([d.points[a][0]+(d.points[b][0]-d.points[a][0])*t,d.points[a][1]+(d.points[b][1]-d.points[a][1])*t]);}
 }
 if(cross.length===2&&distance(...cross)>1e-9)coast.push(distance(...cross));
}
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
const screen=JSON.parse(fs.readFileSync('docs/evidence/fms-combat-cartography47-2026-10-15/comparison/desktop/after-data.json'));
const result={fixtureSha256:createHash('sha256').update(bytes).digest('hex'),width:d.width,height:d.height,points:d.points.length,triangles:triangles.length/3,uniqueEdgeWorld:stats(lengths),visibleH20ContourSegmentWorld:stats(coast),scales:[{factor:1,...screen.full},...screen.views].map(v=>({factor:v.factor,terrainCameraZoom:v.projection.zoom,uniqueEdgeCssPx:stats(lengths.map(x=>x*v.projection.zoom)),h20CoastSegmentCssPx:stats(coast.map(x=>x*v.projection.zoom))})),scope:'Global actual fixed-triangle edges and h20 linear shoreline segments in the exact saved synthetic map. CSS uses renderer terrain camera zoom; run.scale converts simulation coordinates only. Segment size is a geometry diagnosis, not an original comparison, smoothing acceptance or GPU performance result. No map data changed.'};
fs.writeFileSync('docs/evidence/fms-combat-cartography47-2026-10-15/map-scale-measurement.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
