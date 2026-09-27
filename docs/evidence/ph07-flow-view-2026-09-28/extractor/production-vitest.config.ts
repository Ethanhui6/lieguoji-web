import { defineConfig } from 'vitest/config';
import base from '../../../vite.config.ts';
export default defineConfig({ ...base, test: { include: ['src/world/hydrology-kernel.test.ts', 'src/world/hydrology-snapshot.test.ts'], maxWorkers: 1, fileParallelism: false, retry: 0 } });
