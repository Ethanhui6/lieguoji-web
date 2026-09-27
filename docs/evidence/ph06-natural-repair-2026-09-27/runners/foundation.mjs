import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const name = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid run name');
const out = `.autopilot/ph06/natural-repair-checks/${name}`;
if (fs.existsSync(out)) throw new Error('Evidence already exists');
fs.mkdirSync(out, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => { const file = path.join(dir, e.name); return e.isDirectory() ? walk(file) : [{ path: file.replaceAll('\\', '/'), sha256: hash(file) }]; }); }
const snapshot = () => [...walk('src'), ...walk('scripts'), ...walk('tests'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(file => ({ path: file, sha256: hash(file) }))];
const repairingIo = false;
const unitFiles = ['src/world/detail-owned-replacement-copy.test.ts','src/world/detail-preview9-history.test.ts','src/world/transactions.test.ts','src/world/replacement-cooperation.test.ts','src/world/generation-receiver.test.ts'];
const checks = [
  ['plan', ['scripts/check-plan.mjs']],
  ['lint', ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts']],
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', ...unitFiles, '--reporter=json', `--outputFile=${out}/unit.json`]],


];
const before = snapshot(), results = [];
fs.writeFileSync(`${out}/source-before.json`, JSON.stringify(before, null, 2));
fs.writeFileSync(`${out}/scope.json`, JSON.stringify({ unitFiles, unchangedScopeReused: repairingIo ? 'Original preview.8 first run 602 tests reused outside this Worker page/private ingress repair; UI recipe restoration is verified in the browser. No whole-game or performance claim.' : 'Unchanged preview9 world tests outside this natural-kernel/history/private-copy repair reuse the 908-test run. Actual selected files are listed; no whole-game or performance claim.' }, null, 2));
for (const [name, args] of checks) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  fs.writeFileSync(`${out}/${name}.log`, (result.stdout ?? '') + (result.stderr ?? ''));
  const record = { name, args, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, exitCode: result.status, signal: result.signal, error: result.error?.message };
  results.push(record); console.log(JSON.stringify(record));
  if (result.status !== 0) break;
}
const after = snapshot(); fs.writeFileSync(`${out}/source-after.json`, JSON.stringify(after, null, 2));
const built = results.some(r => r.name === 'dist-audit' && r.exitCode === 0);
if (built) fs.copyFileSync('dist/build.json', `${out}/build.json`);
fs.writeFileSync(`${out}/verification.json`, JSON.stringify({ results, sourceStable: JSON.stringify(before) === JSON.stringify(after), dist: built ? walk('dist') : null, scope: 'Actual affected generator/storage/session/transport/shader unit + global static + local build; no browser/performance/full-game claim', cloudWrites: false }, null, 2));
process.exitCode = results.some(r => r.exitCode !== 0) ? 1 : 0;
