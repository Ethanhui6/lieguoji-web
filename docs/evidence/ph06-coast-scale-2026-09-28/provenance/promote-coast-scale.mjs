// Local preview15 -> preview16 only. The prior intermediate has no browser or visual acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const archive = 'docs/evidence/ph06-asymmetric-coast-2026-09-28';
const round = `${archive}/raw/root/shore-projection-fix`;
const out = '.autopilot/ph06/coast-scale-checks', receipt = '.autopilot/ph06/coast-scale-promotion.json';
const priorSha = 'ca7fe62d32063f080795512b60f9f91a01baf49852c4fb1239d368488f91052e';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const safe = file => typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && file.split('/').every(part => part && part !== '.' && part !== '..');
const verifyRows = rows => {
  assert(Array.isArray(rows) && rows.length > 0, 'Missing checked snapshot');
  for (const row of rows) assert(safe(row.path) && /^(src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(row.path) && hash(row.path) === row.sha256, `Checked source/dist changed: ${row.path}`);
};
assert(process.argv.length === 2, 'No path arguments accepted');
assert(!fs.existsSync(out) && !fs.existsSync(receipt), 'Promotion already started; do not overwrite');
const previous = read(`${archive}/verification.json`), checked = read(`${round}/verification.json`);
assert(previous.archiveComplete === true && previous.rootTechnicalPassed === true && previous.allRequiredPassed === false && previous.browserExecuted === false && previous.naturalVisualAccepted === false, 'Expected archived, technically checked but visually rejected preview15 intermediate');
assert(previous.buildJsonSha256 === priorSha && hash('dist/build.json') === priorSha && hash(`${round}/build.json`) === priorSha && read('dist/build.json').version === '0.5.0-preview.15', 'Exact preview15 build is required');
for (const row of read(`${archive}/inventory.json`).files) {
  assert(safe(row.path) && hash(`${archive}/${row.path}`) === row.sha256 && fs.statSync(`${archive}/${row.path}`).size === row.bytes, `Prior archive changed: ${row.path}`);
}
assert(checked.passed === true && checked.sourceStable === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && checked.buildJsonSha256 === priorSha, 'Previous root checks not bound');
assert(hash(`${round}/identity-verification.json`) === checked.identityVerificationSha256, 'Prior identity receipt changed');
const identities = read(`${round}/identity-verification.json`);
assert(identities.passed === true && identities.sourceSnapshotSha256 === hash(`${round}/source-after.json`), 'Prior identity/source binding changed');
verifyRows(read(`${round}/source-after.json`)); verifyRows(checked.dist);
assert(read(`${archive}/raw/root/first/verification.json`).passed === false, 'Original failed round must remain preserved');
const expected = [
  'src/world/generation-history.ts', 'src/world/detail-preview15-history.test.ts',
  'src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-natural-coast-plan.test.ts',
  'src/world/generation/detail-shape-natural.test.ts',
].sort();
const files = [], stageIdentities = [];
for (const stage of ['v4-preview15-history-staging', 'v4-coast-scale-staging']) {
  const dir = `.autopilot/ph06/${stage}`, readyPath = `${dir}/ready-manifest.json`, ready = read(readyPath);
  stageIdentities.push({ path: readyPath, sha256: hash(readyPath) });
  if (ready.readmeSha256) assert(hash(`${dir}/README.md`) === ready.readmeSha256, `Stage README changed: ${stage}`);
  for (const row of ready.files) {
    const source = `${dir}/${row.path}`;
    assert(expected.includes(row.path) && (!row.stagedPath || row.stagedPath === source), `Unexpected target: ${row.path}`);
    assert(hash(source) === row.sha256 && (fs.existsSync(row.path) ? hash(row.path) : null) === row.baselineSha256, `Candidate/baseline changed: ${row.path}`);
    files.push({ source, target: row.path, beforeSha256: row.baselineSha256, afterSha256: row.sha256 });
  }
}
assert(files.length === 5 && JSON.stringify(files.map(row => row.target).sort()) === JSON.stringify(expected), 'Five unique targets required');
const scale = read('.autopilot/ph06/v4-coast-scale-staging/ready-manifest.json'), kernel = scale.requiredProjectedRoughnessKernel;
assert(kernel.path === 'src/world/generation/detail-shape-natural.ts' && kernel.sha256 === '11259248bec27fbed7aa13eafb6d1950817dbee1314a61fd36be7371b69b6e63' && hash(kernel.path) === kernel.sha256, 'Preserve the checked shoreline-projection repair');
assert(scale.preservedPlanTests === 8 && scale.preservedActualKernelTests + scale.authoredAdditionalActualKernelTests === 13, 'Unexpected candidate test scope');
const history = read('.autopilot/ph06/v4-preview15-history-staging/ready-manifest.json').evidence;
assert(history.source === '.autopilot/ph06/v4-preview15-history-staging/evidence/preview15' && history.target === 'docs/evidence/ph06-preview15-generator-history-2026-09-28' && !fs.existsSync(history.target), 'Unexpected/existing history destination');
assert(history.buildSha256 === priorSha && hash(`${history.source}/build.json`) === priorSha && hash(`${history.source}/inventory.json`) === history.inventorySha256 && hash(`${history.source}/provenance.json`) === history.provenanceSha256, 'Frozen preview15 history changed');
const historyFiles = [...read(`${history.source}/inventory.json`).files.map(row => ({ ...row, path: row.path ?? row.dest })), { path: 'inventory.json', sha256: history.inventorySha256, bytes: fs.statSync(`${history.source}/inventory.json`).size }];
assert(historyFiles.length === history.archiveFiles && historyFiles.length === 55 && new Set(historyFiles.map(row => row.path)).size === historyFiles.length, 'History inventory must contain 55 actual originals');
for (const row of historyFiles) assert(safe(row.path) && hash(`${history.source}/${row.path}`) === row.sha256 && fs.statSync(`${history.source}/${row.path}`).size === row.bytes, `Frozen history changed: ${row.path}`);
const pkg = read('package.json'), lock = read('package-lock.json'), attrs = fs.readFileSync('.gitattributes', 'utf8');
assert(pkg.version === '0.5.0-preview.15' && lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, 'Package versions must all be preview15');
// Every baseline and destination has been validated before the first write.
fs.mkdirSync(out); fs.copyFileSync('dist/build.json', `${out}/baseline-build.json`, fs.constants.COPYFILE_EXCL);
fs.mkdirSync(history.target);
for (const row of historyFiles) {
  const target = `${history.target}/${row.path}`; fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(`${history.source}/${row.path}`, target, fs.constants.COPYFILE_EXCL);
  assert(hash(target) === row.sha256, `History copy mismatch: ${row.path}`);
}
for (const row of files) {
  assert(hash(row.source) === row.afterSha256 && (fs.existsSync(row.target) ? hash(row.target) : null) === row.beforeSha256, `Concurrent change: ${row.target}`);
  fs.copyFileSync(row.source, row.target, row.beforeSha256 === null ? fs.constants.COPYFILE_EXCL : 0);
  assert(hash(row.target) === row.afterSha256, `Promotion copy mismatch: ${row.target}`);
}
pkg.version = lock.version = lock.packages[''].version = '0.5.0-preview.16';
for (const [file, value] of [['package.json', pkg], ['package-lock.json', lock]]) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const rule = `${history.target}/** -text`;
if (!attrs.split(/\r?\n/).includes(rule)) fs.writeFileSync('.gitattributes', `${attrs}${attrs.endsWith('\n') ? '' : '\n'}${rule}\n`);
fs.writeFileSync(receipt, `${JSON.stringify({ recordedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), priorArchive: archive, priorBuildSha256: priorSha, version: pkg.version, files, stageIdentities, history, promoted: true, checksRun: [], checksStillRequired: true, priorBrowserExecuted: false, naturalVisualAccepted: false, phaseAccepted: false, cloudWrites: false }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ receipt, version: pkg.version, targets: files.length, historyFiles: historyFiles.length, checksRun: [] }));
