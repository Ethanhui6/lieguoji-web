/** Staged for src/world/generation/detail-shape-distance.ts.
 * Distances to already quantized, short target-coast segments. This module
 * does not create coastlines, choose inside/outside, or modify old generators. */
export const DETAIL_DISTANCE_WORLD_Q = 4096 * 256;
export const DETAIL_DISTANCE_LIMIT_Q = 32767;
export const DETAIL_DISTANCE_MAX_SEGMENTS = 131072;
const MAX_SEGMENT_AXIS_Q = 512;
const LEAF_SEGMENTS = 8;
const LIMIT_SQUARED = DETAIL_DISTANCE_LIMIT_Q ** 2;
const MAX_LENGTH_SQUARED = 2 * MAX_SEGMENT_AXIS_Q ** 2;
const MAX_ROUNDING_NUMERATOR = Math.floor(Number.MAX_SAFE_INTEGER / 4);

export interface DetailShapeSegmentInput {
  /** Native Uint32 values [axQ, ayQ, bxQ, byQ] in an exact ArrayBuffer.
   * This is an in-process input contract, not a serialized file format. */
  coordinates: ArrayBuffer;
  segmentCount: number;
}
export type DetailDistanceBuildPhase = 'takeover' | 'validate-segments' | 'sort-segments' | 'build-tree' | 'bound-tree';
export interface DetailDistanceBuildControl {
  signal?: AbortSignal;
  /** A production hook must yield to the actual event loop. */
  yieldControl?: () => Promise<void>;
  onProgress?: (phase: DetailDistanceBuildPhase, completed: number, total: number) => void;
  /** Work partition only; never participates in geometry or sort keys. */
  batchWork?: number;
}
export interface DetailDistanceQueryStats {
  nodeBoundsTests: number;
  poppedNodes: number;
  prunedNodes: number;
  segmentBoundsTests: number;
  exactSegmentTests: number;
  maximumStackLength: number;
}
export interface DetailDistanceSample {
  coverageQ: number;
  distanceQ: number;
  onCoast: boolean;
  stats: DetailDistanceQueryStats;
}
export interface DetailDistanceIndexStats {
  segmentCount: number;
  nodeCount: number;
  leafCount: number;
  leafCapacity: 8;
  sort: 'morton16-original-id-v1';
  retainedArrayBytes: number;
}
export interface DetailShapeDistanceIndex {
  readonly segmentCount: number;
  /** Positive/negative classification is supplied by the caller. Geometry
   * overrides it only at a point exactly on a target segment. */
  sample(xQ: number, yQ: number, sign: -1 | 1): DetailDistanceSample;
  describe(): DetailDistanceIndexStats;
}
interface TreeArrays {
  minX: Uint32Array; minY: Uint32Array; maxX: Uint32Array; maxY: Uint32Array;
  left: Uint32Array; right: Uint32Array; start: Uint32Array; count: Uint32Array;
}

