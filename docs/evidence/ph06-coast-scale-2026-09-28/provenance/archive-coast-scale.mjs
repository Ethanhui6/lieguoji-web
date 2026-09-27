// Evidence copying only. Never starts tests, builds, browsers or deployment.
// Exit 0 means a complete, bound archive; it is not natural/user/PH acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checks = '.autopilot/ph06/coast-scale-checks';
const target = 'docs/evidence/ph06-coast-scale-2026-09-28';
const rootRound = `${checks}/first`;
const prior = 'docs/evidence/ph06-asymmetric-coast-2026-09-28';
const history = 'docs/evidence/ph06-preview15-generator-history-2026-09-28';
const numericRoot = '.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-first';
const oldNumericRoot = '.autopilot/ph06/v4-natural-visual-repair-staging/checks/continuous-type-guard-fix';
const spec = 'tests/atlas-add-detail-coast.spec.ts';
const specSha = '982e80b83c158d97b9fe5f504f41a8bc8e81c361157fb9d929b5ef97628adaf2';
const expectedBuildSha = '967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499';
const expectedRootSha = 'd71210e13ece008cd29874788ba00d052e4dd243c6419f25984350cc13251d68';
const expectedIdentitySha = '76ed0a5a16cc2a1dd8c23da9e68378a826f1ea033e9930817bc67db15d758d9c';
const expectedPriorBuildSha = 'ca7fe62d32063f080795512b60f9f91a01baf49852c4fb1239d368488f91052e';
const rounds = [['desktop-first', 'desktop-chromium'], ['mobile-first', 'mobile-chromium'], ['tablet-first', 'tablet-chromium']];
const unitFiles = [
  'src/world/generation/detail-natural-coast-plan.test.ts', 'src/world/generation/detail-shape-natural.test.ts',
  'src/world/generation/detail-natural-visual-repair.test.ts', 'src/world/detail-natural-integration.test.ts',
  'src/world/detail-natural-history.test.ts', 'src/world/detail-preview15-history.test.ts',
  'src/world/generation/fingerprint.test.ts', 'src/world/generation/detail-shape-add.test.ts',
  'src/world/detail-add-integration.test.ts', 'src/world/detail-add-history.test.ts',
];
const caseCounts = [8, 13, 5, 2, 3, 5, 3, 8, 3, 3];
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const slash = value => value.replaceAll('\\', '/');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function absolute(file) {
  assert(typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && !file.split('/').some(part => part === '..' || !part), `Unsafe relative path: ${file}`);
  const resolved = path.resolve(root, file), relative = path.relative(root, resolved);
  assert(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Outside workspace: ${file}`);
  // No parent junction or symlink may redirect evidence outside this project.
  let cursor = root;
  for (const part of file.split('/')) { cursor = path.join(cursor, part); if (fs.existsSync(cursor)) assert(!fs.lstatSync(cursor).isSymbolicLink(), `Symlink in evidence path: ${file}`); }
  return resolved;
}
const exists = file => fs.existsSync(absolute(file));
const bytes = file => { const resolved = absolute(file); assert(fs.lstatSync(resolved).isFile(), `Not a regular file: ${file}`); return fs.readFileSync(resolved); };
const hash = file => createHash('sha256').update(bytes(file)).digest('hex');
const read = file => JSON.parse(bytes(file).toString().replace(/^\uFEFF/, ''));
const optional = file => exists(file) ? read(file) : null;
const files = new Map(), references = [], excluded = [];
assert(process.argv.length === 2, 'No arguments accepted; fixed preview16 evidence only');
assert(!exists(target), `Refusing to overwrite existing archive: ${target}`);
function add(source, dest, required = true) {
  if (!exists(source)) { assert(!required, `Required evidence missing: ${source}`); return; }
  absolute(`${target}/${dest}`);
  assert(!files.has(dest), `Duplicate archive destination: ${dest}`);
  files.set(dest, { source, path: dest, bytes: bytes(source).length, sha256: hash(source) });
}
function reference(file) {
  const row = { path: file, bytes: bytes(file).length, sha256: hash(file), copied: false };
  references.push(row); return row;
}
function walk(dir) {
  return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `Symlink under ${dir}: ${entry.name}`);
    return entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`];
  }).sort();
}
function snapshot(rows) {
  assert(Array.isArray(rows) && rows.length, 'Empty or missing source snapshot');
  const result = new Map();
  for (const row of rows) {
    const file = row.path;
    absolute(file);
    assert(/^(?:src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(file) && validHash(row.sha256) && !result.has(file), `Invalid snapshot row: ${file}`);
    result.set(file, row.sha256);
  }
  return result;
}
const normalized = rows => [...snapshot(rows)].sort(([a], [b]) => a.localeCompare(b));
function currentStable(rows, names) {
  const records = snapshot(rows);
  assert(equal([...records.keys()].sort(), [...names].sort()), 'Snapshot file set differs from complete current source/dist');
  for (const [file, expected] of records) assert(hash(file) === expected, `Source/dist drift: ${file}`);
}
const sourceNames = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].sort();
const browserNames = () => [...walk('src'), ...walk('tests'), ...walk('dist')].sort();
const build = read('dist/build.json'), buildSha = hash('dist/build.json');
assert(build.version === '0.5.0-preview.16' && buildSha === expectedBuildSha, 'Exact checked preview16 build required');
assert(hash(`${rootRound}/verification.json`) === expectedRootSha, 'Original 53-case root receipt changed');
assert(hash(`${rootRound}/identity-verification.json`) === expectedIdentitySha, 'Original independent identity receipt changed');
const checked = read(`${rootRound}/verification.json`), identity = read(`${rootRound}/identity-verification.json`);
const before = read(`${rootRound}/source-before.json`), after = read(`${rootRound}/source-after.json`), scope = read(`${rootRound}/scope.json`), unit = read(`${rootRound}/unit.json`);
assert(checked.sourceStable === true && equal(normalized(before), normalized(after)), 'Root source not stable');
assert(checked.buildJsonSha256 === buildSha && hash(`${rootRound}/build.json`) === buildSha, 'Root build is unbound');
currentStable(after, sourceNames()); currentStable(checked.dist, walk('dist'));
assert(checked.dist.length === 25 && walk('dist').length === 25, 'Unexpected checked dist file set');
const expectedCommands = {
  plan: ['scripts/check-plan.mjs'], lint: ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts'],
  types: ['node_modules/typescript/bin/tsc', '--noEmit'],
  unit: ['node_modules/vitest/vitest.mjs', 'run', ...unitFiles, '--reporter=json', `--outputFile=${rootRound}/unit.json`],
  build: ['node_modules/vite/bin/vite.js', 'build'], 'dist-audit': ['scripts/check-dist.mjs'],
};
const commandsPassed = checked.results?.length === 6 && Object.entries(expectedCommands).every(([name, args]) => checked.results.filter(row => row.name === name && equal(row.args, args) && row.exitCode === 0 && !row.signal && !row.error && Number.isFinite(Date.parse(row.startedAt)) && Date.parse(row.finishedAt) >= Date.parse(row.startedAt)).length === 1);
const actualUnits = (unit.testResults ?? []).map(row => ({ file: slash(path.isAbsolute(row.name) ? path.relative(root, row.name) : row.name), assertions: row.assertionResults ?? [] }));
const unitsPassed = equal(actualUnits.map(row => row.file).sort(), [...unitFiles].sort()) && equal([...(scope.unitFiles ?? [])].sort(), [...unitFiles].sort()) && unit.success === true && unit.numTotalTests === 53 && unit.numPassedTests === 53 && unit.numFailedTests === 0 && unit.numPendingTests === 0 && unit.numFailedTestSuites === 0 && unitFiles.every((file, i) => actualUnits.filter(row => row.file === file && row.assertions.length === caseCounts[i] && row.assertions.every(item => item.status === 'passed')).length === 1);
const baseline = read(`${checks}/baseline-build.json`), generatorKeys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
assert(hash(`${checks}/baseline-build.json`) === expectedPriorBuildSha && hash(`${history}/build.json`) === expectedPriorBuildSha, 'Frozen preview15 baseline mismatch');
assert(identity.passed === true && identity.sourceStable === true && identity.engineUnchanged === true && identity.errors?.length === 0 && identity.buildSha256 === buildSha && identity.priorBuildSha256 === expectedPriorBuildSha && identity.sourceSnapshotSha256 === hash(`${rootRound}/source-after.json`) && checked.identityVerificationSha256 === expectedIdentitySha, 'Identity receipt not bound');
assert(generatorKeys.length === 11 && equal(generatorKeys, identity.checks.map(row => row.key).sort()) && build.engineFingerprint === baseline.engineFingerprint, 'Engine/generator registry differs');
for (const row of identity.checks) {
  const changed = ['naturalDetailGenerator', 'addNaturalDetailGenerator'].includes(row.key);
  assert(row.currentMatchesBuild === true && row.frozenMatchesPrior === true && equal(row.actual, build[row.key]) && equal(row.frozen, baseline[row.key]) && validHash(row.historyReversedSha256) && (row.historyReversedSha256 !== row.frozen.sha256) === changed && row.classification === (changed ? 'non-history-runtime-change' : 'history-only'), `Identity closure/classification mismatch: ${row.key}`);
}
const rootTechnicalPassed = checked.passed === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && commandsPassed && unitsPassed;
assert(rootTechnicalPassed, 'Pinned root53 did not independently pass its actual commands/assertions');
for (const file of ['verification.json', 'identity-verification.json', 'source-before.json', 'source-after.json', 'scope.json', 'unit.json', 'build.json', ...Object.keys(expectedCommands).map(name => `${name}.log`)]) add(`${rootRound}/${file}`, `raw/root/first/${file}`);
for (const file of ['prior-build.json', 'pre-run-build.json', 'run.log']) add(`${rootRound}/${file}`, `raw/root/first/${file}`, false);

