import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const [name, project, checkRound] = process.argv.slice(2);
if (![name, checkRound].every(value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value)) || !['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].includes(project)) throw Error('Usage: node .autopilot/ph06/fine-world-browser/run.mjs <fresh-run> <desktop-chromium|mobile-chromium|tablet-chromium> <passed-flow-checks-round>');
const base = '.autopilot/ph06/fine-world-browser', out = path.resolve(base, name), check = `.autopilot/ph06/fine-world-checks/${checkRound}`;
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex'), read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => { const file = `${dir}/${entry.name}`; if (entry.isSymbolicLink()) throw Error('Source symlink'); return entry.isDirectory() ? walk(file) : [{ path: file, sha256: hash(file) }]; });
const ordered = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
const source = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(path => ({ path, sha256: hash(path) }))];
const baseline = read(`${check}/verification.json`), baselineSource = read(`${check}/source-after.json`);
if (baseline.passed !== true || baseline.sourceStable !== true || baseline.unit?.passed !== true || !baseline.dist?.length || !/^[a-f0-9]{64}$/.test(baseline.buildJsonSha256 ?? '')) throw Error('Selected round did not finish actual frozen-source unit/build/dist checks');
if (hash('dist/build.json') !== baseline.buildJsonSha256 || hash(`${check}/build.json`) !== baseline.buildJsonSha256) throw Error('Current dist build is not the passed round build');
const beforeSource = source(), beforeDist = walk('dist');
const served = await fetch('http://127.0.0.1:4173/build.json', { cache: 'no-store' });
if (!served.ok || createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex') !== baseline.buildJsonSha256) throw Error('Local server is not serving the passed actual build');
if (JSON.stringify(ordered(beforeSource)) !== JSON.stringify(ordered(baselineSource)) || JSON.stringify(ordered(beforeDist)) !== JSON.stringify(ordered(baseline.dist))) throw Error('Production source/tests/scripts or dist changed since the passed unified round; run the affected checks before GPU acceptance');
if (fs.existsSync(out)) throw Error('Evidence label already exists; preserve failed runs'); fs.mkdirSync(out, { recursive: true });
const runnerFiles = [`${base}/run.mjs`, `${base}/playwright.config.ts`, 'playwright.config.ts'];
const runSources = () => runnerFiles.map(path => ({ path, sha256: hash(path) }));
const before = { source: beforeSource, dist: beforeDist, runner: runSources(), checkVerificationSha256: hash(`${check}/verification.json`), checkSourceSha256: hash(`${check}/source-after.json`) };
const save = (file, value) => fs.writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + '\n'); save('before.json', before);
fs.copyFileSync('dist/build.json', path.join(out, 'build.json'));
fs.copyFileSync(`${check}/verification.json`, path.join(out, 'prerequisite-verification.json'));
fs.copyFileSync('tests/atlas-add-detail-coast.spec.ts', path.join(out, 'atlas-add-detail-coast.spec.ts'));
for (const file of runnerFiles) fs.copyFileSync(file, path.join(out, file === 'playwright.config.ts' ? 'base-playwright.config.ts' : path.basename(file)));
const args = ['node_modules/@playwright/test/cli.js', 'test', `--config=${base}/playwright.config.ts`, `--project=${project}`], startedAt = new Date().toISOString(), start = performance.now();
const log = fs.createWriteStream(path.join(out, 'run.log'));
const child = spawn(process.execPath, args, { env: { ...process.env, FINE_WORLD_BROWSER_RUN: name, FINE_WORLD_EXPECTED_BUILD_SHA256: baseline.buildJsonSha256 }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); }); child.stderr.on('data', bytes => { log.write(bytes); process.stderr.write(bytes); });
const exit = await new Promise(resolve => { child.once('error', error => resolve({ code: null, signal: null, spawnError: String(error) })); child.once('exit', (code, signal) => resolve({ code, signal })); });
await new Promise(resolve => log.end(resolve));
const after = { source: source(), dist: walk('dist'), runner: runSources(), checkVerificationSha256: hash(`${check}/verification.json`), checkSourceSha256: hash(`${check}/source-after.json`) }; save('after.json', after);
const stable = JSON.stringify(before) === JSON.stringify(after);
let observed = null;
if (fs.existsSync(path.join(out, 'results.json'))) {
  const report = read(path.join(out, 'results.json'));
  const collect = suites => suites.flatMap(suite => [...(suite.specs ?? []), ...collect(suite.suites ?? [])]);
  const specs = collect(report.suites ?? []), cases = specs.flatMap(spec => (spec.tests ?? []).map(test => ({ file: spec.file, title: spec.title, project: test.projectName, status: test.status, results: (test.results ?? []).map(result => ({ status: result.status, retry: result.retry, duration: result.duration })) })));
  observed = { stats: report.stats, errors: report.errors, cases };
}
const casePassed = observed?.cases.length === 1 && observed.cases.every(c => c.file?.replaceAll('\\', '/').endsWith('atlas-add-detail-coast.spec.ts') && c.title.startsWith('[detail-v4-add]') && c.project === project && c.status === 'expected' && c.results.length === 1 && c.results[0].status === 'passed' && c.results[0].retry === 0);
const passed = exit.code === 0 && stable && casePassed && observed.stats?.expected === 1 && observed.stats?.unexpected === 0 && observed.stats?.skipped === 0 && observed.stats?.flaky === 0 && !observed.errors?.length;
const verification = { name, project, checkRound, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - start, args, ...exit, passed, sourceAndDistStable: stable,
  prerequisiteBuildJsonSha256: baseline.buildJsonSha256, build: read('dist/build.json'), observed, timeoutMs: 450000, retries: 0,
  physicalDevice: false, cloudWrites: false, scope: 'Actual native drawing of two continents, original field preservation, undo, persistence/reload, close coast picking and mid/near mountain observations. Browser emulation only, no subjective visual or device acceptance' };
save('verification.json', verification); console.log(JSON.stringify({ name, project, checkRound, passed, sourceAndDistStable: stable, elapsedMs: verification.elapsedMs })); process.exitCode = passed ? 0 : 1;