function checkAbort(control?: DetailDistanceBuildControl): void {
  if (control?.signal?.aborted) throw new DOMException('细海岸距离索引已取消。', 'AbortError');
}
async function checkpoint(control: DetailDistanceBuildControl | undefined, phase: DetailDistanceBuildPhase, completed: number, total: number): Promise<void> {
  checkAbort(control);
  control?.onProgress?.(phase, completed, total);
  checkAbort(control);
  if (control?.yieldControl) await control.yieldControl();
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkAbort(control);
}
function ownInput(raw: DetailShapeSegmentInput): { coordinates: Uint32Array; segmentCount: number } {
  if (!raw || typeof raw !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new Error('目标岸段输入必须是普通记录。');
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes('coordinates') || !keys.includes('segmentCount')) throw new Error('目标岸段输入字段无效。');
  for (const key of ['coordinates', 'segmentCount']) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('目标岸段输入不接受访问器或隐藏字段。');
  }
  const segmentCount = raw.segmentCount, buffer = raw.coordinates;
  if (!Number.isInteger(segmentCount) || segmentCount < 0 || segmentCount > DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error('目标岸段数量超过合同范围。');
  if (!buffer || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || Reflect.ownKeys(buffer).length !== 0 || buffer.byteLength !== segmentCount * 16) throw new Error('目标岸段需要精确长度的非共享 ArrayBuffer。');
  // Exact envelopes need no enumeration of half a million typed-array indices.
  // Copy at most 2 MiB before the first await; no caller alias survives.
  const copy = ArrayBuffer.prototype.slice.call(buffer, 0) as ArrayBuffer;
  return { coordinates: new Uint32Array(copy), segmentCount };
}
function spread16(value: number): number {
  value &= 0xffff;
  value = (value | value << 8) & 0x00ff00ff;
  value = (value | value << 4) & 0x0f0f0f0f;
  value = (value | value << 2) & 0x33333333;
  value = (value | value << 1) & 0x55555555;
  return value;
}
function mortonCode(ax: number, ay: number, bx: number, by: number): number {
  // Centre numerator / 32 maps the Q8 world into 16 spatial bits. Quantizing
  // sort keys changes neither segment endpoints nor distance calculations.
  const x = Math.min(65535, (ax + bx) >>> 5), y = Math.min(65535, (ay + by) >>> 5);
  return (spread16(x) | spread16(y) << 1) >>> 0;
}
function floorRatio(numerator: number, denominator: number): number {
  let result = Math.floor(numerator / denominator);
  // Comparisons against exact safe-integer products settle a possible floating
  // division tie, without cross-multiplying two segment distance fractions.
  while ((result + 1) * denominator <= numerator) result++;
  while (result * denominator > numerator) result--;
  return result;
}
function integerSqrt(value: number): number {
  let root = Math.floor(Math.sqrt(value));
  while ((root + 1) ** 2 <= value) root++;
  while (root ** 2 > value) root--;
  return root;
}
/** Round sqrt(numerator / denominator) to nearest Q8 integer, ties upward.
 * Zero is reserved for exact incidence; a nonzero sub-half distance becomes 1.
 * The bounded rational helper is exported so half-integer ties and arithmetic
 * limits can be verified directly (exact halves need not be realizable by an
 * integer query and an integer-endpoint segment).
 *
 * numerator <= floor(MAX_SAFE_INTEGER/4), denominator <= 524288. Once values
 * at/above the 32767 cap are handled, (2*root+1)^2*denominator <=
 * 65533^2*524288 < 2^52 and 4*numerator < 2^53. All comparisons are exact. */
