import { defineConfig } from 'vitest/config';
import base from '../../../vite.config.ts';
export default defineConfig({ ...base, cacheDir: '.autopilot/ph07/reader-staging/.vite-cache', test: {
  ...base.test, include: ['.autopilot/ph07/reader-staging/src/world/hydrology-reader-owned.test.ts'], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0,
} });
