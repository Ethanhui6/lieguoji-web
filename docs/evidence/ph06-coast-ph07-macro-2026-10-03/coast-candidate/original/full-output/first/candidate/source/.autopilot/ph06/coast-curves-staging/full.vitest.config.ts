import { defineConfig, mergeConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import production from '../../../vite.config';
const stage = path.resolve('.autopilot/ph06/coast-curves-staging');
const outline = path.resolve('src/world/generation/detail-natural-outline');
const config = mergeConfig(production, defineConfig({ plugins: [{ name: 'isolated-one-outline-full-world', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const file = path.resolve(path.dirname(importer), source);
  if (file.replace(/\.ts$/, '') === outline && process.env.COAST_FULL_VARIANT === 'candidate') return path.join(stage, 'runtime/detail-natural-outline.ts');
  const inside = importer.replaceAll('\\', '/');
  if (inside.startsWith(stage.replaceAll('\\', '/')) && /\/(runtime|baseline)\//.test(inside) && !fs.existsSync(file) && !fs.existsSync(`${file}.ts`)) return path.resolve('src/world/generation', `${path.basename(file).replace(/\.ts$/, '')}.ts`);
} }] }));
config.test = { ...config.test, include: ['.autopilot/ph06/coast-curves-staging/full-generation.test.ts'], maxWorkers: 1, testTimeout: 240000 };
export default config;
