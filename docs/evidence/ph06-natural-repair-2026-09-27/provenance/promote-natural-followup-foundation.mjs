import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const record='.autopilot/ph06/natural-followup-foundation-promotion.json';assert(!fs.existsSync(record),'Already promoted');
const files=[];
for(const name of ['v4-owned-replacement-copy-staging','v4-preview9-history-staging']){
  const dir=`.autopilot/ph06/${name}`;
  for(const row of read(`${dir}/ready-manifest.json`).files){const source=row.stagedPath??`${dir}/${row.path}`,expected=row.sha256??row.stagedSha256;assert(hash(source)===expected,`Candidate changed ${source}`);assert((fs.existsSync(row.path)?hash(row.path):null)===row.baselineSha256,`Baseline changed ${row.path}`);files.push({...row,source,expected});}
}
const staging='.autopilot/ph06/v4-preview9-history-staging', evidence=read(`${staging}/ready-manifest.json`).evidence;
assert(hash('dist/build.json')===evidence.buildSha256,'Actual previous build drift');assert(!fs.existsSync(evidence.target),'History already archived');
for(const row of read(`${evidence.source}/inventory.json`).files)assert(hash(`${evidence.source}/${row.path}`)===row.sha256,`History drift ${row.path}`);
function copyTree(a,b){fs.mkdirSync(b,{recursive:true});for(const row of fs.readdirSync(a,{withFileTypes:true})){assert(!row.isSymbolicLink(),'Symlink refused');const x=path.join(a,row.name),y=path.join(b,row.name);if(row.isDirectory())copyTree(x,y);else{fs.copyFileSync(x,y,fs.constants.COPYFILE_EXCL);assert(hash(x)===hash(y),'Copy byte drift');}}}
copyTree(evidence.source,evidence.target);
for(const row of files)fs.copyFileSync(row.source,row.path);
fs.appendFileSync('.gitattributes',`\n${evidence.target}/** -text\n`);
fs.writeFileSync(record,JSON.stringify({promotedAt:new Date().toISOString(),files,history:evidence,cloudWrites:false,checksRun:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({promoted:files.length,historySources:evidence.sourceFiles,checksRun:false}));
