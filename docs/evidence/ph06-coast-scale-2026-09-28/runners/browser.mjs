// Actual natural-v2 additive workflow; fixed preview16 build, original 450s test and zero retries.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(root);
const batch = '.autopilot/ph06/coast-scale-checks', checkedRound = `${batch}/first`;
const expectedBuildSha256 = '967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499';
const name = process.argv[2] ?? 'desktop-first', project = process.argv[3] ?? 'desktop-chromium';
if (process.argv.length > 4 || !/^[a-z0-9-]+$/.test(name) || !['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].includes(project)) throw new Error('Invalid evidence round/project');
const out = path.resolve(batch, name);
if (fs.existsSync(out)) throw new Error('Evidence round exists; refusing overwrite');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const check = (ok, why) => { if (!ok) throw new Error(why); };
const checked = read(`${checkedRound}/verification.json`), identity = read(`${checkedRound}/identity-verification.json`);
check(hash(`${checkedRound}/verification.json`) === 'd71210e13ece008cd29874788ba00d052e4dd243c6419f25984350cc13251d68', 'Checked root receipt changed');
check(checked.passed === true && checked.sourceStable === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && checked.unit?.total === 53 && checked.unit?.passed === true, 'Root technical checks must pass first');
check(read('dist/build.json').version === '0.5.0-preview.16' && hash('dist/build.json') === expectedBuildSha256 && hash(`${checkedRound}/build.json`) === expectedBuildSha256 && checked.buildJsonSha256 === expectedBuildSha256, 'Exact checked preview16 build required');
check(hash(`${checkedRound}/identity-verification.json`) === checked.identityVerificationSha256 && identity.passed === true && hash(`${checkedRound}/source-after.json`) === identity.sourceSnapshotSha256, 'Root identity/source receipt mismatch');
for (const row of [...read(`${checkedRound}/source-after.json`), ...checked.dist]) {
  check(typeof row.path === 'string' && !path.isAbsolute(row.path) && !row.path.includes('\\') && !row.path.split('/').includes('..') && hash(row.path) === row.sha256, `Checked source/dist changed: ${row.path}`);
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source/dist symlink: ${dir}/${entry.name}`);
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : [{ path: file, sha256: hash(file) }];
  });
}
const snapshot = () => [...walk('src'), ...walk('tests'), ...walk('dist')];
const before = snapshot(), buildJsonSha256 = hash('dist/build.json');
fs.mkdirSync(out);
fs.writeFileSync(path.join(out, 'before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
fs.copyFileSync('dist/build.json', path.join(out, 'build.json'), fs.constants.COPYFILE_EXCL);
const args = ['node_modules/@playwright/test/cli.js', 'test', `--config=${batch}/playwright.config.ts`, `--project=${project}`];
const startedAt = new Date().toISOString(), start = performance.now(), log = fs.createWriteStream(path.join(out, 'run.log'), { flags: 'wx' });
const child = spawn(process.execPath, args, { env: { ...process.env, NATURAL_BROWSER_RUN: name }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', value => { log.write(value); process.stdout.write(value); });
child.stderr.on('data', value => { log.write(value); process.stderr.write(value); });
const exit = await new Promise(resolve => {
  child.once('error', error => resolve({ code: null, signal: null, error: error.message }));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
await new Promise(resolve => log.end(resolve));
const after = snapshot(), sourceAndDistStable = JSON.stringify(before) === JSON.stringify(after);
const buildSameAfter = hash('dist/build.json') === buildJsonSha256;
fs.writeFileSync(path.join(out, 'after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ name, project, args, ...exit, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - start,
  sourceAndDistStable, buildJsonSha256, buildSameAfter, checkedRound, rootVerificationSha256: hash(`${checkedRound}/verification.json`), spec: 'tests/atlas-add-detail-coast.spec.ts',
  timeoutMs: 450000, retries: 0, physicalDevice: false, naturalVisualAccepted: false, userAccepted: false, phaseAccepted: false, performanceAccepted: false, cloudWrites: false }, null, 2), { flag: 'wx' });
process.exitCode = exit.code === 0 && sourceAndDistStable && buildSameAfter ? 0 : exit.code || 1;
