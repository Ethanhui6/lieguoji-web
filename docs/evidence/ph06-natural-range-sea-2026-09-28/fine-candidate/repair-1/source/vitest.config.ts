import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/natural-ranges-staging');
const production = path.join(root, 'src/world/generation').replaceAll('\\', '/');
const names = ['detail-natural-relief', 'detail-orography', 'fine-range-tree'];
export default defineConfig({ plugins: [{ name: 'isolated-natural-ranges', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const resolved = path.resolve(path.dirname(importer), source), normal = resolved.replaceAll('\\', '/');
  const stem = path.basename(resolved).replace(/\.ts$/, '');
  if (path.dirname(normal) === production && names.includes(stem)) return path.join(stage, 'src/world/generation', `${stem}.ts`);
  if (normal.includes('/natural-ranges-staging/src/world/generation/') && !fs.existsSync(resolved) && !fs.existsSync(`${resolved}.ts`)) return path.join(root, 'src/world/generation', `${stem}.ts`);
} }], test: { include: ['.autopilot/ph06/natural-ranges-staging/*.test.ts', 'src/world/generation/detail-orography.test.ts'], maxWorkers: 1, testTimeout: 10000 } });
