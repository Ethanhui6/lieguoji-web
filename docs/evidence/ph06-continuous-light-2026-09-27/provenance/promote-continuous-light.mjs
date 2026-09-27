import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(v,m)=>{if(!v)throw Error(m);};
const record='.autopilot/ph06/continuous-light-promotion.json';
assert(!fs.existsSync(record),'Already promoted');
assert(fs.existsSync('docs/evidence/ph06-natural-repair-2026-09-27/verification.json'),'Prior build evidence must remain archived');
const ready=read('.autopilot/ph06/v4-continuous-light-staging/ready-manifest.json');
assert(ready.files.length===2&&ready.status==='ready-for-controlled-promotion','Unexpected scope');
for(const row of ready.files){assert(hash(row.stagedPath)===row.sha256,`Candidate drift ${row.path}`);assert((fs.existsSync(row.path)?hash(row.path):null)===row.baselineSha256,`Baseline drift ${row.path}`);}
for(const file of ['package.json','package-lock.json'])assert(read(file).version==='0.5.0-preview.10',`Version drift ${file}`);
for(const row of ready.files)fs.copyFileSync(row.stagedPath,row.path);
for(const file of ['package.json','package-lock.json']){const p=read(file);p.version='0.5.0-preview.11';if(p.packages?.[''])p.packages[''].version=p.version;fs.writeFileSync(file,JSON.stringify(p,null,2)+'\n');}
fs.writeFileSync(record,JSON.stringify({promotedAt:new Date().toISOString(),files:ready.files,priorVersion:'0.5.0-preview.10',version:'0.5.0-preview.11',rootChecksRun:false,actualVisualAccepted:false,cloudWrites:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({promoted:ready.files.length,version:'0.5.0-preview.11',checksRun:false}));
