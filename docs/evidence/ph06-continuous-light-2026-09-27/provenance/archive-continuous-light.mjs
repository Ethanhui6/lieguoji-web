// Explicit recording only: never starts checks, opens saves, or copies dist.
// Exit 0 means archiveComplete, not allRequiredPassed or visual acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-continuous-light-2026-09-27';
const checks = '.autopilot/ph06/continuous-light-checks', stage = '.autopilot/ph06/v4-continuous-light-staging';
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const slash = p => p.replaceAll('\\', '/');
function absolute(p) { const full = path.resolve(root, p), rel = path.relative(root, full); assert(rel && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`), `Unsafe path: ${p}`); return full; }
const exists = p => fs.existsSync(absolute(p));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(absolute(p))).digest('hex');
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8').replace(/^\uFEFF/, ''));
const optional = p => exists(p) ? read(p) : null;
assert(process.argv.length === 2, 'No arguments; only the specified check directories are read.');
assert(!exists(target), `Refusing to overwrite archive: ${target}`);
const files = new Map(), pending = [], excluded = [];
function add(source, dest, required = true) {
  if (!exists(source)) { if (required) pending.push({ path: source, reason: 'Required final evidence missing' }); return; }
  const stat = fs.lstatSync(absolute(source)); assert(stat.isFile() && !stat.isSymbolicLink(), `Not regular evidence: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate destination: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
const forbidden = new Set(['src', 'tests', 'scripts', 'dist', 'node_modules', 'vite-cache', 'cache', 'resources', 'playwright-report', 'frozen-source', 'evidence']);
const extensions = new Set(['.json', '.log', '.md', '.txt', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.webm', '.zip', '.mjs']);
function raw(dir, dest) {
  for (const e of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`; assert(!e.isSymbolicLink(), `Symlink evidence: ${p}`);
    if (e.name.startsWith('.') || forbidden.has(e.name)) { excluded.push(p); continue; }
    if (e.isDirectory()) raw(p, `${dest}/${e.name}`);
    else if (e.isFile() && extensions.has(path.extname(e.name).toLowerCase())) add(p, `${dest}/${e.name}`);
    else excluded.push(p);
  }
}
function snap(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const values = new Map();
  for (const r of rows) {
    if (typeof r.path !== 'string' || !/^[a-f0-9]{64}$/i.test(r.sha256 ?? '')) return null;
    const p = slash(path.isAbsolute(r.path) ? path.relative(root, r.path) : r.path).replace(/^\.\//, ''); absolute(p);
    if (values.has(p)) return null; values.set(p, r.sha256.toLowerCase());
  }
  return values;
}
const same = (a, b) => { const x = snap(a), y = snap(b); return !!x && !!y && x.size === y.size && [...x].every(([p, h]) => y.get(p) === h); };
function differences(rows, filter = () => true) {
  const values = snap(rows); return values ? [...values].filter(([p]) => filter(p)).flatMap(([p, expected]) => exists(p) && hash(p) === expected ? [] : [{ path: p, expected, actual: exists(p) ? hash(p) : null }]) : [{ reason: 'Missing/malformed snapshot' }];
}
function units(data) {
  if (!data) return { available: false, passed: false };
  const rows = (data.testResults ?? []).flatMap(f => f.assertionResults ?? []);
  const counts = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests, failedSuites: data.numFailedTestSuites };
  return { available: true, counts, observed: rows.length, passed: data.success === true && counts.total > 0 && counts.passed === counts.total && counts.failed === 0 && counts.pending === 0 && counts.failedSuites === 0 && rows.length === counts.total && rows.every(r => r.status === 'passed') };
}
function browserResult(data) {
  const tests = [];
  function walk(suites) { for (const s of suites ?? []) { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) tests.push({ file: spec.file ?? s.file, project: t.projectName, title: spec.title, status: t.status, results: (t.results ?? []).map(r => ({ status: r.status, retry: r.retry, duration: r.duration })) }); walk(s.suites); } }
  walk(data?.suites);
  return { stats: data?.stats ?? null, tests, passed: !!data && tests.length > 0 && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && tests.every(t => t.status === 'expected' && t.results.length === 1 && t.results[0].status === 'passed' && t.results[0].retry === 0) };
}
const exitPresent = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
function discover(dir, candidate = false) {
  if (!exists(dir)) { pending.push({ path: dir, reason: 'Check directory missing' }); return []; }
  const runs = [];
  for (const e of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    assert(!e.isSymbolicLink(), `Symlink run: ${e.name}`);
    const source = `${dir}/${e.name}`, vp = `${source}/verification.json`;
    if (!exists(vp)) { pending.push({ path: source, reason: 'No terminal verification; live files not copied' }); continue; }
    let v; try { v = read(vp); } catch { pending.push({ path: source, reason: 'Verification still incomplete/unreadable' }); continue; }
    const kind = candidate ? 'candidate' : v.project ? 'browser' : 'root';
    const done = kind === 'browser' ? Number.isFinite(v.elapsedMs) && exitPresent(v.code, v.signal) : candidate
      ? typeof v.passed === 'boolean' && typeof v.gpu === 'boolean' && Array.isArray(v.commands) && v.commands.length > 0 && v.commands.every(c => c.endedAt && exitPresent(c.exitCode, c.signal))
      : Array.isArray(v.results) && v.results.length > 0 && v.results.every(c => c.finishedAt && exitPresent(c.exitCode, c.signal));
    if (!done) { pending.push({ path: source, reason: 'Unsupported/nonterminal verification' }); continue; }
    runs.push({ name: e.name, source, kind, v, order: fs.statSync(absolute(vp)).mtimeMs });
  }
  return runs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
const generatorKeys = ['macroGenerator', 'landformGenerator', 'islandGenerator', 'coastGenerator', 'shapeGenerator', 'oceanGenerator', 'detailShapeGenerator', 'addDetailGenerator', 'naturalDetailGenerator', 'addNaturalDetailGenerator'];
function identities(build) {
  if (!build || !/^[a-f0-9]{64}$/.test(build.engineFingerprint ?? '') || generatorKeys.some(k => !/^[a-f0-9]{64}$/.test(build[k]?.sha256 ?? '') || !Array.isArray(build[k]?.files))) return null;
  const actualKeys = Object.keys(build).filter(k => k.endsWith('Generator')).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...generatorKeys].sort())) return null;
  return Object.fromEntries(['engineFingerprint', ...generatorKeys].map(k => [k, build[k]]));
}
const previousBuildPath = 'docs/evidence/ph06-natural-repair-2026-09-27/raw/root/preflight-repair/build.json';
const preview10 = optional(previousBuildPath), preview10Identities = identities(preview10);
const rootRuns = [], browsers = [];
for (const run of discover(checks)) {
  const { source, v } = run, rawPath = `raw/${run.kind}/${run.name}`; raw(source, rawPath);
  const after = optional(`${source}/${run.kind === 'browser' ? 'after' : 'source-after'}.json`), before = optional(`${source}/${run.kind === 'browser' ? 'before' : 'source-before'}.json`), build = optional(`${source}/build.json`);
  if (run.kind === 'browser') {
    const report = browserResult(optional(`${source}/results.json`)), stable = v.sourceAndDistStable === true && same(before, after);
    // Actual report spec is authoritative; runner defaults to additive unless legacy mode is supplied.
    const correctSpec = report.tests.length > 0 && report.tests.every(t => path.basename(t.file ?? '') === 'atlas-detail-coast.spec.ts' && t.project === v.project);
    browsers.push({ ...run, raw: rawPath, after, build, report, stable, correctSpec, passed: v.code === 0 && !v.signal && stable && correctSpec && report.passed });
  } else {
    const priorBuild = optional(`${source}/prior-build.json`), priorIdentity = identities(priorBuild), nextIdentity = identities(build);
    const identityUnchanged = !!priorIdentity && !!nextIdentity && !!preview10Identities && JSON.stringify(priorIdentity) === JSON.stringify(nextIdentity) && JSON.stringify(priorIdentity) === JSON.stringify(preview10Identities);
    const unit = units(optional(`${source}/unit.json`)), stable = v.sourceStable === true && same(before, after);
    const scope = optional(`${source}/scope.json`), expectedTests = ['src/world/detail-terrain-light.test.ts', 'src/world/detail-terrain-shader.test.ts', 'src/world/detail-terrain-pages.test.ts', 'src/world/detail-terrain-backend.test.ts'];
    const correctUnitScope = !!scope && JSON.stringify([...scope.unitFiles].sort()) === JSON.stringify(expectedTests.sort());
    const passed = ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'].every(name => v.results.some(r => r.name === name && r.exitCode === 0 && !r.signal)) && unit.passed && stable && correctUnitScope && identityUnchanged && v.generatorAndEngineUnchanged === true;
    rootRuns.push({ ...run, raw: rawPath, after, build, priorBuild, scope, unit, stable, correctUnitScope, identityUnchanged, passed });
  }
}
const finiteColor = a => Array.isArray(a) && a.length === 4 && a.every(Number.isFinite);
const candidateRuns = [];
for (const run of discover(`${stage}/checks`, true)) {
  const { source, v } = run, rawPath = `raw/candidate/${run.name}`; raw(source, rawPath);
  const before = optional(`${source}/source-before.json`), after = optional(`${source}/source-after.json`), gpu = optional(`${source}/gpu.raw.json`);
  const stable = v.sourceStable === true && same(before, after), unit = units(optional(`${source}/unit.raw.json`));
  const probes = gpu?.probes ?? [], seams = gpu?.seams ?? [];
  const finiteProbes = probes.length > 0 && probes.every(p => finiteColor(p.actual) && finiteColor(p.expected) && Number.isFinite(p.heightError) && Number.isFinite(p.colorError) && Number.isFinite(p.picked?.height) && Number.isFinite(p.decoded?.height));
  const validSeams = seams.filter(s => finiteColor(s.a) && finiteColor(s.b) && Number.isFinite(s.difference));
  const parityPassed = v.gpu === true && gpu?.passed === true && !gpu.exception && !(gpu.failures?.length) && gpu.capabilities?.webGL2 === true && !(gpu.events ?? []).some(e => e.type === 'error' || e.type === 'pageerror') && finiteProbes && Number.isFinite(gpu.heightToleranceMeters) && Number.isFinite(gpu.colorToleranceBytes) && probes.every(p => p.heightError <= gpu.heightToleranceMeters && p.colorError <= gpu.colorToleranceBytes);
  const continuityPassed = parityPassed && validSeams.length > 0 && validSeams.length === seams.length && Number.isFinite(gpu.actualContinuityToleranceBytes) && validSeams.every(s => s.difference <= gpu.actualContinuityToleranceBytes);
  const candidateShader = snap(after)?.get(`${stage}/src/world/detail-terrain-shader.ts`);
  const shaderMatchesProduct = !!candidateShader && exists('src/world/detail-terrain-shader.ts') && candidateShader === hash('src/world/detail-terrain-shader.ts');
  const unchangedDependencies = differences(after, p => p.startsWith('src/') && !['src/world/detail-terrain-shader.ts', 'src/world/detail-terrain-light.test.ts'].includes(p));
  candidateRuns.push({ name: run.name, raw: rawPath, v, stable, unit, unitExecuted: v.unit !== null && v.unit !== undefined, unitReuse: v.unitReuse ?? null,
    gpu: { recordedPassed: gpu?.passed ?? null, parityPassed, continuityPassed, probes: probes.length, seams: seams.length, finiteSeams: validSeams.length, maxColorError: finiteProbes ? Math.max(...probes.map(p => p.colorError)) : null, maxHeightError: finiteProbes ? Math.max(...probes.map(p => p.heightError)) : null, actualContinuityToleranceBytes: gpu?.actualContinuityToleranceBytes ?? null, sourceLedger: gpu?.sourceLedger ?? null, capabilities: gpu?.capabilities ?? null, browserVersion: gpu?.browserVersion ?? null, compilation: gpu?.compilation ?? null },
    shaderMatchesProduct, unchangedDependencies, note: 'Probe counts are not tests. First null/nonfinite seam records are not zero error. GPU-only unit:null means source-verified reuse, not another six CPU executions.' });
}
for (const name of ['baseline-manifest.json', 'ready-manifest.json', 'run.mjs', 'typecheck.mjs', 'vitest.config.mjs', 'gpu-harness.ts', 'gpu-harness.html']) add(`${stage}/${name}`, `preparation/${name}`);
for (const name of ['run.mjs', 'browser.mjs', 'playwright.config.ts']) add(`${checks}/${name}`, `runners/${name}`);
for (const e of fs.readdirSync(absolute('.autopilot/ph06'), { withFileTypes: true })) if (e.isFile() && /continuous-light/.test(e.name) && /\.(json|md|mjs)$/.test(e.name)) add(`.autopilot/ph06/${e.name}`, `provenance/${e.name}`);
for (const name of ['manual-before.json', 'manual-before.png', 'manual-after.json', 'manual-after.png', 'visual.json']) add(`${checks}/${name}`, `observations/${name}`);
const manualBefore = optional(`${checks}/manual-before.json`), manualAfter = optional(`${checks}/manual-after.json`), observation = optional(`${checks}/visual.json`);
const referenceNames = [previousBuildPath, 'docs/evidence/ph06-natural-repair-2026-09-27/verification.json', 'docs/evidence/ph06-natural-repair-2026-09-27/inventory.json', 'docs/evidence/ph06-natural-repair-2026-09-27/raw/root/preflight-repair/unit.json', 'docs/evidence/ph06-natural-repair-2026-09-27/raw/foundation/foundation-first/unit.json', 'docs/evidence/ph06-natural-2026-09-27/raw/root/first/unit.json', 'docs/evidence/ph06-natural-2026-09-27/verification.json', 'docs/adr/0019-shared-terrain-light.md'];
const references = referenceNames.map(p => exists(p) ? { path: p, bytes: fs.statSync(absolute(p)).size, sha256: hash(p), copied: false } : { path: p, missing: true, copied: false });
const latestRoot = rootRuns.at(-1) ?? null, latestCandidate = candidateRuns.at(-1) ?? null;
const currentBuildSha256 = exists('dist/build.json') ? hash('dist/build.json') : null;
const buildMatches = !!latestRoot?.build && !!currentBuildSha256 && hash(`${latestRoot.source}/build.json`) === currentBuildSha256;
const currentSourceDifferences = differences(latestRoot?.after), currentDistDifferences = differences(latestRoot?.v.dist);
function distNames(dir) { return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(e => { assert(!e.isSymbolicLink(), `Symlink in dist: ${e.name}`); return e.isDirectory() ? distNames(`${dir}/${e.name}`) : [`${dir}/${e.name}`]; }); }
const recordedDist = snap(latestRoot?.v.dist), extraDistFiles = exists('dist') ? distNames('dist').filter(p => !recordedDist?.has(p)) : [];
const finalBrowsers = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].map(project => {
  const run = browsers.filter(r => r.v.project === project).at(-1) ?? null;
  const currentProductDifferences = differences(run?.after, p => p.startsWith('src/') || p.startsWith('dist/'));
  const bound = !!run?.build && !!currentBuildSha256 && hash(`${run.source}/build.json`) === currentBuildSha256 && currentProductDifferences.length === 0;
  return { project, name: run?.name ?? null, status: !run ? 'pending' : run.passed && bound ? 'passed' : 'failed_or_unbound', bound, currentProductDifferences, passed: !!run?.passed && bound };
});
const manualIssues = [];
for (const [key, expectedFile] of [['before', 'manual-before.png'], ['after', 'manual-after.png']]) {
  const comparison = observation?.manualComparison;
  if (!comparison || comparison[key] !== expectedFile || !exists(`${checks}/${expectedFile}`) || comparison[`${key}Sha256`] !== hash(`${checks}/${expectedFile}`)) manualIssues.push(`Root ${key} screenshot identity missing or mismatched`);
}
if (!manualBefore || !manualAfter) manualIssues.push('Both terminal manual JSON records are required');
else {
  if (manualBefore.url !== manualAfter.url || !manualBefore.url) manualIssues.push('Same test world URL not demonstrated');
  if (!Number.isInteger(manualBefore.savedRevision) || manualBefore.savedRevision !== manualAfter.savedRevision) manualIssues.push('Same durable revision not demonstrated');
  if (manualBefore.visibleZoomPercent !== 1120 || manualAfter.visibleZoomPercent !== 1120) manualIssues.push('Expected same 1120% zoom not demonstrated');
  if (!manualBefore.viewport || JSON.stringify(manualBefore.viewport) !== JSON.stringify(manualAfter.viewport)) manualIssues.push('Same viewport not demonstrated');
  const sameActions = Array.isArray(manualBefore.cameraActions) && manualBefore.cameraActions.length > 0 && JSON.stringify(manualBefore.cameraActions) === JSON.stringify(manualAfter.cameraActions);
  if (!sameActions && manualAfter.sameCameraConfirmed !== true) manualIssues.push('Camera centre cannot be inferred from zoom alone; actions or explicit root confirmation missing');
  if (!latestRoot?.priorBuild || manualBefore.buildJsonSha256 !== hash(`${latestRoot.source}/prior-build.json`)) manualIssues.push('Before image is not bound to prior build');
  if (!currentBuildSha256 || manualAfter.buildJsonSha256 !== currentBuildSha256) manualIssues.push('After image is not bound to current build');
}
const observationBound = !!observation && !!currentBuildSha256 && observation.buildJsonSha256 === currentBuildSha256;
const displayLightingAccepted = observationBound && observation.displayLightingAccepted === true;
const naturalVisualAccepted = observationBound && observation.naturalVisualAccepted === true;
const visualAccepted = observationBound && observation.visualAccepted === true;
const firstCandidate = candidateRuns.find(r => r.name === 'first');
const candidatePassed = !!firstCandidate?.unit.passed && firstCandidate.unit.counts?.total === 6 && candidateRuns.some(r => r.name === 'first' && r.gpu.probes === 316)
  && !!latestCandidate?.stable && latestCandidate.v.lint === true && latestCandidate.v.types === true && latestCandidate.gpu.parityPassed && latestCandidate.gpu.continuityPassed && latestCandidate.shaderMatchesProduct && latestCandidate.unchangedDependencies.length === 0;
const allRequiredPassed = !!latestRoot?.passed && buildMatches && currentSourceDifferences.length === 0 && currentDistDifferences.length === 0 && extraDistFiles.length === 0 && candidatePassed && finalBrowsers.every(r => r.passed) && pending.length === 0 && references.every(r => !r.missing) && manualIssues.length === 0 && observationBound;
const allDisplayLightingAccepted = allRequiredPassed && displayLightingAccepted;
const allAccepted = allDisplayLightingAccepted && naturalVisualAccepted && visualAccepted;
const compact = ({ after, order, source, ...r }) => ({ ...r, source });
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), archiveComplete: true, allRequiredPassed, displayLightingAccepted, allDisplayLightingAccepted, naturalVisualAccepted, visualAccepted, allAccepted,
  acceptanceScope: 'This continuous display-light repair only; no whole-natural-quality, PH, user, physical-device, performance or cloud acceptance.', phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false,
  rootRuns: rootRuns.map(compact), latestRoot: latestRoot?.name ?? null, browsers: { runs: browsers.map(compact), final: finalBrowsers }, candidateRuns,
  binding: { buildJsonSha256: currentBuildSha256, build: latestRoot?.build ?? null, buildMatches, currentSourceDifferences, currentDistDifferences, extraDistFiles, generatorCount: 10, identitiesUnchanged: latestRoot?.identityUnchanged ?? false, previousIdentity: preview10Identities, currentIdentity: identities(latestRoot?.build), distCount: latestRoot?.v.dist?.length ?? null },
  manual: { before: manualBefore, after: manualAfter, issues: manualIssues, sameSaveCameraDemonstrated: manualIssues.length === 0 }, visual: { observation, bound: observationBound },
  reuse: { preview10Selected32: units(optional(referenceNames[3])), foundation34: units(optional(referenceNames[4])), preview9World908: units(optional(referenceNames[5])), note: 'Separate actual archived scopes, never added to the new CPU count or GPU probe count; old three-device results remain in the referenced preview10 verification, not copied or relabeled as this lighting test.' },
  pending, excluded, references,
  notes: ['Every terminal failure remains unchanged; later PASS never overwrites it.', 'Only six candidate CPU cases were initially executed; GPU-only rounds reuse them and do not add unique tests. Each recorded GPU probe set and independent seam probe set remains separate.', 'First seam null/nonfinite values are not continuity proof; final probes require finite readback and recorded tolerances.', 'Three product browsers must actually run atlas-detail-coast.spec.ts; default additive selection cannot satisfy this check.', 'Current preparation harness may differ from earlier harness hashes; each original run keeps its original source snapshots and raw output. Do not claim historical harness bodies were independently frozen if absent.', 'No real save, authentication, private source reference, production dist payload or cache is read/copied. Same-save comparison uses root JSON and test screenshots only.', 'The ten generator closures and engineFingerprint must equal both prior-build and archived preview10. Green shader checks cannot hide a simulation identity change.'],
};
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed before archive: ${item.source}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`; fs.writeFileSync(absolute(marker), 'Copy incomplete until this marker is removed. Preserve partial output if an error occurs; never overwrite.\n', { flag: 'wx' });
const inventory = [];
const write = (name, data) => { const p = absolute(`${target}/${name}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ dest: name, generated: true, bytes: fs.statSync(p).size, sha256: hash(`${target}/${name}`) }); };
for (const item of files.values()) { const p = absolute(`${target}/${item.dest}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(absolute(item.source), p, fs.constants.COPYFILE_EXCL); assert(fs.statSync(p).size === item.bytes && hash(`${target}/${item.dest}`) === item.sha256, `Copy mismatch: ${item.dest}`); inventory.push(item); }
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed during archive: ${item.source}`);
write('verification.json', verification); write('references.json', references);
write('README.md', `# 连续显示光照本地证据\n\narchiveComplete=true 仅说明原件复制与SHA核对完成。必需技术范围 allRequiredPassed=${allRequiredPassed}；root本批显示光照接受 displayLightingAccepted=${displayLightingAccepted}；显示光照组合 allDisplayLightingAccepted=${allDisplayLightingAccepted}。全自然外观 naturalVisualAccepted=${naturalVisualAccepted}、visualAccepted=${visualAccepted} 独立保留，因此 allAccepted=${allAccepted}。即使同视图光照问题关闭，也不能抹去全自然外观未通过，不能提高PH、用户视觉、真机或性能状态。\n\n实际CPU测试、每轮GPU316探针和后续独立连续性探针分别记录；GPU探针不是Vitest测试，不与6个候选CPU或旧32/34/908范围相加。first中的null接缝差值仍保留，绝不转为0。最终三端必须实际执行atlas-detail-coast.spec.ts并绑定本次源码、dist、build；10生成器和engineFingerprint还须保持preview10身份。\n\nmanual前后JSON/PNG仅来自本次测试地图，比较同URL、revision、viewport、1120%与相机操作或root确认；未读取或导出浏览器存档。visual.json决定显示修复是否接受，技术绿灯不能代替观察。缺失、未结束或未知格式证据均列pending，不伪造通过。\n\n原件见raw，准备清单与工具见preparation/provenance，旧证据只在references中记SHA。未复制旧整包、生产构建、源码镜像、认证、私密资料、缓存或运行中的trace碎片。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
const completedSummary = { archive: target, archiveComplete: true, allRequiredPassed, displayLightingAccepted, allDisplayLightingAccepted, naturalVisualAccepted, visualAccepted, allAccepted, files: inventory.length, roots: rootRuns.length, browsers: browsers.length, candidateRounds: candidateRuns.length, pending: pending.length, manualIssues, buildJsonSha256: currentBuildSha256 };
console.log(JSON.stringify(completedSummary, null, 2));
