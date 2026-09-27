import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import production from '../../../vite.config';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/ocean-material-staging');
const changed = new Set(['src/world/terrain-material.ts', 'src/world/terrain-mesh.ts', 'src/world/renderer.ts']);
const stagedTests = ['terrain-material.test.ts', 'terrain-mesh.test.ts', 'ocean-material.test.ts', 'ocean-material-cache.test.ts', 'renderer.test.ts'].map(file => `src/world/${file}`);
const overlays = new Set([...changed, ...stagedTests]);
const preservedTests = ['detail-terrain-shader', 'detail-terrain-light', 'detail-terrain-pages', 'detail-terrain-backend', 'renderer-detail-reuse'].map(file => `src/world/${file}.test.ts`);
const config = mergeConfig(production, defineConfig({
  cacheDir: path.join(staging, '.vite-cache'),
  plugins: [{ name: 'ocean-material-source-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.') && !path.isAbsolute(source)) return null;
    let absolute = path.resolve(path.dirname(importer.split('?')[0]), source);
    let relative = path.relative(staging, absolute).replaceAll('\\', '/');
    if (relative.startsWith('src/')) absolute = path.resolve(root, relative);
    const candidate = absolute.endsWith('.ts') ? absolute : `${absolute}.ts`;
    relative = path.relative(root, candidate).replaceAll('\\', '/');
    if (overlays.has(relative)) return path.resolve(staging, relative);
    return existsSync(candidate) ? candidate : null;
  } }],
  test: { maxWorkers: 1 },
}));
config.test = { ...config.test, include: [...stagedTests.map(file => path.relative(root, path.join(staging, file)).replaceAll('\\', '/')), ...preservedTests], maxWorkers: 1 };
export default config;
