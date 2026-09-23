import type { AtlasDraftData, AtlasGridSpec, BlockKey, GeometryBlock } from './model';
import { cellBlock, cellVertexIds, getCellQuad, getGeometryDependencyKey, incidentCellIds, validateVertexPositionQ, type AtlasPoint } from './topology';

export interface AtlasAabb { minX: number; minY: number; maxX: number; maxY: number }
export interface SpatialQueryStats { bucketsVisited: number; candidateCells: number; aabbTests: number; polygonTests: number }
export interface SpatialUpdateStats { geometryBlocksCompared: number; verticesCompared: number; verticesChanged: number; cellsReindexed: number; blocksReindexed: number; blockCellsScanned: number }
export interface SpatialUpdate {
  dependencyKey: string; changed: boolean;
  invalidatedCells: { cellId: number; oldAabb: AtlasAabb; newAabb: AtlasAabb }[];
  geometryOwnerBlocks: BlockKey[]; affectedDisplayBlocks: BlockKey[]; stats: SpatialUpdateStats;
}
export interface SpatialBuildControl {
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  yieldTask?: () => Promise<void>;
}
const BUCKET_CELLS = 8;
// This capability never leaves this module. The async factory holds its partial
// candidate privately and only returns it after both bucket layers are complete.
const DEFER_BUILD = Symbol('private spatial-index builder');
const overlaps = (a: AtlasAabb, b: AtlasAabb) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const boxOfPoint = (p: AtlasPoint): AtlasAabb => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y });
const emptyQuery = (): SpatialQueryStats => ({ bucketsVisited: 0, candidateCells: 0, aabbTests: 0, polygonTests: 0 });
const emptyUpdate = (): SpatialUpdateStats => ({ geometryBlocksCompared: 0, verticesCompared: 0, verticesChanged: 0, cellsReindexed: 0, blocksReindexed: 0, blockCellsScanned: 0 });
function checkedBounds(bounds: AtlasAabb) {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) throw new Error('空间查询范围无效。');
}
function checkedCell(spec: AtlasGridSpec, cellId: number) {
  if (!Number.isSafeInteger(cellId) || cellId < 0 || cellId >= spec.columns * spec.rows) throw new Error('空间索引地块 ID 无效。');
}
function cross(a: AtlasPoint, b: AtlasPoint, c: AtlasPoint) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function contains(quad: AtlasPoint[], point: AtlasPoint) {
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4];
    const productA = (b.x - a.x) * (point.y - a.y), productB = (b.y - a.y) * (point.x - a.x);
    const tolerance = Number.EPSILON * 32 * (Math.abs(productA) + Math.abs(productB) + 1);
    if (productA - productB < -tolerance) return false;
  }
  return true;
}
function measureCell(data: AtlasDraftData, cellId: number) {
  const spec = data.manifest.spec, quad = getCellQuad(data, cellId), ids = cellVertexIds(spec, cellId);
  const vertices = [ids[0], ids[1], ids[3], ids[2]];
  if (quad.length !== 4) throw new Error('空间索引需要完整共享四边形。');
  for (let i = 0; i < 4; i++) {
    const p = quad[i];
    validateVertexPositionQ(spec, vertices[i], p.x * spec.coordinateScale, p.y * spec.coordinateScale);
    if (cross(p, quad[(i + 1) % 4], quad[(i + 2) % 4]) <= 0) throw new Error('共享几何产生退化，空间索引未更新。');
  }
  const bounds = { minX: Math.min(...quad.map(p => p.x)), minY: Math.min(...quad.map(p => p.y)), maxX: Math.max(...quad.map(p => p.x)), maxY: Math.max(...quad.map(p => p.y)) };
  const area = (cross(quad[0], quad[1], quad[2]) + cross(quad[0], quad[2], quad[3])) / 2;
  return { bounds, area };
}
function geometryRefs(data: AtlasDraftData) {
  return new Map(data.manifest.blockRefs.filter(ref => ref.key.startsWith('geometry:')).map(ref => [ref.key, ref.hash]));
}
function specIdentity(spec: AtlasGridSpec) {
  return JSON.stringify([spec.kind, spec.columns, spec.rows, spec.width, spec.height, spec.coordinateScale, spec.blockCells]);
}
function geometryBlock(data: AtlasDraftData, key: BlockKey): GeometryBlock {
  const block = data.blocks.get(key);
  if (!block || block.layer !== 'geometry') throw new Error('空间索引缺少权威共享几何块。');
  return block;
}

