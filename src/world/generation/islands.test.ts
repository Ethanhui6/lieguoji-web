import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneBlock, getCellLayerSlot, hashBlock, type AtlasSize, type BlockKey } from '../model';
import { cloneAtlasDocument, createGenerationDraft, type AtlasCellLockBlock, type AtlasGenerationDocument } from '../atlas-format';
import { hashAtlasCellLockBlock, lockKey } from '../generation-locks';
import { cellNeighbors } from '../topology';
import { elevationAt, quadMeasure, quadQ } from './quality';
import { generateIslands, inspectIslandOutput, validateIslandParameters, type IslandParameters, type IslandOutput } from './islands';

const fast = { yieldTask: async () => {} }, defaults: IslandParameters = { seed: 'ph06-real-curved-island-chain', chainCount: 2, islandsPerChain: 3, radiusWorld: 96, reliefMeters: 1600 };
let ocean: AtlasGenerationDocument, inhabited: AtlasGenerationDocument;
const scales = new Map<AtlasSize, AtlasGenerationDocument>();
async function refresh(data: AtlasGenerationDocument, keys: Iterable<BlockKey>) { for (const key of keys) data.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(data.blocks.get(key)!); }
async function withLocks(data: AtlasGenerationDocument, cells: {id: number; flag: number}[]) {
  const copy = cloneAtlasDocument(data), size = copy.manifest.spec.columns;
  for (const { id, flag } of cells) {
    const x = id % size, y = Math.floor(id / size), bx = Math.floor(x / 32), by = Math.floor(y / 32), key = lockKey(bx, by);
    let block = copy.locks.get(key); if (!block) { block = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) }; copy.locks.set(key, block); }
    block.flags[y % 32 * 32 + x % 32] = flag;
  }
  copy.manifest.constraints.lockRefs = [];
  for (const block of [...copy.locks.values()].sort((a, b) => a.by - b.by || a.bx - b.bx)) copy.manifest.constraints.lockRefs.push({ bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) });
  return copy;
}
beforeAll(async () => {
  for (const size of [128, 256, 512] as const) scales.set(size, await createGenerationDraft({ size, seed: 'same-islands-geography-seed', name: '岛链纯合成测试地理' }, fast));
  ocean = scales.get(128)!; inhabited = cloneAtlasDocument(ocean);
  inhabited.manifest.catalogs = { simRegions: [{ id: 7, name: '既有模拟区' }], administration: [{ id: 11, name: '既有行政叶', parentId: null, kind: 'leaf' }] };
  const changed = new Set<BlockKey>();
  for (let id = 0; id < 128 ** 2; id++) {
    const x = id % 128, y = Math.floor(id / 128), land = x < 32 || x >= 100 && x < 106 && y >= 16 && y < 22;
    if (land) { const cell = getCellLayerSlot(inhabited, 'elevation', id); cell.block.values[cell.slot] = 500 + id % 173; changed.add(cell.key); }
    // Existing membership on both land and sea is unrelated to generation.
    if (land || id % 97 === 0) for (const layer of ['sim-membership', 'admin-membership'] as const) { const cell = getCellLayerSlot(inhabited, layer, id); cell.block.values[cell.slot] = layer === 'sim-membership' ? 7 : 11; changed.add(cell.key); }
  }
  await refresh(inhabited, changed);
}, 60000);
const resultView = (base: AtlasGenerationDocument, result: IslandOutput) => ({ ...base, blocks: result.blocks });
function newLandIds(base: AtlasGenerationDocument, result: IslandOutput) {
  const ids: number[] = [], view = resultView(base, result), size = base.manifest.spec.columns;
  for (let id = 0; id < size * size; id++) if (elevationAt(base, id) < 0 && elevationAt(view, id) >= 0) ids.push(id);
  return ids;
}
function independentComponents(base: AtlasGenerationDocument, result: IslandOutput) {
  const view = resultView(base, result), seen = new Set<number>(), components: number[][] = [];
  for (let first = 0; first < base.manifest.spec.columns ** 2; first++) if (elevationAt(view, first) >= 0 && !seen.has(first)) {
    const cells = [first]; seen.add(first);
    for (let head = 0; head < cells.length; head++) for (const next of cellNeighbors(base.manifest.spec, cells[head])) if (!seen.has(next) && elevationAt(view, next) >= 0) { seen.add(next); cells.push(next); }
    components.push(cells);
  }
  return components;
}

