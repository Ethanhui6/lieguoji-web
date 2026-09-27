import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import ts from 'typescript';
const stage = resolve('.autopilot/ph07/hydrology-snapshot-staging'), repo = process.cwd();
const label = process.argv[2]; if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('unique check label required');
const output = resolve(stage, 'checks', label); if (existsSync(output)) throw Error('do not overwrite evidence'); mkdirSync(output, { recursive: true });
const files = new Set(), queue = ['src/world/hydrology-snapshot.ts', 'src/world/hydrology-snapshot.test.ts', 'src/world/hydrology-kernel.ts'].map(f => resolve(stage, f));
while (queue.length) {
  const file = queue.pop(); if (files.has(file)) continue; files.add(file);
  for (const imp of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
    if (!imp.fileName.startsWith('.')) continue;
    const target = resolve(dirname(file), imp.fileName), base = target.startsWith(stage) ? stage : repo, logical = relative(base, target);
    const found = [stage, repo].flatMap(root => ['', '.ts', '.tsx'].map(suffix => resolve(root, logical + suffix))).find(p => existsSync(p) && /\.tsx?$/.test(p));
    if (found) queue.push(found);
  }
}
for (const file of ['vite.config.ts', 'tsconfig.json', 'package-lock.json', 'scripts/generator-fingerprint.ts', 'scripts/engine-fingerprint.ts']) files.add(resolve(file));
for (const file of ['check.mjs', 'typecheck.mjs', 'vitest.config.ts']) files.add(resolve(stage, file));
const hashes = () => Object.fromEntries([...files].sort().map(file => [relative(repo, file).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(file)).digest('hex')]));
const before = hashes(); writeFileSync(resolve(output, 'source-before.json'), JSON.stringify(before, null, 2));
for (const file of files) if (file.startsWith(stage)) { const dest = resolve(output, 'source', relative(stage, file)); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(file, dest); }
const steps = [];
for (const [name, args] of [['types', [resolve(stage, 'typecheck.mjs')]], ['unit', [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', resolve(stage, 'vitest.config.ts'), '--reporter=default', '--reporter=json', `--outputFile=${resolve(output, 'unit.json')}`]]]) {
  const start = Date.now(), result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 120000 });
  writeFileSync(resolve(output, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.stack}` : ''));
  steps.push({ name, code: result.status, signal: result.signal, durationMs: Date.now() - start });
  console.log(JSON.stringify(steps.at(-1))); if (result.status !== 0) break;
}
const after = hashes(), sourceUnchanged = JSON.stringify(before) === JSON.stringify(after); writeFileSync(resolve(output, 'source-after.json'), JSON.stringify(after, null, 2));
const result = { label, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), kernelSha256: before[relative(repo, resolve(stage, 'src/world/hydrology-kernel.ts')).replaceAll('\\', '/')], steps, sourceUnchanged,
  scope: 'staging snapshot tests and imported production interfaces only; no production integration, browser, build or performance claim', passed: steps.length === 2 && steps.every(s => s.code === 0) && sourceUnchanged };
writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); process.exitCode = result.passed ? 0 : 1;
