// Prepare only until root reviews. Local preview16 -> preview17 requires archived three-device technical evidence; natural visual acceptance stays false.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const archive = 'docs/evidence/ph06-coast-scale-2026-09-28';
const round = `${archive}/raw/root/first`;
const out = '.autopilot/ph06/branching-relief-checks', receipt = '.autopilot/ph06/branching-relief-promotion.json';
const priorSha = '967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const safe = file => typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && file.split('/').every(part => part && part !== '.' && part !== '..');
const verifyRows = rows => {
  assert(Array.isArray(rows) && rows.length > 0, 'Missing checked snapshot');
  for (const row of rows) assert(safe(row.path) && /^(src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(row.path) && hash(row.path) === row.sha256, `Checked source/dist changed: ${row.path}`);
};
assert(process.argv.length === 2, 'No path arguments accepted');
assert(!fs.existsSync(`${out}/baseline-build.json`) && !fs.existsSync(receipt), 'Promotion already started; do not overwrite');
assert(!fs.existsSync(out) || fs.readdirSync(out).every(file => ['run.mjs', 'browser.mjs', 'playwright.config.ts'].includes(file) && fs.statSync(`${out}/${file}`).isFile()), 'Unexpected pre-promotion output; only the three prepared script/config files are allowed');
const previous = read(`${archive}/verification.json`), checked = read(`${round}/verification.json`);
assert(previous.archiveComplete === true && (previous.technicalPassed === true || previous.rootTechnicalPassed === true) && previous.naturalVisualAccepted === false, 'Complete preview16 technical archive is required; natural visual remains unaccepted');
if (Array.isArray(previous.pending)) assert(previous.pending.length === 0, 'Archive has pending rounds');
assert((previous.buildJsonSha256 ?? previous.binding?.buildJsonSha256) === priorSha && hash('dist/build.json') === priorSha && hash(`${round}/build.json`) === priorSha && read('dist/build.json').version === '0.5.0-preview.16', 'Exact preview16 build is required');
const archivedFiles = read(`${archive}/inventory.json`).files.map(row => ({ ...row, path: row.path ?? row.dest }));
for (const row of archivedFiles) assert(safe(row.path) && hash(`${archive}/${row.path}`) === row.sha256 && fs.statSync(`${archive}/${row.path}`).size === row.bytes, `Prior archive changed: ${row.path}`);
const browserRecords = archivedFiles.filter(row => /^raw\/browser\/[^/]+\/verification\.json$/.test(row.path)).map(row => ({ directory: row.path.slice(0, -'/verification.json'.length), result: read(`${archive}/${row.path}`) }));
const browserFinals = [];
for (const project of ['desktop-chromium', 'mobile-chromium', 'tablet-chromium']) {
  const records = browserRecords.filter(row => row.result.project === project).sort((a,b) => String(a.result.completedAt ?? a.result.startedAt ?? '').localeCompare(String(b.result.completedAt ?? b.result.startedAt ?? '')));
  assert(records.length > 0, `Missing archived browser project: ${project}`);
  const selected = records.at(-1), v = selected.result, dir = `${archive}/${selected.directory}`;
  assert(v.code === 0 && v.signal === null && Number.isFinite(v.elapsedMs) && v.sourceAndDistStable === true && v.buildSameAfter === true && v.buildJsonSha256 === priorSha && v.spec === 'tests/atlas-add-detail-coast.spec.ts' && v.retries === 0 && v.timeoutMs === 450000, `Latest ${project} is not a bound terminal technical pass`);
  assert(hash(`${dir}/build.json`) === priorSha && hash(`${dir}/before.json`) === hash(`${dir}/after.json`), `Browser source/build binding changed: ${project}`);
  verifyRows(read(`${dir}/after.json`));
  const results = read(`${dir}/results.json`);
  assert(results.stats?.expected === 1 && results.stats?.unexpected === 0 && results.stats?.flaky === 0 && results.stats?.skipped === 0 && (results.errors?.length ?? 0) === 0, `Browser report not exactly one passed workflow: ${project}`);
  browserFinals.push({ project, directory: selected.directory, verificationSha256: hash(`${dir}/verification.json`) });
}
assert(checked.passed === true && checked.sourceStable === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && checked.buildJsonSha256 === priorSha, 'Previous root checks not bound');
assert(hash(`${round}/identity-verification.json`) === checked.identityVerificationSha256, 'Prior identity receipt changed');
const identities = read(`${round}/identity-verification.json`);
assert(identities.passed === true && identities.sourceSnapshotSha256 === hash(`${round}/source-after.json`), 'Prior identity/source binding changed');
verifyRows(read(`${round}/source-after.json`)); verifyRows(checked.dist);
const expected = [
  'src/world/generation-history.ts', 'src/world/detail-preview16-history.test.ts',
  'src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts',
  'src/world/generation/detail-orography.test.ts',
].sort();
const files = [], stageIdentities = [];
for (const stage of ['v4-preview16-history-staging', 'v4-branching-relief-staging']) {
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
const relief = read('.autopilot/ph06/v4-branching-relief-staging/ready-manifest.json');
assert(Number.isInteger(relief.authoredNewTests) && relief.authoredNewTests > 0, 'Final candidate must report its new test count');
assert(Array.isArray(relief.preservedThresholdSources) && relief.preservedThresholdSources.length >= 3, 'Preserved threshold sources must be listed');
for (const row of relief.preservedThresholdSources) assert(safe(row.path) && hash(row.path) === row.sha256, `Existing test/threshold source changed: ${row.path}`);
const history = read('.autopilot/ph06/v4-preview16-history-staging/ready-manifest.json').evidence;
assert(history.source === '.autopilot/ph06/v4-preview16-history-staging/evidence/preview16' && history.target === 'docs/evidence/ph06-preview16-generator-history-2026-09-28' && !fs.existsSync(history.target), 'Unexpected/existing history destination');
assert(history.buildSha256 === priorSha && hash(`${history.source}/build.json`) === priorSha && hash(`${history.source}/inventory.json`) === history.inventorySha256 && hash(`${history.source}/provenance.json`) === history.provenanceSha256, 'Frozen preview16 history changed');
const historyFiles = [...read(`${history.source}/inventory.json`).files.map(row => ({ ...row, path: row.path ?? row.dest })), { path: 'inventory.json', sha256: history.inventorySha256, bytes: fs.statSync(`${history.source}/inventory.json`).size }];
assert(historyFiles.length === history.archiveFiles && historyFiles.length === 53 && new Set(historyFiles.map(row => row.path)).size === historyFiles.length, 'History inventory must contain 53 actual originals');
for (const row of historyFiles) assert(safe(row.path) && hash(`${history.source}/${row.path}`) === row.sha256 && fs.statSync(`${history.source}/${row.path}`).size === row.bytes, `Frozen history changed: ${row.path}`);
const pkg = read('package.json'), lock = read('package-lock.json'), attrs = fs.readFileSync('.gitattributes', 'utf8');
assert(pkg.version === '0.5.0-preview.16' && lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, 'Package versions must all be preview16');
// Every baseline and destination has been validated before the first write.
fs.mkdirSync(out, { recursive: true }); fs.copyFileSync('dist/build.json', `${out}/baseline-build.json`, fs.constants.COPYFILE_EXCL);
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
pkg.version = lock.version = lock.packages[''].version = '0.5.0-preview.17';
for (const [file, value] of [['package.json', pkg], ['package-lock.json', lock]]) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const rule = `${history.target}/** -text`;
if (!attrs.split(/\r?\n/).includes(rule)) fs.writeFileSync('.gitattributes', `${attrs}${attrs.endsWith('\n') ? '' : '\n'}${rule}\n`);
fs.writeFileSync(receipt, `${JSON.stringify({ recordedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), priorArchive: archive, priorBuildSha256: priorSha, version: pkg.version, files, stageIdentities, history, promoted: true, checksRun: [], checksStillRequired: true, priorBrowserExecuted: true, browserFinals, naturalVisualAccepted: false, phaseAccepted: false, cloudWrites: false }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ receipt, version: pkg.version, targets: files.length, historyFiles: historyFiles.length, checksRun: [] }));
