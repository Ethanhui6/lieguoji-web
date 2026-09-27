import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const repo = process.cwd();
const stage = '.autopilot/ph06/v4-natural-staging';
const out = `${stage}/checks/first`;
const ready = JSON.parse(await readFile(`${stage}/ready-manifest.json`, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}
async function snapshot() {
  const files = [...await walk('src'), ...ready.files.map(file => file.stagedPath),
    `${stage}/ready-manifest.json`, `${stage}/typecheck.mjs`, `${stage}/vitest.config.ts`,
    `${stage}/checks/run-first.mjs`, 'tsconfig.json', 'eslint.config.js', 'package.json', 'package-lock.json'];
  return Promise.all([...new Set(files)].sort().map(async path => {
    const bytes = await readFile(path);
    return { path: relative(repo, resolve(path)).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes) };
  }));
}
const before = await snapshot();
await write(`${out}/source-before.json`, before);
for (const file of ready.files) {
  if (before.find(item => item.path === file.stagedPath)?.sha256 !== file.sha256) throw new Error(`Frozen staging SHA mismatch: ${file.stagedPath}`);
}
const commands = [
  { name: 'typecheck', args: [`${stage}/typecheck.mjs`] },
  { name: 'lint', args: ['node_modules/eslint/bin/eslint.js', '--no-ignore', '--max-warnings', '0', ...ready.files.map(file => file.stagedPath)] },
  { name: 'unit', args: ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--maxWorkers', '1', '--no-file-parallelism', '--retry', '0', '--reporter=default', '--reporter=json', `--outputFile.json=${out}/unit-results.json`] },
];
await write(`${out}/commands.json`, {
  startedAt: new Date().toISOString(), cwd: repo, executable: process.execPath, nodeVersion: process.version,
  scope: 'Only frozen four natural-v2 staging files, their production imports, ten targeted unit cases. No global/build/browser/performance checks.',
  commands,
});
const results = [];
for (const command of commands) {
  const start = performance.now(), startedAt = new Date().toISOString();
  console.log(`START ${command.name}`);
  let log = '';
  const child = spawn(process.execPath, command.args, { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { log += bytes.toString(); });
  child.stderr.on('data', bytes => { log += bytes.toString(); });
  const terminal = await new Promise(resolveExit => {
    child.once('error', error => resolveExit({ code: null, signal: null, spawnError: String(error) }));
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  await writeFile(`${out}/${command.name}.log`, log, { flag: 'wx' });
  const result = { name: command.name, startedAt, durationMs: performance.now() - start, ...terminal };
  results.push(result);
  await write(`${out}/${command.name}-exit.json`, result);
  console.log(`END ${command.name} exit=${terminal.code} durationMs=${result.durationMs.toFixed(1)}`);
  if (terminal.code !== 0) console.log(log);
}
const after = await snapshot();
await write(`${out}/source-after.json`, after);
let unit = null;
try {
  const raw = JSON.parse(await readFile(`${out}/unit-results.json`, 'utf8'));
  unit = { total: raw.numTotalTests, passed: raw.numPassedTests, failed: raw.numFailedTests,
    pending: raw.numPendingTests, success: raw.success,
    assertions: raw.testResults.flatMap(file => file.assertionResults).map(test => ({ name: test.fullName, status: test.status })) };
} catch (error) { unit = { reportError: String(error) }; }
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after);
const allPassed = results.every(result => result.code === 0) && sourceUnchanged && unit.total === 10 && unit.passed === 10 && unit.failed === 0 && unit.pending === 0;
await write(`${out}/verification.json`, { completedAt: new Date().toISOString(), results, sourceFiles: before.length, sourceUnchanged, unit, allPassed, firstRun: true, retries: 0, productionModified: false, performanceMeasured: false });
console.log(JSON.stringify({ results, sourceUnchanged, unit, allPassed }));
process.exitCode = allPassed ? 0 : 1;
