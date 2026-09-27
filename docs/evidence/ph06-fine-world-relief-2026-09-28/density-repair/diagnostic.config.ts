import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/fine-world-density-repair');
export default defineConfig({ plugins: [{ name: 'diagnostic-only', enforce: 'pre', resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  if (source === './detail-orography') return path.join(stage, 'diagnostic-orography.ts');
  if (importer.replaceAll('\\', '/').endsWith('/diagnostic-orography.ts')) return path.join(root, 'src/world/generation', `${source.slice(2)}.ts`);
} }], test: { include: ['.autopilot/ph06/fine-world-density-repair/diagnostic.test.ts'], maxWorkers: 1 } });
