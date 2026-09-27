import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/regional-coast-staging'), round = process.argv[2];
if (!round || !/^[a-z0-9-]+$/.test(round)) throw new Error('Give a unique, safe evidence round name');
const output = path.join(staging, 'checks', round); if (existsSync(output)) throw new Error('Evidence round already exists');
mkdirSync(output, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (name, value) => writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const manifest = JSON.parse(readFileSync(path.join(staging, 'ready-manifest.json'), 'utf8'));
const changed = new Set(manifest.candidates);
const tests = [
  'src/world/generation/detail-natural-coast-plan.test.ts',
  'src/world/generation/detail-natural-visual-repair.test.ts',
  'src/world/generation/detail-natural-writer.test.ts',
  'src/world/detail-natural-integration.test.ts',
  'src/world/generation/regional-coast-plan.test.ts',
  'src/world/generation/regional-coast-field.test.ts',
  'src/world/regional-coast-storage.test.ts',
];
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.isDirectory() && ['checks', '.vite-cache', 'node_modules'].includes(entry.name)) return [];
  return entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)];
});
const sources = () => files(staging).map(file => ({ file: path.relative(staging, file).replaceAll('\\', '/'), sha256: sha(readFileSync(file)) })).sort((a, b) => a.file.localeCompare(b.file));
const sourceBefore = sources(); json('sources-before.json', sourceBefore);
for (const source of sourceBefore) {
  const destination = path.join(output, 'staged-sources', source.file); mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(path.join(staging, source.file)));
}
for (const source of manifest.runtimeSourceOverlay) {
  const file = path.join(source.staged ? staging : root, source.file), actual = sha(readFileSync(file));
  if (!source.staged && actual !== source.sha256) throw new Error(`Production runtime dependency changed since review: ${source.file}`);
  const destination = path.join(output, 'runtime-sources', source.file); mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, readFileSync(file));
}
const fingerprintModule = path.join(output, 'fingerprint-runtime.mjs');
writeFileSync(fingerprintModule, ts.transpileModule(readFileSync(path.join(root, 'scripts/generator-fingerprint.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
const fingerprinter = await import(pathToFileURL(fingerprintModule));
const overlayRead = file => readFileSync(path.join(changed.has(file) ? staging : root, file), 'utf8');
const identity = () => ({ natural: fingerprinter.fingerprintNaturalDetailGenerator(overlayRead), additive: fingerprinter.fingerprintAddNaturalDetailGenerator(overlayRead),
  productionSources: manifest.runtimeSourceOverlay.filter(source => !source.staged).map(source => ({ file: source.file, sha256: sha(readFileSync(path.join(root, source.file))) })) });
const identityBefore = identity(); json('identity-before.json', identityBefore);
const steps = [];
async function command(name, args) {
  const logPath = path.join(output, `${name}.log`), log = createWriteStream(logPath), started = performance.now();
  const env = { ...process.env }; delete env.NATURAL_VISUAL_EVIDENCE_LABEL;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('error', reject); child.once('close', resolve);
  });
  await new Promise(resolve => log.end(resolve));
  const result = { name, code, milliseconds: Math.round(performance.now() - started), args, logSha256: sha(readFileSync(logPath)) }; steps.push(result);
  console.log(JSON.stringify({ name, code, milliseconds: result.milliseconds })); return code;
}
await command('types', ['node_modules/typescript/bin/tsc', '-p', path.relative(root, path.join(staging, 'tsconfig.json'))]);
await command('lint', ['node_modules/eslint/bin/eslint.js', ...[...changed, ...tests].map(file => path.relative(root, path.join(staging, file))), path.relative(root, path.join(staging, 'vitest.config.ts'))]);
await command('unit', ['node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner', '--config', path.relative(root, path.join(staging, 'vitest.config.ts')),
  ...tests.map(file => path.relative(root, path.join(staging, file))), '--reporter=default', '--reporter=json', `--outputFile.json=${path.relative(root, path.join(output, 'results.json'))}`]);
const sourceAfter = sources(), identityAfter = identity(); json('sources-after.json', sourceAfter); json('identity-after.json', identityAfter);
const raw = existsSync(path.join(output, 'results.json')) ? JSON.parse(readFileSync(path.join(output, 'results.json'), 'utf8')) : null;
const result = { round, candidates: [...changed], tests, steps, sourceStable: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter), identityStable: JSON.stringify(identityBefore) === JSON.stringify(identityAfter),
  testsObserved: raw?.numTotalTests ?? null, testsPassed: raw?.numPassedTests ?? null, testsFailed: raw?.numFailedTests ?? null,
  testFilesObserved: raw?.testResults?.map(file => ({ file: path.relative(root, file.name).replaceAll('\\', '/'), status: file.status, tests: file.assertionResults?.length })) ?? [],
  candidatePassed: steps.every(step => step.code === 0) && raw?.success === true && JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter) && JSON.stringify(identityBefore) === JSON.stringify(identityAfter),
  productionPromoted: false, gpuRun: false, visualAccepted: false, cloudWrites: false };
json('verification.json', result); console.log(JSON.stringify(result));
process.exitCode = result.candidatePassed ? 0 : 1;
