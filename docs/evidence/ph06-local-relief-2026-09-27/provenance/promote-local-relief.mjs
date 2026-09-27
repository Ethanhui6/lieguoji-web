import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(v,m)=>{if(!v)throw Error(m);};
const record='.autopilot/ph06/local-relief-promotion.json';assert(!fs.existsSync(record),'Already promoted');
assert(fs.existsSync('docs/evidence/ph06-preview11-generator-history-2026-09-27/provenance.json'),'Preserve the real prior source identity first');
const integration='.autopilot/ph06/v4-local-relief-integration-staging';
const own=read(`${integration}/baseline-manifest.json`).files;
for(const p of ['src/world/generation/local-detail-relief-adapter.ts','src/world/detail-local-relief-session.test.ts'])own.push({path:p,stagedPath:`${integration}/${p}`,baselineSha256:null});
const review=read('.autopilot/ph06/local-relief-root-ready.json');
const manifests=[read('.autopilot/ph06/v4-local-relief-staging/ready-manifest.json'),read('.autopilot/ph06/v4-local-relief-ui-staging/ready-manifest.json'),read('.autopilot/ph06/v4-local-relief-browser-staging/ready-manifest.json')];
const files=[...own.map(row=>({...row,sha256:hash(row.stagedPath)})),...manifests.flatMap(x=>x.files)];
assert(review.status==='ready-for-integration-checks','Root must finish review before promotion');
assert(new Set(files.map(row=>row.path)).size===files.length,'Overlapping candidate ownership');
for(const row of files){assert(/^(src|scripts|tests)\//.test(row.path)||row.path==='vite.config.ts',`Unexpected candidate ${row.path}`);assert(hash(row.stagedPath)===row.sha256,`Candidate drift ${row.path}`);assert((fs.existsSync(row.path)?hash(row.path):null)===row.baselineSha256,`Production drift ${row.path}`);}
for(const row of review.files)assert(hash(row.stagedPath)===row.sha256,`Root review snapshot drift ${row.stagedPath}`);
for(const p of ['package.json','package-lock.json'])assert(read(p).version==='0.5.0-preview.11',`Unexpected version ${p}`);
for(const row of files){fs.mkdirSync(path.dirname(row.path),{recursive:true});fs.copyFileSync(row.stagedPath,row.path);assert(hash(row.path)===row.sha256,`Promoted drift ${row.path}`);}
for(const p of ['package.json','package-lock.json']){const v=read(p);v.version='0.5.0-preview.12';if(v.packages?.[''])v.packages[''].version=v.version;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
fs.writeFileSync(record,JSON.stringify({promotedAt:new Date().toISOString(),files,priorVersion:'0.5.0-preview.11',version:'0.5.0-preview.12',checksRun:false,visualAccepted:false,cloudWrites:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,version:'0.5.0-preview.12',checksRun:false}));
