import { defineConfig } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const stage = path.join(root, '.autopilot/ph06/fine-world-relief-staging');
const names = ['detail-natural-relief', 'detail-orography'];
export default defineConfig({
  plugins: [{ name: 'staged-relief-only', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const resolved = path.resolve(path.dirname(importer), source);
    const normal = resolved.replaceAll('\\', '/');
    const stem = path.basename(resolved).replace(/\.ts$/, '');
    if (importer.includes('/baseline/') || importer.includes('\\baseline\\')) {
      if (names.includes(stem)) return path.join(stage, 'baseline', `${stem}.ts`);
      return path.join(root, 'src/world/generation', `${stem}.ts`);
    }
    if (normal.includes('/fine-world-relief-staging/src/world/generation/') && !fs.existsSync(`${resolved}.ts`) && !fs.existsSync(resolved)) {
      return path.join(root, 'src/world/generation', `${stem}.ts`);
    }
    if (normal.includes('/src/world/generation/') && !normal.includes('/.autopilot/') && names.includes(stem)) {
      return path.join(stage, 'src/world/generation', `${stem}.ts`);
    }
  } }],
  test: { include: ['.autopilot/ph06/fine-world-relief-staging/*.test.ts', 'src/world/generation/detail-orography.test.ts'], maxWorkers: 1, testTimeout: 10000 }
});
