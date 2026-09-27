import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/ocean-material-staging'), round = process.argv[2];
if (!round || !/^[a-z0-9-]+$/.test(round)) throw Error('Use a fresh evidence round name');
const output = path.join(staging, 'checks', round);
if (fs.existsSync(output)) throw Error('Preserve existing evidence round');
fs.mkdirSync(output, { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const copy = (file, destination) => { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL); };
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.isDirectory() && ['checks', '.vite-cache', 'node_modules'].includes(entry.name)) return [];
  const file = path.join(directory, entry.name); return entry.isDirectory() ? walk(file) : [file];
});
const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'ready-manifest.json'), 'utf8'));
const changed = new Set(manifest.candidates), overlayRead = file => fs.readFileSync(path.join(changed.has(file) ? staging : root, file), 'utf8');
const stagedSources = () => walk(staging).map(file => ({ file: path.relative(staging, file).replaceAll('\\', '/'), sha256: hash(file) })).sort((a, b) => a.file.localeCompare(b.file));
const before = stagedSources(); save('source-before.json', before);
for (const source of before) copy(path.join(staging, source.file), path.join(output, 'staged-sources', source.file));
const compile = async name => {
  const input = path.join(root, `scripts/${name}.ts`), target = path.join(output, `${name}.mjs`);
  copy(input, path.join(output, 'tools', `${name}.ts`));
  fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(input, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  return import(pathToFileURL(target));
};
const generator = await compile('generator-fingerprint'), engine = await compile('engine-fingerprint');
function identities(read) {
  const generators = Object.fromEntries(Object.entries(generator).filter(([name]) => name.startsWith('fingerprint')).map(([name, fn]) => [name, fn(read)]));
  return { generators, engine: { sha256: engine.fingerprintSources(engine.engineFiles, read), files: engine.engineFiles } };
}
const productionRead = file => fs.readFileSync(path.join(root, file), 'utf8');
function state() {
  const production = identities(productionRead), candidate = identities(overlayRead);
  const sourcePaths = new Set([...manifest.runtimeSourceOverlay.map(source => source.file), ...manifest.preservedTests,
    ...Object.values(candidate.generators).flatMap(value => value.files), ...candidate.engine.files,
    'scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']);
  return { production, candidate, identitiesUnchanged: JSON.stringify(production) === JSON.stringify(candidate),
    productionSources: [...sourcePaths].sort().map(file => ({ file, sha256: hash(path.join(root, file)) })) };
}
const identityBefore = state(); save('identity-before.json', identityBefore);
for (const source of manifest.runtimeSourceOverlay.filter(source => !source.staged)) {
  if (hash(path.join(root, source.file)) !== source.sha256) throw Error(`Production dependency drift since static review: ${source.file}`);
}
for (const source of identityBefore.productionSources) copy(path.join(root, source.file), path.join(output, 'production-sources', source.file));
if (!identityBefore.identitiesUnchanged) throw Error('Display candidate changed an actual generator or engine closure');
const selectedTests = [...manifest.stagedTests.map(file => path.relative(root, path.join(staging, file))), ...manifest.preservedTests];
save('scope.json', { selectedTests, candidates: [...changed], gpu: false, productionBuild: false });
const results = [];
async function run(name, args) {
  const logFile = path.join(output, `${name}.log`), log = fs.createWriteStream(logFile), started = performance.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false }); child.once('error', reject); child.once('close', resolve);
  });
  await new Promise(resolve => log.end(resolve));
  const result = { name, args, code, milliseconds: Math.round(performance.now() - started), logSha256: hash(logFile) }; results.push(result);
  console.log(JSON.stringify({ name, code, milliseconds: result.milliseconds }));
}
await run('types', ['node_modules/typescript/bin/tsc', '-p', path.relative(root, path.join(staging, 'tsconfig.json'))]);
await run('lint', ['node_modules/eslint/bin/eslint.js', ...[...changed, ...manifest.stagedTests].map(file => path.relative(root, path.join(staging, file))), path.relative(root, path.join(staging, 'vitest.config.ts'))]);
await run('unit', ['node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner', '--config', path.relative(root, path.join(staging, 'vitest.config.ts')), ...selectedTests,
  '--reporter=default', '--reporter=json', `--outputFile.json=${path.relative(root, path.join(output, 'unit.json'))}`]);
const after = stagedSources(), identityAfter = state(); save('source-after.json', after); save('identity-after.json', identityAfter);
const unit = fs.existsSync(path.join(output, 'unit.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'unit.json'), 'utf8')) : null;
const sourceStable = JSON.stringify(before) === JSON.stringify(after), dependenciesStable = JSON.stringify(identityBefore) === JSON.stringify(identityAfter);
const verification = { round, results, selectedTests, sourceStable, dependenciesStable, identitiesUnchanged: identityBefore.identitiesUnchanged && identityAfter.identitiesUnchanged,
  testFiles: unit?.testResults?.map(file => ({ file: path.relative(root, file.name), status: file.status, tests: file.assertionResults?.length })) ?? [],
  testsObserved: unit?.numTotalTests ?? null, testsPassed: unit?.numPassedTests ?? null, testsFailed: unit?.numFailedTests ?? null,
  candidatePassed: results.every(step => step.code === 0) && unit?.success === true && sourceStable && dependenciesStable,
  productionPromoted: false, productionBuild: false, gpuRun: false, visualAccepted: false, cloudWrites: false };
save('verification.json', verification); console.log(JSON.stringify(verification)); process.exitCode = verification.candidatePassed ? 0 : 1;
