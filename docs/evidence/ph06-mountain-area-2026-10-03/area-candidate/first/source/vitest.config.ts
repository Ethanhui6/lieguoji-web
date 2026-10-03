import { defineConfig, mergeConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import production from '../../../../vite.config';
const root = process.cwd(), stage = path.resolve('.autopilot/ph06/ridge-landform-staging/area-v2');
const generation = path.join(root, 'src/world/generation').replaceAll('\\', '/');
const names = ['fine-range-tree', 'detail-orography', 'terrain-massif'];
const config = mergeConfig(production, defineConfig({ plugins: [{ name: 'isolated-area-mountains', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const resolved = path.resolve(path.dirname(importer), source), normal = resolved.replaceAll('\\', '/');
  const stem = path.basename(resolved).replace(/\.ts$/, '');
  if (path.dirname(normal) === generation && names.includes(stem)) return path.join(stage, 'runtime', `${stem}.ts`);
  if (normal.includes('/ridge-landform-staging/') && /\/(baseline\/)?runtime\//.test(normal) && !fs.existsSync(resolved) && !fs.existsSync(`${resolved}.ts`)) return path.join(root, 'src/world/generation', `${stem}.ts`);
} }] }));
config.test = { ...config.test, include: [`.autopilot/ph06/ridge-landform-staging/area-v2/${process.env.MASSIF_PREVIEW === '1' ? 'preview' : 'area'}.test.ts`], maxWorkers: 1, testTimeout: 120000 };
export default config;
