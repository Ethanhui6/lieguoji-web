// Recording only. Never starts checks, opens saves or copies dist payloads.
// Exit 0 means byte-verified archive completion, not complete game acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-lock-snapshot-2026-09-27', checks = '.autopilot/ph06/lock-snapshot-checks';
const priorArchive = 'docs/evidence/ph06-local-relief-2026-09-27';
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = p => p.replaceAll('\\', '/');
function absolute(p) { const full = path.resolve(root, p), rel = path.relative(root, full); assert(rel && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`), `Unsafe workspace path: ${p}`); return full; }
const exists = p => fs.existsSync(absolute(p));
const hash = p => sha(fs.readFileSync(absolute(p)));
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8').replace(/^\uFEFF/, ''));
const optional = p => exists(p) ? read(p) : null;
assert(process.argv.length === 2, 'No CLI paths accepted; only the named evidence roots are read');
assert(!exists(target), `Refusing to overwrite existing archive: ${target}`);
const pending = [], excluded = [], files = new Map();
function add(source, dest, required = true) {
  if (!exists(source)) { if (required) pending.push({ path: source, reason: 'Required final evidence missing' }); return; }
  const stat = fs.lstatSync(absolute(source)); assert(stat.isFile() && !stat.isSymbolicLink(), `Not regular evidence: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate archive target: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
const forbidden = new Set(['src', 'tests', 'scripts', 'dist', 'node_modules', 'cache', 'vite-cache', 'resources', 'playwright-report', 'frozen-source', 'frozen-tool', 'evidence', 'saves', 'profiles', 'fixtures', 'indexeddb', 'idb', 'auth']);
const extensions = new Set(['.json', '.log', '.md', '.txt', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.webm', '.zip']);
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
  const result = new Map();
  for (const r of rows) {
    if (typeof r.path !== 'string' || !/^[a-f0-9]{64}$/i.test(r.sha256 ?? '')) return null;
    const file = slash(path.isAbsolute(r.path) ? path.relative(root, r.path) : r.path).replace(/^\.\//, ''); absolute(file);
    if (!/^(?:src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(file) || file.split('/').some(p => p.startsWith('.')) || result.has(file)) return null;
    result.set(file, r.sha256.toLowerCase());
  }
  return result;
}
const same = (a, b) => { const x = snap(a), y = snap(b); return !!x && !!y && x.size === y.size && [...x].every(([p, h]) => y.get(p) === h); };
function differences(rows, include = () => true) {
  const values = snap(rows);
  return values ? [...values].filter(([p]) => include(p)).flatMap(([p, expected]) => exists(p) && hash(p) === expected ? [] : [{ path: p, expected, actual: exists(p) ? hash(p) : null }]) : [{ reason: 'Missing/malformed snapshot' }];
}
function units(data) {
  if (!data) return { available: false, passed: false };
  const rows = (data.testResults ?? []).flatMap(f => f.assertionResults ?? []);
  const counts = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests, failedSuites: data.numFailedTestSuites };
  return { available: true, counts, observed: rows.length, passed: data.success === true && counts.total > 0 && rows.length === counts.total && counts.passed === counts.total && counts.failed === 0 && counts.pending === 0 && counts.failedSuites === 0 && rows.every(r => r.status === 'passed') };
}
function browserResult(data) {
  const tests = [];
  function walk(suites) { for (const s of suites ?? []) { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) tests.push({ file: spec.file ?? s.file, project: t.projectName, title: spec.title, status: t.status, results: (t.results ?? []).map(r => ({ status: r.status, retry: r.retry, duration: r.duration })) }); walk(s.suites); } }
  walk(data?.suites);
  return { stats: data?.stats ?? null, tests, passed: !!data && tests.length > 0 && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && tests.every(t => t.status === 'expected' && t.results.length === 1 && t.results[0].status === 'passed' && t.results[0].retry === 0) };
}
const exitPresent = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
const runs = [];
if (!exists(checks)) pending.push({ path: checks, reason: 'Checks directory missing' });
else for (const e of fs.readdirSync(absolute(checks), { withFileTypes: true })) {
  if (!e.isDirectory() || e.name.startsWith('.')) continue;
  assert(!e.isSymbolicLink(), `Symlink run directory: ${e.name}`);
  const source = `${checks}/${e.name}`, vp = `${source}/verification.json`;
  if (!exists(vp)) { pending.push({ path: source, reason: 'No terminal verification; live artifacts not copied' }); continue; }
  let v; try { v = read(vp); } catch { pending.push({ path: vp, reason: 'Incomplete or unreadable verification' }); continue; }
  const kind = v.project ? 'browser' : 'root';
  const terminal = kind === 'browser' ? Number.isFinite(v.elapsedMs) && exitPresent(v.code, v.signal) : Array.isArray(v.results) && v.results.length > 0 && v.results.every(r => r.finishedAt && exitPresent(r.exitCode, r.signal));
  if (!terminal) { pending.push({ path: vp, reason: 'Unknown or nonterminal verification format' }); continue; }
  runs.push({ name: e.name, source, kind, v, order: fs.statSync(absolute(vp)).mtimeMs });
}
runs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
const generatorKeys = ['macroGenerator', 'landformGenerator', 'islandGenerator', 'coastGenerator', 'shapeGenerator', 'oceanGenerator', 'detailShapeGenerator', 'addDetailGenerator', 'naturalDetailGenerator', 'addNaturalDetailGenerator', 'localDetailReliefGenerator'];
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function validBuild(b) {
  return !!b && /^[a-f0-9]{64}$/.test(b.engineFingerprint ?? '') && equal(Object.keys(b).filter(k => k.endsWith('Generator')).sort(), [...generatorKeys].sort())
    && generatorKeys.every(k => /^[a-f0-9]{64}$/.test(b[k]?.sha256 ?? '') && Array.isArray(b[k]?.files) && b[k].files.length > 0 && b[k].files.every(f => typeof f === 'string' && f.startsWith('src/world/') && !f.includes('..') && !f.includes('\\')));
}
const baselinePath = `${checks}/baseline-build.json`, baseline = optional(baselinePath), previous = optional(`${priorArchive}/verification.json`);
const baselineIssues = [];
if (!validBuild(baseline) || baseline.version !== '0.5.0-preview.12') baselineIssues.push('Missing actual preview12 eleven-generator baseline build');
if (!previous || previous.archiveComplete !== true || previous.allRequiredPassed !== true || !exists(baselinePath) || previous.binding?.buildJsonSha256 !== hash(baselinePath) || !equal(previous.binding?.build, baseline)) baselineIssues.push('Preview12 baseline not bound to its actual completed local-relief archive');
const identityDifferences = build => !validBuild(build) || !validBuild(baseline) ? ['Malformed/missing current or prior build'] : [...generatorKeys, 'engineFingerprint'].filter(k => !equal(build[k], baseline[k]));
const expectedUnits = ['src/editor/region-protection-controls.test.ts', 'src/world/detail-owned-snapshot-copy.test.ts', 'src/world/cooperative-ownership.test.ts', 'src/world/detail-owned-replacement-copy.test.ts', 'src/world/transactions.test.ts', 'src/world/constraints-session.test.ts', 'src/world/constraints-storage.test.ts'];
const rootRuns = [], browsers = [];
for (const run of runs) {
  const { source, v } = run, rawPath = `raw/${run.kind}/${run.name}`; raw(source, rawPath);
  const before = optional(`${source}/${run.kind === 'browser' ? 'before' : 'source-before'}.json`), after = optional(`${source}/${run.kind === 'browser' ? 'after' : 'source-after'}.json`), build = optional(`${source}/build.json`);
  if (run.kind === 'browser') {
    const report = browserResult(optional(`${source}/results.json`)), stable = v.sourceAndDistStable === true && same(before, after);
    const correctSpec = report.tests.length === 1 && report.tests.every(t => path.basename(t.file ?? '') === 'atlas-detail-lock-relief.spec.ts' && t.project === v.project);
    browsers.push({ ...run, raw: rawPath, after, build, report, stable, correctSpec, passed: v.code === 0 && !v.signal && stable && correctSpec && report.passed });
  } else {
    const unitRaw = optional(`${source}/unit.json`), unit = units(unitRaw), scope = optional(`${source}/scope.json`), stable = v.sourceStable === true && same(before, after);
    const unitFiles = (unitRaw?.testResults ?? []).map(f => slash(path.isAbsolute(f.name) ? path.relative(root, f.name) : f.name)).sort();
    const correctUnitScope = !!scope && Array.isArray(scope.unitFiles) && equal([...scope.unitFiles].sort(), [...expectedUnits].sort()) && equal(unitFiles, [...expectedUnits].sort());
    const identityChanges = identityDifferences(build);
    const passed = ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'].every(name => v.results.some(r => r.name === name && r.exitCode === 0 && !r.signal)) && unit.passed && stable && correctUnitScope
      && build?.version === '0.5.0-preview.13' && identityChanges.length === 0 && v.generatorAndEngineUnchanged === true && v.engineUnchanged === true;
    rootRuns.push({ ...run, raw: rawPath, after, build, unit, scope, stable, correctUnitScope, identityChanges, passed });
  }
}
// Candidate source mirrors are already promoted and named by SHA. Preserve
// ready/baseline metadata and tools, never mirror the candidates or old bundles.
for (const stage of ['v4-lock-ui-staging', 'v4-owned-snapshot-staging', 'v4-lock-relief-browser-staging']) {
  const dir = `.autopilot/ph06/${stage}`;
  if (!exists(dir)) { pending.push({ path: dir, reason: 'Preparation directory missing' }); continue; }
  for (const e of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error(`Symlink preparation: ${dir}/${e.name}`);
    if (e.isFile() && !e.name.startsWith('.') && /\.(json|md|mjs)$/.test(e.name)) add(`${dir}/${e.name}`, `preparation/${stage}/${e.name}`);
  }
  // A future staged check round is copied only with explicit terminal evidence.
  const stagedChecks = `${dir}/checks`;
  if (exists(stagedChecks)) for (const e of fs.readdirSync(absolute(stagedChecks), { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const run = `${stagedChecks}/${e.name}`, v = optional(`${run}/verification.json`), command = optional(`${run}/command.json`);
    const terminal = Array.isArray(v?.results) && v.results.length > 0 && v.results.every(r => r.finishedAt && exitPresent(r.exitCode, r.signal)) || Number.isFinite(v?.elapsedMs) && exitPresent(v?.code ?? v?.exitCode, v?.signal) || command?.finishedAt && exitPresent(command.exitCode, command.signal);
    if (terminal) raw(run, `preparation/${stage}/checks/${e.name}`);
    else pending.push({ path: run, reason: 'Candidate checks not in a known terminal format; no pass inferred and no live fragments copied' });
  }
}
for (const name of ['lock-snapshot-promotion.json', 'owned-snapshot-review.md', 'promote-lock-snapshot.mjs', 'prepare-lock-snapshot-checks.mjs', 'archive-lock-snapshot.mjs']) add(`.autopilot/ph06/${name}`, `provenance/${name}`);
// Root may add another explicit review/repair note after an observed failure.
for (const e of fs.readdirSync(absolute('.autopilot/ph06'), { withFileTypes: true })) if (e.isFile() && /^(?:lock-snapshot|lock-relief|region-protection)[a-z0-9-]*(?:review|repair|promotion)[a-z0-9-]*\.(?:json|md|mjs)$/.test(e.name)) add(`.autopilot/ph06/${e.name}`, `provenance/${e.name}`);
for (const name of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'baseline-build.json']) add(`${checks}/${name}`, `runners/${name}`);
for (const name of ['check-http.mjs', 'http-before.json']) add(`${checks}/${name}`, `runners/${name}`, false);
const referenceNames = [`${priorArchive}/verification.json`, `${priorArchive}/inventory.json`, 'docs/evidence/2026-09-27-ph06-local-relief.md', 'docs/evidence/ph06-continuous-light-2026-09-27/verification.json', 'docs/evidence/ph06-continuous-light-2026-09-27/inventory.json'];
const reference = p => exists(p) ? { path: p, bytes: fs.statSync(absolute(p)).size, sha256: hash(p), copied: false } : { path: p, missing: true, copied: false };
const references = referenceNames.map(reference);
// Optional measurement-reference declaration is metadata only. Never recurse
// into a harness, its fixtures, storage or source trees. It cannot grant PASS.
const measurementPath = `${checks}/measurement-references.json`, measurement = optional(measurementPath), measurementReferences = [];
if (measurement) {
  add(measurementPath, 'observations/measurement-references.json');
  assert(Array.isArray(measurement.files), 'Measurement references must declare an explicit files array');
  for (const row of measurement.files) {
    const archivedMeasurement = typeof row.path === 'string' && /^docs\/evidence\/ph06-owned-snapshot-measurement-2026-09-28\/(?:raw\/resume-worker-entry-fixed\/)?verification\.json$/.test(row.path);
    assert(typeof row.path === 'string' && (archivedMeasurement || /^\.autopilot\/ph06\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)*(?:verification|results|measurements|observation|command|source-before|source-after)\.json$/.test(row.path)), 'Measurement reference must name a permitted JSON evidence artifact');
    const item = reference(row.path); if (row.sha256) assert(item.sha256 === row.sha256, `Measurement reference SHA mismatch: ${row.path}`);
    measurementReferences.push({ ...item, productPerformanceAccepted: false, scope: 'Isolated measurement reference only; no product performance acceptance' });
  }
}
const latestRoot = rootRuns.at(-1) ?? null, firstRoot = rootRuns.find(r => r.name === 'first');
if (!latestRoot) pending.push({ path: checks, reason: 'No terminal root check round' });
const priorPath = firstRoot ? `${firstRoot.source}/prior-build.json` : null;
const priorBuildBound = baselineIssues.length === 0 && !!priorPath && exists(priorPath) && hash(priorPath) === hash(baselinePath);
const currentBuildSha256 = exists('dist/build.json') ? hash('dist/build.json') : null;
const buildMatches = !!latestRoot?.build && !!currentBuildSha256 && hash(`${latestRoot.source}/build.json`) === currentBuildSha256;
const currentSourceDifferences = differences(latestRoot?.after), currentDistDifferences = differences(latestRoot?.v.dist);
// A native-test coordinate/witness correction can reuse the unchanged product
// checks only with explicit evidence. Keep the raw source diff; never widen
// this exception to src, tooling, package metadata, dist or another test.
const testOnlyFixPath = `${checks}/test-only-fix.json`, testOnlyFix = optional(testOnlyFixPath), testOnlyDeltaIssues = [];
const permittedTest = 'tests/atlas-detail-lock-relief.spec.ts';
let testOnlyDeltaValidated = false;
if (testOnlyFix) {
  add(testOnlyFixPath, 'provenance/test-only-fix.json');
  add('.autopilot/ph06/check-lock-browser-fix.mjs', 'provenance/check-lock-browser-fix.mjs');
  if (testOnlyFix.passed !== true || testOnlyFix.sourceStable !== true || testOnlyFix.productionChanges !== false || testOnlyFix.distRebuilt !== false || testOnlyFix.priorRoot !== latestRoot?.name) testOnlyDeltaIssues.push('Test-only terminal result does not affirm its bounded stable scope and original root round');
  const originalFailure = browsers.find(r => r.name === testOnlyFix.originalFailure);
  if (!originalFailure || originalFailure.v.code === 0 || originalFailure.report.passed) testOnlyDeltaIssues.push('Declared original browser failure is not present as terminal failed raw evidence');
  const sourceRows = snap(latestRoot?.after), before = sourceRows?.get(permittedTest), actual = exists(permittedTest) ? hash(permittedTest) : null;
  if (testOnlyFix.path !== permittedTest || !/^[a-f0-9]{64}$/.test(testOnlyFix.beforeSha256 ?? '') || !/^[a-f0-9]{64}$/.test(testOnlyFix.afterSha256 ?? '')
    || testOnlyFix.beforeSha256 !== before || testOnlyFix.afterSha256 !== actual || before === actual) testOnlyDeltaIssues.push('Test-only path or exact before/after SHA does not match the selected root snapshot and current file');
  if (currentSourceDifferences.length !== 1 || currentSourceDifferences[0].path !== permittedTest || currentSourceDifferences[0].expected !== testOnlyFix.beforeSha256 || currentSourceDifferences[0].actual !== testOnlyFix.afterSha256) testOnlyDeltaIssues.push('Root source delta is not exactly the one declared browser-spec change');
  for (const name of ['lint', 'types']) {
    const matches = Array.isArray(testOnlyFix.results) ? testOnlyFix.results.filter(r => r.name === name) : [];
    if (matches.length !== 1) { testOnlyDeltaIssues.push(`Missing or ambiguous actual test-only ${name} result`); continue; }
    const result = matches[0], start = Date.parse(result.startedAt), finish = Date.parse(result.finishedAt), args = result.args;
    const commandMatches = Array.isArray(args) && args.every(a => typeof a === 'string') && (name === 'lint'
      ? args.some(a => slash(a).endsWith('eslint/bin/eslint.js')) && args.some(a => slash(a) === permittedTest || a === 'tests')
      : args.some(a => /typescript\/bin\/tsc(?:\.js)?$/.test(slash(a))) && args.includes('--noEmit'));
    if (result.exitCode !== 0 || result.signal || result.error || !Number.isFinite(start) || !Number.isFinite(finish) || finish < start || !commandMatches) testOnlyDeltaIssues.push(`Test-only ${name} does not contain a terminal successful actual command`);
    const relativeLog = typeof result.log === 'string' && result.log.startsWith(`${checks}/`) ? result.log.slice(checks.length + 1) : result.log;
    if (typeof relativeLog !== 'string' || !/^[a-z0-9][a-z0-9._/-]*\.log$/i.test(relativeLog) || relativeLog.split('/').some(p => p.startsWith('.') || p === '..')) { testOnlyDeltaIssues.push(`Unsafe or missing test-only ${name} log reference`); continue; }
    const logPath = `${checks}/${relativeLog}`;
    if (!exists(logPath) || !/^[a-f0-9]{64}$/.test(result.logSha256 ?? '') || result.logSha256 !== hash(logPath)) { testOnlyDeltaIssues.push(`Test-only ${name} log missing or SHA mismatched`); continue; }
    add(logPath, `provenance/test-only-fix-logs/${relativeLog}`);
  }
  testOnlyDeltaValidated = testOnlyDeltaIssues.length === 0;
}
const remainingSourceDifferences = testOnlyDeltaValidated ? [] : currentSourceDifferences;
function distNames(dir) { return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(e => { assert(!e.isSymbolicLink(), `Symlink dist entry: ${e.name}`); return e.isDirectory() ? distNames(`${dir}/${e.name}`) : [`${dir}/${e.name}`]; }); }
const recordedDist = snap(latestRoot?.v.dist), extraDistFiles = exists('dist') ? distNames('dist').filter(p => !recordedDist?.has(p)) : [];
const finalBrowsers = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].map(project => {
  const run = browsers.filter(r => r.v.project === project && r.correctSpec).at(-1) ?? null;
  const currentProductDifferences = differences(run?.after, p => p.startsWith('src/') || p.startsWith('tests/') || p.startsWith('dist/'));
  const bound = !!run?.build && !!currentBuildSha256 && hash(`${run.source}/build.json`) === currentBuildSha256 && currentProductDifferences.length === 0 && identityDifferences(run.build).length === 0;
  if (!run) pending.push({ project, reason: 'No terminal actual atlas-detail-lock-relief.spec.ts run' });
  return { project, name: run?.name ?? null, elapsedMs: run?.v.elapsedMs ?? null, status: !run ? 'pending' : run.passed && bound ? 'passed' : 'failed_or_unbound', bound, currentProductDifferences, passed: !!run?.passed && bound };
});
for (const name of ['manual-observation.json', 'visual.json']) add(`${checks}/${name}`, `observations/${name}`);
if (exists(checks)) for (const e of fs.readdirSync(absolute(checks), { withFileTypes: true })) if (e.isFile() && /^manual-[a-z0-9-]+\.(png|json)$/.test(e.name)) add(`${checks}/${e.name}`, `observations/${e.name}`);
const manual = optional(`${checks}/manual-observation.json`), visual = optional(`${checks}/visual.json`), manualIssues = [];
if (!manual || manual.buildJsonSha256 !== currentBuildSha256) manualIssues.push('Manual observation missing or not bound to current build');
if (!visual || visual.buildJsonSha256 !== currentBuildSha256) manualIssues.push('Root workflow/visual decision missing or not bound to current build');
if (!Array.isArray(manual?.screenshots) || !manual.screenshots.length) manualIssues.push('No explicit manual screenshot identities');
else for (const screenshot of manual.screenshots) if (typeof screenshot.file !== 'string' || !/^manual-[a-z0-9-]+\.png$/.test(screenshot.file) || !exists(`${checks}/${screenshot.file}`) || screenshot.sha256 !== hash(`${checks}/${screenshot.file}`)) manualIssues.push('Manual screenshot name/hash mismatch');
const technicalPassed = !!latestRoot?.passed && buildMatches && remainingSourceDifferences.length === 0 && currentDistDifferences.length === 0 && extraDistFiles.length === 0 && latestRoot.v.dist?.length === 25 && priorBuildBound && finalBrowsers.every(r => r.passed);
add('.autopilot/ph06/lock-restore-cost-review.md', 'provenance/lock-restore-cost-review.md');
const allRequiredPassed = technicalPassed && pending.length === 0 && manualIssues.length === 0 && references.every(r => !r.missing);
const regionProtectionWorkflowAccepted = allRequiredPassed && visual?.regionProtectionWorkflowAccepted === true;
const compact = ({ after, order, ...r }) => r;
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  archiveComplete: true, technicalPassed, allRequiredPassed, regionProtectionWorkflowAccepted,
  naturalVisualAccepted: false, visualAccepted: false, userAccepted: false, allAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false,
  acceptanceScope: 'Actual regional protection with nonzero locks and local relief workflow only. No overall natural geography, user, PH, real-device, product performance or cloud acceptance.',
  rootRuns: rootRuns.map(compact), latestRoot: latestRoot?.name ?? null, browsers: { runs: browsers.map(compact), final: finalBrowsers },
  binding: { buildJsonSha256: currentBuildSha256, build: latestRoot?.build ?? null, buildMatches, currentSourceDifferences, testOnlyDeltaValidated, testOnlyDelta: { record: testOnlyFix, issues: testOnlyDeltaIssues }, remainingSourceDifferences, currentDistDifferences, extraDistFiles, distCount: latestRoot?.v.dist?.length ?? null, expectedGeneratorCount: generatorKeys.length, generatorCount: latestRoot?.build ? Object.keys(latestRoot.build).filter(k => k.endsWith('Generator')).length : null, generatorAndEngineUnchanged: latestRoot?.identityChanges.length === 0, identityDifferences: latestRoot?.identityChanges ?? ['No terminal root'], priorPreview12Bound: priorBuildBound, baselineIssues },
  manual: { observation: manual, issues: manualIssues }, visual: { observation: visual, bound: !!visual && visual.buildJsonSha256 === currentBuildSha256 },
  measurementReferences, pending, excluded, references,
  notes: [
    'All terminal failed rounds remain verbatim. A live or unknown verification is pending and its temporary artifacts are not copied.',
    'Seven root unit files are checked against actual Vitest assertions and selected scope. Written candidate counts, repeated runs and old preview12 tests are not summed as new unique tests.',
    'Every preview13 generator identity and engine identity must equal the actual preview12 eleven-generator baseline, whose build hash is bound to the completed prior archive.',
    'Three required browser runs each execute the actual atlas-detail-lock-relief.spec.ts once with no retries; independent snapshot measurements cannot substitute for this product workflow.',
    'A test-only fix can permit exactly the declared atlas-detail-lock-relief.spec.ts SHA delta from root checks, only with actual successful lint/types commands and hashed logs. Original source differences and the failed browser run remain visible. Product/dist binding and every browser before/after/current-source check are unchanged.',
    'No private saves, credentials, browser profiles, dist payloads, staging source mirrors, old full archives or hidden live trace fragments are copied.',
    'Isolated timing/cancellation measurements are explicit SHA references only. Functional browser elapsed time is not a performance gate or physical-device acceptance.',
    'Root JSON can accept only the regional protection workflow in this evidence scope; whole-natural visual, user, PH, device, performance and cloud acceptance remain false.',
  ],
};
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed before archive: ${item.source}`);
for (const item of [...references, ...measurementReferences]) if (!item.missing) assert(hash(item.path) === item.sha256, `Reference changed before archive: ${item.path}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`; fs.writeFileSync(absolute(marker), 'Incomplete until every copied raw file is verified and this marker is removed. Never overwrite a partial archive.\n', { flag: 'wx' });
const inventory = [];
const write = (name, data) => { const p = absolute(`${target}/${name}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ dest: name, generated: true, bytes: fs.statSync(p).size, sha256: hash(`${target}/${name}`) }); };
for (const item of files.values()) {
  const p = absolute(`${target}/${item.dest}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(absolute(item.source), p, fs.constants.COPYFILE_EXCL);
  assert(fs.statSync(p).size === item.bytes && hash(`${target}/${item.dest}`) === item.sha256, `Copy mismatch: ${item.dest}`); inventory.push(item);
}
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed during archive: ${item.source}`);
for (const item of [...references, ...measurementReferences]) if (!item.missing) assert(hash(item.path) === item.sha256, `Reference changed during archive: ${item.path}`);
write('verification.json', verification); write('references.json', { priorEvidence: references, isolatedMeasurements: measurementReferences });
write('README.md', `# 区域保护与私有快照本地证据\n\narchiveComplete=true 仅指已选择的终态原件复制和 SHA 核对完成。technicalPassed=${technicalPassed}，allRequiredPassed=${allRequiredPassed}，regionProtectionWorkflowAccepted=${regionProtectionWorkflowAccepted}。自然视觉、用户、PH、真机、性能与云端验收均为 false。脚本 exit0 不代表游戏完成。\n\n实际 root 七文件单元范围及全局检查、构建分别记录；全部终态失败与后续复查并存，候选只写用例和旧 preview12 测试不冒充新增通过数。三端必须执行 atlas-detail-lock-relief.spec.ts，核对真实非零 1/2/3 锁、允许的局部高程变化、单 bit 清除、混合撤销和刷新。\n\n当前 source/dist/build 均与终态证据绑定；preview13 的 11 个生成器及引擎逐项等于实际 preview12。旧局部山地与光照证据只保留哈希引用，不复制旧整包。隔离 snapshot 测量仅作单独引用，不授予产品性能通过。\n\nmanual 仅接受当前 build 绑定的本批 UI 观察与显式截图；不导出存档、认证、浏览器持久目录或 dist 产物。缺失或运行中项保留 pending，原始日志、结果和已完成 trace 见 raw，准备、提升和审阅见 preparation/provenance。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, measurementReferences, excludesSelf: true });
fs.unlinkSync(absolute(marker));
console.log(JSON.stringify({ target, archiveComplete: true, files: inventory.length, inventoryExcludesSelf: true, pending: pending.length, technicalPassed, allRequiredPassed, testOnlyDeltaValidated, regionProtectionWorkflowAccepted, naturalVisualAccepted: false, performanceAccepted: false, allAccepted: false }, null, 2));
