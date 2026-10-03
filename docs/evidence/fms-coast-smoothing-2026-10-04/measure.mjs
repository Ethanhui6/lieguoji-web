import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const dir='docs/evidence/fms-coast-smoothing-2026-10-04';
const server=await createServer({cacheDir:'.autopilot/smoothing-evidence-cache',server:{middlewareMode:true,hmr:false}});
const hydrate=raw=>({...raw,elevations:Int32Array.from(raw.elevations),triangles:Uint32Array.from(raw.triangles),...(raw.terrainLocks?{terrainLocks:Uint8Array.from(raw.terrainLocks)}:{})});
try{
  const {coastFixture}=await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const {measureFmsSmoothing}=await server.ssrLoadModule('/tests/helpers/fms-smoothing-metrics.ts');
  const {smoothFmsCoast,prepareFmsCoastSmoothPreview}=await server.ssrLoadModule('/src/fms/coast-smoothing.ts');
  const {prepareFmsCoastPreview,refineFmsCoast}=await server.ssrLoadModule('/src/fms/coast-refinement.ts');
  const measure=doc=>{const start=performance.now(),result=smoothFmsCoast(doc,{maxOffset:4}),computed=performance.now(),candidate=prepareFmsCoastSmoothPreview(doc,result,{maxOffset:4}),validated=performance.now();
    const m=measureFmsSmoothing(doc,candidate,doc.width===80?40:205);
    assert.equal(m.flippedFaces,0);assert.equal(m.missingCrossings,0);assert.ok(m.maxCoastDisplacement<=4);assert.ok(m.maxComponentAreaFraction<=.02+1e-8);assert.ok(m.minStretch>=.8-1e-9);assert.ok(m.maxStretch<=1.2+1e-9);
    return {result,candidate,metrics:{moves:result.moves.length,...result.stats,...m,desktopGenerationMs:computed-start,desktopValidationMs:validated-computed}};};
  const cases=[];
  for(const shape of ['island','neck','asymmetric'])for(const [land,sea]of [[45,0],[21,19],[100,0],[100,19]])for(const detailed of [false,true]){
    let doc=coastFixture(shape);doc.elevations=doc.elevations.map(h=>h?land:sea);
    if(detailed)doc=prepareFmsCoastPreview(doc,refineFmsCoast(doc,{seed:1337,maxOffset:4}),{seed:1337,maxOffset:4});
    cases.push({shape,land,sea,detailed,...measure(doc).metrics});
  }
  fs.writeFileSync(`${dir}/measurements.json`,JSON.stringify({scope:'24 clipped component/crossing/stretch cases; not phone or visual acceptance',cases},null,2)+'\n');
  const beforePath=process.argv[2],afterPath=process.argv[3];
  if(beforePath&&afterPath){const before=hydrate(JSON.parse(fs.readFileSync(beforePath,'utf8'))),after=hydrate(JSON.parse(fs.readFileSync(afterPath,'utf8'))),computed=measure(before);
    const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.equal(hash(after.points),hash(computed.candidate.points),'Exact saved position bytes must match the computed candidate');assert.deepEqual(after.elevations,before.elevations);assert.deepEqual(after.triangles,before.triangles);assert.deepEqual(after.terrainLocks,before.terrainLocks);
    let lockedFacePointChanges=0;const lockedFacePoints=new Set();for(let t=0;t<before.triangles.length;t+=3){const ids=before.triangles.slice(t,t+3);if(ids.some(i=>before.terrainLocks?.[i]))ids.forEach(i=>lockedFacePoints.add(i));}
    lockedFacePoints.forEach(i=>{if(JSON.stringify(before.points[i])!==JSON.stringify(after.points[i]))lockedFacePointChanges++;});assert.equal(lockedFacePointChanges,0);
    fs.writeFileSync(`${dir}/browser-geometry.json`,JSON.stringify({beforeRevision:before.revision,afterRevision:after.revision,pointCount:after.points.length,lockedFacePoints:lockedFacePoints.size,lockedFacePointChanges,generatedMatchesBrowserSavedPositions:true,...computed.metrics},null,2)+'\n');
  }
  console.log(JSON.stringify({cases:cases.length,failed:0,browserCompared:!!(beforePath&&afterPath)}));
}finally{await server.close();}
