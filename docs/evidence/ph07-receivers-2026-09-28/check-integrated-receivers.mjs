import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const out='.autopilot/ph07/integrated-receivers/first';
if(fs.existsSync(out))throw Error('Preserve the first check record');
fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const list=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
const capture=()=>[...list('src'),...list('scripts'),'package.json','package-lock.json','tsconfig.json','vite.config.ts'].sort().map(p=>({path:p,sha256:hash(fs.readFileSync(p))}));
const save=(p,v)=>fs.writeFileSync(`${out}/${p}`,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const tests=fs.readdirSync('src/world').filter(p=>/^hydrology.*\.test\.ts$/.test(p)).map(p=>`src/world/${p}`).concat('src/world/generation-preview22-history.test.ts');
const before=capture();save('source-before.json',before);save('scope.json',{tests,buildRun:false,browserRun:false,reason:'Internal receiver integration and storage history; product dist remains actual preview22.'});
const results=[];
for(const [name,args] of [
 ['plan',['scripts/check-plan.mjs']],
 ['lint',['node_modules/eslint/bin/eslint.js','src','tests','scripts']],
 ['types',['node_modules/typescript/bin/tsc','--noEmit']],
 ['unit',['node_modules/vitest/vitest.mjs','run',...tests,'--reporter=json',`--outputFile=${out}/unit.json`]],
]){
 const fd=fs.openSync(`${out}/${name}.log`,'wx'),start=performance.now();let r;
 try{r=spawnSync(process.execPath,args,{stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd)}
 results.push({name,args,exitCode:r.status,signal:r.signal,error:r.error?.message??null,elapsedMs:performance.now()-start});
 if(r.status!==0)break;
}
const after=capture();save('source-after.json',after);
const unit=fs.existsSync(`${out}/unit.json`)?JSON.parse(fs.readFileSync(`${out}/unit.json`)):null;
const verification={recordedAt:new Date().toISOString(),sourceStable:JSON.stringify(before)===JSON.stringify(after),results,
 unit:unit?{success:unit.success,files:unit.testResults.length,total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests,pending:unit.numPendingTests}:null,
 buildRun:false,browserRun:false,workerUiIntegration:false,fullRiverNetworkAccepted:false,naturalVisualAccepted:false,phaseAccepted:false,cloudWrites:false};
verification.passed=verification.sourceStable&&results.length===4&&results.every(r=>r.exitCode===0)&&unit?.success===true&&unit.numFailedTests===0&&unit.numPendingTests===0&&unit.testResults.length===tests.length;
save('verification.json',verification);console.log(JSON.stringify(verification));process.exitCode=verification.passed?0:1;
