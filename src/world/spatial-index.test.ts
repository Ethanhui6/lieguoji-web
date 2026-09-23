import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cloneBlock, createAtlasDraft, encodeBlock, encodeManifest, hashBlock, type AtlasDraftData, type AtlasSize, type BlockKey } from './model';
import { cellIdAt, getCellQuad, getVertexPositionQ, incidentCellIds, vertexIdAt, vertexOwnerBlock } from './topology';
import { createSpatialIndex, createSpatialIndexAsync, type AtlasAabb } from './spatial-index';

const noWait = { yieldTask: async () => {} };
let base: AtlasDraftData;
beforeAll(async () => { base = await createAtlasDraft({ size: 128, seed: 'ph04-index-fixed', name: '空间索引合成草稿' }, noWait); });
const at = (x: number, y: number): AtlasAabb => ({ minX: x, minY: y, maxX: x, maxY: y });
function fullDigest(data: AtlasDraftData) {
  const digest = createHash('sha256').update(encodeManifest(data.manifest));
  for (const [key, block] of data.blocks) digest.update(key).update(encodeBlock(block));
  return digest.digest('hex');
}
// An independent fixed-point shoelace oracle; factory geometry is intentionally
// jittered, so nominal grid squares are not the authoritative polygon or area.
function polygonArea(data: AtlasDraftData, cellId: number) {
  const scale = data.manifest.spec.coordinateScale, points = getCellQuad(data, cellId).map(p => ({ x: p.x * scale, y: p.y * scale }));
  return Math.abs(points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
  }, 0)) / (2 * scale * scale);
}
function vertexPoint(data: AtlasDraftData, id: number) {
  const p = getVertexPositionQ(data, id), scale = data.manifest.spec.coordinateScale;
  return { x: p.xQ / scale, y: p.yQ / scale };
}
function moveToQuarterCorner(data: AtlasDraftData, vertexId: number, col: number, row: number) {
  const spec = data.manifest.spec, stepQ = spec.width / spec.columns * spec.coordinateScale, p = getVertexPositionQ(data, vertexId);
  return { vertexId, dxQ: (col + .25) * stepQ - p.xQ, dyQ: (row + .25) * stepQ - p.yQ };
}
function copyManifest(data: AtlasDraftData): AtlasDraftData { return { manifest: structuredClone(data.manifest), blocks: new Map(data.blocks) }; }
async function moved(data: AtlasDraftData, movements: { vertexId: number; dxQ: number; dyQ: number }[]) {
  const next = copyManifest(data), changed = new Set<BlockKey>();
  for (const { vertexId, dxQ, dyQ } of movements) {
    const { bx, by } = vertexOwnerBlock(data.manifest.spec, vertexId), key: BlockKey = `geometry:${bx}:${by}`;
    if (!changed.has(key)) { next.blocks.set(key, cloneBlock(next.blocks.get(key)!)); changed.add(key); }
    const block = next.blocks.get(key)!;
    if (block.layer !== 'geometry') throw new Error('Test geometry owner missing');
    const slot = block.vertexIds.indexOf(vertexId);
    if (slot < 0) throw new Error('Test stable vertex missing');
    block.xyQ[slot * 2] += dxQ; block.xyQ[slot * 2 + 1] += dyQ;
  }
  for (const key of changed) next.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(next.blocks.get(key)!);
  next.manifest.revision++;
  return next;
}

