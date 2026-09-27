import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const name = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid run name');
const out = `.autopilot/ph06/additive-checks/${name}`;
if (fs.existsSync(out)) throw new Error('Evidence already exists');
fs.mkdirSync(out, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => { const file = path.join(dir, e.name); return e.isDirectory() ? walk(file) : [{ path: file.replaceAll('\\', '/'), sha256: hash(file) }]; }); }
const snapshot = () => [...walk('src'), ...walk('scripts'), ...walk('tests'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(file => ({ path: file, sha256: hash(file) }))];
const repairingIo = name.startsWith('repair-io');
const unitFiles = name.startsWith('repair-io-pages') ? ['src/world/atlas-worker-stage-pages.test.ts'] : repairingIo ? [
  'atlas-worker-stage-pages', 'detail-private-ingress', 'atlas.worker', 'bridge',
  'detail-coast-transport', 'generation-receiver', 'constraints-receiver',
].map(file => `src/world/${file}.test.ts`) : fs.readdirSync('src/world').filter(f => /\.test\.ts$/.test(f) && /^(detail-|generation-|coastal-generation|constraints-|cooperative-ownership|replacement-cooperation|surface-format-storage|storage|transactions|atlas\.worker|bridge)/.test(f)).map(f => `src/world/${f}`);
if (!repairingIo) unitFiles.push(...fs.readdirSync('src/world/generation').filter(f => f.endsWith('.test.ts')).map(f => `src/world/generation/${f}`));
const checks = [
  ['plan', ['scripts/check-plan.mjs']],
  ['lint', ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts']],
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', ...unitFiles, '--reporter=json', `--outputFile=${out}/unit.json`]],
  ['build', ['node_modules/vite/bin/vite.js', 'build']],
  ['dist-audit', ['scripts/check-dist.mjs']],
];
const before = snapshot(), results = [];
fs.writeFileSync(`${out}/source-before.json`, JSON.stringify(before, null, 2));
fs.writeFileSync(`${out}/scope.json`, JSON.stringify({ unitFiles, unchangedScopeReused: repairingIo ? 'Original preview.8 first run 602 tests reused outside this Worker page/private ingress repair; UI recipe restoration is verified in the browser. No whole-game or performance claim.' : 'Previous preview.7 camera/render/legacy sim unit and unchanged release-policy checks; no whole-game or performance claim' }, null, 2));
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
