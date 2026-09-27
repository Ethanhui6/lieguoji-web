import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.config';
const run = process.env.NATURAL_BROWSER_RUN;
if (!run || !/^[a-z0-9-]+$/.test(run)) throw new Error('Use browser.mjs with an explicit evidence name');
const dir = path.resolve('.autopilot/ph06/fine-belt-checks', run);
export default defineConfig({
  ...base,
  testDir: path.resolve('tests'),
  testMatch: 'atlas-add-detail-coast.spec.ts',
  workers: 1,
  retries: 0,
  use: { ...base.use, trace: 'on' },
  reporter: [['list'], ['json', { outputFile: path.join(dir, 'results.json') }]],
  outputDir: path.join(dir, 'artifacts'),
});
