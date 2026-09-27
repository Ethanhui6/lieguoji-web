import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
const stage = '.autopilot/ph07/hydrology-kernel-staging', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Unique explicit evidence label required');
const out = `${stage}/checks/${label}`;
await mkdir(`${stage}/checks`, { recursive: true }); await mkdir(out);
const ownFiles = ['src/hydrology-kernel.ts', 'src/hydrology-kernel.test.ts', 'tsconfig.json', 'vitest.config.ts', 'run.mjs', 'DESIGN.md'];
const productionFiles = ['detail-coast-geometry.ts', 'detail-coast-field.ts', 'detail-coast-types.ts', 'detail-coast-codec.ts'].map(file => `src/world/${file}`);
const paths = [...ownFiles.map(path => `${stage}/${path}`), ...productionFiles, 'package-lock.json'];
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const digest = data => createHash('sha256').update(data).digest('hex');
async function snapshot() { return Promise.all(paths.map(async path => ({ path, sha256: digest(await readFile(path)) }))); }
const before = await snapshot(); await save(`${out}/source-before.json`, before);
for (const path of ownFiles) {
  const destination = `${out}/candidate-snapshot/${path}`; await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, await readFile(`${stage}/${path}`), { flag: 'wx' });
}
const commands = [
  { name: 'types', args: ['node_modules/typescript/bin/tsc', '--project', `${stage}/tsconfig.json`] },
  { name: 'unit', args: ['node_modules/vitest/vitest.mjs', 'run', '--config', `${stage}/vitest.config.ts`, '--reporter=default', '--reporter=json', `--outputFile.json=${out}/unit.json`] },
];
await save(`${out}/commands.json`, { executable: process.execPath, version: process.version, cwd: process.cwd(), commands, expectedTests: 14,
  scope: 'isolated kernel; only four actual stable production coast imports captured; no production or browser/build acceptance' });
const executions = [];
for (const command of commands) {
  console.log(`START ${command.name}`); let output = ''; const start = performance.now();
  const child = spawn(process.execPath, command.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data.toString(); }); child.stderr.on('data', data => { output += data.toString(); });
  const code = await new Promise(resolve => child.once('close', resolve));
  const execution = { name: command.name, code, durationMs: performance.now() - start }; executions.push(execution);
  await writeFile(`${out}/${command.name}.log`, output, { flag: 'wx' }); await save(`${out}/${command.name}-exit.json`, execution);
  console.log(`END ${command.name} ${code}`); if (code) console.log(output);
}
const after = await snapshot(); await save(`${out}/source-after.json`, after);
let unit = null; try { const result = JSON.parse(await readFile(`${out}/unit.json`, 'utf8')); unit = { total: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests, pending: result.numPendingTests }; } catch { /* Missing result is failure. */ }
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), passed = executions.every(run => run.code === 0) && unit?.total === 14 && unit?.passed === 14 && sourceUnchanged;
const verification = { passed, executions, unit, sourceUnchanged, retries: 0, stageOnly: true, productionAcceptance: false, performanceAcceptance: false, ph07T1Complete: false };
await save(`${out}/verification.json`, verification); console.log(JSON.stringify(verification)); process.exitCode = passed ? 0 : 1;
