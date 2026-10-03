import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fingerprintNaturalDetailGenerator } from '../../../scripts/generator-fingerprint';
export const fullStage = '.autopilot/ph06/coast-curves-staging';
const outline = 'src/world/generation/detail-natural-outline.ts';
export const rawHash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
export function bindFullSources() {
  if (rawHash(outline) !== rawHash(`${fullStage}/baseline/detail-natural-outline.ts`)) throw new Error('Actual production outline differs from the checked baseline.');
  const baseline = fingerprintNaturalDetailGenerator();
  const build = JSON.parse(readFileSync('dist/build.json', 'utf8')) as { version: string; naturalDetailGenerator: { sha256: string }; commit: string };
  if (build.version !== '0.5.0-preview.23' || build.naturalDetailGenerator.sha256 !== baseline.sha256) throw new Error('Need actual built23 generator as the unchanged baseline.');
  const candidate = fingerprintNaturalDetailGenerator(file => readFileSync(file === outline ? `${fullStage}/runtime/detail-natural-outline.ts` : file, 'utf8'));
  const harnessFiles = ['runtime/detail-natural-outline.ts', 'baseline/detail-natural-outline.ts', 'input.ts', 'full-views.json',
    'full-binding.ts', 'full-generation.test.ts', 'full-sea-image.ts', 'full.vitest.config.ts', 'full-typecheck.mjs', 'full-check.mjs'];
  const reused = ['.autopilot/ph06/ridge-landform-staging/area-v2/capture-input.ts', '.autopilot/ph06/ridge-landform-staging/area-v2/physical-image.ts'];
  return { actualBuildVersion: build.version, actualBuildCommit: build.commit, buildJsonSha256: rawHash('dist/build.json'), baseline, candidate,
    onlyRuntimeReplacement: { source: outline, candidate: `${fullStage}/runtime/detail-natural-outline.ts` },
    productionSources: baseline.files.map(file => ({ path: file, sha256: rawHash(file) })),
    harness: [...harnessFiles.map(file => `${fullStage}/${file}`), ...reused].map(file => ({ path: file, sha256: rawHash(file) })),
    capture: { path: '.autopilot/ph06/demo22-replay/runs/2026-09-27T22-49-07.265Z/capture.json',
      sha256: rawHash('.autopilot/ph06/demo22-replay/runs/2026-09-27T22-49-07.265Z/capture.json') } };
}
