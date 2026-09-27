// Bind actual scoped checks to this integration without modifying frozen preview21.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const stage = '.autopilot/ph06/v4-preview21-history-staging';
const target = 'docs/evidence/ph06-preview21-generator-history-2026-09-28';
const read = file => fs.readFileSync(file);
const json = file => JSON.parse(read(file).toString());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const frozenReadySha256 = '80579d5ed0999eabd05e0bb3ae49617c58c126928979ca1dee94add884f1176c';
assert(hash(read(`${stage}/ready-manifest.json`)) === frozenReadySha256, 'Original frozen ready changed');
const checks = json(`${target}/storage-checks/first/verification.json`), snapshot = json(`${target}/storage-checks/first/source-after.json`);
assert(checks.passed && checks.sourceStable && checks.unit.total === 5 && checks.unit.passed === 5, 'Scoped checks have not passed');
for (const row of snapshot) assert(hash(read(row.path)) === row.sha256, `Checked source has changed: ${row.path}`);
const candidate = json(`${target}/storage-integration-candidate.json`), provenance = json(`${target}/provenance.json`), build = json(`${target}/build.json`);
const history = read('src/world/generation-history.ts').toString(), before = read(`${stage}/storage-integration/history-before.ts`).toString();
assert(history.startsWith('/** Preview.21:'), 'Unexpected integration header');
let revertedAdditions = history.slice(history.indexOf('*/\n') + 3);
for (const row of provenance.closures) {
  assert(row.sha256 === build[row.key].sha256, `Actual build mismatch: ${row.key}`);
  const marker = `  ${row.historyKey === 'landforms' ? row.historyKey : `'${row.historyKey}'`}: Object.freeze([`;
  const added = `${marker}'${row.sha256}', `;
  assert(revertedAdditions.includes(added), `Expected isolated history entry absent: ${row.historyKey}`);
  revertedAdditions = revertedAdditions.replace(added, marker);
}
assert(revertedAdditions === before, 'Existing history content was changed');
const attributesBefore = read(`${stage}/storage-integration/attributes-before`).toString();
assert(read('.gitattributes').toString() === attributesBefore + (attributesBefore.endsWith('\n') ? '' : '\n') + `${target}/** -text\n`, 'Unrelated attributes changed');
for (const name of ['integrate-storage.mjs', 'check-storage.mjs', 'finalize-storage.mjs']) {
  fs.writeFileSync(`${target}/storage-checks/${name}`, read(`${stage}/${name}`), { flag: 'wx' });
}
const integration = {
  recordedAt: new Date().toISOString(), status: 'scoped-storage-history-passed-awaiting-parent-product-integration',
  originalSourceCommit: provenance.sourceCommit, originalBuildCommit: build.commit, originalBuildSha256: hash(read(`${target}/build.json`)), frozenReadySha256,
  additions: candidate.additions, sourceFiles: snapshot, allExistingHistoryPreserved: true, historyScope: 'storage/read only; execution and namespace guards unchanged',
  checks: { path: `${target}/storage-checks/first/verification.json`, sha256: hash(read(`${target}/storage-checks/first/verification.json`)),
    lint: true, types: true, unit: checks.unit, firstAttemptPassed: true },
  originalFrozenFilesPreserved: true, originalPreview21MetadataUnchanged: true,
  fullProductChecksRun: false, buildRun: false, browserRun: false, committed: false,
  naturalVisualAccepted: false, physicalDeviceAccepted: false, phaseAccepted: false,
};
save(`${target}/storage-integration-verification.json`, integration);
const files = [];
function walk(dir = '') {
  for (const entry of fs.readdirSync(path.join(target, dir), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected archive link');
    const file = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(file);
    else { const bytes = read(path.join(target, file)); files.push({ path: file, bytes: bytes.length, sha256: hash(bytes) }); }
  }
}
walk(); files.sort((a, b) => a.path.localeCompare(b.path));
save(`${target}/storage-integration-files.sha256.json`, { excludesSelf: true, files });
save(`${stage}/storage-integration-ready.json`, { ...integration,
  archive: { path: target, files: files.length + 1, inventorySha256: hash(read(`${target}/storage-integration-files.sha256.json`)), verificationSha256: hash(read(`${target}/storage-integration-verification.json`)) },
  scripts: ['integrate-storage.mjs', 'check-storage.mjs', 'finalize-storage.mjs'].map(file => ({ path: `${stage}/${file}`, sha256: hash(read(`${stage}/${file}`)) })),
});
console.log(JSON.stringify({ status: integration.status, archiveFiles: files.length + 1,
  readySha256: hash(read(`${stage}/storage-integration-ready.json`)), historySha256: snapshot[0].sha256, testSha256: snapshot[1].sha256,
  allExistingHistoryPreserved: true, unitPassed: 5 }));
