import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base='.autopilot/country-ownership/checks', prior=`${base}/final`, out=`${base}/post-ui`;
if(fs.existsSync(out))throw Error('Do not overwrite evidence');fs.mkdirSync(out);
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rows=read(`${prior}/source-after.json`), dist=read(`${prior}/dist-files.json`), previous=read(`${prior}/verification.json`);
const snapshot=()=>rows.map(r=>({path:r.path,bytes:fs.statSync(r.path).size,sha256:sha(r.path)}));
const before=snapshot(),changed=before.filter((r,i)=>r.sha256!==rows[i].sha256).map(r=>r.path);
if(!previous.passed||changed.join('|')!=='tests/country-world.spec.ts'||dist.some(r=>sha(r.path)!==r.sha256))throw Error('Unexpected changes to verified product');
fs.writeFileSync(`${out}/source-before.json`,JSON.stringify(before,null,2)+'\n');
const rounds=[];let passed=true;
for(const [name,file,args] of [['lint','node_modules/eslint/bin/eslint.js',['src','tests','scripts']],['types','node_modules/typescript/bin/tsc',['--noEmit']]]){
 const start=Date.now(),r=spawnSync(process.execPath,[file,...args],{encoding:'utf8',maxBuffer:10e6,timeout:180000});fs.writeFileSync(`${out}/${name}.log`,(r.stdout??'')+'\n'+(r.stderr??''));rounds.push({name,exitCode:r.status,elapsedMs:Date.now()-start});if(r.status!==0){passed=false;break;}
}
const after=snapshot(),stable=JSON.stringify(before)===JSON.stringify(after);fs.writeFileSync(`${out}/source-after.json`,JSON.stringify(after,null,2)+'\n');
for(const file of ['build.json','dist-files.json'])fs.copyFileSync(`${prior}/${file}`,`${out}/${file}`);
const unit=fs.existsSync(`${out}/unit.json`)?read(`${out}/unit.json`):null;
const result={...previous,at:new Date().toISOString(),passed:passed&&stable,sourceStable:stable,rounds,unit:{...previous.unit,reusedFrom:'checks/final (product and unit tests unchanged)',rerun:null},changed,reusedChecks:['plan','release-policy','other unit tests','build','dist','engine/geography identity'],cloudWrites:false};
fs.writeFileSync(`${out}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;
