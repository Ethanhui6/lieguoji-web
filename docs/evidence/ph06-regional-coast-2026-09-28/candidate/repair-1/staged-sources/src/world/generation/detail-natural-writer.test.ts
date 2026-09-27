import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { generateDetailShapeNatural, type NaturalDetailShapeRecipe, type EmptyDetailShapeBase, type NaturalDetailShapeOutput } from './detail-shape-natural';
import { generateNaturalDetailShapeAdd, type NaturalDetailShapeAddBase } from './detail-shape-natural-add';
import * as reliefModule from './detail-natural-relief';
import { buildDetailShapeDistanceIndex } from './detail-shape-distance';
import { detailCoastOwnerLayout, type DetailCoastTiles, type DetailCoastKey, type DetailCoastTile } from '../detail-coast-types';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../detail-coast-codec';
import { buildDetailCoastSurface } from '../detail-coast-geometry';
import { createDetailShapeBaseSampler } from './detail-shape-height';

const noWait = async () => {};
function base(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < heights.length; id++) { centers[id * 2] = (id % size * 32 + 16) * 256; centers[id * 2 + 1] = (Math.floor(id / size) * 32 + 16) * 256; }
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
function recipe(): NaturalDetailShapeRecipe {
  return { format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'explicit-fine-new-land', coastStructureWorld: 16, coastRoughnessWorld: 0,
    reliefMeters: 2200, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 2,
    pointsQ: [[1024, 1024], [1664, 1024], [1664, 1536], [1024, 1536]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })) };
}
const bytes = (tiles: DetailCoastTiles) => [...tiles].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]);
const captures: Awaited<ReturnType<typeof reliefModule.createNaturalRelief>>[] = [];
const originalRelief = reliefModule.createNaturalRelief;
vi.spyOn(reliefModule, 'createNaturalRelief').mockImplementation(async (...args) => {
  const actual = await originalRelief(...args); captures.push(actual); return actual;
});
let source: EmptyDetailShapeBase, next: NaturalDetailShapeOutput;
let physical: Awaited<ReturnType<typeof reliefModule.createNaturalRelief>>;
beforeAll(async () => {
  source = base();
  next = await generateDetailShapeNatural({ base: source, recipe: recipe() }, { batchWork: 2048, yieldControl: noWait });
  physical = captures.at(-1)!;
}, 60000);

