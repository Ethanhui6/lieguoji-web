import { defineConfig } from 'vitest/config';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import base from '../../../../vite.config';

const stage = resolve('.autopilot/ph06/height-plane-diagnostic/writer-staging'), repo = process.cwd();
const label = process.env.WRITER_EVIDENCE_LABEL;
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Unique evidence label required');
const proof = resolve(stage, 'checks', label, 'actual-module-loads.jsonl');
const record = (value: object) => appendFileSync(proof, JSON.stringify(value) + '\n');
export default defineConfig({
  // Existing dependent lock/format modules need the real production defines.
  // This precheck does not create a recipe or claim a candidate release fingerprint.
  define: base.define,
  plugins: [{ name: 'isolated-new-land-writer', enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'baseline-natural') return resolve(repo, 'src/world/generation/detail-shape-natural.ts');
      if (!importer || !source.startsWith('.')) return;
      const target = resolve(dirname(importer.split('?')[0]), source);
      const parent = [stage, repo].find(root => { const r = relative(root, target); return !isAbsolute(r) && !r.startsWith('..'); });
      if (!parent) return;
      const logical = relative(parent, target);
      for (const root of [stage, repo]) for (const suffix of ['', '.ts']) {
        const file = resolve(root, logical + suffix);
        if (existsSync(file) && file.endsWith('.ts')) {
          record({ kind: 'resolution', importer, source, resolved: file }); return file;
        }
      }
    },
    transform(_code, id) {
      const file = id.split('?')[0];
      if (file.endsWith('.ts') && existsSync(file)) record({ kind: 'loaded', path: file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
    },
  }],
  test: { include: ['.autopilot/ph06/height-plane-diagnostic/writer-staging/src/world/generation/detail-natural-writer.test.ts'], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0 },
});
