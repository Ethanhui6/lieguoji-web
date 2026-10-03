import fs from 'node:fs';
import {createHash} from 'node:crypto';
const base='.autopilot/country-ownership',check=base+'/checks/touch-target';
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const source=read(check+'/source-after.json'),dist=read(check+'/dist-files.json'),v=read(check+'/verification.json');
const matches=r=>fs.statSync(r.path).size===r.bytes&&sha(fs.readFileSync(r.path))===r.sha256;
if(!v.passed||!source.every(matches)||!dist.every(matches))throw Error('Checked source or dist changed');
const native=read(base+'/native/verification.json'),assets=read(base+'/native/loaded-assets.json'),loaded=[];
for(const url of new Set([...assets.scripts,...assets.styles,...assets.resources])){
 const u=new URL(url);if(u.origin!=='http://127.0.0.1:4173'||!/^\/assets\/[A-Za-z0-9._-]+$/.test(u.pathname))throw Error('Unexpected observed asset');
 const row=dist.find(r=>r.path===`dist${u.pathname}`);if(!row)throw Error('Not in checked dist');const response=await fetch(url,{cache:'no-store'});
 if(!response.ok||sha(Buffer.from(await response.arrayBuffer()))!==row.sha256)throw Error('Server asset changed');loaded.push({url,sha256:row.sha256});
}
const result={at:new Date().toISOString(),buildSha256:v.buildSha256,sourceSnapshotSha256:sha(fs.readFileSync(check+'/source-after.json')),distSnapshotSha256:sha(fs.readFileSync(check+'/dist-files.json')),nativeRecordSha256:sha(fs.readFileSync(base+'/native/verification.json')),loadedAssets:loaded,sourceStable:true,distStable:true,passed:native.originalWorldsUnchanged&&native.sourceV3Unchanged&&native.currentWorldUnchanged&&native.previewChangedControlGeometry&&native.cancelRestoredGeometry&&native.refreshPreserved&&native.allChunkHashesValid&&!native.consoleErrorsWarnings.length,physicalDevice:false,userVisualAccepted:false,cloudWrites:false};
const output=base+'/native/build-binding.json';if(fs.existsSync(output))throw Error('Existing binding');fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
