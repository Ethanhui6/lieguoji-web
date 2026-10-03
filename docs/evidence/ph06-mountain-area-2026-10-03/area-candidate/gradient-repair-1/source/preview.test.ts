import { expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateDetailShapeNatural } from '../../../../src/world/generation/detail-shape-natural';
import { sampleDetailCoastNode } from '../../../../src/world/detail-coast-field';
import { detailCoastNodeOwner } from '../../../../src/world/detail-coast-types';
import * as orography from './runtime/detail-orography';
import { loadReplayInput } from './capture-input';
import { renderPhysicalView } from './physical-image';
import { captureBinding } from './source-binding';

it('renders one area candidate from the shared actual capture at physical owner nodes', async () => {
  const stage = '.autopilot/ph06/ridge-landform-staging/area-v2', label = process.env.MASSIF_RUN ?? 'first';
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Require a new safe output label.');
  const directory = path.resolve(stage, 'output', label);
  mkdirSync(path.dirname(directory), { recursive: true }); mkdirSync(directory);
  const before = captureBinding(); writeFileSync(path.join(directory, 'source-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
  for (const source of before.harness) { const target = path.join(directory, 'source', path.relative(stage, source.path)); mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(source.path, target); }
  try {
    const { raw, input, provenance } = await loadReplayInput('.autopilot/ph06/demo22-replay/runs/2026-09-27T22-49-07.265Z/capture.json', `${stage}/physical-views.json`);
    expect(input.recipe.pointsQ).toHaveLength(41); expect(input.recipe.seed).toBe('长岬内海-20260928');
    writeFileSync(path.join(directory, 'capture.json'), raw, { flag: 'wx' });
    let captured: Awaited<ReturnType<typeof orography.createOrographyField>> | undefined;
    const original = orography.createOrographyField, spy = vi.spyOn(orography, 'createOrographyField').mockImplementationOnce(async (...args) => { captured = await original(...args); return captured; });
    const base = { format: 'lieguoji-empty-detail-shape-base' as const, version: 1 as const, size: input.base.size,
      centersQ: Int32Array.from(input.base.centersQ).buffer, elevationsMeters: Int32Array.from(input.base.elevationsMeters).buffer,
      detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
    let generated: Awaited<ReturnType<typeof generateDetailShapeNatural>>;
    try { generated = await generateDetailShapeNatural({ base, recipe: input.recipe }, { batchWork: 2048, yieldControl: async () => {} }); }
    finally { spy.mockRestore(); }
    if (!captured || !('massif' in captured)) throw new Error('Candidate area field did not execute.');
    const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
    const sampleSources = { persistedFineNodes: 0, legacyLandFallbackNodes: 0, seaFallbackNodes: 0 };
    const sample = (xQ: number, yQ: number) => {
      if (xQ % 512 || yQ % 512) throw new Error('Require actual 2-world owner nodes.');
      const x = xQ / 512, y = yQ / 512, tile = field.tiles.get(detailCoastNodeOwner(x, y).key);
      if (tile?.mode === 'samples') sampleSources.persistedFineNodes++; else if (tile) sampleSources.legacyLandFallbackNodes++; else sampleSources.seaFallbackNodes++;
      return sampleDetailCoastNode(field, x, y).heightMeters;
    };
    const views = input.views.map(view => renderPhysicalView(path.join(directory, 'candidate'), view, sample, input.recipe.reliefMeters));
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ provenance, sampleSources, views, profile: captured.massif.profile,
      areaStats: captured.massif.stats, bodies: captured.massif.bodies, junctions: captured.massif.junctions, guideRibbonStats: captured.stats,
      summary: generated.summary, scope: 'Candidate generation-only mountain-area/valley elevation. Receiver forest is not a saved river/water contract. Owner-node CPU picture, not product visual acceptance.' }, null, 2), { flag: 'wx' });
  } finally { const after = captureBinding(); writeFileSync(path.join(directory, 'source-after.json'), JSON.stringify(after, null, 2), { flag: 'wx' }); expect(after).toEqual(before); }
}, 240000);
