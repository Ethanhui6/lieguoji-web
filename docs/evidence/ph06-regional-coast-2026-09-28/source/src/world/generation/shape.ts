import { blockKey, cloneBlock, encodeBlock, validateBlock, yieldAtlas, type AtlasBlock, type BlockKey } from '../model';
import { generationExact, validateShapeRecipe, type AtlasGenerationDocument, type ShapeRecipe } from '../generation-contract';
import { cloneVerifiedGenerationDocument } from '../generation-format';
import { lockKey } from '../generation-locks';
import { cellNeighbors } from '../topology';
import { batchSize, measureGeography, type GenerationControl } from './quality';
import { FIELD_Q, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

export interface ShapeInput { base: AtlasGenerationDocument; recipe: ShapeRecipe }
export interface ShapeSummary {
  changedCellCount: number; landAreaQ2: number; worldAreaQ2: number; majorComponentCount: number;
  minElevationMeters: number; maxElevationMeters: number;
  shape: { controlPointCount: number; newLandCellCount: number; discardedNoiseCellCount: number; affectedSeaCellCount: number };
}
export interface ShapeOutput { blocks: Map<BlockKey, AtlasBlock>; changedKeys: BlockKey[]; summary: ShapeSummary }
type Point = ShapeRecipe['parameters']['pointsQ'][number];
const MIN_NEW_COMPONENT_CELLS = 4;

/** Q8 polygon distance, positive inside. Projection is quantized to Q12
 * before measuring; all squared lengths fit exactly in JS safe integers.
 * This is evaluated at actual shared-quad centroids, never nominal grid IDs. */
function signedDistanceQ(x: number, y: number, points: readonly Point[]): number {
  let inside = false, minimum = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b.xQ - a.xQ, dy = b.yQ - a.yQ;
    const length2 = dx * dx + dy * dy, dot = (x - a.xQ) * dx + (y - a.yQ) * dy;
    // Divide before multiplying to avoid an unsafe dot * Q12 intermediate.
    const t = Math.max(0, Math.min(FIELD_Q, Math.floor(dot / length2 * FIELD_Q + .5)));
    const px = a.xQ + roundRatio(dx * t, FIELD_Q), py = a.yQ + roundRatio(dy * t, FIELD_Q);
    minimum = Math.min(minimum, (x - px) ** 2 + (y - py) ** 2);
    if ((a.yQ > y) !== (b.yQ > y)) {
      const cross = dx * (y - a.yQ) - dy * (x - a.xQ);
      if (dy > 0 ? cross > 0 : cross < 0) inside = !inside;
    }
  }
  const distance = integerSqrt(minimum);
  return inside || distance === 0 ? distance : -distance;
}
function envelope(recipe: ShapeRecipe) {
  const margin = (recipe.parameters.coastRoughnessWorld + recipe.parameters.shelfWidthWorld) * 256;
  return { minX: Math.min(...recipe.parameters.pointsQ.map(p => p.xQ)) - margin,
    maxX: Math.max(...recipe.parameters.pointsQ.map(p => p.xQ)) + margin,
    minY: Math.min(...recipe.parameters.pointsQ.map(p => p.yQ)) - margin,
    maxY: Math.max(...recipe.parameters.pointsQ.map(p => p.yQ)) + margin };
}
function inEnvelope(x: number, y: number, box: ReturnType<typeof envelope>) {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}
async function lockedCells(base: AtlasGenerationDocument, control?: GenerationControl) {
  const size = base.manifest.spec.columns, total = size * size, flags = new Uint8Array(total), batch = batchSize(control);
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const x = id % size, y = Math.floor(id / size);
      flags[id] = base.locks.get(lockKey(Math.floor(x / 32), Math.floor(y / 32)))?.flags[y % 32 * 32 + x % 32] ?? 0;
    }
    await yieldAtlas(control, '读取手绘区域海岸与高程锁', end, total);
  }
  return flags;
}
async function landComponents(base: AtlasGenerationDocument, heights: Int32Array, include: (id: number) => boolean, control?: GenerationControl) {
  const total = heights.length, seen = new Uint8Array(total), queue = new Uint32Array(total), result: number[][] = [], batch = batchSize(control);
  let visited = 0;
  for (let first = 0; first < total; first++) {
    if (heights[first] >= 0 && include(first) && !seen[first]) {
      let head = 0, tail = 1; queue[0] = first; seen[first] = 1; const ids: number[] = [];
      while (head < tail) {
        const id = queue[head++]; ids.push(id); visited++;
        for (const next of cellNeighbors(base.manifest.spec, id)) if (!seen[next] && heights[next] >= 0 && include(next)) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await yieldAtlas(control, '独立遍历手绘大陆真实共享边', visited, total);
      }
      result.push(ids);
    }
    if ((first + 1) % batch === 0 || first + 1 === total) await yieldAtlas(control, '核验手绘大陆全部连通分量', first + 1, total);
  }
  return result;
}

