import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const dir = '.autopilot/country-response/checks/selection-repair-1', base = '.autopilot/country-response/checks/first';
if (fs.existsSync(dir)) throw new Error('Never overwrite evidence'); fs.mkdirSync(dir, { recursive: true });
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex'), read = p => JSON.parse(fs.readFileSync(p));
const before = read(`${base}/source-after.json`), prior = read(`${base}/verification.json`), changed = before.filter(r => sha(r.path) !== r.sha256).map(r => r.path);
if (!prior.passed || JSON.stringify(changed) !== JSON.stringify(['src/editor/CountryStudio.tsx', 'tests/country-world.spec.ts'])) throw new Error('Unexpected source changes');
const current = () => before.map(r => ({ path: r.path, bytes: fs.statSync(r.path).size, sha256: sha(r.path) })), start = current(), rounds = [];
fs.writeFileSync(`${dir}/source-before.json`, JSON.stringify(start, null, 2));
for (const [name, entry, args] of [['lint', 'node_modules/eslint/bin/eslint.js', ['src','tests','scripts']], ['types', 'node_modules/typescript/bin/tsc', ['--noEmit']], ['build', 'node_modules/vite/bin/vite.js', ['build']], ['dist', 'scripts/check-dist.mjs', []]]) {
  const t = Date.now(), r = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 180000 });
  fs.writeFileSync(`${dir}/${name}.log`, (r.stdout ?? '') + '\n' + (r.stderr ?? '')); rounds.push({ name, exitCode: r.status, elapsedMs: Date.now() - t }); if (r.status !== 0) process.exitCode = 1;
}
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => { const f = `${p}/${e.name}`; return e.isDirectory() ? walk(f) : [{ path: f, bytes: fs.statSync(f).size, sha256: sha(f) }]; });
const after = current(), stable = JSON.stringify(start) === JSON.stringify(after);
fs.writeFileSync(`${dir}/source-after.json`, JSON.stringify(after, null, 2)); fs.writeFileSync(`${dir}/dist-files.json`, JSON.stringify(walk('dist'), null, 2)); fs.copyFileSync('dist/build.json', `${dir}/build.json`);
const oldBuild = read(`${base}/build.json`), build = read('dist/build.json');
const identity = prior.identity.map(row => ({ key: row.key, unchanged: JSON.stringify(oldBuild[row.key]) === JSON.stringify(build[row.key]) }));
const result = { ...prior, at: new Date().toISOString(), passed: !process.exitCode && stable && identity.every(i => i.unchanged), sourceStable: stable, rounds, identity, buildSha256: sha('dist/build.json'),
  reused: { from: base, checks: ['release-policy', 'unit'], reason: 'Only cross-country draft selection and its browser regression changed; full lint/types/build/dist rerun, unchanged 165 unit and 22 release-policy evidence reused; final native browser checks follow' }, changed };
fs.writeFileSync(`${dir}/verification.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;

