// Prepared only: root runs this after actual unified/GPU/browser/visual records
// finish. No tests, build, browser, source edits, commits or cloud actions run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const target = 'docs/evidence/ph06-natural-range-sea-2026-09-28';
const fine = '.autopilot/ph06/natural-ranges-staging', sea = '.autopilot/ph06/ocean-material-staging';
const checks = '.autopilot/ph06/natural-range-sea-checks', browser = '.autopilot/ph06/natural-range-sea-browser';
const density = '.autopilot/ph06/natural-range-sea-density-repair';
const history = 'docs/evidence/ph06-preview21-generator-history-2026-09-28';
const priorBuildSha = '639ca2288c4d4ca0d3e8f21762c06be8e49678045c45c8dadfc91ec2314d7761';
const expectedProjects = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'];
const assert = (ok, reason) => { if (!ok) throw Error(reason); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function safe(relative) {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), `Unsafe path: ${relative}`);
  const full = path.resolve(root, relative), relation = path.relative(root, full);
  assert(relation && !relation.startsWith('..') && !path.isAbsolute(relation), `Outside project: ${relative}`);
  let current = root;
  for (const part of relation.split(path.sep)) { current = path.join(current, part); assert(!fs.lstatSync(current).isSymbolicLink(), `Symlink/junction: ${relative}`); }
  return full;
}
function bytes(file) {
  const full = safe(file), stat = fs.lstatSync(full);
  assert(stat.isFile() && stat.size <= 128 * 1024 * 1024, `Nonregular or >128MiB source: ${file}`);
  return fs.readFileSync(full);
}
const hash = file => digest(bytes(file));
const read = file => JSON.parse(bytes(file).toString('utf8').replace(/^\uFEFF/, ''));
const sourcePath = file => assert(/^(src|tests|scripts)\//.test(file) || ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].includes(file), `Unexpected production source path: ${file}`);
assert(!fs.existsSync(target), 'Refusing to overwrite an existing or interrupted archive');
const selected = new Map(), omitted = [], candidateRounds = [];
function add(source, dest, expectedSha) {
  assert(!selected.has(dest) && !path.isAbsolute(dest) && !dest.split(/[\\/]/).includes('..'), `Duplicate/unsafe destination: ${dest}`);
  const data = bytes(source), sha256 = digest(data);
  assert(!expectedSha || expectedSha === sha256, `Original source byte mismatch: ${source}`);
  selected.set(dest, { source, path: dest, bytes: data.length, sha256 });
}
const entries = base => fs.readdirSync(safe(base), { withFileTypes: true }).map(entry => { assert(!entry.isSymbolicLink(), `Evidence link: ${base}/${entry.name}`); return entry; });
const directories = base => entries(base).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
function topFiles(base, dest, allowed, required) {
  const list = entries(base);
  for (const name of required) assert(list.some(entry => entry.name === name && entry.isFile()), `Missing terminal evidence: ${base}/${name}`);
  for (const entry of list) if (entry.isFile()) { assert(allowed.includes(entry.name), `Unexpected evidence file: ${base}/${entry.name}`); add(`${base}/${entry.name}`, `${dest}/${entry.name}`); }
}

// Fine ranges: preserve both failures, their own actual source snapshots and
// the passing freeze. Supplemental dependencies retain their honest boundary.
const fineReady = read(`${fine}/ready/manifest.json`), fineNames = ['first', 'repair-1', 'repair-2'];
assert(equal(directories(`${fine}/checks`), fineNames), 'Review additional fine candidate rounds before archiving');
const fineSourceNames = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'src/world/generation/fine-range-tree.ts', 'natural-ranges.test.ts', 'natural-writer.test.ts', 'vitest.config.ts', 'typecheck.mjs'];
const fineTop = ['verification.json', 'unit.json', 'unit.log', 'types.log', 'lint.log', 'measurements.json', 'writer-measurements.json'];
for (const name of fineNames) {
  const base = `${fine}/checks/${name}`, dest = `fine-candidate/${name}`, record = read(`${base}/verification.json`), unit = read(`${base}/unit.json`);
  assert(record.checks.length === 3 && record.checks.every(step => Number.isInteger(step.exitCode)), `Fine candidate is unfinished: ${name}`);
  assert(record.sourceStable && equal(record.sourceBefore, record.sourceAfter) && !record.productionChangedDuringCheck && record.baselineProductionStillExact, `Unstable fine candidate: ${name}`);
  assert(record.passed === (name === 'repair-2') && unit.numTotalTests === record.units.total && unit.numPassedTests === record.units.passed && unit.numFailedTests === record.units.failed, `Fine verdict differs: ${name}`);
  topFiles(base, dest, fineTop, fineTop.filter(file => file !== 'writer-measurements.json'));
  for (const [file, sha256] of Object.entries(record.sourceBefore)) { assert(fineSourceNames.includes(file), `Unexpected fine snapshot: ${file}`); add(`${base}/source/${file}`, `${dest}/source/${file}`, sha256); }
  candidateRounds.push({ candidate: 'fine-ranges', name, passed: record.passed, checks: record.checks, units: record.units });
}
assert(fineReady.checkRound === 'repair-2' && fineReady.units.total === 27 && fineReady.units.passed === 27 && fineReady.types === 'passed' && fineReady.lint === 'passed', 'Fine ready does not bind its final candidate round');
topFiles(`${fine}/ready`, 'fine-candidate/ready', ['manifest.json', ...fineTop], ['manifest.json', ...fineTop]);
const frozenFine = read(`${fine}/checks/repair-2/verification.json`);
assert(equal(fineReady.verifiedSource, frozenFine.sourceAfter), 'Fine ready source map differs from checked source');
for (const [file, sha256] of Object.entries(fineReady.verifiedSource)) {
  add(`${fine}/ready/source/${file}`, `fine-candidate/ready/source/${file}`, sha256);
  assert(hash(`${fine}/ready/source/${file}`) === hash(`${fine}/checks/repair-2/source/${file}`), `Fine freeze copy differs: ${file}`);
}
for (const row of fineReady.supplementalDependencies) { sourcePath(row.file); add(`${fine}/ready/postcheck-dependencies/${row.file}`, `fine-candidate/ready/postcheck-dependencies/${row.file}`, row.sha256); }
for (const file of ['baseline-manifest.json', 'README.md', 'integration-review.md', 'check.mjs', 'freeze.mjs']) add(`${fine}/${file}`, `fine-candidate/recording/${file}`);