/** Independent audit consumes final editable blocks, not the generator mask.
 * An additive outline may attach to old land. Both locks are conservatively
 * preserved exactly, including protected sea depths. */
export async function inspectShapeOutput(base: AtlasGenerationDocument, blocks: ReadonlyMap<BlockKey, AtlasBlock>, recipe: ShapeRecipe, control?: GenerationControl): Promise<Omit<ShapeSummary, 'shape'> & { newLandCellCount: number; affectedSeaCellCount: number }> {
  if (!validateShapeRecipe(recipe, base.manifest.spec) || blocks.size !== base.blocks.size) throw new Error('手绘地形配方或输出块数无效。');
  let checked = 0;
  for (const [key, before] of base.blocks) {
    const after = blocks.get(key);
    if (!validateBlock(after, base.manifest.spec) || blockKey(after.layer, after.bx, after.by) !== key) throw new Error('手绘地形输出块身份或内容无效。');
    if (before.layer !== 'elevation' && before !== after) {
      const a = encodeBlock(before), b = encodeBlock(after);
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('手绘地形必须保留共享几何、模拟区与行政归属。');
    }
    if (++checked % 16 === 0) await yieldAtlas(control, '核验手绘地形保留层', checked, base.blocks.size);
  }
  const before = await measureGeography(base, control, '读取手绘原图实际地理');
  const after = await measureGeography({ ...base, blocks }, control, '独立量测手绘结果真实面积');
  const flags = await lockedCells(base, control), total = before.elevation.length, batch = batchSize(control), box = envelope(recipe);
  let changedCellCount = 0, landAreaQ2 = 0, newLandCellCount = 0, affectedSeaCellCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const a = before.elevation[id], b = after.elevation[id];
      if ((a >= 0 || flags[id] || !inEnvelope(before.xyQ[id * 2], before.xyQ[id * 2 + 1], box)) && a !== b) throw new Error('手绘地形改变了既有陆地、区域锁或轮廓影响带外地理。');
      if (a !== b) {
        const distance = signedDistanceQ(before.xyQ[id * 2], before.xyQ[id * 2 + 1], recipe.parameters.pointsQ);
        if (distance < -(recipe.parameters.coastRoughnessWorld + recipe.parameters.shelfWidthWorld) * 256
          || b >= 0 && distance < -recipe.parameters.coastRoughnessWorld * 256) throw new Error('手绘地形超出了真实轮廓的有界海岸影响带。');
        changedCellCount++; if (b < 0) affectedSeaCellCount++;
      }
      if (a < 0 && b >= 0) newLandCellCount++;
      if (b >= 0) landAreaQ2 += after.areaQ2[id];
      minElevationMeters = Math.min(minElevationMeters, b); maxElevationMeters = Math.max(maxElevationMeters, b);
    }
    await yieldAtlas(control, '独立核验手绘大陆保护值与面积', end, total);
  }
  if (!newLandCellCount) throw new Error('这个轮廓没有新增可用陆地；请画在未锁定的海面上，并扩大轮廓。原图未改变。');
  const components = await landComponents(base, after.elevation, () => true, control);
  if (components.some(ids => ids.length < MIN_NEW_COMPONENT_CELLS && ids.every(id => before.elevation[id] < 0))) throw new Error('手绘地形产生了孤立噪声碎点，候选拒绝。');
  return { changedCellCount, landAreaQ2, worldAreaQ2: after.worldAreaQ2, majorComponentCount: components.length,
    minElevationMeters, maxElevationMeters, newLandCellCount, affectedSeaCellCount };
}

/** A user's closed outline becomes an editable additive landmass. Coast
 * perturbation and relief are continuous absolute-world fields. The signed
 * distance bounds every coastal change; neither a random cell fill nor a
 * rebuilt whole-world seed can replace the user's bays and peninsulas. */
