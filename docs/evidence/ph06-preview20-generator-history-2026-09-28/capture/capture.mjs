// Read immutable Git objects and the committed preview20 evidence. No generator,
// application, test runner, build, browser, history edit or current dist is run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
const commit = '4b387f95f5e890f20915a9ab5de4a93c058e5a62';
const archive = 'docs/evidence/ph06-fine-world-relief-2026-09-28';
const checkedRoot = `${archive}/unified/density-repair`, evidence = 'evidence/preview20';
const expectedBuild = '71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018';
const expectedArchiveInventory = 'd196c2e948d6224e0296c7d0276bb1daa77de64cc851bb165576007e11de7e9b';
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
assert(observedHeadAtStart === commit, 'Expected the actual committed preview20 base at capture start');
assert(JSON.parse(fromGit('package.json').toString()).version === '0.5.0-preview.20', 'Source commit is not preview20');
const archiveInventoryBytes = fromGit(`${archive}/files.sha256.json`), archiveInventory = JSON.parse(archiveInventoryBytes.toString());
assert(hash(archiveInventoryBytes) === expectedArchiveInventory, 'Preview20 evidence inventory differs');
const archiveVerificationBytes = fromGit(`${archive}/verification.json`), archiveVerification = JSON.parse(archiveVerificationBytes.toString());
assert(archiveVerification.archiveComplete && archiveVerification.finalRound === 'density-repair' && archiveVerification.unit.passed && archiveVerification.inventorySha256 === expectedArchiveInventory && archiveVerification.version === '0.5.0-preview.20', 'Actual preview20 archive verification differs');
const buildBytes = archived('unified/density-repair/build.json'), build = JSON.parse(buildBytes.toString());
assert(hash(buildBytes) === expectedBuild && build.version === '0.5.0-preview.20' && build.commit === 'ef52727aa984a2c22ac6b622475427da61cccaed', 'Actual archived preview20 build identity differs');
git(['merge-base', '--is-ancestor', build.commit, commit]);
const checkedNames = ['build.json', 'build.log', 'dist-audit.log', 'identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
const checkedBytes = new Map(checkedNames.map(name => [name, archived(`unified/density-repair/${name}`)]));
const checked = JSON.parse(checkedBytes.get('verification.json').toString());
const identity = JSON.parse(checkedBytes.get('identity-verification.json').toString());
const units = JSON.parse(checkedBytes.get('unit.json').toString());
const checkedSnapshot = JSON.parse(checkedBytes.get('source-after.json').toString());
assert(checked.passed && checked.sourceStable && checked.allCommandsPassed && checked.results.length === 6 && checked.results.every(row => row.exitCode === 0 && row.signal === null), 'Archived checks are not successful/stable');
assert(checkedBytes.get('source-before.json').equals(checkedBytes.get('source-after.json')), 'Archived checks changed source');
assert(checked.buildJsonSha256 === expectedBuild && identity.buildSha256 === expectedBuild && hash(checkedBytes.get('identity-verification.json')) === checked.identityVerificationSha256, 'Archived build/identity binding differs');
assert(identity.passed && identity.sourceStable && identity.engineUnchanged && identity.errors.length === 0 && identity.sourceSnapshotSha256 === hash(checkedBytes.get('source-after.json')), 'Archived identity verification differs');
assert(units.success && units.numTotalTests === 137 && units.numPassedTests === 137 && units.numFailedTests === 0 && units.numPendingTests === 0 && units.testResults.length === 20, 'Actual archived unit scope is not 137/137 in 20 files');

const toolPaths = ['scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts'];
for (const file of toolPaths) save(`${evidence}/frozen-tool/${file}`, fromGit(file));
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
const closureFiles = new Set(), engineFiles = new Set(engineTool.engineFiles);
const readClosure = file => { closureFiles.add(file); return fromGit(file).toString(); };
const closures = entries.map(([key, historyKey, fingerprintFunction]) => {
  const actual = generatorTool[fingerprintFunction](readClosure);
  assert(equal(actual, build[key]), `Committed preview20 closure differs from archived build: ${key}`);
  assert(equal(identity.checks.find(row => row.key === key)?.actual, actual), `Archived independent identity differs: ${key}`);
  return { key, historyKey, fingerprintFunction, ...actual, matchesArchivedBuild: true };
});
const engineFingerprint = engineTool.fingerprintSources(engineTool.engineFiles, file => fromGit(file).toString());
assert(engineFingerprint === build.engineFingerprint, 'Committed preview20 engine differs from the actual build');
const sources = [...new Set([...closureFiles, ...engineFiles])].sort().map(file => {
  const bytes = fromGit(file), checkedRow = checkedSnapshot.find(row => row.path === file);
  assert(checkedRow, `Committed source absent from actual checked snapshot: ${file}`);
  assert(hash(bytes) === checkedRow.sha256, `Source raw bytes differ from checked preview20: ${file}`);
  save(`${evidence}/frozen-source/${file}`, bytes);
  return { file, gitBlob: tree.get(file).objectId, bytes: bytes.length, sha256: hash(bytes), checkedWorkingTreeSha256: checkedRow.sha256,
    checkedByteMatch: 'raw', generatorClosure: closureFiles.has(file), engine: engineFiles.has(file) };
});
const frozenRead = file => fs.readFileSync(path.join(stage, evidence, 'frozen-source', file), 'utf8');
for (const { key, fingerprintFunction } of closures) assert(equal(generatorTool[fingerprintFunction](frozenRead), build[key]), `Frozen bytes failed independent closure re-read: ${key}`);
assert(engineTool.fingerprintSources(engineTool.engineFiles, frozenRead) === engineFingerprint, 'Frozen engine failed re-read');
save(`${evidence}/build.json`, buildBytes);
save(`${evidence}/source-package.json`, fromGit('package.json'));
for (const [name, bytes] of checkedBytes) save(`${evidence}/verified-preview20/${name}`, bytes);
save(`${evidence}/original-archive-verification.json`, archiveVerificationBytes);
save(`${evidence}/original-archive-files.sha256.json`, archiveInventoryBytes);
const firstNames = ['identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
const firstBytes = new Map(firstNames.map(name => [name, archived(`unified/first/${name}`)]));
const first = JSON.parse(firstBytes.get('verification.json').toString()), firstUnits = JSON.parse(firstBytes.get('unit.json').toString());
assert(first.passed === false && first.sourceStable && first.buildJsonSha256 === null && first.results.find(row => row.name === 'unit')?.exitCode === 1, 'Original first-round failure is missing');
assert(firstUnits.success === false && firstUnits.numTotalTests === 136 && firstUnits.numPassedTests === 130 && firstUnits.numFailedTests === 0 && firstUnits.numPendingTests === 6, 'Original first-round unit evidence differs');
for (const [name, bytes] of firstBytes) save(`${evidence}/original-first/${name}`, bytes);
const visualReviewBytes = archived('visual-review.json'), visualReview = JSON.parse(visualReviewBytes.toString());
save(`${evidence}/original-visual-review.json`, visualReviewBytes);
assert(visualReview.naturalVisualAccepted === false && visualReview.userVisualAccepted === false && visualReview.physicalDeviceAccepted === false && visualReview.phaseAccepted === false, 'Original visual/physical/phase limitations differ');
const browserReferences = ['desktop', 'mobile', 'tablet'].map(name => {
  const file = `browser/${name}/verification.json`, bytes = archived(file), result = JSON.parse(bytes.toString());
  assert(archived(`browser/${name}/build.json`).equals(buildBytes), `Archived ${name} used another build`);
  assert(result.passed && result.code === 0 && result.sourceAndDistStable && result.checkRound === 'density-repair' && result.prerequisiteBuildJsonSha256 === expectedBuild, `Archived ${name} is not a stable pass on the final build`);
  const artifacts = archiveInventory.files.filter(row => row.path.startsWith(`browser/${name}/`));
  return { path: `${archive}/${file}`, sha256: hash(bytes), project: result.project, code: result.code, elapsedMs: result.elapsedMs,
    sourceAndDistStable: result.sourceAndDistStable, physicalDevice: false, rerun: false,
    artifacts: artifacts.map(row => ({ path: `${archive}/${row.path}`, bytes: row.bytes, sha256: row.sha256 })), artifactsCopied: false };
});
const provenance = { capturedAt: new Date().toISOString(), sourceCommit: commit, observedHeadAtStart, observedHeadAtEnd: git(['rev-parse', 'HEAD']).toString().trim(),
  worktreeObservation: { sourceIsHeadAtStart: observedHeadAtStart === commit, porcelainAtStart: observedWorktreeAtStart,
    productionPorcelainAtStart: observedProductionAtStart, productionSourceCleanAtStart: observedProductionAtStart.length === 0,
    porcelainAtEnd: git(['status', '--porcelain=v1']).toString(),
    note: 'Working-tree status is observed separately; documentation edits do not become source provenance. All captured source bytes come from sourceCommit.' },
  sourceOrigin: 'Only immutable Git blobs from sourceCommit and committed final-round evidence; no working-tree source, package or dist is used as preview20 provenance.',
  sourceVersion: '0.5.0-preview.20', buildCommitMetadata: build.commit, buildSha256: expectedBuild,
  commitRelationship: 'Original build names its then-current base commit ef52727; 4b387f9 later commits the checked preview20 source. Original build bytes, earlier build records and all commit fields are preserved.',
  archivedBuildPath: `${checkedRoot}/build.json`, archivedBuildGitBlob: tree.get(`${checkedRoot}/build.json`).objectId,
  originalArchive: { path: archive, verificationSha256: hash(archiveVerificationBytes), inventorySha256: expectedArchiveInventory },
  fingerprintTools: toolPaths.map(file => ({ file, gitBlob: tree.get(file).objectId, sha256: hash(fromGit(file)) })),
  closures, closureCount: closures.length, generatorSourceCount: closureFiles.size, engineFiles: engineTool.engineFiles, engineFingerprint,
  sources, sourceCount: sources.length, sourceSnapshotSha256: hash(Buffer.from(JSON.stringify(sources))),
  sourceSnapshotHashDefinition: 'SHA256 UTF8 JSON.stringify(sources), sorted by file; each row includes Git blob, raw bytes and checked snapshot binding.',
  checkedRoot: { path: checkedRoot, verificationSha256: hash(checkedBytes.get('verification.json')), identityVerificationSha256: hash(checkedBytes.get('identity-verification.json')),
    sourceSnapshotSha256: hash(checkedBytes.get('source-after.json')), inheritedTechnicalPass: true, unitCases: 137, unitFiles: 20, checksRerun: false, dist: checked.dist },
  firstRound: { path: `${archive}/unified/first`, verificationSha256: hash(firstBytes.get('verification.json')), passed: false,
    unitExitCode: 1, unitTotal: 136, passedAssertions: 130, failedAssertions: 0, pendingAssertions: 6, buildProduced: false, rawEvidencePreserved: true },
  visualReview: { path: `${archive}/visual-review.json`, sha256: hash(visualReviewBytes), originalBytesPreserved: true },
  browserReferences, acceptance: { inheritedPreview20TechnicalPass: true, newBrowserRun: false, allNativeTouchSavePreviouslyVerified: false, physicalDeviceAccepted: false,
    naturalVisualAccepted: false, userVisualAccepted: false, phaseAccepted: false, performanceAccepted: false },
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
