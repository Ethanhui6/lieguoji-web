// Read-only verification of this frozen source package; no application execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const stage = path.dirname(fileURLToPath(import.meta.url)), base = path.join(stage, 'evidence/preview21');
const expectedCommit = process.argv[2];
if (process.argv.length !== 3 || !/^[0-9a-f]{40}$/.test(expectedCommit ?? '')) throw Error('Usage: node verify.mjs <actual-preview21-game-commit-full-sha>');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, why) => { if (!ok) throw Error(why); };
const read = file => {
  const full = path.resolve(base, file), relative = path.relative(base, full);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Unsafe frozen path');
  const stat = fs.lstatSync(full); assert(stat.isFile() && !stat.isSymbolicLink(), 'Nonregular frozen file');
  return fs.readFileSync(full);
};
const json = file => JSON.parse(read(file).toString());
const inventory = json('inventory.json'), provenance = json('provenance.json'), build = json('build.json');
assert(inventory.excludesSelf && inventory.files.length < 128 && new Set(inventory.files.map(row => row.path)).size === inventory.files.length, 'Unexpected frozen inventory');
for (const row of inventory.files) { const bytes = read(row.path); assert(bytes.length === row.bytes && hash(bytes) === row.sha256, `Frozen byte changed: ${row.path}`); }
const found = [];
function walk(dir = '') {
  for (const entry of fs.readdirSync(path.join(base, dir), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected frozen directory symlink'); const file = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(file); else found.push(file);
  }
}
walk(); assert(JSON.stringify(found.filter(file => file !== 'inventory.json').sort()) === JSON.stringify(inventory.files.map(row => row.path).sort()), 'Frozen inventory is not exhaustive');
assert(provenance.sourceCommit === expectedCommit && build.version === '0.5.0-preview.21' && json('source-package.json').version === build.version, 'Wrong explicitly supplied committed version');
assert(build.commit === '502164889fef2f0280b725c76538cd07df7d5e36' && hash(read('build.json')) === '639ca2288c4d4ca0d3e8f21762c06be8e49678045c45c8dadfc91ec2314d7761', 'Original build bytes/commit changed');
assert(provenance.closureCount === 11 && provenance.closures.length === 11 && provenance.generatorSourceCount === 42 && provenance.sourceCount === 47, 'Unexpected closure scope');
const generatorTool = await import(pathToFileURL(path.join(base, 'frozen-tool/scripts/generator-fingerprint.ts')).href);
const engineTool = await import(pathToFileURL(path.join(base, 'frozen-tool/scripts/engine-fingerprint.ts')).href);
const source = file => read(`frozen-source/${file}`).toString();
for (const row of provenance.closures) {
  const computed = generatorTool[row.fingerprintFunction](source);
  assert(JSON.stringify(computed) === JSON.stringify(build[row.key]), `Frozen generator closure differs: ${row.key}`);
}
assert(engineTool.fingerprintSources(provenance.engineFiles, source) === build.engineFingerprint, 'Frozen engine differs');
const snapshot = json('verified-preview21/source-after.json');
for (const row of provenance.sources) {
  const bytes = read(`frozen-source/${row.file}`), checked = snapshot.find(entry => entry.path === row.file);
  assert(bytes.length === row.bytes && hash(bytes) === row.sha256 && checked?.sha256 === row.checkedWorkingTreeSha256, `Frozen source/snapshot binding differs: ${row.file}`);
  assert(hash(bytes) === checked.sha256 && row.checkedByteMatch === 'raw', `Raw mismatch with actual checked bytes: ${row.file}`);
}
assert(hash(Buffer.from(JSON.stringify(provenance.sources))) === provenance.sourceSnapshotSha256, 'Source snapshot hash differs');
const result = json('verified-preview21/verification.json'), identity = json('verified-preview21/identity-verification.json'), unit = json('verified-preview21/unit.json');
assert(result.passed && result.sourceStable && result.buildJsonSha256 === hash(read('build.json')) && result.identityVerificationSha256 === hash(read('verified-preview21/identity-verification.json')), 'Archived root verification binding differs');
assert(identity.passed && identity.buildSha256 === hash(read('build.json')) && identity.sourceSnapshotSha256 === hash(read('verified-preview21/source-after.json')), 'Archived identity snapshot binding differs');
assert(unit.success && unit.numPassedTests === 149 && unit.numTotalTests === 149 && unit.testResults.length === 24, 'Archived unit result differs');
for (const name of ['first', 'repair-1']) {
  const candidate = json(`candidate-records/${name}.json`), reference = provenance.candidateReferences.find(row => row.path.endsWith(`/candidate/${name}/verification.json`));
  assert(hash(read(`candidate-records/${name}.json`)) === reference?.sha256 && candidate.candidatePassed === (name === 'repair-1') && candidate.testsObserved === 28 && candidate.testsPassed === (name === 'first' ? 26 : 28) && candidate.testsFailed === (name === 'first' ? 2 : 0), `Original CPU candidate verdict changed: ${name}`);
}
const visual = json('original-visual-review.json');
assert(visual.reviewedByRoot === true && visual.version === build.version && visual.buildJsonSha256 === hash(read('build.json')), 'Actual visual review binding changed');
for (const key of ['naturalVisualAccepted', 'userVisualAccepted', 'physicalDeviceAccepted', 'phaseAccepted', 'performanceAccepted']) assert(typeof visual[key] === 'boolean' && visual[key] === provenance.acceptance[key], `Original acceptance state changed: ${key}`);
assert(hash(read('original-archive-files.sha256.json')) === provenance.originalArchive.inventorySha256, 'Original archive inventory changed');
assert(hash(read('original-archive-references.json')) === json('original-archive-verification.json').referencesSha256, 'Original archive references changed');
assert(provenance.browserReferences.length === 3 && provenance.browserReferences.every(row => row.code === 0 && row.sourceAndDistStable && row.artifactsCopied === false), 'Browser references changed');
for (const name of ['desktop', 'mobile', 'tablet']) {
  const record = json(`browser-records/${name}.json`), reference = provenance.browserReferences.find(row => row.path.endsWith(`/browser/${name}/verification.json`));
  assert(hash(read(`browser-records/${name}.json`)) === reference?.sha256 && record.passed && record.code === 0 && record.sourceAndDistStable && record.prerequisiteBuildJsonSha256 === hash(read('build.json')) && record.checkRound === 'first', `Original browser terminal changed: ${name}`);
}
console.log(JSON.stringify({ passed: true, sourceCommit: provenance.sourceCommit, originalBuildCommit: build.commit, buildSha256: hash(read('build.json')),
  generatorClosures: 11, generatorSourceFiles: 42, engineSourceFiles: 5, allFrozenSourceFiles: 47, frozenFilesVerified: inventory.files.length + 1,
  inventorySha256: hash(read('inventory.json')), sourceSnapshotSha256: provenance.sourceSnapshotSha256,
  rawCheckedByteMatches: provenance.sources.filter(row => row.checkedByteMatch === 'raw').length,
  newlineOnlyCheckedByteMatches: provenance.sources.filter(row => row.checkedByteMatch !== 'raw').length,
  inheritedChecksOnly: true, generatorsExecuted: false, testsExecuted: false, productBuildExecuted: false, browserExecuted: false, productionModified: false }, null, 2));
