import { beforeAll, describe, expect, it } from 'vitest';
import { buildDetailCoastSurface, pickDetailCoastSurface, summarizeDetailCoast } from '../detail-coast-geometry';
import { sampleDetailCoastNode } from '../detail-coast-field';
import { decodeDetailCoastTile, encodeDetailCoastTile } from '../detail-coast-codec';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { generateDetailShapeAdd, type DetailShapeAddBase, type DetailShapeAddOutput } from './detail-shape-add';
import type { DetailShapeRecipe } from './detail-shape';
import type { DetailCoastKey, DetailCoastTile } from '../detail-coast-types';

const noWait = async () => {};
function baseFixture(): DetailShapeAddBase {
  const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size).fill(-2000);
  for (let id = 0; id < heights.length; id++) {
    const x = id % size * 32 + 16, y = Math.floor(id / size) * 32 + 16;
    centers[id * 2] = x * 256; centers[id * 2 + 1] = y * 256;
    if (x > 1152 && x < 1216 && y > 1152 && y < 1216) heights[id] = 400;
  }
  return { format: 'lieguoji-detail-shape-add-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map([['coast:18:18', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 18, by: 18, mode: 'land' }]]), locks: { cellIds: new ArrayBuffer(0), flags: new ArrayBuffer(0), quadsQ: new ArrayBuffer(0) } };
}
function recipeFixture(x = 1296): DetailShapeRecipe {
  return { seed: 'additive-real-coasts', pointsQ: [[x, 1152], [1376, 1152], [1376, 1232], [x, 1232]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 0, reliefMeters: 1400, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 2 };
}
const bytes = (tiles: ReadonlyMap<DetailCoastKey, DetailCoastTile>) => [...tiles].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]);
const fieldBefore = (base: DetailShapeAddBase) => ({ tiles: base.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters) });
const fieldAfter = (output: DetailShapeAddOutput) => ({ tiles: output.detailCoast, sampleBaseElevation: output.sampleBaseElevation });
let baseline: DetailShapeAddBase, result: DetailShapeAddOutput;
beforeAll(async () => { baseline = baseFixture(); result = await generateDetailShapeAdd({ base: baseline, recipe: recipeFixture() }, { yieldControl: noWait, batchWork: 512 }); }, 30000);

