import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = '.autopilot/ph06/detail-shader-checks';
mkdirSync(folder, { recursive: true });
const files = ['src/world/detail-terrain-pages.ts', 'src/world/detail-terrain-pages.test.ts', 'src/world/detail-terrain-shader.ts', 'src/world/detail-terrain-shader.test.ts'];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(`${folder}/promoted.json`, JSON.stringify({ files: files.map(path => ({ path, stagingHash: hash(path.replace('src/world/', '.autopilot/ph06/v4-render-staging/src/world/')), hash: hash(path) })), inspectedCorrection: 'GLSL clip neighbour deduplication changed from next to previous to match current authoritative CPU polygon fan before the first test run.' }, null, 2));
async function run(name, args) {
  const startedAt = new Date().toISOString(), start = performance.now(), log = createWriteStream(`${folder}/${name}.log`);
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', data => { log.write(data); process.stdout.write(data); });
  child.stderr.on('data', data => { log.write(data); process.stderr.write(data); });
  const exitCode = await new Promise(resolve => child.on('exit', resolve)); log.end();
  writeFileSync(`${folder}/${name}.result.json`, JSON.stringify({ startedAt, elapsedMs: performance.now() - start, exitCode, command: [process.execPath, ...args] }, null, 2));
  return exitCode;
}
const tests = await run('cpu-first', ['node_modules/vitest/vitest.mjs', 'run', 'src/world/detail-terrain-pages.test.ts', 'src/world/detail-terrain-shader.test.ts', '--reporter=default', '--reporter=json', `--outputFile=${folder}/cpu-first.json`]);
const lint = await run('lint-first', ['node_modules/eslint/bin/eslint.js', ...files]);
writeFileSync(`${folder}/cpu-source-hashes.json`, JSON.stringify(files.map(path => ({ path, hash: hash(path) })), null, 2));
process.exitCode = tests || lint;
