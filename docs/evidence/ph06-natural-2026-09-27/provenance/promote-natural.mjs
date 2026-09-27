import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const integration='.autopilot/ph06/v4-natural-integration-staging';
const kernel='.autopilot/ph06/v4-natural-staging';
const ocean='.autopilot/ph06/v4-natural-ocean-staging';
const record='.autopilot/ph06/natural-promotion.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
assert(!fs.existsSync(record),'Promotion already recorded');
const prior=read('docs/evidence/ph06-additive-2026-09-27/verification.json');
assert(prior.archiveComplete===true&&prior.cloudWrites===false,'Preserve the actual preceding checks before continuing the same unfinished PH06 work');
const targets=new Map();
for(const [dir,list] of [[integration,read(`${integration}/ready-manifest.json`).files],[kernel,read(`${kernel}/ready-manifest.json`).files],[ocean,read(`${ocean}/ready-manifest.json`).files]]){
  for(const row of list){
    assert(/^(src|scripts|tests)\//.test(row.path)||row.path==='vite.config.ts',`Unexpected target ${row.path}`);
    assert(!targets.has(row.path),`Duplicate target ${row.path}`);
    const source=row.stagedPath??`${dir}/${row.path}`,expected=row.sha256??row.stagedSha256;
    assert(hash(source)===expected,`Candidate drift ${source}`);
    const baseline=row.baselineSha256??null,actual=fs.existsSync(row.path)?hash(row.path):null;
    assert(actual===baseline,`Production drift ${row.path}`);
    targets.set(row.path,{source,baseline,sha256:expected,bytes:fs.readFileSync(source)});
  }
}
const patched=new Map();
for(const name of ['ui-patches.json','entry-browser-patches.json']){
  const data=read(`${integration}/${name}`);
  for(const row of data.baselines)assert(hash(row.path)===row.baselineSha256,`UI baseline drift ${row.path}`);
  for(const row of data.patches){
    assert(!targets.has(row.path),`Cannot mirror incremental UI ${row.path}`);
    const value=patched.get(row.path)??{baseline:hash(row.path),text:fs.readFileSync(row.path,'utf8')};
    const crlf=value.text.includes('\r\n');
    assert(!crlf||!value.text.replaceAll('\r\n','').includes('\n'),`Mixed line endings: ${row.path}`);
    const normalized=s=>s.replaceAll('\r\n','\n').replaceAll('\n',crlf?'\r\n':'\n');
    const before=normalized(row.before),after=normalized(row.after),count=value.text.split(before).length-1;
    assert(count===(row.occurrences??1),`Patch occurrence drift ${row.path}/${row.label}: ${count}`);
    value.text=value.text.split(before).join(after);patched.set(row.path,value);
  }
}
const historySource=`${integration}/evidence/preview8`,historyTarget='docs/evidence/ph06-preview8-generator-history-2026-09-27';
assert(!fs.existsSync(historyTarget),'History archive already exists');
const provenance=read(`${historySource}/provenance.json`);
assert(hash(`${historySource}/build.json`)===hash('dist/build.json'),'Actual prior build changed');
for(const row of provenance.archivedSources)assert(hash(`${historySource}/frozen-source/${row.file}`)===row.sha256,`Historical source drift ${row.file}`);
function copyTree(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){assert(!e.isSymbolicLink(),'No symlink archives');const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())copyTree(a,b);else {fs.copyFileSync(a,b,fs.constants.COPYFILE_EXCL);assert(hash(a)===hash(b),'Archive byte drift');}}}
copyTree(historySource,historyTarget);
for(const [target,item] of targets){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,item.bytes);}
for(const [target,item] of patched)fs.writeFileSync(target,item.text);
const rule='docs/evidence/ph06-preview8-generator-history-2026-09-27/** -text';
if(!fs.readFileSync('.gitattributes','utf8').includes(rule))fs.appendFileSync('.gitattributes',`\n${rule}\n`);
for(const file of ['package.json','package-lock.json']){const p=read(file);assert(p.version==='0.5.0-preview.8','Unexpected prior version');p.version='0.5.0-preview.9';if(p.packages?.[''])p.packages[''].version=p.version;fs.writeFileSync(file,JSON.stringify(p,null,2)+'\n');}
fs.writeFileSync(record,JSON.stringify({promotedAt:new Date().toISOString(),priorAllChecksPassed:prior.allRequiredPassed,priorEvidence:'docs/evidence/ph06-additive-2026-09-27/verification.json',mirrored:[...targets].map(([file,r])=>({file,source:r.source,before:r.baseline,after:hash(file)})),incremental:[...patched].map(([file,r])=>({file,before:r.baseline,after:hash(file)})),historyTarget,version:'0.5.0-preview.9',checksRun:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({mirrors:targets.size,incremental:patched.size,version:'0.5.0-preview.9',checksRun:false}));
