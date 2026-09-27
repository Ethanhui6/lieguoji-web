import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const stage = '.autopilot/ph06/natural-ranges-staging', round = process.argv[2];
if (!round || !/^[a-z0-9-]+$/.test(round)) throw new Error('A fresh check round is required.');
const out = `${stage}/checks/${round}`;
if (fs.existsSync(out)) throw new Error('Refusing to overwrite earlier check evidence.');
fs.mkdirSync(`${out}/source`, { recursive: true });
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const files = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'src/world/generation/fine-range-tree.ts', 'natural-ranges.test.ts', 'natural-writer.test.ts', 'vitest.config.ts', 'typecheck.mjs'];
const before = Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(`${stage}/${f}`))]));
for (const file of files) { fs.mkdirSync(path.dirname(`${out}/source/${file}`), { recursive: true }); fs.copyFileSync(`${stage}/${file}`, `${out}/source/${file}`); }
const baseline = JSON.parse(fs.readFileSync(`${stage}/baseline-manifest.json`, 'utf8'));
const productionBefore = Object.fromEntries(Object.keys(baseline).map(f => [f, sha(fs.readFileSync(`src/world/generation/${f}`))]));
const commands = [
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=json', `--outputFile=${out}/unit.json`]],
  ['types', [`${stage}/typecheck.mjs`]],
  ['lint', ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files.slice(0, 6).map(f => `${stage}/${f}`)]],
];
const results = [];
for (const [name, args] of commands) {
  const started = Date.now(), result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(`${out}/${name}.log`, `${result.stdout ?? ''}${result.stderr ?? ''}`);
  results.push({ name, exitCode: result.status, elapsedMs: Date.now() - started, error: result.error?.message ?? null });
}
if (fs.existsSync(`${stage}/measurements.json`)) fs.copyFileSync(`${stage}/measurements.json`, `${out}/measurements.json`);
if (fs.existsSync(`${stage}/writer-measurements.json`)) fs.copyFileSync(`${stage}/writer-measurements.json`, `${out}/writer-measurements.json`);
const after = Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(`${stage}/${f}`))]));
const productionAfter = Object.fromEntries(Object.keys(baseline).map(f => [f, sha(fs.readFileSync(`src/world/generation/${f}`))]));
const units = fs.existsSync(`${out}/unit.json`) ? JSON.parse(fs.readFileSync(`${out}/unit.json`, 'utf8')) : {};
const verification = { passed: results.every(c => c.exitCode === 0) && units.numTotalTests === 27 && units.numPassedTests === 27 && units.numFailedTests === 0,
  sourceStable: JSON.stringify(before) === JSON.stringify(after), sourceBefore: before, sourceAfter: after,
  productionChangedDuringCheck: JSON.stringify(productionBefore) !== JSON.stringify(productionAfter), baselineProductionStillExact: JSON.stringify(productionAfter) === JSON.stringify(baseline),
  checks: results, units: { total: units.numTotalTests, passed: units.numPassedTests, failed: units.numFailedTests },
  productionIntegrated: false, buildRun: false, gpuRun: false, visualAccepted: false };
fs.writeFileSync(`${out}/verification.json`, JSON.stringify(verification, null, 2));
console.log(JSON.stringify({ passed: verification.passed, sourceStable: verification.sourceStable, units: verification.units, checks: results }));
process.exitCode = verification.passed && verification.sourceStable ? 0 : 1;
