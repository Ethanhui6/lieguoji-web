import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { stagedImports } from './vitest.config.mjs';
const root = process.cwd(), stage = resolve(root, '.autopilot/ph06/v4-continuous-light-staging');
const label = process.argv[2]; if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('A fresh explicit evidence label is required');
const folder = resolve(stage, 'checks', label); if (existsSync(folder)) throw new Error('Refusing to replace existing evidence'); mkdirSync(folder, { recursive: true });
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.name === 'checks' || entry.name === 'vite-cache' ? [] : entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
const snapshot = () => [...files(resolve(root, 'src')), ...files(stage)].sort().map(path => ({ path: relative(root, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
const save = (name, value) => writeFileSync(resolve(folder, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const before = snapshot(); save('source-before.json', before);
const commands = [];
const run = (name, args) => {
  const startedAt = new Date().toISOString(), result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  writeFileSync(resolve(folder, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`, { flag: 'wx' });
  const record = { name, command: [process.execPath, ...args], startedAt, endedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message ?? null }; commands.push(record); save(`${name}.result.json`, record); console.log(JSON.stringify(record)); return result.status === 0;
};
const gpuOnly = process.argv[3] === '--gpu-only'; let unitReuse = null;
if (gpuOnly) {
  const previous = JSON.parse(readFileSync(resolve(stage, 'checks/first/verification.json'), 'utf8'));
  const snapshot = JSON.parse(readFileSync(resolve(stage, 'checks/first/source-before.json'), 'utf8'));
  const stableUnitInputs = before.filter(item => item.path.startsWith('src/') || /src\/world\/detail-terrain-(shader|light.test)\.ts$/.test(item.path)).every(item => snapshot.some(old => old.path === item.path && old.sha256 === item.sha256));
  if (!previous.unit || !stableUnitInputs) throw new Error('Cannot reuse unit evidence: source changed or previous unit failed');
  unitReuse = { path: '.autopilot/ph06/v4-continuous-light-staging/checks/first/unit.raw.json', stableUnitInputs };
}
const unit = gpuOnly ? null : run('unit', ['node_modules/vitest/vitest.mjs', 'run', '--config', resolve(stage, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${resolve(folder, 'unit.raw.json')}`]);
const lint = run('lint', ['node_modules/eslint/bin/eslint.js', '--no-ignore', resolve(stage, 'src/world/detail-terrain-shader.ts'), resolve(stage, 'src/world/detail-terrain-light.test.ts'), resolve(stage, 'gpu-harness.ts'), resolve(stage, 'run.mjs'), resolve(stage, 'typecheck.mjs'), resolve(stage, 'vitest.config.mjs')]);
const types = run('types', [resolve(stage, 'typecheck.mjs')]);
let gpu = false, server, browser; const events = [];
if ((unit || unitReuse) && lint && types) {
  const startedAt = new Date().toISOString();
  try {
    server = await createServer({ configFile: false, root, plugins: [stagedImports()], cacheDir: resolve(stage, 'vite-cache'), logLevel: 'warn', server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/*'] } } }); await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/.autopilot/ph06/v4-continuous-light-staging/gpu-harness.html`;
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
    page.on('console', message => events.push({ type: message.type(), text: message.text() })); page.on('pageerror', error => events.push({ type: 'pageerror', text: error.stack ?? error.message }));
    await page.goto(url); await page.waitForFunction(() => typeof window.continuousLightRun === 'function', { timeout: 30000 });
    const result = await page.evaluate(() => window.continuousLightRun());
    const errors = events.filter(event => event.type === 'error' || event.type === 'pageerror'); gpu = result.passed && !errors.length;
    save('gpu.raw.json', { ...result, startedAt, endedAt: new Date().toISOString(), browserVersion: browser.version(), url, events });
    await page.screenshot({ path: resolve(folder, 'gpu-harness.png') }); console.log(JSON.stringify({ gpu, probes: result.probes.length, failures: result.failures.length, exception: result.exception }));
  } catch (error) { save('gpu.error.json', { startedAt, endedAt: new Date().toISOString(), error: String(error), stack: error.stack, events }); console.error(error); }
  finally { await browser?.close(); await server?.close(); }
}
const after = snapshot(); save('source-after.json', after);
const sourceStable = JSON.stringify(before) === JSON.stringify(after), passed = !!(unit || unitReuse) && lint && types && gpu && sourceStable;
save('verification.json', { passed, unit, unitReuse, lint, types, gpu, sourceStable, commands, scope: '6 new CPU cases (or source-verified reuse) and isolated actual WebGL2 shader probes; no product visual or performance acceptance' });
process.exitCode = passed ? 0 : 1;
