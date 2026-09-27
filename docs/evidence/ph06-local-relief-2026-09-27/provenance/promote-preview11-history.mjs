import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const stage='.autopilot/ph06/v4-preview11-history-staging';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(v,m)=>{if(!v)throw Error(m);};
const ready=read(`${stage}/ready-manifest.json`),{source,target}=ready.evidence;
assert(!fs.existsSync(target),'Preserve existing history');
assert(hash('dist/build.json')===ready.evidence.buildSha256,'Capture is not current actual build');
const inventory=read(`${source}/inventory.json`);
assert(hash(`${source}/inventory.json`)===ready.evidence.inventorySha256,'Inventory drift');
for(const row of inventory.files)assert(hash(`${source}/${row.path}`)===row.sha256,`Frozen source drift ${row.path}`);
for(const row of ready.files){assert(hash(row.stagedPath)===row.sha256,`Candidate drift ${row.path}`);assert((fs.existsSync(row.path)?hash(row.path):null)===row.baselineSha256,`Baseline drift ${row.path}`);}
fs.mkdirSync(target);
for(const row of [...inventory.files,{path:'inventory.json',sha256:ready.evidence.inventorySha256}]){const dest=`${target}/${row.path}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(`${source}/${row.path}`,dest,fs.constants.COPYFILE_EXCL);assert(hash(dest)===row.sha256,`Copy drift ${dest}`);}
for(const row of ready.files){fs.copyFileSync(row.stagedPath,row.path);assert(hash(row.path)===row.sha256,`Promoted drift ${row.path}`);}
const result={promotedAt:new Date().toISOString(),files:ready.files,evidence:ready.evidence,checksRun:false,cloudWrites:false};
fs.writeFileSync('.autopilot/ph06/preview11-history-promotion.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({promoted:ready.files.length,archive:target,checksRun:false}));