describe('separate-continent v4 additive kernel', () => {
  it('adds a second continent with measured final area and preserves the original source', async () => {
    const before = await summarizeDetailCoast(baseline.detailCoast, { yieldControl: noWait }), field = fieldAfter(result);
    expect(result.summary.totalAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
    expect(result.summary.landAreaTwiceQ2 + result.summary.seaAreaTwiceQ2).toBe(result.summary.totalAreaTwiceQ2);
    expect(result.summary.beforeLandAreaTwiceQ2).toBe(before.landAreaTwiceQ2);
    expect(result.summary.addedLandAreaTwiceQ2).toBe(result.summary.generated.landAreaTwiceQ2);
    expect(result.summary.coverageSemantics).toBe('preserved-components-with-audited-disjoint-splice');
    expect(pickDetailCoastSurface(field, { x: 1190, y: 1190 })?.land).toBe(true);
    expect(pickDetailCoastSurface(field, { x: 1330, y: 1190 })?.land).toBe(true);
    expect(pickDetailCoastSurface(field, { x: 1250, y: 1190 })?.land).toBe(false);
    expect(bytes(baseline.detailCoast)).toEqual(bytes(baseFixture().detailCoast));
    expect(new Int32Array(baseline.elevationsMeters)).toEqual(new Int32Array(baseFixture().elevationsMeters));
  });

  it('materializes old uniform terrain when new coarse heights alter its Hbase support', () => {
    const before = fieldBefore(baseline), after = fieldAfter(result), x = 604, y = 595;
    expect(after.sampleBaseElevation(x * 512, y * 512)).not.toBe(before.sampleBaseElevation(x * 512, y * 512));
    expect(result.summary.materializedOwnerTiles).toBeGreaterThan(0);
    expect(result.detailCoast.get('coast:18:18')?.mode).toBe('samples');
    expect(sampleDetailCoastNode(after, x, y)).toEqual(sampleDetailCoastNode(before, x, y));
    const rect = { column: 600, row: 592, columns: 8, rows: 8 };
    expect(buildDetailCoastSurface(after, rect)).toEqual(buildDetailCoastSurface(before, rect));
    expect(pickDetailCoastSurface(after, { x: 1199.125, y: 1188.75 })).toEqual(pickDetailCoastSurface(before, { x: 1199.125, y: 1188.75 }));
  });

  it('restores the complete fine result through the existing codec and persisted Hbase inputs', async () => {
    const restored = new Map([...result.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const field = { tiles: restored, sampleBaseElevation: createDetailShapeBaseSampler(baseline.size, baseline.centersQ, result.coarseElevations.buffer as ArrayBuffer) };
    const summary = await summarizeDetailCoast(restored, { yieldControl: noWait });
    expect(summary.landAreaTwiceQ2).toBe(result.summary.landAreaTwiceQ2);
    for (const point of [{ x: 1199.125, y: 1188.75 }, { x: 1296.4, y: 1178.25 }, { x: 1340, y: 1190 }, { x: 1250, y: 1190 }]) expect(pickDetailCoastSurface(field, point)).toEqual(pickDetailCoastSurface(fieldAfter(result), point));
  });

  it('rejects overlap without replacing the original continent', async () => {
    const base = baseFixture(), original = bytes(base.detailCoast), coarse = base.elevationsMeters.slice(0), recipe = recipeFixture();
    recipe.pointsQ = [[1170, 1160], [1240, 1160], [1240, 1200], [1170, 1200]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
    await expect(generateDetailShapeAdd({ base, recipe }, { yieldControl: noWait, batchWork: 512 })).rejects.toThrow(/接触|重叠/);
    expect(bytes(base.detailCoast)).toEqual(original); expect(base.elevationsMeters).toEqual(coarse);
  }, 30000);

  it('protects a skew quad corner even though its coarse center is outside the new land', async () => {
    for (const flag of [1, 2]) {
      const base = baseFixture(), id = 37 * 128 + 40;
      base.locks = { cellIds: new Uint32Array([id]).buffer, flags: new Uint8Array([flag]).buffer, quadsQ: new Int32Array([1280, 1184, 1312, 1184, 1310, 1216, 1282, 1216].map(v => v * 256)).buffer };
      expect(new Int32Array(base.centersQ)[id * 2] / 256).toBeLessThan(1304);
      await expect(generateDetailShapeAdd({ base, recipe: recipeFixture(1304) }, { yieldControl: noWait, batchWork: 512 })).rejects.toThrow(/锁/);
      expect(bytes(base.detailCoast)).toEqual(bytes(baseFixture().detailCoast));
    }
  }, 30000);

  it('owns input bytes and preserves deterministic results across scheduling and caller mutation', async () => {
    const base = baseFixture(), recipe = recipeFixture(); let mutated = false;
    const repeat = await generateDetailShapeAdd({ base, recipe }, { batchWork: 64, yieldControl: noWait, onProgress: phase => {
      if (!mutated && phase === 'takeover-additive-world') {
        mutated = true; new Int32Array(base.centersQ).fill(0); new Int32Array(base.elevationsMeters).fill(10000);
        (base.detailCoast as Map<DetailCoastKey, DetailCoastTile>).clear(); recipe.pointsQ[0].xQ = 0; recipe.seed = 'changed-after-takeover';
      }
    } });
    expect(mutated).toBe(true); expect(bytes(repeat.detailCoast)).toEqual(bytes(result.detailCoast));
    expect(repeat.coarseElevations).toEqual(result.coarseElevations); expect(repeat.summary).toEqual(result.summary);
  }, 30000);

  it('cancels actual distance generation and preservation work without source writes', async () => {
    for (const phase of ['new-component:write-true-distance', 'splice-and-preserve-old-height']) {
      const base = baseFixture(), original = bytes(base.detailCoast), coarse = base.elevationsMeters.slice(0), controller = new AbortController(); let reached = false;
      await expect(generateDetailShapeAdd({ base, recipe: recipeFixture() }, { yieldControl: noWait, batchWork: 128, signal: controller.signal, onProgress: current => { if (current === phase) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(bytes(base.detailCoast)).toEqual(original); expect(base.elevationsMeters).toEqual(coarse);
    }
  }, 30000);

  it('rejects malformed locks, shared buffers and invalid samples before accepting a candidate', async () => {
    const locked = baseFixture(); locked.locks = { cellIds: new Uint32Array([1]).buffer, flags: new Uint8Array([4]).buffer, quadsQ: new Int32Array(8).buffer };
    await expect(generateDetailShapeAdd({ base: locked, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow(/锁/);
    const shared = baseFixture(); shared.elevationsMeters = new SharedArrayBuffer(shared.elevationsMeters.byteLength) as unknown as ArrayBuffer;
    await expect(generateDetailShapeAdd({ base: shared, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow(/非共享/);
    const bad = baseFixture(), coverageQ = new Int16Array(1024).fill(-32768), elevationMeters = new Int16Array(1024).fill(-1);
    (bad.detailCoast as Map<DetailCoastKey, DetailCoastTile>).set('coast:18:18', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 18, by: 18, mode: 'samples', coverageQ, elevationMeters });
    await expect(generateDetailShapeAdd({ base: bad, recipe: recipeFixture() }, { yieldControl: noWait })).rejects.toThrow(/样本/);
  });
});
