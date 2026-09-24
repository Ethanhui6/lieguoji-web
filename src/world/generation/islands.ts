import { blockKey, cloneBlock, encodeBlock, validateBlock, yieldAtlas, type AtlasBlock, type BlockKey } from '../model';
import { generationExact, generationInt, type AtlasGenerationDocument } from '../generation-contract';
import { cloneVerifiedGenerationDocument } from '../generation-format';
import { lockKey } from '../generation-locks';
import { cellNeighbors } from '../topology';
import { batchSize, measureGeography, type GenerationControl, type GeographyMeasurements } from './quality';
import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

export interface IslandParameters { seed: string; chainCount: number; islandsPerChain: number; radiusWorld: number; reliefMeters: number }
export interface IslandInput { base: AtlasGenerationDocument; parameters: IslandParameters }
export interface IslandFeature { anchorCellId: number; centerQ: [number, number]; radiusWorld: number; cellIds: number[]; areaQ2: number; peakMeters: number }
export interface IslandOutput {
  /** Every buffer belongs to a private ingress snapshot or a changed-block
   * clone. Neither caller input nor persistence is modified. */
  blocks: Map<BlockKey, AtlasBlock>; changedKeys: BlockKey[];
  summary: { changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number; minElevationMeters: number; maxElevationMeters: number;
    chainCount: number; newIslandCount: number; originalComponentCount: number; newLandCellCount: number };
  features: { chains: { controlPointsQ: [[number, number], [number, number], [number, number]]; islands: IslandFeature[] }[] };
}
export type IslandControl = GenerationControl;
export interface IslandInspection {
  changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number; minElevationMeters: number; maxElevationMeters: number;
  originalComponentCount: number; newIslandCount: number; newLandCellCount: number; newLandAreaQ2: number;
  islands: { cellIds: number[]; areaQ2: number; peakMeters: number }[];
}
const WORLD_Q = 4096 * 256, ATTEMPTS_PER_CHAIN = 256, MIN_ISLAND_CELLS = 4;
const directions = [[256, 0], [237, 98], [181, 181], [98, 237], [0, 256], [-98, 237], [-181, 181], [-237, 98],
  [-256, 0], [-237, -98], [-181, -181], [-98, -237], [0, -256], [98, -237], [181, -181], [237, -98]] as const;
