import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
export default defineConfig({ testDir: '.', testMatch: 'touch-confirm-diagnostic.spec.ts', workers: 1, retries: 0, timeout: 180000,
  reporter: [['list'], ['json', { outputFile: '.autopilot/ph07/touch-confirm-diagnostic/results.json' }]], outputDir: path.resolve('.autopilot/ph07/touch-confirm-diagnostic/artifacts'),
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4175', trace: 'on' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort', cwd: process.cwd(), url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
