import { cloneBlock, yieldAtlas } from '../model';
import type { AtlasBlock, BlockKey } from '../model';
import { cellNeighbors } from '../topology';
import { validateGenerationScope, validateMacroRecipe } from '../generation-contract';
import type { AtlasGenerationDocument, GenerationScope, MacroRecipe } from '../generation-contract';
import { batchSize, inspectGeneration, measureGeography, quadQ } from './quality';
import type { GenerationControl, GenerationQuality } from './quality';
import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

export interface GenerationInput { base: AtlasGenerationDocument; recipe: MacroRecipe; scope: GenerationScope }
export interface GenerationOutput {
  /** Only modified elevation blocks are cloned. Other immutable blocks remain
   * shared read-only with the privately owned Worker baseline. */
  blocks: Map<BlockKey, AtlasBlock>;
  changedKeys: BlockKey[];
  summary: { changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number; minElevationMeters: number; maxElevationMeters: number };
  diagnostics: GenerationQuality & { layout: 'branch-field-competing-growth-v2'; sitesQ: [number, number][];
    requestedAreaQ2: number[]; grownAreaQ2: number[]; blockedFrontierCells: number; coastlineEdges: number };
}
interface Site { xQ: number; yQ: number; segments: [[number, number], [number, number]][]; weight: number }
const WORLD_Q = 4096 * 256, INF = 0xffffffff;

/** A bounded indexed min-heap. Each cell has at most one live queue entry.
 * Every tie is cell ID, independently of insertion order and batch scheduling. */