export function roundDetailDistanceSquaredQ8(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || numerator > MAX_ROUNDING_NUMERATOR || !Number.isSafeInteger(denominator) || denominator < 1 || denominator > MAX_LENGTH_SQUARED) throw new Error('短岸段距离分数超出安全整数合同。');
  if (numerator === 0) return 0;
  if (numerator >= LIMIT_SQUARED * denominator) return DETAIL_DISTANCE_LIMIT_Q;
  let root = integerSqrt(floorRatio(numerator, denominator));
  if (4 * numerator >= (2 * root + 1) ** 2 * denominator) root++;
  return Math.max(1, Math.min(DETAIL_DISTANCE_LIMIT_Q, root));
}
function boxDistanceSquared(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number): number {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dy = y < minY ? minY - y : y > maxY ? y - maxY : 0;
  return dx * dx + dy * dy;
}
function segmentDistanceQ(coordinates: Uint32Array, id: number, x: number, y: number): number {
  const start = id * 4, ax = coordinates[start], ay = coordinates[start + 1], bx = coordinates[start + 2], by = coordinates[start + 3];
  const dx = bx - ax, dy = by - ay, px = x - ax, py = y - ay, lengthSquared = dx * dx + dy * dy, dot = px * dx + py * dy;
  if (dot <= 0) return roundDetailDistanceSquaredQ8(px * px + py * py, 1);
  if (dot >= lengthSquared) return roundDetailDistanceSquaredQ8((x - bx) ** 2 + (y - by) ** 2, 1);
  const cross = px * dy - py * dx;
  // Called only after the segment AABB is within the capped query radius.
  // Hence |px|,|py| <= 32767+512=33279 and |cross| <= 34077696.
  // Even the loose 4*cross^2 bound is < 2^53. Absolute world position cancels.
  return roundDetailDistanceSquaredQ8(cross * cross, lengthSquared);
}
class OwnedDetailShapeDistanceIndex implements DetailShapeDistanceIndex {
  readonly segmentCount: number;
  readonly #coordinates: Uint32Array;
  readonly #order: Uint32Array;
  readonly #tree: TreeArrays;
  readonly #description: DetailDistanceIndexStats;
  constructor(coordinates: Uint32Array, order: Uint32Array, tree: TreeArrays, leafCount: number) {
    this.segmentCount = order.length; this.#coordinates = coordinates; this.#order = order; this.#tree = tree;
    this.#description = { segmentCount: order.length, nodeCount: tree.count.length, leafCount, leafCapacity: 8, sort: 'morton16-original-id-v1', retainedArrayBytes: coordinates.byteLength + order.byteLength + Object.values(tree).reduce((sum, array) => sum + array.byteLength, 0) };
    Object.freeze(this);
  }
  describe(): DetailDistanceIndexStats { return { ...this.#description }; }
  sample(xQ: number, yQ: number, sign: -1 | 1): DetailDistanceSample {
    if (!Number.isInteger(xQ) || !Number.isInteger(yQ) || xQ < 0 || yQ < 0 || xQ > DETAIL_DISTANCE_WORLD_Q || yQ > DETAIL_DISTANCE_WORLD_Q || sign !== -1 && sign !== 1) throw new Error('目标岸段距离查询需要世界内 Q8 整数点与明确正负类别。');
    const stats: DetailDistanceQueryStats = { nodeBoundsTests: 0, poppedNodes: 0, prunedNodes: 0, segmentBoundsTests: 0, exactSegmentTests: 0, maximumStackLength: 0 };
    const tree = this.#tree, coordinates = this.#coordinates;
    let best = DETAIL_DISTANCE_LIMIT_Q;
    const lowerBound = (node: number) => { stats.nodeBoundsTests++; return boxDistanceSquared(xQ, yQ, tree.minX[node], tree.minY[node], tree.maxX[node], tree.maxY[node]); };
    const stack: { node: number; lowerSquared: number }[] = this.segmentCount ? [{ node: 0, lowerSquared: lowerBound(0) }] : [];
    stats.maximumStackLength = stack.length;
    while (stack.length && best !== 0) {
      const entry = stack.pop()!; stats.poppedNodes++;
      // To improve a rounded minimum B, true distance must be below B-0.5.
      // Using B itself is a conservative bound and also retains exact zeros.
      if (entry.lowerSquared > best * best) { stats.prunedNodes++; continue; }
      const node = entry.node;
      if (tree.count[node]) {
        const end = tree.start[node] + tree.count[node];
        for (let offset = tree.start[node]; offset < end; offset++) {
          const id = this.#order[offset], source = id * 4, ax = coordinates[source], ay = coordinates[source + 1], bx = coordinates[source + 2], by = coordinates[source + 3];
          stats.segmentBoundsTests++;
          const lowerSquared = boxDistanceSquared(xQ, yQ, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
          if (lowerSquared > best * best) continue;
          stats.exactSegmentTests++;
          best = Math.min(best, segmentDistanceQ(coordinates, id, xQ, yQ));
          if (best === 0) break;
        }
      } else {
        const left = tree.left[node], right = tree.right[node], a = { node: left, lowerSquared: lowerBound(left) }, b = { node: right, lowerSquared: lowerBound(right) };
        // Node ids settle an equal AABB-distance traversal deterministically.
        if (a.lowerSquared < b.lowerSquared || a.lowerSquared === b.lowerSquared && a.node < b.node) stack.push(b, a); else stack.push(a, b);
        stats.maximumStackLength = Math.max(stats.maximumStackLength, stack.length);
      }
    }
    return { coverageQ: best === 0 ? 0 : sign * best, distanceQ: best, onCoast: best === 0, stats };
  }
}

/** Stable Morton radix ordering gives a deterministic, balanced AABB hierarchy
 * without an uninterruptible Array.sort over 131072 items. Ties retain the
 * original segment id because every radix pass is stable. Typical separated
 * coast queries prune spatially; overlapping pathological inputs may still
 * visit all <=131072 segments, which stats report rather than conceal.
 * The caller yields between a bounded batch of synchronous sample() calls. */
export async function buildDetailShapeDistanceIndex(raw: DetailShapeSegmentInput, control?: DetailDistanceBuildControl): Promise<DetailShapeDistanceIndex> {
  checkAbort(control);
  const batch = control?.batchWork ?? 2048;
  if (!Number.isInteger(batch) || batch < 64 || batch > 8192) throw new Error('距离索引批次需要 64—8192 个工作单元。');
  const { coordinates, segmentCount } = ownInput(raw);
  await checkpoint(control, 'takeover', 1, 1);
  const codes = new Uint32Array(segmentCount); let order = new Uint32Array(segmentCount), scratch = new Uint32Array(segmentCount);
  for (let id = 0; id < segmentCount; id++) {
    const start = id * 4, ax = coordinates[start], ay = coordinates[start + 1], bx = coordinates[start + 2], by = coordinates[start + 3];
    if (ax > DETAIL_DISTANCE_WORLD_Q || ay > DETAIL_DISTANCE_WORLD_Q || bx > DETAIL_DISTANCE_WORLD_Q || by > DETAIL_DISTANCE_WORLD_Q || Math.abs(bx - ax) > MAX_SEGMENT_AXIS_Q || Math.abs(by - ay) > MAX_SEGMENT_AXIS_Q || ax === bx && ay === by) throw new Error('目标岸段必须非退化、位于世界内且每轴跨度不超过 512 Q8。');
    codes[id] = mortonCode(ax, ay, bx, by); order[id] = id;
    if ((id + 1) % batch === 0) await checkpoint(control, 'validate-segments', id + 1, segmentCount);
  }
  await checkpoint(control, 'validate-segments', segmentCount, segmentCount);
  const counts = new Uint32Array(256), positions = new Uint32Array(256), sortTotal = segmentCount * 8;
  let sortDone = 0;
  for (let pass = 0; pass < 4; pass++) {
    counts.fill(0); const shift = pass * 8;
    for (let offset = 0; offset < segmentCount; offset++) {
      counts[codes[order[offset]] >>> shift & 255]++; sortDone++;
      if (sortDone % batch === 0) await checkpoint(control, 'sort-segments', sortDone, sortTotal);
    }
    let position = 0;
    for (let bucket = 0; bucket < 256; bucket++) { positions[bucket] = position; position += counts[bucket]; }
    for (let offset = 0; offset < segmentCount; offset++) {
      const id = order[offset]; scratch[positions[codes[id] >>> shift & 255]++] = id; sortDone++;
      if (sortDone % batch === 0) await checkpoint(control, 'sort-segments', sortDone, sortTotal);
    }
    [order, scratch] = [scratch, order];
  }
  await checkpoint(control, 'sort-segments', sortDone, sortTotal);
  const leafCount = Math.ceil(segmentCount / LEAF_SEGMENTS), nodeCount = leafCount ? 2 * leafCount - 1 : 0;
  const tree: TreeArrays = { minX: new Uint32Array(nodeCount), minY: new Uint32Array(nodeCount), maxX: new Uint32Array(nodeCount), maxY: new Uint32Array(nodeCount), left: new Uint32Array(nodeCount), right: new Uint32Array(nodeCount), start: new Uint32Array(nodeCount), count: new Uint32Array(nodeCount) };
  const pending: { node: number; firstLeaf: number; leaves: number }[] = leafCount ? [{ node: 0, firstLeaf: 0, leaves: leafCount }] : [];
  let nextNode = 1, built = 0;
  while (pending.length) {
    const task = pending.pop()!;
    if (task.leaves === 1) { tree.start[task.node] = task.firstLeaf * LEAF_SEGMENTS; tree.count[task.node] = Math.min(LEAF_SEGMENTS, segmentCount - tree.start[task.node]); }
    else {
      const leftLeaves = Math.floor(task.leaves / 2), left = nextNode++, right = nextNode++;
      tree.left[task.node] = left; tree.right[task.node] = right;
      pending.push({ node: right, firstLeaf: task.firstLeaf + leftLeaves, leaves: task.leaves - leftLeaves }, { node: left, firstLeaf: task.firstLeaf, leaves: leftLeaves });
    }
    built++; if (built % batch === 0) await checkpoint(control, 'build-tree', built, nodeCount);
  }
  if (nodeCount && nextNode !== nodeCount) throw new Error('目标岸段索引节点计数异常。');
  await checkpoint(control, 'build-tree', built, nodeCount);
  // Children have greater ids than their parent, so reverse order bounds them
  // before their parent. Every leaf scans at most eight original segments.
  let bound = 0;
  for (let node = nodeCount - 1; node >= 0; node--) {
    if (tree.count[node]) {
      let minX = DETAIL_DISTANCE_WORLD_Q, minY = DETAIL_DISTANCE_WORLD_Q, maxX = 0, maxY = 0;
      const end = tree.start[node] + tree.count[node];
      for (let offset = tree.start[node]; offset < end; offset++) {
        const start = order[offset] * 4;
        minX = Math.min(minX, coordinates[start], coordinates[start + 2]); minY = Math.min(minY, coordinates[start + 1], coordinates[start + 3]);
        maxX = Math.max(maxX, coordinates[start], coordinates[start + 2]); maxY = Math.max(maxY, coordinates[start + 1], coordinates[start + 3]);
      }
      tree.minX[node] = minX; tree.minY[node] = minY; tree.maxX[node] = maxX; tree.maxY[node] = maxY;
    } else {
      const left = tree.left[node], right = tree.right[node];
      tree.minX[node] = Math.min(tree.minX[left], tree.minX[right]); tree.minY[node] = Math.min(tree.minY[left], tree.minY[right]);
      tree.maxX[node] = Math.max(tree.maxX[left], tree.maxX[right]); tree.maxY[node] = Math.max(tree.maxY[left], tree.maxY[right]);
    }
    bound++; if (bound % batch === 0) await checkpoint(control, 'bound-tree', bound, nodeCount);
  }
  await checkpoint(control, 'bound-tree', bound, nodeCount);
  return new OwnedDetailShapeDistanceIndex(coordinates, order, tree, leafCount);
}