/**
 * Derived index over an already validated, internally owned atlas. Geometry
 * buffers must remain immutable; external raw data must pass the atlas codec.
 * AABB buckets are actual occupied ranges, not just the original cell grid.
 */
export class SpatialIndex {
  private data: AtlasDraftData;
  private readonly spec: AtlasGridSpec;
  private readonly specKey: string;
  private readonly boxes: Float64Array;
  private readonly areas: Float64Array;
  private readonly buckets = new Map<string, Set<number>>();
  private readonly blockBuckets = new Map<string, Set<number>>();
  private readonly blockBoxes = new Map<number, AtlasAabb>();
  private readonly blockColumns: number;
  private readonly bucketWidth: number;
  private readonly bucketHeight: number;
  private readonly domain: AtlasAabb;
  private key: string;
  private updates = 0;
  private totalReindexedCells = 0;

  constructor(data: AtlasDraftData, deferred?: typeof DEFER_BUILD) {
    this.data = data; this.spec = { ...data.manifest.spec }; this.specKey = specIdentity(this.spec);
    this.key = getGeometryDependencyKey(data);
    const count = this.spec.columns * this.spec.rows;
    this.boxes = new Float64Array(count * 4); this.areas = new Float64Array(count);
    this.blockColumns = this.spec.columns / this.spec.blockCells;
    this.bucketWidth = this.spec.width / this.spec.columns * BUCKET_CELLS;
    this.bucketHeight = this.spec.height / this.spec.rows * BUCKET_CELLS;
    const marginX = this.spec.width / this.spec.columns / 4, marginY = this.spec.height / this.spec.rows / 4;
    this.domain = { minX: -marginX, minY: -marginY, maxX: this.spec.width + marginX, maxY: this.spec.height + marginY };
    if (deferred === DEFER_BUILD) return;
    this.buildCells(0, count);
    for (let blockId = 0; blockId < this.blockColumns * this.spec.rows / this.spec.blockCells; blockId++) this.rebuildBlock(blockId);
  }
  static async createAsync(data: AtlasDraftData, control: SpatialBuildControl = {}): Promise<SpatialIndex> {
    control.signal?.throwIfAborted();
    const index = new SpatialIndex(data, DEFER_BUILD), count = index.areas.length;
    const pause = async () => {
      control.signal?.throwIfAborted();
      await (control.yieldTask?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
      control.signal?.throwIfAborted();
    };
    for (let start = 0; start < count; start += 4096) {
      const end = Math.min(start + 4096, count);
      index.buildCells(start, end);
      control.onProgress?.({ stage: '建立地块空间索引', completed: end, total: count });
      await pause();
    }
    const blocks = index.blockColumns * index.spec.rows / index.spec.blockCells;
    for (let start = 0; start < blocks; start += 8) {
      const end = Math.min(start + 8, blocks);
      for (let blockId = start; blockId < end; blockId++) index.rebuildBlock(blockId);
      control.onProgress?.({ stage: '建立地图块查询索引', completed: end, total: blocks });
      await pause();
    }
    control.signal?.throwIfAborted();
    return index;
  }
  private buildCells(start: number, end: number) {
    for (let cellId = start; cellId < end; cellId++) {
      const measured = measureCell(this.data, cellId); this.writeCell(cellId, measured.bounds, measured.area);
      this.insert(this.buckets, cellId, measured.bounds);
    }
  }
  get dependencyKey() { return this.key; }
  stats() { return { builds: 1, updates: this.updates, totalCells: this.areas.length, totalReindexedCells: this.totalReindexedCells, bucketCells: BUCKET_CELLS, occupiedBuckets: this.buckets.size }; }
  cellAabb(cellId: number): AtlasAabb {
    checkedCell(this.spec, cellId); const start = cellId * 4;
    return { minX: this.boxes[start], minY: this.boxes[start + 1], maxX: this.boxes[start + 2], maxY: this.boxes[start + 3] };
  }
  area(cellId: number) { checkedCell(this.spec, cellId); return this.areas[cellId]; }
  private writeCell(cellId: number, bounds: AtlasAabb, area: number) {
    this.boxes.set([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY], cellId * 4); this.areas[cellId] = area;
  }
  private bucketKeys(bounds: AtlasAabb) {
    if (!overlaps(bounds, this.domain)) return [];
    const left = Math.floor(Math.max(bounds.minX, this.domain.minX) / this.bucketWidth), right = Math.floor(Math.min(bounds.maxX, this.domain.maxX) / this.bucketWidth);
    const top = Math.floor(Math.max(bounds.minY, this.domain.minY) / this.bucketHeight), bottom = Math.floor(Math.min(bounds.maxY, this.domain.maxY) / this.bucketHeight);
    const keys: string[] = [];
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) keys.push(`${x}:${y}`);
    return keys;
  }
  private insert(buckets: Map<string, Set<number>>, id: number, bounds: AtlasAabb) {
    for (const key of this.bucketKeys(bounds)) { let ids = buckets.get(key); if (!ids) { ids = new Set(); buckets.set(key, ids); } ids.add(id); }
  }
  private remove(buckets: Map<string, Set<number>>, id: number, bounds: AtlasAabb) {
    for (const key of this.bucketKeys(bounds)) { const ids = buckets.get(key); ids?.delete(id); if (ids?.size === 0) buckets.delete(key); }
  }
  private candidates(bounds: AtlasAabb, buckets: Map<string, Set<number>>) {
    const keys = this.bucketKeys(bounds), ids = new Set<number>();
    for (const key of keys) for (const id of buckets.get(key) ?? []) ids.add(id);
    return { ids: [...ids].sort((a, b) => a - b), bucketsVisited: keys.length };
  }
  queryCells(bounds: AtlasAabb) {
    checkedBounds(bounds);
    const candidates = this.candidates(bounds, this.buckets), stats = emptyQuery();
    stats.bucketsVisited = candidates.bucketsVisited; stats.candidateCells = candidates.ids.length; stats.aabbTests = candidates.ids.length;
    return { cellIds: candidates.ids.filter(id => overlaps(this.cellAabb(id), bounds)), stats };
  }
  queryBlocks(bounds: AtlasAabb) {
    checkedBounds(bounds);
    const candidates = this.candidates(bounds, this.blockBuckets);
    return { blockKeys: candidates.ids.filter(id => overlaps(this.blockBoxes.get(id)!, bounds)).map(id => this.blockKey(id)), stats: { bucketsVisited: candidates.bucketsVisited, candidateBlocks: candidates.ids.length, aabbTests: candidates.ids.length } };
  }
  pick(point: AtlasPoint) {
    const { cellIds, stats } = this.queryCells(boxOfPoint(point));
    for (const cellId of cellIds) { stats.polygonTests++; if (contains(getCellQuad(this.data, cellId), point)) return { cellId, stats }; }
    return { cellId: null, stats };
  }
  private blockKey(blockId: number): BlockKey { return `geometry:${blockId % this.blockColumns}:${Math.floor(blockId / this.blockColumns)}`; }
  private rebuildBlock(blockId: number) {
    const before = this.blockBoxes.get(blockId); if (before) this.remove(this.blockBuckets, blockId, before);
    const bx = blockId % this.blockColumns, by = Math.floor(blockId / this.blockColumns);
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let row = by * this.spec.blockCells; row < (by + 1) * this.spec.blockCells; row++) for (let col = bx * this.spec.blockCells; col < (bx + 1) * this.spec.blockCells; col++) {
      const cell = this.cellAabb(row * this.spec.columns + col);
      bounds.minX = Math.min(bounds.minX, cell.minX); bounds.minY = Math.min(bounds.minY, cell.minY); bounds.maxX = Math.max(bounds.maxX, cell.maxX); bounds.maxY = Math.max(bounds.maxY, cell.maxY);
    }
    this.blockBoxes.set(blockId, bounds); this.insert(this.blockBuckets, blockId, bounds);
  }
  updateGeometry(candidate: AtlasDraftData, changedVertexIds: readonly number[]): SpatialUpdate {
    if (candidate.manifest.atlasId !== this.data.manifest.atlasId || specIdentity(candidate.manifest.spec) !== this.specKey) throw new Error('空间索引的地理身份或拓扑发生变化，需要明确重建。');
    const key = getGeometryDependencyKey(candidate), stats = emptyUpdate();
    if (key === this.key) return { dependencyKey: this.key, changed: false, invalidatedCells: [], geometryOwnerBlocks: [], affectedDisplayBlocks: [], stats };
    const specified = new Set(changedVertexIds);
    if (specified.size !== changedVertexIds.length) throw new Error('几何失效顶点列表重复。');
    for (const id of specified) incidentCellIds(this.spec, id);
    const beforeRefs = geometryRefs(this.data), afterRefs = geometryRefs(candidate);
    if (beforeRefs.size !== afterRefs.size || [...beforeRefs.keys()].some(id => !afterRefs.has(id))) throw new Error('几何块目录发生变化，需要明确重建。');
    const changedBlocks = [...afterRefs.keys()].filter(id => beforeRefs.get(id) !== afterRefs.get(id));
    const actualVertices = new Set<number>();
    for (const id of changedBlocks) {
      const before = geometryBlock(this.data, id), after = geometryBlock(candidate, id);
      if (before.vertexIds.length !== after.vertexIds.length || before.xyQ.length !== after.xyQ.length) throw new Error('共享顶点身份变化，空间索引未更新。');
      for (let i = 0; i < before.vertexIds.length; i++) {
        stats.verticesCompared++;
        if (before.vertexIds[i] !== after.vertexIds[i]) throw new Error('共享顶点身份变化，空间索引未更新。');
        if (before.xyQ[i * 2] !== after.xyQ[i * 2] || before.xyQ[i * 2 + 1] !== after.xyQ[i * 2 + 1]) actualVertices.add(before.vertexIds[i]);
      }
    }
    if (!actualVertices.size || actualVertices.size !== specified.size || [...actualVertices].some(id => !specified.has(id))) throw new Error('实际几何变化与顶点失效列表不一致，空间索引未更新。');
    const cells = [...new Set([...actualVertices].flatMap(id => incidentCellIds(this.spec, id)))].sort((a, b) => a - b);
    // Validate every replacement before touching any current AABB or bucket.
    const replacements = cells.map(cellId => ({ cellId, oldAabb: this.cellAabb(cellId), measured: measureCell(candidate, cellId) }));
    const blocks = new Set<number>();
    for (const { cellId, oldAabb, measured } of replacements) {
      this.remove(this.buckets, cellId, oldAabb); this.writeCell(cellId, measured.bounds, measured.area); this.insert(this.buckets, cellId, measured.bounds);
      const block = cellBlock(this.spec, cellId); blocks.add(block.by * this.blockColumns + block.bx);
    }
    for (const id of blocks) this.rebuildBlock(id);
    this.data = candidate; this.key = key; this.updates++; this.totalReindexedCells += cells.length;
    stats.geometryBlocksCompared = changedBlocks.length; stats.verticesChanged = actualVertices.size; stats.cellsReindexed = cells.length; stats.blocksReindexed = blocks.size; stats.blockCellsScanned = blocks.size * this.spec.blockCells ** 2;
    return { dependencyKey: key, changed: true, invalidatedCells: replacements.map(({ cellId, oldAabb, measured }) => ({ cellId, oldAabb, newAabb: { ...measured.bounds } })), geometryOwnerBlocks: changedBlocks.sort(), affectedDisplayBlocks: [...blocks].sort((a, b) => a - b).map(id => this.blockKey(id)), stats };
  }
}
export function createSpatialIndex(data: AtlasDraftData) { return new SpatialIndex(data); }
export function createSpatialIndexAsync(data: AtlasDraftData, control?: SpatialBuildControl) { return SpatialIndex.createAsync(data, control); }
