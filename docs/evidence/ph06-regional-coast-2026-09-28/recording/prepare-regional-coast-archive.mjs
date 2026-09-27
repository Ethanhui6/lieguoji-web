// Archive already completed evidence only. Does not run checks, build or browser.
// Authoring this file does not create the archive. Root chooses when to execute it.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const target = 'docs/evidence/ph06-regional-coast-2026-09-28';
const stage = '.autopilot/ph06/regional-coast-staging';
const checks = '.autopilot/ph06/regional-coast-checks';
const browser = '.autopilot/ph06/regional-coast-browser';
const history = 'docs/evidence/ph06-preview20-generator-history-2026-09-28';
const original20 = '71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018';
const expectedProjects = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'];
const assert = (ok, reason) => { if (!ok) throw Error(reason); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = relative => {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some(part => part === '..'), `Unsafe path: ${relative}`);
  const full = path.resolve(root, relative), relation = path.relative(root, full);
  assert(relation && !relation.startsWith('..') && !path.isAbsolute(relation), `Outside project: ${relative}`);
  // Reject directory junctions as well as file symlinks.
  let current = root;
  for (const part of relation.split(path.sep)) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), `Symlink/junction: ${relative}`);
  }
  return full;
};
const bytes = file => {
  const full = safe(file), stat = fs.lstatSync(full);
  assert(stat.isFile() && stat.size <= 128 * 1024 * 1024, `Nonregular or >128MiB evidence: ${file}`);
  return fs.readFileSync(full);
};
const hash = file => digest(bytes(file));
const read = file => JSON.parse(bytes(file).toString().replace(/^\uFEFF/, ''));
assert(!fs.existsSync(target), 'Refusing to overwrite existing archive, including an incomplete archive');

const selected = new Map(), omitted = [];
function add(source, dest, expectedSha) {
  assert(!selected.has(dest) && !path.isAbsolute(dest) && !dest.split(/[\\/]/).includes('..'), `Duplicate/unsafe destination: ${dest}`);
  const data = bytes(source), sha256 = digest(data);
  assert(!expectedSha || sha256 === expectedSha, `Source byte mismatch: ${source}`);
  selected.set(dest, { source, path: dest, bytes: data.length, sha256 });
}
const directoryNames = base => fs.readdirSync(safe(base), { withFileTypes: true }).filter(entry => {
  assert(!entry.isSymbolicLink(), `Evidence symlink: ${base}/${entry.name}`); return entry.isDirectory();
}).map(entry => entry.name).sort();
function topFiles(base, destination, allowed, required) {
  const names = fs.readdirSync(safe(base), { withFileTypes: true });
  for (const name of required) assert(names.some(entry => entry.name === name && entry.isFile()), `Missing terminal evidence: ${base}/${name}`);
  for (const entry of names) if (!entry.isDirectory()) {
    assert(!entry.isSymbolicLink() && allowed.has(entry.name), `Unexpected evidence file, review before archiving: ${base}/${entry.name}`);
    add(`${base}/${entry.name}`, `${destination}/${entry.name}`);
  }
}