describe('PH04 shared-geometry spatial index', () => {
  it.each([128, 256, 512] as AtlasSize[])('uses real AABB buckets with bounded point candidates on %s² cells', async size => {
    const data = size === 128 ? base : await createAtlasDraft({ size, seed: 'ph04-index-fixed', name: '索引候选计数' }, noWait);
    const index = createSpatialIndex(data), asyncIndex = await createSpatialIndexAsync(data, noWait), step = 4096 / size;
    for (const [col, row] of [[3, 4], [31, 31], [32, 32], [65, 71], [size - 2, size - 3]]) {
      const point = { x: (col + .3) * step, y: (row + .6) * step }, result = index.pick(point);
      expect(result.cellId).toBe(cellIdAt(data.manifest.spec, col, row));
      expect(result.stats.bucketsVisited).toBe(1);
      expect(result.stats.candidateCells).toBeLessThanOrEqual(100);
      expect(result.stats.polygonTests).toBe(1);
      expect(index.area(result.cellId!)).toBe(polygonArea(data, result.cellId!));
      expect(index.area(result.cellId!)).toBeGreaterThan(0);
      expect(asyncIndex.pick(point)).toEqual(result);
      expect(asyncIndex.area(result.cellId!)).toBe(index.area(result.cellId!));
      expect(asyncIndex.cellAabb(result.cellId!)).toEqual(index.cellAabb(result.cellId!));
    }
    expect(index.stats()).toMatchObject({ builds: 1, updates: 0, totalCells: size * size, totalReindexedCells: 0 });
    const wholeWorld = { minX: 0, minY: 0, maxX: 4096, maxY: 4096 };
    expect(asyncIndex.queryCells(wholeWorld)).toEqual(index.queryCells(wholeWorld));
    expect(asyncIndex.queryBlocks(wholeWorld)).toEqual(index.queryBlocks(wholeWorld));
    expect(asyncIndex.dependencyKey).toBe(index.dependencyKey); expect(asyncIndex.stats()).toEqual(index.stats());
  }, 20000);

  it('selects the lowest stable cell ID on a shared vertex or edge, independent of bucket ordering', () => {
    const spec = base.manifest.spec, index = createSpatialIndex(base);
    const vertex = vertexIdAt(spec, 32, 32), incident = incidentCellIds(spec, vertex);
    const point = vertexPoint(base, vertex), above = vertexPoint(base, vertexIdAt(spec, 32, 31));
    expect(index.pick(point).cellId).toBe(Math.min(...incident));
    expect(index.pick({ x: (point.x + above.x) / 2, y: (point.y + above.y) / 2 }).cellId).toBe(cellIdAt(spec, 31, 31));
    expect(index.pick({ x: 0, y: 0 }).cellId).toBe(0);
    expect(index.pick({ x: 4096, y: 4096 }).cellId).toBe(spec.columns * spec.rows - 1);
  });

  it('invalidates every incident cell and four display blocks while writing only the shared vertex owner', async () => {
    const spec = base.manifest.spec, index = createSpatialIndex(base), vertexId = vertexIdAt(spec, 32, 32), incident = incidentCellIds(spec, vertexId);
    const step = spec.width / spec.columns, originalPoint = vertexPoint(base, vertexId);
    const transferredPoint = { x: 32 * step + step / 8, y: 32 * step + step / 8 };
    const northWest = cellIdAt(spec, 31, 31), southEast = cellIdAt(spec, 32, 32);
    expect(index.pick(transferredPoint).cellId).toBe(southEast);
    const originalBounds = index.cellAabb(northWest), originalArea = index.area(northWest), originalTotal = incident.reduce((sum, id) => sum + index.area(id), 0);
    const next = await moved(base, [moveToQuarterCorner(base, vertexId, 32, 32)]);
    const changed = index.updateGeometry(next, [vertexId]);
    expect(changed.changed).toBe(true); expect(changed.invalidatedCells.map(item => item.cellId)).toEqual(incident);
    expect(changed.geometryOwnerBlocks).toEqual(['geometry:0:0']);
    expect(changed.affectedDisplayBlocks).toEqual(['geometry:0:0', 'geometry:1:0', 'geometry:0:1', 'geometry:1:1']);
    expect(changed.stats).toMatchObject({ geometryBlocksCompared: 1, verticesChanged: 1, cellsReindexed: 4, blocksReindexed: 4, blockCellsScanned: 4096 });
    expect(changed.stats.verticesCompared).toBeLessThanOrEqual(33 * 33);
    expect(changed.invalidatedCells[0].oldAabb).toEqual(originalBounds);
    expect(index.pick(transferredPoint).cellId).toBe(northWest);
    expect(index.area(northWest)).toBe(polygonArea(next, northWest));
    expect(index.area(northWest)).toBeGreaterThan(originalArea);
    expect(incident.reduce((sum, id) => sum + index.area(id), 0)).toBe(originalTotal);
    expect(index.queryCells(at(transferredPoint.x, transferredPoint.y)).cellIds).toContain(northWest);
    expect(index.queryBlocks(at(transferredPoint.x, transferredPoint.y)).blockKeys).toContain('geometry:0:0');
    // Undo is a new revision whose geometry can reuse original immutable content.
    const restored = copyManifest(base); restored.manifest.revision = 2;
    index.updateGeometry(restored, [vertexId]);
    expect(index.pick(transferredPoint).cellId).toBe(southEast);
    expect(index.cellAabb(northWest)).toEqual(originalBounds);
    expect(index.queryCells(at(transferredPoint.x, transferredPoint.y)).cellIds).not.toContain(northWest);
    expect(index.queryBlocks(at(transferredPoint.x, transferredPoint.y)).blockKeys).not.toContain('geometry:0:0');
    expect(index.stats()).toMatchObject({ builds: 1, updates: 2, totalReindexedCells: 8 });
    expect(getCellQuad(base, northWest)[2]).toEqual(originalPoint);
  });

  it('filters actual AABBs and polygons rather than treating each bucket as a hit', async () => {
    const spec = base.manifest.spec, index = createSpatialIndex(base), step = spec.width / spec.columns, vertexId = vertexIdAt(spec, 32, 32);
    const next = await moved(base, [moveToQuarterCorner(base, vertexId, 32, 32)]);
    index.updateGeometry(next, [vertexId]);
    const northWest = cellIdAt(spec, 31, 31), point = { x: 32 * step + step * .24, y: 31 * step + step * .1 };
    expect(index.queryCells(at(point.x, point.y)).cellIds).toContain(northWest);
    expect(index.pick(point).cellId).toBe(cellIdAt(spec, 32, 31));
    const blocks = index.queryBlocks(at(100, 100));
    expect(blocks.blockKeys).toEqual(['geometry:0:0']); expect(blocks.stats.candidateBlocks).toBeLessThanOrEqual(4);
  });

  it('height and independent administrative membership changes never rebuild the two-dimensional index', async () => {
    const index = createSpatialIndex(base), keyBefore = index.dependencyKey, next = copyManifest(base), pickBefore = index.pick({ x: 10, y: 10 });
    // Object insertion order is not part of topology identity after storage decode.
    next.manifest.spec = Object.fromEntries(Object.entries(next.manifest.spec).reverse()) as typeof next.manifest.spec;
    const elevation = cloneBlock(next.blocks.get('elevation:0:0')!), administration = cloneBlock(next.blocks.get('admin-membership:0:0')!);
    if (elevation.layer !== 'elevation' || administration.layer !== 'admin-membership') throw new Error('Test layer missing');
    elevation.values[0] += 1; administration.values[0] = 0;
    next.manifest.catalogs.administration.push({ id: 0, name: '测试叶区', parentId: null, kind: 'leaf' });
    for (const block of [elevation, administration]) {
      const key: BlockKey = `${block.layer}:${block.bx}:${block.by}`;
      next.blocks.set(key, block); next.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(block);
    }
    next.manifest.revision++;
    const update = index.updateGeometry(next, []);
    expect(update).toMatchObject({ dependencyKey: keyBefore, changed: false, invalidatedCells: [], geometryOwnerBlocks: [], affectedDisplayBlocks: [], stats: { cellsReindexed: 0, verticesCompared: 0 } });
    expect(index.pick({ x: 10, y: 10 })).toEqual(pickBefore); expect(index.stats().updates).toBe(0);
  });

  it('rejects invalid and outside queries without unbounded bucket scans', () => {
    const index = createSpatialIndex(base);
    for (const point of [{ x: -1, y: 50 }, { x: 5000, y: 50 }, { x: 50, y: 5000 }]) expect(index.pick(point).cellId).toBeNull();
    expect(index.queryCells({ minX: 1e20, minY: 1e20, maxX: 1e21, maxY: 1e21 })).toEqual({ cellIds: [], stats: { bucketsVisited: 0, candidateCells: 0, aabbTests: 0, polygonTests: 0 } });
    expect(() => index.pick({ x: NaN, y: 0 })).toThrow('范围无效');
    expect(() => index.queryBlocks({ minX: 2, minY: 0, maxX: 1, maxY: 5 })).toThrow('范围无效');
    expect(() => index.area(-1)).toThrow('ID 无效');
    expect(() => index.cellAabb(1.5)).toThrow('ID 无效');
  });

  it('rejects out-of-bounds geometry atomically and retains its original dependency, hit and AABB', async () => {
    const spec = base.manifest.spec, index = createSpatialIndex(base), vertexId = vertexIdAt(spec, 32, 32), cellId = cellIdAt(spec, 31, 31);
    const original = { key: index.dependencyKey, box: index.cellAabb(cellId), stats: index.stats(), pick: index.pick({ x: 1020, y: 1020 }) };
    const target = moveToQuarterCorner(base, vertexId, 32, 32);
    const bad = await moved(base, [{ vertexId, dxQ: target.dxQ + 1, dyQ: 0 }]);
    expect(() => index.updateGeometry(bad, [vertexId])).toThrow('有界移动范围');
    expect(index.dependencyKey).toBe(original.key); expect(index.cellAabb(cellId)).toEqual(original.box); expect(index.stats()).toEqual(original.stats); expect(index.pick({ x: 1020, y: 1020 })).toEqual(original.pick);
  });

  it('detects omitted changed vertices in an owner block instead of keeping stale incident cells', async () => {
    const spec = base.manifest.spec, a = vertexIdAt(spec, 32, 32), b = vertexIdAt(spec, 31, 31), index = createSpatialIndex(base);
    const next = await moved(base, [{ vertexId: a, dxQ: 256, dyQ: 0 }, { vertexId: b, dxQ: 0, dyQ: 256 }]), oldKey = index.dependencyKey;
    expect(() => index.updateGeometry(next, [a])).toThrow('失效列表不一致');
    expect(index.dependencyKey).toBe(oldKey); expect(index.stats().updates).toBe(0);
    expect(index.updateGeometry(next, [a, b]).stats.cellsReindexed).toBe(7);
    expect(() => index.updateGeometry(base, [a, a])).toThrow('重复');
    const foreign = copyManifest(next); foreign.manifest.atlasId += '-different';
    expect(() => index.updateGeometry(foreign, [])).toThrow('身份或拓扑');
  });

  it('keeps the asynchronous candidate private until all cell and display buckets are complete', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), published = vi.fn(), before = fullDigest(base);
    const progress: { stage: string; completed: number; total: number }[] = [];
    let yields = 0;
    const pending = createSpatialIndexAsync(base, { onProgress: value => progress.push(value), yieldTask: async () => { if (++yields === 1) await gate; } }).then(published);
    expect(progress).toEqual([{ stage: '建立地块空间索引', completed: 4096, total: 128 ** 2 }]);
    await Promise.resolve(); expect(published).not.toHaveBeenCalled();
    release(); await pending;
    expect(published).toHaveBeenCalledTimes(1);
    expect(progress.filter(row => row.stage === '建立地块空间索引').map(row => row.completed)).toEqual([4096, 8192, 12288, 16384]);
    expect(progress.filter(row => row.stage === '建立地图块查询索引').map(row => row.completed)).toEqual([8, 16]);
    const index = published.mock.calls[0][0] as ReturnType<typeof createSpatialIndex>;
    expect(index.queryCells({ minX: 0, minY: 0, maxX: 4096, maxY: 4096 }).cellIds).toHaveLength(128 ** 2);
    expect(index.queryBlocks({ minX: 0, minY: 0, maxX: 4096, maxY: 4096 }).blockKeys).toHaveLength(16);
    expect(fullDigest(base)).toBe(before);
  });

  it.each(['建立地块空间索引', '建立地图块查询索引'])('cancelling during %s discards the candidate and preserves the input', async stage => {
    const abort = new AbortController(), published = vi.fn(), progress = vi.fn(), before = fullDigest(base);
    const result = createSpatialIndexAsync(base, { signal: abort.signal, ...noWait, onProgress: row => { progress(row); if (row.stage === stage) abort.abort(); } }).then(published);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(published).not.toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)![0].stage).toBe(stage);
    expect(progress.mock.calls.filter(([row]) => row.stage === stage)).toHaveLength(1);
    expect(fullDigest(base)).toBe(before);
  });

  it('rejects a pre-cancelled build before any progress or yield', async () => {
    const abort = new AbortController(), progress = vi.fn(), yieldTask = vi.fn(); abort.abort();
    await expect(createSpatialIndexAsync(base, { signal: abort.signal, onProgress: progress, yieldTask })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).not.toHaveBeenCalled(); expect(yieldTask).not.toHaveBeenCalled();
  });

  it('late invalid geometry cannot replace a previously usable index', async () => {
    const existing = createSpatialIndex(base), vertex = vertexIdAt(base.manifest.spec, 127, 127);
    const before = { digest: fullDigest(base), key: existing.dependencyKey, pick: existing.pick({ x: 4060, y: 4060 }) };
    const bad = await moved(base, [{ vertexId: vertex, dxQ: 4096, dyQ: 0 }]), published = vi.fn(), progress = vi.fn();
    await expect(createSpatialIndexAsync(bad, { ...noWait, onProgress: progress }).then(published)).rejects.toThrow('有界移动范围');
    expect(progress).toHaveBeenCalled(); expect(published).not.toHaveBeenCalled();
    expect(existing.dependencyKey).toBe(before.key); expect(existing.pick({ x: 4060, y: 4060 })).toEqual(before.pick);
    expect(fullDigest(base)).toBe(before.digest);
  });
});