export function validateIslandParameters(raw: unknown): raw is IslandParameters {
  try {
    return generationExact(raw, ['seed', 'chainCount', 'islandsPerChain', 'radiusWorld', 'reliefMeters']) && typeof raw.seed === 'string' && !!raw.seed.trim() && raw.seed.length <= 120
      && generationInt(raw.chainCount, 1, 3) && generationInt(raw.islandsPerChain, 2, 6) && generationInt(raw.radiusWorld, 64, 128) && generationInt(raw.reliefMeters, 200, 3000);
  } catch { return false; }
}
function bounds(xQ: number, yQ: number, radiusQ: number, size: number) {
  const step = WORLD_Q / size;
  // Legal edited quad centroids remain inside their neighbouring shared-grid
  // region. Two extra cells cover that variation without a full-world scan.
  return { x0: Math.max(0, Math.floor((xQ - radiusQ) / step) - 2), y0: Math.max(0, Math.floor((yQ - radiusQ) / step) - 2),
    x1: Math.min(size - 1, Math.floor((xQ + radiusQ) / step) + 2), y1: Math.min(size - 1, Math.floor((yQ + radiusQ) / step) + 2) };
}
function curvePoint(points: [[number, number], [number, number], [number, number]], index: number, count: number): [number, number] {
  const t = roundRatio(index * FIELD_Q, count - 1), u = FIELD_Q - t;
  return [0, 1].map(axis => roundRatio(u * u * points[0][axis] + 2 * u * t * points[1][axis] + t * t * points[2][axis], FIELD_Q * FIELD_Q)) as [number, number];
}
function coastRadiusQ(seed: number, island: number, xQ: number, yQ: number, radiusQ: number) {
  // A continuous absolute-world field distorts the radial coast by at most
  // ten percent. It is not sampled from cell IDs or the scheduling batch.
  return radiusQ + roundRatio(radiusQ * noiseQ12(seed, 810 + island, xQ, yQ, radiusQ * 2), FIELD_Q * 10);
}
async function lockMask(base: AtlasGenerationDocument, control?: IslandControl) {
  const size = base.manifest.spec.columns, total = size * size, result = new Uint8Array(total), batch = batchSize(control);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const x = id % size, y = Math.floor(id / size), block = base.locks.get(lockKey(Math.floor(x / 32), Math.floor(y / 32)));
      result[id] = block?.flags[y % 32 * 32 + x % 32] ?? 0;
    }
    await yieldAtlas(control, '读取岛链海岸与高程锁', end, total);
  }
  return result;
}
async function components(measured: GeographyMeasurements, base: AtlasGenerationDocument, include: (id: number) => boolean, stage: string, control?: IslandControl) {
  const total = measured.elevation.length, seen = new Uint8Array(total), queue = new Uint32Array(total), batch = batchSize(control);
  const result: { cellIds: number[]; areaQ2: number; peakMeters: number }[] = []; let visited = 0;
  for (let first = 0; first < total; first++) {
    if (include(first) && !seen[first]) {
      let head = 0, tail = 1, areaQ2 = 0, peakMeters = -12000; queue[0] = first; seen[first] = 1;
      const cellIds: number[] = [];
      while (head < tail) {
        const id = queue[head++]; cellIds.push(id); areaQ2 += measured.areaQ2[id]; peakMeters = Math.max(peakMeters, measured.elevation[id]); visited++;
        for (const next of cellNeighbors(base.manifest.spec, id)) if (!seen[next] && include(next)) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await yieldAtlas(control, stage, visited, total);
      }
      result.push({ cellIds, areaQ2, peakMeters });
    }
    if ((first + 1) % batch === 0 || first + 1 === total) await yieldAtlas(control, `${stage}：扫描全部采样`, first + 1, total);
  }
  return result;
}

/** Independent final-data audit: no placement masks or feature counts enter.
 * Actual quads and four-edge BFS determine all areas and component counts. */
export async function inspectIslandOutput(base: AtlasGenerationDocument, blocks: ReadonlyMap<BlockKey, AtlasBlock>, expectedNewIslands: number, control?: IslandControl): Promise<IslandInspection> {
  control?.signal?.throwIfAborted();
  if (!generationInt(expectedNewIslands, 2, 18) || blocks.size !== base.blocks.size) throw new Error('岛链独立核验的目标数量或块数无效。');
  let checked = 0;
  for (const [key, before] of base.blocks) {
    const after = blocks.get(key);
    if (!validateBlock(after, base.manifest.spec) || blockKey(after.layer, after.bx, after.by) !== key) throw new Error('岛链输出块身份或内容无效。');
    if (before.layer !== 'elevation' && before !== after) {
      const a = encodeBlock(before), b = encodeBlock(after);
      if (a.length !== b.length || a.some((value, i) => value !== b[i])) throw new Error('岛链必须保留原几何、模拟区与行政归属。');
    }
    if (++checked % 16 === 0) await yieldAtlas(control, '核验岛链保留层', checked, base.blocks.size);
  }
  const before = await measureGeography(base, control, '独立读取岛链原地理'), after = await measureGeography({ manifest: base.manifest, blocks }, control, '独立读取岛链结果真实面积');
  const locked = await lockMask(base, control), total = before.elevation.length, batch = batchSize(control);
  let changedCellCount = 0, landAreaQ2 = 0, beforeLandAreaQ2 = 0, newLandAreaQ2 = 0, newLandCellCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const a = before.elevation[id], b = after.elevation[id];
      if ((a >= 0 || locked[id]) && a !== b) throw new Error('岛链改变了既有陆地或锁定高程，候选拒绝。');
      if (a !== b) changedCellCount++;
      if (a >= 0) beforeLandAreaQ2 += before.areaQ2[id];
      if (b >= 0) landAreaQ2 += after.areaQ2[id];
      if (a < 0 && b >= 0) {
        newLandCellCount++; newLandAreaQ2 += after.areaQ2[id];
        if (cellNeighbors(base.manifest.spec, id).some(next => before.elevation[next] >= 0)) throw new Error('新岛与旧陆地之间缺少真实共享边海格间隔。');
      }
      minElevationMeters = Math.min(minElevationMeters, b); maxElevationMeters = Math.max(maxElevationMeters, b);
    }
    await yieldAtlas(control, '独立核验岛链海陆与保护值', end, total);
  }
  if (before.worldAreaQ2 !== after.worldAreaQ2 || landAreaQ2 !== beforeLandAreaQ2 + newLandAreaQ2) throw new Error('岛链真实 quad 面积或原陆地面积未保持。');
  const original = await components(before, base, id => before.elevation[id] >= 0, '遍历原有陆地分量', control);
  const islands = await components(after, base, id => before.elevation[id] < 0 && after.elevation[id] >= 0, '独立遍历新增岛屿', control);
  const final = await components(after, base, id => after.elevation[id] >= 0, '独立遍历最终全部陆地', control);
  if (islands.length !== expectedNewIslands || islands.some(island => island.cellIds.length < MIN_ISLAND_CELLS)) throw new Error(`新增真实独立岛屿为${islands.length}，需恰好${expectedNewIslands}座且每岛至少${MIN_ISLAND_CELLS}格。`);
  if (final.length !== original.length + expectedNewIslands) throw new Error('新岛连接了既有陆地或其他岛屿，最终连通核验失败。');
  return { changedCellCount, landAreaQ2, worldAreaQ2: after.worldAreaQ2, majorComponentCount: final.length, minElevationMeters, maxElevationMeters,
    originalComponentCount: original.length, newIslandCount: islands.length, newLandCellCount, newLandAreaQ2, islands };
}

