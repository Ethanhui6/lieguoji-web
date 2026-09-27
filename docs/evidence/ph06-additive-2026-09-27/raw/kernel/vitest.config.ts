import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const stage = resolve('.autopilot/ph06/v4-additive-staging/src');
export default defineConfig({
  plugins: [{ name: 'staged-new-files-read-production-dependencies', enforce: 'pre', resolveId(source, importer) {
    if (!importer?.replaceAll('\\', '/').startsWith(stage.replaceAll('\\', '/')) || !source.startsWith('.')) return;
    const target = resolve(dirname(importer), source), path = relative(stage, target);
    if (isAbsolute(path) || path.startsWith('..') || existsSync(`${target}.ts`)) return;
    const production = resolve('src', path);
    if (existsSync(`${production}.ts`)) return `${production}.ts`;
  } }],
  test: { include: ['.autopilot/ph06/v4-additive-staging/src/world/generation/detail-shape-add.test.ts'], exclude: [], environment: 'node', fileParallelism: false },
});
