import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Authored, not run. The parent owns the verified build/preview process. This
// config never starts a server or silently reuses an unidentified stale dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.GAME_BASE_URL;
const run = process.env.MAP_CHROME_RUN;
if (!baseURL || !run || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(run)) {
  throw new Error('Supply verified GAME_BASE_URL and a new lowercase MAP_CHROME_RUN label.');
}
const target = new URL(baseURL);
if (!['http:', 'https:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('The staged UI check is local-only; GAME_BASE_URL must identify the parent-owned local preview.');
}
const output = path.join(here, 'checks', run);
// The one-shot run.mjs launcher protects prior output before starting Playwright.
// Do not put that existence check here: workers may reload their config after
// the parent reporter has legitimately created this run's output directory.

export default defineConfig({
  testDir: path.join(here, 'tests'),
  testMatch: 'atlas-map-chrome.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 10000 },
  outputDir: path.join(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'map-chrome-responsive-chromium', use: {
    ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1, isMobile: false, hasTouch: false,
  } }],
});