// Prepared production tests and every actual promotion result, including the
// original replaced test. Preparation is not retroactively called a test pass.
const testPlan = read(`${fine}/production-tests/manifest.json`);
assert(testPlan.readyManifestSha256 === hash(`${fine}/ready/manifest.json`), 'Fine production test preparation references another candidate');
const fineTestTargets = ['src/world/generation/detail-natural-ranges.test.ts', 'src/world/generation/detail-natural-ranges-writer.test.ts', 'src/world/generation/detail-fine-world-relief.test.ts'];
assert(equal(testPlan.files.map(row => row.target).sort(), [...fineTestTargets].sort()), 'Unexpected fine test promotion scope');
for (const file of ['README.md', 'manifest.json', 'prepare.mjs', 'promote.mjs']) add(`${fine}/production-tests/${file}`, `fine-candidate/production-tests/${file}`);
for (const row of testPlan.files) {
  add(`${fine}/production-tests/files/${row.target}`, `fine-candidate/production-tests/prepared/${row.target}`, row.preparedSha256);
  if (row.baseSha256) add(`${fine}/production-tests/before/${row.target}`, `fine-candidate/production-tests/before/${row.target}`, row.baseSha256);
}
const promotionNames = directories(`${fine}/production-tests/promotion-results`);
assert(promotionNames.length > 0, 'Fine production tests have no actual promotion record');
const finePromotions = [];
for (const name of promotionNames) {
  assert(/^[0-9TZ.-]+$/.test(name), `Unsafe promotion record name: ${name}`);
  const base = `${fine}/production-tests/promotion-results/${name}`, result = read(`${base}/result.json`);
  assert(result.status === 'promoted-awaiting-production-checks' && result.testsRun === false && result.manifestSha256 === hash(`${fine}/production-tests/manifest.json`), `Unexpected promotion result: ${name}`);
  add(`${base}/result.json`, `fine-candidate/production-tests/promotion-results/${name}/result.json`);
  for (const row of result.written) {
    const planned = testPlan.files.find(file => file.target === row.file);
    assert(planned && row.sha256 === planned.preparedSha256, `Unplanned promoted fine test: ${row.file}`);
    if (planned.baseSha256) add(`${base}/before/${row.file}`, `fine-candidate/production-tests/promotion-results/${name}/before/${row.file}`, planned.baseSha256);
  }
  finePromotions.push({ name, ...result });
}

