import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
const stage = '.autopilot/ph06/fine-world-relief-staging';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const files = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'fine-world-relief.test.ts', 'vitest.config.ts', 'typecheck.mjs'];
const sourceBefore = Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(path.join(stage, f)))]));
const baseline = JSON.parse(fs.readFileSync(path.join(stage, 'baseline.json'), 'utf8'));
for (const [name, hash] of Object.entries(baseline)) {
  if (sha(fs.readFileSync(`src/world/generation/${name}`)) !== hash || sha(fs.readFileSync(`${stage}/baseline/${name}`)) !== hash) throw new Error(`Production/baseline changed: ${name}`);
}
const checks = [
  ['types', [path.join(stage, 'typecheck.mjs')]],
  ['lint', ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files.slice(0, 4).map(f => path.join(stage, f))]],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=json', `--outputFile=${stage}/guard-final-tests.json`]],
];
const results = [];
for (const [name, args] of checks) {
  const start = Date.now(), result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(`${stage}/guard-final-${name}.log`, `${result.stdout ?? ''}${result.stderr ?? ''}`);
  results.push({ name, exitCode: result.status, elapsedMs: Date.now() - start, error: result.error?.message ?? null });
  if (result.status !== 0) break;
}
const sourceAfter = Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(path.join(stage, f)))]));
const tests = JSON.parse(fs.readFileSync(`${stage}/guard-final-tests.json`, 'utf8'));
const verification = { passed: results.length === 3 && results.every(r => r.exitCode === 0) && JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
  && tests.numTotalTests === 22 && tests.numPassedTests === 22 && tests.numFailedTests === 0, sourceBefore, sourceAfter, results,
  unit: { total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests },
  scope: 'Two staged modules only, six candidate tests plus sixteen existing orography tests through explicit overlay; no build/GPU/storage/cloud.',
  productionModulesUnchanged: Object.entries(baseline).every(([name, hash]) => sha(fs.readFileSync(`src/world/generation/${name}`)) === hash),
  integrated: false, visualAccepted: false, terrainPersistenceVerifiedForCandidate: false };
fs.writeFileSync(`${stage}/verification.json`, JSON.stringify(verification, null, 2));
console.log(JSON.stringify({ passed: verification.passed, unit: verification.unit, sourceStable: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter), productionModulesUnchanged: verification.productionModulesUnchanged, results }));
process.exitCode = verification.passed && verification.productionModulesUnchanged ? 0 : 1;
