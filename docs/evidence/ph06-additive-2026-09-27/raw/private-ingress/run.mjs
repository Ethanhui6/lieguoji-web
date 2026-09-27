import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(), stage = '.autopilot/ph06/v4-private-ingress-staging', label = process.argv[2] ?? 'first', mode = process.argv[3] ?? 'test';
if (!/^[a-z0-9-]+$/.test(label) || !['test', 'static'].includes(mode)) throw new Error('Invalid evidence label or mode.');
await mkdir(path.join(root, stage, 'checks'), { recursive: true });
const out = path.join(root, stage, 'checks', label); await mkdir(out, { recursive: false });
async function snapshot() {
  const files = [];
  async function walk(relative) { for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(file); else if (entry.isFile()) files.push(file);
  } }
  await walk('src'); await walk('scripts'); await walk(`${stage}/src`);
  files.push(`${stage}/run.mjs`, `${stage}/vitest.config.ts`, `${stage}/static-check.mjs`, 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'eslint.config.js');
  return Promise.all(files.sort().map(async file => ({ file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
}
const before = await snapshot(); await writeFile(path.join(out, 'source-before.json'), JSON.stringify(before, null, 2));
const args = mode === 'test' ? ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=default', '--reporter=json', `--outputFile=${path.join(out, 'results.json')}`] : [`${stage}/static-check.mjs`];
await writeFile(path.join(out, 'command.json'), JSON.stringify({ command: process.execPath, args, cwd: root }, null, 2));
const startedAt = new Date().toISOString(), started = performance.now(); let log = '';
const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString(); process.stdout.write(chunk); });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
const after = await snapshot(), a = new Map(before.map(value => [value.file, value.sha256])), b = new Map(after.map(value => [value.file, value.sha256]));
const changed = [...new Set([...a.keys(), ...b.keys()])].filter(file => a.get(file) !== b.get(file));
await writeFile(path.join(out, 'source-after.json'), JSON.stringify(after, null, 2)); await writeFile(path.join(out, 'run.log'), log);
let result = null;
try { result = mode === 'test' ? JSON.parse(await readFile(path.join(out, 'results.json'), 'utf8')) : JSON.parse(log); } catch { /* Preserve a missing/invalid raw result as null. */ }
if (mode === 'static' && result) await writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
const verification = { startedAt, finishedAt: new Date().toISOString(), wallMs: performance.now() - started, exitCode: code,
  tests: mode === 'test' && result ? { total: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests, pending: result.numPendingTests } : null,
  staticPassed: mode === 'static' ? result?.pass ?? null : null, sourceUnchanged: !changed.length, changed, stagingOnly: true, performanceClaim: false };
await writeFile(path.join(out, 'verification.json'), JSON.stringify(verification, null, 2)); process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`); process.exitCode = code ?? 1;
