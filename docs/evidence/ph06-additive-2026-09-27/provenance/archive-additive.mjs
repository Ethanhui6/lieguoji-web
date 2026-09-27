/** Prepare immutable local evidence only. Never runs tests/builds or writes Git,
 * plan, handoff, cloud resources or production files.
 *
 * Usage (pass every completed browser attempt, including failed attempts):
 * node .autopilot/ph06/archive-additive.mjs \
 *   --audit .autopilot/ph06/v4-confirm-latency-audit.md \
 *   --check .autopilot/ph06/additive-checks/repair-io \
 *   --browser .autopilot/ph06/additive-checks/desktop-first \
 *   --browser .autopilot/ph06/additive-checks/desktop-repair1 \
 *   --browser .autopilot/ph06/additive-checks/mobile-first \
 *   --browser .autopilot/ph06/additive-checks/tablet-first
 * Repeated --check <directory> adds actual repair runs; first is always retained.
 * --audit accepts explicit completed local markdown audits. Browser/audit paths
 * have no default. This script has not been executed by its editing agent.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const target='docs/evidence/ph06-additive-2026-09-27';
const checksRoot='.autopilot/ph06/additive-checks';
const relief='.autopilot/ph06/v4-relief-staging';
const kernel='.autopilot/ph06/v4-additive-staging';
const integration='.autopilot/ph06/v4-additive-integration-staging';
const locks='.autopilot/ph06/v4-lock-staging';
const ingress='.autopilot/ph06/v4-private-ingress-staging';
const pages='.autopilot/ph06/v4-stage-page-staging';
const fail=message=>{throw new Error(message);};
const assert=(condition,message)=>{if(!condition)fail(message);};
const unix=p=>p.replaceAll('\\','/');
function absolute(p){const resolved=path.resolve(root,p),relative=path.relative(root,resolved);assert(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative),`Outside workspace: ${p}`);return resolved;}
function relative(p){return unix(path.relative(root,absolute(p)));}
const exists=p=>fs.existsSync(absolute(p));
const bytes=p=>fs.readFileSync(absolute(p));
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const hash=p=>digest(bytes(p));
const read=p=>JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/,''));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
assert(!exists(target),`Archive already exists; refusing overwrite: ${target}`);

const checkDirs=[`${checksRoot}/first`],browserDirs=[],auditFiles=[];
for(let i=2;i<process.argv.length;i+=2){
  const flag=process.argv[i],value=process.argv[i+1];
  assert(value&&['--check','--browser','--audit'].includes(flag),'Use repeated --browser <actual-directory>, --check <repair-directory> and --audit <local-markdown>');
  const selected=relative(value);
  if(flag==='--audit'){assert(/^\.autopilot\/ph06\/[a-z0-9-]+\.md$/.test(selected),`Expected explicit local ph06 audit markdown: ${selected}`);auditFiles.push(selected);continue;}
  assert(selected.startsWith(`${checksRoot}/`)&&selected.slice(checksRoot.length+1).match(/^[a-z0-9-]+$/),`Expected explicit direct child of ${checksRoot}: ${selected}`);
  (flag==='--check'?checkDirs:browserDirs).push(selected);
}
assert(browserDirs.length>0,'No default browser evidence: supply completed actual --browser directories explicitly');
assert(auditFiles.includes('.autopilot/ph06/v4-confirm-latency-audit.md'),'Retain the confirmation-latency audit explicitly with --audit .autopilot/ph06/v4-confirm-latency-audit.md');
const unique=a=>[...new Set(a)];
const files=new Map();
function add(source,dest){assert(exists(source),`Required evidence missing: ${source}`);assert(fs.lstatSync(absolute(source)).isFile(),`Not a regular evidence file: ${source}`);assert(!files.has(dest),`Duplicate archive destination: ${dest}`);files.set(dest,{source,dest,bytes:fs.statSync(absolute(source)).size,sha256:hash(source)});}
function addNames(sourceRoot,destRoot,names){for(const name of names)add(`${sourceRoot}/${name}`,`${destRoot}/${name}`);}
function entries(dir){return fs.readdirSync(absolute(dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));}
function artifactFiles(dir){return entries(dir).flatMap(e=>{if(e.name.startsWith('.')||['resources','vite-cache','cache','node_modules','dist','playwright-report'].includes(e.name))return [];const p=`${dir}/${e.name}`;assert(!e.isSymbolicLink(),`Refusing artifact symlink ${p}`);return e.isDirectory()?artifactFiles(p):e.isFile()&&/\.(json|log|md|png|jpe?g|webp|zip)$/.test(e.name)?[p]:[];});}
function snapshot(rows){assert(Array.isArray(rows),'Missing hash snapshot');return rows.map(row=>({path:unix(row.path??row.file),sha256:row.sha256})).sort((a,b)=>a.path.localeCompare(b.path));}
function stable(before,after){return same(snapshot(before),snapshot(after));}
function currentMatch(rows){return snapshot(rows).map(row=>{assert(/^(src\/|scripts\/|tests\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(row.path),`Unexpected current-source path: ${row.path}`);return {path:row.path,expected:row.sha256,actual:exists(row.path)?hash(row.path):null};}).filter(row=>row.expected!==row.actual);}
function unitSummary(report){
  if(!report)return null;
  const assertions=(report.testResults??[]).flatMap(file=>{
    const name=unix(file.name),sourceFile=name.includes('/src/')?`src/${name.split('/src/').at(-1)}`:name;
    return (file.assertionResults??[]).map(t=>({id:`${sourceFile}::${t.fullName}`,sourceFile,status:t.status}));
  });
  assert(new Set(assertions.map(t=>t.id)).size===assertions.length,'Duplicate unit identity in one report; cannot silently deduplicate distinct executions');
  return {reported:{total:report.numTotalTests,passed:report.numPassedTests,failed:report.numFailedTests,pending:report.numPendingTests,failedSuites:report.numFailedTestSuites,success:report.success},observed:{total:assertions.length,passed:assertions.filter(x=>x.status==='passed').length,failed:assertions.filter(x=>x.status==='failed').length},assertions};
}

const rootRuns=[];
for(const dir of unique(checkDirs)){
  for(const name of ['verification.json','source-before.json','source-after.json','scope.json'])assert(exists(`${dir}/${name}`),`Root runner not finished: ${dir}/${name}`);
  const v=read(`${dir}/verification.json`),before=read(`${dir}/source-before.json`),after=read(`${dir}/source-after.json`);
  assert(Array.isArray(v.results)&&v.results.length>0,`Root exit records missing: ${dir}`);
  for(const check of v.results)assert(typeof check.name==='string'&&Number.isFinite(Date.parse(check.finishedAt))&&(Number.isInteger(check.exitCode)||check.signal!==null&&check.signal!==undefined),`Check not ended: ${dir}/${check.name}`);
  const actualStable=stable(before,after),exitPassed=v.results.every(r=>r.exitCode===0&&r.signal===null),required=['plan','lint','types','unit','build','dist-audit'];
  const allRequired=required.every(name=>v.results.some(r=>r.name===name&&r.exitCode===0&&r.signal===null));
  const unit=exists(`${dir}/unit.json`)?unitSummary(read(`${dir}/unit.json`)):null;
  const unitConsistent=!!unit&&unit.reported.success===true&&unit.reported.failed===0&&unit.reported.failedSuites===0&&unit.reported.passed===unit.observed.passed&&unit.observed.failed===0;
  const name=path.basename(dir),dest=`raw/root/${name}`;
  addNames(dir,dest,['verification.json','source-before.json','source-after.json','scope.json']);
  for(const check of v.results)add(`${dir}/${check.name}.log`,`${dest}/${check.name}.log`);
  if(unit)add(`${dir}/unit.json`,`${dest}/unit.json`);
  if(exists(`${dir}/build.json`))add(`${dir}/build.json`,`${dest}/build.json`);
  rootRuns.push({name,dir,verification:v,sourceStable:actualStable,claimedStable:v.sourceStable,stabilityClaimMatches:v.sourceStable===actualStable,exitPassed,allRequired,unit,passed:exitPassed&&allRequired&&unitConsistent&&actualStable&&v.sourceStable===true,before,after,finishedAt:v.results.at(-1).finishedAt});
}
rootRuns.sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt));
const latestRoot=rootRuns.at(-1);
// Only real promoted root checks contribute to final unique unit coverage.
// A targeted repair supersedes the same file/fullName identity; it does not
// turn unexecuted/pending selections into PASS or add duplicate staging cases.
const mergedUnits=new Map(),unexecutedUnitObservations=[];let rootUnitExecutions=0;
for(const run of rootRuns)for(const assertion of run.unit?.assertions??[]){
  if(!['passed','failed'].includes(assertion.status)){unexecutedUnitObservations.push({...assertion,run:run.name});continue;}
  rootUnitExecutions++;
  const previous=mergedUnits.get(assertion.id);
  mergedUnits.set(assertion.id,{...assertion,firstRun:previous?.firstRun??run.name,sourceRun:run.name,history:[...(previous?.history??[]),{run:run.name,status:assertion.status}]});
}
const latestTestSources=new Map(snapshot(latestRoot.after).map(row=>[row.path,row.sha256]));
const unitSourceMaps=new Map(rootRuns.map(run=>[run.name,new Map(snapshot(run.after).map(row=>[row.path,row.sha256]))]));
const uniqueUnitAssertions=[...mergedUnits.values()].sort((a,b)=>a.id.localeCompare(b.id));
const staleUnitSourceFiles=unique(uniqueUnitAssertions.filter(row=>{
  const previous=unitSourceMaps.get(row.sourceRun)?.get(row.sourceFile),latest=latestTestSources.get(row.sourceFile);
  return !previous||!latest||previous!==latest;
}).map(row=>row.sourceFile));
const combinedUnits={identity:'normalized src file path + fullName',source:'Executed assertions from supplied root runs only; staging never contributes to this union',
  baselineRun:rootRuns[0].name,baselineObserved:rootRuns[0].unit?.observed??null,total:uniqueUnitAssertions.length,
  passed:uniqueUnitAssertions.filter(row=>row.status==='passed').length,failed:uniqueUnitAssertions.filter(row=>row.status==='failed').length,
  rootAssertionExecutions:rootUnitExecutions,repeatedIdentities:rootUnitExecutions-uniqueUnitAssertions.length,
  reusedFromEarlierRootRuns:uniqueUnitAssertions.filter(row=>row.sourceRun!==latestRoot.name).length,
  latestRunObserved:latestRoot.unit?.observed??null,staleUnitSourceFiles,unexecutedUnitObservations,assertions:uniqueUnitAssertions,
  note:'Reused results are not reruns on the latest source. Scope/reuse decisions remain in each root scope.json; matching test-file hashes alone does not prove every transitive dependency unchanged.'};
const combinedUnitsPassed=combinedUnits.total>0&&combinedUnits.failed===0&&combinedUnits.passed===combinedUnits.total&&staleUnitSourceFiles.length===0;

const browserRuns=[],projects=['desktop-chromium','mobile-chromium','tablet-chromium'];
for(const dir of unique(browserDirs)){
  for(const name of ['verification.json','before.json','after.json','results.json','run.log','build.json'])assert(exists(`${dir}/${name}`),`Browser runner not finished: ${dir}/${name}`);
  const v=read(`${dir}/verification.json`),report=read(`${dir}/results.json`),before=read(`${dir}/before.json`),after=read(`${dir}/after.json`);
  assert(projects.includes(v.project)&&(Number.isInteger(v.code)||v.signal!==null&&v.signal!==undefined)&&Number.isFinite(report.stats?.duration)&&Number.isFinite(Date.parse(report.stats.startTime)),`Browser end metadata missing: ${dir}`);
  const tests=[];function visit(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const t of spec.tests??[])tests.push(t);visit(suite.suites);}}visit(report.suites);
  const attempts=tests.flatMap(t=>t.results??[]),stats=report.stats,actualStable=stable(before,after),selectionCorrect=tests.length>0&&tests.every(t=>t.projectName===v.project);
  const passed=v.code===0&&v.signal===null&&actualStable&&v.sourceAndDistStable===true&&selectionCorrect&&stats.expected===tests.length&&stats.unexpected===0&&stats.skipped===0&&stats.flaky===0&&(report.errors??[]).length===0&&attempts.length===tests.length&&attempts.every(a=>a.status==='passed'&&a.retry===0);
  const name=path.basename(dir),dest=`raw/browser/${name}`;addNames(dir,dest,['verification.json','before.json','after.json','results.json','run.log','build.json']);
  if(exists(`${dir}/artifacts`))for(const p of artifactFiles(`${dir}/artifacts`))add(p,`${dest}/${p.slice(dir.length+1)}`);
  browserRuns.push({name,dir,project:v.project,exitCode:v.code,signal:v.signal,elapsedMs:v.elapsedMs,startTime:stats.startTime,stats,attempts:attempts.map(a=>({status:a.status,retry:a.retry,duration:a.duration})),sourceStable:actualStable,claimedStable:v.sourceAndDistStable,selectionCorrect,passed,before,after,build:read(`${dir}/build.json`),buildSha256:hash(`${dir}/build.json`)});
}
browserRuns.sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));
// Refuse silent omission of known failed/completed attempts or an in-flight
// sibling runner. This inspects only metadata in this named evidence root.
const explicitlySelected=new Set([...unique(checkDirs),...unique(browserDirs)]);
for(const e of entries(checksRoot).filter(e=>e.isDirectory()&&!e.name.startsWith('.'))){const dir=`${checksRoot}/${e.name}`;if(!exists(`${dir}/before.json`)&&!exists(`${dir}/source-before.json`)&&!exists(`${dir}/verification.json`))continue;assert(exists(`${dir}/verification.json`),`A sibling runner is still unfinished: ${dir}`);assert(explicitlySelected.has(dir),`Retain this actual attempt explicitly with --check/--browser: ${dir}`);}
const latestBrowsers=projects.map(project=>browserRuns.filter(r=>r.project===project).at(-1)).filter(Boolean),missingProjects=projects.filter(project=>!latestBrowsers.some(r=>r.project===project));
const finalBrowserPass=missingProjects.length===0&&latestBrowsers.every(r=>r.passed);
const currentSourceDifferences=currentMatch(latestRoot.after),currentBrowserDifferences=latestBrowsers.map(r=>({run:r.name,differences:currentMatch(r.after)}));
const currentProductionDifferences=currentSourceDifferences.filter(r=>!r.path.startsWith('tests/'));
const productSnapshot=row=>snapshot(row).filter(r=>r.path.startsWith('src/'));
const productMatchesBuild=latestBrowsers.every(r=>same(productSnapshot(r.after),productSnapshot(latestRoot.after)));
const dist=Array.isArray(latestRoot.verification.dist)?snapshot(latestRoot.verification.dist):[];
const currentDistDifferences=dist.length?currentMatch(dist):[],browserDistMatches=dist.length>0&&latestBrowsers.every(r=>stable(r.after.filter(x=>unix(x.path).startsWith('dist/')),dist));
const buildExists=exists(`${latestRoot.dir}/build.json`),build=buildExists?read(`${latestRoot.dir}/build.json`):null,buildSha256=buildExists?hash(`${latestRoot.dir}/build.json`):null;
const buildMetadataMatches=!!buildSha256&&exists('dist/build.json')&&hash('dist/build.json')===buildSha256&&latestBrowsers.every(r=>r.buildSha256===buildSha256);

add('.autopilot/ph06/additive-promotion.json','provenance/additive-promotion.json');
add('.autopilot/ph06/v4-additive-integration-review.md','provenance/independent-review.md');
add('.autopilot/ph06/additive-evidence-plan.md','provenance/evidence-plan.md');
add('.autopilot/ph06/archive-additive.mjs','provenance/archive-additive.mjs');
for(const source of unique(auditFiles))add(source,`provenance/audits/${path.basename(source)}`);
const repairPromotions=['.autopilot/ph06/ingress-promotion.json','.autopilot/ph06/page-promotion.json'].map(source=>{
  const present=exists(source),dest=`provenance/${path.basename(source)}`;
  if(present)add(source,dest);
  return {source,present,dest:present?dest:null,sha256:present?hash(source):null};
});
addNames(checksRoot,'runners',['run.mjs','browser.mjs','playwright.config.ts']);
for (const name of ['http-before.json', 'http-repair.json', 'emulation-concurrency.json']) {
  if (exists(`${checksRoot}/${name}`)) add(`${checksRoot}/${name}`, `raw/http/${name}`);
}
addNames(kernel,'raw/kernel',['vitest.config.ts']);
addNames(`${kernel}/checks`,'raw/kernel/checks',['verification.json','tests-first.json','tests-first.log','tests-first-exit.json','tests-repair1.json','tests-repair1.log','tests-repair1-exit.json','lint-first.log','lint-first-exit.json','types-first.log','types-first-exit.json','typecheck.mjs']);
addNames(integration,'raw/integration',['baseline-manifest.json','ready-manifest.json','vitest.integration.config.ts','typecheck.mjs']);
addNames(`${integration}/checks`,'raw/integration/checks',['verification.json','candidate-fingerprints.json','tests-first.json','tests-first.log','tests-first-exit.json','lint-first.log','lint-first-exit.json','types-first.log','types-first-exit.json','types-repair1.log','types-repair1-exit.json','lint-repair1.log','lint-repair1-exit.json']);
addNames(`${integration}/browser`,'raw/integration/browser-script',['ready-manifest.json','README.md']);
addNames(locks,'raw/locks',['baseline-hashes.json','ready-manifest.json','static-first.json','run.mjs','static-check.mjs','vitest.config.ts']);
addNames(`${locks}/checks/first`,'raw/locks/first',['command.json','results.json','run.log','source-before.json','source-after.json','verification.json']);
addNames(relief,'raw/relief',['baseline-hashes.json','ready-manifest.json','first-unit.json','first-unit.log','first-verification.json','types-recheck.json','inventory.json','check.mjs','types-recheck.mjs','vitest.config.ts']);
addNames(`${relief}/gpu`,'raw/relief/gpu',['summary.json','first-run.log','harness.ts','harness.html','run.mjs','summarize.mjs']);
addNames(`${relief}/gpu/first`,'raw/relief/gpu/first',['before.json','verification.json','supplement.json','relief.json','full.png','supplement.png','relief.png']);

// The four receiver-copy tests and their owned static check have independent
// first-run raw records. Keep every later sibling attempt as well, including
// failures; never replace a failed run with a summary of its successful repair.
addNames(ingress,'raw/private-ingress',['baseline-hashes.json','ready-manifest.json','run.mjs','static-check.mjs','vitest.config.ts']);
add(`${ingress}/checks/ready-before-checks.json`,'raw/private-ingress/ready-before-checks.json');
assert(exists(`${ingress}/checks/first/verification.json`)&&exists(`${ingress}/checks/static-first/verification.json`),'Private ingress first unit/static records must both remain available');
const ingressRuns=[];
for(const entry of entries(`${ingress}/checks`).filter(entry=>entry.isDirectory())){
  const dir=`${ingress}/checks/${entry.name}`,dest=`raw/private-ingress/checks/${entry.name}`;
  for(const name of ['command.json','run.log','source-before.json','source-after.json','verification.json'])assert(exists(`${dir}/${name}`),`Private ingress run unfinished: ${dir}/${name}`);
  const verification=read(`${dir}/verification.json`),sourceStable=stable(read(`${dir}/source-before.json`),read(`${dir}/source-after.json`));
  assert(Number.isInteger(verification.exitCode)&&Number.isFinite(Date.parse(verification.finishedAt)),`Private ingress exit record missing: ${dir}`);
  addNames(dir,dest,['command.json','run.log','source-before.json','source-after.json','verification.json']);
  const hasResult=exists(`${dir}/results.json`);if(hasResult)add(`${dir}/results.json`,`${dest}/results.json`);
  assert(hasResult||verification.exitCode!==0,`Successful private ingress run missing its raw result: ${dir}`);
  ingressRuns.push({name:entry.name,exitCode:verification.exitCode,tests:verification.tests,staticPassed:verification.staticPassed,sourceStable,claimedStable:verification.sourceUnchanged,raw:dest,rawResultPresent:hasResult});
}
// Paging staging is currently a written, unexecuted proposal. Its planned four
// cases are not PASS; promoted executions must come from explicit root --check.
addNames(pages,'raw/stage-pages',['baseline-manifest.json','ready-manifest.json','README.md']);
const pageReady=read(`${pages}/ready-manifest.json`),pageRawPaths=[],pageRawDirectories=new Set();
for(const key of ['rawDirectory','staticDirectory'])if(pageReady.checks?.[key]){
  const dir=relative(pageReady.checks[key]);assert(dir.startsWith(`${pages}/`),`Paging staging raw path outside its owned evidence: ${dir}`);
  assert(exists(`${dir}/verification.json`),`Paging staging run unfinished: ${dir}`);
  if(!pageRawDirectories.has(dir))for(const source of artifactFiles(dir))add(source,`raw/stage-pages/${source.slice(pages.length+1)}`);
  pageRawDirectories.add(dir);
  pageRawPaths.push({kind:key,source:dir});
}
assert(pageReady.checks?.executed!==true||pageRawPaths.length>0,'Paging staging claims execution without raw evidence');

const fullSource=`${relief}/gpu/first/full.json`,fullBytes=bytes(fullSource),fullOriginalSha256=digest(fullBytes),originalInventory=read(`${relief}/inventory.json`),expectedFull=originalInventory.files.find(x=>x.path==='gpu/first/full.json');
assert(expectedFull&&expectedFull.bytes===fullBytes.length&&expectedFull.sha256===fullOriginalSha256,'Original new-shader GPU full report does not match its preserved inventory');
const compressed=gzipSync(fullBytes,{level:9}),restored=gunzipSync(compressed);
assert(restored.length===fullBytes.length&&digest(restored)===fullOriginalSha256&&restored.equals(fullBytes),'Lossless GPU gzip verification failed');
const fullGzip={source:fullSource,dest:'raw/relief/gpu/first/full.json.gz',encoding:'gzip',bytes:compressed.length,sha256:digest(compressed),originalBytes:fullBytes.length,originalSha256:fullOriginalSha256,decodedBytesVerified:true};
const gpuRaw=read(`${relief}/gpu/first/verification.json`),gpuSummary=read(`${relief}/gpu/summary.json`);

const referenceNames=[
  'docs/adr/0016-sparse-detail-coast.md','docs/adr/0017-additive-fine-landmass.md',
  'docs/evidence/ph06-fine-coast-2026-09-27/detail-shader-checks/verification.json',
  'docs/evidence/ph06-fine-coast-2026-09-27/detail-shader-checks/gpu-first.json',
  'docs/evidence/ph06-fine-coast-2026-09-27/detail-shader-checks/gpu-supplement.json',
  'docs/evidence/ph06-fine-integration-2026-09-27/verification.json',
  'docs/evidence/ph06-fine-integration-2026-09-27/inventory.json',
  'docs/evidence/ph06-preview7-generator-history-2026-09-27/build.json',
  'docs/evidence/ph06-preview7-generator-history-2026-09-27/provenance.json',
];
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const references=referenceNames.map(p=>{assert(exists(p),`Required existing reference missing: ${p}`);return {path:p,bytes:fs.statSync(absolute(p)).size,sha256:hash(p),copied:false};});
const history=read('docs/evidence/ph06-preview7-generator-history-2026-09-27/provenance.json');
const stagingCounts={kernelHistorical:unitSummary(read(`${kernel}/checks/tests-repair1.json`)),integration:unitSummary(read(`${integration}/checks/tests-first.json`)),locks:unitSummary(read(`${locks}/checks/first/results.json`)),relief:unitSummary(read(`${relief}/first-unit.json`)),privateIngress:unitSummary(read(`${ingress}/checks/first/results.json`))};
const countOnly=unit=>unit?{reported:unit.reported,observed:unit.observed}:null;
const allRequiredPassed=latestRoot.passed&&combinedUnitsPassed&&finalBrowserPass&&currentProductionDifferences.length===0&&currentBrowserDifferences.every(x=>x.differences.length===0)&&productMatchesBuild&&currentDistDifferences.length===0&&browserDistMatches&&buildMetadataMatches&&gpuRaw.passed===true&&gpuRaw.sourceAndDistStable===true;
const verification={schema:1,recordedAt:new Date().toISOString(),headAtRecording:head,scope:'Actual additive/lock/relief checks and supplied native browser evidence; not performance, hardware, natural visual, physical-device or whole-game acceptance',archiveComplete:true,allRequiredPassed,cloudWrites:false,
  rootRuns:rootRuns.map(({before,after,dir,unit,...r})=>({...r,unit:countOnly(unit),raw:`raw/root/${r.name}`})),
  latestRoot:latestRoot.name,
  combinedRootUnits:combinedUnits,
  browsers:{runs:browserRuns.map(({before,after,dir,build,...r})=>({...r,buildVersion:build?.version,raw:`raw/browser/${r.name}`})),finalNames:latestBrowsers.map(r=>r.name),missingProjects,allFinalPassed:finalBrowserPass},
  finalBinding:{currentSourceDifferences,currentProductionDifferences,currentBrowserDifferences,productMatchesBuild,currentDistDifferences,browserDistMatches,buildMetadataMatches,build,buildJsonSha256:buildSha256,distCount:dist.length,dist},
  staging:{counts:Object.fromEntries(Object.entries(stagingCounts).map(([name,unit])=>[name,countOnly(unit)])),privateIngress:{runs:ingressRuns,performanceAccepted:false,publicDense250msAccepted:false},stagePages:{plannedTests:pageReady.plannedTests,checks:pageReady.checks,rawPaths:pageRawPaths,performanceAccepted:false,note:'Planned tests with checks.executed=false are unrun, not PASS. Promoted actual unit results are recorded only under supplied root runs.'},note:'Staging tests overlap final selected tests. Do not add these counts as unique. Historical kernel 8 predates the shared guard closure change. First resolver failure executed zero tests; integration TS2322 and isolated shader declaration failures are retained.',gpu:{passed:gpuRaw.passed,sourceAndDistStable:gpuRaw.sourceAndDistStable,summary:gpuSummary,compressedFull:fullGzip}},
  repairProvenance:{audits:unique(auditFiles),promotions:repairPromotions},
  references,historyReference:{path:'docs/evidence/ph06-preview7-generator-history-2026-09-27/',provenanceBuildSha256:history.buildSha256,fullFrozenSourcesNotDuplicated:true},
  notes:['Original failed attempts remain raw failures regardless of later PASS, including the desktop-first 450000 ms timeout.','No default browser or audit path was guessed; all provided attempts and known sibling runs had to be completed and included.','Combined root unit counts merge actual file/fullName identities; earlier 602 results may be reused, while repeated targeted/staging results are never added as extra unique tests.','Staging mirror source is not copied; promotion SHA, final check snapshots and local Git record bind actual files.','A build metadata commit can name the baseline while worktree edits are uncommitted; do not label these edits committed solely from that value.','Existing official archives are references with SHA, never recopied.','New GPU full.json is the exact original bytes compressed once; it is not substituted by the old fixed-light 625 report.']};

// All required input validation and lossless compression finish before writes.
for(const item of files.values())assert(hash(item.source)===item.sha256,`Input changed while preparing archive: ${item.source}`);
assert(hash(fullSource)===fullOriginalSha256,'GPU input changed while preparing archive');
fs.mkdirSync(absolute(target),{recursive:false});
const incomplete=absolute(`${target}/ARCHIVE_INCOMPLETE.txt`);fs.writeFileSync(incomplete,'Archive copy in progress. If this marker remains, inspect the original error; do not overwrite this directory.\n',{flag:'wx'});
const write=(name,data)=>{const p=absolute(`${target}/${name}`);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n',{flag:'wx'});};
const inventory=[];
for(const item of files.values()){const p=absolute(`${target}/${item.dest}`);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(absolute(item.source),p,fs.constants.COPYFILE_EXCL);assert(hash(`${target}/${item.dest}`)===item.sha256,`Archive copy mismatch: ${item.dest}`);inventory.push(item);}
write(fullGzip.dest,compressed);inventory.push(fullGzip);
write('verification.json',verification);inventory.push({dest:'verification.json',bytes:fs.statSync(absolute(`${target}/verification.json`)).size,sha256:hash(`${target}/verification.json`),generated:true});
write('references.json',references);inventory.push({dest:'references.json',bytes:fs.statSync(absolute(`${target}/references.json`)).size,sha256:hash(`${target}/references.json`),generated:true});
write('README.md',`# 本地追加大陆 / 细场锁 / 坡向原始证据\n\n归档已完成；组合结果：${allRequiredPassed?'所列实际检查范围通过':'存在失败、未覆盖环境或版本绑定差异，不能声明组合通过'}。逐轮原始退出码、计数、源/产物快照和范围见 verification.json。首轮及后续失败原样保留，未执行的检查不填 PASS。\n\n新的 GPU full.json 原字节保存在 raw/relief/gpu/first/full.json.gz；gzip 解压后应为 ${fullGzip.originalBytes} 字节，SHA-256 ${fullGzip.originalSha256}。归档时已解压验证逐字节相等。其余新 GPU 原始结果、实际颜色读回与警告同时保留。\n\n旧正式证明与 ADR 在 references.json 列明路径和 SHA，未复制旧 625 集或历史源码。未收录 staging/src 镜像、dist 产物、真实存档、缓存和运行中 Playwright 碎片。正式 trace.zip 按原件保留。此归档不更新正式计划/续接，不代表自然视觉、真机、性能或完整游戏通过。\n`);
inventory.push({dest:'README.md',bytes:fs.statSync(absolute(`${target}/README.md`)).size,sha256:hash(`${target}/README.md`),generated:true});
write('inventory.json',{schema:1,recordedAt:verification.recordedAt,files:inventory,references,note:'inventory.json excludes itself; original copied failures remain immutable; gzip entry includes encoded and exact decoded hashes.'});
fs.unlinkSync(incomplete);
const completedSummary={archive:target,archiveWritten:true,files:inventory.length+1,allRequiredPassed,rootRun:latestRoot.name,combinedRootUniqueUnits:{total:combinedUnits.total,passed:combinedUnits.passed,failed:combinedUnits.failed,reusedFromEarlierRootRuns:combinedUnits.reusedFromEarlierRootRuns},latestBrowserRuns:latestBrowsers.map(r=>r.name),missingProjects,buildJsonSha256:buildSha256,newGpuOriginalSha256:fullOriginalSha256,newGpuGzipSha256:fullGzip.sha256,cloudWrites:false};
console.log(JSON.stringify(completedSummary,null,2));
process.exitCode=allRequiredPassed?0:1;
