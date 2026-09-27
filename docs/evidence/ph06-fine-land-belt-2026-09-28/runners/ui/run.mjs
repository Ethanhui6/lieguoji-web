import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Authored, not executed. Sole purpose: run this one candidate once without
// overwriting a prior round or starting a preview server/build.
const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../..');
const run = process.env.MAP_CHROME_RUN, baseURL = process.env.GAME_BASE_URL;
if (!baseURL || !run || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(run)) {
  throw new Error('Supply verified GAME_BASE_URL and a new lowercase MAP_CHROME_RUN label.');
}
const target = new URL(baseURL);
if (!['http:', 'https:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('Local verified preview URL required.');
}
const output = path.join(here, 'checks', run);
if (existsSync(output)) throw new Error(`Refusing to replace prior UI check evidence: ${output}`);
const child = spawn(process.execPath, [path.join(project, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(here, 'playwright.config.ts')], {
  cwd: project, env: process.env, stdio: 'inherit', shell: false, windowsHide: true,
});
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { if (signal) console.error(`Playwright ended by ${signal}`); process.exitCode = code ?? 1; });
