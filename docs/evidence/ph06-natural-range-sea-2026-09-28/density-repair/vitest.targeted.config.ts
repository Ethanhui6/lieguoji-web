import { defineConfig, mergeConfig } from 'vitest/config';
import production from '../../../vite.config';
export default mergeConfig(production, defineConfig({ test: { include: [
  'src/world/generation/regional-coast-field.test.ts',
  'src/world/generation/detail-orography-density.test.ts',
  'src/world/generation/detail-orography.test.ts',
  'src/world/generation/detail-fine-world-relief.test.ts',
  'src/world/generation/detail-natural-ranges.test.ts',
  'src/world/generation/detail-natural-ranges-writer.test.ts',
  'src/world/generation/detail-natural-writer.test.ts',
], maxWorkers: 1 } }));
