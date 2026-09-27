import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const blob=p=>execFileSync('git',['show',`:${p}`],{maxBuffer:32*1024*1024});
const blobHash=p=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');const c=spawn('git',['show',`:${p}`]);c.stdout.on('data',b=>h.update(b));c.on('error',reject);c.on('close',code=>code===0?resolve(h.digest('hex')):reject(Error(`git show exit ${code}: ${p}`)));});
const base='docs/evidence/ph06-additive-2026-09-27';
let archiveFiles=0,historySources=0;
for(const row of read(`${base}/inventory.json`).files){const p=`${base}/${row.dest}`;if(await blobHash(p)!==row.sha256)throw Error(`Index archive drift ${p}`);archiveFiles++;}
const history='docs/evidence/ph06-preview7-generator-history-2026-09-27';
const provenance=read(`${history}/provenance.json`);
for(const row of provenance.archivedSources){const p=`${history}/frozen-source/${row.file}`;if(hash(blob(p))!==row.sha256)throw Error(`Index history drift ${p}`);historySources++;}
const files=execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
for(const p of files){if(/(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|credentials|auth(?:entication)?\.json)(\/|$)/i.test(p))throw Error(`Forbidden staged path ${p}`);}
const production=files.filter(p=>/^(src|scripts|tests)\//.test(p)||/^(package.*\.json|vite.config.ts)$/.test(p));
for(const p of production){const value=blob(p).toString();if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[0-9A-Z]{16}/.test(value))throw Error(`Potential secret in ${p}`);}
execFileSync('git',['diff','--cached','--check','--','.',':(exclude)docs/evidence/ph06-additive-2026-09-27',':(exclude)docs/evidence/ph06-preview7-generator-history-2026-09-27'],{stdio:'pipe'});
const result={checkedAt:new Date().toISOString(),archiveFiles,historySources,stagedFiles:files.length,productionFiles:production.length,immutableRawBytesPreserved:true,whitespaceScope:'staged changes excluding immutable additive evidence and preview7 source history',pathAndCommonSecretPatternCheck:true,cloudWrites:false};
fs.writeFileSync('.autopilot/ph06/preview8-index-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