function browserReport(data, project) {
  const tests = [];
  const visit = suites => { for (const suite of suites ?? []) { for (const specRow of suite.specs ?? []) for (const test of specRow.tests ?? []) tests.push({ file: specRow.file ?? suite.file, project: test.projectName, title: specRow.title, timeout: test.timeout, status: test.status, results: (test.results ?? []).map(row => ({ status: row.status, retry: row.retry, duration: row.duration, errors: row.errors ?? [] })) }); visit(suite.suites); } };
  visit(data?.suites);
  const config = data?.config?.projects?.find(row => row.name === project);
  const unchangedBudget = config?.retries === 0 && config.repeatEach === 1 && tests.length === 1 && tests[0].timeout === 450000;
  const correctSpec = tests.length === 1 && path.basename(tests[0].file ?? '') === path.basename(spec) && tests[0].project === project;
  const passed = unchangedBudget && correctSpec && !data?.errors?.length && data?.stats?.expected === 1 && data.stats.unexpected === 0 && data.stats.skipped === 0 && data.stats.flaky === 0 && tests[0].status === 'expected' && tests[0].results.length === 1 && tests[0].results[0].status === 'passed' && tests[0].results[0].retry === 0;
  return { reportPresent: !!data, tests, stats: data?.stats ?? null, errors: data?.errors ?? [], unchangedBudget, correctSpec, passed };
}
const browsers = [];
// Refuse live/incomplete or extra rounds: an earlier failure cannot silently
// disappear behind an unlisted retry. Root must review a new archive scope first.
for (const entry of fs.readdirSync(absolute(checks), { withFileTypes: true })) if (entry.isDirectory()) assert(['first', ...rounds.map(([name]) => name)].includes(entry.name), `Unlisted evidence round: ${entry.name}`);
for (const [name, project] of rounds) {
  const source = `${checks}/${name}`;
  assert(exists(`${source}/verification.json`), `Browser is missing/live, archive refused: ${name}`);
  const v = read(`${source}/verification.json`), runBefore = read(`${source}/before.json`), runAfter = read(`${source}/after.json`);
  assert(v.name === name && v.project === project && Number.isFinite(v.elapsedMs) && v.elapsedMs >= 0 && Number.isFinite(Date.parse(v.startedAt)) && Date.parse(v.completedAt) >= Date.parse(v.startedAt) && (Number.isInteger(v.code) || nonempty(v.signal) || nonempty(v.error)), `Browser has no valid terminal result: ${name}`);
  assert(v.sourceAndDistStable === true && v.buildSameAfter === true && equal(normalized(runBefore), normalized(runAfter)), `Browser source/dist changed: ${name}`);
  currentStable(runAfter, browserNames());
  assert(v.buildJsonSha256 === buildSha && hash(`${source}/build.json`) === buildSha && v.checkedRound === rootRound && v.rootVerificationSha256 === expectedRootSha && v.spec === spec && snapshot(runAfter).get(spec) === specSha && hash(spec) === specSha, `Browser/root/spec binding differs: ${name}`);
  assert(v.timeoutMs === 450000 && v.retries === 0 && equal(v.args, ['node_modules/@playwright/test/cli.js', 'test', `--config=${checks}/playwright.config.ts`, `--project=${project}`]), `Browser command/budget differs: ${name}`);
  const report = browserReport(optional(`${source}/results.json`), project);
  for (const file of ['verification.json', 'before.json', 'after.json', 'build.json', 'run.log']) add(`${source}/${file}`, `raw/browser/${name}/${file}`);
  add(`${source}/results.json`, `raw/browser/${name}/results.json`, false);
  if (exists(`${source}/artifacts`)) for (const file of walk(`${source}/artifacts`)) {
    const relative = file.slice(`${source}/artifacts/`.length);
    if (relative.split('/').some(part => part.startsWith('.') || ['resources', 'profiles', 'indexeddb', 'saves', 'auth'].includes(part)) || !/\.(?:png|jpg|jpeg|webp|svg|webm|zip|json|md|txt|log)$/.test(file)) { excluded.push(file); continue; }
    add(file, `raw/browser/${name}/artifacts/${relative}`);
  }
  browsers.push({ name, project, source, terminal: true, v, report, after: runAfter, passed: v.code === 0 && !v.signal && !v.error && report.passed });
}

