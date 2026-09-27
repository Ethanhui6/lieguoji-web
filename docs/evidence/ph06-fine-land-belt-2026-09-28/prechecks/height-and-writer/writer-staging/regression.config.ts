import { defineConfig } from 'vitest/config';
import { appendFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import precheck from './vitest.config';

const stage = resolve('.autopilot/ph06/height-plane-diagnostic/writer-staging'), regression = resolve(stage, 'regression');
const proof = resolve(stage, 'checks', process.env.WRITER_EVIDENCE_LABEL!, 'actual-module-loads.jsonl');
export default defineConfig({ ...precheck,
  plugins: [{ name: 'production-regression-entry-only', enforce: 'pre',
    resolveId(source, importer) {
      if (!importer?.startsWith(regression.replaceAll('\\', '/')) || !source.startsWith('.')) return;
      const logical = relative(regression, resolve(dirname(importer), source));
      for (const root of [stage, process.cwd()]) for (const suffix of ['', '.ts']) {
        const file = resolve(root, logical + suffix);
        if (existsSync(file) && file.endsWith('.ts')) {
          appendFileSync(proof, JSON.stringify({ kind: 'resolution', importer, source, resolved: file }) + '\n'); return file;
        }
      }
    },
  }, ...precheck.plugins!],
  test: { include: ['.autopilot/ph06/height-plane-diagnostic/writer-staging/regression/src/world/generation/detail-natural-writer.test.ts'], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0 },
});
