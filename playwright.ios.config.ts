import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'fms-ios-render.spec.ts', workers: 1, retries: 0, timeout: 180000,
  reporter: [['list']],
  use: { ...devices['iPhone 13'], baseURL: 'http://127.0.0.1:4175/ios-proof/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'ios-portrait', use: { viewport: { width:393, height:852 } } },
    { name: 'ios-landscape', use: { viewport: { width:852, height:393 } } },
  ],
  webServer: { command: 'npx vite build --base=/ios-proof/ --outDir=.autopilot/ios-proof-dist && node scripts/ios-proof-server.mjs', url: 'http://127.0.0.1:4175/ios-proof/', timeout: 120000 },
});
