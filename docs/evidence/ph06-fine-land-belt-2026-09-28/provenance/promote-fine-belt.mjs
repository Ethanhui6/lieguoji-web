import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const check = (ok, why) => { if (!ok) throw new Error(why); };
const orography = '.autopilot/ph06/v4-orography-visual-fix-staging', writer = '.autopilot/ph06/height-plane-diagnostic/writer-staging', ui = '.autopilot/ph06/v4-map-chrome-staging', combined = '.autopilot/ph06/v4-fine-belt-staging';
const receipt = '.autopilot/ph06/fine-belt-promotion.json', batch = '.autopilot/ph06/fine-belt-checks';
check(!fs.existsSync(receipt), 'Already promoted');
const buildSha = 'c96ba4db34112dd6d3c23a8d5b103847d2c7d0b84701481b636fc9515f1f3b0e';
check(hash('dist/build.json') === buildSha && read('dist/build.json').version === '0.5.0-preview.17', 'Actual preview17 build required');
const comparison = read(`${writer}/checks/defines-fixed/verification.json`), regression = read(`${writer}/checks/regression/verification.json`), together = read(`${combined}/checks/combined-first/verification.json`);
check(comparison.passed && regression.passed && together.passed && together.unit.total === 21 && together.sourceUnchanged && together.loadedCandidateHashes, 'Exact isolated checks required');
const files = [...read(`${orography}/ready-manifest.json`).files, ...read(`${writer}/ready-manifest.json`).targets,
  ...read(`${ui}/baseline.json`).sources.map(r => ({ target: r.path, candidate: `${ui}/candidate/${r.path}`, baselineSha256: r.sha256, candidateSha256: hash(`${ui}/candidate/${r.path}`) }))];
check(files.length === 7 && new Set(files.map(r => r.target)).size === 7, 'Seven unique targets required');
const checkedCombined = read(`${combined}/checks/combined-first/source-after.json`);
for (const row of files) {
  check(hash(row.candidate) === row.candidateSha256 && (fs.existsSync(row.target) ? hash(row.target) : null) === row.baselineSha256, `Source/baseline changed: ${row.target}`);
  if (!row.target.endsWith('.test.ts') && row.target.startsWith('src/world/generation/')) {
    const checked = checkedCombined.find(r => r.path === `${combined}/${row.target}`);
    check(checked?.sha256 === row.candidateSha256, `Combined source differs: ${row.target}`);
  }
}
const pkg = read('package.json'), lock = read('package-lock.json');
check(pkg.version === '0.5.0-preview.17' && lock.version === pkg.version && lock.packages[''].version === pkg.version, 'Package baseline changed');
// Frozen history is copied and verified before changing any generating source.
execFileSync(process.execPath, ['.autopilot/ph06/promote-preview17-history.mjs'], { stdio: 'inherit', windowsHide: true });
fs.mkdirSync(batch, { recursive: true }); fs.copyFileSync('dist/build.json', `${batch}/baseline-build.json`, fs.constants.COPYFILE_EXCL);
for (const row of files) {
  let bytes = fs.readFileSync(row.candidate);
  if (row.target.startsWith('src/editor/')) bytes = Buffer.from(bytes.toString('utf8').replaceAll('map-first-staging', 'map-first').replace('STAGING ONLY — map chrome candidate based on 72fd7659.', 'Unified map tools and compact durable feedback.'));
  fs.mkdirSync(path.dirname(row.target), { recursive: true }); fs.writeFileSync(row.target, bytes, row.baselineSha256 === null ? { flag: 'wx' } : undefined);
  row.promotedSha256 = hash(row.target);
}
pkg.version = lock.version = lock.packages[''].version = '0.5.0-preview.18';
for (const [file, value] of [['package.json', pkg], ['package-lock.json', lock]]) fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const report = { time: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), version: pkg.version, priorBuildSha256: buildSha, files,
  decision: 'Root inspected the actual combined numeric PNG. Fine elevations preserve actual relief and improve continuous branches; two broad rounded peaks remain. Integrate locally to verify the real renderer and interactions. This is not natural visual or phase acceptance and does not override release policy.',
  combinedVerificationSha256: hash(`${combined}/checks/combined-first/verification.json`), actualImageSha256: hash(`${combined}/checks/combined-first/actual-256-height-field.png`),
  writerOriginalComparisonSha256: hash(`${writer}/checks/defines-fixed/verification.json`), checksRequired: true, browserExecuted: false, naturalVisualAccepted: false, phaseAccepted: false, cloudWrites: false };
fs.writeFileSync(receipt, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ receipt, sourceTargets: files.length + 2, historyFiles: 73, version: pkg.version, cloudWrites: false }));
