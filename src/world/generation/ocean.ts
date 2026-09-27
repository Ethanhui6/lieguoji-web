import { blockKey, cloneBlock, encodeBlock, validateBlock, yieldAtlas, type AtlasBlock, type BlockKey } from '../model';
import { generationExact, validateOceanRecipe, type AtlasGenerationDocument, type OceanRecipe } from '../generation-contract';
import { cloneVerifiedGenerationDocument } from '../generation-format';
import { lockKey } from '../generation-locks';
import { cellNeighbors } from '../topology';
import { batchSize, measureGeography, type GenerationControl, type GeographyMeasurements } from './quality';
import { FIELD_Q, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

export interface OceanInput { base: AtlasGenerationDocument; recipe: OceanRecipe }
export interface OceanSummary {
  changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number;
  minElevationMeters: number; maxElevationMeters: number;
  ocean: { oceanCellCount: number; changedSeaCellCount: number; protectedSeaCellCount: number; shelfCellCount: number; deepSeaCellCount: number };
}
export interface OceanOutput { blocks: Map<BlockKey, AtlasBlock>; changedKeys: BlockKey[]; summary: OceanSummary }
const FAR = 0xffffffff;

/** Decrease-key heap, one entry per geographic cell. Stable ID ties make
 * traversal independent of scheduling, insertion order and random streams. */
class CoastHeap {
  private count = 0;
  private readonly ids: Uint32Array;
  private readonly positions: Int32Array;
  constructor(private distances: Uint32Array) { this.ids = new Uint32Array(distances.length); this.positions = new Int32Array(distances.length).fill(-1); }
  get size() { return this.count; }
  private less(a: number, b: number) { return this.distances[a] < this.distances[b] || this.distances[a] === this.distances[b] && a < b; }
  private place(index: number, id: number) { this.ids[index] = id; this.positions[id] = index; }
  push(id: number) {
    let index = this.positions[id];
    if (index < 0) { if (this.count === this.ids.length) throw new Error('海岸距离队列超过真实地图容量。'); index = this.count++; }
    while (index) { const parent = Math.floor((index - 1) / 2), previous = this.ids[parent]; if (!this.less(id, previous)) break; this.place(index, previous); index = parent; }
    this.place(index, id);
  }
  pop() {
    if (!this.count) throw new Error('海岸距离队列为空。');
    const result = this.ids[0], tail = this.ids[--this.count]; this.positions[result] = -1;
    if (this.count) {
      let index = 0;
      while (index * 2 + 1 < this.count) {
        let child = index * 2 + 1; if (child + 1 < this.count && this.less(this.ids[child + 1], this.ids[child])) child++;
        if (!this.less(this.ids[child], tail)) break; this.place(index, this.ids[child]); index = child;
      }
      this.place(index, tail);
    }
    return result;
  }
}

/** Only negative cells with an actual four-edge path to the world boundary
 * belong to this operation. A closed inland depression is never an ocean. */
async function oceanDomain(base: AtlasGenerationDocument, measured: GeographyMeasurements, shelfQ: number, control?: GenerationControl) {
  const spec = base.manifest.spec, total = measured.elevation.length, batch = batchSize(control);
  const ocean = new Uint8Array(total), flags = new Uint8Array(total), queue = new Uint32Array(total), distanceQ = new Uint32Array(total).fill(FAR);
  let head = 0, tail = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const col = id % spec.columns, row = Math.floor(id / spec.columns);
      flags[id] = base.locks.get(lockKey(Math.floor(col / 32), Math.floor(row / 32)))?.flags[row % 32 * 32 + col % 32] ?? 0;
      if ((col === 0 || row === 0 || col === spec.columns - 1 || row === spec.rows - 1) && measured.elevation[id] < 0) { ocean[id] = 1; queue[tail++] = id; }
    }
    await yieldAtlas(control, '识别世界边界海水与保护区', end, total);
  }
  while (head < tail) {
    const id = queue[head++];
    for (const next of cellNeighbors(spec, id)) if (!ocean[next] && measured.elevation[next] < 0) { ocean[next] = 1; queue[tail++] = next; }
    if (head % batch === 0) await yieldAtlas(control, '沿真实共享边识别外海与封闭内湖', head, total);
  }
  await yieldAtlas(control, '沿真实共享边识别外海与封闭内湖', head, total);
  const heap = new CoastHeap(distanceQ);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) if (ocean[id] && cellNeighbors(spec, id).some(next => measured.elevation[next] >= 0)) { distanceQ[id] = 0; heap.push(id); }
    await yieldAtlas(control, '定位需要原样保留的第一圈近岸海水', end, total);
  }
  let traversed = 0;
  while (heap.size) {
    const id = heap.pop(); traversed++;
    for (const next of cellNeighbors(spec, id)) if (ocean[next]) {
      const dx = measured.xyQ[id * 2] - measured.xyQ[next * 2], dy = measured.xyQ[id * 2 + 1] - measured.xyQ[next * 2 + 1];
      const candidate = Math.min(shelfQ, distanceQ[id] + Math.max(1, integerSqrt(dx * dx + dy * dy)));
      if (candidate < distanceQ[next]) { distanceQ[next] = candidate; if (candidate < shelfQ) heap.push(next); }
    }
    if (traversed % batch === 0) await yieldAtlas(control, '量测真实海格重心距岸与连续陆架', traversed, tail);
  }
  await yieldAtlas(control, '量测真实海格重心距岸与连续陆架', traversed, tail);
  return { ocean, flags, distanceQ, oceanCellCount: tail };
}
async function landCount(base: AtlasGenerationDocument, heights: Int32Array, control?: GenerationControl) {
  const total = heights.length, seen = new Uint8Array(total), queue = new Uint32Array(total), batch = batchSize(control); let components = 0, visited = 0;
  for (let first = 0; first < total; first++) {
    if (heights[first] >= 0 && !seen[first]) {
      components++; let head = 0, tail = 1; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++]; visited++;
        for (const next of cellNeighbors(base.manifest.spec, id)) if (!seen[next] && heights[next] >= 0) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await yieldAtlas(control, '独立核验海床操作后的陆地连通', visited, total);
      }
    }
    if ((first + 1) % batch === 0 || first + 1 === total) await yieldAtlas(control, '核验海床操作后的全部海陆采样', first + 1, total);
  }
  return components;
}

