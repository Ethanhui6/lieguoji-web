import { cloneBlock, yieldAtlas, type AtlasBlock, type BlockKey } from '../model';
import { generationExact, generationInt, validateGenerationScope, type AtlasGenerationDocument, type GenerationScope } from '../generation-contract';
import { generationEnvelope } from '../generation-format';
import { LOCK_ELEVATION, lockKey } from '../generation-locks';
import { cellNeighbors } from '../topology';
import { batchSize, measureGeography, type GenerationControl } from './quality';
import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

export interface LandformParameters { seed: string; mountainRanges: number; basins: number; reliefMeters: number }
export interface LandformInput { base: AtlasGenerationDocument; parameters: LandformParameters; scope?: GenerationScope }
export interface LandformOutput {
  /** Unchanged blocks share the verified Worker-owned baseline; only actual
   * elevation writes are cloned. No manifest, geometry or membership is edited. */
  blocks: Map<BlockKey, AtlasBlock>; changedKeys: BlockKey[];
  summary: { mountainRanges: number; basins: number; requestedMountainRanges: number; requestedBasins: number; changedCellCount: number; raisedCellCount: number; loweredCellCount: number;
    landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number;
    minElevationMeters: number; maxElevationMeters: number };
  features: { ranges: { anchorCellId: number; ridgeCellIds: number[]; radiusWorld: number }[]; basins: { centerCellId: number; radiusWorld: number }[] };
}
export type LandformControl = GenerationControl;
export type LandformsOutput = LandformOutput;
export function validateLandformParameters(raw: unknown): raw is LandformParameters {
  return generationExact(raw, ['seed', 'mountainRanges', 'basins', 'reliefMeters']) && typeof raw.seed === 'string' && !!raw.seed.trim() && raw.seed.length <= 120
    && generationInt(raw.mountainRanges, 0, 8) && generationInt(raw.basins, 0, 8) && raw.mountainRanges + raw.basins >= 1 && raw.mountainRanges + raw.basins <= 12
    && generationInt(raw.reliefMeters, 200, 6000);
}

