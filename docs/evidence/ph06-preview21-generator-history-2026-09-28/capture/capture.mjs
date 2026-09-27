// Read immutable Git objects and the committed preview21 evidence. No generator,
// application, test runner, build, browser, history edit or current dist is run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
// Supplied only after root creates and authorizes the actual preview21 game commit.
// Never substitute the older build.commit or silently default to HEAD.
const commit = process.argv[2];
if (process.argv.length !== 3 || !/^[0-9a-f]{40}$/.test(commit ?? '')) throw Error('Usage: node capture.mjs <actual-preview21-game-commit-full-sha>');
const archive = 'docs/evidence/ph06-regional-coast-2026-09-28';
const checkedRoot = `${archive}/unified/first`, evidence = 'evidence/preview21';
const expectedBuild = '639ca2288c4d4ca0d3e8f21762c06be8e49678045c45c8dadfc91ec2314d7761';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (ok, why) => { if (!ok) throw Error(why); };
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024 });
const blobs = new Map(), referenced = new Map();
const tree = new Map(git(['ls-tree', '-rz', commit, '--', 'src', 'scripts', 'package.json', archive]).toString().split('\0').filter(Boolean).map(row => {
  const [metadata, file] = row.split('\t'), [mode, type, objectId] = metadata.split(' ');
  return [file, { mode, type, objectId }];
}));
function fromGit(file) {
  assert(tree.has(file) && tree.get(file).type === 'blob' && tree.get(file).mode === '100644', `Not a regular committed blob: ${file}`);
  if (!blobs.has(file)) blobs.set(file, git(['cat-file', 'blob', tree.get(file).objectId]));
  return blobs.get(file);
}
function archived(file) {
  const relative = `${archive}/${file}`, bytes = fromGit(relative), inventoryRow = archiveInventory.files.find(row => row.path === file);
  assert(inventoryRow && hash(bytes) === inventoryRow.sha256 && bytes.length === inventoryRow.bytes, `Archived byte manifest mismatch: ${relative}`);
  referenced.set(relative, { path: relative, commit, gitBlob: tree.get(relative).objectId, bytes: bytes.length, sha256: hash(bytes) });
  return bytes;
}
function save(file, bytes) {
  const target = path.resolve(stage, file), relative = path.relative(stage, target);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Unsafe capture destination');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const write = (file, value) => save(file, JSON.stringify(value, null, 2) + '\n');
assert(!fs.existsSync(path.join(stage, evidence)), 'Preserve existing capture; refusing overwrite');
const observedHeadAtStart = git(['rev-parse', 'HEAD']).toString().trim();
const observedWorktreeAtStart = git(['status', '--porcelain=v1']).toString();
const observedProductionAtStart = git(['status', '--porcelain=v1', '--', 'src', 'scripts', 'package.json', 'package-lock.json', 'tests']).toString();
assert(observedHeadAtStart === commit, 'Expected the actual committed preview21 base at capture start');
assert(JSON.parse(fromGit('package.json').toString()).version === '0.5.0-preview.21', 'Source commit is not preview21');
const archiveInventoryBytes = fromGit(`${archive}/files.sha256.json`), archiveInventory = JSON.parse(archiveInventoryBytes.toString());
const expectedArchiveInventory = hash(archiveInventoryBytes);
const archiveVerificationBytes = fromGit(`${archive}/verification.json`), archiveVerification = JSON.parse(archiveVerificationBytes.toString());
assert(archiveVerification.archiveComplete && archiveVerification.finalRound === 'first' && archiveVerification.unit.passed && archiveVerification.inventorySha256 === expectedArchiveInventory && archiveVerification.version === '0.5.0-preview.21', 'Actual preview21 archive verification differs');
assert(archiveVerification.buildJsonSha256 === expectedBuild, 'Committed archive is not the checked actual preview21 build');
const buildBytes = archived('unified/first/build.json'), build = JSON.parse(buildBytes.toString());
assert(hash(buildBytes) === expectedBuild && build.version === '0.5.0-preview.21' && build.commit === '502164889fef2f0280b725c76538cd07df7d5e36', 'Actual archived preview21 build identity differs');
git(['merge-base', '--is-ancestor', build.commit, commit]);
const checkedNames = ['build.json', 'build.log', 'dist-audit.log', 'identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
const checkedBytes = new Map(checkedNames.map(name => [name, archived(`unified/first/${name}`)]));
const checked = JSON.parse(checkedBytes.get('verification.json').toString());
const identity = JSON.parse(checkedBytes.get('identity-verification.json').toString());
const units = JSON.parse(checkedBytes.get('unit.json').toString());
const checkedSnapshot = JSON.parse(checkedBytes.get('source-after.json').toString());
assert(checked.passed && checked.sourceStable && checked.allCommandsPassed && checked.results.length === 6 && checked.results.every(row => row.exitCode === 0 && row.signal === null), 'Archived checks are not successful/stable');
assert(checkedBytes.get('source-before.json').equals(checkedBytes.get('source-after.json')), 'Archived checks changed source');
assert(checked.buildJsonSha256 === expectedBuild && identity.buildSha256 === expectedBuild && hash(checkedBytes.get('identity-verification.json')) === checked.identityVerificationSha256, 'Archived build/identity binding differs');
assert(identity.passed && identity.sourceStable && identity.engineUnchanged && identity.errors.length === 0 && identity.sourceSnapshotSha256 === hash(checkedBytes.get('source-after.json')), 'Archived identity verification differs');
assert(units.success && units.numTotalTests === 149 && units.numPassedTests === 149 && units.numFailedTests === 0 && units.numPendingTests === 0 && units.testResults.length === 24, 'Actual archived unit scope is not 149/149 in 24 files');

const toolPaths = ['scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts'];
for (const file of toolPaths) {
  assert(hash(fromGit(file)) === checkedSnapshot.find(row => row.path === file)?.sha256, `Fingerprint tool differs from checked source: ${file}`);
  save(`${evidence}/frozen-tool/${file}`, fromGit(file));
}
// Node 24 strips these fingerprint tools' types; this emits no build artifact
// and only parses/hashes source text supplied from Git, never runs a generator.
const generatorTool = await import(pathToFileURL(path.join(stage, evidence, 'frozen-tool/scripts/generator-fingerprint.ts')).href);
const engineTool = await import(pathToFileURL(path.join(stage, evidence, 'frozen-tool/scripts/engine-fingerprint.ts')).href);
const entries = [
  ['macroGenerator', 'macro-landmass', 'fingerprintMacroGenerator'], ['landformGenerator', 'landforms', 'fingerprintLandformGenerator'],
  ['islandGenerator', 'island-chains', 'fingerprintIslandGenerator'], ['coastGenerator', 'coast-smoothing', 'fingerprintCoastGenerator'],
  ['shapeGenerator', 'shape-landmass', 'fingerprintShapeGenerator'], ['oceanGenerator', 'ocean-floor', 'fingerprintOceanGenerator'],
  ['detailShapeGenerator', 'shape-detail-landmass', 'fingerprintDetailShapeGenerator'], ['addDetailGenerator', 'add-detail-landmass', 'fingerprintAddDetailGenerator'],
  ['naturalDetailGenerator', 'shape-detail-landmass@2', 'fingerprintNaturalDetailGenerator'], ['addNaturalDetailGenerator', 'add-detail-landmass@2', 'fingerprintAddNaturalDetailGenerator'],
  ['localDetailReliefGenerator', 'local-detail-relief', 'fingerprintLocalDetailReliefGenerator'],
];
assert(equal(Object.keys(build).filter(key => key.endsWith('Generator')).sort(), entries.map(([key]) => key).sort()), 'All eleven actual build namespaces must be covered');
assert(identity.checks.length === 11 && equal(identity.checks.map(row => row.key).sort(), entries.map(([key]) => key).sort()), 'Archived identity verification must cover exactly all eleven namespaces');
const closureFiles = new Set(), engineFiles = new Set(engineTool.engineFiles);
const readClosure = file => { closureFiles.add(file); return fromGit(file).toString(); };
const closures = entries.map(([key, historyKey, fingerprintFunction]) => {
  const actual = generatorTool[fingerprintFunction](readClosure);
  assert(equal(actual, build[key]), `Committed preview21 closure differs from archived build: ${key}`);
  assert(equal(identity.checks.find(row => row.key === key)?.actual, actual), `Archived independent identity differs: ${key}`);
  return { key, historyKey, fingerprintFunction, ...actual, matchesArchivedBuild: true };
});
const engineFingerprint = engineTool.fingerprintSources(engineTool.engineFiles, file => fromGit(file).toString());
assert(engineFingerprint === build.engineFingerprint, 'Committed preview21 engine differs from the actual build');
assert(closureFiles.size === 42 && engineFiles.size === 5, 'Unexpected actual preview21 source scope; do not silently expand the freeze');
const sources = [...new Set([...closureFiles, ...engineFiles])].sort().map(file => {
  const bytes = fromGit(file), checkedRow = checkedSnapshot.find(row => row.path === file);
  assert(checkedRow, `Committed source absent from actual checked snapshot: ${file}`);
  assert(hash(bytes) === checkedRow.sha256, `Source raw bytes differ from checked preview21: ${file}`);
  save(`${evidence}/frozen-source/${file}`, bytes);
  return { file, gitBlob: tree.get(file).objectId, bytes: bytes.length, sha256: hash(bytes), checkedWorkingTreeSha256: checkedRow.sha256,
    checkedByteMatch: 'raw', generatorClosure: closureFiles.has(file), engine: engineFiles.has(file) };
});
const frozenRead = file => fs.readFileSync(path.join(stage, evidence, 'frozen-source', file), 'utf8');
for (const { key, fingerprintFunction } of closures) assert(equal(generatorTool[fingerprintFunction](frozenRead), build[key]), `Frozen bytes failed independent closure re-read: ${key}`);
assert(engineTool.fingerprintSources(engineTool.engineFiles, frozenRead) === engineFingerprint, 'Frozen engine failed re-read');
save(`${evidence}/build.json`, buildBytes);
save(`${evidence}/source-package.json`, fromGit('package.json'));
for (const [name, bytes] of checkedBytes) save(`${evidence}/verified-preview21/${name}`, bytes);
save(`${evidence}/original-archive-verification.json`, archiveVerificationBytes);
save(`${evidence}/original-archive-files.sha256.json`, archiveInventoryBytes);
// The production first round passed. The earlier isolated CPU candidate failed;
// preserve those original verdicts without mislabelling them as production checks.
const candidateReferences = ['first', 'repair-1'].map(name => {
  const relative = `candidate/${name}/verification.json`, bytes = archived(relative), result = JSON.parse(bytes.toString());
  assert(result.candidatePassed === (name === 'repair-1') && result.testsObserved === 28 && result.testsPassed === (name === 'first' ? 26 : 28) && result.testsFailed === (name === 'first' ? 2 : 0), `Original candidate verdict changed: ${name}`);
  save(`${evidence}/candidate-records/${name}.json`, bytes);
  return { path: `${archive}/${relative}`, sha256: hash(bytes), candidatePassed: result.candidatePassed, testsObserved: result.testsObserved,
    testsPassed: result.testsPassed, testsFailed: result.testsFailed, actualRuntimeSourcePath: `${archive}/candidate/${name}/runtime-sources`, rerun: false };
});
const archiveReferencesBytes = fromGit(`${archive}/references.json`);
assert(hash(archiveReferencesBytes) === archiveVerification.referencesSha256, 'Original archive references changed');
save(`${evidence}/original-archive-references.json`, archiveReferencesBytes);
const visualReviewBytes = archived('visual-review.json'), visualReview = JSON.parse(visualReviewBytes.toString());
save(`${evidence}/original-visual-review.json`, visualReviewBytes);
assert(visualReview.reviewedByRoot === true && visualReview.version === build.version && visualReview.buildJsonSha256 === expectedBuild, 'Original visual review must identify this actual build');
const acceptanceKeys = ['naturalVisualAccepted', 'userVisualAccepted', 'physicalDeviceAccepted', 'phaseAccepted', 'performanceAccepted'];
assert(acceptanceKeys.every(key => typeof visualReview[key] === 'boolean' && archiveVerification[key] === visualReview[key]), 'Original explicit acceptance states must agree; never infer a future verdict');
const browserReferences = ['desktop', 'mobile', 'tablet'].map(name => {
  const file = `browser/${name}/verification.json`, bytes = archived(file), result = JSON.parse(bytes.toString());
  assert(archived(`browser/${name}/build.json`).equals(buildBytes), `Archived ${name} used another build`);
  assert(result.passed && result.code === 0 && result.sourceAndDistStable && result.checkRound === 'first' && result.prerequisiteBuildJsonSha256 === expectedBuild, `Archived ${name} is not a stable pass on the final build`);
  const artifacts = archiveInventory.files.filter(row => row.path.startsWith(`browser/${name}/`));
  save(`${evidence}/browser-records/${name}.json`, bytes);
  return { path: `${archive}/${file}`, sha256: hash(bytes), project: result.project, code: result.code, elapsedMs: result.elapsedMs,
    sourceAndDistStable: result.sourceAndDistStable, physicalDevice: false, rerun: false,
    artifacts: artifacts.map(row => ({ path: `${archive}/${row.path}`, bytes: row.bytes, sha256: row.sha256 })), artifactsCopied: false };
});
assert(equal(browserReferences.map(row => row.project).sort(), ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].sort()), 'Missing actual three-device terminal evidence');
const provenance = { capturedAt: new Date().toISOString(), sourceCommit: commit, observedHeadAtStart, observedHeadAtEnd: git(['rev-parse', 'HEAD']).toString().trim(),
  worktreeObservation: { sourceIsHeadAtStart: observedHeadAtStart === commit, porcelainAtStart: observedWorktreeAtStart,
    productionPorcelainAtStart: observedProductionAtStart, productionSourceCleanAtStart: observedProductionAtStart.length === 0,
    porcelainAtEnd: git(['status', '--porcelain=v1']).toString(),
    note: 'Working-tree status is observed separately; documentation edits do not become source provenance. All captured source bytes come from sourceCommit.' },
  sourceOrigin: 'Only immutable Git blobs from sourceCommit and committed final-round evidence; no working-tree source, package or dist is used as preview21 provenance.',
  sourceVersion: '0.5.0-preview.21', buildCommitMetadata: build.commit, buildSha256: expectedBuild,
  commitRelationship: 'Original build names its then-current base commit 502164889fef2f0280b725c76538cd07df7d5e36. The explicitly supplied sourceCommit later commits the checked preview21 game and archive. All original build bytes and commit fields remain unchanged.',
  archivedBuildPath: `${checkedRoot}/build.json`, archivedBuildGitBlob: tree.get(`${checkedRoot}/build.json`).objectId,
  originalArchive: { path: archive, verificationSha256: hash(archiveVerificationBytes), inventorySha256: expectedArchiveInventory },
  fingerprintTools: toolPaths.map(file => ({ file, gitBlob: tree.get(file).objectId, sha256: hash(fromGit(file)) })),
  closures, closureCount: closures.length, generatorSourceCount: closureFiles.size, engineFiles: engineTool.engineFiles, engineFingerprint,
  sources, sourceCount: sources.length, sourceSnapshotSha256: hash(Buffer.from(JSON.stringify(sources))),
  sourceSnapshotHashDefinition: 'SHA256 UTF8 JSON.stringify(sources), sorted by file; each row includes Git blob, raw bytes and checked snapshot binding.',
  checkedRoot: { path: checkedRoot, verificationSha256: hash(checkedBytes.get('verification.json')), identityVerificationSha256: hash(checkedBytes.get('identity-verification.json')),
    sourceSnapshotSha256: hash(checkedBytes.get('source-after.json')), inheritedTechnicalPass: true, unitCases: 149, unitFiles: 24, checksRerun: false, dist: checked.dist },
  candidateReferences,
  visualReview: { path: `${archive}/visual-review.json`, sha256: hash(visualReviewBytes), originalBytesPreserved: true },
  browserReferences, acceptance: { inheritedPreview21TechnicalPass: true, newBrowserRun: false, allNativeTouchSavePreviouslyVerified: false,
    ...Object.fromEntries(acceptanceKeys.map(key => [key, visualReview[key]])) },
  scope: 'Immutable source/identity compatibility baseline only. No generation-history edits, recipe execution, schema changes, production tests/build/browser/commit or old-archive changes.',
};
write(`${evidence}/provenance.json`, provenance);
write(`${evidence}/references.json`, [...referenced.values()].sort((a, b) => a.path.localeCompare(b.path)));
const inventory = [];
function collect(dir = '') {
  for (const entry of fs.readdirSync(path.join(stage, evidence, dir), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected staging symlink'); const file = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) collect(file); else { const bytes = fs.readFileSync(path.join(stage, evidence, file)); inventory.push({ path: file, bytes: bytes.length, sha256: hash(bytes) }); }
  }
}
collect(); inventory.sort((a, b) => a.path.localeCompare(b.path)); write(`${evidence}/inventory.json`, { version: 1, excludesSelf: true, files: inventory });
write('capture-result.json', { sourceCommit: commit, buildCommitMetadata: build.commit, buildSha256: expectedBuild, closureCount: closures.length,
  generatorSourceCount: closureFiles.size, engineSourceCount: engineFiles.size, totalSourceCount: sources.length, allClosuresMatchBuild: true, engineMatchesBuild: true,
  frozenClosuresRecomputed: true, sourceSnapshotSha256: provenance.sourceSnapshotSha256, evidenceFiles: inventory.length + 1,
  inventorySha256: hash(fs.readFileSync(path.join(stage, evidence, 'inventory.json'))), productWorktreeReadForProvenance: false, checksRun: ['Git blob/archive binding', '11 generator source hashes', 'engine source hash', 'frozen-byte re-read'],
  testsRun: false, generatorsRun: false, buildRun: false, browserRun: false, productionModified: false });
console.log(JSON.stringify({ closureCount: closures.length, generatorSourceCount: closureFiles.size, totalSourceCount: sources.length, allClosuresMatched: true, engineMatched: true, originalBuildSha256: expectedBuild }));