/** Re-derive ocean connectivity, coast distances and area from final saved
 * columns and real shared geometry; no generation mask or claimed count enters. */
export async function inspectOceanOutput(base: AtlasGenerationDocument, blocks: ReadonlyMap<BlockKey, AtlasBlock>, recipe: OceanRecipe, control?: GenerationControl): Promise<OceanSummary> {
  control?.signal?.throwIfAborted();
  if (!validateOceanRecipe(recipe, base.manifest.spec) || blocks.size !== base.blocks.size) throw new Error('海床配方或输出块数无效。');
  let checked = 0;
  for (const [key, before] of base.blocks) {
    const after = blocks.get(key);
    if (!validateBlock(after, base.manifest.spec) || blockKey(after.layer, after.bx, after.by) !== key) throw new Error('海床输出块身份或内容无效。');
    if (before.layer !== 'elevation' && before !== after) {
      const a = encodeBlock(before), b = encodeBlock(after);
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('海床生成必须保留共享几何、模拟区与行政归属。');
    }
    if (++checked % 16 === 0) await yieldAtlas(control, '核验海床操作的地理保留层', checked, base.blocks.size);
  }
  const before = await measureGeography(base, control, '独立读取原海陆实际地理'), after = await measureGeography({ ...base, blocks }, control, '独立量测海床结果实际面积');
  const domain = await oceanDomain(base, after, recipe.parameters.shelfWidthWorld * 256, control), total = before.elevation.length, batch = batchSize(control);
  let changedCellCount = 0, protectedSeaCellCount = 0, shelfCellCount = 0, deepSeaCellCount = 0, landAreaQ2 = 0, minElevationMeters = 12000, maxElevationMeters = -12000, editableSea = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const a = before.elevation[id], b = after.elevation[id];
      if ((a >= 0) !== (b >= 0)) throw new Error('海床生成不得改变任何海陆分类。');
      if ((a >= 0 || !domain.ocean[id] || domain.flags[id] || domain.distanceQ[id] === 0) && a !== b) throw new Error('海床生成改变了陆地、锁、封闭内湖或第一圈近岸海水。');
      if (a !== b) changedCellCount++;
      if (b >= 0) landAreaQ2 += after.areaQ2[id];
      if (domain.ocean[id]) {
        if (domain.flags[id]) protectedSeaCellCount++; else editableSea++;
        if (domain.distanceQ[id] < recipe.parameters.shelfWidthWorld * 256) shelfCellCount++; else deepSeaCellCount++;
      }
      minElevationMeters = Math.min(minElevationMeters, b); maxElevationMeters = Math.max(maxElevationMeters, b);
    }
    await yieldAtlas(control, '独立核验海床海陆、内湖与区域锁保护', end, total);
  }
  if (!editableSea) throw new Error('没有可编辑的外海：海水需通过真实共享边连到世界边界，且不能被锁定。原图未改变。');
  if (!changedCellCount) throw new Error('当前海床参数没有改变可编辑外海；第一圈近岸保留原样。请调整参数或选择更宽的海域。原图未改变。');
  return { changedCellCount, landAreaQ2, worldAreaQ2: after.worldAreaQ2, majorComponentCount: await landCount(base, after.elevation, control), minElevationMeters, maxElevationMeters,
    ocean: { oceanCellCount: domain.oceanCellCount, changedSeaCellCount: changedCellCount, protectedSeaCellCount, shelfCellCount, deepSeaCellCount } };
}

