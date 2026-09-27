import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import base from '../../../vite.config';
const stage = resolve('.autopilot/ph06/v4-natural-visual-repair-staging'), repo = process.cwd();
export default defineConfig({ ...base,
  plugins: [...base.plugins!, { name: 'natural-visual-repair-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const target = resolve(dirname(importer.split('?')[0]), source), baseRoot = [stage, repo].find(root => { const r = relative(root, target); return !isAbsolute(r) && !r.startsWith('..'); });
    if (!baseRoot) return;
    const logical = relative(baseRoot, target);
    for (const root of [stage, repo]) for (const suffix of ['', '.ts', '.tsx']) { const file = resolve(root, logical + suffix); if (existsSync(file) && /\.[cm]?[jt]sx?$/.test(file)) return file; }
  } }],
  test: { include: ['src/world/generation/detail-shape-natural.test.ts', '.autopilot/ph06/v4-natural-visual-repair-staging/src/world/generation/detail-natural-visual-repair.test.ts'], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0 },
});
