/** Staged alongside detail-shape-distance.ts; intentionally not run while the
 * production browser source/build is frozen. */
import { describe, expect, it } from 'vitest';
import { buildDetailShapeDistanceIndex, DETAIL_DISTANCE_LIMIT_Q, DETAIL_DISTANCE_MAX_SEGMENTS, DETAIL_DISTANCE_WORLD_Q, roundDetailDistanceSquaredQ8, type DetailDistanceBuildPhase, type DetailShapeSegmentInput } from './detail-shape-distance';

type Segment = [number, number, number, number];
const noWait = async () => {};
function input(segments: readonly Segment[]): DetailShapeSegmentInput { return { coordinates: Uint32Array.from(segments.flat()).buffer, segmentCount: segments.length }; }
async function index(segments: readonly Segment[], batchWork = 64) { return buildDetailShapeDistanceIndex(input(segments), { yieldControl: noWait, batchWork }); }

/** Independent exact BigInt oracle: binary search the squared rational rather
 * than using production sqrt, spatial keys, bounding boxes or Number products. */
function oracleRound(numerator: bigint, denominator: bigint): number {
  const limit = BigInt(DETAIL_DISTANCE_LIMIT_Q);
  if (numerator === 0n) return 0;
  if (numerator >= limit * limit * denominator) return Number(limit);
  let lower = 0n, upper = limit;
  while (lower + 1n < upper) { const middle = (lower + upper) / 2n; if (middle * middle * denominator <= numerator) lower = middle; else upper = middle; }
  const rounded = 4n * numerator >= (2n * lower + 1n) ** 2n * denominator ? lower + 1n : lower;
  return Number(rounded < 1n ? 1n : rounded);
}
function oracleSegment(segment: Segment, xQ: number, yQ: number): number {
  const [ax, ay, bx, by] = segment.map(BigInt), x = BigInt(xQ), y = BigInt(yQ), dx = bx - ax, dy = by - ay, px = x - ax, py = y - ay;
  const lengthSquared = dx * dx + dy * dy, dot = px * dx + py * dy;
  if (dot <= 0n) return oracleRound(px * px + py * py, 1n);
  if (dot >= lengthSquared) return oracleRound((x - bx) ** 2n + (y - by) ** 2n, 1n);
  return oracleRound((px * dy - py * dx) ** 2n, lengthSquared);
}
function oracle(segments: readonly Segment[], xQ: number, yQ: number): number {
  let distance = DETAIL_DISTANCE_LIMIT_Q;
  for (const segment of segments) distance = Math.min(distance, oracleSegment(segment, xQ, yQ));
  return distance;
}