class MinHeap {
  private length = 0;
  private ids: Uint32Array;
  constructor(private priorities: Uint32Array, private capacity: number, private positions?: Int32Array) { this.ids = new Uint32Array(Math.min(64, capacity)); }
  get size() { return this.length; }
  get firstPriority() { return this.length ? this.priorities[this.ids[0]] : Infinity; }
  private less(a: number, b: number) { return this.priorities[a] < this.priorities[b] || this.priorities[a] === this.priorities[b] && a < b; }
  private place(index: number, id: number) { this.ids[index] = id; if (this.positions) this.positions[id] = index; }
  push(id: number) {
    let index = this.positions ? this.positions[id] : -1;
    if (index < 0) {
      if (this.length === this.capacity) throw new Error('生成优先队列容量异常。');
      if (this.length === this.ids.length) {
        const larger = new Uint32Array(Math.min(this.capacity, this.ids.length * 2)); larger.set(this.ids); this.ids = larger;
      }
      index = this.length++;
    }
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2), previous = this.ids[parent];
      if (!this.less(id, previous)) break; this.place(index, previous); index = parent;
    }
    this.place(index, id);
  }
  pop(): number {
    if (!this.length) throw new Error('不能读取空生成队列。');
    const result = this.ids[0], tail = this.ids[--this.length]; if (this.positions) this.positions[result] = -1;
    if (this.length) {
      let index = 0;
      while (index * 2 + 1 < this.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.length && this.less(this.ids[child + 1], this.ids[child])) child++;
        if (!this.less(this.ids[child], tail)) break; this.place(index, this.ids[child]); index = child;
      }
      this.place(index, tail);
    }
    return result;
  }
}
function sitesFor(seed: number, count: number): Site[] {
  const sites: Site[] = [];
  for (let i = 0; i < count; i++) {
    let bestX = 0, bestY = 0, bestDistance = -1;
    for (let candidate = 0; candidate < 64; candidate++) {
      const margin = 576, span = 4096 - 2 * margin;
      const x = (margin + hashAt(seed, 101, i, candidate) % span) * 256;
      const y = (margin + hashAt(seed, 102, i, candidate) % span) * 256;
      const distance = sites.length ? Math.min(...sites.map(site => (x - site.xQ) ** 2 + (y - site.yQ) ** 2)) : Infinity;
      if (distance > bestDistance) { bestDistance = distance; bestX = x; bestY = y; }
      // First sufficiently separated candidate, not the farthest of 64:
      // spacing remains irregular instead of arranging seeds at the corners.
      if (distance >= (count > 3 ? 896 * 256 : 1280 * 256) ** 2) break;
    }
    const segments: Site['segments'] = [], nodes: [number, number][] = [[bestX, bestY]];
    const directions = [[256, 0], [237, 98], [181, 181], [98, 237], [0, 256], [-98, 237], [-181, 181], [-237, 98],
      [-256, 0], [-237, -98], [-181, -181], [-98, -237], [0, -256], [98, -237], [181, -181], [237, -98]];
    const firstDirection = hashAt(seed, 104, i, 0) % 16;
    for (let branch = 0; branch < 5; branch++) {
      const parent = branch < 2 ? 0 : hashAt(seed, 105, i, branch) % nodes.length;
      const direction = (firstDirection + branch * 5 + hashAt(seed, 106, i, branch) % 5) % 16;
      const length = 280 + hashAt(seed, 107, i, branch) % 521, origin = nodes[parent], vector = directions[direction];
      const end: [number, number] = [Math.max(192 * 256, Math.min(WORLD_Q - 192 * 256, origin[0] + length * vector[0])),
        Math.max(192 * 256, Math.min(WORLD_Q - 192 * 256, origin[1] + length * vector[1]))];
      if (end[0] !== origin[0] || end[1] !== origin[1]) { nodes.push(end); segments.push([origin, end]); }
    }
    sites.push({ xQ: bestX, yQ: bestY, segments, weight: 384 + hashAt(seed, 108, i, 0) % 2689 });
  }
  return sites;
}
function segmentDistanceQ(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const dot = (x - a[0]) * dx + (y - a[1]) * dy;
  // Divide before multiplication. World-size segments otherwise make the
  // projection's intermediate product exceed exact Number integer arithmetic.
  const scaledDot = Math.max(0, Math.min(length2, dot)) * 65536;
  if (!Number.isSafeInteger(scaledDot) || length2 <= 0) throw new Error('生成脊线投影超出精确整数范围。');
  const t = roundRatio(scaledDot, length2);
  const px = a[0] + roundRatio(dx * t, 65536), py = a[1] + roundRatio(dy * t, 65536);
  return integerSqrt((x - px) ** 2 + (y - py) ** 2);
}
function branchDistanceQ(site: Site, xQ: number, yQ: number) {
  let distance = INF;
  for (const [a, b] of site.segments) distance = Math.min(distance, segmentDistanceQ(xQ, yQ, a, b));
  return distance;
}
function coastalField(seed: number, xQ: number, yQ: number, wavelength: number) {
  // Rotate the sampling lattice with integer ratios so noise ridges do not
  // align with rows. Every term is a continuous world-coordinate field.
  const x = roundRatio(3 * xQ + 4 * yQ, 5), y = roundRatio(4 * xQ - 3 * yQ, 5);
  return roundRatio(480 * noiseQ12(seed, 11, x, y, wavelength * 256)
    + 640 * noiseQ12(seed, 12, x, y, wavelength * 512)
    + 440 * noiseQ12(seed, 13, x, y, 1536 * 256), FIELD_Q);
}
function fieldScore(site: Site, xQ: number, yQ: number, coastal: number) {
  const distance = branchDistanceQ(site, xQ, yQ), dx = xQ - site.xQ, dy = yQ - site.yQ;
  const edge = Math.min(xQ, yQ, WORLD_Q - xQ, WORLD_Q - yQ) / 256;
  const margin = Math.max(0, 384 - edge + Math.max(-128, Math.min(192, roundRatio(coastal, 3))));
  const score = 8192 + Math.floor(distance / 256) + Math.floor(integerSqrt(dx * dx + dy * dy) / 1024)
    + coastal + Math.floor(margin * margin / 48);
  if (!Number.isSafeInteger(score) || score < 0 || score >= INF) throw new Error('连续大陆势场超出登记范围。');
  return score;
}

/** Deterministic macro generation. Input is a verified Worker-owned document;
 * this function never changes its manifest, blocks, locks or persistence. */
