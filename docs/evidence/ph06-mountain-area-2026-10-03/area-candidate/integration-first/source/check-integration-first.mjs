import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const stage = path.resolve('.autopilot/ph06/ridge-landform-staging/area-v2'), record = path.join(stage, 'checks/integration-first');
mkdirSync(record);
const files = ['runtime/fine-range-tree.ts', 'runtime/detail-orography.ts', 'runtime/terrain-massif.ts', 'area.test.ts', 'gradient-noise.test.ts', 'vitest.config.ts', 'check-integration-first.mjs'];
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const before = files.map(file => ({ file, sha256: hash(path.join(stage, file)) }));
for (const { file } of before) { const target = path.join(record, 'source', file); mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(stage, file), target); }
writeFileSync(path.join(record, 'source-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
const start = Date.now(), run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', path.join(stage, 'vitest.config.ts'), '--reporter=json', `--outputFile=${path.join(record, 'unit.json')}`],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 180000, env: { ...process.env, MASSIF_ALGORITHM_TESTS: '1', MASSIF_PREVIEW: '0' } });
writeFileSync(path.join(record, 'unit.log'), `${run.stdout ?? ''}\n${run.stderr ?? ''}`, { flag: 'wx' });
const after = files.map(file => ({ file, sha256: hash(path.join(stage, file)) })), stable = JSON.stringify(after) === JSON.stringify(before);
const result = { exitCode: run.status, signal: run.signal, milliseconds: Date.now() - start, error: run.error?.message, stable, success: run.status === 0 && stable };
writeFileSync(path.join(record, 'verification.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result)); process.exitCode = result.success ? 0 : 1;
