import { defineConfig } from 'vitest/config';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import base from '../../../vite.config';

const stage = resolve('.autopilot/ph06/v4-orography-visual-fix-staging'), repo = process.cwd();
const label = process.env.NATURAL_VISUAL_EVIDENCE_LABEL;
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('A unique evidence label is required');
const proof = resolve(stage, 'checks', label, 'actual-module-loads.jsonl');
const names = ['detail-natural-relief.ts', 'detail-orography.ts'];
const normalized = (value: string) => value.replaceAll('\\', '/').toLowerCase();
const record = (value: object) => appendFileSync(proof, JSON.stringify(value) + '\n');

export default defineConfig({ ...base,
  plugins: [...base.plugins!, { name: 'orography-visual-isolated-overlay', enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return;
      const target = resolve(dirname(importer.split('?')[0]), source), baseRoot = [stage, repo].find(root => {
        const r = relative(root, target); return !isAbsolute(r) && !r.startsWith('..');
      });
      if (!baseRoot) return;
      const logical = relative(baseRoot, target);
      for (const root of [stage, repo]) for (const suffix of ['', '.ts', '.tsx']) {
        const file = resolve(root, logical + suffix);
        if (existsSync(file) && /\.[cm]?[jt]sx?$/.test(file)) {
          if (names.some(name => file.endsWith(name))) record({ kind: 'resolution', importer, source, resolved: file });
          return file;
        }
      }
    },
    transform(_code, id) {
      const file = id.split('?')[0];
      const name = names.find(name => normalized(file).endsWith('/' + name));
      if (!name) return;
      const expected = resolve(stage, 'src/world/generation', name);
      if (normalized(file) !== normalized(expected)) throw new Error(`Candidate alias bypass: ${file}`);
      record({ kind: 'loaded-candidate', path: file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
    },
  }],
  test: { include: [
    '.autopilot/ph06/v4-orography-visual-fix-staging/src/world/generation/detail-orography.test.ts',
    '.autopilot/ph06/v4-orography-visual-fix-staging/src/world/generation/detail-natural-visual-repair.test.ts',
  ], exclude: [], maxWorkers: 1, fileParallelism: false, retry: 0 },
});
