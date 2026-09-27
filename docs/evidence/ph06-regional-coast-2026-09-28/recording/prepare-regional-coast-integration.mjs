import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const base='.autopilot/ph06/regional-coast-staging', hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(file,'utf8');
const ready=JSON.parse(read(`${base}/ready-manifest.json`));
if(hash(fs.readFileSync(`${base}/ready-manifest.json`))!=='ae88743bd6d384d9efac316f96a564917c7c3dd90b31c69da64a8d0b9adcd7e9')throw Error('Candidate changed');
const frozen='docs/evidence/ph06-preview20-generator-history-2026-09-28/frozen-source';
// Run only after the review is complete. Copy the two reviewed modules, not
// the staged dependency proxies or staged build configuration.
if(!fs.existsSync(`${base}/integration-review.md`))throw Error('Await integration review');
for(const file of ready.candidates){
 const before=ready.productionBaseline.find(row=>row.file===file), candidate=ready.runtimeSourceOverlay.find(row=>row.file===file&&row.staged);
 if(!before||!candidate||hash(fs.readFileSync(file))!==before.sha256||hash(fs.readFileSync(`${base}/${file}`))!==candidate.sha256)throw Error(`Source drift: ${file}`);
}
const fixture='src/world/generation/test-fixtures/preview20-coast';
if(fs.existsSync(fixture))throw Error('Fixture already exists');
fs.mkdirSync(fixture,{recursive:true});
const originals={},fixtures={};
for(const file of ['detail-natural-outline.ts','seed.ts','detail-shape.ts']){
 const source=`src/world/generation/${file}`, bytes=fs.readFileSync(`${frozen}/${source}`);
 originals[file]={path:source,sha256:hash(bytes),bytes:bytes.length};
 let output=bytes,kind='Complete exact frozen source';
 if(file==='detail-shape.ts'){
  const s=bytes.toString('utf8'), ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true), decl=ast.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='DetailShapeControl');
  if(!decl)throw Error('Missing frozen type');
  output=Buffer.from('/** Test-only immutable preview20 coast oracle type. See SOURCE_MANIFEST.json. */\n'+s.slice(decl.getStart(ast),decl.end)+'\n');kind='Exact original DetailShapeControl declaration plus test-only header';
 }
 fs.writeFileSync(`${fixture}/${file}`,output,{flag:'wx'});fixtures[file]={sha256:hash(output),bytes:output.length,kind};
}
fs.writeFileSync(`${fixture}/SOURCE_MANIFEST.json`,JSON.stringify({purpose:'Independent immutable preview20 small/zero coast oracle; never imported by production.',sourceCommit:'4b387f95f5e890f20915a9ab5de4a93c058e5a62',originalBuildSha256:'71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018',originals,fixtures},null,2)+'\n',{flag:'wx'});
for(const file of ready.candidates)fs.writeFileSync(file,fs.readFileSync(`${base}/${file}`));
for(const file of ['src/world/generation/regional-coast-plan.test.ts','src/world/generation/regional-coast-field.test.ts','src/world/regional-coast-storage.test.ts']){
 let source=read(`${base}/${file}`);
 if(file.endsWith('regional-coast-plan.test.ts'))source=source.replace("from '../../../baseline/detail-natural-outline'","from './test-fixtures/preview20-coast/detail-natural-outline'");
 fs.writeFileSync(file,source,{flag:'wx'});
}
for(const file of ['package.json','package-lock.json']){const data=JSON.parse(read(file));if(data.version!=='0.5.0-preview.20')throw Error('Wrong old version');data.version='0.5.0-preview.21';if(data.packages)data.packages[''].version=data.version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
const checks='.autopilot/ph06/regional-coast-checks';fs.mkdirSync(checks,{recursive:true});
fs.copyFileSync(`${frozen}/../build.json`,`${checks}/baseline-build.json`,fs.constants.COPYFILE_EXCL);
let runner=read('.autopilot/ph06/fine-world-checks/run.mjs');
runner=runner.replaceAll('fine-world-checks','regional-coast-checks').replaceAll('ph06-preview18-generator-history','ph06-preview20-generator-history').replaceAll('0.5.0-preview.18','0.5.0-preview.20').replaceAll('0.5.0-preview.20\'','0.5.0-preview.21\'');
// The previous replacement also touched the baseline assertion: keep the real prior version.
runner=runner.replace("baseline.version !== '0.5.0-preview.21'","baseline.version !== '0.5.0-preview.20'");
runner=runner.replaceAll('444d8380a0a4a5c8a42f99c7baeb3dfc5d0ef30b303f4e8571e622f27babdcd5','71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018');
runner=runner.replace('const unitFiles = [','const unitFiles = [\n  "src/world/generation/regional-coast-plan.test.ts",\n  "src/world/generation/regional-coast-field.test.ts",\n  "src/world/regional-coast-storage.test.ts",\n  "src/world/generation-preview20-history.test.ts",');
runner=runner.replace('const knownCaseCounts = {','const knownCaseCounts = {\n  "src/world/generation/regional-coast-plan.test.ts": 3,\n  "src/world/generation/regional-coast-field.test.ts": 3,\n  "src/world/regional-coast-storage.test.ts": 1,\n  "src/world/generation-preview20-history.test.ts": 5,');
runner=runner.replaceAll('fine-world-${label}','regional-coast-${label}').replaceAll('preview18 baseline','preview20 baseline').replaceAll('actual preview18 stored history','actual preview20 stored history').replaceAll('promoted preview20','promoted preview21');
runner=runner.replace('Explicit 2-world physical relief in new natural and additive generation, unchanged unflagged/local oracle, locking and original field protection, actual preview20 stored history and eleven closure identities. Twenty affected files; visual and browser evidence are separate.','Regional bay/cape/fractured/quiet coast fields, exact prior small/zero modes, 12-world channel and neck, persistence/cancel/add, unchanged fine-relief and local regression, actual preview20 stored history and eleven closure identities. Twenty-four selected files; visual and browser evidence are separate.');
fs.writeFileSync(`${checks}/run.mjs`,runner,{flag:'wx'});
const browser='.autopilot/ph06/regional-coast-browser';fs.mkdirSync(browser,{recursive:true});
for(const file of ['run.mjs','playwright.config.ts'])fs.writeFileSync(`${browser}/${file}`,read(`.autopilot/ph06/fine-world-browser/${file}`).replaceAll('fine-world-browser','regional-coast-browser').replaceAll('fine-world-checks','regional-coast-checks').replaceAll('FINE_WORLD_','REGIONAL_COAST_'),{flag:'wx'});
fs.writeFileSync(`${checks}/integration.json`,JSON.stringify({at:new Date().toISOString(),candidateReadySha256:hash(fs.readFileSync(`${base}/ready-manifest.json`)),runtime:ready.candidates,fixture,sourceChecked:false,productionBuilt:false,cloudWrites:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({runtime:ready.candidates,fixture,checks,browser}));
