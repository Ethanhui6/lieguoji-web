import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({cacheDir:'.autopilot/resolution-measure-cache',server:{middlewareMode:true,hmr:false}});
try{
  const {coastFixture,linearCoastMetrics}=await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const {measureFmsSmoothing}=await server.ssrLoadModule('/tests/helpers/fms-smoothing-metrics.ts');
  const {smoothFmsCoast,prepareFmsCoastSmoothPreview,prepareFmsCoastSmoothGeometry}=await server.ssrLoadModule('/src/fms/coast-smoothing.ts');
  const {refineFmsCoast,prepareFmsCoastPreview}=await server.ssrLoadModule('/src/fms/coast-refinement.ts');
  const options={maxOffset:4,resample:true},results=[];
  const measure=(doc,label)=>{
    const started=performance.now(),result=smoothFmsCoast(doc,options),candidate=prepareFmsCoastSmoothPreview(doc,result,options),prepared=prepareFmsCoastSmoothGeometry(doc,options);
    const reference=result.moves.length?{...prepared.doc,points:prepared.source.points}:doc;
    const m=measureFmsSmoothing(reference,candidate,205,!result.moves.length),original=linearCoastMetrics(doc),ref=linearCoastMetrics(reference,reference.elevations,205,!result.moves.length);
    assert.ok(Math.abs(ref.landArea-original.landArea)<1e-5);assert.equal(m.flippedFaces,0);assert.equal(m.missingCrossings,0);
    assert.ok(m.maxCoastDisplacement<=4&&m.maxComponentAreaFraction<=.02+1e-9&&m.minStretch>=.8-1e-9&&m.maxStretch<=1.2+1e-9);
    let lockedFacePointChanges=0;const protectedPoints=new Set();for(let t=0;t<doc.triangles.length;t+=3){const ids=doc.triangles.slice(t,t+3);if(ids.some(i=>doc.terrainLocks?.[i]))ids.forEach(i=>protectedPoints.add(i));}
    for(const i of protectedPoints)if(doc.points[i][0]!==candidate.points[i][0]||doc.points[i][1]!==candidate.points[i][1])lockedFacePointChanges++;
    assert.equal(lockedFacePointChanges,0);
    return {label,sourcePoints:doc.points.length,candidatePoints:candidate.points.length,appliedAddedPoints:candidate.points.length-doc.points.length,moves:result.moves.length,stats:result.stats,referenceLandAreaError:ref.landArea-original.landArea,lockedFacePointChanges,protectedPoints:protectedPoints.size,...m,desktopMeasureMs:performance.now()-started};
  };
  for(const kind of ['island','neck','asymmetric'])for(const [land,sea]of [[45,0],[21,19],[100,0],[100,19]])for(const micro of [false,true]){
    let doc=coastFixture(kind);doc.elevations=doc.elevations.map(h=>h?land:sea);doc.version=2;doc.terrainLocks=new Uint8Array(doc.points.length);if(doc.points.length>1000)doc.terrainLocks[7*41+10]=1;
    if(micro){const chosen={seed:42,maxOffset:4};doc=prepareFmsCoastPreview(doc,refineFmsCoast(doc,chosen),chosen);}
    results.push(measure(doc,{kind,land,sea,micro}));
  }
  fs.writeFileSync('docs/evidence/fms-coast-resolution-2026-10-04/measurements.json',JSON.stringify({cases:results.length,passed:true,results},null,2)+'\n');
  if(process.argv[2]){const raw=JSON.parse(fs.readFileSync(process.argv[2])),doc={...raw,triangles:Uint32Array.from(raw.triangles),elevations:Int32Array.from(raw.elevations),terrainLocks:Uint8Array.from(raw.terrainLocks)};
    fs.writeFileSync('docs/evidence/fms-coast-resolution-2026-10-04/browser-geometry.json',JSON.stringify(measure(doc,'saved-test-map-before-this-batch'),null,2)+'\n');}
  console.log(JSON.stringify({cases:results.length,passed:true,appliedCases:results.filter(x=>x.moves>0).length}));
}finally{await server.close();}
