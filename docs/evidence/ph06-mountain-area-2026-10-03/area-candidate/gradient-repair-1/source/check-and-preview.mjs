import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const label = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Require a new safe run label.');
const stage = path.resolve('.autopilot/ph06/ridge-landform-staging/area-v2'), record = path.join(stage, 'checks', label);
mkdirSync(path.dirname(record), { recursive: true }); mkdirSync(record);
const files = ['runtime/fine-range-tree.ts', 'runtime/detail-orography.ts', 'runtime/terrain-massif.ts', 'physical-views.json',
  ...readdirSync(stage).filter(name => /\.(ts|mjs)$/.test(name))];
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const source = [];
for (const file of files) {
  const from = path.join(stage, file), to = path.join(record, 'source', file); mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(from, to);
  source.push({ path: file, sha256: hash(from) });
}
writeFileSync(path.join(record, 'source-before.json'), JSON.stringify(source, null, 2), { flag: 'wx' });
const commands = [
  { name: 'types', args: [path.join(stage, 'typecheck.mjs')] },
  { name: 'lint', args: ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files.filter(p => /\.(ts|mjs)$/.test(p)).map(p => path.join(stage, p))] },
  { name: 'physical', args: ['node_modules/vitest/vitest.mjs', 'run', '--config', path.join(stage, 'vitest.config.ts'), '--reporter=json', `--outputFile=${path.join(record, 'physical.json')}`] },
];
const results = [];
for (const command of commands) {
  const start = Date.now(), result = spawnSync(process.execPath, command.args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 300000,
    env: { ...process.env, MASSIF_PREVIEW: command.name === 'physical' ? '1' : '0', MASSIF_RUN: label } });
  writeFileSync(path.join(record, `${command.name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, { flag: 'wx' });
  const row = { name: command.name, exitCode: result.status, signal: result.signal, milliseconds: Date.now() - start, error: result.error?.message };
  results.push(row); console.log(JSON.stringify(row));
  if (result.status !== 0) break;
}
const after = files.map(file => ({ path: file, sha256: hash(path.join(stage, file)) })), stable = JSON.stringify(source) === JSON.stringify(after);
writeFileSync(path.join(record, 'source-after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
const success = results.length === 3 && results.every(row => row.exitCode === 0) && stable;
writeFileSync(path.join(record, 'verification.json'), JSON.stringify({ success, stable, results,
  scope: 'Only types, target lint and one candidate three-view physical generation. Two prepared algorithm cases have NOT executed; baseline reused, no build/GPU/production acceptance.' }, null, 2), { flag: 'wx' });
process.exitCode = success ? 0 : 1;
