import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Require a fresh safe run label.');
const stage = path.resolve('.autopilot/ph06/coast-curves-staging'), record = path.join(stage, 'checks', label);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
if (hash('src/world/generation/detail-natural-outline.ts') !== hash(path.join(stage, 'baseline/detail-natural-outline.ts'))) throw new Error('Production outline drifted since baseline capture.');
mkdirSync(path.dirname(record), { recursive: true }); mkdirSync(record);
const files = ['runtime/detail-natural-outline.ts', 'baseline/detail-natural-outline.ts', 'geometry-proof.md',
  ...readdirSync(stage).filter(name => /\.(ts|mjs)$/.test(name))];
const source = [];
for (const file of files) {
  const from = path.join(stage, file), to = path.join(record, 'source', file); mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(from, to);
  source.push({ path: file, sha256: hash(from) });
}
const dependencies = ['src/world/generation/detail-natural-outline.ts', 'src/world/generation/seed.ts',
  '.autopilot/ph06/demo22-replay/runs/2026-09-27T22-49-07.265Z/capture.json'];
const before = { source, dependencies: dependencies.map(file => ({ path: file, sha256: hash(file) })) };
writeFileSync(path.join(record, 'source-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
const commands = [
  { name: 'types', args: [path.join(stage, 'typecheck.mjs')] },
  { name: 'lint', args: ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files.filter(p => /\.(ts|mjs)$/.test(p)).map(p => path.join(stage, p))] },
  { name: 'unit', args: ['node_modules/vitest/vitest.mjs', 'run', '--config', path.join(stage, 'vitest.config.ts'), '--reporter=json', `--outputFile=${path.join(record, 'unit.json')}`] },
  { name: 'outline-preview', args: ['node_modules/vitest/vitest.mjs', 'run', '--config', path.join(stage, 'vitest.config.ts'), '--reporter=json', `--outputFile=${path.join(record, 'outline-preview.json')}`] },
];
const results = [];
for (const command of commands) {
  const start = Date.now(), result = spawnSync(process.execPath, command.args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 120000,
    env: { ...process.env, COAST_CURVE_PREVIEW: command.name === 'outline-preview' ? '1' : '0', COAST_CURVE_RUN: label } });
  writeFileSync(path.join(record, `${command.name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, { flag: 'wx' });
  const row = { name: command.name, exitCode: result.status, signal: result.signal, milliseconds: Date.now() - start, error: result.error?.message };
  results.push(row); console.log(JSON.stringify(row)); if (result.status !== 0) break;
}
const after = { source: files.map(file => ({ path: file, sha256: hash(path.join(stage, file)) })), dependencies: dependencies.map(file => ({ path: file, sha256: hash(file) })) };
const stable = JSON.stringify(before) === JSON.stringify(after), success = results.length === 4 && results.every(row => row.exitCode === 0) && stable;
writeFileSync(path.join(record, 'source-after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
writeFileSync(path.join(record, 'verification.json'), JSON.stringify({ success, stable, results,
  scope: 'Isolated outline candidate: types, lint, five corner contracts, one captured-input outline diagnostic. No generated terrain, browser, product renderer, save or phase visual acceptance.' }, null, 2), { flag: 'wx' });
process.exitCode = success ? 0 : 1;
