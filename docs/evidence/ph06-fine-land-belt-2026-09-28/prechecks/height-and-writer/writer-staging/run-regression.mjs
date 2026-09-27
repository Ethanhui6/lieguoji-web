import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const stage = '.autopilot/ph06/height-plane-diagnostic/writer-staging', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('New unique evidence label required');
const out = `${stage}/checks/${label}`;
await mkdir(`${stage}/checks`, { recursive: true }); await mkdir(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => writeFile(`${out}/${file}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const candidate = `${stage}/src/world/generation/detail-shape-natural.ts`;
const inputs = [candidate, `${stage}/regression/src/world/generation/detail-natural-writer.test.ts`, `${stage}/regression.config.ts`, `${stage}/run-regression.mjs`,
  ...['detail-shape-natural.ts', 'detail-shape-natural-add.ts', 'detail-shape-height.ts', 'detail-natural-relief.ts', 'detail-orography.ts', 'detail-shape-distance.ts', 'detail-natural-outline.ts'].map(f => `src/world/generation/${f}`),
  ...['detail-coast-types.ts', 'detail-coast-codec.ts', 'detail-coast-geometry.ts', 'detail-coast-field.ts', 'detail-coast-locks.ts'].map(f => `src/world/${f}`)];
const snapshot = () => Promise.all(inputs.map(async path => ({ path, sha256: hash(await readFile(path)) })));
const before = await snapshot(); await save('source-before.json', before);
const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/regression.config.ts`, '--reporter=default', '--reporter=json', `--outputFile.json=${out}/unit.json`];
await save('commands.json', { executable: process.execPath, cwd: process.cwd(), args, expectedTests: 6, noBuildNoBrowserNoFullSuite: true });
let log = ''; const child = spawn(process.execPath, args, { windowsHide: true, env: { ...process.env, WRITER_EVIDENCE_LABEL: label }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
const code = await new Promise(resolveCode => child.on('close', resolveCode));
await writeFile(`${out}/unit.log`, log, { flag: 'wx' });
const after = await snapshot(); await save('source-after.json', after);
let report = null, loads = [];
try { report = JSON.parse(await readFile(`${out}/unit.json`, 'utf8')); } catch { /* Missing report fails closed. */ }
try { loads = (await readFile(`${out}/actual-module-loads.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); } catch { /* Missing actual-loader evidence fails closed. */ }
const normalize = path => path.replaceAll('\\', '/').toLowerCase();
const loaded = loads.filter(r => r.kind === 'loaded');
const actualLoadedSources = await Promise.all(loaded.map(async row => ({ ...row, unchangedAfterRun: hash(await readFile(row.path)) === row.sha256 })));
await save('actual-loaded-sha.json', actualLoadedSources);
const candidateLoaded = loaded.some(row => normalize(row.path) === normalize(resolve(candidate)) && row.sha256 === before[0].sha256);
const baselineLoaded = loaded.some(row => normalize(row.path) === normalize(resolve('src/world/generation/detail-shape-natural.ts')));
const additiveUsesCandidate = loads.some(row => row.kind === 'resolution'
  && normalize(row.importer.split('?')[0]) === normalize(resolve('src/world/generation/detail-shape-natural-add.ts'))
  && normalize(row.resolved) === normalize(resolve(candidate)));
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after) && actualLoadedSources.every(row => row.unchangedAfterRun);
const passed = code === 0 && report?.numTotalTests === 6 && report.numPassedTests === 6 && report.numPendingTests === 0 && candidateLoaded && !baselineLoaded && additiveUsesCandidate && sourceUnchanged;
const verification = { passed, code, tests: report && { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests }, candidateLoaded, baselineLoaded, additiveUsesCandidate, sourceUnchanged,
  stageOnly: true, combinedWithCurvedCandidate: false, normalProductionTestImportsOnly: true, visualAcceptance: false, performanceAcceptance: false, productionAcceptance: false };
await save('verification.json', verification); console.log(JSON.stringify(verification)); if (!passed) console.log(log); process.exitCode = passed ? 0 : 1;
