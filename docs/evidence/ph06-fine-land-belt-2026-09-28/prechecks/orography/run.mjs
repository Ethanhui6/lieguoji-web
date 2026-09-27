import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const stage = '.autopilot/ph06/v4-orography-visual-fix-staging', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('A new unique evidence label is required');
const out = `${stage}/checks/${label}`, expectedCases = 21;
const sources = ['detail-natural-relief.ts', 'detail-orography.ts', 'detail-orography.test.ts', 'detail-natural-visual-repair.test.ts'].map(file => `${stage}/src/world/generation/${file}`);
await mkdir(`${stage}/checks`, { recursive: true }); await mkdir(out);
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = value => value.replaceAll('\\', '/').toLowerCase();
async function walk(path) {
  const paths = []; for (const e of await readdir(path, { withFileTypes: true })) {
    const p = `${path}/${e.name}`; if (e.isDirectory()) paths.push(...await walk(p)); else paths.push(p);
  } return paths;
}
async function snapshot() {
  return Promise.all([...await walk('src'), ...sources, `${stage}/vitest.config.ts`, `${stage}/run.mjs`, 'vite.config.ts', 'tsconfig.json', 'package-lock.json'].sort()
    .map(async path => ({ path, sha256: hash(await readFile(path)) })));
}
const before = await snapshot(); await save(`${out}/source-before.json`, before);
const originalTest = await readFile('src/world/generation/detail-natural-visual-repair.test.ts', 'utf8');
const copiedTest = await readFile(sources[3], 'utf8');
const originalProductTestPreserved = copiedTest.replaceAll(stage, '.autopilot/ph06/v4-natural-visual-repair-staging').replaceAll('\r\n', '\n') === originalTest.replaceAll('\r\n', '\n');
if (!originalProductTestPreserved) throw new Error('Original product test changed beyond evidence destination');
const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=default', '--reporter=json', `--outputFile.json=${out}/unit.json`];
await save(`${out}/commands.json`, { cwd: process.cwd(), executable: process.execPath, node: process.version, args, expectedCases, originalProductTestPreserved, noBuildNoBrowserNoGlobalChecks: true });
console.log(`START isolated numerical precheck ${label}`);
let log = ''; const start = performance.now();
const child = spawn(process.execPath, args, { env: { ...process.env, NATURAL_VISUAL_EVIDENCE_LABEL: label }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', b => { log += b.toString(); }); child.stderr.on('data', b => { log += b.toString(); });
const code = await new Promise(resolveCode => child.once('close', resolveCode));
await writeFile(`${out}/unit.log`, log, { flag: 'wx' });
const execution = { code, durationMs: performance.now() - start }; await save(`${out}/unit-exit.json`, execution);
const after = await snapshot(); await save(`${out}/source-after.json`, after);
let unit = null, loads = [];
try { const raw = JSON.parse(await readFile(`${out}/unit.json`, 'utf8')); unit = { total: raw.numTotalTests, passed: raw.numPassedTests, failed: raw.numFailedTests, pending: raw.numPendingTests }; } catch { /* Missing raw report is failure. */ }
try { loads = (await readFile(`${out}/actual-module-loads.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); } catch { /* Missing module proof is failure. */ }
const loadedCandidateHashes = sources.slice(0, 2).every(path => loads.some(row => row.kind === 'loaded-candidate' && normalized(row.path) === normalized(resolve(path)) && row.sha256 === before.find(file => file.path === path).sha256));
const actualProductImportUsesCandidate = loads.some(row => row.kind === 'resolution'
  && normalized(row.importer.split('?')[0]) === normalized(resolve('src/world/generation/detail-shape-natural.ts'))
  && normalized(row.resolved) === normalized(resolve(sources[0])));
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after);
const passed = code === 0 && unit?.total === expectedCases && unit?.passed === expectedCases && sourceUnchanged && originalProductTestPreserved && loadedCandidateHashes && actualProductImportUsesCandidate;
const verification = { execution, unit, sourceUnchanged, originalProductTestPreserved, loadedCandidateHashes, actualProductImportUsesCandidate, passed,
  retries: 0, numericalEvidenceDirectory: out, stageOnly: true, productionAcceptance: false, visualAcceptance: false, performanceAcceptance: false };
await save(`${out}/verification.json`, verification);
console.log(JSON.stringify(verification)); if (code) console.log(log); process.exitCode = passed ? 0 : 1;
