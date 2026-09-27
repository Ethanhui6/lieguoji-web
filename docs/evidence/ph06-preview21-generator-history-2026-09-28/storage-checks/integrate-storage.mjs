// Source-provenance/storage wiring only. Does not run generation or checks.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const stage = '.autopilot/ph06/v4-preview21-history-staging';
const target = 'docs/evidence/ph06-preview21-generator-history-2026-09-28';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file);
const json = file => JSON.parse(read(file).toString());
const assert = (ok, why) => { if (!ok) throw Error(why); };
assert(hash(read(`${stage}/ready-manifest.json`)) === '80579d5ed0999eabd05e0bb3ae49617c58c126928979ca1dee94add884f1176c', 'Frozen preview21 readiness bytes changed');
const ready = json(`${stage}/ready-manifest.json`);
for (const row of ready.files) assert(hash(read(`${stage}/${row.path}`)) === row.sha256, `Frozen supporting file changed: ${row.path}`);
const origin = `${stage}/evidence/preview21`, inventory = json(`${origin}/inventory.json`), provenance = json(`${origin}/provenance.json`), build = json(`${origin}/build.json`);
assert(provenance.closures.length === 11 && build.version === '0.5.0-preview.21', 'Incomplete actual21 namespaces');
assert(!fs.existsSync(target), 'Preserve existing archive; refusing overwrite');
const historyFile = 'src/world/generation-history.ts', attributesFile = '.gitattributes';
const historyBefore = read(historyFile), attributesBefore = read(attributesFile);
let history = historyBefore.toString();
const additions = [];
for (const row of provenance.closures) {
  assert(row.sha256 === build[row.key].sha256 && /^[0-9a-f]{64}$/.test(row.sha256), `Actual build identity mismatch: ${row.key}`);
  const marker = `  ${row.historyKey === 'landforms' ? row.historyKey : `'${row.historyKey}'`}: Object.freeze([`;
  const line = history.split('\n').find(value => value.includes(marker));
  assert(line && !line.includes(`'${row.sha256}'`), `Namespace missing/already changed: ${row.historyKey}`);
  history = history.replace(marker, `${marker}'${row.sha256}', `);
  additions.push({ namespace: row.historyKey, fingerprint: row.sha256, buildKey: row.key });
}
history = `/** Preview.21: 11 actual build identities from 42 frozen generator sources.\n * ${target}/.\n * Source commit 31e27620c816db33993a8ac419274c9a86c32624; original build base 502164889fef2f0280b725c76538cd07df7d5e36 is preserved.\n * Storage compatibility only. v1, natural id@2 and local-relief remain isolated; never execute old recipes. */\n${history}`;
const rawRule = `${target}/** -text`;
assert(!attributesBefore.toString().includes(rawRule), 'Raw evidence rule already exists');
const attributes = attributesBefore.toString() + (attributesBefore.toString().endsWith('\n') ? '' : '\n') + rawRule + '\n';
const copied = [];
function copy(source, dest, expectedSha) {
  const bytes = read(source); assert(hash(bytes) === expectedSha, `Original byte changed: ${source}`);
  const full = `${target}/${dest}`; fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, bytes, { flag: 'wx' });
  assert(hash(read(full)) === expectedSha, `Copy byte mismatch: ${dest}`);
  copied.push({ path: dest, source, bytes: bytes.length, sha256: expectedSha });
}
for (const row of inventory.files) { assert(!row.path.includes('..') && !path.isAbsolute(row.path), 'Unsafe archive path'); copy(`${origin}/${row.path}`, row.path, row.sha256); }
copy(`${origin}/inventory.json`, 'inventory.json', '2263e70dcb87e53b137af91674e6a75a2e8e2a5f3a1caa68f47c8de219539a7f');
for (const name of ['ready-manifest.json', 'capture.mjs', 'verify.mjs', 'capture-result.json', 'self-check.json', 'README.md']) copy(`${stage}/${name}`, `capture/${name}`, hash(read(`${stage}/${name}`)));
assert(historyBefore.equals(read(historyFile)) && attributesBefore.equals(read(attributesFile)), 'Owned target changed during copy');
fs.mkdirSync(`${stage}/storage-integration`, { recursive: true });
fs.writeFileSync(`${stage}/storage-integration/history-before.ts`, historyBefore, { flag: 'wx' });
fs.writeFileSync(`${stage}/storage-integration/attributes-before`, attributesBefore, { flag: 'wx' });
fs.writeFileSync(historyFile, history); fs.writeFileSync(attributesFile, attributes);
fs.writeFileSync(`${target}/storage-integration-candidate.json`, JSON.stringify({ recordedAt: new Date().toISOString(), status: 'authored-awaiting-scoped-history-checks',
  preservedSourceCommit: provenance.sourceCommit, originalBuildSha256: ready.originalBuildSha256, frozenReadySha256: hash(read(`${stage}/ready-manifest.json`)),
  actual21ClosureCount: 11, additions, historyFile, historyBeforeSha256: hash(historyBefore), historyAfterSha256: hash(read(historyFile)),
  attributesFile, attributesBeforeSha256: hash(attributesBefore), attributesAfterSha256: hash(read(attributesFile)), originalEvidenceByteCopiesVerified: true,
  newTest: 'src/world/generation-preview21-history.test.ts', testsExecuted: false, productBuildExecuted: false, browserExecuted: false, nextProductVersionPassed: false,
  note: 'Whitelist entries are storage-only. Archived149 checks describe preview21; this storage integration is untested until its own checks and the parent product checks run.' }, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(`${target}/copied-files.json`, JSON.stringify({ originalFrozenPackagePreserved: true, originalEvidenceFiles: 78, supportingCaptureFiles: 6, files: copied }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ target, copiedOriginals: copied.length, storageAdditions: additions.length, historyBefore: hash(historyBefore), historyAfter: hash(read(historyFile)), testsRun: false }));
