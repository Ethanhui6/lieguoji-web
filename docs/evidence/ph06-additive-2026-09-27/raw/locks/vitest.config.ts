import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import production from '../../../vite.config';

const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/v4-lock-staging');
/** Execute only the staged patch, resolving unchanged dependencies from the
 * frozen working source. This neither copies over source nor alters globals. */
export default defineConfig({
  ...production,
  plugins: [{ name: 'fine-lock-staging-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    const clean = path.resolve(importer.split('?')[0]), logical = clean.startsWith(`${stage}${path.sep}`) ? path.join(root, path.relative(stage, clean)) : clean;
    const requested = path.resolve(path.dirname(logical), source);
    if (!requested.startsWith(`${root}${path.sep}src${path.sep}`)) return null;
    for (const candidate of [requested, `${requested}.ts`, `${requested}.tsx`, path.join(requested, 'index.ts')]) {
      const staged = path.join(stage, path.relative(root, candidate));
      if (existsSync(staged)) return staged;
      if (existsSync(candidate)) return candidate;
    }
    return null;
  } }],
  test: { include: ['.autopilot/ph06/v4-lock-staging/src/world/detail-coast-locks.test.ts'], maxWorkers: 1, fileParallelism: false, retry: 0 },
});