/** Editable island chains in existing ocean, on continuous curved world-space
 * skeletons. The 64-world-unit minimum is two coarse-grid steps; every island
 * still must independently contain at least four connected real quads. */
export async function generateIslands(input: IslandInput, control?: IslandControl): Promise<IslandOutput> {
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'parameters']) || !validateIslandParameters(input.parameters)) throw new Error('岛链参数无效：1—3链，每链2—6岛，半径64—128，起伏200—3000米，种子1—120字符。');
  const parameters = structuredClone(input.parameters), batch = batchSize(control);
  // This call copies every ingress buffer synchronously, before its first
  // cooperative await. Parameters and baseline cannot change under a yield.
  const base = await cloneVerifiedGenerationDocument(input.base, control), spec = base.manifest.spec, size = spec.columns, total = size * size;
  const measured = await measureGeography(base, control, '读取岛链真实海洋空间'), locked = await lockMask(base, control), seed = seedHash(`island-chains@1\0${parameters.seed}`);
  const forbidden = new Uint8Array(total), reserved = new Uint8Array(total), localReserved = new Uint32Array(total), marks = new Uint32Array(total), visited = new Uint32Array(total), queue = new Uint32Array(total), owner = new Uint8Array(total);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) if (measured.elevation[id] >= 0) { forbidden[id] = 1; for (const next of cellNeighbors(spec, id)) forbidden[next] = 1; }
    await yieldAtlas(control, '标记必须保留的陆地与海格间隔', end, total);
  }
  const radiusQ = parameters.radiusWorld * 256, outerQ = Math.ceil(radiusQ * 11 / 10), shelfQ = outerQ * 2;
  const maxBoxCells = Math.min(size, Math.ceil(outerQ * 2 / (WORLD_Q / size)) + 6) ** 2;
  const searchBound = ATTEMPTS_PER_CHAIN * parameters.chainCount * parameters.islandsPerChain * maxBoxCells;
  let searchWork = 0, mark = 0, attemptStamp = 0, serial = 0;
  type Placed = { serial: number; centerQ: [number, number]; cellIds: number[]; anchorCellId: number };
  const chains: { controlPointsQ: [[number, number], [number, number], [number, number]]; islands: Placed[] }[] = [];
  for (let chain = 0; chain < parameters.chainCount; chain++) {
    let accepted: typeof chains[number] | undefined;
    for (let attempt = 0; attempt < ATTEMPTS_PER_CHAIN && !accepted; attempt++) {
      control?.signal?.throwIfAborted(); attemptStamp++;
      const vector = directions[hashAt(seed, 701, chain, attempt) % directions.length], spacing = Math.ceil(parameters.radiusWorld * 5 / 2) + 64 + hashAt(seed, 702, chain, attempt) % (Math.floor(parameters.radiusWorld / 4) + 1);
      const length = spacing * (parameters.islandsPerChain - 1), bend = (Math.floor(length / 3) + hashAt(seed, 703, chain, attempt) % (Math.floor(length / 3) + 1)) * (hashAt(seed, 704, chain, attempt) & 1 ? 1 : -1);
      const relative: [[number, number], [number, number], [number, number]] = [[-roundRatio(length * vector[0], 2), -roundRatio(length * vector[1], 2)], [-bend * vector[1], bend * vector[0]], [roundRatio(length * vector[0], 2), roundRatio(length * vector[1], 2)]];
      const margin = shelfQ + 64 * 256, minX = Math.min(...relative.map(p => p[0])), maxX = Math.max(...relative.map(p => p[0])), minY = Math.min(...relative.map(p => p[1])), maxY = Math.max(...relative.map(p => p[1]));
      const width = WORLD_Q - margin * 2 - maxX + minX, height = WORLD_Q - margin * 2 - maxY + minY;
      if (width <= 0 || height <= 0) continue;
      const originX = margin - minX + hashAt(seed, 705, chain, attempt) % (width + 1), originY = margin - minY + hashAt(seed, 706, chain, attempt) % (height + 1);
      const points = relative.map(p => [p[0] + originX, p[1] + originY]) as typeof relative, islands: Placed[] = [];
      for (let index = 0; index < parameters.islandsPerChain; index++) {
        const center = curvePoint(points, index, parameters.islandsPerChain), box = bounds(center[0], center[1], outerQ, size), cells: number[] = [], islandSerial = serial + index; mark++;
        let blocked = false, anchorCellId = -1, anchorDistance = Infinity;
        for (let y = box.y0; y <= box.y1 && !blocked; y++) for (let x = box.x0; x <= box.x1; x++) {
          const id = y * size + x, xQ = measured.xyQ[id * 2], yQ = measured.xyQ[id * 2 + 1], distance2 = (xQ - center[0]) ** 2 + (yQ - center[1]) ** 2, coast = coastRadiusQ(seed, islandSerial, xQ, yQ, radiusQ);
          searchWork++;
          if (distance2 <= coast * coast) {
            if (forbidden[id] || locked[id] || reserved[id] || localReserved[id] === attemptStamp) { blocked = true; break; }
            cells.push(id); marks[id] = mark;
            if (distance2 < anchorDistance || distance2 === anchorDistance && id < anchorCellId) { anchorDistance = distance2; anchorCellId = id; }
          }
          if (searchWork % batch === 0) await yieldAtlas(control, '搜索满足海格间隔的弯曲岛链', searchWork, searchBound);
        }
        if (blocked || cells.length < MIN_ISLAND_CELLS) break;
        // Continuous fields still require an actual discrete connectivity test.
        let head = 0, tail = 1; queue[0] = anchorCellId; visited[anchorCellId] = mark;
        while (head < tail) {
          const id = queue[head++];
          for (const next of cellNeighbors(spec, id)) if (marks[next] === mark && visited[next] !== mark) { visited[next] = mark; queue[tail++] = next; }
          if (head % batch === 0) await yieldAtlas(control, '核验候选岛屿真实连通', head, cells.length);
        }
        if (tail !== cells.length) break;
        islands.push({ serial: islandSerial, centerQ: center, cellIds: cells, anchorCellId });
        for (const id of cells) { localReserved[id] = attemptStamp; for (const next of cellNeighbors(spec, id)) localReserved[next] = attemptStamp; }
      }
      if (islands.length === parameters.islandsPerChain) accepted = { controlPointsQ: points, islands };
      if ((attempt + 1) % 8 === 0) await yieldAtlas(control, '完成有界岛链位置候选检查', chain * ATTEMPTS_PER_CHAIN + attempt + 1, parameters.chainCount * ATTEMPTS_PER_CHAIN);
    }
    if (!accepted) throw new Error(`第${chain + 1}条岛链无法找到完整海洋空间：需要${parameters.islandsPerChain}座多格岛屿、真实海格间隔并避开区域锁；原图未改变。`);
    chains.push(accepted);
    for (const island of accepted.islands) for (const id of island.cellIds) { reserved[id] = 1; owner[id] = island.serial + 1; for (const next of cellNeighbors(spec, id)) reserved[next] = 1; }
    serial += parameters.islandsPerChain; await yieldAtlas(control, '已定位完整岛链', serial, parameters.chainCount * parameters.islandsPerChain);
  }

  const nextElevation = measured.elevation.slice(); let shaped = 0;
  for (const chain of chains) for (const island of chain.islands) {
    const box = bounds(island.centerQ[0], island.centerQ[1], shelfQ, size), count = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1); let work = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
      const id = y * size + x, old = measured.elevation[id]; work++;
      if (old < 0 && !locked[id] && (!owner[id] || owner[id] === island.serial + 1)) {
        const xQ = measured.xyQ[id * 2], yQ = measured.xyQ[id * 2 + 1], coast = coastRadiusQ(seed, island.serial, xQ, yQ, radiusQ), distance = integerSqrt((xQ - island.centerQ[0]) ** 2 + (yQ - island.centerQ[1]) ** 2);
        if (owner[id] === island.serial + 1) nextElevation[id] = Math.max(0, roundRatio(parameters.reliefMeters * smoothQ(roundRatio((coast - distance) * FIELD_Q, coast)), FIELD_Q));
        else if (distance < coast * 2) {
          const blend = smoothQ(roundRatio((distance - coast) * FIELD_Q, coast));
          // The shelf remains strictly ocean. Overlapping shelves can raise
          // depth but cannot bridge islands or modify any locked sea cell.
          nextElevation[id] = Math.max(nextElevation[id], Math.min(-1, roundRatio(old * blend, FIELD_Q)));
        }
      }
      if (work % batch === 0) await yieldAtlas(control, '生成连续岛屿高程与海底过渡', work, count);
    }
    await yieldAtlas(control, '完成实际岛屿高程', ++shaped, serial);
  }
  const blocks = new Map(base.blocks), changed = new Set<BlockKey>();
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) if (nextElevation[id] !== measured.elevation[id]) {
      const x = id % size, y = Math.floor(id / size), key = blockKey('elevation', Math.floor(x / 32), Math.floor(y / 32));
      if (!changed.has(key)) { blocks.set(key, cloneBlock(base.blocks.get(key)!)); changed.add(key); }
      const block = blocks.get(key)!; if (block.layer !== 'elevation') throw new Error('岛链高程写入层无效。'); block.values[y % 32 * 32 + x % 32] = nextElevation[id];
    }
    await yieldAtlas(control, '写入实际岛链私有地理块', end, total);
  }
  const audit = await inspectIslandOutput(base, blocks, parameters.chainCount * parameters.islandsPerChain, control), used = new Set<number>();
  const features: IslandOutput['features'] = { chains: chains.map(chain => ({ controlPointsQ: chain.controlPointsQ, islands: chain.islands.map(island => {
    const component = audit.islands.findIndex(value => value.cellIds.includes(island.anchorCellId));
    if (component < 0 || used.has(component)) throw new Error('岛链特征与独立遍历的真实岛屿未一一对应。'); used.add(component);
    const actual = audit.islands[component]; return { anchorCellId: island.anchorCellId, centerQ: island.centerQ, radiusWorld: parameters.radiusWorld, cellIds: actual.cellIds, areaQ2: actual.areaQ2, peakMeters: actual.peakMeters };
  }) })) };
  const { changedCellCount, landAreaQ2, worldAreaQ2, majorComponentCount, minElevationMeters, maxElevationMeters, newIslandCount, originalComponentCount, newLandCellCount } = audit;
  control?.signal?.throwIfAborted();
  return { blocks, changedKeys: [...changed].sort(), summary: { changedCellCount, landAreaQ2, worldAreaQ2, majorComponentCount, minElevationMeters, maxElevationMeters, chainCount: features.chains.length, newIslandCount, originalComponentCount, newLandCellCount }, features };
}
