import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base = '.autopilot/ph07/flow-checks', label = process.argv[2] ?? 'first', dir = `${base}/${label}`;
if (!/^[a-z0-9-]+$/.test(label) || fs.existsSync(dir)) throw Error('Fresh named round required');
const hash = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = `${d}/${e.name}`; if (e.isSymbolicLink()) throw Error('Source symlink'); return e.isDirectory() ? walk(p) : [{ path: p, sha256: hash(p) }]; });
const snapshot = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(path => ({ path, sha256: hash(path) }))];
const allFiles = ['src/world/hydrology-kernel.test.ts', 'src/world/hydrology-snapshot.test.ts', 'src/world/hydrology-trace.test.ts', 'src/world/hydrology-worker.test.ts', 'src/world/bridge.test.ts', 'src/world/atlas.worker.test.ts', 'src/world/renderer.test.ts', 'src/world/renderer-detail-reuse.test.ts', 'src/editor/hydrology-controls.test.ts', 'src/editor/atlas-operation-feedback.test.ts'];
const repair = process.argv[3] === 'renderer-repair';
if (process.argv[3] && !repair) throw Error('Unknown check scope');
const files = repair ? allFiles.slice(6) : allFiles;
let reused = null;
if (repair) {
  const original = read(`${base}/first/verification.json`), originalSource = new Map(read(`${base}/first/source-after.json`).map(row => [row.path, row.sha256]));
  if (!original.passed || original.unit.total !== 221 || original.unit.passed !== 221) throw Error('Actual first221 checks required');
  const current = snapshot();
  const changed = current.filter(row => originalSource.get(row.path) !== row.sha256).map(row => row.path);
  const allowed = ['src/world/renderer.ts', 'src/world/renderer-detail-reuse.test.ts', 'tests/atlas-hydrology.spec.ts', 'src/editor/AtlasStudio.tsx', 'src/editor/DetailCoastPanel.tsx', 'src/editor/atlas-studio.css'];
  if (current.length !== originalSource.size || changed.some(file => !allowed.includes(file))) throw Error('Changes exceed renderer/native-browser repair scope');
  reused = { verification: `${base}/first/verification.json`, sha256: hash(`${base}/first/verification.json`), unchangedFiles: allFiles.slice(0, 6), changedSources: changed,
    reason: 'Renderer framing, fixed preview action footer and native-browser assertions changed; original221 includes unchanged kernel/snapshot/trace/Worker/bridge contracts. Re-run affected renderer/UI plus global static/build checks. Native touch results are recorded separately.' };
}
if (read('package.json').version !== '0.5.0-preview.19') throw Error('Expected local19 source');
const baseline = read(`${base}/baseline-build.json`);
if (baseline.version !== '0.5.0-preview.18' || hash(`${base}/baseline-build.json`) !== '444d8380a0a4a5c8a42f99c7baeb3dfc5d0ef30b303f4e8571e622f27babdcd5') throw Error('Actual18 baseline required');
fs.mkdirSync(dir); const before = snapshot(), save = (p, v) => fs.writeFileSync(`${dir}/${p}`, JSON.stringify(v, null, 2) + '\n');
save('source-before.json', before);
const commands = [['plan', ['scripts/check-plan.mjs']], ['lint', ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts']], ['types', ['node_modules/typescript/bin/tsc', '--noEmit']], ['unit', ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=json', `--outputFile=${dir}/unit.json`]], ['build', ['node_modules/vite/bin/vite.js', 'build']], ['dist-audit', ['scripts/check-dist.mjs']]];
const results = [];
for (const [name, args] of commands) {
  const startedAt = new Date().toISOString(), start = performance.now(), r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  fs.writeFileSync(`${dir}/${name}.log`, (r.stdout ?? '') + (r.stderr ?? ''));
  const result = { name, args, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - start, exitCode: r.status, signal: r.signal }; results.push(result); console.log(JSON.stringify(result)); if (r.status !== 0) break;
}
const after = snapshot(); save('source-after.json', after);
const sourceStable = JSON.stringify(before) === JSON.stringify(after);
let unit = null; if (fs.existsSync(`${dir}/unit.json`)) { const u = read(`${dir}/unit.json`); const observed = u.testResults.map(f => path.relative(process.cwd(), f.name).replaceAll('\\', '/')).sort(); unit = { total: u.numTotalTests, passed: u.numPassedTests, failed: u.numFailedTests, pending: u.numPendingTests, success: u.success, scopeMatches: JSON.stringify(observed) === JSON.stringify([...files].sort()) }; }
let build = null, identitiesUnchanged = false, dist = [];
if (results.length === commands.length && results.every(r => r.exitCode === 0)) {
  build = read('dist/build.json'); fs.copyFileSync('dist/build.json', `${dir}/build.json`);
  identitiesUnchanged = build.engineFingerprint === baseline.engineFingerprint && Object.keys(baseline).filter(k => k.endsWith('Generator')).every(k => JSON.stringify(build[k]) === JSON.stringify(baseline[k]));
  dist = walk('dist');
}
const passed = sourceStable && results.length === commands.length && results.every(r => r.exitCode === 0) && unit?.success && unit.scopeMatches && unit.total === unit.passed && unit.failed === 0 && unit.pending === 0 && identitiesUnchanged;
save('verification.json', { recordedAt: new Date().toISOString(), passed, sourceStable, results, unit, reused, version: build?.version, buildJsonSha256: build ? hash('dist/build.json') : null, priorGeneratorAndEngineIdentitiesUnchanged: identitiesUnchanged, dist, scope: 'Affected local read-only hydrology/Worker/bridge/renderer contracts. Browser, natural visual, complete river systems, PH and real devices remain separate.', browserPassed: false, phaseAccepted: false, cloudWrites: false });
console.log(JSON.stringify({ passed, unit, sourceStable, identitiesUnchanged })); if (!passed) process.exitCode = 1;
