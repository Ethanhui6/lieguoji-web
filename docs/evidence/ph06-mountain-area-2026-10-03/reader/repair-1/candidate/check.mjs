import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base = '.autopilot/ph07/reader-staging', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('Supply a new approved check label');
const output = `${base}/checks/${label}`;
if (fs.existsSync(output)) throw Error('Preserve original check round');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tests = [`${base}/src/world/hydrology-reader-owned.test.ts`];
const ownFiles = [`${base}/src/world/hydrology-reader-owned.ts`, ...tests, `${base}/tsconfig.json`, `${base}/vitest.config.ts`, `${base}/check.mjs`, `${base}/README.md`, `${base}/static-manifest.json`];
const snapshot = () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = `${dir}/${entry.name}`; if (entry.isSymbolicLink()) throw Error('Unexpected source link');
    return entry.isDirectory() ? walk(file) : [{ path: file, sha256: hash(file) }];
  });
  return [...walk('src'), ...walk('scripts'), ...ownFiles.map(file => ({ path: file, sha256: hash(file) })),
    ...['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'eslint.config.js'].map(file => ({ path: file, sha256: hash(file) }))];
};
const before = snapshot(); fs.mkdirSync(output, { recursive: true });
const save = (file, value) => fs.writeFileSync(`${output}/${file}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
save('source-before.json', before);
for (const file of ownFiles) {
  const to = `${output}/candidate/${file.slice(base.length + 1)}`;
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(file, to, fs.constants.COPYFILE_EXCL);
}
const steps = [
  ['types', ['node_modules/typescript/bin/tsc', '-p', `${base}/tsconfig.json`]],
  ['lint', ['node_modules/eslint/bin/eslint.js', `${base}/src/world/hydrology-reader-owned.ts`, ...tests, `${base}/vitest.config.ts`]],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner', '--config', `${base}/vitest.config.ts`, ...tests, '--reporter=json', `--outputFile=${output}/unit.json`]],
];
const results = [];
for (const [name, args] of steps) {
  const fd = fs.openSync(`${output}/${name}.log`, 'wx'), startedAt = new Date().toISOString(), start = performance.now(); let result;
  try { result = spawnSync(process.execPath, args, { stdio: ['ignore', fd, fd], timeout: 180000 }); } finally { fs.closeSync(fd); }
  results.push({ name, args, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start,
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null });
}
const after = snapshot(); save('source-after.json', after);
const unit = fs.existsSync(`${output}/unit.json`) ? JSON.parse(fs.readFileSync(`${output}/unit.json`, 'utf8')) : null;
const sourceStable = JSON.stringify(before) === JSON.stringify(after);
const passed = sourceStable && results.every(row => row.exitCode === 0 && !row.signal && !row.error)
  && unit?.success === true && unit.numTotalTests === 4 && unit.numPassedTests === 4 && unit.numFailedTests === 0 && unit.numPendingTests === 0;
save('verification.json', { label, sourceStable, passed, results,
  unit: unit ? { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests } : null,
  scope: 'private one-operation actual-geography reader candidate', productionPromoted: false, buildRun: false, browserRun: false,
  integrated94Rerun: false, publicWorkerProtocolChanged: false, fullRiverNetworkAccepted: false, phaseAccepted: false });
console.log(JSON.stringify({ label, passed, sourceStable, unitTotal: unit?.numTotalTests })); process.exitCode = passed ? 0 : 1;
