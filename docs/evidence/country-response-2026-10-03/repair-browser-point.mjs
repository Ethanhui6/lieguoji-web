import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const base='.autopilot/country-response/checks/land-fast-path-1', dir='.autopilot/country-response/checks/browser-point-repair-1';
const read=p=>JSON.parse(fs.readFileSync(p)), sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(fs.existsSync(dir))throw Error('Do not overwrite evidence');
const before=read(`${base}/source-after.json`),prior=read(`${base}/verification.json`),changed=before.filter(r=>sha(r.path)!==r.sha256).map(r=>r.path);
if(!prior.passed||JSON.stringify(changed)!==JSON.stringify(['tests/country-world.spec.ts']))throw Error('Unexpected source changes');
const dist=read(`${base}/dist-files.json`);if(!dist.every(r=>sha(r.path)===r.sha256))throw Error('Product build changed');
fs.mkdirSync(dir,{recursive:true});const current=()=>before.map(r=>({path:r.path,bytes:fs.statSync(r.path).size,sha256:sha(r.path)}));
const start=current(),rounds=[];fs.writeFileSync(`${dir}/source-before.json`,JSON.stringify(start,null,2));
for(const [name,entry,args] of [['lint','node_modules/eslint/bin/eslint.js',['src','tests','scripts']],['types','node_modules/typescript/bin/tsc',['--noEmit']]]){
 const t=Date.now(),r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:180000});fs.writeFileSync(`${dir}/${name}.log`,(r.stdout??'')+'\n'+(r.stderr??''));rounds.push({name,exitCode:r.status,elapsedMs:Date.now()-t});if(r.status!==0)process.exitCode=1;
}
const after=current(),stable=JSON.stringify(after)===JSON.stringify(start);fs.writeFileSync(`${dir}/source-after.json`,JSON.stringify(after,null,2));
for(const f of ['dist-files.json','build.json'])fs.copyFileSync(`${base}/${f}`,`${dir}/${f}`);
const result={...prior,at:new Date().toISOString(),passed:!process.exitCode&&stable,sourceStable:stable,rounds,changed,reused:{from:base,checks:['unit','release-policy','build','dist'],reason:'Only test point discovery changed: find actual SVG land inside the removal outline instead of assuming its centre is land. Product source and build unchanged.'}};
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
