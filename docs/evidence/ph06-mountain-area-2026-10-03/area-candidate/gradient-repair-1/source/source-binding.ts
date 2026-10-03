import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const stage = '.autopilot/ph06/ridge-landform-staging/area-v2';
const provenancePath = '.autopilot/ph06/v4-preview22-history-staging/evidence/preview22/provenance.json';
const frozenProvenanceSha256 = 'e1849e864ee8272f1bc9a62b0a20a6ea45a94ec023f51b57120a1418e219238a';
const currentHistorySha256 = '177fe69d7e0f3fa1eb1bf02875b0701553f7a5be877596167d6db7f77bd5ed11';
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
export function captureBinding() {
  if (hash(provenancePath) !== frozenProvenanceSha256) throw new Error('Frozen22 source provenance changed.');
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as { sources: { file: string; sha256: string }[] };
  if (provenance.sources.length !== 48) throw new Error('Expected actual22 48-source provenance.');
  const sources = provenance.sources.map(source => {
    const actual = hash(source.file), history = source.file === 'src/world/generation-history.ts';
    if (actual !== (history ? currentHistorySha256 : source.sha256)) throw new Error(`Unexpected current source change: ${source.file}`);
    return { path: source.file, frozen22Sha256: source.sha256, actualSha256: actual,
      difference: history && actual !== source.sha256 ? 'root-authorized-preview22-storage-history-wiring' : null };
  });
  const files = ['runtime/fine-range-tree.ts', 'runtime/detail-orography.ts', 'runtime/terrain-massif.ts', 'preview.test.ts', 'physical-image.ts',
    'capture-input.ts', 'source-binding.ts', 'vitest.config.ts', 'physical-views.json', 'check-and-preview.mjs', 'typecheck.mjs', 'area.test.ts', 'gradient-noise.test.ts'];
  const harness = files.map(file => ({ path: `${stage}/${file}`, sha256: hash(`${stage}/${file}`) }));
  const base = '.autopilot/ph06/ridge-landform-staging';
  const actual22Reference = ['checks/physical-owner-repair-1/verification.json', 'output/baseline-physical-owner-repair-1/result.json',
    'output/baseline-physical-owner-repair-1/source-before.json'].map(file => ({ path: `${base}/${file}`, sha256: hash(`${base}/${file}`) }));
  return { frozenProvenanceSha256, provenancePath, sources, harness, actual22Reference,
    note: 'Baseline is actual22 owner-node run; candidate uses current explicit22 history wiring. Not claimed byte-identical across all48 sources.' };
}