// Prior failures and history remain independent referenced records, not reruns.
const priorRecord = read(`${prior}/verification.json`), priorFailed = read(`${prior}/raw/root/first/verification.json`), priorFixed = read(`${prior}/raw/root/shore-projection-fix/verification.json`);
assert(priorRecord.archiveComplete === true && priorRecord.buildJsonSha256 === expectedPriorBuildSha && priorRecord.browserExecuted === false && priorRecord.naturalVisualAccepted === false && priorFailed.passed === false && priorFailed.unit.total === 52 && priorFailed.unit.passedAssertions === 51 && priorFixed.passed === true && priorFixed.unit.total === 52 && priorFixed.unit.passedAssertions === 52, 'Preview15 failure/fix boundary lost');
for (const file of [`${prior}/verification.json`, `${prior}/inventory.json`, `${prior}/raw/root/first/verification.json`, `${prior}/raw/root/first/unit.json`, `${prior}/raw/root/shore-projection-fix/verification.json`, `${history}/build.json`, `${history}/provenance.json`, `${history}/inventory.json`]) reference(file);
for (const folder of [prior, history]) {
  const inventory = read(`${folder}/inventory.json`);
  assert(Array.isArray(inventory.files) && inventory.files.length > 0, `Missing prior inventory: ${folder}`);
  for (const row of inventory.files) {
    const file = `${folder}/${row.path}`;
    assert(validHash(row.sha256) && hash(file) === row.sha256 && bytes(file).length === row.bytes, `Prior immutable evidence drift: ${file}`);
  }
}
const promotion = read('.autopilot/ph06/coast-scale-promotion.json');
assert(promotion.promoted === true && promotion.version === build.version && promotion.priorArchive === prior && promotion.priorBuildSha256 === expectedPriorBuildSha && promotion.files?.length === 5 && promotion.stageIdentities?.length === 2 && promotion.history?.target === history && promotion.history.buildSha256 === expectedPriorBuildSha && promotion.history.inventorySha256 === hash(`${history}/inventory.json`) && promotion.history.provenanceSha256 === hash(`${history}/provenance.json`), 'Promotion/history provenance unbound');
for (const row of promotion.files) { assert(hash(row.source) === row.afterSha256 && hash(row.target) === row.afterSha256 && snapshot(after).get(row.target) === row.afterSha256, `Promoted bytes drift: ${row.target}`); add(row.source, `preparation/promoted/${row.target}`); }
for (const row of promotion.stageIdentities) assert(hash(row.path) === row.sha256, `Ready manifest differs: ${row.path}`);
for (const stage of ['v4-coast-scale-staging', 'v4-preview15-history-staging']) for (const file of ['ready-manifest.json', 'README.md']) add(`.autopilot/ph06/${stage}/${file}`, `preparation/${stage}/${file}`);
add('.autopilot/ph06/v4-coast-scale-staging/baseline-manifest.json', 'preparation/v4-coast-scale-staging/baseline-manifest.json');
for (const file of ['coast-scale-promotion.json', 'promote-coast-scale.mjs', 'prepare-coast-scale-checks.mjs', 'prepare-coast-scale-comparison.mjs', 'compare-coast-scale-shore.mjs', 'archive-coast-scale.mjs']) add(`.autopilot/ph06/${file}`, `provenance/${file}`);
for (const file of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'baseline-build.json', 'shape-comparison-first.json']) add(`${checks}/${file}`, `runners/${file}`);
add('playwright.config.ts', 'runners/base-playwright.config.ts'); add(spec, `runners/${spec}`);

