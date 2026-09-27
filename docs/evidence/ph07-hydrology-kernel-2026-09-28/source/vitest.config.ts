import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['.autopilot/ph07/hydrology-kernel-staging/src/hydrology-kernel.test.ts'], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0 } });