export async function generateShape(input: ShapeInput, control?: GenerationControl): Promise<ShapeOutput> {
  if (input.base?.manifest?.version === 4) throw new Error('旧生成器尚不支持第四版细海岸，原图未修改。');
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'recipe']) || !validateShapeRecipe(input.recipe, input.base?.manifest?.spec)) throw new Error('手绘轮廓或地形参数无效；需要地图内不自交的闭合轮廓和有效地形配方。');
  const recipe = structuredClone(input.recipe), batch = batchSize(control);
  // Clone all caller-owned points and data before the first asynchronous yield.
  const base = await cloneVerifiedGenerationDocument(input.base, control);
  if (!validateShapeRecipe(recipe, base.manifest.spec)) throw new Error('手绘轮廓超出实际地图。');
  const measured = await measureGeography(base, control, '量测手绘轮廓的真实地理');
  const flags = await lockedCells(base, control), p = recipe.parameters, seed = seedHash(`shape-landmass@1\0${recipe.seed}`);
  const total = measured.elevation.length, heights = measured.elevation.slice(), box = envelope(recipe), shelfQ = p.shelfWidthWorld * 256;
  const roughnessQ = p.coastRoughnessWorld * 256, wavelengthQ = p.coastWavelengthWorld * 256;
  // Work is bounded by edge evaluations, so a 256-point sketch yields as
  // frequently as a triangle. The source buffers are already private here.
  let work = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const old = measured.elevation[id], x = measured.xyQ[id * 2], y = measured.xyQ[id * 2 + 1];
      if (old >= 0 || flags[id] || !inEnvelope(x, y, box)) continue;
      const signedQ = signedDistanceQ(x, y, p.pointsQ);
      work += p.pointsQ.length;
      if (work >= batch * 16) { await yieldAtlas(control, '从闭合轮廓生成连续海陆地形', id + 1, total); work = 0; }
      if (signedQ < -roughnessQ - shelfQ) continue;
      const coastNoise = roundRatio(3 * noiseQ12(seed, 1101, x, y, wavelengthQ) + noiseQ12(seed, 1102, x, y, Math.max(32 * 256, Math.floor(wavelengthQ / 3))), 4);
      const distanceQ = signedQ + roundRatio(roughnessQ * coastNoise, FIELD_Q);
      if (distanceQ >= 0) {
        const inland = smoothQ(roundRatio(distanceQ * FIELD_Q, 384 * 256));
        const ridge = FIELD_Q - Math.abs(noiseQ12(seed, 1103, x, y, 640 * 256));
        const mountains = roundRatio(ridge * ridge, FIELD_Q);
        const rolling = Math.floor((noiseQ12(seed, 1104, x, y, 224 * 256) + FIELD_Q) / 2);
        const basin = Math.floor((noiseQ12(seed, 1105, x, y, 960 * 256) + FIELD_Q) / 2);
        const profile = roundRatio((FIELD_Q + mountains * 6 + rolling + basin * 2) * inland, 10 * FIELD_Q);
        heights[id] = Math.max(0, Math.min(p.reliefMeters, roundRatio(p.reliefMeters * profile, FIELD_Q)));
      } else if (distanceQ > -shelfQ) {
        const seaBlend = smoothQ(roundRatio(-distanceQ * FIELD_Q, shelfQ));
        heights[id] = Math.max(old, Math.min(-1, roundRatio(old * seaBlend, FIELD_Q)));
      }
    }
    await yieldAtlas(control, '从闭合轮廓生成连续海陆地形', end, total);
  }
  let discardedNoiseCellCount = 0;
  // Preserve all old components; only isolated tiny components created by
  // this outline are removed. Large peninsulas and bays are never smoothed off.
  const candidates = await landComponents(base, heights, () => true, control);
  for (const ids of candidates) if (ids.length < MIN_NEW_COMPONENT_CELLS && ids.every(id => measured.elevation[id] < 0)) {
    for (const id of ids) { heights[id] = measured.elevation[id]; discardedNoiseCellCount++; }
  }
  const blocks = new Map(base.blocks), changed = new Set<BlockKey>(), size = base.manifest.spec.columns;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) if (heights[id] !== measured.elevation[id]) {
      const x = id % size, y = Math.floor(id / size), key = blockKey('elevation', Math.floor(x / 32), Math.floor(y / 32));
      if (!changed.has(key)) { blocks.set(key, cloneBlock(base.blocks.get(key)!)); changed.add(key); }
      const block = blocks.get(key)!; if (block.layer !== 'elevation') throw new Error('手绘地形高程写入层无效。');
      block.values[y % 32 * 32 + x % 32] = heights[id];
    }
    await yieldAtlas(control, '写入手绘大陆私有高程块', end, total);
  }
  const audit = await inspectShapeOutput(base, blocks, recipe, control);
  const { newLandCellCount, affectedSeaCellCount, ...summary } = audit;
  control?.signal?.throwIfAborted();
  return { blocks, changedKeys: [...changed].sort(), summary: { ...summary,
    shape: { controlPointCount: p.pointsQ.length, newLandCellCount, discardedNoiseCellCount, affectedSeaCellCount } } };
}
