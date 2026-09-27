import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import base from '../../../vite.config';

const root = process.cwd(), stage = path.resolve(root, '.autopilot/ph06/v4-private-ingress-staging');
export default defineConfig({ ...base,
  plugins: [...(base.plugins ?? []), {
    name: 'private-ingress-owned-bridge-only', enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith('.') || !importer) return;
      const target = path.resolve(path.dirname(importer.split('?')[0]), source), relative = path.relative(stage, target);
      if (path.isAbsolute(relative) || relative.startsWith('..')) return;
      // Only bridge is substituted. All other staged-test/mirror imports use
      // exactly the same current production modules as their final src path.
      const logical = relative.replaceAll('\\', '/');
      const mapped = logical === 'src/world/bridge' || logical === 'src/world/bridge.ts' ? target : path.resolve(root, relative);
      for (const suffix of ['', '.ts', '.tsx']) if (existsSync(mapped + suffix) && /\.tsx?$/.test(mapped + suffix)) return mapped + suffix;
    },
  }],
  test: { ...base.test, include: ['.autopilot/ph06/v4-private-ingress-staging/src/world/detail-private-ingress.test.ts'], maxWorkers: 1, retry: 0 },
});
