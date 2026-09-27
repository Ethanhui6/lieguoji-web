import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import * as fingerprints from './scripts/generator-fingerprint';

const repository = process.cwd(), stage = resolve('.autopilot/ph06/v4-additive-integration-staging');
const read = (file: string) => readFileSync(existsSync(resolve(stage, file)) ? resolve(stage, file) : resolve(repository, file), 'utf8');
const definitions: Record<string, string> = {};
for (const [name, fn] of [
  ['MACRO', fingerprints.fingerprintMacroGenerator], ['LANDFORM', fingerprints.fingerprintLandformGenerator],
  ['ISLAND', fingerprints.fingerprintIslandGenerator], ['COAST', fingerprints.fingerprintCoastGenerator],
  ['SHAPE', fingerprints.fingerprintShapeGenerator], ['OCEAN', fingerprints.fingerprintOceanGenerator],
  ['DETAIL_SHAPE', fingerprints.fingerprintDetailShapeGenerator], ['ADD_DETAIL', fingerprints.fingerprintAddDetailGenerator],
] as const) definitions[`__${name}_GENERATOR_FINGERPRINT__`] = JSON.stringify(fn(read).sha256);
const built = JSON.parse(readFileSync(resolve(stage, 'evidence/preview7/build.json'), 'utf8'));
definitions.__BUILD_SHA__ = JSON.stringify(built.commit); definitions.__SIM_ENGINE__ = JSON.stringify(built.engineFingerprint);
export default defineConfig({
  define: definitions,
  plugins: [{ name: 'additive-staging-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const target = resolve(dirname(importer.split('?')[0]), source), fromStage = relative(stage, target), fromRepo = relative(repository, target);
    const logical = !isAbsolute(fromStage) && !fromStage.startsWith('..') ? fromStage : fromRepo;
    if (isAbsolute(logical) || logical.startsWith('..')) return;
    for (const suffix of ['', '.ts', '.tsx']) if (existsSync(resolve(stage, logical + suffix))) return resolve(stage, logical + suffix);
    for (const suffix of ['', '.ts', '.tsx']) if (existsSync(resolve(repository, logical + suffix))) return resolve(repository, logical + suffix);
  } }],
  test: { include: ['.autopilot/ph06/v4-additive-integration-staging/src/world/detail-add-integration.test.ts', '.autopilot/ph06/v4-additive-integration-staging/src/world/detail-add-history.test.ts'], exclude: [], environment: 'node', maxWorkers: 1, fileParallelism: false },
});
