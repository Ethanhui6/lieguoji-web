// Read immutable Git objects and the committed preview18 evidence. No generator,
// application, test runner, build, browser, history edit or current dist is run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
const commit = 'd742a6e917c723bf22f31768efa00b268f48d5b0';
const archive = 'docs/evidence/ph06-fine-land-belt-2026-09-28';
const checkedRoot = `${archive}/raw/root/first`, evidence = 'evidence/preview18';
const expectedBuild = '444d8380a0a4a5c8a42f99c7baeb3dfc5d0ef30b303f4e8571e622f27babdcd5';
const expectedArchiveInventory = 'bc3fc929c372e0d0ce527be19c6158a359245a25a37efe13eb17dde52ea27e18';
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
assert(observedHeadAtStart === commit, 'Expected the actual committed preview18 base at capture start');
assert(JSON.parse(fromGit('package.json').toString()).version === '0.5.0-preview.18', 'Source commit is not preview18');
const archiveInventoryBytes = fromGit(`${archive}/inventory.json`), archiveInventory = JSON.parse(archiveInventoryBytes.toString());
assert(hash(archiveInventoryBytes) === expectedArchiveInventory, 'Preview18 evidence inventory differs');
const archiveVerificationBytes = fromGit(`${archive}/verification.json`), archiveVerification = JSON.parse(archiveVerificationBytes.toString());
assert(archiveVerification.archiveComplete && archiveVerification.technicalPassed && archiveVerification.inventorySha256 === expectedArchiveInventory && archiveVerification.version === '0.5.0-preview.18', 'Actual preview18 archive verification differs');
const buildBytes = archived('raw/root/first/build.json'), build = JSON.parse(buildBytes.toString());
assert(hash(buildBytes) === expectedBuild && build.version === '0.5.0-preview.18' && build.commit === '05f566ea90f22ae5aa3e7421cfa221a53b7acec9', 'Actual archived preview18 build identity differs');
git(['merge-base', '--is-ancestor', build.commit, commit]);
const checkedNames = ['build.json', 'build.log', 'dist-audit.log', 'identity-verification.json', 'lint.log', 'plan.log', 'pre-run-build.json', 'prior-build.json', 'scope.json', 'source-after.json', 'source-before.json', 'types.log', 'unit.json', 'unit.log', 'verification.json'];
const checkedBytes = new Map(checkedNames.map(name => [name, archived(`raw/root/first/${name}`)]));
const checked = JSON.parse(checkedBytes.get('verification.json').toString());
const identity = JSON.parse(checkedBytes.get('identity-verification.json').toString());
const units = JSON.parse(checkedBytes.get('unit.json').toString());
const checkedSnapshot = JSON.parse(checkedBytes.get('source-after.json').toString());
assert(checked.passed && checked.sourceStable && checked.allCommandsPassed && checked.results.length === 6 && checked.results.every(row => row.exitCode === 0 && row.signal === null), 'Archived checks are not successful/stable');
assert(checkedBytes.get('source-before.json').equals(checkedBytes.get('source-after.json')), 'Archived checks changed source');
assert(checked.buildJsonSha256 === expectedBuild && identity.buildSha256 === expectedBuild && hash(checkedBytes.get('identity-verification.json')) === checked.identityVerificationSha256, 'Archived build/identity binding differs');
assert(identity.passed && identity.sourceStable && identity.engineUnchanged && identity.errors.length === 0 && identity.sourceSnapshotSha256 === hash(checkedBytes.get('source-after.json')), 'Archived identity verification differs');
assert(units.success && units.numTotalTests === 125 && units.numPassedTests === 125 && units.numFailedTests === 0 && units.numPendingTests === 0 && units.testResults.length === 18, 'Actual archived unit scope is not 125/125 in 18 files');

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
  assert(equal(actual, build[key]), `Committed preview18 closure differs from archived build: ${key}`);
  assert(equal(identity.checks.find(row => row.key === key)?.actual, actual), `Archived independent identity differs: ${key}`);
  return { key, historyKey, fingerprintFunction, ...actual, matchesArchivedBuild: true };
});
const engineFingerprint = engineTool.fingerprintSources(engineTool.engineFiles, file => fromGit(file).toString());
assert(engineFingerprint === build.engineFingerprint, 'Committed preview18 engine differs from the actual build');
const sources = [...new Set([...closureFiles, ...engineFiles])].sort().map(file => {
  const bytes = fromGit(file), checkedRow = checkedSnapshot.find(row => row.path === file);
  assert(checkedRow, `Committed source absent from actual checked snapshot: ${file}`);
  const rawMatch = hash(bytes) === checkedRow.sha256;
  const crlfMatch = hash(Buffer.from(bytes.toString().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'))) === checkedRow.sha256;
  assert(rawMatch || crlfMatch, `Source bytes differ from checked preview18 beyond the known Git LF/working-tree CRLF conversion: ${file}`);
  save(`${evidence}/frozen-source/${file}`, bytes);
  return { file, gitBlob: tree.get(file).objectId, bytes: bytes.length, sha256: hash(bytes), checkedWorkingTreeSha256: checkedRow.sha256,
    checkedByteMatch: rawMatch ? 'raw' : 'CRLF-working-tree-to-LF-Git-only', generatorClosure: closureFiles.has(file), engine: engineFiles.has(file) };
});
const frozenRead = file => fs.readFileSync(path.join(stage, evidence, 'frozen-source', file), 'utf8');
for (const { key, fingerprintFunction } of closures) assert(equal(generatorTool[fingerprintFunction](frozenRead), build[key]), `Frozen bytes failed independent closure re-read: ${key}`);
assert(engineTool.fingerprintSources(engineTool.engineFiles, frozenRead) === engineFingerprint, 'Frozen engine failed re-read');
save(`${evidence}/build.json`, buildBytes);
save(`${evidence}/source-package.json`, fromGit('package.json'));
for (const [name, bytes] of checkedBytes) save(`${evidence}/verified-preview18/${name}`, bytes);
save(`${evidence}/original-archive-verification.json`, archiveVerificationBytes);
const browserReferences = ['desktop-first', 'mobile-first', 'tablet-first'].map(name => {
  const file = `raw/browser/${name}/verification.json`, bytes = archived(file), result = JSON.parse(bytes.toString());
  assert(archived(`raw/browser/${name}/build.json`).equals(buildBytes), `Archived ${name} used another build`);
  return { path: `${archive}/${file}`, sha256: hash(bytes), project: result.project, code: result.code, elapsedMs: result.elapsedMs,
    sourceAndDistStable: result.sourceAndDistStable, physicalDevice: false, rerun: false };
});
const provenance = { capturedAt: new Date().toISOString(), sourceCommit: commit, observedHeadAtStart, observedHeadAtEnd: git(['rev-parse', 'HEAD']).toString().trim(),
  sourceOrigin: 'Only immutable Git blobs from sourceCommit; no current19 source, package or dist is used as preview18 provenance.',
  sourceVersion: '0.5.0-preview.18', buildCommitMetadata: build.commit, buildSha256: expectedBuild,
  commitRelationship: 'Original build names its then-current base commit 05f566ea; d742 later commits the checked preview18 source. Original build bytes and commit field are preserved.',
  archivedBuildPath: `${checkedRoot}/build.json`, archivedBuildGitBlob: tree.get(`${checkedRoot}/build.json`).objectId,
  originalArchive: { path: archive, verificationSha256: hash(archiveVerificationBytes), inventorySha256: expectedArchiveInventory },
  fingerprintTools: toolPaths.map(file => ({ file, gitBlob: tree.get(file).objectId, sha256: hash(fromGit(file)) })),
  closures, closureCount: closures.length, generatorSourceCount: closureFiles.size, engineFiles: engineTool.engineFiles, engineFingerprint,
  sources, sourceCount: sources.length, sourceSnapshotSha256: hash(Buffer.from(JSON.stringify(sources))),
  sourceSnapshotHashDefinition: 'SHA256 UTF8 JSON.stringify(sources), sorted by file; each row includes Git blob, raw bytes and checked snapshot binding.',
  checkedRoot: { path: checkedRoot, verificationSha256: hash(checkedBytes.get('verification.json')), identityVerificationSha256: hash(checkedBytes.get('identity-verification.json')),
    sourceSnapshotSha256: hash(checkedBytes.get('source-after.json')), inheritedTechnicalPass: true, unitCases: 125, unitFiles: 18, checksRerun: false, dist: checked.dist },
  browserReferences, acceptance: { inheritedPreview18TechnicalPass: true, newBrowserRun: false, allNativeTouchSavePreviouslyVerified: false, physicalDeviceAccepted: false,
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