export async function generateMacro(input: GenerationInput, control?: GenerationControl): Promise<GenerationOutput> {
  control?.signal?.throwIfAborted();
  if (!validateMacroRecipe(input.recipe) || !validateGenerationScope(input.scope) || input.scope.kind !== 'world') throw new Error('未知生成配方、指纹或尚未实现的生成范围。');
  if (input.base.manifest.version !== 2 && input.base.manifest.version !== 3 || input.base.manifest.constraints.lockRefs.length || input.base.locks.size) throw new Error('整图生成仅支持已核验且没有区域锁的创世草稿。');
  const { base, recipe } = input, parameters = recipe.parameters, batch = batchSize(control), spec = base.manifest.spec;
  const size = spec.columns, total = size * size, seed = seedHash(recipe.seed), sites = sitesFor(seed, parameters.majorContinents);
  const measured = await measureGeography(base, control), { areaQ2, xyQ, worldAreaQ2 } = measured;
  const land = new Uint8Array(total), state = new Uint8Array(total), priorities = new Uint32Array(total);
  const coastal = new Int32Array(total), forbidden = new Uint8Array(total), nominalStep = WORLD_Q / size;
  const seeds = new Int32Array(sites.length).fill(-1), seedDistance = sites.map(() => Infinity);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const x = xyQ[id * 2], y = xyQ[id * 2 + 1];
      coastal[id] = coastalField(seed, x, y, parameters.coastWavelengthWorld);
      // Keep only the actual outside row/column permanently ocean. There is
      // no internal polygon partition and no artificial territory capacity.
      const col = id % size, row = Math.floor(id / size);
      if (!col || !row || col === size - 1 || row === size - 1) { state[id] = 1; continue; }
      for (let i = 0; i < sites.length; i++) {
        const distance = (x - sites[i].xQ) ** 2 + (y - sites[i].yQ) ** 2;
        if (distance < seedDistance[i]) { seedDistance[i] = distance; seeds[i] = id; }
      }
    }
    await yieldAtlas(control, '构造连续分枝与海岸势场', end, total);
  }
  const target = parameters.landCoveragePermille * worldAreaQ2, weight = sites.reduce((sum, site) => sum + site.weight, 0);
  const quotas = sites.map(site => Number(BigInt(target) * BigInt(site.weight) / (1000n * BigInt(weight))));
  if (seeds.some(id => id < 0) || new Set(seeds).size !== sites.length
    || quotas.some((value, i) => !Number.isSafeInteger(value) || value <= areaQ2[seeds[i]])) throw new Error('大陆实际生长种子或面积配额不足，原地图保持不变。');
  // Queues grow on demand. A cell is claimed by at most one frontier, so the
  // total entries ever enqueued is <= N; storage stays below 2N + 6*64.
  const heaps = sites.map(() => new MinHeap(priorities, total)), currentArea = sites.map(() => 0);
  const rank = sites.map((_, index) => index).sort((a, b) => hashAt(seed, 4, a, 0) - hashAt(seed, 4, b, 0) || a - b);
  let landArea = 0, growthSteps = 0, blockedFrontierCells = 0;
  // A bounded world-coordinate clearance around each real growing shore.
  // The variable field makes contacting coastlines diverge into wider bays;
  // the explicit shared-edge test below independently forbids land contact.
  const radius = Math.ceil(256 * 256 / nominalStep), offsets: [number, number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const distance = integerSqrt((dx * dx + dy * dy) * nominalStep * nominalStep);
    if (distance <= 256 * 256) offsets.push([dx, dy, distance]);
  }
  const reserve = (id: number, territory: number) => {
    const col = id % size, row = Math.floor(id / size), bit = 1 << territory;
    const clearance = (64 + Math.max(0, Math.min(192, 96 + Math.floor(coastal[id] / 2)))) * 256;
    for (const [dx, dy, distance] of offsets) {
      const x = col + dx, y = row + dy;
      if (distance <= clearance && x >= 0 && y >= 0 && x < size && y < size) forbidden[y * size + x] |= bit;
    }
  };
  const rivals = (id: number, territory: number) => Boolean(forbidden[id] & ~(1 << territory))
    || cellNeighbors(spec, id).some(next => land[next] && land[next] !== territory + 1);
  const enqueue = (id: number, territory: number) => {
    if (state[id]) return;
    if (rivals(id, territory)) return;
    state[id] = 1; priorities[id] = fieldScore(sites[territory], xyQ[id * 2], xyQ[id * 2 + 1], coastal[id]); heaps[territory].push(id);
  };
  const add = (id: number, territory: number) => {
    land[id] = territory + 1; state[id] = 1; landArea += areaQ2[id]; currentArea[territory] += areaQ2[id]; reserve(id, territory);
    for (const next of cellNeighbors(spec, id)) enqueue(next, territory);
  };
  // Reserve every seed before growing any of them, so initialization order
  // cannot silently consume another continent's starting cell.
  seeds.forEach((id, territory) => { state[id] = 1; reserve(id, territory); });
  if (seeds.some((id, territory) => rivals(id, territory))) throw new Error('独立大陆起点的实际海峡不足。');
  seeds.forEach((id, territory) => add(id, territory));
  if (landArea * 1000 >= target) throw new Error('最低连通种子面积已经超过目标，候选已拒绝。');
  while (landArea * 1000 < target) {
    let selected = -1, cheapest = Infinity;
    for (const territory of rank) {
      // Quotas are a smooth size preference, not a command to fill a corner
      // after a better coast has run out. Every seed first gets a small viable
      // core; thereafter actual coastal potential competes with size pressure.
      const pressure = Math.floor(currentArea[territory] * 2048 / quotas[territory]);
      const score = heaps[territory].firstPriority + pressure - (currentArea[territory] * 16 < quotas[territory] ? 16384 : 0);
      if (heaps[territory].size && score < cheapest) { selected = territory; cheapest = score; }
    }
    if (selected < 0) throw new Error('连通前沿已用尽，无法满足真实面积目标。');
    const id = heaps[selected].pop(), next = (landArea + areaQ2[id]) * 1000;
    if (rivals(id, selected)) { blockedFrontierCells++; }
    else {
      if (next >= target) { if (next - target < target - landArea * 1000) add(id, selected); break; }
      add(id, selected);
    }
    if (++growthSteps % batch === 0) await yieldAtlas(control, '按真实面积连通生成大陆', Math.min(target, landArea * 1000), target);
  }
  await yieldAtlas(control, '按真实面积连通生成大陆', Math.min(target, landArea * 1000), target);

  // Actual coast segments initialize a signed distance field; Dijkstra then
  // propagates only across the same final sea/land class, with real centroids.
  priorities.fill(INF); state.fill(0); const positions = new Int32Array(total).fill(-1), distanceHeap = new MinHeap(priorities, total, positions);
  let coastlineEdges = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const col = id % size, row = Math.floor(id / size), points = quadQ(base, id);
      const neighbors = [row ? id - size : -1, col + 1 < size ? id + 1 : -1, row + 1 < size ? id + size : -1, col ? id - 1 : -1];
      for (let edge = 0; edge < 4; edge++) if (neighbors[edge] >= 0 && Boolean(land[id]) !== Boolean(land[neighbors[edge]])) {
        const distance = segmentDistanceQ(xyQ[id * 2], xyQ[id * 2 + 1], points[edge], points[(edge + 1) % 4]);
        priorities[id] = Math.min(priorities[id], Math.max(1, distance)); if (id < neighbors[edge]) coastlineEdges++;
      }
      if (priorities[id] !== INF) distanceHeap.push(id);
    }
    await yieldAtlas(control, '从实际共享岸线测量距离', end, total);
  }
  let settled = 0;
  while (distanceHeap.size) {
    const id = distanceHeap.pop(); state[id] = 1; settled++;
    for (const next of cellNeighbors(spec, id)) if (!state[next] && Boolean(land[id]) === Boolean(land[next])) {
      const dx = xyQ[2 * id] - xyQ[2 * next], dy = xyQ[2 * id + 1] - xyQ[2 * next + 1];
      const distance = priorities[id] + Math.max(1, integerSqrt(dx * dx + dy * dy));
      if (!Number.isSafeInteger(distance) || distance >= INF) throw new Error('真实岸距超出有界距离场。');
      if (distance < priorities[next]) { priorities[next] = distance; distanceHeap.push(next); }
    }
    if (settled % batch === 0 || settled === total) await yieldAtlas(control, '传播连续陆地与海底岸距', settled, total);
  }
  if (settled !== total) throw new Error('部分地块没有可达的真实岸线，无法形成连续高程。');
  const maxima = new Uint32Array(2);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const x = xyQ[id * 2], y = xyQ[id * 2 + 1], distance = priorities[id];
      if (land[id]) {
        const site = sites[land[id] - 1], ridgeDistance = Math.floor(branchDistanceQ(site, x, y) / 256);
        const ridge = Math.floor(12 * FIELD_Q * 256 * 256 / (256 * 256 + ridgeDistance * ridgeDistance));
        const broad = FIELD_Q + noiseQ12(seed, 51, x, y, 768 * 256);
        const detail = FIELD_Q + noiseQ12(seed, 52, x, y, 256 * 256);
        const envelope = smoothQ(Math.floor(distance * FIELD_Q / (240 * 256)));
        // A continuous positive interior field fades into its actual coast.
        // Heights follow branched ridges and broad depressions, rather than
        // duplicating the outline as concentric height rings. This is initial
        // macro relief; the separate landform editor owns authored T2 ranges.
        priorities[id] = 1 + roundRatio(envelope * (1024 + ridge + 2 * broad + detail), FIELD_Q);
      } else {
        const modulation = 3 * FIELD_Q + noiseQ12(seed, 53, x, y, 1024 * 256);
        priorities[id] = Math.max(1, roundRatio(distance * modulation, 3 * FIELD_Q));
      }
      const group = land[id] ? 1 : 0; maxima[group] = Math.max(maxima[group], priorities[id]);
    }
    await yieldAtlas(control, '核定各大陆连续高程范围', end, total);
  }
  const blocks = new Map(base.blocks), changedKeys: BlockKey[] = []; let changedCellCount = 0;
  const across = size / 32;
  for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
    const key: BlockKey = `elevation:${bx}:${by}`, previous = base.blocks.get(key);
    if (!previous || previous.layer !== 'elevation') throw new Error('生成基线缺少高程块。');
    const candidate = cloneBlock(previous); let changed = false;
    for (let slot = 0; slot < 1024; slot++) {
      const id = (by * 32 + Math.floor(slot / 32)) * size + bx * 32 + slot % 32;
      const group = land[id] ? 1 : 0, t = Math.floor(priorities[id] * 65536 / maxima[group]);
      const value = land[id] ? 1 + roundRatio((parameters.reliefMeters - 1) * t, 65536) : -1 - roundRatio(2999 * smoothQ(t, 65536), 65536);
      if (value !== previous.values[slot]) { changedCellCount++; changed = true; } candidate.values[slot] = value;
    }
    if (changed) { blocks.set(key, candidate); changedKeys.push(key); }
    await yieldAtlas(control, '写入私有连续高程候选', by * across + bx + 1, across * across);
  }
  const quality = await inspectGeneration({ manifest: base.manifest, blocks }, parameters, control);
  const { landAreaQ2, majorComponentCount, minElevationMeters, maxElevationMeters } = quality;
  return { blocks, changedKeys, summary: { changedCellCount, landAreaQ2, worldAreaQ2, majorComponentCount, minElevationMeters, maxElevationMeters },
    diagnostics: { ...quality, layout: 'branch-field-competing-growth-v2', sitesQ: sites.map(site => [site.xQ, site.yQ]), requestedAreaQ2: quotas,
      grownAreaQ2: currentArea, blockedFrontierCells, coastlineEdges } };
}