describe('new natural land writes true fine height without reinterpreting v4', () => {
  it('stores actual physicalHeight at every positive node including saturated interior, with independently recomputed coast distances', async () => {
    expect([...next.detailCoast.values()].every(tile => tile.mode === 'samples')).toBe(true);
    expect(next.summary.uniformLandTiles).toBe(0);
    const index = await buildDetailShapeDistanceIndex({ coordinates: next.targetCoast, segmentCount: next.summary.targetSegments }, { yieldControl: noWait });
    let checked = 0, coastChecked = 0, saturated = 0;
    for (const tile of next.detailCoast.values()) if (tile.mode === 'samples') {
      const layout = detailCoastOwnerLayout(tile.bx, tile.by);
      for (let slot = 0; slot < layout.count; slot++) if (tile.coverageQ[slot] > 0) {
        const x = (layout.startX + slot % layout.width) * 512, y = (layout.startY + Math.floor(slot / layout.width)) * 512;
        const coverage = tile.coverageQ[slot], expected = physical.physicalHeight(x, y, true, coverage, -1);
        if (tile.elevationMeters[slot] !== expected) throw new Error(`Physical height was reconstructed ${x}:${y}`);
        if (++checked % 127 === 0 || coverage < 512) {
          const distance = index.sample(x, y, 1);
          if (coverage !== distance.coverageQ) throw new Error(`Wrong target-coast distance ${x}:${y}`); coastChecked++;
        }
        if (coverage === 32767) saturated++;
      }
    }
    expect(checked).toBeGreaterThan(50000); expect(coastChecked).toBeGreaterThan(300); expect(saturated).toBeGreaterThan(10000);
  });

  it('roundtrips explicit fine samples and the unchanged persisted Hbase through the existing codec', () => {
    const restored = new Map([...next.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const sampler = createDetailShapeBaseSampler(source.size, source.centersQ, next.coarseElevations.buffer as ArrayBuffer);
    expect(bytes(restored)).toEqual(bytes(next.detailCoast));
    for (const rectangle of [{ column: 620, row: 620, columns: 16, rows: 16 }, { column: 510, row: 570, columns: 4, rows: 4 }]) {
      expect(buildDetailCoastSurface({ tiles: restored, sampleBaseElevation: sampler }, rectangle))
        .toEqual(buildDetailCoastSurface({ tiles: next.detailCoast, sampleBaseElevation: next.sampleBaseElevation }, rectangle));
    }
    for (let y = 1100; y <= 1150; y += 2) for (let x = 1100; x <= 1150; x += 2) expect(sampler(x * 256, y * 256)).toBe(next.sampleBaseElevation(x * 256, y * 256));
    expect(new Int32Array(source.elevationsMeters).every(h => h === -2400)).toBe(true); expect(source.detailCoast.size).toBe(0);
  });

  it('preserves ownership and deterministic fine bytes across batch boundaries and source mutation', async () => {
    const input = base(), instruction = recipe(); let changed = false;
    const replay = await generateDetailShapeNatural({ base: input, recipe: instruction }, { batchWork: 64, yieldControl: async () => {
      if (!changed) { changed = true; new Int32Array(input.elevationsMeters).fill(0); instruction.seed = 'mutated'; instruction.pointsQ[0].xQ = 0; }
    } });
    expect(bytes(replay.detailCoast)).toEqual(bytes(next.detailCoast)); expect(replay.coarseElevations).toEqual(next.coarseElevations);
    expect(replay.targetCoast).toEqual(next.targetCoast); expect(replay.summary).toEqual(next.summary);
  }, 60000);

  it('cancels within the actual expanded fine-height work without publishing or mutating input', async () => {
    const input = base(), abort = new AbortController(); let observed = false;
    await expect(generateDetailShapeNatural({ base: input, recipe: recipe() }, { signal: abort.signal, batchWork: 128, yieldControl: noWait,
      onProgress: (phase, done, total) => { if (phase === 'write-continuous-heights') { expect(done).toBeLessThanOrEqual(total); observed = true; abort.abort(); } },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(observed).toBe(true); expect(input.detailCoast.size).toBe(0); expect(new Int32Array(input.elevationsMeters).every(h => h === -2400)).toBe(true);
  }, 60000);
});

function additiveBase(): NaturalDetailShapeAddBase {
  const source = base(), heights = new Int32Array(source.elevationsMeters), centers = new Int32Array(source.centersQ);
  for (let id = 0; id < heights.length; id++) {
    const x = centers[id * 2] / 256, y = centers[id * 2 + 1] / 256;
    if (x > 256 && x < 384 && y > 256 && y < 320) heights[id] = 400;
  }
  const layout = detailCoastOwnerLayout(5, 4), explicitHeights = new Int16Array(layout.count);
  for (let i = 0; i < layout.count; i++) explicitHeights[i] = 600 + i % layout.width;
  return { format: 'lieguoji-detail-shape-add-base', version: 1, size: source.size, centersQ: source.centersQ, elevationsMeters: source.elevationsMeters,
    detailCoast: new Map<DetailCoastKey, DetailCoastTile>([
      ['coast:4:4', { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'land', bx: 4, by: 4 }],
      ['coast:5:4', { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'samples', bx: 5, by: 4, coverageQ: new Int16Array(layout.count).fill(32767), elevationMeters: explicitHeights }],
    ]),
    locks: { cellIds: new Uint32Array([8 * 128 + 8]).buffer, flags: new Uint8Array([3]).buffer, quadsQ: new Int32Array([256, 256, 288, 256, 288, 288, 256, 288].map(v => v * 256)).buffer } };
}
describe('unchanged real additive protection consumes the fine writer', () => {
  it('retains the old locked continent encoded bytes, all old coarse controls and sampled height after add/codec', async () => {
    const input = additiveBase(), oldTile = encodeDetailCoastTile(input.detailCoast.get('coast:4:4')!), oldHeights = new Int32Array(input.elevationsMeters).slice();
    const oldTileRefs = [...input.detailCoast].map(([key, tile]) => ({ key, mode: tile.mode, sha256: createHash('sha256').update(encodeDetailCoastTile(tile)).digest('hex') }));
    const oldField = { tiles: input.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(input.size, input.centersQ, input.elevationsMeters) };
    const result = await generateNaturalDetailShapeAdd({ base: input, recipe: recipe() }, { batchWork: 2048, yieldControl: noWait });
    expect(encodeDetailCoastTile(result.detailCoast.get('coast:4:4')!)).toEqual(oldTile);
    for (const ref of oldTileRefs) expect(createHash('sha256').update(encodeDetailCoastTile(result.detailCoast.get(ref.key)!)).digest('hex')).toBe(ref.sha256);
    const restored = new Map([...result.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const nextField = { tiles: restored, sampleBaseElevation: createDetailShapeBaseSampler(input.size, input.centersQ, result.coarseElevations.buffer as ArrayBuffer) };
    expect(buildDetailCoastSurface(nextField, { column: 128, row: 128, columns: 64, rows: 32 }))
      .toEqual(buildDetailCoastSurface(oldField, { column: 128, row: 128, columns: 64, rows: 32 }));
    const centers = new Int32Array(input.centersQ);
    for (let id = 0; id < oldHeights.length; id++) if (centers[id * 2] < 512 * 256 && centers[id * 2 + 1] < 512 * 256) expect(result.coarseElevations[id]).toBe(oldHeights[id]);
    expect(new Int32Array(input.elevationsMeters)).toEqual(oldHeights); expect(encodeDetailCoastTile(input.detailCoast.get('coast:4:4')!)).toEqual(oldTile);
    for (const [key, fresh] of next.detailCoast) if (fresh.mode === 'samples' && fresh.coverageQ.every(c => c > 0)) expect(encodeDetailCoastTile(result.detailCoast.get(key)!)).toEqual(encodeDetailCoastTile(fresh));
  }, 60000);

  it('rejects actual locked sea converted to new land without weakening the existing lock guard', async () => {
    const input = additiveBase(), sourceBytes = bytes(input.detailCoast), coarse = input.elevationsMeters.slice(0);
    input.locks = { cellIds: new Uint32Array([36 * 128 + 36]).buffer, flags: new Uint8Array([3]).buffer,
      quadsQ: new Int32Array([1152, 1152, 1184, 1152, 1184, 1184, 1152, 1184].map(v => v * 256)).buffer };
    await expect(generateNaturalDetailShapeAdd({ base: input, recipe: recipe() }, { batchWork: 2048, yieldControl: noWait })).rejects.toThrow(/锁/);
    expect(bytes(input.detailCoast)).toEqual(sourceBytes); expect(input.elevationsMeters).toEqual(coarse);
  }, 60000);
});
