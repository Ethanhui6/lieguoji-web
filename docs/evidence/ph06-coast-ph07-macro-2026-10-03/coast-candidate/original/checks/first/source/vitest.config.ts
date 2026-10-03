import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
const stage = path.resolve('.autopilot/ph06/coast-curves-staging');
export default defineConfig({ plugins: [{ name: 'isolated-outline-dependencies', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const file = path.resolve(path.dirname(importer), source), inside = importer.replaceAll('\\', '/');
  if (inside.startsWith(stage.replaceAll('\\', '/')) && /\/(runtime|baseline)\//.test(inside) && !fs.existsSync(file) && !fs.existsSync(`${file}.ts`)) {
    return path.resolve('src/world/generation', `${path.basename(file).replace(/\.ts$/, '')}.ts`);
  }
} }], test: { include: [`.autopilot/ph06/coast-curves-staging/${process.env.COAST_CURVE_PREVIEW === '1' ? 'preview' : 'corners'}.test.ts`], maxWorkers: 1, testTimeout: 60000 } });