// Keep the real integrated density refusal and its diagnosis separate from the
// earlier candidate pass. The large cluster JSON is copied as raw bytes only.
const densityBefore = read(`${density}/before-manifest.json`);
const densityBeforeFiles = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'src/world/generation/fine-range-tree.ts', 'src/world/generation/regional-coast-field.test.ts'];
assert(equal(Object.keys(densityBefore).sort(), [...densityBeforeFiles].sort()), 'Unexpected density-repair original source scope');
for (const [file, sha256] of Object.entries(densityBefore)) add(`${density}/before/${file}`, `density-repair/before/${file}`, sha256);
for (const file of ['unit.json', 'unit.log', 'verification.json']) {
  assert(hash(`${density}/first-${file}`) === hash(`${checks}/first/${file}`), `Density original failure differs from the actual unified first run: ${file}`);
  add(`${density}/first-${file}`, `density-repair/first-${file}`);
}
const densityDiagnostic = read(`${density}/diagnostic.json`), densityCluster = read(`${density}/cluster-analysis.json`);
assert(densityDiagnostic.success && densityDiagnostic.numTotalTests === 1 && densityDiagnostic.numPassedTests === 1 && densityDiagnostic.numFailedTests === 0 && densityDiagnostic.numPendingTests === 0, 'Density refusal diagnosis has no successful raw capture');
assert(densityCluster.totalNodes === 819 && densityCluster.originalFailure.candidates === 193 && densityCluster.alternatives.some(row => row.stepWorld === 32 && row.oriented === true && row.maximumCandidates === 116 && row.references === 19441), 'Density diagnosis differs from the reviewed conservative index repair');
for (const file of ['before-manifest.json', 'cluster-before.json', 'cluster-analysis.json', 'actual-contributions.json', 'diagnostic.json', 'prepare-diagnostic.mjs', 'analyze-cluster.mjs', 'actual-contributions.mjs', 'diagnose.test.ts', 'vitest.diagnostic.config.ts', 'diagnostic/detail-orography.ts']) add(`${density}/${file}`, `density-repair/${file}`);
const densityTargeted = read(`${density}/targeted-after.json`);
assert(densityTargeted.success === false && densityTargeted.numTotalTests === 38 && densityTargeted.numPassedTests === 38 && densityTargeted.numFailedTests === 0 && densityTargeted.testResults.some(row => row.status === 'failed' && row.name.replaceAll('\\', '/').endsWith('/detail-natural-writer.test.ts') && row.message.includes('__MACRO_GENERATOR_FINGERPRINT__ is not defined')), 'Retain the actual density targeted harness failure without calling its 38 executed assertions a full pass');
for (const file of ['targeted-after.json', 'targeted-first-config.ts', 'vitest.targeted.config.ts', 'README.md', 'source-manifest.json']) add(`${density}/${file}`, `density-repair/${file}`);
const densityManifest = read(`${density}/source-manifest.json`);
assert(densityManifest.format === 'lieguoji-natural-range-sea-density-repair-source' && densityManifest.version === 1 && densityManifest.productionFrozen === true && equal(densityManifest.files.map(row => row.path).sort(), ['src/world/generation/detail-orography.ts', 'src/world/generation/detail-orography-density.test.ts', 'src/world/generation/fine-range-tree.ts'].sort()), 'Unexpected frozen density repair scope');
assert(densityManifest.checks.first.path === 'targeted-after.json' && densityManifest.checks.first.success === false && densityManifest.checks.first.executed === densityTargeted.numTotalTests && densityManifest.checks.first.passed === densityTargeted.numPassedTests && densityManifest.checks.first.unloadedWriterCases === 6 && densityManifest.checks.first.config === 'targeted-first-config.ts', 'Density source manifest misstates the actual failed targeted check');
assert(densityManifest.checks.harnessRetry.status === 'interrupted-after-root-stop' && densityManifest.checks.harnessRetry.exitCode === 1 && densityManifest.checks.harnessRetry.resultProduced === false && densityManifest.checks.harnessRetry.intendedResult === 'targeted-harness-repair.json' && !fs.existsSync(`${density}/targeted-harness-repair.json`), 'Review a newly available retry result instead of treating it as the recorded interruption');
const densityAllowedTop = ['before-manifest.json', 'cluster-before.json', 'cluster-analysis.json', 'actual-contributions.json', 'diagnostic.json', 'prepare-diagnostic.mjs', 'analyze-cluster.mjs', 'actual-contributions.mjs', 'diagnose.test.ts', 'vitest.diagnostic.config.ts', 'first-unit.json', 'first-unit.log', 'first-verification.json', 'targeted-after.json', 'targeted-first-config.ts', 'vitest.targeted.config.ts', 'README.md', 'source-manifest.json'];
for (const entry of entries(density)) assert(entry.isDirectory() ? ['before', 'diagnostic'].includes(entry.name) : densityAllowedTop.includes(entry.name), `Review additional density evidence rather than omit it: ${entry.name}`);
const densitySummary = { targetedPassed: false, targetedExecutedAssertions: 38, targetedExecutedPassedAssertions: 38, targetedFailure: 'The writer suite did not load because the isolated harness lacked the production macro define.',
  interruptedHarnessRetry: 'No JSON result was produced; see the original README for the Ctrl-C/exit-1 record. This is not a passing check.',
  recordedChecks: densityManifest.checks, repairedSources: densityManifest.files,
  acceptanceSource: 'The later complete production batch, including the added density regression.', rawManifestSha256: hash(`${density}/source-manifest.json`) };

