import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasGenerationDocument } from '../atlas-format';
import { cloneBlock, getCellLayerSlot, getVertexSlot, hashBlock, type BlockKey } from '../model';
import { hashAtlasCellLockBlock, lockKey } from '../generation-locks';
import type { OceanRecipe } from '../generation-contract';
import { cellNeighbors } from '../topology';
import { OCEAN_GENERATOR_FINGERPRINT } from './fingerprint';
import { elevationAt, quadMeasure, quadQ } from './quality';
import { generateOcean, inspectOceanOutput, type OceanOutput } from './ocean';

const fast = { yieldTask: async () => {} };
const recipe = (overrides: Partial<OceanRecipe['parameters']> = {}): OceanRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: OCEAN_GENERATOR_FINGERPRINT }, seed: 'connected-ocean-basin-and-ridges',
  parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320, ...overrides },
});
let empty: AtlasGenerationDocument, continent: AtlasGenerationDocument;
async function refresh(data: AtlasGenerationDocument, keys: Iterable<BlockKey>) {
  for (const key of keys) data.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(data.blocks.get(key)!);
}
beforeAll(async () => {
  empty = await createGenerationDraft({ size: 128, seed: 'real-ocean-shared-quad', name: '外海与封闭内湖合成测试' }, fast);
  continent = cloneAtlasDocument(empty); continent.manifest.catalogs = { simRegions: [{ id: 7, name: '旧模拟区' }], administration: [{ id: 11, name: '旧行政叶', parentId: null, kind: 'leaf' }] };
  const changed = new Set<BlockKey>();
  for (let id = 0; id < 128 ** 2; id++) {
    const x = id % 128, y = Math.floor(id / 128), onLand = x >= 40 && x < 88 && y >= 30 && y < 96, lake = x >= 62 && x < 66 && y >= 50 && y < 54;
    if (onLand) { const cell = getCellLayerSlot(continent, 'elevation', id); cell.block.values[cell.slot] = lake ? -250 : 500 + id % 121; changed.add(cell.key); }
    if (id % 211 === 0) for (const layer of ['sim-membership', 'admin-membership'] as const) { const cell = getCellLayerSlot(continent, layer, id); cell.block.values[cell.slot] = layer === 'sim-membership' ? 7 : 11; changed.add(cell.key); }
  }
  await refresh(continent, changed);
});
const view = (base: AtlasGenerationDocument, result: OceanOutput) => ({ ...base, blocks: result.blocks });
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
function independentlyConnectedOcean(data: ReturnType<typeof view>) {
  const size = data.manifest.spec.columns, seen = new Set<number>(), queue: number[] = [];
  for (let id = 0; id < size ** 2; id++) {
    const x = id % size, y = Math.floor(id / size);
    if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && elevationAt(data, id) < 0) { seen.add(id); queue.push(id); }
  }
  for (let head = 0; head < queue.length; head++) for (const next of cellNeighbors(data.manifest.spec, queue[head])) if (!seen.has(next) && elevationAt(data, next) < 0) { seen.add(next); queue.push(next); }
  return seen;
}