// Candidate CPU evidence: exact selected candidate/test/config snapshots plus
// the actual runtime-source closures. Dependency proxies are not runtime source.
const ready = read(`${stage}/ready-manifest.json`);
const candidateNames = ['first', 'repair-1'];
assert(equal(directoryNames(`${stage}/checks`), candidateNames), 'Unexpected candidate rounds; review archive scope explicitly');
const candidateRecords = [];
const candidateTop = new Set(['fingerprint-runtime.mjs', 'identity-before.json', 'identity-after.json', 'sources-before.json', 'sources-after.json', 'types.log', 'lint.log', 'unit.log', 'results.json', 'verification.json']);
for (const name of candidateNames) {
  const base = `${stage}/checks/${name}`, dest = `candidate/${name}`, verification = read(`${base}/verification.json`);
  assert(verification.round === name && verification.steps.length === 3 && verification.steps.every(row => Number.isInteger(row.code)), `Unfinished candidate ${name}`);
  assert(verification.sourceStable && verification.identityStable, `Unstable candidate ${name}`);
  assert(verification.candidatePassed === (name === 'repair-1'), `Unexpected candidate verdict: ${name}`);
  const recordedHash = name === 'first' ? ready.checks.first.sha256 : ready.checks.final.sha256;
  assert(hash(`${base}/verification.json`) === recordedHash, `Candidate ready binding differs: ${name}`);
  topFiles(base, dest, candidateTop, [...candidateTop]);
  const sourceBefore = read(`${base}/sources-before.json`), sourceAfter = read(`${base}/sources-after.json`);
  assert(equal(sourceBefore, sourceAfter), `Candidate sources changed: ${name}`);
  const identity = read(`${base}/identity-before.json`);
  assert(equal(identity, read(`${base}/identity-after.json`)), `Candidate identity changed: ${name}`);
  const runtimeFiles = [...new Set([...identity.natural.files, ...identity.additive.files])].sort();
  for (const file of runtimeFiles) {
    const expected = identity.productionSources.find(row => row.file === file)?.sha256 ?? sourceBefore.find(row => row.file === file)?.sha256;
    assert(expected, `No runtime byte binding: ${name}/${file}`);
    add(`${base}/runtime-sources/${file}`, `${dest}/runtime-sources/${file}`, expected);
  }
  const requiredSnapshots = [...verification.candidates, ...verification.tests, 'baseline/detail-natural-outline.ts', 'baseline/detail-shape.ts', 'baseline/seed.ts', 'baseline.json', 'check.mjs', 'freeze.mjs', 'prepare.mjs', 'README.md', 'ready-manifest.json', 'tsconfig.json', 'vitest.config.ts'];
  for (const file of new Set(requiredSnapshots)) {
    const row = sourceBefore.find(source => source.file === file); assert(row, `Missing original candidate snapshot: ${name}/${file}`);
    add(`${base}/staged-sources/${file}`, `${dest}/staged-sources/${file}`, row.sha256);
  }
  omitted.push(...sourceBefore.filter(row => !requiredSnapshots.includes(row.file)).map(row => ({ path: `${base}/staged-sources/${row.file}`, sha256: row.sha256, reason: 'Staging proxy or ancillary file excluded; actual runtime closure is retained separately.' })));
  for (const step of verification.steps) assert(hash(`${base}/${step.name}.log`) === step.logSha256, `Candidate log changed: ${name}/${step.name}`);
  const unit = read(`${base}/results.json`);
  assert(unit.numTotalTests === verification.testsObserved && unit.numPassedTests === verification.testsPassed && unit.numFailedTests === verification.testsFailed, `Candidate unit result differs: ${name}`);
  candidateRecords.push({ name, passed: verification.candidatePassed, unitTotal: verification.testsObserved, unitPassed: verification.testsPassed, unitFailed: verification.testsFailed, steps: verification.steps.map(({ name, code }) => ({ name, code })) });
}
for (const file of ['ready-manifest.json', 'baseline.json', 'README.md', 'prepare.mjs', 'freeze.mjs', 'check.mjs', 'finalize.mjs', 'tsconfig.json', 'vitest.config.ts', 'integration-review.md']) add(`${stage}/${file}`, `candidate/final/${file}`);
for (const row of ready.candidateHashes) add(`${stage}/${row.file}`, `candidate/final/${row.file}`, row.sha256);

