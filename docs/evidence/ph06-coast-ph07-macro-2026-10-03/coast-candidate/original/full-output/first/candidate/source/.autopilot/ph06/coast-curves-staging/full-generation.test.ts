import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateDetailShapeNatural } from '../../../src/world/generation/detail-shape-natural';
import * as outlineModule from '../../../src/world/generation/detail-natural-outline';
import { sampleDetailCoastNode } from '../../../src/world/detail-coast-field';
import { detailCoastNodeOwner, detailCoastOwnerLayout } from '../../../src/world/detail-coast-types';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../../../src/world/detail-coast-codec';
import { loadReplayInput } from '../ridge-landform-staging/area-v2/capture-input';
import { renderPhysicalView } from '../ridge-landform-staging/area-v2/physical-image';
import { renderCoverageView } from './full-sea-image';
import { prepareInput } from './input';
import { bindFullSources, fullStage } from './full-binding';

it('generates one full captured-input world with real fine owner sampling and codec checks', async () => {
  const label = process.env.COAST_FULL_RUN, variant = process.env.COAST_FULL_VARIANT;
  if (!label || !/^[a-z0-9-]+$/.test(label) || !['baseline', 'candidate'].includes(variant ?? '')) throw new Error('Require explicit new full-run label and baseline/candidate.');
  const directory = path.resolve(fullStage, 'full-output', label, variant!);
  mkdirSync(path.dirname(directory), { recursive: true }); mkdirSync(directory);
  const before = bindFullSources();
  writeFileSync(path.join(directory, 'source-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
  for (const source of [...before.productionSources, ...before.harness]) {
    const target = path.join(directory, 'source', source.path); mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(source.path, target);
  }
  try {
    const { raw, input, provenance } = await loadReplayInput(before.capture.path, `${fullStage}/full-views.json`);
    expect(input.recipe.pointsQ).toHaveLength(41); expect(input.recipe.seed).toBe('长岬内海-20260928');
    expect(new Set(input.base.elevationsMeters).size).toBeGreaterThan(1);
    expect(input.base.elevationsMeters.every(height => height < 0)).toBe(true);
    writeFileSync(path.join(directory, 'capture.json'), raw, { flag: 'wx' });
    const base = { format: 'lieguoji-empty-detail-shape-base' as const, version: 1 as const, size: input.base.size,
      centersQ: Int32Array.from(input.base.centersQ).buffer, elevationsMeters: Int32Array.from(input.base.elevationsMeters).buffer,
      detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
    let capturedInput: Parameters<typeof outlineModule.roundAndIndexNaturalOutline>[0] | undefined;
    let capturedOutline: Awaited<ReturnType<typeof outlineModule.roundAndIndexNaturalOutline>> | undefined;
    const original = outlineModule.roundAndIndexNaturalOutline;
    const spy = vi.spyOn(outlineModule, 'roundAndIndexNaturalOutline').mockImplementationOnce(async (...args) => {
      capturedInput = structuredClone(args[0]); capturedOutline = await original(...args); return capturedOutline;
    });
    let generated: Awaited<ReturnType<typeof generateDetailShapeNatural>>;
    try { generated = await generateDetailShapeNatural({ base, recipe: input.recipe }, { batchWork: 2048, yieldControl: async () => {} }); }
    finally { spy.mockRestore(); }
    if (!capturedInput || !capturedOutline) throw new Error('Actual generation did not execute the inspected outline path.');
    const expected = prepareInput(input.recipe.pointsQ, input.recipe.coastStructureWorld, input.recipe.coastRoughnessWorld);
    expect(capturedInput.caps).toEqual(expected.caps); expect(capturedInput.points).toEqual(expected.points);
    expect(capturedOutline.caps.every(cap => Number.isInteger(cap) && cap >= 0 && cap <= Math.max(...expected.caps))).toBe(true);
    expect(generated.summary.natural.maximumEnvelopeWorld).toBe(input.recipe.coastStructureWorld + input.recipe.coastRoughnessWorld);
    expect(generated.summary.natural.relief.profile).toBe('mountain-area-valleys-v1');
    expect(generated.summary.landAreaTwiceQ2 + generated.summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
    expect(generated.summary.islandsRequested).toBe(input.recipe.islandChainCount * input.recipe.islandsPerChain);
    expect(generated.summary.islandsPlaced + generated.summary.skippedIslands.length).toBe(generated.summary.islandsRequested);
    expect(new Set(generated.summary.skippedIslands.map(item => `${item.chain}:${item.island}`)).size).toBe(generated.summary.skippedIslands.length);
    expect(generated.summary.uniformLandTiles).toBe(0);
    const packetRows: { key: string; file: string; bytes: number; sha256: string; ownerNodes: number }[] = [], digest = createHash('sha256');
    let fineNodes = 0, positiveNodes = 0, zeroNodes = 0, negativeNodes = 0;
    mkdirSync(path.join(directory, 'fine'));
    for (const [key, tile] of generated.detailCoast) {
      expect(tile.mode).toBe('samples');
      const encoded = encodeDetailCoastTile(tile), decoded = decodeDetailCoastTile(encoded), reencoded = encodeDetailCoastTile(decoded);
      expect(reencoded).toEqual(encoded);
      const layout = detailCoastOwnerLayout(tile.bx, tile.by), file = `fine/coast-${tile.bx}-${tile.by}.bin`;
      const sha256 = createHash('sha256').update(encoded).digest('hex'); digest.update(key).update(encoded);
      writeFileSync(path.join(directory, file), encoded, { flag: 'wx' }); packetRows.push({ key, file, bytes: encoded.length, sha256, ownerNodes: layout.count });
      fineNodes += layout.count;
      if (tile.mode === 'samples') for (const coverage of tile.coverageQ) {
        if (coverage > 0) positiveNodes++; else if (coverage === 0) zeroNodes++; else negativeNodes++;
      }
    }
    expect(packetRows).toHaveLength(generated.summary.sampledTiles); expect(fineNodes).toBe(positiveNodes + zeroNodes + negativeNodes);
    const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
    const sampleSources = { persistedFineNodes: 0, legacyLandFallbackNodes: 0, seaFallbackNodes: 0 };
    const sample = (xQ: number, yQ: number) => {
      if (xQ % 512 || yQ % 512) throw new Error('Require actual two-world fine owner nodes.');
      const x = xQ / 512, y = yQ / 512, owner = detailCoastNodeOwner(x, y), tile = field.tiles.get(owner.key);
      if (tile?.mode === 'samples') sampleSources.persistedFineNodes++; else if (tile) sampleSources.legacyLandFallbackNodes++; else sampleSources.seaFallbackNodes++;
      return sampleDetailCoastNode(field, x, y);
    };
    const views = input.views.map(view => ({
      physical: renderPhysicalView(path.join(directory, variant!), view, (x, y) => sample(x, y).heightMeters, input.recipe.reliefMeters),
      coverage: renderCoverageView(path.join(directory, variant!), view, (x, y) => sample(x, y).coverageQ),
    }));
    expect(sampleSources.legacyLandFallbackNodes).toBe(0); expect(sampleSources.persistedFineNodes).toBeGreaterThan(0);
    writeFileSync(path.join(directory, 'fine/index.json'), JSON.stringify({ packets: packetRows, packetDigest: digest.digest('hex'), fineNodes, positiveNodes, zeroNodes, negativeNodes }, null, 2), { flag: 'wx' });
    writeFileSync(path.join(directory, 'coarse-heights.i32'), new Uint8Array(generated.coarseElevations.buffer), { flag: 'wx' });
    writeFileSync(path.join(directory, 'target-coast.u32'), new Uint8Array(generated.targetCoast), { flag: 'wx' });
    writeFileSync(path.join(directory, 'outline.json'), JSON.stringify({ input: capturedInput, edges: capturedOutline.edges, caps: capturedOutline.caps }), { flag: 'wx' });
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ variant, provenance, sampleSources, views, summary: generated.summary,
      fineField: { tiles: packetRows.length, fineNodes, positiveNodes, zeroNodes, negativeNodes, codecRoundtrips: packetRows.length },
      caps: { minimumSource: Math.min(...capturedInput.caps), maximumSource: Math.max(...capturedInput.caps),
        minimumRemaining: Math.min(...capturedOutline.caps), maximumRemaining: Math.max(...capturedOutline.caps), outlineNodes: capturedOutline.edges.length },
      scope: 'Actual complete generation, natural ocean base and persisted fine owner data. Baseline is built23; candidate changes only rounded outline. CPU physical/coverage images, not browser, storage or visual acceptance.' }, null, 2), { flag: 'wx' });
  } finally {
    const after = bindFullSources(); writeFileSync(path.join(directory, 'source-after.json'), JSON.stringify(after, null, 2), { flag: 'wx' }); expect(after).toEqual(before);
  }
}, 240000);
