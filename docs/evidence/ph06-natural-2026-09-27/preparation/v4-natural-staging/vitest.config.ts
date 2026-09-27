import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const stage = resolve('.autopilot/ph06/v4-natural-staging/src');
export default defineConfig({
  plugins: [{ name: 'natural-staging-production-dependencies', enforce: 'pre', resolveId(source, importer) {
    if (!importer?.replaceAll('\\', '/').startsWith(stage.replaceAll('\\', '/')) || !source.startsWith('.')) return;
    const target = resolve(dirname(importer), source), logical = relative(stage, target);
    if (isAbsolute(logical) || logical.startsWith('..') || existsSync(`${target}.ts`)) return;
    const production = resolve('src', logical); if (existsSync(`${production}.ts`)) return `${production}.ts`;
  } }],
  test: { include: ['.autopilot/ph06/v4-natural-staging/src/world/generation/detail-shape-natural.test.ts'], exclude: [], environment: 'node', fileParallelism: false, maxWorkers: 1 },
});