// Every discovered round must have a terminal verification. A failed round is
// retained, never silently replaced by a later successful result.
const checkNames = directoryNames(checks), runNames = directoryNames(browser);
assert(checkNames.includes('first') && ['desktop', 'mobile', 'tablet'].every(name => runNames.includes(name)), 'Required original product/browser rounds are missing');
const rounds = checkNames.map(name => ({ name, record: read(`${checks}/${name}/verification.json`) }));
for (const { name, record } of rounds) assert(record.results?.length && record.results.every(row => Number.isInteger(row.exitCode) && row.finishedAt), `Unfinished product check: ${name}`);
const runs = runNames.map(name => ({ name, record: read(`${browser}/${name}/verification.json`) }));
for (const { name, record } of runs) assert(Number.isInteger(record.code) && record.completedAt && expectedProjects.includes(record.project), `Unfinished/unknown browser run: ${name}`);
const currentBuildSha = hash('dist/build.json');
const currentPassed = runs.filter(({ record }) => record.passed && record.prerequisiteBuildJsonSha256 === currentBuildSha);
assert(expectedProjects.every(project => currentPassed.some(({ record }) => record.project === project)), 'Need a completed successful run on this build for all three devices');
const finalName = currentPassed[0].record.checkRound;
assert(currentPassed.every(({ record }) => record.checkRound === finalName), 'Current successful browsers reference different check rounds');
const final = rounds.find(row => row.name === finalName)?.record;
assert(final?.passed && final.sourceStable && final.allCommandsPassed && final.unit?.passed && final.generatorIdentityVerified && final.buildJsonSha256 === currentBuildSha, 'Current browsers lack successful exact-build product checks');
assert(final.results.length === 6 && final.results.every(row => row.exitCode === 0 && !row.signal), 'Final command verdict differs');
const build = read(`${checks}/${finalName}/build.json`), finalSource = read(`${checks}/${finalName}/source-after.json`);
assert(build.version === '0.5.0-preview.21' && hash(`${checks}/${finalName}/build.json`) === currentBuildSha && hash(`${checks}/baseline-build.json`) === original20, 'Actual new/prior build identity differs');
assert(equal(read(`${checks}/${finalName}/source-before.json`), finalSource), 'Final source snapshot changed');
for (const row of finalSource) assert(hash(row.path) === row.sha256, `Current source no longer matches final checks: ${row.path}`);
for (const row of final.dist) assert(hash(row.path) === row.sha256, `Current dist no longer matches final checks: ${row.path}`);
const identityPath = `${checks}/${finalName}/identity-verification.json`, identities = read(identityPath);
assert(hash(identityPath) === final.identityVerificationSha256 && identities.passed && identities.sourceStable && identities.engineUnchanged && !identities.errors.length && identities.buildSha256 === currentBuildSha && identities.sourceSnapshotSha256 === hash(`${checks}/${finalName}/source-after.json`), 'Final identity/source binding differs');
const keys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
assert(keys.length === 11 && equal(identities.checks.map(row => row.key).sort(), keys) && identities.checks.every(row => row.currentMatchesBuild && row.frozenMatchesPrior && equal(row.actual, build[row.key])), 'All eleven actual namespaces are required');
const checkFiles = new Set(['build.json', 'build.log', 'dist-audit.log', 'identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json']);
for (const { name } of rounds) topFiles(`${checks}/${name}`, `unified/${name}`, checkFiles, ['verification.json', 'source-before.json', 'source-after.json', 'identity-verification.json', 'scope.json', 'prior-build.json', 'pre-run-build.json']);
for (const file of ['run.mjs', 'baseline-build.json', 'integration.json']) add(`${checks}/${file}`, `unified/${file}`);
assert(read(`${checks}/integration.json`).candidateReadySha256 === hash(`${stage}/ready-manifest.json`), 'Promoted candidate is not the reviewed frozen candidate');

