import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root = process.cwd(), diagnostic = path.join(root, '.autopilot/ph06/natural-range-sea-density-repair/diagnostic');
export default defineConfig({ plugins: [{ name: 'density-diagnostic', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const resolved = path.resolve(path.dirname(importer), source).replaceAll('\\', '/');
  if (resolved === path.join(root, 'src/world/generation/detail-orography').replaceAll('\\', '/')) return path.join(diagnostic, 'detail-orography.ts');
  if (importer.replaceAll('\\', '/').includes('/natural-range-sea-density-repair/diagnostic/')) return path.join(root, 'src/world/generation', `${path.basename(source)}.ts`);
} }], test: { include: ['.autopilot/ph06/natural-range-sea-density-repair/diagnose.test.ts'], maxWorkers: 1 } });