// Sea CPU evidence includes the first real backwards-color failure, fixed sea
// assertions, independent original oracle and the full actual dependency set.
const seaReady = read(`${sea}/ready-manifest.json`), seaNames = ['first', 'repair-1'];
assert(seaReady.status === 'candidate-cpu-passed-awaiting-integration' && equal(directories(`${sea}/checks`), seaNames), 'Unexpected sea candidate state/rounds');
const seaTop = ['engine-fingerprint.mjs', 'generator-fingerprint.mjs', 'identity-after.json', 'identity-before.json', 'lint.log', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
const seaSnapshotNames = new Set([...seaReady.candidates, ...seaReady.stagedTests, 'baseline/preview21-terrain-material.ts', 'baseline/preview21-terrain-mesh.ts', 'baseline/preview21-renderer.ts', 'check.mjs', 'prepare.mjs', 'README.md', 'ready-manifest.json', 'tsconfig.json', 'vitest.config.ts']);
for (const name of seaNames) {
  const base = `${sea}/checks/${name}`, dest = `sea-candidate/${name}`, record = read(`${base}/verification.json`);
  assert(record.round === name && record.results.length === 3 && record.results.every(step => Number.isInteger(step.code)) && record.sourceStable && record.dependenciesStable && record.identitiesUnchanged, `Unfinished/unstable sea candidate: ${name}`);
  assert(record.candidatePassed === (name === 'repair-1'), `Unexpected sea verdict: ${name}`);
  const expected = name === 'first' ? seaReady.cpuEvidence.firstVerificationSha256 : seaReady.cpuEvidence.verificationSha256;
  assert(hash(`${base}/verification.json`) === expected, `Sea ready binding mismatch: ${name}`);
  topFiles(base, dest, seaTop, seaTop);
  const before = read(`${base}/source-before.json`), after = read(`${base}/source-after.json`), identity = read(`${base}/identity-before.json`);
  assert(equal(before, after) && equal(identity, read(`${base}/identity-after.json`)) && identity.identitiesUnchanged, `Sea source/closure drift: ${name}`);
  for (const row of before) {
    if (seaSnapshotNames.has(row.file)) add(`${base}/staged-sources/${row.file}`, `${dest}/staged-sources/${row.file}`, row.sha256);
    else omitted.push({ path: `${base}/staged-sources/${row.file}`, sha256: row.sha256, reason: 'Staging bridge/ancillary source; actual production dependencies are retained separately.' });
  }
  for (const row of identity.productionSources) { sourcePath(row.file); add(`${base}/production-sources/${row.file}`, `${dest}/production-sources/${row.file}`, row.sha256); }
  for (const file of ['engine-fingerprint.ts', 'generator-fingerprint.ts']) add(`${base}/tools/${file}`, `${dest}/tools/${file}`);
  for (const step of record.results) assert(hash(`${base}/${step.name}.log`) === step.logSha256, `Sea original log changed: ${name}/${step.name}`);
  const unit = read(`${base}/unit.json`);
  assert(unit.numTotalTests === record.testsObserved && unit.numPassedTests === record.testsPassed && unit.numFailedTests === record.testsFailed, `Sea unit result differs: ${name}`);
  candidateRounds.push({ candidate: 'sea-material', name, passed: record.candidatePassed, checks: record.results, units: { total: record.testsObserved, passed: record.testsPassed, failed: record.testsFailed } });
}
for (const file of ['ready-manifest.json', 'README.md', 'prepare.mjs', 'check.mjs', 'finalize.mjs', 'promote.mjs', 'tsconfig.json', 'vitest.config.ts']) add(`${sea}/${file}`, `sea-candidate/ready/${file}`);
for (const row of seaReady.promotionPlan) add(`${sea}/${row.source}`, `sea-candidate/ready/${row.source}`, row.sourceSha256);
assert(seaReady.historicalOracle.sourceCommit === '31e27620c816db33993a8ac419274c9a86c32624', 'Sea original oracle is not preview21');

// Enumerate only the dedicated check/browser roots. Every discovered run must
// have a terminal record. The local Vite cache is deliberately not evidence.
const checkDirs = directories(checks), gpuNames = checkDirs.filter(name => /^gpu-/.test(name) && name !== 'gpu-vite-cache');
const checkNames = checkDirs.filter(name => !/^gpu-/.test(name));
assert(checkNames.includes('first') && gpuNames.includes('gpu-first'), 'Required original unified/GPU runs are absent');
if (checkDirs.includes('gpu-vite-cache')) omitted.push({ path: `${checks}/gpu-vite-cache`, reason: 'Vite execution cache is not original result evidence.' });
for (const name of [...checkNames, ...gpuNames]) assert(/^[a-z0-9-]+$/.test(name), `Unexpected check directory: ${name}`);
const rounds = checkNames.map(name => ({ name, record: read(`${checks}/${name}/verification.json`) }));
for (const { name, record } of rounds) assert(record.results?.length && record.results.every(step => Number.isInteger(step.exitCode) && step.finishedAt), `Unfinished unified run: ${name}`);
const runs = directories(browser).map(name => ({ name, record: read(`${browser}/${name}/verification.json`) }));
for (const { name, record } of runs) assert(/^[a-z0-9-]+$/.test(name) && Number.isInteger(record.code) && record.completedAt && expectedProjects.includes(record.project), `Unfinished/unknown browser run: ${name}`);
const currentBuildSha = hash('dist/build.json'), currentPassed = runs.filter(({ record }) => record.passed && record.prerequisiteBuildJsonSha256 === currentBuildSha);
assert(expectedProjects.every(project => currentPassed.some(({ record }) => record.project === project)), 'Three completed successful device-emulation runs on the actual build are required');
const finalName = currentPassed[0].record.checkRound;
assert(currentPassed.every(({ record }) => record.checkRound === finalName), 'Three views reference different production check rounds');
const final = rounds.find(round => round.name === finalName)?.record;
assert(final?.passed && final.sourceStable && final.allCommandsPassed && final.unit?.passed && final.generatorIdentityVerified && final.buildJsonSha256 === currentBuildSha, 'Actual browsers lack a successful exact-build prerequisite');
assert(final.results.length === 6 && final.results.every(step => step.exitCode === 0 && !step.signal), 'Final production commands differ');
const build = read(`${checks}/${finalName}/build.json`), finalSource = read(`${checks}/${finalName}/source-after.json`);
assert(build.version === '0.5.0-preview.22' && hash(`${checks}/${finalName}/build.json`) === currentBuildSha && hash(`${checks}/baseline-build.json`) === priorBuildSha, 'Actual new/prior build mismatch');
assert(equal(read(`${checks}/${finalName}/source-before.json`), finalSource), 'Final source snapshot changed');
for (const row of finalSource) { sourcePath(row.path); assert(hash(row.path) === row.sha256, `Current checked source changed: ${row.path}`); }
for (const row of final.dist) { assert(row.path.startsWith('dist/'), 'Unexpected dist path'); assert(hash(row.path) === row.sha256, `Current checked dist changed: ${row.path}`); }
const identityPath = `${checks}/${finalName}/identity-verification.json`, identities = read(identityPath), keys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
assert(hash(identityPath) === final.identityVerificationSha256 && identities.passed && identities.sourceStable && identities.engineUnchanged && identities.orographyIncluded && !identities.errors.length && identities.buildSha256 === currentBuildSha && identities.sourceSnapshotSha256 === hash(`${checks}/${finalName}/source-after.json`), 'Actual production identities are not bound');
assert(keys.length === 11 && equal(identities.checks.map(row => row.key).sort(), keys) && identities.checks.every(row => row.currentMatchesBuild && row.frozenMatchesPrior && equal(row.actual, build[row.key])), 'All eleven actual namespaces are required');
const checkTop = ['build.json', 'build.log', 'dist-audit.log', 'identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
for (const { name } of rounds) topFiles(`${checks}/${name}`, `unified/${name}`, checkTop, ['verification.json', 'source-before.json', 'source-after.json', 'identity-verification.json', 'scope.json', 'prior-build.json', 'pre-run-build.json']);
for (const file of ['run.mjs', 'baseline-build.json', 'prepare-gpu.mjs', 'gpu.mjs', 'gpu-harness.ts', 'gpu-harness.html']) add(`${checks}/${file}`, `unified/${file}`);

// Actual GPU diagnostics remain separate from complete-game appearance.
const gpuRecords = [], gpuTop = ['before.json', 'after.json', 'gpu.mjs', 'gpu-harness.ts', 'gpu-harness.html', 'gpu.raw.json', 'gpu-harness.png', 'runner-error.json', 'verification.json'];
for (const name of gpuNames) {
  const base = `${checks}/${name}`, record = read(`${base}/verification.json`), before = read(`${base}/before.json`), after = read(`${base}/after.json`);
  assert(typeof record.passed === 'boolean' && Number.isFinite(record.elapsedMs), `Unfinished GPU run: ${name}`);
  const prerequisite = rounds.find(round => hash(`${checks}/${round.name}/verification.json`) === record.prerequisiteSha256);
  assert(prerequisite?.record.passed && before.prerequisiteSha256 === record.prerequisiteSha256, `GPU prerequisite differs: ${name}`);
  assert(equal(sorted(before.source), sorted(read(`${checks}/${prerequisite.name}/source-after.json`))) && equal(sorted(before.dist), sorted(prerequisite.record.dist)), `GPU actual source/dist differs: ${name}`);
  for (const row of before.harness) { assert(['gpu.mjs', 'gpu-harness.ts', 'gpu-harness.html'].includes(path.basename(row.path)), 'Unexpected GPU harness'); assert(hash(`${base}/${path.basename(row.path)}`) === row.sha256, `GPU harness copy differs: ${name}`); }
  if (record.passed) {
    const raw = read(`${base}/gpu.raw.json`);
    assert(record.sourceAndDistStable && record.harnessStable && !record.error && after.harnessStable && equal(sorted(before.source), sorted(after.source)) && equal(sorted(before.dist), sorted(after.dist)), `Successful GPU source drift: ${name}`);
    assert(raw.passed && !raw.exception && raw.failures.length === 0 && !raw.events.some(event => ['error', 'pageerror'].includes(event.type)) && record.probes === raw.probes.length && record.seams === raw.seams.length && raw.probes.length > 0 && raw.seams.length === 5, `GPU raw result contradicts success: ${name}`);
    assert(record.heightToleranceMeters === 1 / 128 && record.colorToleranceBytes === 2 && record.seamToleranceBytes === 1, `GPU tolerance changed: ${name}`);
  }
  topFiles(base, `gpu/${name}`, gpuTop, ['before.json', 'after.json', 'gpu.mjs', 'gpu-harness.ts', 'gpu-harness.html', 'verification.json', ...(record.passed ? ['gpu.raw.json', 'gpu-harness.png'] : [])]);
  gpuRecords.push({ name, checkRound: prerequisite.name, ...record });
}
assert(gpuRecords.some(record => record.passed && record.checkRound === finalName), 'The actual final build lacks passed production GPU diagnostics');

const browserTop = ['before.json', 'after.json', 'atlas-add-detail-coast.spec.ts', 'base-playwright.config.ts', 'build.json', 'playwright.config.ts', 'prerequisite-verification.json', 'results.json', 'run.log', 'run.mjs', 'verification.json'];
const artifactTypes = new Set(['.png', '.zip', '.webm', '.json', '.txt', '.md', '.log']);
function artifacts(base, dest) {
  for (const entry of entries(base)) {
    const file = `${base}/${entry.name}`, out = `${dest}/${entry.name}`;
    if (entry.isDirectory()) {
      if (['trace', 'trace-unpacked', 'resources', 'playwright-report'].includes(entry.name)) omitted.push({ path: file, reason: 'Expanded trace/resources are not duplicated; original trace ZIP remains.' });
      else artifacts(file, out);
    } else { assert(artifactTypes.has(path.extname(entry.name)), `Unexpected browser artifact: ${file}`); add(file, out); }
  }
}
for (const { name, record } of runs) {
  const base = `${browser}/${name}`, prerequisite = rounds.find(round => round.name === record.checkRound)?.record;
  assert(prerequisite && hash(`${base}/prerequisite-verification.json`) === hash(`${checks}/${record.checkRound}/verification.json`) && hash(`${base}/build.json`) === record.prerequisiteBuildJsonSha256 && prerequisite.buildJsonSha256 === record.prerequisiteBuildJsonSha256, `Browser prerequisite differs: ${name}`);
  const before = read(`${base}/before.json`), after = read(`${base}/after.json`);
  assert(before.checkVerificationSha256 === hash(`${base}/prerequisite-verification.json`) && before.checkSourceSha256 === hash(`${checks}/${record.checkRound}/source-after.json`) && equal(sorted(before.source), sorted(read(`${checks}/${record.checkRound}/source-after.json`))) && equal(sorted(before.dist), sorted(prerequisite.dist)), `Browser actual source binding differs: ${name}`);
  for (const row of before.runner) assert(hash(`${base}/${row.path === 'playwright.config.ts' ? 'base-playwright.config.ts' : path.basename(row.path)}`) === row.sha256, `Browser runner copy differs: ${name}`);
  if (record.passed) {
    const report = read(`${base}/results.json`), collect = suites => suites.flatMap(suite => [...(suite.specs ?? []), ...collect(suite.suites ?? [])]);
    const cases = collect(report.suites ?? []).flatMap(spec => (spec.tests ?? []).map(test => ({ file: spec.file, title: spec.title, test })));
    assert(record.code === 0 && record.sourceAndDistStable && equal(before, after) && record.retries === 0 && record.timeoutMs === 450000, `Browser successful verdict differs: ${name}`);
    assert(report.stats.expected === 1 && report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0 && !report.errors?.length && cases.length === 1 && cases.every(({ file, title, test }) => file.replaceAll('\\', '/').endsWith('atlas-add-detail-coast.spec.ts') && title.startsWith('[detail-v4-add]') && test.projectName === record.project && test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0), `Browser raw report differs: ${name}`);
  }
  topFiles(base, `browser/${name}`, browserTop, browserTop.filter(file => file !== 'results.json' || record.passed));
  for (const directory of directories(base)) { assert(directory === 'artifacts', `Unexpected browser directory: ${base}/${directory}`); artifacts(`${base}/${directory}`, `browser/${name}/${directory}`); }
}
for (const file of ['run.mjs', 'playwright.config.ts']) add(`${browser}/${file}`, `browser/${file}`);

// Production sources are only those actually bound by the successful product
// snapshot, including the helper closure and both sets of promoted tests.
const scope = read(`${checks}/${finalName}/scope.json`);
assert(scope.unitFiles.includes('src/world/generation/detail-orography-density.test.ts'), 'Final complete production batch lacks the actual density regression');
for (const row of densityManifest.files) assert(hash(row.path) === row.sha256 && bytes(row.path).length === row.bytes, `Final source differs from frozen density repair: ${row.path}`);
for (const file of densityBeforeFiles.filter(file => file !== 'src/world/generation/detail-orography.ts')) assert(hash(file) === densityBefore[file], `Density repair changed a protected pre-repair source: ${file}`);
assert(hash('src/world/generation/detail-orography.ts') !== densityBefore['src/world/generation/detail-orography.ts'], 'Density index fix is absent from the final source');
const runtime = new Set([...keys.flatMap(key => build[key].files), ...scope.unitFiles, ...seaReady.runtimeSourceOverlay.map(row => row.file),
  'src/sim/core.ts', 'src/sim/statecraft.ts', 'src/sim/types.ts', 'src/history/core.ts', 'src/history/types.ts',
  'src/world/test-fixtures/preview21-terrain-material.ts', 'scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts', 'tests/atlas-add-detail-coast.spec.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']);
for (const file of [...runtime].sort()) { sourcePath(file); const row = finalSource.find(source => source.path === file); assert(row, `Source not bound by final checks: ${file}`); add(file, `source/${file}`, row.sha256); }
for (const row of testPlan.files) assert(hash(row.target) === row.preparedSha256, `Promoted fine test changed; document any production repair before archiving: ${row.target}`);
for (const row of seaReady.promotionPlan) assert(hash(row.target) === row.outputSha256, `Promoted sea source differs from reviewed transform: ${row.target}`);
for (const file of ['prepare-natural-range-sea-archive.mjs', 'prepare-natural-range-sea-checks.mjs', 'ocean-material-next.md']) add(`.autopilot/ph06/${file}`, `recording/${file}`);

// Actual IAB before/after evidence: the old saved21 draft and revision remain
// the material A/B subject. A separately created22 world is a different demo.
const beforeDemoPath = '.autopilot/ph06/demo21.json', beforeDemo = read(beforeDemoPath), beforePng = '.autopilot/ph06/demo21-before-ocean.png';
assert(beforeDemo.version === '0.5.0-preview.21' && beforeDemo.buildJsonSha256 === priorBuildSha && beforeDemo.savedRevision === 1 && beforeDemo.reloadedRevision === 1 && beforeDemo.beforeMaterialScreenshot === beforePng, 'Old saved21 material comparison identity differs');
add(beforeDemoPath, 'observations/demo21.json'); add(beforePng, 'observations/demo21-before-ocean.png', beforeDemo.beforeMaterialScreenshotSha256);
const afterDemoPath = '.autopilot/ph06/demo22-after-ocean.json', afterDemo = read(afterDemoPath), afterPng = '.autopilot/ph06/demo22-after-ocean.png';
assert(afterDemo.version === build.version && afterDemo.buildJsonSha256 === currentBuildSha && afterDemo.url === beforeDemo.url && afterDemo.savedRevision === 1 && afterDemo.reloadedRevision === 1 && afterDemo.zoomPercent === 12 && afterDemo.beforeMaterialScreenshotSha256 === beforeDemo.beforeMaterialScreenshotSha256 && afterDemo.screenshot === afterPng, 'Material A/B must retain the same saved21 id, revision1 and 12% view');
add(afterDemoPath, 'observations/demo22-after-ocean.json'); add(afterPng, 'observations/demo22-after-ocean.png', afterDemo.screenshotSha256);
if (fs.existsSync('.autopilot/ph06/demo22.json')) {
  const demo = read('.autopilot/ph06/demo22.json');
  assert(demo.version === build.version && demo.buildJsonSha256 === currentBuildSha && demo.url !== beforeDemo.url, 'New22 demo must be separate from the material comparison');
  add('.autopilot/ph06/demo22.json', 'observations/demo22.json');
  assert(demo.screenshots === undefined || Array.isArray(demo.screenshots), 'Optional new22 screenshots must be an array');
  for (const shot of demo.screenshots ?? []) {
    assert(shot && typeof shot.path === 'string' && /^\.autopilot\/ph06\/demo22-[^/\\:\0]+\.png$/.test(shot.path) && typeof shot.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(shot.sha256), 'New22 screenshot must be a local demo22-*.png with an explicit SHA-256');
    add(shot.path, `observations/${path.basename(shot.path)}`, shot.sha256.toLowerCase());
  }
}
const visualPath = '.autopilot/ph06/natural-range-sea-visual-review.json', visual = read(visualPath);
assert(visual.reviewedByRoot === true && visual.version === build.version && visual.buildJsonSha256 === currentBuildSha && expectedProjects.every(project => visual.reviewedDevices?.includes(project)), 'Root visual review must identify the actual build and three views');
assert(['naturalVisualAccepted', 'userVisualAccepted', 'physicalDeviceAccepted', 'performanceAccepted', 'phaseAccepted'].every(key => typeof visual[key] === 'boolean'), 'Explicit visual/device acceptance flags are required; false is valid');
assert(visual.reviewedScreenshots?.length && visual.reviewedScreenshots.every(file => selected.has(file)), 'Root visual review must reference selected actual images');
add(visualPath, 'visual-review.json');

const historyReferences = ['build.json', 'provenance.json', 'inventory.json', 'storage-integration-files.sha256.json', 'storage-integration-verification.json'].map(file => ({ path: `${history}/${file}`, sha256: hash(`${history}/${file}`), copied: false }));
assert(hash(`${history}/build.json`) === priorBuildSha && read(`${history}/storage-integration-verification.json`).checks.unit.passed === 5, 'Actual preview21 history prerequisite differs');
const rows = [...selected.values()].sort((a, b) => a.path.localeCompare(b.path));
assert(rows.length < 4096 && rows.reduce((sum, row) => sum + row.bytes, 0) <= 512 * 1024 * 1024, 'Unexpected evidence volume: review full scope rather than truncate original JSON');
// No output directory is created until every source/run/identity is validated.
// Interruption leaves an incomplete archive and never a success verification.
for (const row of rows) {
  assert(hash(row.source) === row.sha256, `Source changed before copy: ${row.source}`);
  const dest = `${target}/${row.path}`; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(row.source, dest, fs.constants.COPYFILE_EXCL);
  assert(hash(dest) === row.sha256, `Copy mismatch: ${row.path}`);
}
for (const row of rows) assert(hash(row.source) === row.sha256, `Source changed during archive: ${row.source}`);
for (const row of historyReferences) assert(hash(row.path) === row.sha256, `History reference changed: ${row.path}`);
for (const row of finalSource) assert(hash(row.path) === row.sha256, `Production changed during archive: ${row.path}`);
for (const row of final.dist) assert(hash(row.path) === row.sha256, `Dist changed during archive: ${row.path}`);
const write = (file, value) => fs.writeFileSync(`${target}/${file}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
write('files.sha256.json', { files: rows });
write('references.json', { preview21History: historyReferences, omitted, fineEvidenceBoundary: fineReady.evidenceBoundary, note: 'Raw logs/results/source bytes are not rewritten or truncated. No expanded trace, proxy tree or earlier full history archive is duplicated.' });
write('promotion-summary.json', { fineReadySha256: hash(`${fine}/ready/manifest.json`), finePreparedTestsSha256: hash(`${fine}/production-tests/manifest.json`), finePromotions, densityRepair: densitySummary,
  seaReadySha256: hash(`${sea}/ready-manifest.json`), seaProductionOutputs: seaReady.promotionPlan.map(row => ({ target: row.target, previousSha256: row.previousSha256, outputSha256: row.outputSha256 })),
  note: 'Candidate checks precede preparation/import rewriting; the production check scope is recorded separately. Existing world geography is unchanged by material display changes.' });
write('verification.json', { recordedAt: new Date().toISOString(), archiveComplete: true, version: build.version, buildCommitMetadata: build.commit, buildJsonSha256: currentBuildSha, finalRound: finalName,
  rawFileCount: rows.length, rawBytes: rows.reduce((sum, row) => sum + row.bytes, 0), inventorySha256: hash(`${target}/files.sha256.json`), referencesSha256: hash(`${target}/references.json`), promotionSummarySha256: hash(`${target}/promotion-summary.json`),
  unit: final.unit, generatorIdentityVerified: true, generatorNamespaces: keys, candidateRounds,
  rounds: rounds.map(({ name, record }) => ({ name, passed: record.passed, unit: record.unit })), gpu: gpuRecords,
  browsers: runs.map(({ name, record }) => ({ name, project: record.project, passed: record.passed, elapsedMs: record.elapsedMs, checkRound: record.checkRound, buildJsonSha256: record.prerequisiteBuildJsonSha256 })),
  naturalVisualAccepted: visual.naturalVisualAccepted, userVisualAccepted: visual.userVisualAccepted, physicalDeviceAccepted: visual.physicalDeviceAccepted, performanceAccepted: visual.performanceAccepted, phaseAccepted: visual.phaseAccepted,
  checksRerun: false, browserRerun: false, gpuRerun: false, cloudWrites: false });
console.log(JSON.stringify({ archive: target, rawFileCount: rows.length, finalRound: finalName, version: build.version, buildJsonSha256: currentBuildSha }));
