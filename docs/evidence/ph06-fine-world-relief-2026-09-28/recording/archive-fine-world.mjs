// Record completed local evidence only. Never run checks or change their verdict.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const target='docs/evidence/ph06-fine-world-relief-2026-09-28';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
if(fs.existsSync(target))throw Error('Immutable archive already exists');
const checks='.autopilot/ph06/fine-world-checks',browser='.autopilot/ph06/fine-world-browser';
const rounds=fs.readdirSync(checks,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>({name:e.name,...read(`${checks}/${e.name}/verification.json`)}));
const runs=fs.readdirSync(browser,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>({name:e.name,...read(`${browser}/${e.name}/verification.json`)}));
if(!rounds.length||rounds.some(r=>!r.results.length||r.results.some(x=>!Number.isInteger(x.exitCode))))throw Error('Unfinished checks');
if(runs.some(r=>!Number.isInteger(r.code)||!r.completedAt))throw Error('Unfinished browser');
const passing=runs.filter(r=>r.passed);
if(new Set(passing.map(r=>r.project)).size!==3)throw Error('Need completed three-device evidence');
const final=rounds.find(r=>r.name===passing[0].checkRound);
if(!final?.passed||passing.some(r=>r.checkRound!==final.name||r.prerequisiteBuildJsonSha256!==final.buildJsonSha256)||hash('dist/build.json')!==final.buildJsonSha256)throw Error('Mismatched checked actual build');
const selected=new Map();
const add=(source,dest)=>{if(selected.has(dest))throw Error('Duplicate destination');const st=fs.lstatSync(source);if(!st.isFile()||st.isSymbolicLink())throw Error('Not regular');selected.set(dest,{source,path:dest,bytes:st.size,sha256:hash(source)});};
const skip=new Set(['node_modules','dist','resources','trace','trace-unpacked','playwright-report']);
const allowed=new Set(['.ts','.tsx','.mjs','.json','.md','.log','.png','.zip','.webm','.txt']);
function tree(source,dest){for(const e of fs.readdirSync(source,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Symlink');const src=`${source}/${e.name}`,out=`${dest}/${e.name}`;if(e.isDirectory()){if(!skip.has(e.name))tree(src,out);}else if(allowed.has(path.extname(e.name)))add(src,out);}}
tree(checks,'unified');tree(browser,'browser');tree('.autopilot/ph06/fine-world-relief-staging','initial-candidate');
if(fs.existsSync('.autopilot/ph06/fine-world-density-repair'))tree('.autopilot/ph06/fine-world-density-repair','density-repair');
for(const name of ['promote-fine-world.mjs','setup-fine-world-checks.mjs','archive-fine-world.mjs','record-fine-world.mjs'])add(`.autopilot/ph06/${name}`,`recording/${name}`);
add('.autopilot/ph06/fine-world-visual-review.json','visual-review.json');
for(const f of ['src/world/generation/detail-natural-relief.ts','src/world/generation/detail-orography.ts','src/world/generation/detail-shape-natural.ts','src/world/generation/detail-fine-world-relief.test.ts','src/world/generation-history.ts','src/world/generation-preview18-history.test.ts','tests/atlas-add-detail-coast.spec.ts'])add(f,`source/${f}`);
const rows=[...selected.values()];
for(const r of rows){const dest=`${target}/${r.path}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(r.source,dest,fs.constants.COPYFILE_EXCL);if(hash(dest)!==r.sha256)throw Error('Copy mismatch');}
fs.writeFileSync(`${target}/files.sha256.json`,JSON.stringify({files:rows},null,2)+'\n',{flag:'wx'});
const summary={recordedAt:new Date().toISOString(),archiveComplete:true,rawFileCount:rows.length,rawBytes:rows.reduce((n,r)=>n+r.bytes,0),inventorySha256:hash(`${target}/files.sha256.json`),finalRound:final.name,version:'0.5.0-preview.20',buildJsonSha256:final.buildJsonSha256,unit:final.unit,browsers:passing.map(r=>({name:r.name,project:r.project,passed:r.passed,elapsedMs:r.elapsedMs})),rounds:rounds.map(r=>({name:r.name,passed:r.passed,unit:r.unit})),naturalVisualAccepted:false,phaseAccepted:false,physicalDeviceAccepted:false,cloudWrites:false};
fs.writeFileSync(`${target}/verification.json`,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({archive:target,rawFileCount:rows.length,rawBytes:summary.rawBytes,finalRound:final.name,browsers:summary.browsers}));
