import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const stage = '.autopilot/ph06/v4-natural-visual-repair-staging', label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('An explicit new evidence label is required');
const out = `${stage}/checks/${label}`, sources = ['detail-shape-natural.ts', 'detail-natural-outline.ts', 'detail-natural-relief.ts', 'detail-natural-visual-repair.test.ts'].map(file => `${stage}/src/world/generation/${file}`);
const onlyContinuity = process.argv[3] === 'continuity-only', onlyNew = onlyContinuity || process.argv[3] === 'new-only', expectedCases = onlyContinuity ? 1 : onlyNew ? 5 : 15;
await mkdir(`${stage}/checks`, { recursive: true }); await mkdir(out);
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function walk(path) { const paths = []; for (const e of await readdir(path, { withFileTypes: true })) { const p = `${path}/${e.name}`; if (e.isDirectory()) paths.push(...await walk(p)); else paths.push(p); } return paths; }
async function snapshot() { return Promise.all([...await walk('src'), ...sources, `${stage}/vitest.config.ts`, `${stage}/typecheck.mjs`, `${stage}/run.mjs`, 'vite.config.ts', 'tsconfig.json', 'package-lock.json'].sort().map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))); }
const before = await snapshot(); await save(`${out}/source-before.json`, before);
const commands = [
  { name: 'typecheck', args: [`${stage}/typecheck.mjs`] },
  { name: 'lint', args: ['node_modules/eslint/bin/eslint.js', '--no-ignore', '--max-warnings', '0', ...sources] },
  { name: 'unit', args: ['node_modules/vitest/vitest.mjs', 'run', ...(onlyNew ? [sources.at(-1)] : []), ...(onlyContinuity ? ['-t', 'finite ridge endpoint extension'] : []), '--config', `${stage}/vitest.config.ts`, '--reporter=default', '--reporter=json', `--outputFile.json=${out}/unit.json`] },
];
await save(`${out}/commands.json`, { cwd: process.cwd(), executable: process.execPath, node: process.version, commands, performanceClaim: false });
const results = [];
for (const command of commands) {
  console.log(`START ${command.name}`); let log = ''; const start = performance.now();
  const child = spawn(process.execPath, command.args, { env: { ...process.env, NATURAL_VISUAL_EVIDENCE_LABEL: label }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { log += b.toString(); }); child.stderr.on('data', b => { log += b.toString(); });
  const code = await new Promise(resolve => child.once('close', resolve));
  await writeFile(`${out}/${command.name}.log`, log, { flag: 'wx' }); const row = { name: command.name, code, durationMs: performance.now() - start }; results.push(row); await save(`${out}/${command.name}-exit.json`, row);
  console.log(`END ${command.name} exit=${code}`); if (code) console.log(log);
}
const after = await snapshot(); await save(`${out}/source-after.json`, after);
let unit = null; try { const raw = JSON.parse(await readFile(`${out}/unit.json`, 'utf8')); unit = { total: raw.numTotalTests, passed: raw.numPassedTests, failed: raw.numFailedTests, pending: raw.numPendingTests }; } catch { /* Missing raw report remains failure. */ }
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), passed = results.every(row => row.code === 0) && unit?.total === expectedCases && unit?.passed === expectedCases && sourceUnchanged;
await save(`${out}/verification.json`, { results, unit, sourceUnchanged, passed, retries: 0, numericalEvidenceDirectory: out, noPerformanceAcceptance: true });
console.log(JSON.stringify({ results, unit, sourceUnchanged, passed })); process.exitCode = passed ? 0 : 1;
