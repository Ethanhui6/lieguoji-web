import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import base from '../../../vite.config.ts';

const staging = path.resolve('.autopilot/ph06/v4-owned-replacement-copy-staging/src/world');
export default defineConfig({
  define: base.define,
  plugins: [{ name: 'owned-replacement-staging-dependencies', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !path.resolve(importer).startsWith(staging + path.sep) || !source.startsWith('.')) return;
    const local = path.resolve(path.dirname(importer), source) + '.ts';
    if (existsSync(local)) return local;
    const production = path.resolve('src/world', source) + '.ts';
    if (existsSync(production)) return production;
  } }],
  test: { include: ['.autopilot/ph06/v4-owned-replacement-copy-staging/src/world/detail-owned-replacement-copy.test.ts'], maxWorkers: 1 },
});
