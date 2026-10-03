import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const server=await createServer({root,cacheDir:'.autopilot/fms-refinement-vite-cache',server:{middlewareMode:true,hmr:false}});
const hash=x=>createHash('sha256').update(x).digest('hex');
try{
  const {refineFmsCoast,prepareFmsCoastPreview}=await server.ssrLoadModule('/src/fms/coast-refinement.ts');
  const {createFmsDocument,commitFmsEdit,prepareFmsLockEdit}=await server.ssrLoadModule('/src/fms/model.ts');
  const {coastFixture,compareLinearCoasts}=await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const {measureFmsRefinement}=await server.ssrLoadModule('/tests/helpers/fms-refinement-metrics.ts');
  const {naturalizeFmsTerrain}=await server.ssrLoadModule('/src/fms/naturalize.ts');
  const {deriveFmsShade}=await server.ssrLoadModule('/src/fms/shading.ts');
  const cases=[];
  for(const name of ['island','neck','asymmetric','three-wide-island','three-wide-neck','actual-mesh']){
    let doc=name==='actual-mesh'?await createFmsDocument({yieldTask:async()=>{}}):coastFixture(name.startsWith('three')?'neck':name);
    if(name==='three-wide-island')doc.points.forEach(([x,y],i)=>doc.elevations[i]=x>=190&&x<=210&&y>=190&&y<=210?45:0);
    if(name==='three-wide-neck')doc.points.forEach(([x,y],i)=>{if(x>=160&&x<=240&&y>=260&&y<=280)doc.elevations[i]=45;});
    if(name==='actual-mesh')doc.points.forEach(([x,y],i)=>{if(x>220&&x<1300&&y>200&&y<1300&&!(x<650&&y>600&&y<800))doc.elevations[i]=45;});
    doc=commitFmsEdit(doc,prepareFmsLockEdit(doc,[name==='actual-mesh'?{x:450,y:950,radius:80}:{x:120,y:290,radius:18}],true));
    const samples=[],sourceShade=deriveFmsShade(doc),sourceHash=hash(JSON.stringify(doc));
    for(const seed of [42,1337])for(const maxOffset of [0,.01,.25,4]){
      const result=refineFmsCoast(doc,{seed,maxOffset}),candidate=prepareFmsCoastPreview(doc,result,{seed,maxOffset});
      const metric=measureFmsRefinement(doc,candidate,name==='island'?40:name==='actual-mesh'?755:205),shade=deriveFmsShade(candidate);
      const changedLockedHeights=doc.elevations.reduce((n,h,i)=>n+Number(!!doc.terrainLocks?.[i]&&h!==candidate.elevations[i]),0);
      const changedOriginalShade=sourceShade.reduce((n,h,i)=>n+Number(h!==shade[i]),0);
      const splitIds=new Set(result.splits.map(s=>s.triangle));let touchedLockedFaces=0;
      for(let t=0;t<doc.triangles.length/3;t++)if(splitIds.has(t)&&doc.triangles.slice(t*3,t*3+3).some(i=>doc.terrainLocks?.[i]))touchedLockedFaces++;
      if(metric.wrongOrientation||metric.unknownChildren||metric.missingOriginalCrossings||metric.originalCrossingDisplacement||metric.maxCoverageError>1e-6
        ||metric.maxLandFraction>.020001||metric.maxSeaFraction>.020001||metric.maxDisplacement>maxOffset||changedLockedHeights||touchedLockedFaces||changedOriginalShade)throw Error('Refinement contract failed: '+name);
      if((name==='neck'||name==='asymmetric')&&JSON.stringify(metric.sectionBefore)!==JSON.stringify(metric.sectionAfter))throw Error('One-sample neck changed');
      if(hash(JSON.stringify(doc))!==sourceHash)throw Error('Source mutated');
      samples.push({seed,maxOffset,stats:result.stats,metric,changedLockedHeights,touchedLockedFaces,changedOriginalShade,candidateSha256:hash(JSON.stringify(candidate))});
    }
    const candidate=prepareFmsCoastPreview(doc,refineFmsCoast(doc,{seed:1337,maxOffset:4}),{seed:1337,maxOffset:4});
    const relief=naturalizeFmsTerrain(candidate,{seed:42,strength:1}),afterNaturalize=compareLinearCoasts(candidate,relief.elevations);
    if(afterNaturalize.maxCrossingDisplacement||afterNaturalize.absoluteAreaChange)throw Error('Subsequent relief moved refined coast');
    cases.push({name,sourcePoints:doc.points.length,sourceSha256:sourceHash,locked:doc.terrainLocks?.reduce((a,b)=>a+b,0)??0,samples,afterNaturalize});
  }
  const sources=['src/fms/coast-refinement.ts','src/fms/coast-client.ts','src/fms/coast.worker.ts','src/fms/model.ts','src/fms/renderer.ts','src/fms/shading.ts','src/fms/naturalize.ts','tests/helpers/fms-refinement-metrics.ts','tests/helpers/fms-coast-metrics.ts'];
  const sourceHashes={};for(const file of sources)sourceHashes[file]=hash((await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n'));
  const output={recordedAt:new Date().toISOString(),method:'Independent float32 h20 clipping with parent grouping, child orientation/coverage, original edge crossings, non-grid-aligned narrow-neck section, locked face and shading checks',sourceHashes,cases,
    limitations:['local two-ring support is not generic island-size or world-width neck detection','per-triangle displacement is conservative; no original-game equivalence or naturalness claim','hydrology rederived from sample graph; not area-weighted physical runoff','not phone/WebKit/user visual acceptance']};
  await fs.writeFile(new URL('./measurements.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(cases.map(c=>({name:c.name,points:c.sourcePoints,sample:c.samples.at(-1).metric})),null,2));
}finally{await server.close();}
