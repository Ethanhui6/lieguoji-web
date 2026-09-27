import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasGenerationDocument } from '../atlas-format';
import { getCellLayerSlot, hashBlock, cloneBlock, type BlockKey } from '../model';
import { hashAtlasCellLockBlock, lockKey } from '../generation-locks';
import type { ShapeRecipe } from '../generation-contract';
import { cellNeighbors } from '../topology';
import { SHAPE_GENERATOR_FINGERPRINT } from './fingerprint';
import { elevationAt, quadMeasure, quadQ } from './quality';
import { generateShape, inspectShapeOutput, type ShapeOutput } from './shape';

const fast = { yieldTask: async () => {} };
const point = (x: number, y: number) => ({ xQ: x * 256, yQ: y * 256 });
const recipe = (overrides: Partial<ShapeRecipe['parameters']> = {}): ShapeRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: 'hand-drawn-cape-and-bay',
  parameters: { pointsQ: [[900, 900], [2200, 900], [2200, 1300], [1400, 1300], [1400, 1700], [2850, 1700], [2850, 1828], [1400, 1828], [1400, 2600], [900, 2600]].map(([x, y]) => point(x, y)),
    coastRoughnessWorld: 32, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128, ...overrides },
});
let ocean: AtlasGenerationDocument;
beforeAll(async () => { ocean = await createGenerationDraft({ size: 128, name: '手绘闭合轮廓合成测试', seed: 'shape-actual-quad-seed' }, fast); });
const view = (base: AtlasGenerationDocument, output: ShapeOutput) => ({ manifest: base.manifest, blocks: output.blocks });
async function refresh(data: AtlasGenerationDocument, keys: Iterable<BlockKey>) {
  for (const key of keys) data.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(data.blocks.get(key)!);
}
async function withLocks(data: AtlasGenerationDocument, ids: { id: number; flag: number }[]) {
  const result = cloneAtlasDocument(data), size = result.manifest.spec.columns;
  for (const { id, flag } of ids) {
    const x = id % size, y = Math.floor(id / size), bx = Math.floor(x / 32), by = Math.floor(y / 32), key = lockKey(bx, by);
    let block = result.locks.get(key); if (!block) { block = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) }; result.locks.set(key, block); }
    block.flags[y % 32 * 32 + x % 32] = flag;
  }
  result.manifest.constraints.lockRefs = [];
  for (const block of [...result.locks.values()].sort((a, b) => a.by - b.by || a.bx - b.bx)) result.manifest.constraints.lockRefs.push({ bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) });
  return result;
}
function actualComponents(data: ReturnType<typeof view>) {
  const seen = new Set<number>(), result: number[][] = [];
  for (let id = 0; id < data.manifest.spec.columns ** 2; id++) if (!seen.has(id) && elevationAt(data, id) >= 0) {
    const component = [id]; seen.add(id);
    for (let head = 0; head < component.length; head++) for (const next of cellNeighbors(data.manifest.spec, component[head])) if (!seen.has(next) && elevationAt(data, next) >= 0) { component.push(next); seen.add(next); }
    result.push(component);
  }
  return result;
}
function polygonInside(xQ: number, yQ: number, points: ShapeRecipe['parameters']['pointsQ']) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.yQ > yQ) !== (b.yQ > yQ) && xQ < (b.xQ - a.xQ) * (yQ - a.yQ) / (b.yQ - a.yQ) + a.xQ) inside = !inside;
  }
  return inside;
}

