/** Independent natural v2 empty-world kernel. This staging is not registered
 * in the product. Frozen v1 code and persisted worlds are not rewritten. */
import { buildDetailCoastSurface, pickDetailCoastSurface } from '../detail-coast-geometry';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastTile, type DetailCoastTiles } from '../detail-coast-types';
import { buildDetailShapeDistanceIndex, DETAIL_DISTANCE_LIMIT_Q, DETAIL_DISTANCE_MAX_SEGMENTS, type DetailShapeDistanceIndex } from './detail-shape-distance';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { roundAndIndexNaturalOutline, createNaturalCoastArcPlan, naturalFacingSeparation, simplifyNaturalSampling } from './detail-natural-outline';
import { createNaturalRelief, type NaturalReliefSummary } from './detail-natural-relief';
import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, seedHash, smoothQ } from './seed';

const WORLD_Q = 4096 * 256, STEP_Q = 512, TILE_Q = 64 * 256, Q20 = 1048576;
type Point = { xQ: number; yQ: number };
export interface NaturalDetailShapeRecipe {
  format: 'lieguoji-natural-shape-recipe'; version: 2;
  /** Separate from small coastal roughness; never reinterprets a v1 value. */
  coastStructureWorld: number;
  /** The atlas adapter wraps these parameters in the independently registered
   * shape-detail-landmass@2 recipe (Atlas wrapper remains version 1) and verifies its source fingerprint. */
  seed: string;
  pointsQ: Point[];
  coastRoughnessWorld: number;
  reliefMeters: number;
  shelfWidthWorld: number;
  islandChainCount: number;
  islandsPerChain: number;
}
export interface EmptyDetailShapeBase {
  format: 'lieguoji-empty-detail-shape-base'; version: 1;
  size: 128 | 256 | 512;
  /** Exact native Int32 buffers: real area centroids [xQ,yQ] and elevations. */
  centersQ: ArrayBuffer; elevationsMeters: ArrayBuffer;
  detailCoast: DetailCoastTiles;
  /** Derived by an adapter from a fully verified AtlasGenerationDocument<4>.
   * These flags alone are not a document authentication/security boundary. */
  locksPresent: boolean; entitiesPresent: boolean; generationPresent: boolean;
}
export interface DetailShapeControl {
  signal?: AbortSignal; yieldControl?: () => Promise<void>;
  onProgress?: (phase: string, completed: number, total: number) => void;
  batchWork?: number;
}
export interface NaturalDetailShapeSummary {
  natural: { roundedCorners: number; outlineEdges: number; maximumEnvelopeWorld: number; relief: NaturalReliefSummary };
  landAreaTwiceQ2: number; seaAreaTwiceQ2: number; totalAreaTwiceQ2: number;
  targetSegments: number; sampledTiles: number; uniformLandTiles: number;
  coarseLandSamples: number; changedCoarseSamples: number;
  islandsRequested: number; islandsPlaced: number;
  skippedIslands: { chain: number; island: number; reason: string }[];
  designNodesEvaluated: number; outlineEdgeTests: number;
  distanceSamples: number; exactTargetSegmentTests: number;
  maximumQuerySegmentTests: number;
  auditedFineCells: number;
}
export interface NaturalDetailShapeOutput {
  detailCoast: Map<DetailCoastKey, DetailCoastTile>;
  coarseElevations: Int32Array;
  /** Rebuilt with createDetailShapeBaseSampler after loading accepted data.
   * The atlas adapter must persist the matching coarse heights and geometry. */
  sampleBaseElevation: (xQ: number, yQ: number) => number;
  /** Diagnostic target, not a second authoritative coast or persisted layer. */
  targetCoast: ArrayBuffer;
  summary: NaturalDetailShapeSummary;
}
function exact(raw: unknown, keys: readonly string[]): asserts raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) || Reflect.ownKeys(raw).length !== keys.length) throw new Error('细大陆输入记录字段无效。');
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(raw, key); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('细大陆输入拒绝访问器或缺失字段。'); }
}
function int(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max; }
function ownBuffer(value: unknown, length: number): Int32Array {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || (value as ArrayBuffer).byteLength !== length * 4) throw new Error('细大陆需要精确非共享缓冲区。');
  return new Int32Array(ArrayBuffer.prototype.slice.call(value, 0) as ArrayBuffer);
}
function ownRecipe(raw: NaturalDetailShapeRecipe): NaturalDetailShapeRecipe {
  exact(raw, ['format', 'version', 'coastStructureWorld', 'seed', 'pointsQ', 'coastRoughnessWorld', 'reliefMeters', 'shelfWidthWorld', 'islandChainCount', 'islandsPerChain']);
  if (raw.format !== 'lieguoji-natural-shape-recipe' || raw.version !== 2 || !int(raw.coastStructureWorld, 0, 160)) throw new Error('自然大陆要求独立第二版配方及0—160的主要湾岬变化。');
  if (typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !int(raw.coastRoughnessWorld, 0, 64) || !int(raw.reliefMeters, 200, 6000) || !int(raw.shelfWidthWorld, 16, 128) || !int(raw.islandChainCount, 0, 3) || !int(raw.islandsPerChain, 2, 6)) throw new Error('细大陆参数超出范围。');
  if (!Array.isArray(raw.pointsQ) || Object.getPrototypeOf(raw.pointsQ) !== Array.prototype || !int(raw.pointsQ.length, 3, 2048) || Reflect.ownKeys(raw.pointsQ).length !== raw.pointsQ.length + 1) throw new Error('细大陆轮廓需要 3—2048 个普通 Q8 点。');
  const margin = (raw.coastStructureWorld + raw.coastRoughnessWorld + 52) * 256, pointsQ: Point[] = [], seen = new Set<string>();
  for (let index = 0; index < raw.pointsQ.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw.pointsQ, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('轮廓点数组拒绝访问器或空洞。');
    const point: unknown = descriptor.value; exact(point, ['xQ', 'yQ']);
    if (!int(point.xQ, margin, WORLD_Q - margin) || !int(point.yQ, margin, WORLD_Q - margin)) throw new Error('自然大陆轮廓离世界边缘需保留主要湾岬、海岸细节再加52 world的海洋边带。');
    const key = `${point.xQ}:${point.yQ}`; if (seen.has(key)) throw new Error('闭合轮廓不能含重复点；末点无需重复起点。'); seen.add(key);
    pointsQ.push({ xQ: point.xQ, yQ: point.yQ });
  }
  return { format: 'lieguoji-natural-shape-recipe', version: 2, coastStructureWorld: raw.coastStructureWorld, seed: raw.seed, pointsQ, coastRoughnessWorld: raw.coastRoughnessWorld, reliefMeters: raw.reliefMeters, shelfWidthWorld: raw.shelfWidthWorld, islandChainCount: raw.islandChainCount, islandsPerChain: raw.islandsPerChain };
}
function checkAbort(control?: DetailShapeControl) { if (control?.signal?.aborted) throw new DOMException('细大陆生成已取消。', 'AbortError'); }
async function checkpoint(control: DetailShapeControl | undefined, phase: string, completed: number, total: number) {
  checkAbort(control); control?.onProgress?.(phase, completed, total); checkAbort(control);
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkAbort(control);
}
const cross = (a: Point, b: Point, c: Point) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const onSegment = (a: Point, b: Point, p: Point) => p.xQ >= Math.min(a.xQ, b.xQ) && p.xQ <= Math.max(a.xQ, b.xQ) && p.yQ >= Math.min(a.yQ, b.yQ) && p.yQ <= Math.max(a.yQ, b.yQ);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC === 0 && onSegment(a, b, c) || abD === 0 && onSegment(a, b, d) || cdA === 0 && onSegment(c, d, a) || cdB === 0 && onSegment(c, d, b) || (abC < 0 && abD > 0 || abC > 0 && abD < 0) && (cdA < 0 && cdB > 0 || cdA > 0 && cdB < 0);
}
interface LongEdge { a: Point; b: Point; length: number; arc: number }
async function prepareOutline(recipe: NaturalDetailShapeRecipe, batch: number, control: DetailShapeControl | undefined, counters: { outlineEdgeTests: number }) {
  // Validate the literal input first. Simplification is never a way to accept
  // self-contacting input that the original polygon validator would reject.
  const original = recipe.pointsQ;
  for (let i = 0, work = 0; i < original.length; i++) {
    const previous = original[(i + original.length - 1) % original.length], a = original[i], b = original[(i + 1) % original.length];
    if (cross(previous, a, b) === 0 && (previous.xQ - a.xQ) * (b.xQ - a.xQ) + (previous.yQ - a.yQ) * (b.yQ - a.yQ) > 0) throw new Error('手绘轮廓不能沿原边折回。');
    for (let j = i + 1; j < original.length; j++) {
    if (j !== i + 1 && !(i === 0 && j === original.length - 1) && intersects(original[i], original[(i + 1) % original.length], original[j], original[(j + 1) % original.length])) throw new Error('手绘轮廓不能自交或接触非相邻边。');
    if (++work % batch === 0) await checkpoint(control, 'validate-source-outline', work, original.length * (original.length - 1) / 2);
    }
  }
  const points = recipe.coastStructureWorld + recipe.coastRoughnessWorld > 0 ? await simplifyNaturalSampling(original, batch, control) : original;
  const count = points.length, edges: LongEdge[] = []; let perimeter = 0, area2 = 0, work = 0;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count], previous = points[(i + count - 1) % count];
    if (cross(previous, a, b) === 0 && (previous.xQ - a.xQ) * (b.xQ - a.xQ) + (previous.yQ - a.yQ) * (b.yQ - a.yQ) > 0) throw new Error('手绘轮廓不能沿原边折回。');
    area2 += a.xQ * b.yQ - b.xQ * a.yQ;
    const length = integerSqrt((b.xQ - a.xQ) ** 2 + (b.yQ - a.yQ) ** 2); edges.push({ a, b, length, arc: perimeter }); perimeter += length;
    for (let j = i + 1; j < count; j++) {
      if (j !== i + 1 && !(i === 0 && j === count - 1) && intersects(a, b, points[j], points[(j + 1) % count])) throw new Error('手绘轮廓不能自交或接触非相邻边。');
      if (++work % batch === 0) await checkpoint(control, 'validate-outline', work, count * (count - 1) / 2);
    }
  }
  if (!Number.isSafeInteger(area2) || Math.abs(area2) < 2 * 64 * 256 ** 2) throw new Error('首个大陆轮廓的面积需要至少 64 world²。');
  const roughness = (recipe.coastStructureWorld + recipe.coastRoughnessWorld) * 256, edgeCaps = new Int32Array(count).fill(roughness); work = 0;
  if (roughness) for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    if (j !== i + 1 && !(i === 0 && j === count - 1)) {
      const distance = naturalFacingSeparation(points, i, j);
      if (distance !== null) { edgeCaps[i] = Math.min(edgeCaps[i], Math.max(0, Math.floor(distance / 4) - 2)); edgeCaps[j] = Math.min(edgeCaps[j], Math.max(0, Math.floor(distance / 4) - 2)); }
    }
    if (++work % batch === 0) await checkpoint(control, 'protect-outline-features', work, count * (count - 1) / 2);
  }
  const caps = edges.map((_, id) => Math.min(edgeCaps[id], edgeCaps[(id + count - 1) % count]));
  for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < count; i++) caps[(i + 1) % count] = Math.min(caps[(i + 1) % count], caps[i] + Math.floor(edges[i].length / 4)); for (let i = count - 1; i >= 0; i--) caps[i] = Math.min(caps[i], caps[(i + 1) % count] + Math.floor(edges[i].length / 4)); }
  await checkpoint(control, 'prepare-outline', count, count);
  return roundAndIndexNaturalOutline({ points, caps, structureWorld: recipe.coastStructureWorld, roughnessWorld: recipe.coastRoughnessWorld, area2 }, batch, control, counters);
}

