import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const label = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid evidence label');
const out = path.join(root, '.autopilot/ph06/detail-storage-checks', label);
await mkdir(out);
const owned = ['src/world/storage.ts', 'src/world/storage-types.ts', 'src/world/detail-coast-storage.test.ts'];
async function snapshot() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  await walk('src');
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'scripts/generator-fingerprint.ts']) files.push(file);
  return await Promise.all(files.sort().map(async file => ({ file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
}
const before = await snapshot();
await writeFile(path.join(out, 'source-before.json'), JSON.stringify(before, null, 2));
const args = ['node_modules/vitest/vitest.mjs', 'run', owned[2], '--reporter=default', '--reporter=json', `--outputFile=${path.join(out, 'results.json')}`, ...process.argv.slice(3)];
await writeFile(path.join(out, 'command.json'), JSON.stringify({ command: process.execPath, args, cwd: root }, null, 2));
const startedAt = new Date().toISOString(), started = performance.now();
let log = '';
const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { const value = chunk.toString(); log += value; process.stdout.write(value); });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
const after = await snapshot();
await writeFile(path.join(out, 'source-after.json'), JSON.stringify(after, null, 2));
await writeFile(path.join(out, 'run.log'), log);
const changed = [...new Set([...before.map(item => item.file), ...after.map(item => item.file)])].filter(file => before.find(item => item.file === file)?.sha256 !== after.find(item => item.file === file)?.sha256);
let results;
try { results = JSON.parse(await readFile(path.join(out, 'results.json'), 'utf8')); } catch { results = null; }
const report = { startedAt, finishedAt: new Date().toISOString(), wallMs: performance.now() - started, exitCode: code, tests: results ? { total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests, pending: results.numPendingTests } : null, ownedSourceUnchanged: !owned.some(file => changed.includes(file)), fullSourceUnchanged: changed.length === 0, changedSourceFiles: changed };
await writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = code ?? 1;
