/** Staged tests. Production/browser source is not modified by this file. */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDetailCoastSurface, pickDetailCoastSurface, summarizeDetailCoast } from '../detail-coast-geometry';
import { decodeDetailCoastTile, encodeDetailCoastTile, validateDetailCoastTile } from '../detail-coast-codec';
import { detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastTile } from '../detail-coast-types';
import { buildDetailShapeDistanceIndex } from './detail-shape-distance';
import { createDetailShapeBaseSampler, DETAIL_SHAPE_BASE_SAMPLER } from './detail-shape-height';
import { generateDetailShape, type DetailShapeOutput, type DetailShapeRecipe, type EmptyDetailShapeBase } from './detail-shape';

const noWait = async () => {};
function baseFixture(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size);
  for (let id = 0; id < heights.length; id++) {
    centers[id * 2] = (id % size * 32 + 16) * 256 + (id % 3 - 1) * 64;
    centers[id * 2 + 1] = (Math.floor(id / size) * 32 + 16) * 256 + (id % 5 - 2) * 32;
    heights[id] = -2000 - id % 7;
  }
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
function recipeFixture(): DetailShapeRecipe {
  return { seed: 'natural-coast-contract', pointsQ: [[1200, 1200], [1268, 1200], [1268, 1248], [1280, 1248], [1280, 1200], [1380, 1200], [1380, 1360], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 18, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 1, islandsPerChain: 4 };
}
function bytes(output: DetailShapeOutput) { return [...output.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]); }
let baseline: EmptyDetailShapeBase, generated: DetailShapeOutput;
beforeAll(async () => { baseline = baseFixture(); generated = await generateDetailShape({ base: baseline, recipe: recipeFixture() }, { yieldControl: noWait, batchWork: 512 }); }, 30000);

