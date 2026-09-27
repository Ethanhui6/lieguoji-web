import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(), stage = '.autopilot/ph06/v4-lock-staging', label = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid evidence label.');
const out = path.join(root, stage, 'checks', label); await mkdir(out, { recursive: false });
async function snapshot() {
  const files = [];
  async function walk(relative) { for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(file); else if (entry.isFile()) files.push(file);
  } }
  await walk('src'); await walk(`${stage}/src`);
  files.push(`${stage}/run.mjs`, `${stage}/vitest.config.ts`, 'package.json', 'package-lock.json', 'vite.config.ts', 'scripts/generator-fingerprint.ts');
  return Promise.all(files.sort().map(async file => ({ file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
}
const before = await snapshot(); await writeFile(path.join(out, 'source-before.json'), JSON.stringify(before, null, 2));
const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=default', '--reporter=json', `--outputFile=${path.join(out, 'results.json')}`, ...process.argv.slice(3)];
await writeFile(path.join(out, 'command.json'), JSON.stringify({ command: process.execPath, args, cwd: root }, null, 2));
const startedAt = new Date().toISOString(), started = performance.now(); let log = '';
const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString(); process.stdout.write(chunk); });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
const after = await snapshot(), a = new Map(before.map(value => [value.file, value.sha256])), b = new Map(after.map(value => [value.file, value.sha256]));
const changed = [...new Set([...a.keys(), ...b.keys()])].filter(file => a.get(file) !== b.get(file));
await writeFile(path.join(out, 'source-after.json'), JSON.stringify(after, null, 2)); await writeFile(path.join(out, 'run.log'), log);
let result; try { result = JSON.parse(await readFile(path.join(out, 'results.json'), 'utf8')); } catch { result = null; }
const verification = { startedAt, finishedAt: new Date().toISOString(), wallMs: performance.now() - started, exitCode: code,
  tests: result ? { total: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests, pending: result.numPendingTests } : null,
  sourceUnchanged: !changed.length, changed, stagingOnly: true };
await writeFile(path.join(out, 'verification.json'), JSON.stringify(verification, null, 2)); process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`); process.exitCode = code ?? 1;
