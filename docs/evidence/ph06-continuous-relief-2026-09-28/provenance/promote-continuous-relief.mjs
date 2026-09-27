import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const previous=read('docs/evidence/ph06-lock-snapshot-2026-09-27/verification.json');if(!previous.archiveComplete||previous.pending.length)throw Error('Prior terminal archive missing');
const stages=['v4-preview13-history-staging','v4-curved-relief-staging','v4-local-background-staging','v4-lock-render-reuse-staging'];const files=[];
for(const stage of stages){const dir='.autopilot/ph06/'+stage,ready=read(dir+'/ready-manifest.json');for(const f of ready.files){const source=f.stagedPath??dir+'/'+f.path;if(hash(source)!==f.sha256)throw Error('Candidate drift '+source);if((fs.existsSync(f.path)?hash(f.path):null)!==f.baselineSha256)throw Error('Production drift '+f.path);files.push({source,target:f.path,beforeSha256:f.baselineSha256,afterSha256:hash(source)});}}
if(new Set(files.map(f=>f.target)).size!==files.length)throw Error('Duplicate source ownership');
const history=read('.autopilot/ph06/v4-preview13-history-staging/ready-manifest.json').evidence;
if(hash('dist/build.json')!==history.buildSha256)throw Error('History is not actual prior build');
const inventory=read(history.source+'/inventory.json');if(fs.existsSync(history.target))throw Error('History destination exists');
for(const item of inventory.files)if(hash(history.source+'/'+(item.dest??item.path))!==item.sha256)throw Error('Frozen history mismatch');
const pkg=read('package.json'),lock=read('package-lock.json');if(pkg.version!=='0.5.0-preview.13'||lock.version!==pkg.version)throw Error('Version drift');
const checks='.autopilot/ph06/continuous-relief-checks';if(fs.existsSync(checks))throw Error('Batch exists');fs.mkdirSync(checks);fs.copyFileSync('dist/build.json',checks+'/baseline-build.json',fs.constants.COPYFILE_EXCL);
fs.cpSync(history.source,history.target,{recursive:true,errorOnExist:true,force:false});
for(const item of inventory.files)if(hash(history.target+'/'+(item.dest??item.path))!==item.sha256)throw Error('History copy mismatch');
for(const f of files){fs.mkdirSync(path.dirname(f.target),{recursive:true});fs.copyFileSync(f.source,f.target);if(hash(f.target)!==f.afterSha256)throw Error('Copy mismatch');}
pkg.version=lock.version=lock.packages[''].version='0.5.0-preview.14';for(const [p,v] of [['package.json',pkg],['package-lock.json',lock]])fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const attrs=fs.readFileSync('.gitattributes','utf8'),rule=history.target+'/** -text';if(!attrs.includes(rule))fs.appendFileSync('.gitattributes',rule+'\n');
fs.writeFileSync('.autopilot/ph06/continuous-relief-promotion.json',JSON.stringify({recordedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,history,version:pkg.version,previousMobileFailureRetained:true,checksRun:[],cloudWrites:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({targets:files.length,version:pkg.version,history:history.target}));