describe('empty v4 natural detail-shape kernel', () => {
  it('creates a real fine continent while retaining a drawn narrow bay and reporting actual work', () => {
    const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
    expect(pickDetailCoastSurface(field, { x: 1240, y: 1280 })?.land).toBe(true);
    expect(pickDetailCoastSurface(field, { x: 1274, y: 1220 })?.land).toBe(false);
    expect(pickDetailCoastSurface(field, { x: 1000, y: 1000 })?.land).toBe(false);
    expect(generated.summary.targetSegments).toBeGreaterThan(100);
    expect(generated.summary.sampledTiles).toBeGreaterThan(0); expect(generated.summary.sampledTiles).toBeLessThan(4096);
    expect(generated.summary.designNodesEvaluated).toBeGreaterThan(0);
    expect(generated.summary.exactTargetSegmentTests).toBeGreaterThan(0);
    expect(generated.summary.landAreaTwiceQ2 + generated.summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
    expect(generated.summary.islandsPlaced + generated.summary.skippedIslands.length).toBe(generated.summary.islandsRequested);
    const segments = new Uint32Array(generated.targetCoast);
    expect([...segments].some(value => value % (32 * 256) !== 0)).toBe(true);
    for (const tile of generated.detailCoast.values()) validateDetailCoastTile(tile);
  });

  it('stores true distance to the generated short target segments rather than raw design noise', async () => {
    const distance = await buildDetailShapeDistanceIndex({ coordinates: generated.targetCoast, segmentCount: generated.summary.targetSegments }, { yieldControl: noWait });
    let inspected = 0; const magnitudes = new Set<number>();
    for (const tile of generated.detailCoast.values()) if (tile.mode === 'samples') {
      const layout = detailCoastOwnerLayout(tile.bx, tile.by);
      for (let slot = 0; slot < layout.count; slot += 127) {
        const x = (layout.startX + slot % layout.width) * 512, y = (layout.startY + Math.floor(slot / layout.width)) * 512, coverage = tile.coverageQ[slot];
        expect(distance.sample(x, y, coverage < 0 ? -1 : 1).coverageQ).toBe(coverage); magnitudes.add(Math.abs(coverage)); inspected++;
      }
    }
    expect(inspected).toBeGreaterThan(50); expect(magnitudes.size).toBeGreaterThan(20);
  });

  it('rebuilds the height field only from persisted coarse data and joins saturated nodes exactly', () => {
    expect(DETAIL_SHAPE_BASE_SAMPLER).toBe('centroid-compact-idw-v1');
    const restoredSampler = createDetailShapeBaseSampler(baseline.size, baseline.centersQ, generated.coarseElevations.buffer as ArrayBuffer), centers = new Int32Array(baseline.centersQ);
    for (let id = 0; id < generated.coarseElevations.length; id += 257) expect(restoredSampler(centers[id * 2], centers[id * 2 + 1])).toBe(generated.coarseElevations[id]);
    let saturated = 0;
    for (const tile of generated.detailCoast.values()) if (tile.mode === 'samples') {
      const layout = detailCoastOwnerLayout(tile.bx, tile.by);
      for (let slot = 0; slot < layout.count; slot += 31) {
        const x = (layout.startX + slot % layout.width) * 512, y = (layout.startY + Math.floor(slot / layout.width)) * 512;
        expect(restoredSampler(x, y)).toBe(generated.sampleBaseElevation(x, y));
        if (Math.abs(tile.coverageQ[slot]) === 32767) { const value = Math.round(restoredSampler(x, y)); expect(tile.elevationMeters[slot]).toBe(tile.coverageQ[slot] > 0 ? Math.max(0, value) : Math.min(-1, value)); saturated++; }
      }
    }
    expect(saturated).toBeGreaterThan(0);
    const x = 40 * 32 * 256, y = 1281 * 256;
    expect(Math.abs(restoredSampler(x - 1e-5, y) - restoredSampler(x + 1e-5, y))).toBeLessThan(0.001);
  });

  it('agrees on final piece area, pick, shore height and coarse-centroid classification after codec recovery', async () => {
    const tiles = new Map<DetailCoastKey, DetailCoastTile>([...generated.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const field = { tiles, sampleBaseElevation: createDetailShapeBaseSampler(baseline.size, baseline.centersQ, generated.coarseElevations.buffer as ArrayBuffer) };
    const summary = await summarizeDetailCoast(tiles, { yieldControl: noWait }); expect(summary.landAreaTwiceQ2).toBe(generated.summary.landAreaTwiceQ2); expect(summary.seaAreaTwiceQ2).toBe(generated.summary.seaAreaTwiceQ2);
    const centers = new Int32Array(baseline.centersQ);
    for (let id = 0; id < generated.coarseElevations.length; id++) if (generated.coarseElevations[id] >= 0 || id % 157 === 0) expect(pickDetailCoastSurface(field, { x: centers[id * 2] / 256, y: centers[id * 2 + 1] / 256 })!.land).toBe(generated.coarseElevations[id] >= 0);
    const target = new Uint32Array(generated.targetCoast), column = Math.max(0, Math.floor(target[0] / 512) - 1), row = Math.max(0, Math.floor(target[1] / 512) - 1);
    const surface = buildDetailCoastSurface(field, { column, row, columns: 3, rows: 3 }), shore = surface.cells.flatMap(cell => cell.shore)[0]; expect(shore).toBeDefined();
    expect(pickDetailCoastSurface(field, { x: (shore.a.xQ + shore.b.xQ) / 512, y: (shore.a.yQ + shore.b.yQ) / 512 })).toMatchObject({ land: true, height: 0 });
  }, 30000);

  it('is deterministic across work partitions and owns all inputs before external mutation', async () => {
    const base = baseFixture(), recipe = recipeFixture(); let mutated = false;
    const replay = await generateDetailShape({ base, recipe }, { batchWork: 64, yieldControl: async () => {
      if (!mutated) { mutated = true; new Int32Array(base.elevationsMeters).fill(0); recipe.pointsQ[0].xQ = 0; recipe.seed = 'changed-after-takeover'; (base.detailCoast as Map<DetailCoastKey, DetailCoastTile>).set('coast:0:0', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'land' }); }
    } });
    expect(replay.targetCoast).toEqual(generated.targetCoast); expect(replay.coarseElevations).toEqual(generated.coarseElevations); expect(bytes(replay)).toEqual(bytes(generated)); expect(replay.summary).toEqual(generated.summary);
  }, 30000);

  it('rejects nonempty worlds and self-intersecting or out-of-contract contours', async () => {
    for (const flag of ['locksPresent', 'entitiesPresent', 'generationPresent'] as const) { const base = baseFixture(); base[flag] = true; await expect(generateDetailShape({ base, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow('空 v4'); }
    const land = baseFixture(); new Int32Array(land.elevationsMeters)[0] = 0; await expect(generateDetailShape({ base: land, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow('已有大陆');
    const detailed = baseFixture(); (detailed.detailCoast as Map<DetailCoastKey, DetailCoastTile>).set('coast:0:0', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'land' }); await expect(generateDetailShape({ base: detailed, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow('空 v4');
    const crossed = recipeFixture(); crossed.pointsQ = [[1200, 1200], [1380, 1360], [1380, 1200], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })); await expect(generateDetailShape({ base: baseFixture(), recipe: crossed }, { yieldControl: noWait })).rejects.toThrow('自交');
    const edge = recipeFixture(); edge.pointsQ[0].xQ = 0; await expect(generateDetailShape({ base: baseFixture(), recipe: edge }, { yieldControl: noWait })).rejects.toThrow('海洋边带');
  });

  it('cancels real design and distance work while leaving the input bytes and maps unchanged', async () => {
    for (const phase of ['sample-design-field', 'write-true-distance']) {
      const base = baseFixture(), beforeCenters = new Uint8Array(base.centersQ).slice(), beforeHeights = new Uint8Array(base.elevationsMeters).slice(), controller = new AbortController(); let reached = false;
      await expect(generateDetailShape({ base, recipe: recipeFixture() }, { signal: controller.signal, batchWork: 512, yieldControl: noWait, onProgress: current => { if (current === phase) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(new Uint8Array(base.centersQ)).toEqual(beforeCenters); expect(new Uint8Array(base.elevationsMeters)).toEqual(beforeHeights); expect(base.detailCoast.size).toBe(0);
    }
  }, 30000);

  it('keeps reconstructed base samplers independent of caller buffers', () => {
    const base = baseFixture(), centers = new Int32Array(base.centersQ), x = centers[0], y = centers[1], sampler = createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters);
    const value = sampler(x, y); new Int32Array(base.elevationsMeters).fill(5000); centers.fill(0); expect(sampler(x, y)).toBe(value);
    expect(() => createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters)).toThrow('重心');
  });
});
