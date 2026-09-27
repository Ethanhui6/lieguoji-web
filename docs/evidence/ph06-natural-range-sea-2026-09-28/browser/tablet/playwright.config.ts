import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.config.ts';
const run = process.env.NATURAL_RANGE_SEA_BROWSER_RUN;
if (!run || !/^[a-z0-9-]+$/.test(run)) throw new Error('Use the source-bound flow-browser runner with a fresh evidence label');
const dir = path.resolve('.autopilot/ph06/natural-range-sea-browser', run);
export default defineConfig({ ...base, testDir: path.resolve('tests'), testMatch: 'atlas-add-detail-coast.spec.ts', workers: 1, retries: 0, timeout: 450000,
  reporter: [['list'], ['json', { outputFile: path.join(dir, 'results.json') }]], outputDir: path.join(dir, 'artifacts'),
  use: { ...base.use, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
