// Explicit browser name/project/root round; no guessed preview18 build or test count.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const batch = '.autopilot/ph06/fine-belt-checks';
const [name, project, rootRound] = process.argv.slice(2);
if (process.argv.length !== 5 || !/^[a-z0-9-]+$/.test(name ?? '') || !/^[a-z0-9-]+$/.test(rootRound ?? '') || !['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].includes(project)) throw new Error('Usage: node browser.mjs <unique-name> <project> <successful-root-round>');
const checkedRound = `${batch}/${rootRound}`, out = path.resolve(batch, name), spec = 'tests/atlas-add-detail-coast.spec.ts';
if (fs.existsSync(out)) throw new Error('Evidence round exists; refusing overwrite');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const check = (ok, why) => { if (!ok) throw new Error(why); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source/dist symlink: ${dir}/${entry.name}`);
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : [{ path: file, sha256: hash(file) }];
  });
}
const sourceSnapshot = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(file => ({ path: file, sha256: hash(file) }))];
const normalized = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
const checked = read(`${checkedRound}/verification.json`), identity = read(`${checkedRound}/identity-verification.json`), build = read('dist/build.json');
const rootVerificationSha256 = hash(`${checkedRound}/verification.json`), identityVerificationSha256 = hash(`${checkedRound}/identity-verification.json`), sourceSnapshotSha256 = hash(`${checkedRound}/source-after.json`), buildJsonSha256 = hash('dist/build.json'), specSha256 = hash(spec);
check(checked.passed === true && checked.sourceStable === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && checked.unit?.passed === true, 'Selected root round must actually pass');
check(same(checked.results?.map(row => row.name), ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit']) && checked.results.every(row => row.exitCode === 0 && row.signal === null), 'All six root commands must have terminal success');
const rawUnit = read(`${checkedRound}/unit.json`), assertions = (rawUnit.testResults ?? []).flatMap(row => row.assertionResults ?? []);
check(rawUnit.success === true && rawUnit.numTotalTests > 0 && rawUnit.numTotalTests === checked.unit.total && rawUnit.numPassedTests === rawUnit.numTotalTests && rawUnit.numFailedTests === 0 && rawUnit.numPendingTests === 0 && rawUnit.numFailedTestSuites === 0 && assertions.length === rawUnit.numTotalTests && assertions.every(row => row.status === 'passed'), 'Actual root unit report does not confirm its receipt');
check(build.version === '0.5.0-preview.18' && checked.buildJsonSha256 === buildJsonSha256 && hash(`${checkedRound}/build.json`) === buildJsonSha256, 'Current dist must be the selected checked preview18 build');
check(checked.identityVerificationSha256 === identityVerificationSha256 && identity.passed === true && identity.sourceStable === true && identity.buildSha256 === buildJsonSha256 && identity.sourceSnapshotSha256 === sourceSnapshotSha256 && identity.engineUnchanged === true, 'Root identity/source/build binding mismatch');
check(hash(`${checkedRound}/source-before.json`) === sourceSnapshotSha256, 'Root source changed during its checks');
const currentSource = sourceSnapshot(), currentDist = walk('dist');
check(same(normalized(currentSource), normalized(read(`${checkedRound}/source-after.json`))) && same(normalized(currentDist), normalized(checked.dist)), 'Current complete source/dist differs from checked root');
// Independently recompute actual runtime imports, including the newly added helper.
const toolFile = 'scripts/generator-fingerprint.ts';
const compiled = ts.transpileModule(fs.readFileSync(toolFile, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace("from 'typescript'", `from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/typescript/lib/typescript.js')).href)}`);
const tool = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const entries = [
  ['macroGenerator', 'fingerprintMacroGenerator'], ['landformGenerator', 'fingerprintLandformGenerator'],
  ['islandGenerator', 'fingerprintIslandGenerator'], ['coastGenerator', 'fingerprintCoastGenerator'],
  ['shapeGenerator', 'fingerprintShapeGenerator'], ['oceanGenerator', 'fingerprintOceanGenerator'],
  ['detailShapeGenerator', 'fingerprintDetailShapeGenerator'], ['addDetailGenerator', 'fingerprintAddDetailGenerator'],
  ['naturalDetailGenerator', 'fingerprintNaturalDetailGenerator'], ['addNaturalDetailGenerator', 'fingerprintAddNaturalDetailGenerator'],
  ['localDetailReliefGenerator', 'fingerprintLocalDetailReliefGenerator'],
];
const keys = entries.map(([key]) => key).sort();
check(same(keys, Object.keys(build).filter(key => key.endsWith('Generator')).sort()) && same(keys, identity.checks.map(row => row.key).sort()), 'Complete eleven-generator registry required');
for (const [key, fn] of entries) {
  const actual = tool[fn](), recorded = identity.checks.find(row => row.key === key);
  check(same(actual, build[key]) && same(actual, recorded.actual) && recorded.currentMatchesBuild === true && recorded.frozenMatchesPrior === true, `Actual closure differs from checked identity: ${key}`);
}
for (const key of ['naturalDetailGenerator', 'addNaturalDetailGenerator', 'localDetailReliefGenerator']) check(build[key].files.includes('src/world/generation/detail-orography.ts'), `New helper absent from actual closure: ${key}`);
const configFiles = ['playwright.config.ts', `${batch}/playwright.config.ts`, `${batch}/browser.mjs`];
const snapshot = () => [...sourceSnapshot(), ...walk('dist'), ...configFiles.map(file => ({ path: file, sha256: hash(file) }))];
const before = snapshot();
check(same(normalized(sourceSnapshot()), normalized(currentSource)) && same(normalized(walk('dist')), normalized(currentDist)), 'Source/dist changed during binding');
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
const after = snapshot(), sourceAndDistStable = same(before, after), buildSameAfter = hash('dist/build.json') === buildJsonSha256;
const rootReceiptStable = hash(`${checkedRound}/verification.json`) === rootVerificationSha256 && hash(`${checkedRound}/identity-verification.json`) === identityVerificationSha256 && hash(`${checkedRound}/source-after.json`) === sourceSnapshotSha256;
const artifacts = `${batch}/${name}/artifacts`, traces = fs.existsSync(artifacts) ? walk(artifacts).filter(row => row.path.endsWith('/trace.zip')) : [];
let reportPassed = false;
if (fs.existsSync(path.join(out, 'results.json'))) {
  const report = read(path.join(out, 'results.json'));
  reportPassed = report.stats?.expected === 1 && report.stats?.unexpected === 0 && report.stats?.flaky === 0 && report.stats?.skipped === 0 && (report.errors?.length ?? 0) === 0;
}
const passed = exit.code === 0 && exit.signal === null && sourceAndDistStable && buildSameAfter && rootReceiptStable && reportPassed && traces.length > 0;
fs.writeFileSync(path.join(out, 'after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ name, project, rootRound, checkedRound, args, ...exit, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - start,
  passed, sourceAndDistStable, buildJsonSha256, buildSameAfter, rootReceiptStable, rootVerificationSha256, identityVerificationSha256, sourceSnapshotSha256, actualRootAssertions: rawUnit.numTotalTests, actualClosuresRecomputed: entries.length,
  spec, specSha256, reportPassed, timeoutMs: 450000, retries: 0, traceMode: 'on', traces, observationOverhead: 'Trace is enabled on successful and failed runs. These timings include tracing overhead and do not establish whole-product performance acceptance.',
  physicalDevice: false, naturalVisualAccepted: false, userAccepted: false, phaseAccepted: false, performanceAccepted: false, cloudWrites: false }, null, 2), { flag: 'wx' });
process.exitCode = passed ? 0 : exit.code || 1;
