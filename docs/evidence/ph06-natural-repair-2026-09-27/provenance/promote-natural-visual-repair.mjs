import fs from 'node:fs';import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(v,m)=>{if(!v)throw Error(m);};
const root='.autopilot/ph06/v4-natural-visual-repair-staging',record='.autopilot/ph06/natural-visual-repair-promotion.json';
assert(!fs.existsSync(record),'Already promoted');
assert(fs.existsSync('docs/evidence/ph06-natural-2026-09-27/verification.json'),'Prior actual checks must remain archived');
assert(fs.existsSync('docs/evidence/ph06-preview9-generator-history-2026-09-27/provenance.json'),'Prior real history must remain archived');
const ready=read(`${root}/ready-manifest.json`);
const files=ready.files.map(row=>{assert(hash(row.stagedPath)===row.sha256,`Candidate drift ${row.path}`);assert((fs.existsSync(row.path)?hash(row.path):null)===row.baselineSha256,`Production drift ${row.path}`);return row;});
for(const p of ['package.json','package-lock.json'])assert(read(p).version==='0.5.0-preview.9',`Unexpected version ${p}`);
for(const row of files)fs.copyFileSync(row.stagedPath,row.path);
for(const file of ['package.json','package-lock.json']){const p=read(file);p.version='0.5.0-preview.10';if(p.packages?.[''])p.packages[''].version=p.version;fs.writeFileSync(file,JSON.stringify(p,null,2)+'\n');}
fs.writeFileSync(record,JSON.stringify({promotedAt:new Date().toISOString(),files,priorVersion:'0.5.0-preview.9',version:'0.5.0-preview.10',priorVisualAccepted:false,productVisualAccepted:false,checksRun:false,cloudWrites:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({promoted:files.length,version:'0.5.0-preview.10',checksRun:false}));
