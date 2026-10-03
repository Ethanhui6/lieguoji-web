import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {createServer} from 'vite';
const server=await createServer({cacheDir:'.autopilot/area-runoff-measure-cache',server:{middlewareMode:true,hmr:false}});
try{
  const {coastFixture,linearCoastMetrics}=await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const {resolveFmsCoast}=await server.ssrLoadModule('/src/fms/coast-resolution.ts');
  const {deriveFmsDrainage}=await server.ssrLoadModule('/src/fms/hydrology.ts');
  const results=[];
  const measure=(doc,label)=>{
    const started=performance.now(),drainage=deriveFmsDrainage(doc),elapsedMs=performance.now()-started;
    const expectedArea=linearCoastMetrics(doc).landArea;
    const discharge=drainage.stats.seaDischarge+drainage.stats.endorheicDischarge;
    assert.ok(Math.abs(expectedArea-drainage.stats.landArea)<1e-6);
    assert.ok(Math.abs(discharge-expectedArea)<1e-6);
    const local=drainage.runoff.slice();drainage.receiver.forEach((target,i)=>{if(target>=0)local[target]+=drainage.accumulation[i];});
    const maxLocalError=Math.max(...local.map((v,i)=>Math.abs(v-drainage.accumulation[i])));
    assert.ok(maxLocalError<1e-6);
    return {label,points:doc.points.length,stats:drainage.stats,expectedArea,areaError:drainage.stats.landArea-expectedArea,
      dischargeError:discharge-expectedArea,maxLocalError,desktopComputeMs:elapsedMs,
      oldUnitCellSourceTotal:drainage.stats.landCells,oldUnitCellThreshold:Math.max(8,Math.ceil(drainage.stats.landCells*.003)),
      receiverHash:createHash('sha256').update(Buffer.from(drainage.receiver.buffer)).digest('hex')};
  };
  for(const kind of ['island','neck','asymmetric'])for(const [land,sea]of [[45,0],[21,19],[100,0],[100,19]]){
    const doc=coastFixture(kind);doc.elevations=doc.elevations.map(h=>h?land:sea);
    const subdivided=resolveFmsCoast(doc,new Uint8Array(doc.points.length)).document;
    const before=measure(doc,{kind,land,sea,stage:'before'}),after=measure(subdivided,{kind,land,sea,stage:'subdivided'});
    assert.ok(Math.abs(after.stats.landArea/before.stats.landArea-1)<1e-6);
    results.push({before,after,sourceRatio:after.stats.landArea/before.stats.landArea,oldSourceRatio:after.stats.landCells/before.stats.landCells});
  }
  const actual=[];
  for(const path of process.argv.slice(2)){
    const bytes=fs.readFileSync(path),raw=JSON.parse(bytes),doc={...raw,triangles:Uint32Array.from(raw.triangles),elevations:Int32Array.from(raw.elevations),...(raw.terrainLocks?{terrainLocks:Uint8Array.from(raw.terrainLocks)}:{})};
    actual.push({...measure(doc,path),inputSha256:createHash('sha256').update(bytes).digest('hex')});
  }
  fs.writeFileSync('docs/evidence/fms-area-runoff-2026-10-04/measurements.json',JSON.stringify({cases:results.length,passed:true,results,actual,claim:'Area source conservation only; routes and local source allocation remain mesh-dependent.'},null,2)+'\n');
  console.log(JSON.stringify({cases:results.length,passed:true,actual}));
}finally{await server.close();}