export async function generateDetailShapeNatural(input: { base: EmptyDetailShapeBase; recipe: NaturalDetailShapeRecipe }, control?: DetailShapeControl): Promise<NaturalDetailShapeOutput> {
  checkAbort(control); exact(input, ['base', 'recipe']);
  const base = input.base; exact(base, ['format', 'version', 'size', 'centersQ', 'elevationsMeters', 'detailCoast', 'locksPresent', 'entitiesPresent', 'generationPresent']);
  if (base.format !== 'lieguoji-empty-detail-shape-base' || base.version !== 1 || ![128, 256, 512].includes(base.size) || base.locksPresent !== false || base.entitiesPresent !== false || base.generationPresent !== false || !base.detailCoast || Object.getPrototypeOf(base.detailCoast) !== Map.prototype || Reflect.ownKeys(base.detailCoast).length || base.detailCoast.size !== 0) throw new Error('此生成器只接受已核验的新空 v4 世界；不替换、合并或解锁已有地图。');
  const size = base.size, total = size * size, centers = ownBuffer(base.centersQ, total * 2), oldHeights = ownBuffer(base.elevationsMeters, total), recipe = ownRecipe(input.recipe);
  const batch = control?.batchWork ?? 256; if (!int(batch, 64, 2048)) throw new Error('细大陆批次需要 64—2048 个实际工作单元。');
  await checkpoint(control, 'takeover-empty-world', 1, 1);
  const step = WORLD_Q / size;
  for (let id = 0; id < total; id++) {
    const x = id % size, y = Math.floor(id / size);
    if (oldHeights[id] >= 0 || oldHeights[id] < -12000) throw new Error('首个细大陆生成要求实际粗高程全部为海；已有大陆不能被替换。');
    if (centers[id * 2] <= x * step || centers[id * 2] >= (x + 1) * step || centers[id * 2 + 1] <= y * step || centers[id * 2 + 1] >= (y + 1) * step) throw new Error('实际粗重心不在其采样单元内部。');
    if ((id + 1) % batch === 0) await checkpoint(control, 'verify-empty-world', id + 1, total);
  }
  const counters = { outlineEdgeTests: 0 }, outline = await prepareOutline(recipe, batch, control, counters), seed = seedHash(`shape-detail-landmass@2\0${recipe.seed}`);
  const coastPlan = await createNaturalCoastArcPlan({ seed, perimeterQ: outline.perimeter, structureWorld: recipe.coastStructureWorld }, batch, control);
  const islands: { x: number; y: number; radius: number; ux: number; uy: number }[] = [], skippedIslands: NaturalDetailShapeSummary['skippedIslands'] = [];
  for (let chain = 0; chain < recipe.islandChainCount; chain++) {
    const arc = hashAt(seed, 6101, chain, 0) % outline.perimeter;
    const edge = outline.edges.find(item => item.arc + item.length > arc) ?? outline.edges[outline.edges.length - 1];
    const t = roundRatio((arc - edge.arc) * FIELD_Q, edge.length), tangentX = roundRatio((edge.b.xQ - edge.a.xQ) * FIELD_Q, edge.length), tangentY = roundRatio((edge.b.yQ - edge.a.yQ) * FIELD_Q, edge.length);
    const direction = outline.area2 > 0 ? 1 : -1, normalX = tangentY * direction, normalY = -tangentX * direction;
    const anchorX = edge.a.xQ + roundRatio((edge.b.xQ - edge.a.xQ) * t, FIELD_Q), anchorY = edge.a.yQ + roundRatio((edge.b.yQ - edge.a.yQ) * t, FIELD_Q);
    for (let island = 0; island < recipe.islandsPerChain; island++) {
      const radius = (6 + hashAt(seed, 6102, chain, island) % 23) * 256;
      const along = (island - (recipe.islandsPerChain - 1) / 2) * 64 * 256;
      const outward = (recipe.coastStructureWorld + recipe.coastRoughnessWorld + 48 + island * island * 3) * 256;
      const x = Math.round(anchorX + (along * tangentX + outward * normalX) / FIELD_Q), y = Math.round(anchorY + (along * tangentY + outward * normalY) / FIELD_Q);
      const reach = radius * 2;
      let reason = '';
      if (x - reach < 2 * 256 || y - reach < 2 * 256 || x + reach > WORLD_Q - 2 * 256 || y + reach > WORLD_Q - 2 * 256) reason = 'outside-world-margin';
      else if (outline.inside(x, y) || outline.nearest(x, y).distance <= reach + (recipe.coastStructureWorld + recipe.coastRoughnessWorld) * 256) reason = 'near-mainland';
      else if (islands.some(other => (other.x - x) ** 2 + (other.y - y) ** 2 < (2 * other.radius + reach + 4 * 256) ** 2)) reason = 'near-existing-island';
      if (reason) skippedIslands.push({ chain, island, reason }); else islands.push({ x, y, radius, ux: tangentX, uy: tangentY });
    }
    await checkpoint(control, 'place-island-chains', chain + 1, recipe.islandChainCount);
  }
  let designNodesEvaluated = 0;
  const design = (x: number, y: number) => {
    designNodesEvaluated++;
    const nearest = outline.nearest(x, y), signed = outline.inside(x, y) ? nearest.distance : -nearest.distance;
    let value = signed;
    const budget = recipe.coastStructureWorld + recipe.coastRoughnessWorld;
    if (budget > 0 && nearest.distance <= budget * 256 + STEP_Q && nearest.edge >= 0) {
      const id = nearest.edge, amplitude = outline.caps[id] + roundRatio((outline.caps[(id + 1) % outline.caps.length] - outline.caps[id]) * nearest.t, Q20);
      const edge = outline.edges[id];
      const arc = edge.arc + roundRatio(edge.length * nearest.t, Q20);
      const structural = coastPlan.sample(arc);
      // Roughness belongs to the shore, not to independent points inland.
      // Sampling noise across the normal can create isolated sea holes even
      // when no islands/lakes were requested. Keep its value fixed along the
      // same outline normal; signed distance supplies the cross-shore change.
      const shoreX = edge.a.xQ + roundRatio((edge.b.xQ - edge.a.xQ) * nearest.t, Q20);
      const shoreY = edge.a.yQ + roundRatio((edge.b.yQ - edge.a.yQ) * nearest.t, Q20);
      const u = roundRatio(3 * shoreX - 4 * shoreY, 5), v = roundRatio(4 * shoreX + 3 * shoreY, 5);
      const detail = roundRatio(3 * noiseQ12(seed, 7113, u, v, 48 * 256) + noiseQ12(seed, 7114, u, v, 12 * 256), 4);
      value += roundRatio(amplitude * (recipe.coastStructureWorld * structural + recipe.coastRoughnessWorld * detail), budget * FIELD_Q);
    }
    for (let id = 0; id < islands.length; id++) {
      const island = islands[id], dx = x - island.x, dy = y - island.y;
      if (Math.abs(dx) > 2 * island.radius || Math.abs(dy) > 2 * island.radius) continue;
      const u = roundRatio(dx * island.ux + dy * island.uy, FIELD_Q), v = roundRatio(-dx * island.uy + dy * island.ux, FIELD_Q);
      const radius = integerSqrt(roundRatio(u * u * 4, 9) + v * v);
      const wobble = roundRatio(island.radius * noiseQ12(seed, 6120 + id, x, y, 12 * 256), 6 * FIELD_Q);
      value = Math.max(value, island.radius - radius + wobble);
    }
    return Math.max(-DETAIL_DISTANCE_LIMIT_Q, Math.min(DETAIL_DISTANCE_LIMIT_Q, value));
  };
  const designSign = (x: number, y: number, value = design(x, y)): -1 | 1 => {
    if (value !== 0) return value > 0 ? 1 : -1;
    // An isolated zero extremum in an intermediate field has no target segment;
    // keep the surrounding positive region, otherwise leave it in the sea.
    return [[-STEP_Q, 0], [STEP_Q, 0], [0, -STEP_Q], [0, STEP_Q]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx <= WORLD_Q && y + dy <= WORLD_Q && design(x + dx, y + dy) > 0) ? 1 : -1;
  };
  const displays = new Uint8Array(4096), addBox = (minX: number, minY: number, maxX: number, maxY: number, flags: Uint8Array) => {
    for (let by = Math.max(0, Math.floor(minY / TILE_Q)); by <= Math.min(63, Math.floor(maxY / TILE_Q)); by++) for (let bx = Math.max(0, Math.floor(minX / TILE_Q)); bx <= Math.min(63, Math.floor(maxX / TILE_Q)); bx++) flags[by * 64 + bx] = 1;
  };
  for (const edge of outline.edges) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(edge.b.xQ - edge.a.xQ), Math.abs(edge.b.yQ - edge.a.yQ)) / TILE_Q)), margin = (recipe.coastStructureWorld + recipe.coastRoughnessWorld + 116) * 256;
    for (let index = 0; index <= steps; index++) { const x = edge.a.xQ + roundRatio((edge.b.xQ - edge.a.xQ) * index, steps), y = edge.a.yQ + roundRatio((edge.b.yQ - edge.a.yQ) * index, steps); addBox(x - margin, y - margin, x + margin, y + margin, displays); }
  }
  for (const island of islands) addBox(island.x - island.radius * 2 - STEP_Q, island.y - island.radius * 2 - STEP_Q, island.x + island.radius * 2 + STEP_Q, island.y + island.radius * 2 + STEP_Q, displays);
  const neededOwners = new Set<number>();
  for (let tile = 0; tile < 4096; tile++) if (displays[tile]) { const bx = tile % 64, by = Math.floor(tile / 64); for (let y = Math.max(0, by - 1); y <= by; y++) for (let x = Math.max(0, bx - 1); x <= bx; x++) neededOwners.add(y * 64 + x); }
  const designNodeTotal = [...neededOwners].reduce((sum, tile) => sum + detailCoastOwnerLayout(tile % 64, Math.floor(tile / 64)).count, 0);
  const designOwners = new Map<DetailCoastKey, DetailCoastTile>(); let evaluated = 0;
  const ensureOwner = async (bx: number, by: number) => {
    if (bx < 0 || by < 0) return; const key = detailCoastKey(bx, by); if (designOwners.has(key)) return;
    const layout = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let slot = 0; slot < layout.count; slot++) {
      const value = design((layout.startX + slot % layout.width) * STEP_Q, (layout.startY + Math.floor(slot / layout.width)) * STEP_Q);
      coverageQ[slot] = value; elevationMeters[slot] = value > 0 ? 1 : value < 0 ? -1 : 0;
      if (++evaluated % batch === 0) await checkpoint(control, 'sample-design-field', evaluated, designNodeTotal);
    }
    designOwners.set(key, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters });
  };
  const target = new Uint32Array(DETAIL_DISTANCE_MAX_SEGMENTS * 4); let targetCount = 0, finishedDisplays = 0;
  const displayCount = displays.reduce((sum, value) => sum + value, 0);
  for (let tile = 0; tile < 4096; tile++) if (displays[tile]) {
    const bx = tile % 64, by = Math.floor(tile / 64);
    for (const [key, value] of designOwners) if (value.by < by - 1) designOwners.delete(key);
    await ensureOwner(bx - 1, by - 1); await ensureOwner(bx, by - 1); await ensureOwner(bx - 1, by); await ensureOwner(bx, by);
    for (let row = 0; row < 32; row += 4) {
      const surface = buildDetailCoastSurface({ tiles: designOwners, sampleBaseElevation: () => -1 }, { column: bx * 32, row: by * 32 + row, columns: 32, rows: 4 });
      for (const cell of surface.cells) for (const edge of cell.shore) {
        if (targetCount >= DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error('自然化岸段超过 131072 条；候选已拒绝，未降采样或覆盖原图。');
        target.set([edge.a.xQ, edge.a.yQ, edge.b.xQ, edge.b.yQ], targetCount++ * 4);
      }
      await checkpoint(control, 'extract-target-coast', finishedDisplays * 8 + row / 4 + 1, displayCount * 8);
    }
    finishedDisplays++;
  }
  designOwners.clear();
  if (!targetCount) throw new Error('轮廓没有产生可用的细海岸；原世界未改变。');
  const targetCoast = target.slice(0, targetCount * 4).buffer;
  const distanceIndex: DetailShapeDistanceIndex = await buildDetailShapeDistanceIndex({ coordinates: targetCoast, segmentCount: targetCount }, { signal: control?.signal, yieldControl: control?.yieldControl, batchWork: batch, onProgress: (phase, done, total) => control?.onProgress?.(`target-${phase}`, done, total) });
  const band = new Uint8Array(4096), expansion = DETAIL_DISTANCE_LIMIT_Q + STEP_Q;
  for (let id = 0; id < targetCount; id++) {
    const source = id * 4; addBox(Math.min(target[source], target[source + 2]) - expansion, Math.min(target[source + 1], target[source + 3]) - expansion, Math.max(target[source], target[source + 2]) + expansion, Math.max(target[source + 1], target[source + 3]) + expansion, band);
    if ((id + 1) % batch === 0) await checkpoint(control, 'register-distance-band', id + 1, targetCount);
  }
  const detailCoast = new Map<DetailCoastKey, DetailCoastTile>(); let sampledTiles = 0, uniformLandTiles = 0, distanceSamples = 0, exactTargetSegmentTests = 0, maximumQuerySegmentTests = 0;
  const distanceAt = (x: number, y: number, sign: -1 | 1) => { const result = distanceIndex.sample(x, y, sign); distanceSamples++; exactTargetSegmentTests += result.stats.exactSegmentTests; maximumQuerySegmentTests = Math.max(maximumQuerySegmentTests, result.stats.exactSegmentTests); return result; };
  const distanceNodeTotal = band.reduce((sum, active, tile) => sum + (active ? detailCoastOwnerLayout(tile % 64, Math.floor(tile / 64)).count : 0), 0); let written = 0;
  for (let tile = 0; tile < 4096; tile++) {
    const bx = tile % 64, by = Math.floor(tile / 64), key = detailCoastKey(bx, by), layout = detailCoastOwnerLayout(bx, by);
    if (!band[tile]) {
      if (designSign(layout.startX * STEP_Q, layout.startY * STEP_Q) > 0) { detailCoast.set(key, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' }); uniformLandTiles++; }
    } else {
      const coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
      for (let slot = 0; slot < layout.count; slot++) {
        const x = (layout.startX + slot % layout.width) * STEP_Q, y = (layout.startY + Math.floor(slot / layout.width)) * STEP_Q;
        const coverage = distanceAt(x, y, designSign(x, y)).coverageQ; coverageQ[slot] = coverage; elevationMeters[slot] = coverage > 0 ? 1 : coverage < 0 ? -1 : 0;
        if (++written % batch === 0) await checkpoint(control, 'write-true-distance', written, distanceNodeTotal);
      }
      detailCoast.set(key, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters }); sampledTiles++;
    }
    if ((tile + 1) % 64 === 0) await checkpoint(control, 'write-owner-tiles', tile + 1, 4096);
  }
  const originalBase = createDetailShapeBaseSampler(size, centers.buffer as ArrayBuffer, oldHeights.buffer as ArrayBuffer), coarseHeights = oldHeights.slice(); let coarseLandSamples = 0, changedCoarseSamples = 0;
  const temporaryField = { tiles: detailCoast, sampleBaseElevation: () => -1 }, landSamples = new Uint8Array(total), coastDistances = new Uint16Array(total);
  for (let id = 0; id < total; id++) {
    const x = centers[id * 2], y = centers[id * 2 + 1], land = pickDetailCoastSurface(temporaryField, { x: x / 256, y: y / 256 })!.land;
    landSamples[id] = Number(land); coastDistances[id] = distanceAt(x, y, land ? 1 : -1).distanceQ;
    if ((id + 1) % batch === 0) await checkpoint(control, 'classify-natural-reference', id + 1, total);
  }
  const relief = await createNaturalRelief({ seed, size, centersQ: centers, land: landSamples, coastDistanceQ: coastDistances,
    reliefMeters: recipe.reliefMeters, shelfWidthWorld: recipe.shelfWidthWorld,
    isLand: (xQ, yQ) => pickDetailCoastSurface(temporaryField, { x: xQ / 256, y: yQ / 256 })!.land }, batch, control);
  for (let id = 0; id < total; id++) {
    const x = centers[id * 2], y = centers[id * 2 + 1], land = landSamples[id] === 1;
    coarseHeights[id] = relief.physicalHeight(x, y, land, coastDistances[id], oldHeights[id]); if (land) coarseLandSamples++; if (coarseHeights[id] !== oldHeights[id]) changedCoarseSamples++;
    if ((id + 1) % batch === 0) await checkpoint(control, 'write-coarse-reference', id + 1, total);
  }
  const sampleBaseElevation = createDetailShapeBaseSampler(size, centers.buffer as ArrayBuffer, coarseHeights.buffer as ArrayBuffer); let elevated = 0;
  // Only this newly generated component gets explicit fine land elevations.
  // Existing v4 readers, implicit old tiles and the Hbase sampler stay unchanged.
  const elevationNodeTotal = [...detailCoast.values()].reduce((sum, tile) => sum + detailCoastOwnerLayout(tile.bx, tile.by).count, 0);
  for (const [key, originalTile] of detailCoast) {
    const layout = detailCoastOwnerLayout(originalTile.bx, originalTile.by);
    const tile = originalTile.mode === 'samples' ? originalTile : {
      ...originalTile, mode: 'samples' as const,
      coverageQ: new Int16Array(layout.count).fill(DETAIL_DISTANCE_LIMIT_Q),
      elevationMeters: new Int16Array(layout.count),
    };
    if (originalTile.mode === 'land') { detailCoast.set(key, tile); sampledTiles++; uniformLandTiles--; }
    for (let slot = 0; slot < layout.count; slot++) {
      const x = (layout.startX + slot % layout.width) * STEP_Q, y = (layout.startY + Math.floor(slot / layout.width)) * STEP_Q, coverage = tile.coverageQ[slot];
      if (coverage === 0) tile.elevationMeters[slot] = 0;
      else if (coverage > 0) {
        // Positive coverage is the exact target-coast distance quantized to Q8,
        // capped at 32767. The physical profile's coast rise is at most 36 world
        // units, so saturated interior values are already fully inland. Do not
        // blend this actual fine height back into reconstructed coarse Hbase.
        tile.elevationMeters[slot] = relief.physicalHeight(x, y, true, coverage, -1);
      } else {
        const baseHeight = sampleBaseElevation(x, y), blend = smoothQ(roundRatio(Math.abs(coverage) * FIELD_Q, DETAIL_DISTANCE_LIMIT_Q));
        const nearHeight = relief.physicalHeight(x, y, false, Math.abs(coverage), originalBase(x, y));
        const height = Math.round((nearHeight * (FIELD_Q - blend) + baseHeight * blend) / FIELD_Q);
        tile.elevationMeters[slot] = Math.min(-1, height);
      }
      if (++elevated % batch === 0) await checkpoint(control, 'write-continuous-heights', elevated, elevationNodeTotal);
    }
  }
  // Private candidate audit avoids re-cloning the whole field before yielding.
  // The public untrusted-summary entry point remains unchanged and strict.
  const signs = new Int8Array(4096).fill(-1);
  for (const tile of detailCoast.values()) signs[tile.by * 64 + tile.bx] = tile.mode === 'land' || tile.coverageQ.every(v => v >= 0) ? 1 : tile.coverageQ.every(v => v < 0) ? -1 : 0;
  let landAreaTwiceQ2 = 0, seaAreaTwiceQ2 = 0, auditedFineCells = 0;
  for (let tile = 0; tile < 4096; tile++) {
    const bx = tile % 64, by = Math.floor(tile / 64), sign = signs[tile], dependencies = [sign];
    if (bx) dependencies.push(signs[tile - 1]); if (by) dependencies.push(signs[tile - 64]); if (bx && by) dependencies.push(signs[tile - 65]);
    if (sign && dependencies.every(value => value === sign)) { if (sign > 0) landAreaTwiceQ2 += 2 * TILE_Q ** 2; else seaAreaTwiceQ2 += 2 * TILE_Q ** 2; }
    else for (let row = 0; row < 32; row += 4) {
      const surface = buildDetailCoastSurface({ tiles: detailCoast, sampleBaseElevation }, { column: bx * 32, row: by * 32 + row, columns: 32, rows: 4 });
      landAreaTwiceQ2 += surface.landAreaTwiceQ2; seaAreaTwiceQ2 += surface.seaAreaTwiceQ2; auditedFineCells += 128;
      await checkpoint(control, 'audit-final-pieces', tile * 8 + row / 4 + 1, 4096 * 8);
    }
    if ((tile + 1) % 64 === 0) await checkpoint(control, 'audit-final-area', tile + 1, 4096);
  }
  const totalAreaTwiceQ2 = 2 * WORLD_Q ** 2;
  if (landAreaTwiceQ2 + seaAreaTwiceQ2 !== totalAreaTwiceQ2 || landAreaTwiceQ2 < 2 * 16 * 256 ** 2) throw new Error('最终细片面积不守恒或大陆太小，候选已拒绝。');
  checkAbort(control);
  return { detailCoast, coarseElevations: coarseHeights.slice(), sampleBaseElevation, targetCoast, summary: { natural: { roundedCorners: outline.roundedCorners, outlineEdges: outline.edges.length, maximumEnvelopeWorld: recipe.coastStructureWorld + recipe.coastRoughnessWorld, relief: relief.summary }, landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2, targetSegments: targetCount, sampledTiles, uniformLandTiles, coarseLandSamples, changedCoarseSamples, islandsRequested: recipe.islandChainCount * recipe.islandsPerChain, islandsPlaced: islands.length, skippedIslands, designNodesEvaluated, outlineEdgeTests: counters.outlineEdgeTests, distanceSamples, exactTargetSegmentTests, maximumQuerySegmentTests, auditedFineCells } };
}