describe('short target-coast Q8 distance index', () => {
  it('measures endpoints, interior projections, reversed endpoints and supplied sign', async () => {
    const segments: Segment[] = [[100, 100, 612, 100]], forward = await index(segments), reverse = await index([[612, 100, 100, 100]]);
    for (const [x, y, distance] of [[100, 100, 0], [356, 100, 0], [612, 100, 0], [99, 100, 1], [90, 90, 14], [356, 107, 7], [700, 100, 88]]) {
      const positive = forward.sample(x, y, 1), negative = forward.sample(x, y, -1);
      expect(positive.distanceQ).toBe(distance); expect(positive.coverageQ).toBe(distance);
      expect(negative.coverageQ).toBe(distance ? -distance : 0); expect(Object.is(negative.coverageQ, -0)).toBe(false);
      expect(positive.onCoast).toBe(distance === 0); expect(reverse.sample(x, y, 1).distanceQ).toBe(distance);
    }
  });

  it('uses diagonal projection distance and translation-invariant local arithmetic near the world limit', async () => {
    const low = await index([[0, 0, 512, 512]]), offset = DETAIL_DISTANCE_WORLD_Q - 512, high = await index([[offset, offset, offset + 512, offset + 512]]);
    for (const [x, y] of [[256, 256], [256, 257], [0, 512], [512, 0], [17, 389]]) {
      const expected = oracle([[0, 0, 512, 512]], x, y);
      expect(low.sample(x, y, 1).distanceQ).toBe(expected); expect(high.sample(offset + x, offset + y, 1).distanceQ).toBe(expected);
    }
    expect(low.sample(0, 512, 1).distanceQ).toBe(362);
    const otherDiagonal = await index([[512, 0, 0, 512]]); expect(otherDiagonal.sample(128, 128, 1).distanceQ).toBe(181);
  });

  it('rounds exact half-integers upward and keeps nonzero sub-half distances signed', async () => {
    for (const [numerator, denominator, expected] of [[0, 1, 0], [1, 16, 1], [8, 4, 1], [9, 4, 2], [10, 4, 2], [25, 4, 3], [49, 4, 4]]) {
      expect(roundDetailDistanceSquaredQ8(numerator, denominator)).toBe(expected);
      expect(roundDetailDistanceSquaredQ8(numerator, denominator)).toBe(oracleRound(BigInt(numerator), BigInt(denominator)));
    }
    // Integer endpoints need not realize an exact half. These two projected
    // distances are 19/13 and 20/13 and straddle the 1.5 rounding boundary.
    const projected = await index([[0, 0, 5, 12]]);
    expect(projected.sample(3, 11, 1).distanceQ).toBe(1);
    expect(projected.sample(0, 4, 1).distanceQ).toBe(2);
    expect(projected.sample(2, 6, -1)).toMatchObject({ coverageQ: -1, distanceQ: 1, onCoast: false });
  });

  it('caps far queries without inventing a coast and supports an empty target set', async () => {
    const populated = await index([[0, 0, 512, 0]]), empty = await index([]);
    expect(populated.sample(0, 32766, 1).distanceQ).toBe(32766);
    expect(populated.sample(0, 32767, 1).distanceQ).toBe(32767);
    expect(populated.sample(DETAIL_DISTANCE_WORLD_Q, DETAIL_DISTANCE_WORLD_Q, -1)).toMatchObject({ coverageQ: -32767, distanceQ: 32767, onCoast: false });
    expect(populated.sample(DETAIL_DISTANCE_WORLD_Q, DETAIL_DISTANCE_WORLD_Q, 1).stats.exactSegmentTests).toBe(0);
    expect(empty.sample(0, 0, -1)).toMatchObject({ coverageQ: -32767, onCoast: false, stats: { exactSegmentTests: 0, nodeBoundsTests: 0 } });
    expect(empty.describe()).toMatchObject({ nodeCount: 0, leafCount: 0, segmentCount: 0 });
  });

  it('proves the bounded products are safe and rejects rational inputs beyond that contract', () => {
    const crossBound = 2n * BigInt(32767 + 512) * 512n;
    expect(4n * crossBound ** 2n).toBeLessThan(2n ** 53n);
    expect(65533n ** 2n * 524288n).toBeLessThan(2n ** 52n);
    const maximumNumerator = Math.floor(Number.MAX_SAFE_INTEGER / 4);
    expect(roundDetailDistanceSquaredQ8(maximumNumerator, 524288)).toBe(32767);
    for (const [numerator, denominator] of [[maximumNumerator + 1, 1], [-1, 1], [1.5, 1], [1, 0], [1, 524289], [NaN, 1], [1, Infinity]]) expect(() => roundDetailDistanceSquaredQ8(numerator, denominator)).toThrow('安全整数');
    const limit = 32767n;
    for (const denominator of [1n, 2n, 5n, 169n, 524288n]) for (const delta of [-1n, 0n, 1n]) {
      const numerator = limit * limit * denominator + delta;
      expect(roundDetailDistanceSquaredQ8(Number(numerator), Number(denominator))).toBe(oracleRound(numerator, denominator));
    }
  });

  it('matches a small independent brute-force oracle for varied segment shapes and query radii', async () => {
    let state = 0x629137af;
    const random = (maximum: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % maximum; };
    const segments: Segment[] = [];
    for (let id = 0; id < 96; id++) {
      const x = 1024 + random(DETAIL_DISTANCE_WORLD_Q - 2048), y = 1024 + random(DETAIL_DISTANCE_WORLD_Q - 2048);
      let dx = random(1025) - 512; const dy = random(1025) - 512; if (!dx && !dy) dx = 1;
      segments.push([x, y, x + dx, y + dy]);
    }
    const target = await index(segments);
    for (let query = 0; query < 192; query++) {
      const anchor = segments[query % segments.length], radius = query % 3 === 0 ? 40000 : 1000;
      const x = Math.max(0, Math.min(DETAIL_DISTANCE_WORLD_Q, anchor[0] + random(radius * 2 + 1) - radius));
      const y = Math.max(0, Math.min(DETAIL_DISTANCE_WORLD_Q, anchor[1] + random(radius * 2 + 1) - radius));
      expect(target.sample(x, y, query % 2 ? 1 : -1).distanceQ).toBe(oracle(segments, x, y));
    }
  });

  it('prunes a real distributed coast index and reports work rather than host timing', async () => {
    const segments: Segment[] = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) segments.push([x * 16384 + 256, y * 16384 + 256, x * 16384 + 512, y * 16384 + 256]);
    const target = await index(segments), sample = target.sample(1000, 1000, 1), description = target.describe();
    expect(sample.distanceQ).toBe(oracle(segments, 1000, 1000));
    expect(sample.stats.exactSegmentTests).toBeGreaterThan(0); expect(sample.stats.exactSegmentTests).toBeLessThan(segments.length / 16);
    expect(sample.stats.poppedNodes).toBeLessThanOrEqual(description.nodeCount); expect(sample.stats.nodeBoundsTests).toBeLessThanOrEqual(description.nodeCount);
    expect(description).toMatchObject({ segmentCount: 4096, leafCount: 512, nodeCount: 1023, sort: 'morton16-original-id-v1' });
  });

  it('retains original-id order for equal spatial keys and ignores build batch scheduling', async () => {
    const segments: Segment[] = [[1744, 2000, 2256, 2000], ...Array.from({ length: 63 }, (): Segment => [2000, 1744, 2000, 2256])];
    const first = await index(segments, 64), second = await index(segments, 257);
    expect(first.describe()).toEqual(second.describe());
    for (const point of [[2200, 2000], [2000, 2200], [1800, 2100]]) expect(first.sample(point[0], point[1], 1)).toEqual(second.sample(point[0], point[1], 1));
    // All centres have the same Morton key. The original first horizontal
    // segment reaches this point, so a stable id tie ends on the first test.
    expect(first.sample(2200, 2000, 1).stats.exactSegmentTests).toBe(1);
  });

  it('owns coordinates before the first yield and does not expose mutable internal buffers', async () => {
    const source = input([[100, 100, 612, 100]]); let changed = false;
    const target = await buildDetailShapeDistanceIndex(source, { yieldControl: async () => {
      if (!changed) { changed = true; new Uint32Array(source.coordinates).fill(0); source.segmentCount = 999; }
    } });
    expect(target.sample(356, 107, 1).distanceQ).toBe(7); expect(target.segmentCount).toBe(1);
    const description = target.describe(); description.segmentCount = 900; expect(target.describe().segmentCount).toBe(1);
    expect(Reflect.ownKeys(target)).toEqual(['segmentCount']); expect(Object.isFrozen(target)).toBe(true);
    const detachedSource = input([[0, 0, 512, 0]]); let detached = false;
    const detachedTarget = await buildDetailShapeDistanceIndex(detachedSource, { yieldControl: async () => { if (!detached) { detached = true; structuredClone(detachedSource.coordinates, { transfer: [detachedSource.coordinates] }); } } });
    expect(detachedTarget.sample(256, 12, 1).distanceQ).toBe(12);
  });

  it('rejects malformed envelopes and does not invoke their accessors', async () => {
    let accessed = 0;
    const accessor = { ...input([[0, 0, 512, 0]]) }; Object.defineProperty(accessor, 'coordinates', { enumerable: true, get() { accessed++; return new ArrayBuffer(16); } });
    await expect(buildDetailShapeDistanceIndex(accessor, { yieldControl: noWait })).rejects.toThrow('访问器'); expect(accessed).toBe(0);
    const hidden = input([[0, 0, 512, 0]]); Object.defineProperty(hidden, 'segmentCount', { value: 1, enumerable: false });
    const decorated = input([[0, 0, 512, 0]]); Object.defineProperty(decorated.coordinates, 'extra', { value: 1 });
    const malformed: unknown[] = [
      { ...input([]), extra: true }, { ...input([]), [Symbol('extra')]: 1 }, hidden, decorated,
      { coordinates: new ArrayBuffer(15), segmentCount: 1 }, { coordinates: new ArrayBuffer(32), segmentCount: 1 },
      { coordinates: new SharedArrayBuffer(16), segmentCount: 1 }, { coordinates: new Uint32Array(4), segmentCount: 1 },
      { coordinates: new ArrayBuffer(0), segmentCount: -1 }, { coordinates: new ArrayBuffer(0), segmentCount: 1.5 },
      { coordinates: new ArrayBuffer(0), segmentCount: DETAIL_DISTANCE_MAX_SEGMENTS + 1 },
    ];
    for (const value of malformed) await expect(buildDetailShapeDistanceIndex(value as DetailShapeSegmentInput, { yieldControl: noWait })).rejects.toThrow();
    const detached = input([[0, 0, 512, 0]]); structuredClone(detached.coordinates, { transfer: [detached.coordinates] }); await expect(buildDetailShapeDistanceIndex(detached, { yieldControl: noWait })).rejects.toThrow();
  });

  it('rejects invalid segments and query inputs without accepting a long-edge approximation', async () => {
    for (const segment of [[0, 0, 0, 0], [0, 0, 513, 0], [0, 0, 0, 513], [DETAIL_DISTANCE_WORLD_Q, 1, DETAIL_DISTANCE_WORLD_Q + 1, 1], [-1, 0, 100, 0]] as Segment[]) await expect(index([segment])).rejects.toThrow('512 Q8');
    const target = await index([[0, 0, 512, 0]]);
    for (const point of [[-1, 0], [0.5, 0], [0, NaN], [DETAIL_DISTANCE_WORLD_Q + 1, 0]]) expect(() => target.sample(point[0], point[1], 1)).toThrow('整数点');
    expect(() => target.sample(0, 0, 0 as 1)).toThrow('类别');
    await expect(buildDetailShapeDistanceIndex(input([]), { batchWork: 63 })).rejects.toThrow('批次');
  });

  it('cancels before takeover and cooperatively during every build phase', async () => {
    const segments = Array.from({ length: 129 }, (_, id): Segment => [id * 1024, 200, id * 1024 + 512, 300]), source = input(segments), bytesBefore = new Uint8Array(source.coordinates).slice();
    const phases: DetailDistanceBuildPhase[] = ['takeover', 'validate-segments', 'sort-segments', 'build-tree', 'bound-tree'];
    for (const phase of phases) {
      const controller = new AbortController(); let reached = false;
      await expect(buildDetailShapeDistanceIndex(source, { signal: controller.signal, batchWork: 64, yieldControl: noWait, onProgress: (current) => { if (current === phase) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(new Uint8Array(source.coordinates)).toEqual(bytesBefore);
    }
    const early = new AbortController(); early.abort(); await expect(buildDetailShapeDistanceIndex(source, { signal: early.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const whileYielding = new AbortController(); await expect(buildDetailShapeDistanceIndex(source, { signal: whileYielding.signal, yieldControl: async () => { whileYielding.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses an actual default event-loop yield so a queued cancellation can be delivered', async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 0);
    try { await expect(buildDetailShapeDistanceIndex(input([[0, 0, 512, 0]]), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
  });

  it('accepts the exact maximum count with bounded storage and returns no borrowed arrays', async () => {
    const coordinates = new Uint32Array(DETAIL_DISTANCE_MAX_SEGMENTS * 4);
    for (let id = 0; id < DETAIL_DISTANCE_MAX_SEGMENTS; id++) coordinates.set([100, 100, 612, 100], id * 4);
    const target = await buildDetailShapeDistanceIndex({ coordinates: coordinates.buffer, segmentCount: DETAIL_DISTANCE_MAX_SEGMENTS }, { batchWork: 8192, yieldControl: noWait });
    expect(target.describe()).toMatchObject({ segmentCount: 131072, leafCount: 16384, nodeCount: 32767 });
    expect(target.describe().retainedArrayBytes).toBe(131072 * 16 + 131072 * 4 + 32767 * 8 * 4);
    expect(target.sample(356, 100, 1)).toMatchObject({ distanceQ: 0, stats: { exactSegmentTests: 1 } });
  });
});
