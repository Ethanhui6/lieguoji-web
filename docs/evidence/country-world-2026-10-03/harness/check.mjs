import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
const label=process.argv[2]??'first'; if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid evidence label');
const root='.autopilot/country-world', out=`${root}/checks/${label}`;
if(fs.existsSync(out))throw Error('Never overwrite a prior check'); fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>{const f=`${p}/${e.name}`;if(e.isSymbolicLink())throw Error('Unexpected symlink');return e.isDirectory()?walk(f):[{path:f,bytes:fs.statSync(f).size,sha256:sha(fs.readFileSync(f))}];});
const snapshot=()=>[...walk('src'),...walk('tests'),...walk('scripts'),...['package.json','package-lock.json','vite.config.ts','tsconfig.json','playwright.config.ts'].map(path=>({path,bytes:fs.statSync(path).size,sha256:sha(fs.readFileSync(path))}))];
const save=(file,v)=>fs.writeFileSync(`${out}/${file}`,JSON.stringify(v,null,2)+'\n');
const before=snapshot();save('source-before.json',before);
const rounds=[];let identity=null;
const run=(name,entry,args=[])=>{const start=Date.now();const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:600000});fs.writeFileSync(`${out}/${name}.log`,(r.stdout??'')+'\n'+(r.stderr??''));rounds.push({name,exitCode:r.status,elapsedMs:Date.now()-start,error:r.error?.message??null});if(r.status!==0)throw Error(`${name} failed, see preserved log`);};
try{
  run('plan','scripts/check-plan.mjs');run('lint','node_modules/eslint/bin/eslint.js',['src','tests','scripts']);run('types','node_modules/typescript/bin/tsc',['--noEmit']);
  run('unit','node_modules/vitest/vitest.mjs',['run','src/world/politics','src/editor/country-entry.test.ts','src/world/storage.test.ts','src/world/detail-coast-storage.test.ts','src/world/generation-preview23-history.test.ts','--reporter=json',`--outputFile=${out}/unit.json`]);
  run('build','node_modules/vite/bin/vite.js',['build']);run('dist','scripts/check-dist.mjs');
  const prior=JSON.parse(fs.readFileSync(`${root}/preview24-build.json`,'utf8')), current=JSON.parse(fs.readFileSync('dist/build.json','utf8'));
  const keys=['engineFingerprint',...Object.keys(prior).filter(k=>k.endsWith('Generator'))];
  identity=keys.map(key=>({key,unchanged:JSON.stringify(prior[key])===JSON.stringify(current[key])}));if(identity.some(i=>!i.unchanged))throw Error('Unexpected geography/engine identity change');
  fs.copyFileSync('dist/build.json',`${out}/build.json`);save('dist-files.json',walk('dist'));
}catch(error){save('failure.json',{message:error.message});process.exitCode=1;}
finally{const after=snapshot();save('source-after.json',after);const stable=JSON.stringify(before)===JSON.stringify(after);if(!stable)process.exitCode=1;const unit=fs.existsSync(`${out}/unit.json`)?JSON.parse(fs.readFileSync(`${out}/unit.json`,'utf8')):null;save('verification.json',{at:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),version:JSON.parse(fs.readFileSync('package.json','utf8')).version,passed:!process.exitCode,sourceStable:stable,rounds,unit:unit?{total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests}:null,identity,buildSha256:fs.existsSync(`${out}/build.json`)?sha(fs.readFileSync(`${out}/build.json`)):null,browser:false,physicalDevice:false,wholePhaseAccepted:false,cloudWrites:false});console.log(fs.readFileSync(`${out}/verification.json`,'utf8'));}