describe('PH06 real editable ocean basins, shelf and enclosed-water protection', () => {
  it('turns empty shallow ocean into continuous seeded bathymetry, changing heights rather than colours or geography', async () => {
    const before = cloneAtlasDocument(empty), output = await generateOcean({ base: empty, recipe: recipe() }, fast), final = view(empty, output);
    let maxStep = 0; const heights = new Set<number>();
    for (let id = 0; id < 128 ** 2; id++) {
      const height = elevationAt(final, id); heights.add(height); expect(height).toBeLessThan(-1500); expect(height).toBeGreaterThanOrEqual(-12000);
      for (const next of cellNeighbors(empty.manifest.spec, id)) maxStep = Math.max(maxStep, Math.abs(height - elevationAt(final, next)));
    }
    expect(heights.size).toBeGreaterThan(1000); expect(maxStep).toBeLessThan(250);
    expect(output.summary).toMatchObject({ changedCellCount: 128 ** 2, landAreaQ2: 0, majorComponentCount: 0, ocean: { oceanCellCount: 128 ** 2, changedSeaCellCount: 128 ** 2, protectedSeaCellCount: 0, shelfCellCount: 0, deepSeaCellCount: 128 ** 2 } });
    expect(output.changedKeys.every(key => key.startsWith('elevation:'))).toBe(true);
    for (const [key, block] of empty.blocks) if (block.layer !== 'elevation') expect(output.blocks.get(key)).toEqual(block);
    expect(empty).toEqual(before);
  });

  it('uses actual boundary-connected sea, preserves closed inland water and old land, and ramps from exact shore to deep sea', async () => {
    const before = cloneAtlasDocument(continent), output = await generateOcean({ base: continent, recipe: recipe({ reliefMeters: 0 }) }, fast), final = view(continent, output);
    const originalOcean = independentlyConnectedOcean(continent);
    expect(independentlyConnectedOcean(final)).toEqual(originalOcean); let landArea = 0, changed = 0;
    for (let id = 0; id < 128 ** 2; id++) {
      const old = elevationAt(continent, id), height = elevationAt(final, id), shore = originalOcean.has(id) && cellNeighbors(continent.manifest.spec, id).some(next => elevationAt(continent, next) >= 0);
      expect(height >= 0).toBe(old >= 0); if (old >= 0 || !originalOcean.has(id) || shore) expect(height).toBe(old);
      if (old >= 0) landArea += quadMeasure(quadQ(continent, id)).areaQ2;
      if (height !== old) changed++;
    }
    const transect = [39, 38, 37, 35, 30, 20].map(x => elevationAt(final, 65 * 128 + x));
    expect(transect[0]).toBe(-100); for (let i = 1; i < transect.length; i++) expect(transect[i]).toBeLessThanOrEqual(transect[i - 1]);
    expect(transect.at(-1)).toBe(-3600); expect(elevationAt(final, 51 * 128 + 63)).toBe(-250);
    expect(output.summary).toMatchObject({ changedCellCount: changed, landAreaQ2: landArea, majorComponentCount: 1, ocean: { oceanCellCount: originalOcean.size, changedSeaCellCount: changed } });
    expect(output.summary.ocean.shelfCellCount).toBeGreaterThan(100); expect(output.summary.ocean.deepSeaCellCount + output.summary.ocean.shelfCellCount).toBe(originalOcean.size);
    for (const [key, block] of continent.blocks) if (block.layer !== 'elevation') expect(output.blocks.get(key)).toEqual(block);
    expect(continent).toEqual(before);
  });

  it('preserves exact depths for either coast or elevation locks and keeps lock references/source data untouched', async () => {
    const locked = await withLocks(continent, [{ id: 1000, flag: 1 }, { id: 1001, flag: 2 }, { id: 1002, flag: 3 }]), before = cloneAtlasDocument(locked);
    const output = await generateOcean({ base: locked, recipe: recipe() }, fast), final = view(locked, output);
    for (const id of [1000, 1001, 1002]) expect(elevationAt(final, id)).toBe(elevationAt(locked, id));
    expect(output.summary.ocean.protectedSeaCellCount).toBe(3); expect(locked).toEqual(before);
  });

  it('owns both recipe and geography before yielding, varies with seed, and is independent of work batch sizes', async () => {
    const selected = recipe(), expected = await generateOcean({ base: continent, recipe: selected }, { ...fast, batchCells: 8192 });
    const raw = cloneAtlasDocument(continent), submitted = recipe(); let mutated = false;
    const output = await generateOcean({ base: raw, recipe: submitted }, { ...fast, batchCells: 64, onProgress() {
      if (mutated) return; mutated = true; submitted.seed = 'changed caller'; submitted.parameters.meanDepthMeters = 6000;
      getCellLayerSlot(raw, 'elevation', 0).block.values[0] = 10000; raw.manifest.name = 'caller changed';
    } });
    expect(mutated).toBe(true); expect(output).toEqual(expected);
    const changed = recipe(); changed.seed = 'a different continuous ocean'; expect((await generateOcean({ base: continent, recipe: changed }, fast)).blocks).not.toEqual(expected.blocks);
  });

  it('measures shore distance through actual edited quad centroids rather than nominal cell rings', async () => {
    const edited = cloneAtlasDocument(continent), vertex = getVertexSlot(edited, 60 * 129 + 38); vertex.block.xyQ[vertex.slot * 2] += 2 * 256;
    await refresh(edited, [vertex.key]); const selected = recipe({ meanDepthMeters: 6000, reliefMeters: 0, shelfWidthWorld: 64 });
    const before = await generateOcean({ base: continent, recipe: selected }, fast), after = await generateOcean({ base: edited, recipe: selected }, fast);
    const cells = [59 * 128 + 38, 60 * 128 + 38];
    expect(cells.some(id => elevationAt(view(continent, before), id) !== elevationAt(view(edited, after), id))).toBe(true);
    for (const id of [59 * 128 + 39, 60 * 128 + 39]) expect(elevationAt(view(edited, after), id)).toBe(-100);
    expect(after.blocks.get(vertex.key)).toEqual(edited.blocks.get(vertex.key));
  });

  it.each(['沿真实共享边识别外海与封闭内湖', '量测真实海格重心距岸与连续陆架', '生成连续海盆、海底山脊与陆架高程', '独立核验海床海陆、内湖与区域锁保护'])('supports cancellation during %s without publishing changes', async stage => {
    const controller = new AbortController(), before = cloneAtlasDocument(continent), onProgress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('ocean cancelled', 'AbortError')); });
    await expect(generateOcean({ base: continent, recipe: recipe() }, { ...fast, batchCells: 64, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress.mock.calls.some(([value]) => value.stage === stage && value.completed > 0)).toBe(true); expect(continent).toEqual(before);
  });

  it('rejects landlocked lakes, fully locked ocean and unchanged inputs without altering the caller', async () => {
    const inland = cloneAtlasDocument(empty), keys: BlockKey[] = [];
    for (const [key, block] of inland.blocks) if (block.layer === 'elevation') { block.values.fill(500); keys.push(key); }
    const lake = getCellLayerSlot(inland, 'elevation', 64 * 128 + 64); lake.block.values[lake.slot] = -250; await refresh(inland, keys);
    const before = cloneAtlasDocument(inland); await expect(generateOcean({ base: inland, recipe: recipe() }, fast)).rejects.toThrow('没有可编辑的外海'); expect(inland).toEqual(before);
    const locked = await withLocks(empty, Array.from({ length: 128 ** 2 }, (_, id) => ({ id, flag: 3 })));
    await expect(generateOcean({ base: locked, recipe: recipe() }, fast)).rejects.toThrow('没有可编辑的外海');
    const flat = cloneAtlasDocument(empty); for (const [key, block] of flat.blocks) if (block.layer === 'elevation') { block.values.fill(-3600); await refresh(flat, [key]); }
    await expect(generateOcean({ base: flat, recipe: recipe({ reliefMeters: 0 }) }, fast)).rejects.toThrow('没有改变可编辑外海');
  });

  it('also refuses an entirely dry world or an external sea consisting only of the preserved first shore ring', async () => {
    const dry = cloneAtlasDocument(empty), keys: BlockKey[] = [];
    for (const [key, block] of dry.blocks) if (block.layer === 'elevation') { block.values.fill(500); keys.push(key); }
    await refresh(dry, keys); const beforeDry = cloneAtlasDocument(dry);
    await expect(generateOcean({ base: dry, recipe: recipe() }, fast)).rejects.toThrow('没有可编辑的外海'); expect(dry).toEqual(beforeDry);
    const shore = cloneAtlasDocument(dry), cell = getCellLayerSlot(shore, 'elevation', 0); cell.block.values[cell.slot] = -100; await refresh(shore, [cell.key]);
    const beforeShore = cloneAtlasDocument(shore);
    await expect(generateOcean({ base: shore, recipe: recipe() }, fast)).rejects.toThrow('第一圈近岸保留原样'); expect(shore).toEqual(beforeShore);
  });

  it('independently rejects changes to coast classification, inland lakes, preserved coast ring, lock depths and geometry', async () => {
    const locked = await withLocks(continent, [{ id: 0, flag: 1 }]), selected = recipe(), output = await generateOcean({ base: locked, recipe: selected }, fast);
    const mutate = (id: number, value: number) => {
      const blocks = new Map(output.blocks), cell = getCellLayerSlot({ ...locked, blocks }, 'elevation', id), block = cloneBlock(cell.block); if (block.layer !== 'elevation') throw new Error('fixture'); block.values[cell.slot] = value; blocks.set(cell.key, block); return blocks;
    };
    await expect(inspectOceanOutput(locked, mutate(1, 20), selected, fast)).rejects.toThrow('海陆分类');
    await expect(inspectOceanOutput(locked, mutate(51 * 128 + 63, -251), selected, fast)).rejects.toThrow('封闭内湖');
    await expect(inspectOceanOutput(locked, mutate(65 * 128 + 39, -101), selected, fast)).rejects.toThrow('第一圈近岸');
    await expect(inspectOceanOutput(locked, mutate(0, -101), selected, fast)).rejects.toThrow('锁');
    const blocks = new Map(output.blocks), geometry = cloneBlock(blocks.get('geometry:0:0')!); if (geometry.layer !== 'geometry') throw new Error('fixture'); geometry.xyQ[68]++; blocks.set('geometry:0:0', geometry);
    await expect(inspectOceanOutput(locked, blocks, selected, fast)).rejects.toThrow('共享几何');
  });

  it('rejects malformed identities and parameters, honors pre-cancellation and keeps all legal extremes negative', async () => {
    for (const bad of [{ meanDepthMeters: 999 }, { meanDepthMeters: 6001 }, { reliefMeters: -1 }, { reliefMeters: 2001 }, { shelfWidthWorld: 63 }, { shelfWidthWorld: 1025 }]) await expect(generateOcean({ base: empty, recipe: recipe(bad) }, fast)).rejects.toThrow('参数');
    const unknown = recipe(); unknown.generator.fingerprint = '0'.repeat(64); await expect(generateOcean({ base: empty, recipe: unknown }, fast)).rejects.toThrow('配方');
    const controller = new AbortController(); controller.abort(new DOMException('pre cancelled', 'AbortError')); const onProgress = vi.fn();
    await expect(generateOcean({ base: empty, recipe: recipe() }, { ...fast, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' }); expect(onProgress).not.toHaveBeenCalled();
    for (const meanDepthMeters of [1000, 6000]) {
      const output = await generateOcean({ base: empty, recipe: recipe({ meanDepthMeters, reliefMeters: 2000, shelfWidthWorld: 64 }) }, fast);
      expect(output.summary.maxElevationMeters).toBeLessThan(0); expect(output.summary.minElevationMeters).toBeGreaterThanOrEqual(-12000);
    }
  });

  it('produces real continuous bathymetry at the 262144-cell world size and keeps the complete sea mask', async () => {
    const large = await createGenerationDraft({ size: 512, name: '大世界海床验收', seed: 'real-ocean-shared-quad' }, fast), before = cloneAtlasDocument(large);
    const output = await generateOcean({ base: large, recipe: recipe() }, { ...fast, batchCells: 8192 }), final = view(large, output);
    expect(output.summary).toMatchObject({ changedCellCount: 512 ** 2, landAreaQ2: 0, worldAreaQ2: 2 * (4096 * 256) ** 2, majorComponentCount: 0, ocean: { oceanCellCount: 512 ** 2, deepSeaCellCount: 512 ** 2 } });
    const heights = new Set<number>(); for (let id = 0; id < 512 ** 2; id++) { const height = elevationAt(final, id); if (height >= 0 || height < -12000) throw new Error(`Large ocean cell ${id} escaped the legal sea depth`); heights.add(height); }
    expect(heights.size).toBeGreaterThan(1000); expect(independentlyConnectedOcean(final).size).toBe(512 ** 2); expect(large).toEqual(before);
  }, 60000);
});