/** Continuous real bathymetry on boundary-connected ocean only. Distances
 * travel along sea-cell shared edges using actual Q8 centroids. The first
 * coastal ring stays exact; smoothstep reaches a seeded basin/ridge field at
 * the requested shelf width. No visual colour is part of the saved result. */
export async function generateOcean(input: OceanInput, control?: GenerationControl): Promise<OceanOutput> {
  if (input.base?.manifest?.version === 4) throw new Error('旧生成器尚不支持第四版细海岸，原图未修改。');
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'recipe']) || !validateOceanRecipe(input.recipe, input.base?.manifest?.spec)) throw new Error('海床配方、真实地图规格或参数无效。');
  const recipe = structuredClone(input.recipe), batch = batchSize(control), base = await cloneVerifiedGenerationDocument(input.base, control);
  const measured = await measureGeography(base, control, '读取海床真实共享地理'), shelfQ = recipe.parameters.shelfWidthWorld * 256;
  const domain = await oceanDomain(base, measured, shelfQ, control), total = measured.elevation.length, seed = seedHash(`ocean-floor@1\0${recipe.seed}`);
  const blocks = new Map(base.blocks), changed = new Set<BlockKey>(), size = base.manifest.spec.columns; let editableSea = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      if (!domain.ocean[id] || domain.flags[id]) continue; editableSea++;
      if (domain.distanceQ[id] === 0) continue;
      const x = measured.xyQ[id * 2], y = measured.xyQ[id * 2 + 1], basin = noiseQ12(seed, 1201, x, y, 1408 * 256);
      const ridge = FIELD_Q - Math.abs(noiseQ12(seed, 1202, x, y, 768 * 256));
      const relief = roundRatio(3 * basin + FIELD_Q - 2 * ridge, 4);
      const deep = -Math.max(200, Math.min(12000, recipe.parameters.meanDepthMeters + roundRatio(recipe.parameters.reliefMeters * relief, FIELD_Q)));
      const weight = domain.distanceQ[id] >= shelfQ ? FIELD_Q : smoothQ(roundRatio(domain.distanceQ[id] * FIELD_Q, shelfQ));
      const value = Math.min(-1, roundRatio(measured.elevation[id] * (FIELD_Q - weight) + deep * weight, FIELD_Q));
      if (value === measured.elevation[id]) continue;
      const col = id % size, row = Math.floor(id / size), key = blockKey('elevation', Math.floor(col / 32), Math.floor(row / 32));
      if (!changed.has(key)) { blocks.set(key, cloneBlock(base.blocks.get(key)!)); changed.add(key); }
      const block = blocks.get(key)!; if (block.layer !== 'elevation') throw new Error('海床写入层无效。'); block.values[row % 32 * 32 + col % 32] = value;
    }
    await yieldAtlas(control, '生成连续海盆、海底山脊与陆架高程', end, total);
  }
  if (!editableSea) throw new Error('没有可编辑的外海：海水需通过真实共享边连到世界边界，且不能被锁定。原图未改变。');
  const summary = await inspectOceanOutput(base, blocks, recipe, control); control?.signal?.throwIfAborted();
  return { blocks, changedKeys: [...changed].sort(), summary };
}
