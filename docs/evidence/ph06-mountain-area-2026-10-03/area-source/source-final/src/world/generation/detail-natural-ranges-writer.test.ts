import { expect, it, vi } from 'vitest';
import { generateDetailShapeNatural } from './detail-shape-natural';
import * as reliefModule from './detail-natural-relief';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../detail-coast-codec';
import { detailCoastOwnerLayout } from '../detail-coast-types';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { buildDetailCoastSurface } from '../detail-coast-geometry';

it('writes the actual small rectangle tree to every real fine node and restores identical codec coordinates without mutating the sea source', async () => {
  const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < heights.length; id++) { centers[id * 2] = (id % size * 32 + 16) * 256; centers[id * 2 + 1] = (Math.floor(id / size) * 32 + 16) * 256; }
  const originalCentres = centers.slice(), originalSea = heights.slice(), tiles = new Map();
  let physical: Awaited<ReturnType<typeof reliefModule.createNaturalRelief>> | undefined;
  const original = reliefModule.createNaturalRelief, spy = vi.spyOn(reliefModule, 'createNaturalRelief').mockImplementationOnce(async (...args) => {
    physical = await original(...args); return physical;
  });
  let next: Awaited<ReturnType<typeof generateDetailShapeNatural>>;
  try {
    next = await generateDetailShapeNatural({ base: { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer,
      detailCoast: tiles, locksPresent: false, entitiesPresent: false, generationPresent: false }, recipe: { format: 'lieguoji-natural-shape-recipe', version: 2,
      seed: 'explicit-fine-new-land', coastStructureWorld: 16, coastRoughnessWorld: 0, reliefMeters: 2200, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 2,
      pointsQ: [[1024, 1024], [1664, 1024], [1664, 1536], [1024, 1536]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })) }
    }, { batchWork: 2048, yieldControl: async () => {} });
  } finally { spy.mockRestore(); }
  expect(physical?.rangeTree).toBeDefined();
  expect(physical?.summary.profile).toBe('mountain-area-valleys-v1');
  expect(physical?.massif).toBeDefined();
  expect(centers).toEqual(originalCentres); expect(heights).toEqual(originalSea); expect(tiles.size).toBe(0);
  const restored = new Map([...next!.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
  let landNodes = 0, seaNodes = 0, positiveDifferences = 0;
  for (const [key, tile] of next!.detailCoast) {
    expect(encodeDetailCoastTile(restored.get(key)!)).toEqual(encodeDetailCoastTile(tile));
    if (tile.mode !== 'samples') throw new Error('New natural land must own its actual fine elevations.');
    const layout = detailCoastOwnerLayout(tile.bx, tile.by), rebuilt = restored.get(key)!;
    if (rebuilt.mode !== 'samples') throw new Error('Codec lost explicit samples.');
    for (let slot = 0; slot < layout.count; slot++) {
      const xQ = (layout.startX + slot % layout.width) * 512, yQ = (layout.startY + Math.floor(slot / layout.width)) * 512;
      expect(rebuilt.coverageQ[slot]).toBe(tile.coverageQ[slot]); expect(rebuilt.elevationMeters[slot]).toBe(tile.elevationMeters[slot]);
      if (tile.coverageQ[slot] > 0) {
        expect(tile.elevationMeters[slot]).toBe(physical!.physicalHeight(xQ, yQ, true, tile.coverageQ[slot], -1));
        if (slot && tile.elevationMeters[slot] !== tile.elevationMeters[slot - 1]) positiveDifferences++;
        expect(tile.elevationMeters[slot]).toBeGreaterThanOrEqual(0); landNodes++;
      } else if (tile.coverageQ[slot] < 0) { expect(tile.elevationMeters[slot]).toBeLessThan(0); seaNodes++; }
      else { expect(tile.elevationMeters[slot]).toBe(0); }
    }
  }
  expect(landNodes).toBeGreaterThan(50000); expect(seaNodes).toBeGreaterThan(1000); expect(positiveDifferences).toBeGreaterThan(10000);
  const sampleBaseElevation = createDetailShapeBaseSampler(size, centers.buffer, next!.coarseElevations.buffer as ArrayBuffer);
  for (const rectangle of [{ column: 620, row: 620, columns: 16, rows: 16 }, { column: 510, row: 570, columns: 4, rows: 4 }]) {
    expect(buildDetailCoastSurface({ tiles: restored, sampleBaseElevation }, rectangle)).toEqual(buildDetailCoastSurface({ tiles: next!.detailCoast, sampleBaseElevation: next!.sampleBaseElevation }, rectangle));
  }
}, 60000);