describe('PH06 closed hand-drawn shape becomes editable natural terrain', () => {
  it('preserves a concave bay and a long peninsula, with independently measured real area and shared-edge connectivity', async () => {
    const before = cloneAtlasDocument(ocean), selected = recipe({ coastRoughnessWorld: 0 }), output = await generateShape({ base: ocean, recipe: selected }, fast), final = view(ocean, output);
    let actualLand = 0, changed = 0, newCells = 0;
    for (let id = 0; id < 128 ** 2; id++) {
      const measure = quadMeasure(quadQ(ocean, id)), height = elevationAt(final, id);
      expect(height >= 0).toBe(polygonInside(measure.xQ, measure.yQ, selected.parameters.pointsQ));
      if (height >= 0) { actualLand += measure.areaQ2; newCells++; }
      if (height !== elevationAt(ocean, id)) changed++;
    }
    expect(elevationAt(final, 47 * 128 + 58)).toBeLessThan(0); // Bay between the north shelf and the peninsula.
    expect(elevationAt(final, 54 * 128 + 85)).toBeGreaterThanOrEqual(0); // Far end of the hand-drawn peninsula.
    expect(actualComponents(final)).toHaveLength(1);
    expect(output.summary).toMatchObject({ landAreaQ2: actualLand, changedCellCount: changed, majorComponentCount: 1, shape: { newLandCellCount: newCells, controlPointCount: 10 } });
    expect(output.summary.maxElevationMeters).toBeGreaterThan(100); expect(output.summary.maxElevationMeters).toBeLessThanOrEqual(1800);
    expect(ocean).toEqual(before);
    expect(output.changedKeys.every(key => key.startsWith('elevation:'))).toBe(true);
    for (const [key, block] of ocean.blocks) if (block.layer !== 'elevation') expect(output.blocks.get(key)).toEqual(block);
  });

  it('classifies real edited quad centroids rather than nominal rectangular cells', async () => {
    const selected = recipe({ pointsQ: [[1008, 1008], [2512, 1008], [2512, 2512], [1008, 2512]].map(([x, y]) => point(x, y)), coastRoughnessWorld: 0 });
    const output = await generateShape({ base: ocean, recipe: selected }, fast), final = view(ocean, output); let nonNominal = 0;
    for (let id = 0; id < 128 ** 2; id++) {
      const actual = quadMeasure(quadQ(ocean, id)), nominal = polygonInside((id % 128 * 32 + 16) * 256, (Math.floor(id / 128) * 32 + 16) * 256, selected.parameters.pointsQ);
      const inside = polygonInside(actual.xQ, actual.yQ, selected.parameters.pointsQ); if (inside !== nominal) nonNominal++;
      expect(elevationAt(final, id) >= 0).toBe(inside);
    }
    expect(nonNominal).toBeGreaterThan(20);
  });

  it('owns points and source buffers before yielding and is identical across scheduling batches', async () => {
    const selected = recipe(), expected = await generateShape({ base: ocean, recipe: selected }, { ...fast, batchCells: 8192 });
    const caller = cloneAtlasDocument(ocean), submitted = recipe(); let mutated = false;
    const actual = await generateShape({ base: caller, recipe: submitted }, { ...fast, batchCells: 64, onProgress() {
      if (mutated) return; mutated = true; submitted.parameters.pointsQ[0].xQ = 0; submitted.seed = 'mutated after first yield';
      getCellLayerSlot(caller, 'elevation', 0).block.values[0] = 9500; caller.manifest.name = 'mutated caller';
    } });
    expect(mutated).toBe(true); expect(actual).toEqual(expected);
    const other = recipe(); other.seed = 'different coherent terrain'; const different = await generateShape({ base: ocean, recipe: other }, fast);
    expect(different.blocks).not.toEqual(expected.blocks);
  });

  it('preserves existing land, both lock kinds, membership, geometry, source manifests and outside influence depths', async () => {
    const base = cloneAtlasDocument(ocean), keys = new Set<BlockKey>();
    base.manifest.catalogs = { simRegions: [{ id: 7, name: '旧模拟区' }], administration: [{ id: 11, name: '旧行政区', parentId: null, kind: 'leaf' }] };
    for (const id of [34 * 128 + 34, 38 * 128 + 38, 100 * 128 + 100]) {
      const cell = getCellLayerSlot(base, 'elevation', id); cell.block.values[cell.slot] = 782 + id % 30; keys.add(cell.key);
      for (const layer of ['sim-membership', 'admin-membership'] as const) { const member = getCellLayerSlot(base, layer, id); member.block.values[member.slot] = layer === 'sim-membership' ? 7 : 11; keys.add(member.key); }
    }
    await refresh(base, keys);
    const locked = await withLocks(base, [{ id: 35 * 128 + 35, flag: 1 }, { id: 36 * 128 + 36, flag: 2 }]), before = cloneAtlasDocument(locked);
    const output = await generateShape({ base: locked, recipe: recipe() }, fast), final = view(locked, output);
    for (let id = 0; id < 128 ** 2; id++) {
      const old = elevationAt(locked, id);
      if (old >= 0 || id === 35 * 128 + 35 || id === 36 * 128 + 36 || id % 128 > 110) expect(elevationAt(final, id)).toBe(old);
    }
    for (const [key, block] of locked.blocks) if (block.layer !== 'elevation') expect(output.blocks.get(key)).toEqual(block);
    expect(locked).toEqual(before); expect(output.summary.shape.newLandCellCount).toBeGreaterThan(500);
  });

  it('creates continuous inland relief and a real shallow-to-deep shelf without touching distant ocean', async () => {
    const deep = cloneAtlasDocument(ocean), keys: BlockKey[] = [];
    for (const [key, block] of deep.blocks) if (block.layer === 'elevation') { block.values.fill(-3000); keys.push(key); }
    await refresh(deep, keys); const output = await generateShape({ base: deep, recipe: recipe() }, fast), final = view(deep, output);
    const shelf = new Set<number>(), land = new Set<number>(); let largestLandStep = 0;
    for (let id = 0; id < 128 ** 2; id++) {
      const height = elevationAt(final, id); if (height < 0 && height > -3000) shelf.add(height); if (height >= 0) land.add(height);
      if (height >= 0) for (const next of cellNeighbors(deep.manifest.spec, id)) if (elevationAt(final, next) >= 0) largestLandStep = Math.max(largestLandStep, Math.abs(height - elevationAt(final, next)));
    }
    expect(shelf.size).toBeGreaterThan(80); expect(land.size).toBeGreaterThan(100); expect(largestLandStep).toBeLessThan(350);
    expect(output.summary.shape.affectedSeaCellCount).toBeGreaterThan(100); expect(elevationAt(final, 0)).toBe(-3000);
  });

  it.each(['从闭合轮廓生成连续海陆地形', '写入手绘大陆私有高程块', '独立核验手绘大陆保护值与面积'])('cancels during %s and preserves every source buffer', async stage => {
    const controller = new AbortController(), before = cloneAtlasDocument(ocean), onProgress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('shape cancelled', 'AbortError')); });
    await expect(generateShape({ base: ocean, recipe: recipe() }, { ...fast, batchCells: 64, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress.mock.calls.some(([value]) => value.stage === stage && value.completed > 0)).toBe(true); expect(ocean).toEqual(before);
  });

  it('refuses self intersections, duplicate or collinear vertices, out-of-bounds points and invalid recipe identity', async () => {
    const badPoints = [ [[900, 900], [1800, 1800], [1800, 900], [900, 1800]], [[900, 900], [1800, 900], [900, 900]],
      [[900, 900], [1000, 1000], [1100, 1100]], [[-1, 900], [1800, 900], [1800, 1800]], [[900, 900], [4097, 900], [1800, 1800]] ];
    for (const points of badPoints) await expect(generateShape({ base: ocean, recipe: recipe({ pointsQ: points.map(([x, y]) => point(x, y)) }) }, fast)).rejects.toThrow('轮廓');
    const wrong = recipe(); wrong.generator.fingerprint = '0'.repeat(64); await expect(generateShape({ base: ocean, recipe: wrong }, fast)).rejects.toThrow('轮廓');
    for (const bad of [{ coastRoughnessWorld: 129 }, { coastWavelengthWorld: 63 }, { reliefMeters: 6001 }, { shelfWidthWorld: 31 }]) await expect(generateShape({ base: ocean, recipe: recipe(bad) }, fast)).rejects.toThrow('轮廓');
  });

  it('explains no-op outlines on old land or fully locked ocean and rejects tiny unattainable land without touching the source', async () => {
    const land = cloneAtlasDocument(ocean), keys: BlockKey[] = [];
    for (const [key, block] of land.blocks) if (block.layer === 'elevation') { block.values.fill(500); keys.push(key); }
    await refresh(land, keys); const before = cloneAtlasDocument(land);
    await expect(generateShape({ base: land, recipe: recipe() }, fast)).rejects.toThrow('没有新增可用陆地'); expect(land).toEqual(before);
    const locked = await withLocks(ocean, Array.from({ length: 128 ** 2 }, (_, id) => ({ id, flag: 3 })));
    await expect(generateShape({ base: locked, recipe: recipe() }, fast)).rejects.toThrow('没有新增可用陆地');
    await expect(generateShape({ base: ocean, recipe: recipe({ pointsQ: [point(1008, 1008), point(1010, 1008), point(1009, 1010)], coastRoughnessWorld: 0 }) }, fast)).rejects.toThrow('没有新增可用陆地');
  });

  it('independently rejects changed geometry, distant height tampering and extra noise islands', async () => {
    const selected = recipe(), output = await generateShape({ base: ocean, recipe: selected }, fast);
    const geometry = new Map(output.blocks), gb = cloneBlock(geometry.get('geometry:0:0')!); if (gb.layer !== 'geometry') throw new Error('fixture'); gb.xyQ[2 * 34]++; geometry.set('geometry:0:0', gb);
    await expect(inspectShapeOutput(ocean, geometry, selected, fast)).rejects.toThrow('共享几何');
    const far = new Map(output.blocks), eb = cloneBlock(far.get('elevation:0:0')!); if (eb.layer !== 'elevation') throw new Error('fixture'); eb.values[0] = 77; far.set('elevation:0:0', eb);
    await expect(inspectShapeOutput(ocean, far, selected, fast)).rejects.toThrow('影响带外');
    const insideBay = new Map(output.blocks), id = 47 * 128 + 58, cell = getCellLayerSlot({ ...ocean, blocks: insideBay }, 'elevation', id), block = cloneBlock(cell.block); if (block.layer !== 'elevation') throw new Error('fixture'); block.values[cell.slot] = 100; insideBay.set(cell.key, block);
    await expect(inspectShapeOutput(ocean, insideBay, selected, fast)).rejects.toThrow('有界海岸影响带');
  });

  it('supports the bounded 256-point outline and cancellation before any callback', async () => {
    const pointsQ = Array.from({ length: 256 }, (_, index) => ({ xQ: Math.round((2048 + Math.cos(index * Math.PI / 128) * 640) * 256), yQ: Math.round((2048 + Math.sin(index * Math.PI / 128) * 640) * 256) }));
    const output = await generateShape({ base: ocean, recipe: recipe({ pointsQ }) }, fast);
    expect(output.summary.shape.controlPointCount).toBe(256); expect(output.summary.majorComponentCount).toBe(1);
    const controller = new AbortController(); controller.abort(new DOMException('pre cancelled', 'AbortError')); const onProgress = vi.fn();
    await expect(generateShape({ base: ocean, recipe: recipe() }, { ...fast, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' }); expect(onProgress).not.toHaveBeenCalled();
  });

  it('uses the same physical outline on 262144 real editable quads with independently measured area', async () => {
    const large = await createGenerationDraft({ size: 512, name: '大世界手绘地形验证', seed: 'shape-actual-quad-seed' }, fast);
    const selected = recipe({ pointsQ: [point(1024, 1024), point(3072, 1024), point(3072, 3072), point(1024, 3072)], coastRoughnessWorld: 0 });
    const output = await generateShape({ base: large, recipe: selected }, { ...fast, batchCells: 8192 }), final = view(large, output);
    let measuredArea = 0, measuredCells = 0;
    for (let id = 0; id < 512 ** 2; id++) {
      const quad = quadMeasure(quadQ(final, id)), inside = polygonInside(quad.xQ, quad.yQ, selected.parameters.pointsQ);
      expect(elevationAt(final, id) >= 0).toBe(inside);
      if (inside) { measuredArea += quad.areaQ2; measuredCells++; }
    }
    expect(output.summary.worldAreaQ2).toBe(2 * (4096 * 256) ** 2);
    expect(output.summary.landAreaQ2).toBe(measuredArea); expect(output.summary.shape.newLandCellCount).toBe(measuredCells);
    expect(Math.abs(measuredArea / output.summary.worldAreaQ2 - .25)).toBeLessThan(.001);
    expect(actualComponents(final)).toHaveLength(1);
  }, 60000);
});