const comparison = read(`${checks}/shape-comparison-first.json`), oldNumericFile = `${oldNumericRoot}/actual-256-height-field.json`, numericFile = `${numericRoot}/actual-256-height-field.json`;
assert(comparison.before?.file === oldNumericFile && comparison.before.sha256 === '5c266e397d19a295092d0a309bb991024b5fd335be97c01e738617536b453b0c' && hash(oldNumericFile) === comparison.before.sha256 && comparison.after?.file === numericFile && comparison.after.sha256 === '0a5f55b24f7edb76e48e44625138f59eedbe0978b5ec6668c254a86a75e74d93' && hash(numericFile) === comparison.after.sha256 && comparison.naturalVisualAccepted === false, 'Actual numerical comparison bytes differ');
const numericData = read(numericFile), oldNumericData = read(oldNumericFile);
assert(equal(numericData.recipe, oldNumericData.recipe) && numericData.seed === 'fine-native-additive' && numericData.size === 256 && numericData.recipe.pointsQ?.length === 8 && numericData.recipe.coastStructureWorld === 96 && numericData.recipe.coastRoughnessWorld === 16, 'Same original eight-point/seed/96+16 recipe not preserved');
const numeric = { producer: 'src/world/generation/detail-natural-visual-repair.test.ts', scope: 'Actual unit-produced numerical diagnostic; not product screenshot or visual approval', files: [], sameRecipe: true, comparison, visualAccepted: false };
const unitCommand = checked.results.find(row => row.name === 'unit');
assert(snapshot(after).get(numeric.producer) === hash(numeric.producer), 'Numeric producer source unbound');
for (const file of ['actual-256-height-field.json', 'actual-256-height-field.png', 'actual-256-height-field.svg']) {
  const source = `${numericRoot}/${file}`, modified = fs.statSync(absolute(source)).mtimeMs;
  assert(modified >= Date.parse(unitCommand.startedAt) && modified <= Date.parse(unitCommand.finishedAt), `Numeric output not produced during actual root unit command: ${source}`);
  add(source, `numeric/current/${file}`); numeric.files.push({ path: source, sha256: hash(source), modifiedDuringActualUnitCommand: true });
  reference(`${oldNumericRoot}/${file}`);
}

