// Archive existing checked evidence only. This program does not run any checks,
// build, browser, generator, network operation, or documentation/plan mutation.
// Usage: node .autopilot/ph07/record-macro-coast.mjs <passed-check-round>
//   <macro-desktop> <macro-mobile> <macro-tablet>
//   <coast-desktop> <coast-mobile> <coast-tablet> [--failed-browser=<label> ...]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const checks = '.autopilot/ph07/macro-coast-checks';
const browsers = '.autopilot/ph07/macro-coast-browser';
const coast = '.autopilot/ph07/macro-coast-archive-staging/coast';
const macro = '.autopilot/ph07/macro-flow-staging';
const output = 'docs/evidence/ph06-coast-ph07-macro-2026-10-03';
const labelPattern = /^[a-z0-9][a-z0-9-]*$/;
const shaPattern = /^[a-f0-9]{64}$/;
const args = process.argv.slice(2);
const [round, ...labels] = args.slice(0, 7);
const extras = args.slice(7).map(arg => {
  if (!arg.startsWith('--failed-browser=')) throw Error(`Unknown argument: ${arg}`);
  return arg.slice('--failed-browser='.length);
});
if (args.length < 7 || ![round, ...labels, ...extras].every(value => typeof value === 'string' && labelPattern.test(value))
  || labels.length !== 6 || new Set(labels).size !== 6 || labels.some(label => extras.includes(label))) {
  throw Error('Expected passed-check-round and six distinct fresh browser labels: macro desktop/mobile/tablet, then coast desktop/mobile/tablet; optional --failed-browser=<label>');
}
const finalDirectory = `${checks}/${round}`;
const firstDirectory = `${checks}/first`;
const repairDirectory = `${checks}/repair-1`;
const uiDirectory = `${checks}/ui-repair-1`;
if (round === 'first' || round === 'repair-1') throw Error('Final round must be the separate UI recheck with zero new unit assertions');

