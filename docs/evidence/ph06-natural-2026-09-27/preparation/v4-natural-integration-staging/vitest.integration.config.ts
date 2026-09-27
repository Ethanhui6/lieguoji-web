import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import * as fingerprints from './scripts/generator-fingerprint';

const repository = process.cwd(), stage = resolve('.autopilot/ph06/v4-natural-integration-staging');
const roots = [stage, resolve(stage, 'dependency-source'), repository];
const choose = (logical: string) => roots.map(base => resolve(base, logical)).find(existsSync);
const read = (file: string) => readFileSync(choose(file) ?? resolve(repository, file), 'utf8');
const definitions: Record<string, string> = {};
for (const [name, fn] of [
  ['MACRO', fingerprints.fingerprintMacroGenerator], ['LANDFORM', fingerprints.fingerprintLandformGenerator],
  ['ISLAND', fingerprints.fingerprintIslandGenerator], ['COAST', fingerprints.fingerprintCoastGenerator],
  ['SHAPE', fingerprints.fingerprintShapeGenerator], ['OCEAN', fingerprints.fingerprintOceanGenerator],
  ['DETAIL_SHAPE', fingerprints.fingerprintDetailShapeGenerator], ['ADD_DETAIL', fingerprints.fingerprintAddDetailGenerator],
  ['NATURAL_DETAIL', fingerprints.fingerprintNaturalDetailGenerator], ['ADD_NATURAL_DETAIL', fingerprints.fingerprintAddNaturalDetailGenerator],
] as const) definitions[`__${name}_GENERATOR_FINGERPRINT__`] = JSON.stringify(fn(read).sha256);
const built = JSON.parse(readFileSync(resolve(stage, 'evidence/preview8/build.json'), 'utf8'));
definitions.__BUILD_SHA__ = JSON.stringify('natural-integration-staging-not-a-product-build');
definitions.__SIM_ENGINE__ = JSON.stringify(built.engineFingerprint);
export default defineConfig({
  define: definitions,
  plugins: [{ name: 'natural-staging-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const target = resolve(dirname(importer.split('?')[0]), source);
    const base = [resolve(stage, 'dependency-source'), stage, repository].find(root => { const r = relative(root, target); return !isAbsolute(r) && !r.startsWith('..'); });
    if (!base) return;
    const logical = relative(base, target);
    for (const suffix of ['', '.ts', '.tsx']) { const file = choose(logical + suffix); if (file) return file; }
  } }],
  test: { include: ['.autopilot/ph06/v4-natural-integration-staging/src/editor/detail-coast-controls.test.ts', '.autopilot/ph06/v4-natural-integration-staging/src/world/detail-natural-integration.test.ts', '.autopilot/ph06/v4-natural-integration-staging/src/world/detail-natural-history.test.ts'], exclude: [], environment: 'node', maxWorkers: 1, fileParallelism: false },
});