// Required actual observations, including negative findings. Their completeness
// never changes naturalVisualAccepted=false. Only terminal product PNGs qualify.
const visualPath = `${checks}/visual-review.json`, visual = read(visualPath);
assert(visual && typeof visual === 'object' && !Array.isArray(visual) && typeof visual.recordedAt === 'string' && Number.isFinite(Date.parse(visual.recordedAt)) && visual.buildJsonSha256 === buildSha && nonempty(visual.scope) && Array.isArray(visual.observations) && visual.observations.length > 0 && visual.observations.every(nonempty), 'A dated, scoped, nonempty actual visual-review.json bound to build16 is required');
assert(Array.isArray(visual.screenshots) && visual.screenshots.length > 0, 'At least one actual terminal product PNG observation required');
for (const key of ['accepted', 'naturalVisualAccepted', 'visualAccepted', 'userAccepted', 'phaseAccepted', 'physicalDeviceAccepted', 'performanceAccepted']) assert(visual[key] !== true, `Visual record cannot claim ${key} in this archive`);
const productPngs = new Map([...files.values()].filter(row => row.source.endsWith('.png') && browsers.some(run => row.source.startsWith(`${run.source}/artifacts/`))).map(row => [row.source, row]));
const seenPngs = new Set(), visualScreenshots = [];
for (const row of visual.screenshots) {
  const selected = row && typeof row.path === 'string' ? productPngs.get(row.path) : null;
  assert(selected && validHash(row.sha256) && row.sha256 === selected.sha256 && !seenPngs.has(row.path), 'Visual screenshot must uniquely match archived terminal product PNG path/SHA');
  seenPngs.add(row.path); visualScreenshots.push({ path: row.path, archivePath: selected.path, sha256: row.sha256 });
}
add(visualPath, 'observations/visual-review.json');
const technicalPassed = rootTechnicalPassed && browsers.every(row => row.passed);
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  version: build.version, buildJsonSha256: buildSha, archiveComplete: true, rootTechnicalPassed, technicalPassed, allRequiredPassed: technicalPassed,
  scope: 'Local preview16 coast-scale engineering checks and three unchanged-budget additive product workflows. All required evidence is present; natural aesthetics, full phase, user, physical device and performance remain unaccepted.',
  naturalVisualAccepted: false, visualAccepted: false, userAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, allAccepted: false, cloudWrites: false,
  root: { original: `raw/root/first/verification.json`, verificationSha256: expectedRootSha, identitySha256: expectedIdentitySha, commandsPassed, unitsPassed, files: unitFiles.length, assertions: 53, distFiles: 25, sourceStable: true },
  identity: { validated: true, generatorCount: 11, engineUnchanged: true, classifications: identity.classificationCounts },
  browsers: browsers.map(({ after: ignored, ...row }) => row),
  binding: { expectedBuildSha, build, priorBuildSha256: expectedPriorBuildSha, sourceNamesComplete: true, sourceStable: true, distStable: true, specSha, promotion },
  numeric, visual: { observation: visual, required: true, optional: false, complete: true, bound: true, screenshots: visualScreenshots, accepted: false },
  priorIteration: { path: prior, referencedOnly: true, originalRootPassed: false, firstPassedAssertions: 51, totalAssertions: 52, projectionFixPassedAssertions: 52, browserExecuted: false, naturalVisualAccepted: false },
  pendingEvidence: false, excluded, references,
  notes: [
    'Only the exact root53 build and desktop/mobile/tablet first rounds are allowed. Missing/live rounds or changed source/dist refuse archival before creating the destination.',
    'Terminal browser failures, timeouts, errors and missing reports are retained and make technicalPassed/allRequiredPassed false; a successful archive never turns them into passes.',
    'Browser timeout remains450000ms, retries0. Mobile/tablet are browser emulation, not physical devices. Numerical diagnostics and authored candidates are not new browser runs.',
    'Nonempty dated observations with real product screenshot hashes are required, including negative observations. Observation completeness is not natural visual or user approval.',
    'Preview15 first51/52 failure and projection fix52/52 remain independent hash references with their original results. No prior browser or visual pass is invented.',
    'Only named evidence, product artifacts and promoted candidate source are copied. No dist payload, real save, credential, authentication cache or unlisted project material is copied.',
  ],
};
function freezeInputs() {
  assert(hash('dist/build.json') === expectedBuildSha, 'Build changed during archive');
  currentStable(after, sourceNames()); currentStable(checked.dist, walk('dist'));
  for (const row of browsers) currentStable(row.after, browserNames());
  for (const row of files.values()) assert(hash(row.source) === row.sha256 && bytes(row.source).length === row.bytes, `Evidence changed during archive: ${row.source}`);
  for (const row of references) assert(hash(row.path) === row.sha256 && bytes(row.path).length === row.bytes, `Reference changed during archive: ${row.path}`);
}
freezeInputs();
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`;
fs.writeFileSync(absolute(marker), 'Incomplete archive: do not use until copying and final source/evidence hash checks complete.\n', { flag: 'wx' });
const inventory = [];
function write(dest, data) {
  const file = `${target}/${dest}`; fs.mkdirSync(path.dirname(absolute(file)), { recursive: true });
  fs.writeFileSync(absolute(file), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  inventory.push({ path: dest, generated: true, bytes: bytes(file).length, sha256: hash(file) });
}
for (const row of files.values()) {
  const file = `${target}/${row.path}`; fs.mkdirSync(path.dirname(absolute(file)), { recursive: true });
  fs.copyFileSync(absolute(row.source), absolute(file), fs.constants.COPYFILE_EXCL);
  assert(hash(file) === row.sha256 && bytes(file).length === row.bytes, `Copy mismatch: ${row.path}`); inventory.push(row);
}
freezeInputs();
write('verification.json', verification); write('references.json', { priorEvidence: references });
write('README.md', `# 海岸物理尺度 preview16 本地证据\n\nrootTechnicalPassed=${rootTechnicalPassed}，technicalPassed=${technicalPassed}，allRequiredPassed=${technicalPassed}。这些字段只覆盖本批工程与三端浏览器流程；自然视觉、用户、完整 PH、真机、性能及云端始终未验收。\n\n原始 root53、三端终态结果与原450秒/零重试配置、绑定构建、数值图、同配方对比、提升来源和真实截图观察均保留。任一终态失败原样归档并使技术结果为false。真实数值图不是产品截图，浏览器仿真不是实体设备。\n\npreview15 的51/52原失败、52/52投影修复和未启动浏览器保持独立引用，不改写、不计为本批通过。归档脚本不运行生成器、检查、构建或浏览器，exit0仅代表原件复制和指纹绑定完成。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
console.log(JSON.stringify({ target, archiveComplete: true, files: inventory.length, rootTechnicalPassed, technicalPassed, allRequiredPassed: technicalPassed, naturalVisualAccepted: false, allAccepted: false }, null, 2));
