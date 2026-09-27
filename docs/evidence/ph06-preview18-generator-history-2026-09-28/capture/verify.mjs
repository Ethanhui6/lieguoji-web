// Read-only verification of this frozen source package; no application execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const stage = path.dirname(fileURLToPath(import.meta.url)), base = path.join(stage, 'evidence/preview18');
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
assert(provenance.sourceCommit === 'd742a6e917c723bf22f31768efa00b268f48d5b0' && build.version === '0.5.0-preview.18' && json('source-package.json').version === build.version, 'Wrong committed version');
assert(build.commit === '05f566ea90f22ae5aa3e7421cfa221a53b7acec9' && hash(read('build.json')) === '444d8380a0a4a5c8a42f99c7baeb3dfc5d0ef30b303f4e8571e622f27babdcd5', 'Original build bytes/commit changed');
assert(provenance.closureCount === 11 && provenance.closures.length === 11 && provenance.generatorSourceCount === 42 && provenance.sourceCount === 47, 'Unexpected closure scope');
const generatorTool = await import(pathToFileURL(path.join(base, 'frozen-tool/scripts/generator-fingerprint.ts')).href);
const engineTool = await import(pathToFileURL(path.join(base, 'frozen-tool/scripts/engine-fingerprint.ts')).href);
const source = file => read(`frozen-source/${file}`).toString();
for (const row of provenance.closures) {
  const computed = generatorTool[row.fingerprintFunction](source);
  assert(JSON.stringify(computed) === JSON.stringify(build[row.key]), `Frozen generator closure differs: ${row.key}`);
}
assert(engineTool.fingerprintSources(provenance.engineFiles, source) === build.engineFingerprint, 'Frozen engine differs');
const snapshot = json('verified-preview18/source-after.json');
for (const row of provenance.sources) {
  const bytes = read(`frozen-source/${row.file}`), checked = snapshot.find(entry => entry.path === row.file);
  assert(bytes.length === row.bytes && hash(bytes) === row.sha256 && checked?.sha256 === row.checkedWorkingTreeSha256, `Frozen source/snapshot binding differs: ${row.file}`);
  assert(hash(bytes) === checked.sha256 || hash(Buffer.from(bytes.toString().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'))) === checked.sha256, `Non-newline mismatch with actual checked bytes: ${row.file}`);
}
assert(hash(Buffer.from(JSON.stringify(provenance.sources))) === provenance.sourceSnapshotSha256, 'Source snapshot hash differs');
const result = json('verified-preview18/verification.json'), identity = json('verified-preview18/identity-verification.json'), unit = json('verified-preview18/unit.json');
assert(result.passed && result.sourceStable && result.buildJsonSha256 === hash(read('build.json')) && result.identityVerificationSha256 === hash(read('verified-preview18/identity-verification.json')), 'Archived root verification binding differs');
assert(identity.passed && identity.buildSha256 === hash(read('build.json')) && identity.sourceSnapshotSha256 === hash(read('verified-preview18/source-after.json')), 'Archived identity snapshot binding differs');
assert(unit.success && unit.numPassedTests === 125 && unit.numTotalTests === 125 && unit.testResults.length === 18, 'Archived unit result differs');
console.log(JSON.stringify({ passed: true, sourceCommit: provenance.sourceCommit, originalBuildCommit: build.commit, buildSha256: hash(read('build.json')),
  generatorClosures: 11, generatorSourceFiles: 42, engineSourceFiles: 5, allFrozenSourceFiles: 47, frozenFilesVerified: inventory.files.length + 1,
  inventorySha256: hash(read('inventory.json')), sourceSnapshotSha256: provenance.sourceSnapshotSha256,
  rawCheckedByteMatches: provenance.sources.filter(row => row.checkedByteMatch === 'raw').length,
  newlineOnlyCheckedByteMatches: provenance.sources.filter(row => row.checkedByteMatch !== 'raw').length,
  inheritedChecksOnly: true, generatorsExecuted: false, testsExecuted: false, productBuildExecuted: false, browserExecuted: false, productionModified: false }, null, 2));
