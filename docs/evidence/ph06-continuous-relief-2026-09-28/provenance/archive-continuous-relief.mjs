// Records evidence only: never starts checks, reads saves, or copies dist payloads.
// Exit 0 means the selected terminal evidence was archived, not game acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-continuous-relief-2026-09-28';
const checks = '.autopilot/ph06/continuous-relief-checks';
const prior = 'docs/evidence/ph06-lock-snapshot-2026-09-27';
const history = 'docs/evidence/ph06-preview13-generator-history-2026-09-28';
const numericRoot = '.autopilot/ph06/v4-natural-visual-repair-staging/checks/continuous-type-guard-fix';
const spec = 'tests/atlas-detail-lock-relief.spec.ts';
const specSha = '3a9a56479c5c28005558b6a726a57ed5a43d4893ea6f434d40f2f86b659f6aa6';
const expectedBuildSha = '702726d6fa956e2f647ff2fe91d9f136479aeef3888acc151c30bd0e95712075';
const projects = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'];
const algorithmKeys = ['naturalDetailGenerator', 'addNaturalDetailGenerator', 'localDetailReliefGenerator'];
const expectedUnits = [
  'src/world/generation/detail-curved-ridge.test.ts', 'src/world/generation/detail-local-background.test.ts',
  'src/world/generation/detail-local-relief.test.ts', 'src/world/generation/detail-natural-visual-repair.test.ts',
  'src/world/generation/detail-shape-natural.test.ts', 'src/world/detail-local-relief-session.test.ts',
  'src/world/detail-natural-integration.test.ts', 'src/world/detail-natural-history.test.ts',
  'src/world/detail-preview13-history.test.ts', 'src/world/generation/fingerprint.test.ts',
  'src/world/renderer-detail-reuse.test.ts', 'src/world/renderer.test.ts', 'src/world/constraints-receiver.test.ts',
];
const assert = (value, why) => { if (!value) throw new Error(why); };
const slash = value => value.replaceAll('\\', '/');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function absolute(file) {
  const full = path.resolve(root, file), relative = path.relative(root, full);
  assert(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`), `Unsafe workspace path: ${file}`);
  return full;
}
const exists = file => fs.existsSync(absolute(file));
const bytes = file => fs.readFileSync(absolute(file));
const hash = file => sha(bytes(file));
const read = file => JSON.parse(bytes(file).toString().replace(/^\uFEFF/, ''));
const optional = file => exists(file) ? read(file) : null;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const terminalExit = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
const pending = [], excluded = [], files = new Map(), references = [];
assert(process.argv.length === 2, 'No path arguments accepted');
assert(!exists(target), `Refusing to overwrite existing archive: ${target}`);

function add(source, dest, required = true) {
  if (!exists(source)) { if (required) pending.push({ path: source, reason: 'Required evidence missing' }); return; }
  const stat = fs.lstatSync(absolute(source));
  assert(stat.isFile() && !stat.isSymbolicLink(), `Nonregular evidence: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate archive destination: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
function reference(file) {
  const row = exists(file) ? { path: file, bytes: fs.statSync(absolute(file)).size, sha256: hash(file), copied: false }
    : { path: file, missing: true, copied: false };
  references.push(row); return row;
}
function snapshot(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const result = new Map();
  for (const row of rows) {
    if (typeof row.path !== 'string' || !validHash(row.sha256)) return null;
    const file = slash(path.isAbsolute(row.path) ? path.relative(root, row.path) : row.path);
    if (!/^(?:src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(file) || file.split('/').some(part => part.startsWith('.')) || result.has(file)) return null;
    absolute(file); result.set(file, row.sha256);
  }
  return result;
}
function snapshotDiff(a, b) {
  const left = snapshot(a), right = snapshot(b);
  if (!left || !right) return [{ reason: 'Missing/malformed snapshot' }];
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(file => left.get(file) === right.get(file) ? [] : [{ path: file, before: left.get(file) ?? null, after: right.get(file) ?? null }]);
}
function currentDiff(rows) {
  const records = snapshot(rows);
  return records ? [...records].flatMap(([file, expected]) => exists(file) && hash(file) === expected ? [] : [{ path: file, expected, actual: exists(file) ? hash(file) : null }]) : [{ reason: 'Missing/malformed snapshot' }];
}
function actualDistFiles(dir = 'dist') {
  if (!exists(dir)) return [];
  return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `Symlink dist entry: ${entry.name}`);
    return entry.isDirectory() ? actualDistFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`];
  });
}
// Only named root artifacts and completed browser output are copied. Never
// recurse through staging bags, fixtures, hidden live traces or browser stores.
function copyRun(source, dest, browser, v) {
  for (const file of ['verification.json', 'build.json', 'prior-build.json', 'scope.json', 'source-before.json', 'source-after.json', 'before.json', 'after.json', 'unit.json', 'results.json', 'run.log', 'plan.log', 'lint.log', 'types.log', 'unit.log', 'build.log', 'dist-audit.log']) add(`${source}/${file}`, `${dest}/${file}`, false);
  for (const file of browser ? ['verification.json', 'before.json', 'after.json', 'build.json', 'results.json', 'run.log'] : ['verification.json', 'source-before.json', 'source-after.json', 'scope.json', ...v.results.map(row => `${row.name}.log`)]) add(`${source}/${file}`, `${dest}/${file}`);
  if (!browser || !exists(`${source}/artifacts`)) return;
  const walk = (dir, output) => {
    for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `Symlink browser artifact: ${file}`);
      if (entry.name.startsWith('.') || ['resources', 'profiles', 'indexeddb', 'saves', 'auth'].includes(entry.name)) { excluded.push(file); continue; }
      if (entry.isDirectory()) walk(file, `${output}/${entry.name}`);
      else if (/\.(?:png|jpg|jpeg|webp|svg|webm|zip|json|md|txt|log)$/.test(entry.name)) add(file, `${output}/${entry.name}`);
      else excluded.push(file);
    }
  };
  walk(`${source}/artifacts`, `${dest}/artifacts`);
}
function unitEvidence(data, scope) {
  const assertions = (data?.testResults ?? []).flatMap(file => file.assertionResults ?? []);
  const unitFiles = (data?.testResults ?? []).map(file => slash(path.isAbsolute(file.name) ? path.relative(root, file.name) : file.name)).sort();
  const scopeMatches = equal(unitFiles, [...expectedUnits].sort()) && equal([...(scope?.unitFiles ?? [])].sort(), [...expectedUnits].sort());
  const passed = scopeMatches && data?.success === true && data.numTotalTests === 157 && data.numPassedTests === 157 && data.numFailedTests === 0 && data.numPendingTests === 0 && data.numFailedTestSuites === 0 && assertions.length === 157 && assertions.every(row => row.status === 'passed');
  return { scopeMatches, files: unitFiles, total: data?.numTotalTests ?? null, passedAssertions: data?.numPassedTests ?? null, observedAssertions: assertions.length, passed };
}
function browserEvidence(data, project) {
  const tests = [];
  const walk = suites => { for (const suite of suites ?? []) { for (const row of suite.specs ?? []) for (const test of row.tests ?? []) tests.push({ file: row.file ?? suite.file, project: test.projectName, title: row.title, timeout: test.timeout, status: test.status, results: (test.results ?? []).map(result => ({ status: result.status, retry: result.retry, duration: result.duration })) }); walk(suite.suites); } };
  walk(data?.suites);
  const config = data?.config?.projects?.find(row => row.name === project);
  const unchangedBudget = config?.retries === 0 && config.repeatEach === 1 && tests.length === 1 && tests[0].timeout === 450000;
  const correctSpec = tests.length === 1 && path.basename(tests[0].file ?? '') === path.basename(spec) && tests[0].project === project;
  const passed = unchangedBudget && correctSpec && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && tests.every(test => test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0);
  return { tests, stats: data?.stats ?? null, unchangedBudget, correctSpec, passed };
}
const rootRuns = [], browsers = [];
if (!exists(checks)) pending.push({ path: checks, reason: 'Checks directory missing' });
else for (const entry of fs.readdirSync(absolute(checks), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  assert(!entry.isSymbolicLink(), `Symlink check round: ${entry.name}`);
  const source = `${checks}/${entry.name}`, file = `${source}/verification.json`;
  let v; try { v = optional(file); } catch { v = null; }
  const browser = typeof v?.project === 'string';
  const terminal = browser ? Number.isFinite(v.elapsedMs) && terminalExit(v.code, v.signal)
    : Array.isArray(v?.results) && v.results.length > 0 && v.results.every(row => row.finishedAt && terminalExit(row.exitCode, row.signal));
  if (!terminal) { pending.push({ path: source, reason: 'Live, incomplete or unknown round; no temporary fragments copied' }); continue; }
  const before = optional(`${source}/${browser ? 'before' : 'source-before'}.json`), after = optional(`${source}/${browser ? 'after' : 'source-after'}.json`);
  const stable = (browser ? v.sourceAndDistStable : v.sourceStable) === true && snapshotDiff(before, after).length === 0;
  const row = { name: entry.name, source, v, before, after, stable, build: optional(`${source}/build.json`), order: fs.statSync(absolute(file)).mtimeMs };
  copyRun(source, `raw/${browser ? 'browser' : 'root'}/${entry.name}`, browser, v);
  if (browser) {
    const report = browserEvidence(optional(`${source}/results.json`), v.project);
    browsers.push({ ...row, report, passed: v.code === 0 && !v.signal && stable && report.passed });
  } else {
    const unit = unitEvidence(optional(`${source}/unit.json`), optional(`${source}/scope.json`));
    const expectedCommands = {
      plan: ['scripts/check-plan.mjs'], lint: ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts'],
      types: ['node_modules/typescript/bin/tsc', '--noEmit'],
      unit: ['node_modules/vitest/vitest.mjs', 'run', ...expectedUnits, '--reporter=json', `--outputFile=${source}/unit.json`],
      build: ['node_modules/vite/bin/vite.js', 'build'], 'dist-audit': ['scripts/check-dist.mjs'],
    };
    const commandPassed = v.results.length === 6 && Object.entries(expectedCommands).every(([name, args]) => v.results.filter(result => result.name === name && equal(result.args, args) && result.exitCode === 0 && !result.signal && !result.error && Number.isFinite(Date.parse(result.startedAt)) && Date.parse(result.finishedAt) >= Date.parse(result.startedAt)).length === 1);
    rootRuns.push({ ...row, unit, commandPassed, rawPassed: v.passed === true });
  }
}
rootRuns.sort((a, b) => a.order - b.order); browsers.sort((a, b) => a.order - b.order);
const selectedRoot = rootRuns.at(-1) ?? null, reconciledRoot = rootRuns.find(row => row.name === 'type-guard-fix');
if (!selectedRoot) pending.push({ path: checks, reason: 'No terminal root check round' });
const build = optional('dist/build.json'), buildSha = exists('dist/build.json') ? hash('dist/build.json') : null;
const baseline = optional(`${checks}/baseline-build.json`), historyBuild = optional(`${history}/build.json`);
const generatorKeys = Object.keys(build ?? {}).filter(key => key.endsWith('Generator')).sort();
const priorRecord = optional(`${prior}/verification.json`), historyRecord = optional(`${history}/provenance.json`);
const baselineBound = baseline?.version === '0.5.0-preview.13' && exists(`${checks}/baseline-build.json`) && exists(`${history}/build.json`) && hash(`${checks}/baseline-build.json`) === hash(`${history}/build.json`)
  && priorRecord?.archiveComplete === true && priorRecord.binding?.buildJsonSha256 === hash(`${history}/build.json`) && historyRecord?.buildSha256 === hash(`${history}/build.json`);
// Preserve the false original root result. Validate the separate correction
// receipt against its exact root bytes, snapshot and build before reuse.
const receiptPath = `${checks}/identity-reconciliation.json`, receipt = optional(receiptPath), identityIssues = [];
const issue = (ok, message) => { if (!ok) identityIssues.push(message); };
issue(!!receipt && !!reconciledRoot, 'Missing identity reconciliation receipt or original root');
if (receipt && reconciledRoot) {
  issue(receipt.originalRoot === `${reconciledRoot.source}/verification.json` && receipt.originalRootSha256 === hash(receipt.originalRoot), 'Receipt original root path/SHA mismatch');
  issue(receipt.originalRootPassed === false && reconciledRoot.v.passed === false, 'Original recorder failure was not preserved');
  issue(receipt.sourceSnapshotSha256 === hash(`${reconciledRoot.source}/source-after.json`) && receipt.buildSha256 === hash(`${reconciledRoot.source}/build.json`) && receipt.buildSha256 === buildSha, 'Receipt snapshot/build SHA mismatch');
  issue(receipt.passed === true && receipt.sourceStable === true && receipt.helperClosureCorrect === true && receipt.unitRerun === false && receipt.distRebuilt === false && receipt.productChanges === false, 'Receipt scope or outcome is not the independent unchanged-product reconciliation');
  issue(generatorKeys.length === 11 && equal(generatorKeys, Object.keys(baseline ?? {}).filter(key => key.endsWith('Generator')).sort()) && equal(generatorKeys, (receipt.checks ?? []).map(row => row.key).sort()), 'Receipt does not cover all eleven actual registered generators exactly once');
  for (const row of receipt.checks ?? []) {
    const algorithm = algorithmKeys.includes(row.key), current = build?.[row.key], old = baseline?.[row.key];
    issue(row.actualSha256 === current?.sha256 && row.oldSha256 === old?.sha256 && row.currentMatchesBuild === true && row.frozenMatchesPrior === true && row.includesRegistry === true && current?.files?.includes('src/world/generation-history.ts'), `Closure binding incomplete: ${row.key}`);
    issue(validHash(row.historyOnlyReversedSha256) && row.algorithmChangeExpected === algorithm && row.algorithmChangeMatchesExpectation === true && (row.historyOnlyReversedSha256 !== row.oldSha256) === algorithm, `History-only versus terrain change classification differs: ${row.key}`);
  }
  issue(build?.engineFingerprint === baseline?.engineFingerprint && validHash(build?.engineFingerprint), 'Engine identity changed or missing');
  issue(algorithmKeys.every(key => build?.[key]?.files?.includes('src/world/generation/detail-curved-ridge.ts')) && build?.localDetailReliefGenerator?.files?.includes('src/world/generation/detail-local-background.ts'), 'Expected terrain helper absent from actual closure');
  issue(baselineBound && exists(`${reconciledRoot.source}/prior-build.json`) && hash(`${reconciledRoot.source}/prior-build.json`) === hash(`${history}/build.json`), 'Prior preview13 identity is not bound to actual frozen/prior archive evidence');
}
const identityReconciled = identityIssues.length === 0;
const sourceDifferences = currentDiff(selectedRoot?.after), distDifferences = currentDiff(selectedRoot?.v.dist);
const recordedDist = snapshot(selectedRoot?.v.dist), actualDist = actualDistFiles();
const extraDist = actualDist.filter(file => !recordedDist?.has(file));
const buildBound = buildSha === expectedBuildSha && selectedRoot?.build?.version === '0.5.0-preview.14' && exists(`${selectedRoot.source}/build.json`) && hash(`${selectedRoot.source}/build.json`) === buildSha;
const expectedSourceNames = [...actualDistFiles('src'), ...actualDistFiles('tests'), ...actualDistFiles('scripts'), 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].sort();
const sourceNamesComplete = equal([...(snapshot(selectedRoot?.after)?.keys() ?? [])].sort(), expectedSourceNames);
const rootTechnicalPassed = !!selectedRoot && selectedRoot.name === reconciledRoot?.name && selectedRoot.commandPassed && selectedRoot.unit.passed && selectedRoot.stable && identityReconciled && buildBound && sourceNamesComplete && sourceDifferences.length === 0 && distDifferences.length === 0 && extraDist.length === 0 && recordedDist?.size === 25 && actualDist.length === 25;
const first = rootRuns.find(row => row.name === 'first');
if (!first) pending.push({ path: `${checks}/first`, reason: 'Original terminal TS failure evidence missing' });
const typeGuardSourceDelta = snapshotDiff(first?.after, reconciledRoot?.before);
const typeGuardEvidence = { sourceDelta: typeGuardSourceDelta, soleRendererChange: typeGuardSourceDelta.length === 1 && typeGuardSourceDelta[0].path === 'src/world/renderer.ts', firstTypesFailed: first?.v.results.some(row => row.name === 'types' && row.exitCode === 2) === true, firstFailurePreserved: !!first && first.v.passed === false };
const finalBrowsers = projects.map(project => {
  const run = browsers.filter(row => row.v.project === project).at(-1), currentDifferences = run ? currentDiff(run.after) : [];
  const source = run ? snapshot(run.after) : null;
  const browserSourceNames = [...actualDistFiles('src'), ...actualDistFiles('tests'), ...actualDist].sort();
  const sourceNamesComplete = equal([...(source?.keys() ?? [])].sort(), browserSourceNames);
  const bound = !!run?.build && hash(`${run.source}/build.json`) === buildSha && sourceNamesComplete && currentDifferences.length === 0 && source?.get(spec) === specSha && exists(spec) && hash(spec) === specSha;
  if (!run) pending.push({ project, reason: 'No terminal actual lock/relief product browser round' });
  return { project, name: run?.name ?? null, elapsedMs: run?.v.elapsedMs ?? null, bound, sourceNamesComplete, currentDifferences, passed: !!run?.passed && bound, status: !run ? 'pending' : run.passed && bound ? 'passed' : 'failed_or_unbound' };
});

for (const stage of ['v4-preview13-history-staging', 'v4-curved-relief-staging', 'v4-local-background-staging', 'v4-lock-render-reuse-staging']) {
  for (const file of ['ready-manifest.json', 'README.md']) add(`.autopilot/ph06/${stage}/${file}`, `preparation/${stage}/${file}`);
  for (const file of ['baseline.json', 'baseline-manifest.json', 'receipt-supplement.json']) add(`.autopilot/ph06/${stage}/${file}`, `preparation/${stage}/${file}`, false);
}
for (const file of ['continuous-relief-promotion.json', 'continuous-relief-review.md', 'promote-continuous-relief.mjs', 'prepare-continuous-relief-checks.mjs', 'prepare-continuous-browsers.mjs', 'verify-continuous-relief-identities.mjs', 'archive-continuous-relief.mjs']) add(`.autopilot/ph06/${file}`, `provenance/${file}`);
for (const file of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'baseline-build.json', 'identity-reconciliation.json']) add(`${checks}/${file}`, `runners/${file}`);
add('playwright.config.ts', 'runners/base-playwright.config.ts');
for (const file of ['http-before.json', 'http-verification.json']) add(`${checks}/${file}`, `observations/${file}`, false);
for (const file of [`${prior}/verification.json`, `${prior}/inventory.json`, `${history}/build.json`, `${history}/provenance.json`, `${history}/inventory.json`]) reference(file);
const historyInventory = optional(`${history}/inventory.json`), frozenHistoryIssues = [];
if (!Array.isArray(historyInventory?.files)) frozenHistoryIssues.push('Frozen preview13 inventory missing');
else for (const row of historyInventory.files) {
  const file = `${history}/${row.path}`;
  if (!exists(file) || hash(file) !== row.sha256 || fs.statSync(absolute(file)).size !== row.bytes) frozenHistoryIssues.push(`Frozen source/evidence bytes differ: ${row.path}`);
}
const numericFiles = ['actual-256-height-field.json', 'actual-256-height-field.png', 'actual-256-height-field.svg'];
const unitCommand = reconciledRoot?.v.results.find(row => row.name === 'unit');
const numeric = { scope: 'Numerical height-field diagnostic only; not a product screenshot or natural visual acceptance', producer: 'src/world/generation/detail-natural-visual-repair.test.ts', files: [], visualAccepted: false };
for (const file of numericFiles) {
  const source = `${numericRoot}/${file}`; add(source, `numeric/${file}`);
  if (exists(source)) { const modified = fs.statSync(absolute(source)).mtimeMs; numeric.files.push({ path: source, sha256: hash(source), bytes: fs.statSync(absolute(source)).size, modifiedDuringActualUnitCommand: modified >= Date.parse(unitCommand?.startedAt) && modified <= Date.parse(unitCommand?.finishedAt) }); }
}
numeric.boundToUnitSource = numeric.files.length === numericFiles.length && numeric.files.every(row => row.modifiedDuringActualUnitCommand) && snapshot(reconciledRoot?.after)?.get(numeric.producer) === (exists(numeric.producer) ? hash(numeric.producer) : null);
// Manual review is optional. A bound product visual observation is required,
// but its completeness cannot grant whole-natural/user/PH acceptance.
const manual = optional(`${checks}/manual-observation.json`), visual = optional(`${checks}/visual.json`), observationIssues = [], visualIssues = [];
if (!visual) pending.push({ path: `${checks}/visual.json`, reason: 'Product screenshot/visual review not yet recorded; no natural acceptance inferred' });
for (const [file, value] of [['manual-observation.json', manual], ['visual.json', visual]]) if (value) {
  add(`${checks}/${file}`, `observations/${file}`);
  if (file === 'manual-observation.json' && value.buildJsonSha256 !== buildSha) observationIssues.push(`${file}: current build SHA not bound`);
}
if (manual) for (const row of manual.screenshots ?? []) {
  if (typeof row.file !== 'string' || !/^manual-[a-z0-9-]+\.png$/.test(row.file) || !exists(`${checks}/${row.file}`) || row.sha256 !== hash(`${checks}/${row.file}`)) observationIssues.push('Manual screenshot name/hash mismatch');
  else add(`${checks}/${row.file}`, `observations/${row.file}`);
}
const productScreenshots = new Map([...files.values()].filter(file => file.source.endsWith('.png') && browsers.some(run => projects.includes(run.v.project) && file.source.startsWith(`${run.source}/artifacts/`))).map(file => [file.source, file]));
const visualScreenshots = [], nonemptyText = value => typeof value === 'string' && value.trim().length > 0;
if (visual) {
  if (typeof visual !== 'object' || Array.isArray(visual)) visualIssues.push('visual.json: expected an observation object');
  else {
    if (typeof visual.recordedAt !== 'string' || !Number.isFinite(Date.parse(visual.recordedAt))) visualIssues.push('visual.json: recordedAt must be a valid date string');
    if (visual.buildJsonSha256 !== buildSha) visualIssues.push('visual.json: current build SHA not bound');
    if (!nonemptyText(visual.scope)) visualIssues.push('visual.json: scope must be nonempty text');
    if (!Array.isArray(visual.observations) || visual.observations.length === 0 || !visual.observations.every(nonemptyText)) visualIssues.push('visual.json: observations must contain nonempty text entries');
    if (!Array.isArray(visual.screenshots) || visual.screenshots.length === 0) visualIssues.push('visual.json: at least one terminal product browser PNG is required');
    else {
      const seen = new Set();
      for (const row of visual.screenshots) {
        const file = row && typeof row.path === 'string' ? productScreenshots.get(row.path) : null;
        if (!file || !validHash(row.sha256) || row.sha256 !== file.sha256 || seen.has(row.path)) visualIssues.push('visual.json: screenshot must uniquely match an archived terminal product browser PNG path/SHA');
        else { seen.add(row.path); visualScreenshots.push({ path: row.path, archivePath: file.dest, sha256: file.sha256 }); }
      }
    }
  }
}
observationIssues.push(...visualIssues);
const visualComplete = !!visual && visualIssues.length === 0;
const technicalPassed = rootTechnicalPassed && finalBrowsers.every(row => row.passed);
const allRequiredPassed = technicalPassed && visualComplete && pending.length === 0 && references.every(row => !row.missing) && frozenHistoryIssues.length === 0 && numeric.boundToUnitSource && observationIssues.length === 0;
const compact = ({ before, after, order, ...row }) => row;
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), archiveComplete: true,
  technicalPassed, allRequiredPassed, rootTechnicalPassed, naturalVisualAccepted: false, visualAccepted: false, userAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, allAccepted: false, cloudWrites: false,
  scope: 'Continuous relief data and unchanged-geography display reuse, plus unchanged nonzero-lock browser workflow. No whole-natural, user, PH, performance, real-device or cloud acceptance.',
  rootRuns: rootRuns.map(compact), latestRoot: selectedRoot?.name ?? null, identityReconciliation: { receipt, validated: identityReconciled, issues: identityIssues },
  typeGuardEvidence, browsers: { runs: browsers.map(compact), final: finalBrowsers },
  binding: { buildJsonSha256: buildSha, expectedBuildSha, build, buildBound, sourceNamesComplete, sourceDifferences, distDifferences, extraDist, distCount: actualDist.length, generatorCount: generatorKeys.length, baselineBound, frozenHistoryIssues },
  review: { path: 'provenance/continuous-relief-review.md', scope: 'Static joint review predates the C1 side-width correction. Preserve its original finding and source SHAs; it is not review or test acceptance of the corrected code.' },
  numeric, manual: { observation: manual, optional: true }, visual: { observation: visual, required: true, optional: false, bound: visualComplete, complete: visualComplete, screenshots: visualScreenshots, accepted: false }, observationIssues,
  pending, pendingEvidence: pending.length > 0, excluded, references,
  notes: [
    'All terminal failures stay verbatim, including the initial TS failure and the successful six-command round whose recorder incorrectly reports passed=false.',
    'The separately SHA-bound reconciliation corrects only identity classification: eight closure changes are history-only, three also change terrain. It never replaces the original result or reruns checks.',
    'Exactly thirteen actual Vitest files and 157 assertions are checked. Repeated runs, authored candidates and inherited evidence are not counted as new unique tests.',
    'Each product browser must execute the unchanged atlas-detail-lock-relief.spec.ts once, retries=0, timeout=450000ms. Missing/live rounds remain pending; all failed terminal rounds remain visible.',
    'Numeric PNG/JSON/SVG are exact unit-produced diagnostics, not product-renderer screenshots or visual approval. Manual records are optional. A dated visual observation with scope, nonempty findings, exact build binding and terminal product browser PNG path/SHA binding is required; completeness is not visual approval.',
    'Prior preview13 failures and frozen generator history are hash references only; no private saves, credentials, dist payloads, old archive bags or staging source mirrors are copied.',
    'Archive exit0 affirms copying and SHA checks, never technical/game acceptance. All whole-natural/user/PH/performance/real-device flags stay false.',
  ],
};
// Freeze input hashes before writing. A partial archive is never overwritten.
for (const file of files.values()) assert(hash(file.source) === file.sha256, `Input changed before archive: ${file.source}`);
for (const row of references) if (!row.missing) assert(hash(row.path) === row.sha256, `Reference changed before archive: ${row.path}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`;
fs.writeFileSync(absolute(marker), 'Incomplete until all selected original bytes and hashes are copied and this marker is removed.\n', { flag: 'wx' });
const inventory = [];
const write = (dest, data) => { const file = absolute(`${target}/${dest}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ dest, generated: true, bytes: fs.statSync(file).size, sha256: hash(`${target}/${dest}`) }); };
for (const row of files.values()) {
  const file = absolute(`${target}/${row.dest}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(absolute(row.source), file, fs.constants.COPYFILE_EXCL);
  assert(hash(`${target}/${row.dest}`) === row.sha256 && fs.statSync(file).size === row.bytes, `Copy mismatch: ${row.dest}`); inventory.push(row);
}
for (const row of files.values()) assert(hash(row.source) === row.sha256, `Input changed during archive: ${row.source}`);
for (const row of references) if (!row.missing) assert(hash(row.path) === row.sha256, `Reference changed during archive: ${row.path}`);
write('verification.json', verification); write('references.json', { priorEvidence: references });
write('README.md', `# 连续山地与显示复用本地证据\n\narchiveComplete=true 仅表示已选择终态原件复制完成；technicalPassed=${technicalPassed}，allRequiredPassed=${allRequiredPassed}，pending=${pending.length}。自然视觉、用户、PH、真机、性能及云端均未验收。\n\n保留首轮类型失败与修复轮原始 passed=false。后者六项实际命令、13 个单元文件 157 项断言以及独立身份校正分别核对，不改写原结果。真实 11 闭包中 8 项仅历史依赖变化，3 项含地形实现变化；引擎身份不变。\n\n三端原保护/局部山地流程保持原 450 秒预算和零重试。每个终态失败保留，运行中项不复制临时碎片也不猜测通过。数值 PNG/JSON/SVG 仅为真实高程诊断；静态联合审阅早于 C1 修复，不是修后验收。旧 preview13 与原件历史仅哈希引用。\n\n不含真实存档、认证、发布产物或旧整包。exit0 只代表归档完成，详情见 verification.json 与 inventory.json。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
console.log(JSON.stringify({ target, archiveComplete: true, files: inventory.length, pending: pending.length, technicalPassed, allRequiredPassed, identityReconciled, naturalVisualAccepted: false, allAccepted: false }, null, 2));