describe('PH06 real editable island chains', () => {
  it('adds actual multi-cell islands on curved skeletons while preserving old land, geometry, membership and both old components', async () => {
    const before = cloneAtlasDocument(inhabited), result = await generateIslands({ base: inhabited, parameters: defaults }, fast), view = resultView(inhabited, result);
    expect(inhabited).toEqual(before); expect(result.summary).toMatchObject({ chainCount: 2, newIslandCount: 6, originalComponentCount: 2, majorComponentCount: 8 });
    expect(independentComponents(inhabited, result)).toHaveLength(8);
    const actualNew = newLandIds(inhabited, result), featureIds = result.features.chains.flatMap(chain => chain.islands.flatMap(island => island.cellIds));
    expect(new Set(featureIds).size).toBe(featureIds.length); expect([...featureIds].sort((a, b) => a - b)).toEqual(actualNew); expect(result.summary.newLandCellCount).toBe(actualNew.length);
    let actualLandArea = 0, actualChanged = 0;
    for (let id = 0; id < 128 ** 2; id++) {
      const old = elevationAt(inhabited, id), value = elevationAt(view, id); if (old !== value) actualChanged++;
      if (old >= 0) expect(value).toBe(old); if (value >= 0) actualLandArea += quadMeasure(quadQ(view, id)).areaQ2;
      if (old < 0 && value >= 0) expect(cellNeighbors(inhabited.manifest.spec, id).every(next => elevationAt(inhabited, next) < 0)).toBe(true);
    }
    expect(result.summary.landAreaQ2).toBe(actualLandArea); expect(result.summary.changedCellCount).toBe(actualChanged);
    for (const [key, block] of inhabited.blocks) if (block.layer !== 'elevation') expect(result.blocks.get(key)).toEqual(block);
    expect(result.changedKeys.every(key => key.startsWith('elevation:'))).toBe(true);
    for (const chain of result.features.chains) {
      const [a, b, c] = chain.controlPointsQ; expect((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).not.toBe(0);
      for (const island of chain.islands) {
        const heights = island.cellIds.map(id => elevationAt(view, id)); expect(island.cellIds.length).toBeGreaterThanOrEqual(4); expect(new Set(heights).size).toBeGreaterThan(1);
        expect(island.peakMeters).toBe(Math.max(...heights)); expect(island.peakMeters).toBeGreaterThan(defaults.reliefMeters / 4); expect(island.peakMeters).toBeLessThanOrEqual(defaults.reliefMeters);
        expect(island.areaQ2).toBe(island.cellIds.reduce((sum, id) => sum + quadMeasure(quadQ(view, id)).areaQ2, 0));
      }
    }
  });

  it('keeps the same world-space curve at the minimum radius on 128/256/512 grids and proves every island has at least four actual cells', async () => {
    const parameters = { ...defaults, chainCount: 1, islandsPerChain: 3, radiusWorld: 64, reliefMeters: 200 }, results: IslandOutput[] = [];
    for (const size of [128, 256, 512] as const) {
      const base = scales.get(size)!, result = await generateIslands({ base, parameters }, { ...fast, batchCells: 8192 }); results.push(result);
      expect(result.summary).toMatchObject({ chainCount: 1, newIslandCount: 3, originalComponentCount: 0, majorComponentCount: 3 });
      expect(independentComponents(base, result).map(cells => cells.length).every(count => count >= 4)).toBe(true);
      expect(result.summary.worldAreaQ2).toBe(2 * (4096 * 256) ** 2);
    }
    expect(results[1].features.chains[0].controlPointsQ).toEqual(results[0].features.chains[0].controlPointsQ); expect(results[2].features.chains[0].controlPointsQ).toEqual(results[0].features.chains[0].controlPointsQ);
    expect(results[2].summary.newLandCellCount).toBeGreaterThan(results[0].summary.newLandCellCount * 8);
  }, 60000);

  it('supports the maximum requested 3 × 6 separated islands and does not reinterpret the final count as macro continents', async () => {
    const result = await generateIslands({ base: ocean, parameters: { ...defaults, chainCount: 3, islandsPerChain: 6, radiusWorld: 128, reliefMeters: 3000 } }, fast);
    expect(result.summary).toMatchObject({ chainCount: 3, newIslandCount: 18, originalComponentCount: 0, majorComponentCount: 18 });
    expect(independentComponents(ocean, result)).toHaveLength(18); expect(result.features.chains).toHaveLength(3); expect(result.features.chains.every(chain => chain.islands.length === 6)).toBe(true);
  });

  it('skips both coast and height locks, relocates complete chains, and refuses fully locked ocean without partial publication', async () => {
    const first = await generateIslands({ base: ocean, parameters: defaults }, fast), anchors = first.features.chains.flatMap(chain => chain.islands.map(island => island.anchorCellId));
    const locked = await withLocks(ocean, [{ id: anchors[0], flag: 1 }, { id: anchors[1], flag: 2 }]), saved = cloneAtlasDocument(locked);
    const result = await generateIslands({ base: locked, parameters: defaults }, fast); expect(locked).toEqual(saved); expect(result.summary.newIslandCount).toBe(6);
    expect(elevationAt(resultView(locked, result), anchors[0])).toBe(-100); expect(elevationAt(resultView(locked, result), anchors[1])).toBe(-100);
    const allLocked = await withLocks(ocean, Array.from({ length: 128 ** 2 }, (_, id) => ({ id, flag: 3 }))), before = cloneAtlasDocument(allLocked);
    await expect(generateIslands({ base: allLocked, parameters: defaults }, fast)).rejects.toThrow('无法找到完整海洋空间'); expect(allLocked).toEqual(before);
  });

  it('is independent of batch scheduling and owns parameters and every caller buffer before the first yield', async () => {
    const expected = await generateIslands({ base: ocean, parameters: defaults }, { ...fast, batchCells: 4096 }), raw = cloneAtlasDocument(ocean), parameters = { ...defaults }; let mutated = false;
    const result = await generateIslands({ base: raw, parameters }, { ...fast, batchCells: 64, onProgress: () => {
      if (mutated) return; mutated = true; parameters.seed = 'caller changed'; parameters.chainCount = 3; parameters.radiusWorld = 128;
      const cell = getCellLayerSlot(raw, 'elevation', 0); cell.block.values[cell.slot] = 9000; raw.manifest.name = 'caller changed';
    } });
    expect(mutated).toBe(true); expect(result).toEqual(expected); expect(elevationAt(ocean, 0)).toBe(-100);
    const changedSeed = await generateIslands({ base: ocean, parameters: { ...defaults, seed: 'a distinct archipelago' } }, fast);
    expect(changedSeed.features).not.toEqual(expected.features); expect(newLandIds(ocean, changedSeed)).not.toEqual(newLandIds(ocean, expected));
  });

  it.each(['搜索满足海格间隔的弯曲岛链', '写入实际岛链私有地理块', '独立核验岛链海陆与保护值'])('cancels during actual %s without touching caller geography', async stage => {
    const before = cloneAtlasDocument(ocean), controller = new AbortController(), onProgress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('island cancellation', 'AbortError')); });
    await expect(generateIslands({ base: ocean, parameters: defaults }, { ...fast, batchCells: 64, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress.mock.calls.some(([value]) => value.stage === stage && value.completed > 0)).toBe(true); expect(ocean).toEqual(before);
  });

  it('independently rejects an extra singleton island, a new land bridge and any changed geometry', async () => {
    const result = await generateIslands({ base: inhabited, parameters: defaults }, fast);
    const mutate = (id: number) => { const blocks = new Map(result.blocks), x = id % 128, y = Math.floor(id / 128), key = `elevation:${Math.floor(x / 32)}:${Math.floor(y / 32)}` as BlockKey, block = cloneBlock(blocks.get(key)!); if (block.layer !== 'elevation') throw new Error('fixture'); block.values[y % 32 * 32 + x % 32] = 1; blocks.set(key, block); return blocks; };
    let singleton = -1;
    for (let id = 33; id < 128 ** 2; id++) if (elevationAt(resultView(inhabited, result), id) < 0 && cellNeighbors(inhabited.manifest.spec, id).every(next => elevationAt(resultView(inhabited, result), next) < 0)) { singleton = id; break; }
    expect(singleton).toBeGreaterThanOrEqual(0); await expect(inspectIslandOutput(inhabited, mutate(singleton), 6, fast)).rejects.toThrow('新增真实独立岛屿');
    // Column 32 shares a real edge with the old western land at column 31.
    await expect(inspectIslandOutput(inhabited, mutate(64 * 128 + 32), 6, fast)).rejects.toThrow('海格间隔');
    const geometry = new Map(result.blocks), block = cloneBlock(geometry.get('geometry:0:0')!); if (block.layer !== 'geometry') throw new Error('fixture'); block.xyQ[2 * (33 + 1)]++; geometry.set('geometry:0:0', block);
    await expect(inspectIslandOutput(inhabited, geometry, 6, fast)).rejects.toThrow('原几何');
  });

  it('reports insufficient sea space and rejects malformed parameters, unknown locks and pre-cancellation', async () => {
    const allLand = cloneAtlasDocument(ocean), keys: BlockKey[] = [];
    for (const [key, block] of allLand.blocks) if (block.layer === 'elevation') { block.values.fill(50); keys.push(key); } await refresh(allLand, keys);
    await expect(generateIslands({ base: allLand, parameters: defaults }, fast)).rejects.toThrow('无法找到完整海洋空间');
    for (const invalid of [{ ...defaults, radiusWorld: 32 }, { ...defaults, radiusWorld: 129 }, { ...defaults, chainCount: 0 }, { ...defaults, chainCount: 4 }, { ...defaults, islandsPerChain: 1 }, { ...defaults, islandsPerChain: 7 }, { ...defaults, reliefMeters: 199 }, { ...defaults, reliefMeters: 3001 }, { ...defaults, radiusWorld: 64.5 }, { ...defaults, seed: ' ' }, { ...defaults, extra: true }]) {
      expect(validateIslandParameters(invalid)).toBe(false); await expect(generateIslands({ base: ocean, parameters: invalid }, fast)).rejects.toThrow('参数');
    }
    const unknown = await withLocks(ocean, [{ id: 0, flag: 1 }]); (unknown.locks.values().next().value as AtlasCellLockBlock).flags[0] = 4;
    await expect(generateIslands({ base: unknown, parameters: defaults }, fast)).rejects.toThrow('封套');
    const controller = new AbortController(); controller.abort(new DOMException('already cancelled', 'AbortError')); const onProgress = vi.fn();
    await expect(generateIslands({ base: ocean, parameters: defaults }, { signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' }); expect(onProgress).not.toHaveBeenCalled();
    await expect(generateIslands({ base: ocean, parameters: defaults }, { ...fast, batchCells: 0 })).rejects.toThrow('批次');
  });
});