/** Indexed decrease-key heap: one entry per cell, stable cell-ID tie breaks. */
class DistanceHeap {
  private count = 0;
  private readonly ids: Uint32Array;
  private readonly positions: Int32Array;
  constructor(private distances: Uint32Array) { this.ids = new Uint32Array(distances.length); this.positions = new Int32Array(distances.length).fill(-1); }
  get size() { return this.count; }
  private less(a: number, b: number) { return this.distances[a] < this.distances[b] || this.distances[a] === this.distances[b] && a < b; }
  private place(index: number, id: number) { this.ids[index] = id; this.positions[id] = index; }
  push(id: number) {
    let index = this.positions[id];
    if (index < 0) { if (this.count === this.ids.length) throw new Error('地貌距离队列超出地图容量。'); index = this.count++; }
    while (index) { const parent = Math.floor((index - 1) / 2), previous = this.ids[parent]; if (!this.less(id, previous)) break; this.place(index, previous); index = parent; }
    this.place(index, id);
  }
  pop() {
    if (!this.count) throw new Error('地貌距离队列为空。');
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

/** Land-only topographic operations. Ridges are real shared-edge walks inside
 * existing connected land, and their falloff uses centroid edge distances.
 * Basins use available land outside ridge footprints; no water or drainage
 * topology is claimed. Locked heights remain exact, including on ridge paths. */
export async function generateLandforms(input: LandformInput, control?: LandformControl): Promise<LandformOutput> {
  if (input.base?.manifest?.version === 4) throw new Error('旧生成器尚不支持第四版细海岸，原图未修改。');
  control?.signal?.throwIfAborted();
  if (!validateLandformParameters(input.parameters)) throw new Error('山系／盆地参数无效：数量各0—8、总数1—12，起伏200—6000米，种子须为1—120字符。');
  if (!generationEnvelope(input.base)) throw new Error('地貌生成需要完整、已核验的第二版草稿与已知锁。');
  const requestedScope = input.scope === undefined ? { kind: 'world' } : input.scope;
  if (!validateGenerationScope(requestedScope)) throw new Error('地貌生成范围无效，必须明确全图或合法地块矩形及过渡宽度。');
  const scope = structuredClone(requestedScope);
  const parameters = structuredClone(input.parameters), base = input.base, spec = base.manifest.spec, total = spec.columns * spec.rows, batch = batchSize(control);
  if (scope.kind === 'cell-rectangle' && (scope.column + scope.columns > spec.columns || scope.row + scope.rows > spec.rows)) throw new Error('局部地貌范围超出当前地图。');
  const inside = (id: number, core = false) => {
    if (scope.kind === 'world') return true;
    const col = id % spec.columns, row = Math.floor(id / spec.columns), inset = core ? scope.transitionCells : 0;
    return col >= scope.column + inset && col < scope.column + scope.columns - inset && row >= scope.row + inset && row < scope.row + scope.rows - inset;
  };
  const scopeWeight = (id: number) => {
    if (scope.kind === 'world') return FIELD_Q;
    if (!inside(id)) return 0;
    if (!scope.transitionCells) return FIELD_Q;
    const col = id % spec.columns, row = Math.floor(id / spec.columns);
    const distance = Math.min(col - scope.column, scope.column + scope.columns - 1 - col, row - scope.row, scope.row + scope.rows - 1 - row);
    // The outer cell-center ring is exactly unchanged. This smoothstep field
    // has zero slope at both the rectangle boundary and the full-strength core.
    return smoothQ(Math.min(FIELD_Q, Math.floor(distance * FIELD_Q / scope.transitionCells)));
  };
  const seed = seedHash('landforms@1\0' + parameters.seed), step = spec.width / spec.columns;
  const { xyQ, elevation } = await measureGeography(base, control, '读取山系与盆地的真实地理');
  const locked = new Uint8Array(total), components = new Uint32Array(total), queue = new Uint32Array(total), parents = new Int32Array(total);
  const landIds: number[] = [], componentSizes: number[] = [0], mountainRaise = new Int32Array(total), basinLower = new Int32Array(total);
  let coreLandCount = 0;
  const pause = (stage: string, completed: number, count = total) => yieldAtlas(control, stage, completed, count);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const column = id % spec.columns, row = Math.floor(id / spec.columns), block = base.locks.get(lockKey(Math.floor(column / 32), Math.floor(row / 32)));
      locked[id] = block && block.flags[row % 32 * 32 + column % 32] & LOCK_ELEVATION ? 1 : 0;
      if (elevation[id] >= 0) { landIds.push(id); if (inside(id, true)) coreLandCount++; }
    }
    await pause('读取陆地与准确高程锁', end);
  }
  let traversed = 0;
  for (const first of landIds) if (inside(first, true) && !components[first]) {
    const component = componentSizes.length; let head = 0, tail = 1; queue[0] = first; components[first] = component;
    while (head < tail) {
      const id = queue[head++]; traversed++;
      for (const next of cellNeighbors(spec, id)) if (inside(next, true) && elevation[next] >= 0 && !components[next]) { components[next] = component; queue[tail++] = next; }
      if (traversed % batch === 0) await pause('确认现有陆地共享边连通', traversed, coreLandCount);
    }
    componentSizes.push(tail);
  }
  await pause('确认现有陆地共享边连通', traversed, coreLandCount);
  const features: LandformOutput['features'] = { ranges: [], basins: [] }, anchors: number[] = [];
  const distanceSquared = (a: number, b: number) => (xyQ[a * 2] - xyQ[b * 2]) ** 2 + (xyQ[a * 2 + 1] - xyQ[b * 2 + 1]) ** 2;
  async function anchorFor(tag: number, eligible: (id: number) => boolean) {
    let selected = -1, best = -1;
    for (let start = 0; start < landIds.length; start += batch) {
      const end = Math.min(landIds.length, start + batch);
      for (let index = start; index < end; index++) {
        const id = landIds[index]; if (!inside(id, true) || !eligible(id)) continue;
        const random = hashAt(seed, tag, id, 0), separation = anchors.length ? Math.min(...anchors.map(anchor => distanceSquared(anchor, id))) : 0;
        const score = anchors.length ? Math.floor(separation * (512 + random % 513) / 1024) : random;
        if (score > best) { best = score; selected = id; }
      }
      await pause('选择可形成真实地貌的位置', end, landIds.length);
    }
    if (selected < 0) throw new Error('范围内核中的陆地、地貌间距或高度锁没有留下足够的可修改区域；原图未改变。');
    return selected;
  }
  async function nearest(component: number, xQ: number, yQ: number) {
    let result = -1, closest = Infinity;
    for (let start = 0; start < landIds.length; start += batch) {
      const end = Math.min(landIds.length, start + batch);
      for (let i = start; i < end; i++) {
        const id = landIds[i]; if (components[id] !== component) continue;
        const distance = (xyQ[id * 2] - xQ) ** 2 + (xyQ[id * 2 + 1] - yQ) ** 2;
        if (distance < closest) { closest = distance; result = id; }
      }
      await pause('将山脊控制点落在同一片陆地', end, landIds.length);
    }
    return result;
  }
  async function route(from: number, to: number) {
    if (from === to) return [from];
    parents.fill(-1); parents[from] = from; queue[0] = from; let head = 0, tail = 1;
    while (head < tail && parents[to] < 0) {
      const id = queue[head++];
      // Stable but seeded neighbor rotation gives equal-length routes a
      // deterministic direction without importing random/frame timing.
      const neighbors = cellNeighbors(spec, id), offset = hashAt(seed, 201, id, from) % neighbors.length;
      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[(i + offset) % neighbors.length];
        if (components[next] !== components[from] || parents[next] >= 0) continue;
        parents[next] = id; queue[tail++] = next;
      }
      if (head % batch === 0) await pause('沿真实陆地连接多段山脊', head, componentSizes[components[from]]);
    }
    if (parents[to] < 0) throw new Error('山脊控制点不能通过现有陆地连接。');
    const cells = [to]; while (cells.at(-1) !== from) cells.push(parents[cells.at(-1)!]);
    await pause('沿真实陆地连接多段山脊', head, componentSizes[components[from]]); return cells.reverse();
  }
  async function spread(seeds: readonly number[], radiusWorld: number, stage: string, allowed: (id: number) => boolean, apply: (id: number, distanceQ: number) => void) {
    const radiusQ = Math.round(radiusWorld * 256), distances = new Uint32Array(total).fill(0xffffffff), settled = new Uint8Array(total), heap = new DistanceHeap(distances);
    for (const id of seeds) if (distances[id] !== 0 && allowed(id)) { distances[id] = 0; heap.push(id); }
    let count = 0;
    while (heap.size) {
      const id = heap.pop(); settled[id] = 1; count++; apply(id, distances[id]);
      for (const next of cellNeighbors(spec, id)) if (!settled[next] && allowed(next)) {
        const distance = distances[id] + Math.max(1, integerSqrt(distanceSquared(id, next)));
        if (distance < radiusQ && distance < distances[next]) { distances[next] = distance; heap.push(next); }
      }
      if (count % batch === 0) await pause(stage, count, landIds.length);
    }
    await pause(stage, count, landIds.length);
  }
  for (let range = 0; range < parameters.mountainRanges; range++) {
    const anchor = await anchorFor(300 + range, id => !locked[id] && elevation[id] < 12000 && !mountainRaise[id] && componentSizes[components[id]] >= 9);
    let dx = hashAt(seed, 401, range, 0) % 1025 - 512;
    const dy = hashAt(seed, 402, range, 0) % 1025 - 512;
    if (!dx && !dy) dx = 512;
    const length = integerSqrt(dx * dx + dy * dy), span = Math.max(160, Math.min(1600, integerSqrt(componentSizes[components[anchor]]) * step)), radiusWorld = Math.max(step * 2, Math.min(256, Math.floor(span / 5)));
    const bend = (hashAt(seed, 403, range, 0) % 513 - 256) / 1024;
    const waypoint = (along: number, across: number) => nearest(components[anchor], xyQ[anchor * 2] + roundRatio((dx * along - dy * across) * span * 256, length), xyQ[anchor * 2 + 1] + roundRatio((dy * along + dx * across) * span * 256, length));
    const controls = [await waypoint(-.5, bend), anchor, await waypoint(.25, -bend), await waypoint(.5, bend)];
    const ridgeCellIds: number[] = [controls[0]];
    for (let i = 1; i < controls.length; i++) for (const id of (await route(controls[i - 1], controls[i])).slice(1)) ridgeCellIds.push(id);
    if (new Set(ridgeCellIds).size < 3) throw new Error('可用陆地不足以形成多点山脊；原图未改变。');
    await spread(ridgeCellIds, radiusWorld, '沿山脊生成连续高程', id => inside(id) && elevation[id] >= 0, (id, distanceQ) => {
      if (locked[id]) return;
      const falloff = smoothQ(FIELD_Q - Math.floor(distanceQ * FIELD_Q / (radiusWorld * 256)));
      const modulation = 3072 + roundRatio(noiseQ12(seed, 500 + range, xyQ[id * 2], xyQ[id * 2 + 1], 384 * 256), 4);
      const raise = roundRatio(Math.min(12000 - elevation[id], roundRatio(parameters.reliefMeters * falloff * modulation, FIELD_Q * FIELD_Q)) * scopeWeight(id), FIELD_Q);
      mountainRaise[id] = Math.max(mountainRaise[id], raise);
    });
    if (!mountainRaise[anchor]) throw new Error('山脊没有产生实际高程变化；原图未改变。');
    anchors.push(anchor); features.ranges.push({ anchorCellId: anchor, ridgeCellIds, radiusWorld });
  }
  for (let basin = 0; basin < parameters.basins; basin++) {
    const center = await anchorFor(600 + basin, id => !locked[id] && elevation[id] > 0 && !mountainRaise[id] && !basinLower[id]);
    const radiusWorld = Math.max(step * 2, Math.min(384, Math.floor(integerSqrt(componentSizes[components[center]]) * step / 4)));
    await spread([center], radiusWorld, '生成保留陆地分类的盆地', id => inside(id) && elevation[id] >= 0 && !mountainRaise[id], (id, distanceQ) => {
      if (locked[id]) return;
      const falloff = smoothQ(FIELD_Q - Math.floor(distanceQ * FIELD_Q / (radiusWorld * 256)));
      basinLower[id] = Math.max(basinLower[id], roundRatio(Math.min(elevation[id], roundRatio(parameters.reliefMeters * falloff, FIELD_Q)) * scopeWeight(id), FIELD_Q));
    });
    if (!basinLower[center]) throw new Error('盆地没有产生实际高程变化；原图未改变。');
    anchors.push(center); features.basins.push({ centerCellId: center, radiusWorld });
  }
  const blocks = new Map(base.blocks), changedKeys: BlockKey[] = [];
  for (let by = 0; by < spec.rows / 32; by++) for (let bx = 0; bx < spec.columns / 32; bx++) {
    const key: BlockKey = `elevation:${bx}:${by}`, source = base.blocks.get(key); if (!source || source.layer !== 'elevation') throw new Error('地貌基线缺少真实高程块。');
    let changed: typeof source | undefined;
    for (let slot = 0; slot < 1024; slot++) {
      const id = (by * 32 + Math.floor(slot / 32)) * spec.columns + bx * 32 + slot % 32, before = elevation[id], value = before + mountainRaise[id] - basinLower[id];
      if (before < 0 && value !== before || before >= 0 && value < 0 || (locked[id] || !inside(id)) && value !== before || value > 12000) throw new Error('地貌候选违反海陆分类、高度锁或局部范围；原图未改变。');
      if (value !== before) { changed ??= cloneBlock(source); changed.values[slot] = value; }
    }
    if (changed) { blocks.set(key, changed); changedKeys.push(key); }
    await pause('写入实际改变的私有地貌块', by * (spec.columns / 32) + bx + 1, (spec.columns / 32) * (spec.rows / 32));
  }
  // Audit actual output blocks independently of the raised/lowered fields and
  // component labels used to construct them. No hydrology is inferred here.
  const final = await measureGeography({ ...base, blocks }, control, '独立核验地貌实际高程与面积'), seen = new Uint8Array(total);
  let changedCellCount = 0, raisedCellCount = 0, loweredCellCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000, landAreaQ2 = 0, majorComponentCount = 0, visited = 0;
  for (let id = 0; id < total; id++) {
    const before = elevation[id], value = final.elevation[id];
    if ((value >= 0) !== (before >= 0) || before < 0 && value !== before || (locked[id] || !inside(id) || scopeWeight(id) === 0) && value !== before) throw new Error('最终地貌改变了海陆分类、海底、锁定高程或范围外地块。');
    if (value !== before) { changedCellCount++; if (value > before) raisedCellCount++; else loweredCellCount++; }
    minElevationMeters = Math.min(minElevationMeters, value); maxElevationMeters = Math.max(maxElevationMeters, value);
    if (value >= 0) landAreaQ2 += final.areaQ2[id];
    if (value >= 0 && !seen[id]) {
      majorComponentCount++; let head = 0, tail = 1; queue[0] = id; seen[id] = 1;
      while (head < tail) {
        const cell = queue[head++]; visited++;
        for (const next of cellNeighbors(spec, cell)) if (!seen[next] && final.elevation[next] >= 0) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await pause('独立遍历地貌后的真实陆地连通', visited, landIds.length);
      }
    }
    if ((id + 1) % batch === 0 || id + 1 === total) await pause('核对每块地貌与锁定原值', id + 1);
  }
  // Construction components describe the scoped core; the reported final count
  // independently covers all land, including everything outside the rectangle.
  if (scope.kind === 'world' && majorComponentCount !== componentSizes.length - 1 || !Number.isSafeInteger(landAreaQ2)) throw new Error('最终地貌的真实连通或面积校验失败。');
  const mountainRanges = features.ranges.filter(range => final.elevation[range.anchorCellId] > elevation[range.anchorCellId]).length,
    basins = features.basins.filter(basin => final.elevation[basin.centerCellId] < elevation[basin.centerCellId]).length;
  if (mountainRanges !== parameters.mountainRanges || basins !== parameters.basins) throw new Error('锁或现有高程使部分地貌没有实际形成；原图未改变。');
  return { blocks, changedKeys, features, summary: { mountainRanges, basins, requestedMountainRanges: parameters.mountainRanges, requestedBasins: parameters.basins,
    changedCellCount, raisedCellCount, loweredCellCount, minElevationMeters, maxElevationMeters, landAreaQ2, worldAreaQ2: final.worldAreaQ2, majorComponentCount } };
}