function requireThat(condition, message) { if (!condition) throw Error(message); }
function within(base, file) {
  const absoluteBase = path.resolve(base), absolute = path.resolve(base, file);
  const relative = path.relative(absoluteBase, absolute);
  requireThat(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Path escaped boundary: ${file}`);
  return absolute;
}
function safe(file, mayBeMissing = false) {
  const absolute = within(root, file);
  const parts = path.relative(root, absolute).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) {
      requireThat(mayBeMissing, `Missing file or directory: ${file}`);
      break;
    }
    requireThat(!fs.lstatSync(cursor).isSymbolicLink(), `Symlink/junction not allowed: ${cursor}`);
  }
  return absolute;
}
const normalize = file => path.relative(root, safe(file)).replaceAll('\\', '/');
const readDigests = new Map();
const readBytes = file => {
  const absolute = safe(file); requireThat(fs.statSync(absolute).isFile(), `Expected regular file: ${file}`);
  const bytes = fs.readFileSync(absolute), actual = createHash('sha256').update(bytes).digest('hex'), previous = readDigests.get(absolute);
  requireThat(previous === undefined || previous === actual, `File changed between validation and archive: ${file}`);
  readDigests.set(absolute, actual); return bytes;
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = file => digest(readBytes(file));
const read = file => JSON.parse(readBytes(file).toString('utf8').replace(/^\uFEFF/, ''));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
function walk(directory) {
  const absolute = safe(directory);
  requireThat(fs.statSync(absolute).isDirectory(), `Expected directory: ${directory}`);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    requireThat(!entry.isSymbolicLink(), `Unexpected source/evidence symlink: ${directory}/${entry.name}`);
    const file = path.join(absolute, entry.name);
    return entry.isDirectory() ? walk(file) : [{ path: normalize(file), sha256: hash(file), bytes: fs.statSync(file).size }];
  });
}
const sourceRoots = ['src', 'tests', 'scripts'];
const sourceFiles = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'];
const sourceSnapshot = () => [...sourceRoots.flatMap(walk), ...sourceFiles.map(file => ({ path: file, sha256: hash(file), bytes: fs.statSync(safe(file)).size }))];
function snapshotRows(rows, description) {
  requireThat(Array.isArray(rows) && rows.length > 0, `${description}: empty snapshot`);
  const seen = new Set();
  return ordered(rows.map(row => {
    requireThat(typeof row.path === 'string' && !path.isAbsolute(row.path) && row.path === row.path.replaceAll('\\', '/')
      && !row.path.split('/').some(part => part === '..' || part === '' || part === '.') && shaPattern.test(row.sha256), `${description}: malformed entry`);
    requireThat(!seen.has(row.path), `${description}: duplicate path ${row.path}`); seen.add(row.path);
    return { path: row.path, sha256: row.sha256 };
  }));
}
function assertSnapshot(a, b, description) {
  requireThat(same(snapshotRows(a, description), snapshotRows(b, description)), `${description}: file set or original bytes differ`);
}
function changedPaths(a, b) {
  const left = new Map(snapshotRows(a, 'previous source').map(row => [row.path, row.sha256]));
  const right = new Map(snapshotRows(b, 'following source').map(row => [row.path, row.sha256]));
  return [...new Set([...left.keys(), ...right.keys()])].filter(file => left.get(file) !== right.get(file)).sort();
}
function commandPass(verification, names, description) {
  requireThat(verification.passed === true && verification.sourceStable === true && verification.allCommandsPassed === true
    && Array.isArray(verification.results) && same(verification.results.map(row => row.name), names)
    && verification.results.every(row => row.exitCode === 0 && !row.signal && !row.error), `${description}: required commands did not all pass`);
}
function unitCases(file) {
  const report = read(file);
  requireThat(Array.isArray(report.testResults), `Missing unit suites: ${file}`);
  const files = report.testResults.map(result => ({ path: normalize(result.name), assertions: result.assertionResults ?? [] }));
  requireThat(new Set(files.map(row => row.path)).size === files.length, `Duplicate unit suite: ${file}`);
  const assertions = files.flatMap(row => row.assertions);
  requireThat(assertions.length === report.numTotalTests
    && assertions.filter(row => row.status === 'passed').length === report.numPassedTests
    && assertions.filter(row => row.status === 'failed').length === report.numFailedTests, `Unit report totals disagree with raw assertions: ${file}`);
  return { report, files, assertions };
}

// First validate the exact original assertion lineage, including the six failed
// assertions. The UI recheck reuses these results; it is not another 439-test run.
const first = read(`${firstDirectory}/verification.json`);
const firstUnit = unitCases(`${firstDirectory}/unit.json`);
const firstBefore = read(`${firstDirectory}/source-before.json`), firstAfter = read(`${firstDirectory}/source-after.json`);
requireThat(first.passed === false && first.sourceStable === true && firstUnit.report.success === false
  && firstUnit.files.length === 55 && firstUnit.report.numTotalTests === 439 && firstUnit.report.numPassedTests === 433
  && firstUnit.report.numFailedTests === 6 && firstUnit.report.numPendingTests === 0, 'Original first-round 433/439 failure evidence changed');
assertSnapshot(firstBefore, firstAfter, 'first round source stability');
const rerunFiles = ['src/world/hydrology-macro-worker.test.ts', 'src/world/hydrology-reader-owned.test.ts'];
const reusedFiles = firstUnit.files.filter(file => !rerunFiles.includes(file.path));
const reusedAssertions = reusedFiles.flatMap(file => file.assertions);
requireThat(reusedFiles.length === 53 && reusedAssertions.length === 425 && reusedAssertions.every(row => row.status === 'passed'), 'Expected exactly 425 passing assertions from 53 unchanged first-round suites');
const repair = read(`${repairDirectory}/verification.json`), repairReuse = read(`${repairDirectory}/reused-unit-evidence.json`);
const repairUnit = unitCases(`${repairDirectory}/unit.json`);
const repairBefore = read(`${repairDirectory}/source-before.json`), repairAfter = read(`${repairDirectory}/source-after.json`);
commandPass(repair, ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'], 'repair-1');
assertSnapshot(repairBefore, repairAfter, 'repair-1 source stability');
requireThat(repairUnit.report.success === true && repairUnit.report.numTotalTests === 14 && repairUnit.report.numPassedTests === 14
  && repairUnit.report.numFailedTests === 0 && repairUnit.report.numPendingTests === 0 && repairUnit.report.numFailedTestSuites === 0
  && repairUnit.assertions.every(row => row.status === 'passed') && repairUnit.files.length === 2
  && same(repairUnit.files.map(row => row.path).sort(), [...rerunFiles].sort()) && repairUnit.files.every(row => row.assertions.length === 7)
  && repair.unit.passed === true && repair.unit.rerunAssertions === 14 && repair.unit.aggregatePassedAssertions === 439, 'Repair must contain the actual 14/14 passing rerun');
requireThat(repairReuse.source === firstDirectory && repairReuse.sourceUnitSha256 === hash(`${firstDirectory}/unit.json`)
  && repairReuse.sourceSnapshotSha256 === hash(`${firstDirectory}/source-after.json`) && repairReuse.passedAssertions === 425
  && repairReuse.dependenciesUnchangedExceptReviewedUiAndTestFiles === true
  && same([...repairReuse.files].sort(), reusedFiles.map(row => row.path).sort()), 'Repair reuse lineage does not bind original first evidence');
const repairChanges = changedPaths(firstAfter, repairAfter);
const repairAllowed = new Set(['src/editor/AtlasStudio.tsx', 'tests/atlas-hydrology-macro.spec.ts', ...rerunFiles]);
requireThat(repairChanges.every(file => repairAllowed.has(file)) && same([...repairReuse.changed].sort(), repairChanges), 'Repair changed outside recorded reviewed UI/fixture scope');

const ui = read(`${uiDirectory}/verification.json`), uiReuse = read(`${uiDirectory}/reused-unit-evidence.json`);
const uiBefore = read(`${uiDirectory}/source-before.json`), uiAfter = read(`${uiDirectory}/source-after.json`);
commandPass(ui, ['plan', 'lint', 'types', 'build', 'dist-audit'], 'UI recheck');
assertSnapshot(uiBefore, uiAfter, 'UI source stability');
requireThat(ui.unit.passed === true && ui.unit.rerunAssertions === 0 && ui.unit.aggregatePassedAssertions === 439
  && ui.unit.total === 439 && ui.unit.passedAssertions === 439 && !fs.existsSync(safe(`${uiDirectory}/unit.json`, true)), 'UI recheck must record zero new unit assertions');
requireThat(uiReuse.source === repairDirectory && uiReuse.verificationSha256 === hash(`${repairDirectory}/verification.json`)
  && uiReuse.sourceSnapshotSha256 === hash(`${repairDirectory}/source-after.json`) && uiReuse.passedAssertions === 439
  && uiReuse.exactNonUiDependenciesPreserved === true, 'UI recheck does not bind the checked repair lineage');
const uiChanges = changedPaths(repairAfter, uiAfter), uiAllowed = new Set(['src/editor/MacroHydrologyPanel.tsx', 'tests/atlas-hydrology-macro.spec.ts']);
requireThat(uiChanges.every(file => uiAllowed.has(file)) && same([...uiReuse.changed].sort(), uiChanges), 'UI recheck changed outside recorded presentation/browser repair');
const final = read(`${finalDirectory}/verification.json`);
const finalBefore = read(`${finalDirectory}/source-before.json`), finalAfter = read(`${finalDirectory}/source-after.json`);
const browserOnlyRecheck = finalDirectory !== uiDirectory;
assertSnapshot(finalBefore, finalAfter, 'final source stability');
if (browserOnlyRecheck) {
  commandPass(final, ['lint', 'types'], 'browser-only recheck');
  const reuse = read(`${finalDirectory}/reused-checks.json`), changes = changedPaths(uiAfter, finalAfter);
  const allowed = new Set(['tests/atlas-hydrology-macro.spec.ts', 'tests/helpers/atlas-hydrology-macro-readonly.ts']);
  requireThat(same(final.reuse, reuse) && reuse.prerequisite === uiDirectory
    && reuse.prerequisiteSha256 === hash(`${uiDirectory}/verification.json`) && reuse.sourceSha256 === hash(`${uiDirectory}/source-after.json`)
    && reuse.productionUnchanged === true && reuse.unitAssertionsReused === 439 && reuse.unitAssertionsRerun === 0
    && reuse.buildReusedUnchanged === true && reuse.generatorIdentitiesReused === 11
    && changes.every(file => allowed.has(file)) && same([...reuse.changed].sort(), changes)
    && same(final.dist, ui.dist) && final.buildJsonSha256 === ui.buildJsonSha256
    && hash(`${finalDirectory}/identity-verification.json`) === hash(`${uiDirectory}/identity-verification.json`),
    'Browser-only repair does not preserve production/build/unit/identity prerequisite bytes');
}
requireThat(final.unit.passed === true && final.unit.rerunAssertions === 0 && final.unit.aggregatePassedAssertions === 439
  && final.unit.total === 439 && final.unit.passedAssertions === 439 && !fs.existsSync(safe(`${finalDirectory}/unit.json`, true)), 'Final recheck must record zero new unit assertions');
const currentSource = sourceSnapshot(), currentDist = walk('dist');
assertSnapshot(finalAfter, currentSource, 'current src/tests/scripts/package versus final checked source');
assertSnapshot(final.dist, currentDist, 'current dist versus final checked dist');
const build = read('dist/build.json'), buildSha256 = hash('dist/build.json');
requireThat(build.version === '0.5.0-preview.24' && read('package.json').version === build.version
  && shaPattern.test(final.buildJsonSha256) && buildSha256 === final.buildJsonSha256 && hash(`${finalDirectory}/build.json`) === buildSha256, 'Actual preview.24 build identity differs');
const identity = read(`${finalDirectory}/identity-verification.json`), baseline = read(`${checks}/baseline-build.json`);
const generatorKeys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
requireThat(final.generatorIdentityVerified === true && identity.passed === true && identity.sourceStable === true
  && hash(`${finalDirectory}/identity-verification.json`) === final.identityVerificationSha256
  && identity.buildSha256 === buildSha256 && identity.priorBuildSha256 === hash(`${checks}/baseline-build.json`)
  && identity.sourceSnapshotSha256 === hash(`${uiDirectory}/source-after.json`)
  && identity.checks.length === 11 && generatorKeys.length === 11
  && same(identity.checks.map(row => row.key).sort(), generatorKeys)
  && identity.checks.every(row => row.currentMatchesBuild === true && row.frozenMatchesPrior === true
    && same(row.actual, build[row.key]) && same(row.frozen, baseline[row.key]))
  && identity.engineUnchanged === true && identity.orographyIncluded === true && build.engineFingerprint === baseline.engineFingerprint,
  'Complete eleven-closure check does not bind actual build and frozen baseline');

// A compact archive is not a self-contained fine-world replay. Preserve its
// original verification (including fields that were null) and every packet hash.
const coastVerification = read(`${coast}/verification.json`), coastInventory = read(`${coast}/files.sha256.json`);
requireThat(coastVerification.inventorySha256 === hash(`${coast}/files.sha256.json`)
  && coastVerification.rawPacketCopies === 0 && coastVerification.independentlyReplayableArchive === false
  && coastVerification.totalFinePacketFiles === 2844 && coastVerification.totalFinePacketBytesNotCopied === 11694528, 'Compact coast provenance differs');
const compactRows = walk(coast);
const inventoryRows = compactRows.filter(row => ![`${coast}/files.sha256.json`, `${coast}/verification.json`].includes(row.path));
requireThat(coastInventory.files.length === inventoryRows.length && coastInventory.files.length === coastVerification.inventoryFiles, 'Compact archive has missing/extra files');
const compactExpected = new Map(coastInventory.files.map(row => [row.path, row]));
for (const row of inventoryRows) {
  const relative = path.relative(safe(coast), safe(row.path)).replaceAll('\\', '/'), expected = compactExpected.get(relative);
  requireThat(expected && expected.sha256 === row.sha256 && expected.bytes === row.bytes, `Compact coast archive bytes differ: ${relative}`);
}
requireThat(!compactRows.some(row => /\.(?:bin|i16|i32|u32)$/i.test(row.path)), 'Raw generated fine payload found in compact archive');

const collectSpecs = suites => (suites ?? []).flatMap(suite => [...(suite.specs ?? []), ...collectSpecs(suite.suites)]);
function casesAndAttachments(report) {
  const cases = [], attachments = [];
  for (const [specIndex, spec] of collectSpecs(report.suites).entries()) for (const [testIndex, test] of (spec.tests ?? []).entries()) {
    cases.push({ file: spec.file, title: spec.title, project: test.projectName, status: test.status,
      results: (test.results ?? []).map(result => ({ status: result.status, retry: result.retry, duration: result.duration })) });
    for (const [resultIndex, result] of (test.results ?? []).entries()) for (const [attachmentIndex, attachment] of (result.attachments ?? []).entries()) {
      attachments.push({ ...attachment, locator: { specIndex, testIndex, resultIndex, attachmentIndex } });
    }
  }
  return { cases, attachments };
}
function decodeJsonAttachments(directory, report) {
  return casesAndAttachments(report).attachments.filter(attachment => attachment.contentType?.split(';')[0] === 'application/json').map(attachment => {
    requireThat(typeof attachment.name === 'string' && /^[a-zA-Z0-9_.-]+\.json$/.test(attachment.name), 'Unsafe JSON attachment name');
    let bytes, origin;
    if (typeof attachment.body === 'string') {
      bytes = Buffer.from(attachment.body, 'base64');
      requireThat(bytes.toString('base64') === attachment.body, 'Non-canonical Playwright attachment base64');
      origin = 'original Playwright results.json attachment body, base64 decoded without reserialization';
    } else {
      requireThat(typeof attachment.path === 'string', 'JSON attachment has no body or path');
      const attached = within(safe(directory), path.isAbsolute(attachment.path) ? path.relative(safe(directory), attachment.path) : attachment.path);
      bytes = readBytes(attached); origin = normalize(attached);
    }
    const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    return { name: attachment.name, bytes, value, origin, locator: attachment.locator, sha256: digest(bytes) };
  });
}
const expectedRuns = labels.map((label, index) => ({ label, kind: index < 3 ? 'macro' : 'coast',
  project: ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'][index % 3] }));
function validateFreshRun(expected) {
  const directory = `${browsers}/${expected.label}`, verification = read(`${directory}/verification.json`);
  const before = read(`${directory}/before.json`), after = read(`${directory}/after.json`), report = read(`${directory}/results.json`);
  const { cases } = casesAndAttachments(report);
  const suite = expected.kind === 'macro' ? 'atlas-hydrology-macro.spec.ts' : 'atlas-add-detail-coast.spec.ts';
  const prefix = expected.kind === 'macro' ? '[hydrology-macro-v4]' : '[detail-v4-add]';
  requireThat(verification.name === expected.label && verification.kind === expected.kind && verification.project === expected.project
    && verification.checkRound === round && verification.passed === true && verification.sourceAndDistStable === true
    && verification.code === 0 && !verification.signal && !verification.spawnError && verification.retries === 0
    && verification.physicalDevice === false && verification.cloudWrites === false
    && verification.prerequisiteBuildJsonSha256 === buildSha256 && same(verification.build, build)
    && hash(`${directory}/build.json`) === buildSha256 && same(before, after)
    && before.checkVerificationSha256 === hash(`${finalDirectory}/verification.json`)
    && before.checkSourceSha256 === hash(`${finalDirectory}/source-after.json`)
    && hash(`${directory}/prerequisite-verification.json`) === hash(`${finalDirectory}/verification.json`), `Fresh browser ${expected.label}: identity or stability not passed`);
  assertSnapshot(before.source, currentSource, `${expected.label} checked source`);
  assertSnapshot(before.dist, currentDist, `${expected.label} checked dist`);
  requireThat(before.runner?.length === 3 && before.runner.every(row => hash(row.path) === row.sha256), `${expected.label}: runner changed`);
  requireThat(hash(`${directory}/${suite}`) === hash(`tests/${suite}`), `${expected.label}: copied test differs`);
  if (expected.kind === 'macro') requireThat(hash(`${directory}/atlas-hydrology-macro-readonly.ts`) === hash('tests/helpers/atlas-hydrology-macro-readonly.ts'), `${expected.label}: independent read-only observer changed`);
  requireThat(cases.length === 1 && cases.every(row => row.file?.replaceAll('\\', '/').endsWith(suite) && row.title.startsWith(prefix)
    && row.project === expected.project && row.status === 'expected' && row.results.length === 1 && row.results[0].status === 'passed' && row.results[0].retry === 0)
    && report.stats?.expected === 1 && report.stats?.unexpected === 0 && report.stats?.skipped === 0 && report.stats?.flaky === 0 && !report.errors?.length
    && same(verification.observed.cases, cases) && same(verification.observed.stats, report.stats), `${expected.label}: raw browser result did not pass exactly one zero-retry case`);
  const attachments = decodeJsonAttachments(directory, report);
  const selectedName = expected.kind === 'macro' ? 'hydrology-macro-evidence.json' : 'additive-persistence-observation.json';
  const evidence = attachments.filter(attachment => attachment.name === selectedName);
  requireThat(evidence.length === 1 && evidence[0].value.project === expected.project, `${expected.label}: required original attachment absent`);
  if (expected.kind === 'macro') {
    const actualBuild = attachments.filter(attachment => attachment.name === 'actual-build.json');
    const value = evidence[0].value;
    requireThat(actualBuild.length === 1 && actualBuild[0].sha256 === buildSha256 && value.buildSha256 === buildSha256 && same(value.build, build)
      && value.physicalDevice === false && Array.isArray(value.errors) && value.errors.length === 0 && same(value.first, value.restored)
      && value.resultSha256 === digest(Buffer.from(JSON.stringify(value.first))) && value.first?.grid?.stepWorld === 16
      && value.first.grid.columns === 257 && value.first.grid.rows === 257 && value.first.stats?.sampledNodes === 66049
      && value.cancelled?.noDisplayedResult === true && value.cancelled.savedUnchanged === true, `${expected.label}: original macro persistence/cancel/66049-node evidence mismatch`);
  } else requireThat(same(evidence[0].value.actualBuild, build), `${expected.label}: original coast attachment build differs`);
  const rows = walk(directory);
  const requiredImages = expected.kind === 'macro'
    ? ['macro-complete-network.png', 'macro-native-branch-details.png', 'macro-selected-branch-map.png', 'macro-cancelled-readonly.png', 'macro-restored-identical-network.png']
    : ['second-continent-preview.png', 'restored-coast-close.png', 'two-continents-restored.png', 'saved-mountain-mid.png', 'saved-mountain-near.png'];
  for (const name of requiredImages) requireThat(rows.filter(row => path.basename(row.path) === name).length === 1, `${expected.label}: missing or ambiguous actual screenshot ${name}`);
  return { ...expected, directory, verification, rows, attachments };
}
const freshRuns = expectedRuns.map(validateFreshRun);
const failedLabels = new Set(extras);
const supersededLabels = [];
for (const entry of fs.readdirSync(safe(browsers), { withFileTypes: true })) {
  requireThat(!entry.isSymbolicLink(), 'Browser root contains a symlink');
  if (entry.isDirectory() && labelPattern.test(entry.name) && !labels.includes(entry.name)) {
    const file = `${browsers}/${entry.name}/verification.json`;
    if (fs.existsSync(safe(file, true))) {
      const verification = read(file);
      if (verification.passed === false) failedLabels.add(entry.name);
      else if (verification.passed === true) supersededLabels.push(entry.name);
      else throw Error(`Unclassified browser verification outcome: ${entry.name}`);
    }
  }
}
const failedRuns = [...failedLabels].sort().map(label => {
  const directory = `${browsers}/${label}`, verificationFile = `${directory}/verification.json`, resultsFile = `${directory}/results.json`;
  const verification = fs.existsSync(safe(verificationFile, true)) ? read(verificationFile) : null;
  requireThat(verification === null || verification.passed === false, `Explicit failed run is not failed: ${label}`);
  const report = fs.existsSync(safe(resultsFile, true)) ? read(resultsFile) : null;
  return { label, directory, verification, rows: walk(directory), attachments: report ? decodeJsonAttachments(directory, report) : [] };
});
requireThat(failedRuns.some(run => run.label === 'macro-desktop-first' && run.verification?.passed === false), 'Known first desktop browser failure must be preserved');
const supersededRuns = supersededLabels.sort().map(label => {
  const directory = `${browsers}/${label}`, verification = read(`${directory}/verification.json`), report = read(`${directory}/results.json`);
  return { label, directory, verification, rows: walk(directory), attachments: decodeJsonAttachments(directory, report) };
});

// Build the exact copy plan in memory before creating the final archive.
const planned = [], destinations = new Set(), omitted = [], attachmentIndex = [], observationIndex = [];
function addCopy(from, destination) {
  requireThat(!destinations.has(destination), `Duplicate archive destination: ${destination}`); destinations.add(destination);
  within(output, destination);
  const bytes = readBytes(from);
  planned.push({ from: normalize(from), path: destination, sha256: digest(bytes), bytes: bytes.length });
}
function addBytes(bytes, destination, origin) {
  requireThat(!destinations.has(destination), `Duplicate archive destination: ${destination}`); destinations.add(destination);
  within(output, destination);
  planned.push({ from: null, origin, path: destination, sha256: digest(bytes), bytes: bytes.length, contents: bytes });
}
function addJson(value, destination, origin) { addBytes(Buffer.from(`${JSON.stringify(value, null, 2)}\n`), destination, origin); }
function addTree(directory, destination) {
  for (const row of walk(directory)) addCopy(row.path, `${destination}/${path.relative(safe(directory), safe(row.path)).replaceAll('\\', '/')}`);
}
addTree(coast, 'coast-candidate');
for (const label of [...new Set(['first', 'worker-diagnostic-1', 'repair-1', 'ui-repair-1', round])]) addTree(`${checks}/${label}`, `unified/${label}`);
for (const name of ['run.mjs', 'repair.mjs', 'ui-repair.mjs', 'baseline-build.json']) addCopy(`${checks}/${name}`, `unified/${name}`);
if (browserOnlyRecheck) addCopy(`${checks}/browser-repair.mjs`, 'unified/browser-repair.mjs');
for (const name of ['static-manifest.json', 'promoted.json', 'README.md', 'prepare-reader.mjs', 'prepare-promotion.mjs']) addCopy(`${macro}/${name}`, `macro-core/${name}`);
addTree(`${macro}/promotion`, 'macro-core/promotion');
addTree(`${macro}/static-review`, 'macro-core/static-review');
addCopy('.autopilot/ph07/macro-ui-review/MacroHydrologyPanel.tsx', 'macro-ui/MacroHydrologyPanel.tsx');
requireThat(hash('.autopilot/ph07/macro-ui-review/MacroHydrologyPanel.tsx') === hash('src/editor/MacroHydrologyPanel.tsx'), 'Promoted UI candidate bytes differ from current checked UI');
for (const name of ['run.mjs', 'playwright.config.ts', 'browser-repair-note.json']) addCopy(`${browsers}/${name}`, `browser/${name}`);
for (const [group, runs] of [['fresh', freshRuns], ['failed', failedRuns], ['superseded', supersededRuns]]) for (const run of runs) {
  for (const row of run.rows) {
    const relative = path.relative(safe(run.directory), safe(row.path)).replaceAll('\\', '/');
    if (/\.(?:zip|trace|network|webm|mp4|bin|i16|i32|u32)$/i.test(relative)) {
      omitted.push({ ...row, absoluteLocalPath: safe(row.path), run: run.label, group, reason: 'Original local trace/video/raw binary retained in place; not copied into compact archive' });
      continue;
    }
    requireThat(/\.(?:json|log|png|jpg|jpeg|ts|tsx|mjs|md|txt)$/i.test(relative), `Unclassified browser evidence file; decide explicitly before archive: ${row.path}`);
    addCopy(row.path, `browser/${group}/${run.label}/${relative}`);
    if (/\.png$/i.test(relative)) {
      const destination = `observations/${group}/${run.label}/${path.basename(relative)}`;
      addCopy(row.path, destination);
      observationIndex.push({ run: run.label, group, project: run.verification?.project ?? null, kind: run.verification?.kind ?? null,
        runPassed: run.verification?.passed ?? null, source: row.path, path: destination, sha256: row.sha256, bytes: row.bytes,
        screenshotNotVisualAcceptance: true });
    }
  }
  run.attachments.forEach((attachment, index) => {
    const destination = `browser/${group}/${run.label}/attached-json/${String(index + 1).padStart(3, '0')}-${attachment.name}`;
    addBytes(attachment.bytes, destination, { report: `${run.directory}/results.json`, locator: attachment.locator, encoding: attachment.origin });
    attachmentIndex.push({ run: run.label, group, name: attachment.name, path: destination, sha256: attachment.sha256, bytes: attachment.bytes.length,
      report: `${run.directory}/results.json`, locator: attachment.locator, originalDecodedBytes: true });
  });
}
addCopy('dist/build.json', 'build.json');
addCopy('.autopilot/ph07/record-macro-coast.mjs', 'record-macro-coast.mjs');
addTree('.autopilot/ph07/macro-coast-archive-staging/recorder-attempts', 'recorder-attempts');

// Read Git without changing its index. Hash blob headers plus the actual raw
// worktree bytes: CRLF normalization must not falsely produce sourceIsHead=true.
function git(args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  requireThat(result.status === 0 && !result.signal && !result.error, `Read-only Git provenance failed: ${args[0]}`);
  return result.stdout;
}
const head = git(['rev-parse', 'HEAD']).trim(), objectFormat = git(['rev-parse', '--show-object-format']).trim();
requireThat(['sha1', 'sha256'].includes(objectFormat), 'Unknown Git object format');
function matchesCommit(commit) {
  requireThat(/^[a-f0-9]{40,64}$/.test(commit ?? ''), 'Malformed actual build/HEAD commit metadata');
  const entries = git(['ls-tree', '-r', '-z', commit, '--', ...sourceRoots, ...sourceFiles]).split('\0').filter(Boolean).map(entry => {
    const match = /^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry); requireThat(match, 'Unexpected Git source entry');
    return { path: match[3], blob: match[2] };
  });
  if (!same(entries.map(row => row.path).sort(), currentSource.map(row => row.path).sort())) return false;
  const blobs = new Map(entries.map(row => [row.path, row.blob]));
  return currentSource.every(row => {
    const bytes = readBytes(row.path), blob = createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    return blobs.get(row.path) === blob;
  });
}
const sourceIsHead = matchesCommit(head), sourceMatchesBuildCommit = matchesCommit(build.commit);
addJson({ recordedAt: new Date().toISOString(), headAtArchive: head, buildCommitMetadata: build.commit,
  sourceIsHeadAtArchive: sourceIsHead, sourceMatchesBuildCommitAtArchive: sourceMatchesBuildCommit,
  sourceCommit: sourceIsHead ? head : null, comparison: 'Exact complete src/tests/scripts/package/config path set and raw worktree bytes versus Git blob hashes; no EOL normalization',
  checkedSource: finalAfter, checkedDist: final.dist, buildJsonSha256: buildSha256 }, 'source-provenance.json', 'Archive-time read-only Git and exact passed snapshots');
addJson({ recordedAt: new Date().toISOString(), screenshots: observationIndex, naturalVisualAccepted: false, userVisualAccepted: false,
  inspectedByArchiveScript: false, meaning: 'Actual browser screenshots copied without pixel changes. Fresh, failed and superseded runs remain separate. Parent records its visual observations independently.' }, 'observations/index.json', 'Archive indexing only; no invented visual judgment');
addJson({ attachments: attachmentIndex, reserialized: false }, 'browser/attached-json-index.json', 'Original attachment byte extraction index');
addJson({ artifacts: omitted, packetInventory: 'coast-candidate/omitted-fine-packets.inventory.json', packetPayloadsCopied: 0,
  independentlyReplayableFineArchive: false, limitation: 'Trace/video and complete generated fine packet payloads remain at original local paths. Hash inventories are not replay payloads.' }, 'omitted-artifacts.json', 'Explicit local-only artifact inventory');

// Revalidate all prerequisites once more immediately before creating staging.
assertSnapshot(currentSource, sourceSnapshot(), 'source stable through archive preflight');
assertSnapshot(currentDist, walk('dist'), 'dist stable through archive preflight');
for (const row of planned) if (row.from) requireThat(hash(row.from) === row.sha256 && fs.statSync(safe(row.from)).size === row.bytes, `Evidence changed during preflight: ${row.from}`);
requireThat(!fs.existsSync(safe(output, true)), 'Final evidence already exists; never overwrite or merge prior archive');
const staged = `.autopilot/ph07/macro-coast-archive-staging/final-${Date.now()}-${process.pid}`;
requireThat(!fs.existsSync(safe(staged, true)), 'Unique staging directory unexpectedly exists');
fs.mkdirSync(safe(staged, true));
const inventory = [];
for (const row of planned) {
  const destination = within(safe(staged), row.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (row.from) fs.copyFileSync(safe(row.from), destination, fs.constants.COPYFILE_EXCL);
  else fs.writeFileSync(destination, row.contents, { flag: 'wx' });
  requireThat(hash(destination) === row.sha256 && fs.statSync(destination).size === row.bytes, `Archived bytes differ: ${row.path}`);
  const { contents: _contents, ...entry } = row; inventory.push(entry);
}
assertSnapshot(currentSource, sourceSnapshot(), 'source unchanged after copying');
assertSnapshot(currentDist, walk('dist'), 'dist unchanged after copying');
requireThat(git(['rev-parse', 'HEAD']).trim() === head, 'HEAD changed during archive');
for (const row of planned) if (row.from) requireThat(hash(row.from) === row.sha256, `Original evidence changed during copy: ${row.from}`);
for (const row of omitted) requireThat(hash(row.path) === row.sha256 && fs.statSync(safe(row.path)).size === row.bytes, `Omitted local artifact changed during copy: ${row.path}`);
const saveFinal = (file, value) => fs.writeFileSync(within(safe(staged), file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
saveFinal('files.sha256.json', { recordedAt: new Date().toISOString(), excludes: ['files.sha256.json', 'verification.json'], files: inventory });
const freshSummaries = freshRuns.map(run => ({ label: run.label, project: run.project, kind: run.kind, passed: true,
  checkRound: round, sourceAndDistStable: true, buildJsonSha256: buildSha256, elapsedMs: run.verification.elapsedMs,
  retries: run.verification.retries, timeoutMs: run.verification.timeoutMs, physicalDevice: false,
  verification: `browser/fresh/${run.label}/verification.json`, verificationSha256: hash(`${run.directory}/verification.json`) }));
saveFinal('verification.json', {
  recordedAt: new Date().toISOString(), archiveComplete: true, evidenceScopePassed: true, version: build.version,
  buildCommitMetadata: build.commit, headAtArchive: head, sourceCommit: sourceIsHead ? head : null,
  sourceIsHeadAtArchive: sourceIsHead, sourceMatchesBuildCommitAtArchive: sourceMatchesBuildCommit,
  buildJsonSha256: buildSha256, passedCheckRound: round, sourceMatchedAtArchive: true, distMatchedAtArchive: true,
  sourceAndDistStableDuringArchive: true, completeSourceSnapshotFiles: currentSource.length,
  unit: { aggregatePassedAssertions: 439, originalFirst: { total: 439, passed: 433, failed: 6, files: 55,
    report: 'unified/first/unit.json', sha256: hash(`${firstDirectory}/unit.json`) },
    reusedUnchanged: { assertions: 425, files: 53, from: 'unified/first/unit.json', dependencyBinding: 'unified/repair-1/reused-unit-evidence.json' },
    repairedRerun: { passed: 14, total: 14, files: 2, report: 'unified/repair-1/unit.json', sha256: hash(`${repairDirectory}/unit.json`) },
    uiRecheck: { newAssertions: 0, reusedAssertions: 439, report: 'unified/ui-repair-1/reused-unit-evidence.json' },
    finalBrowserOnlyRecheck: browserOnlyRecheck ? { newAssertions: 0, reusedAssertions: 439, report: `unified/${round}/reused-checks.json` } : null,
    sameDevelopmentBatch: true, oneFresh439AssertionRerunClaimed: false, testsRunByArchiveScript: 0 },
  commands: final.results, finalBrowserOnlyRecheck: browserOnlyRecheck,
  fullProductionRecheck: { round: 'ui-repair-1', commands: ui.results, sourceSnapshotSha256: hash(`${uiDirectory}/source-after.json`) },
  buildRerunInFinalRound: !browserOnlyRecheck, generatorIdentityVerified: true, generatorClosureCount: 11,
  generatorClosuresRecomputedInRound: 'ui-repair-1', generatorClosureChecksRerunByFinalBrowserRepair: false,
  identityVerification: `unified/${round}/identity-verification.json`, identityVerificationSha256: final.identityVerificationSha256,
  classificationCounts: identity.classificationCounts, engineUnchanged: identity.engineUnchanged,
  browsers: freshSummaries, freshBrowserCases: 6, freshBrowserRetries: 0,
  preservedFailedBrowserRuns: failedRuns.map(run => ({ label: run.label, passed: run.verification?.passed ?? null,
    status: run.verification ? 'failed' : 'incomplete-no-verification', sourceAndDistStable: run.verification?.sourceAndDistStable ?? null,
    buildJsonSha256: run.verification?.prerequisiteBuildJsonSha256 ?? null, directory: `browser/failed/${run.label}` })),
  supersededBrowserRuns: supersededRuns.map(run => ({ label: run.label, passed: run.verification.passed,
    checkRound: run.verification.checkRound, countedAsFreshAcceptance: false, directory: `browser/superseded/${run.label}` })),
  originalCoastArchiveVerification: 'coast-candidate/verification.json', originalCoastArchiveVerificationSha256: hash(`${coast}/verification.json`),
  finePacketPayloadFilesCopied: 0, finePacketFilesInventoried: coastVerification.totalFinePacketFiles,
  finePacketBytesNotCopied: coastVerification.totalFinePacketBytesNotCopied, independentlyReplayableFineArchive: false,
  screenshotCount: observationIndex.length, extractedOriginalJsonAttachments: attachmentIndex.length,
  omittedArtifactCount: omitted.length, inventoryFiles: inventory.length, inventoryBytes: inventory.reduce((sum, row) => sum + row.bytes, 0),
  inventorySha256: hash(`${staged}/files.sha256.json`), inventoryExcludes: ['files.sha256.json', 'verification.json'],
  naturalVisualAccepted: false, userVisualAccepted: false, visualAccepted: false, physicalDeviceAccepted: false,
  phaseAccepted: false, performanceAccepted: false, cloudAccepted: false, cloudWrites: false,
  persistentRiversImplemented: false, persistentLakesImplemented: false, waterQuantitySimulationImplemented: false,
  atlasCountriesImplemented: false, atlasAdministrativeDivisionsImplemented: false, atlasCitiesImplemented: false, atlasMilitaryImplemented: false,
  macroScope: 'Read-only full-world fixed16 sampled drainage preview. Dry depressions are not lakes; sampled sea is not proven open ocean. Coarse edges can cross unsampled microterrain. No persistent river/lake entities or quantities.',
  archiveScriptRanTests: false, archiveScriptBuilt: false, archiveScriptRanBrowser: false,
  archiveScriptUpdatedPlan: false, archiveScriptWroteReportOrHandoff: false,
});
// No success artifact is placed in docs/evidence until the entire archive and
// its source bindings have survived validation. Failed staging is retained.
requireThat(!fs.existsSync(safe(output, true)), 'Final evidence appeared during preparation; preserve both and stop');
fs.mkdirSync(safe(path.dirname(output), true), { recursive: true });
fs.renameSync(safe(staged), safe(output, true));
console.log(JSON.stringify({ archive: output, files: inventory.length + 2, inventoryFiles: inventory.length,
  inventorySha256: hash(`${output}/files.sha256.json`), verificationSha256: hash(`${output}/verification.json`),
  buildJsonSha256: buildSha256, unitAssertions: 439, finalUiRecheckNewAssertions: 0,
  freshBrowserCases: 6, preservedFailedBrowserRuns: failedRuns.length, docsPlanHandoffModified: false }));
