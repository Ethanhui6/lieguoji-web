// One scoped storage-history check round. No build, browser or generation run.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const destination = 'docs/evidence/ph06-preview20-generator-history-2026-09-28/storage-checks/first';
if (fs.existsSync(destination)) throw new Error('Preserve existing check round');
fs.mkdirSync(destination, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['src/world/generation-history.ts', 'src/world/generation-preview20-history.test.ts', '.gitattributes'];
const capture = () => files.map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) }));
const write = (file, value) => fs.writeFileSync(path.join(destination, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sourceBefore = capture(); write('source-before.json', sourceBefore);
const commands = [
  ['lint', ['node_modules/eslint/bin/eslint.js', ...files.filter(file => file.endsWith('.ts'))]],
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', 'src/world/generation-preview20-history.test.ts', '--reporter=json', `--outputFile=${destination}/unit.json`]],
];
const results = [];
for (const [name, args] of commands) {
  const fd = fs.openSync(path.join(destination, `${name}.log`), 'wx'), startedAt = new Date().toISOString(), start = performance.now();
  let result;
  try { result = spawnSync(process.execPath, args, { stdio: ['ignore', fd, fd], timeout: 120000 }); }
  finally { fs.closeSync(fd); }
  results.push({ name, args, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start,
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null });
}
const sourceAfter = capture(); write('source-after.json', sourceAfter);
const unit = fs.existsSync(path.join(destination, 'unit.json')) ? JSON.parse(fs.readFileSync(path.join(destination, 'unit.json'), 'utf8')) : null;
const sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
const allCommandsPassed = results.every(result => result.exitCode === 0 && result.signal === null && result.error === null);
const verification = { recordedAt: new Date().toISOString(), scope: 'preview20 storage-history integration only',
  originalBuildSha256: '71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018',
  sourceStable, allCommandsPassed, results,
  unit: unit ? { success: unit.success, total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests, files: unit.testResults.length } : null,
  passed: sourceStable && allCommandsPassed && unit?.success === true && unit.numTotalTests === 5 && unit.numPassedTests === 5 && unit.numFailedTests === 0 && unit.numPendingTests === 0,
  testsRun: true, fullProductChecksRun: false, productBuildRun: false, browserRun: false,
  naturalVisualAccepted: false, physicalDeviceAccepted: false, phaseAccepted: false,
};
write('verification.json', verification);
console.log(JSON.stringify({ passed: verification.passed, sourceStable, results: results.map(({ name, exitCode, elapsedMs }) => ({ name, exitCode, elapsedMs })), unit: verification.unit }));
process.exitCode = verification.passed ? 0 : 1;
