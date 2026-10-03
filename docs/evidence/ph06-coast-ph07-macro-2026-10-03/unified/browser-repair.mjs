import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base = '.autopilot/ph07/macro-coast-checks', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('Fresh label required');
const out = `${base}/${label}`, prior = `${base}/ui-repair-1`;
if (fs.existsSync(out)) throw Error('Never overwrite evidence');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = `${d}/${e.name}`; if (e.isSymbolicLink()) throw Error('Unexpected symlink');
  return e.isDirectory() ? walk(p) : [{ path: p, sha256: hash(p) }];
});
const snapshot = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(path => ({ path, sha256: hash(path) }))];
const v = read(`${prior}/verification.json`), original = read(`${prior}/source-after.json`), before = snapshot();
if (!v.passed || !v.sourceStable || !v.unit.passed || v.unit.aggregatePassedAssertions !== 439) throw Error('Missing passed source-bound prerequisite');
const allowed = ['tests/atlas-hydrology-macro.spec.ts', 'tests/helpers/atlas-hydrology-macro-readonly.ts'];
const current = new Map(before.map(r => [r.path, r.sha256]));
const changed = original.filter(r => current.get(r.path) !== r.sha256).map(r => r.path);
const paths = new Set(original.map(r => r.path)); changed.push(...before.filter(r => !paths.has(r.path)).map(r => r.path));
if (changed.some(p => !allowed.includes(p))) throw Error('Unexpected production/test mutation: ' + changed.join(', '));
const dist = walk('dist');
if (JSON.stringify(dist) !== JSON.stringify(v.dist) || hash('dist/build.json') !== v.buildJsonSha256) throw Error('Production build changed');
fs.mkdirSync(out); const save = (p, value) => fs.writeFileSync(`${out}/${p}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
save('source-before.json', before);
const results = [];
for (const [name, args] of [['lint', ['node_modules/eslint/bin/eslint.js', ...allowed]], ['types', ['node_modules/typescript/bin/tsc', '--noEmit']]]) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(`${out}/${name}.log`, (r.stdout ?? '') + (r.stderr ?? ''));
  results.push({ name, args, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - start, exitCode: r.status, signal: r.signal });
  console.log(JSON.stringify(results.at(-1))); if (r.status !== 0) break;
}
const after = snapshot(), sourceStable = JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(dist) === JSON.stringify(walk('dist'));
save('source-after.json', after);
const reuse = { prerequisite: prior, prerequisiteSha256: hash(`${prior}/verification.json`), sourceSha256: hash(`${prior}/source-after.json`), changed,
  productionUnchanged: true, unitAssertionsReused: 439, unitAssertionsRerun: 0, buildReusedUnchanged: true, generatorIdentitiesReused: 11 };
save('reused-checks.json', reuse);
fs.copyFileSync('dist/build.json', `${out}/build.json`);
fs.copyFileSync(`${prior}/identity-verification.json`, `${out}/identity-verification.json`);
const passed = sourceStable && results.length === 2 && results.every(r => r.exitCode === 0 && !r.signal);
save('verification.json', { ...v, results, sourceStable, allCommandsPassed: passed, passed, reuse,
  unit: { ...v.unit, rerunAssertions: 0, reused: reuse }, scope: 'Browser-only early cancellation observation and native input repair. Production/build/dist and 439 assertions reused byte-exact from passing prerequisite.' });
console.log(JSON.stringify({ out, passed, changed, buildJsonSha256: v.buildJsonSha256 })); process.exitCode = passed ? 0 : 1;
