import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Require a fresh safe full-generation run label.');
const stage = path.resolve('.autopilot/ph06/coast-curves-staging'), record = path.join(stage, 'full-checks', label);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
if (hash('src/world/generation/detail-natural-outline.ts') !== hash(path.join(stage, 'baseline/detail-natural-outline.ts'))) throw new Error('Production outline drifted since baseline capture.');
mkdirSync(path.dirname(record), { recursive: true }); mkdirSync(record);
const files = ['runtime/detail-natural-outline.ts', 'baseline/detail-natural-outline.ts', 'input.ts', 'full-views.json', 'full-binding.ts',
  'full-generation.test.ts', 'full-sea-image.ts', 'full.vitest.config.ts', 'full-typecheck.mjs', 'full-check.mjs'];
const before = [];
for (const file of files) {
  const from = path.join(stage, file), to = path.join(record, 'source', file); mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(from, to);
  before.push({ path: file, sha256: hash(from) });
}
writeFileSync(path.join(record, 'source-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
const commands = [
  { name: 'types', args: [path.join(stage, 'full-typecheck.mjs')] },
  { name: 'lint', args: ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files.filter(p => p.startsWith('full') && /\.(ts|mjs)$/.test(p)).map(p => path.join(stage, p))] },
  ...['baseline', 'candidate'].map(variant => ({ name: variant, args: ['node_modules/vitest/vitest.mjs', 'run', '--config', path.join(stage, 'full.vitest.config.ts'), '--reporter=json', `--outputFile=${path.join(record, `${variant}.json`)}`] })),
];
const results = [];
for (const command of commands) {
  const start = Date.now(), result = spawnSync(process.execPath, command.args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 300000,
    env: { ...process.env, COAST_FULL_VARIANT: command.name, COAST_FULL_RUN: label } });
  writeFileSync(path.join(record, `${command.name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, { flag: 'wx' });
  const row = { name: command.name, exitCode: result.status, signal: result.signal, milliseconds: Date.now() - start, error: result.error?.message };
  results.push(row); console.log(JSON.stringify(row)); if (result.status !== 0) break;
}
const after = files.map(file => ({ path: file, sha256: hash(path.join(stage, file)) }));
const stable = JSON.stringify(before) === JSON.stringify(after), success = results.length === 4 && results.every(row => row.exitCode === 0) && stable;
writeFileSync(path.join(record, 'source-after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
writeFileSync(path.join(record, 'verification.json'), JSON.stringify({ success, stable, results,
  scope: 'New harness types/lint, one complete actual built23 baseline and one complete outline-only candidate. Reuses original five passing outline cases. Native captured centers, natural ocean base, validated fine packets and actual fine owner samples. No browser or final visual acceptance.' }, null, 2), { flag: 'wx' });
process.exitCode = success ? 0 : 1;