const browserFiles = new Set(['before.json', 'after.json', 'atlas-add-detail-coast.spec.ts', 'base-playwright.config.ts', 'build.json', 'playwright.config.ts', 'prerequisite-verification.json', 'results.json', 'run.log', 'run.mjs', 'verification.json']);
const artifactTypes = new Set(['.png', '.zip', '.webm', '.json', '.txt', '.md', '.log']);
const expanded = new Set(['trace', 'trace-unpacked', 'resources', 'playwright-report']);
function artifacts(base, dest) {
  for (const entry of fs.readdirSync(safe(base), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Artifact symlink: ${base}/${entry.name}`);
    const file = `${base}/${entry.name}`, out = `${dest}/${entry.name}`;
    if (entry.isDirectory()) {
      if (expanded.has(entry.name)) omitted.push({ path: file, reason: 'Expanded trace/resources are not duplicated; original trace ZIP is retained when present.' });
      else artifacts(file, out);
    } else { assert(artifactTypes.has(path.extname(entry.name)), `Unexpected artifact type: ${file}`); add(file, out); }
  }
}
for (const { name, record } of runs) {
  const base = `${browser}/${name}`, prereq = rounds.find(row => row.name === record.checkRound)?.record;
  assert(prereq && hash(`${base}/prerequisite-verification.json`) === hash(`${checks}/${record.checkRound}/verification.json`) && hash(`${base}/build.json`) === record.prerequisiteBuildJsonSha256 && prereq.buildJsonSha256 === record.prerequisiteBuildJsonSha256, `Browser prerequisite changed: ${name}`);
  const before = read(`${base}/before.json`), after = read(`${base}/after.json`);
  assert(before.checkVerificationSha256 === hash(`${base}/prerequisite-verification.json`) && before.checkSourceSha256 === hash(`${checks}/${record.checkRound}/source-after.json`), `Browser snapshot prerequisite differs: ${name}`);
  assert(equal(ordered(before.source), ordered(read(`${checks}/${record.checkRound}/source-after.json`))) && equal(ordered(before.dist), ordered(prereq.dist)), `Browser actual source/dist is not its checked prerequisite: ${name}`);
  for (const row of before.runner) assert(hash(`${base}/${row.path === 'playwright.config.ts' ? 'base-playwright.config.ts' : path.basename(row.path)}`) === row.sha256, `Browser runner copy changed: ${name}/${row.path}`);
  if (record.passed) {
    assert(record.code === 0 && record.sourceAndDistStable && equal(before, after) && record.retries === 0 && record.timeoutMs === 450000, `Browser successful verdict differs: ${name}`);
    const report = read(`${base}/results.json`);
    const collect = suites => suites.flatMap(suite => [...(suite.specs ?? []), ...collect(suite.suites ?? [])]);
    const observed = collect(report.suites ?? []).flatMap(spec => (spec.tests ?? []).map(test => ({ file: spec.file, title: spec.title, test })));
    assert(report.stats.expected === 1 && report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0 && !report.errors?.length && observed.length === 1 && observed.every(({ file, title, test }) => file.replaceAll('\\', '/').endsWith('atlas-add-detail-coast.spec.ts') && title.startsWith('[detail-v4-add]') && test.projectName === record.project && test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0), `Browser original JSON contradicts its successful verdict: ${name}`);
  }
  topFiles(base, `browser/${name}`, browserFiles, [...browserFiles]);
  for (const dir of directoryNames(base)) { assert(dir === 'artifacts', `Unexpected browser directory: ${base}/${dir}`); artifacts(`${base}/${dir}`, `browser/${name}/${dir}`); }
}
for (const file of ['run.mjs', 'playwright.config.ts']) add(`${browser}/${file}`, `browser/${file}`);

const scope = read(`${checks}/${finalName}/scope.json`);
const engineFiles = ['src/sim/core.ts', 'src/sim/statecraft.ts', 'src/sim/types.ts', 'src/history/core.ts', 'src/history/types.ts'];
const runtime = new Set([...keys.flatMap(key => build[key].files), ...engineFiles, ...scope.unitFiles,
  'scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts', 'tests/atlas-add-detail-coast.spec.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']);
const fixture = 'src/world/generation/test-fixtures/preview20-coast', fixtureManifest = read(`${fixture}/SOURCE_MANIFEST.json`);
assert(fixtureManifest.sourceCommit === '4b387f95f5e890f20915a9ab5de4a93c058e5a62' && fixtureManifest.originalBuildSha256 === original20, 'Fixture original identity differs');
runtime.add(`${fixture}/SOURCE_MANIFEST.json`);
for (const [file, row] of Object.entries(fixtureManifest.fixtures)) { assert(hash(`${fixture}/${file}`) === row.sha256, `Fixture changed: ${file}`); runtime.add(`${fixture}/${file}`); }
for (const [file, row] of Object.entries(fixtureManifest.originals)) assert(hash(`${history}/frozen-source/${row.path}`) === row.sha256, `Fixture original changed: ${file}`);
for (const file of [...runtime].sort()) {
  const row = finalSource.find(source => source.path === file); assert(row, `Source is not in the checked snapshot: ${file}`);
  add(file, `source/${file}`, row.sha256);
}
for (const file of ['prepare-regional-coast-integration.mjs', 'prepare-regional-coast-archive.mjs', 'regional-coast-plan.md', 'regional-coast-archive-plan.md']) add(`.autopilot/ph06/${file}`, `recording/${file}`);
const visualPath = '.autopilot/ph06/regional-coast-visual-review.json', visual = read(visualPath);
assert(visual.reviewedByRoot === true && visual.version === build.version && visual.buildJsonSha256 === currentBuildSha && expectedProjects.every(project => visual.reviewedDevices?.includes(project)), 'Root visual review must name the actual build and all three views');
assert(['naturalVisualAccepted', 'userVisualAccepted', 'physicalDeviceAccepted', 'performanceAccepted', 'phaseAccepted'].every(key => typeof visual[key] === 'boolean'), 'Root visual acceptance must be explicit; false is a valid recorded outcome');
assert(visual.reviewedScreenshots?.length && visual.reviewedScreenshots.every(file => selected.has(file)), 'Root reviewed screenshots must be selected real browser artifacts');
add(visualPath, 'visual-review.json');

// Prior history archive is a reference, not another copied source/evidence tree.
const historyReferencePaths = ['build.json', 'provenance.json', 'inventory.json', 'storage-integration-files.sha256.json', 'storage-integration-verification.json', 'storage-checks/first/verification.json'];
const historyReferences = historyReferencePaths.map(file => ({ path: `${history}/${file}`, sha256: hash(`${history}/${file}`), copied: false }));
assert(hash(`${history}/build.json`) === original20 && read(`${history}/storage-integration-verification.json`).checks.unit.passed === 5, 'Actual preview20 storage history prerequisite differs');
const rows = [...selected.values()].sort((a, b) => a.path.localeCompare(b.path));
assert(rows.length < 2048 && rows.reduce((sum, row) => sum + row.bytes, 0) <= 512 * 1024 * 1024, 'Unexpected evidence volume; review full original scope rather than truncate results');
// All validation/selection completes before the first target write. A filesystem
// interruption leaves an incomplete archive, never a forged verification/pass.
for (const row of rows) {
  assert(hash(row.source) === row.sha256, `Source changed before copy: ${row.source}`);
  const dest = `${target}/${row.path}`; fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(row.source, dest, fs.constants.COPYFILE_EXCL);
  assert(hash(dest) === row.sha256, `Copy mismatch: ${row.path}`);
}
for (const row of rows) assert(hash(row.source) === row.sha256, `Source changed during archive: ${row.source}`);
for (const row of historyReferences) assert(hash(row.path) === row.sha256, `History reference changed: ${row.path}`);
for (const row of finalSource) assert(hash(row.path) === row.sha256, `Production changed during archive: ${row.path}`);
for (const row of final.dist) assert(hash(row.path) === row.sha256, `Dist changed during archive: ${row.path}`);
const write = (file, value) => fs.writeFileSync(`${target}/${file}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
write('files.sha256.json', { files: rows });
write('references.json', { preview20History: historyReferences, omitted, note: 'No results file has been edited or truncated. No proxy tree, duplicate expanded trace or previous history archive is copied.' });
write('verification.json', { recordedAt: new Date().toISOString(), archiveComplete: true, version: build.version, buildCommitMetadata: build.commit,
  buildJsonSha256: currentBuildSha, finalRound: finalName, rawFileCount: rows.length, rawBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  inventorySha256: hash(`${target}/files.sha256.json`), referencesSha256: hash(`${target}/references.json`), unit: final.unit,
  generatorIdentityVerified: true, generatorNamespaces: keys, candidateRounds: candidateRecords,
  rounds: rounds.map(({ name, record }) => ({ name, passed: record.passed, unit: record.unit })),
  browsers: runs.map(({ name, record }) => ({ name, project: record.project, passed: record.passed, elapsedMs: record.elapsedMs, checkRound: record.checkRound, buildJsonSha256: record.prerequisiteBuildJsonSha256 })),
  naturalVisualAccepted: visual.naturalVisualAccepted, userVisualAccepted: visual.userVisualAccepted, physicalDeviceAccepted: visual.physicalDeviceAccepted,
  performanceAccepted: visual.performanceAccepted, phaseAccepted: visual.phaseAccepted, checksRerun: false, browserRerun: false, cloudWrites: false,
});
console.log(JSON.stringify({ archive: target, rawFileCount: rows.length, finalRound: finalName, version: build.version, buildJsonSha256: currentBuildSha }));
