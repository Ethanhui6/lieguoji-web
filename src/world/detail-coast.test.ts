import { describe, expect, it } from 'vitest';
import { cloneDetailCoastTile, cloneDetailCoastTiles, decodeDetailCoastTile, encodeDetailCoastTile, hashDetailCoastTile, validateDetailCoastTile, validateDetailCoastTilesAsync } from './detail-coast-codec';
import { sampleDetailCoastCoverage, sampleDetailCoastNode } from './detail-coast-field';
import { buildDetailCoastSurface, detailCellsIntersectingQuad, pickDetailCoastSurface, summarizeDetailCoast } from './detail-coast-geometry';
import { detailCoastAffectedDisplayTiles, detailCoastKey, detailCoastNodeOwner, detailCoastOwnerLayout, type DetailCoastField, type DetailCoastKey, type DetailCoastSampleTile, type DetailCoastTile } from './detail-coast-types';

const noWait = async () => {};
function land(bx: number, by: number): DetailCoastTile { return { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' }; }
function samples(bx: number, by: number, coverage: (x: number, y: number) => number = () => -32767): DetailCoastSampleTile {
  const layout = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
  for (let index = 0; index < layout.count; index++) {
    const value = coverage(layout.startX + index % layout.width, layout.startY + Math.floor(index / layout.width));
    coverageQ[index] = value; elevationMeters[index] = value > 0 ? 800 : value < 0 ? -1200 : 0;
  }
  return { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters };
}
function mapOf(...tiles: DetailCoastTile[]) { return new Map<DetailCoastKey, DetailCoastTile>(tiles.map((tile) => [detailCoastKey(tile.bx, tile.by), tile])); }
function field(...tiles: DetailCoastTile[]): DetailCoastField { return { tiles: mapOf(...tiles), sampleBaseElevation: (x, y) => (x + y) / 256 - 100 }; }
function setNode(tile: DetailCoastSampleTile, x: number, y: number, coverage: number) {
  const { slot } = detailCoastNodeOwner(x, y); tile.coverageQ[slot] = coverage; tile.elevationMeters[slot] = coverage > 0 ? 800 : coverage < 0 ? -1200 : 0;
}
const geometry = (value: ReturnType<typeof buildDetailCoastSurface>) => value.cells.map((cell) => ({ land: cell.land, sea: cell.sea, shore: cell.shore, area: cell.landAreaTwiceQ2 }));

describe('persistent sparse detail coast contract', () => {
  it('owns every boundary node once, including world limits and diagonal tile corners', () => {
    expect(detailCoastOwnerLayout(0, 0).count).toBe(1089);
    expect(detailCoastOwnerLayout(0, 1).count).toBe(1056);
    expect(detailCoastOwnerLayout(1, 1).count).toBe(1024);
    expect(detailCoastNodeOwner(32, 32)).toMatchObject({ key: 'coast:0:0', slot: 1088 });
    expect(detailCoastNodeOwner(33, 32)).toMatchObject({ key: 'coast:1:0', slot: 1024 });
    expect(detailCoastNodeOwner(33, 33)).toMatchObject({ key: 'coast:1:1', slot: 0 });
    expect(detailCoastNodeOwner(2048, 2048)).toMatchObject({ key: 'coast:63:63', slot: 1023 });
    let total = 0; for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) total += detailCoastOwnerLayout(bx, by).count;
    expect(total).toBe(2049 ** 2);
    expect(detailCoastAffectedDisplayTiles(2, 2)).toEqual(['coast:2:2', 'coast:3:2', 'coast:2:3', 'coast:3:3']);
    expect(detailCoastAffectedDisplayTiles(63, 63)).toEqual(['coast:63:63']);
    expect(() => detailCoastNodeOwner(2049, 0)).toThrow();
  });

  it('defaults to sea, keeps land explicit and resolves shared nodes through the sole owner', () => {
    const first = samples(0, 0, (x, y) => x === 32 && y === 32 ? 179 : -250), second = samples(1, 1, () => -87);
    const data = field(first, second);
    expect(sampleDetailCoastNode(data, 32, 32)).toMatchObject({ coverageQ: 179, heightMeters: 800 });
    expect(sampleDetailCoastNode(data, 33, 33)).toMatchObject({ coverageQ: -87, heightMeters: -1200 });
    expect(sampleDetailCoastCoverage(data.tiles, 64, 32)).toBe(-32767);
    expect(sampleDetailCoastNode(field(land(0, 0)), 0, 0)).toMatchObject({ coverageQ: 32767, heightMeters: 0 });
    expect(sampleDetailCoastNode(field(), 2048, 2048)).toMatchObject({ coverageQ: -32767, heightMeters: -1 });
    expect(() => sampleDetailCoastNode({ tiles: new Map(), sampleBaseElevation: () => NaN }, 0, 0)).toThrow('基础高程');
  });

  it('round-trips canonical bytes, owner dimensions, signed values and independent typed-array memory', async () => {
    for (const tile of [land(63, 63), samples(0, 0, (x, y) => (x + y) % 3 === 0 ? 0 : x % 2 === 0 ? 32767 : -32767), samples(2, 0), samples(2, 2)]) {
      const encoded = encodeDetailCoastTile(tile), decoded = decodeDetailCoastTile(encoded);
      expect(decoded).toEqual(tile); expect(encodeDetailCoastTile(decoded)).toEqual(encoded);
      expect(await hashDetailCoastTile(decoded)).toBe(await hashDetailCoastTile(tile));
      if (tile.mode === 'samples' && decoded.mode === 'samples') { expect(decoded.coverageQ.buffer).not.toBe(tile.coverageQ.buffer); decoded.coverageQ[0] = 99; expect(tile.coverageQ[0]).not.toBe(99); }
    }
    const a = samples(0, 0), b = cloneDetailCoastTile(a); expect(b).toEqual(a); expect(b).not.toBe(a);
    expect(await hashDetailCoastTile(a)).toMatch(/^[a-f0-9]{64}$/);
    const before = await hashDetailCoastTile(a); setNode(a, 2, 2, 1); expect(await hashDetailCoastTile(a)).not.toBe(before);
  });

  it('rejects malformed envelopes and never invokes envelope getters', () => {
    let calls = 0; const getter = { ...land(0, 0) }; Object.defineProperty(getter, 'mode', { enumerable: true, get() { calls++; return 'land'; } });
    expect(() => validateDetailCoastTile(getter)).toThrow(); expect(calls).toBe(0);
    const hidden = { ...land(0, 0) }; Object.defineProperty(hidden, 'bx', { value: 0, enumerable: false });
    const malformed = [{ ...land(0, 0), extra: true }, { ...land(0, 0), version: 2 }, { ...land(0, 0), bx: 64 }, { ...land(0, 0), mode: 'sea' }, hidden, Object.assign(Object.create({}), land(0, 0))];
    for (const value of malformed) expect(() => validateDetailCoastTile(value)).toThrow();
    const symbol = { ...land(0, 0), [Symbol('extra')]: 1 }; expect(() => validateDetailCoastTile(symbol)).toThrow();
    expect(() => cloneDetailCoastTiles(new Map([['coast:1:0', land(0, 0)]]))).toThrow('key');
    class DifferentMap extends Map<DetailCoastKey, DetailCoastTile> {} expect(() => cloneDetailCoastTiles(new DifferentMap())).toThrow('Map');
  });

  it('rejects partial, shared, foreign-shaped, decorated and detached sample arrays', () => {
    const tile = samples(1, 1), length = tile.coverageQ.length;
    class DifferentArray extends Int16Array {}
    const arrays = [new Int16Array(length - 1), new Int16Array(length + 1).subarray(1), new DifferentArray(length), new Uint16Array(length), Array(length).fill(0), new Int16Array(new SharedArrayBuffer(length * 2))];
    for (const array of arrays) expect(() => validateDetailCoastTile({ ...tile, coverageQ: array })).toThrow();
    const decorated = new Int16Array(length); Object.defineProperty(decorated, 'hidden', { value: 1 }); expect(() => validateDetailCoastTile({ ...tile, coverageQ: decorated })).toThrow();
    const detached = new Int16Array(length); structuredClone(detached.buffer, { transfer: [detached.buffer] }); expect(() => validateDetailCoastTile({ ...tile, coverageQ: detached })).toThrow();
    for (const [coverage, height] of [[-32768, -1], [-2, 0], [1, -1], [0, 2], [1, 12001], [-1, -12001]]) { const invalid = samples(1, 1); invalid.coverageQ[0] = coverage; invalid.elevationMeters[0] = height; expect(() => validateDetailCoastTile(invalid)).toThrow('不一致'); }
  });

  it('rejects noncanonical/truncated binary data and validates decoded sample pairs', () => {
    const original = encodeDetailCoastTile(samples(0, 0));
    for (const index of [0, 4, 5, 6, 8, 10]) { const bytes = original.slice(); bytes[index] = 255; expect(() => decodeDetailCoastTile(bytes)).toThrow(); }
    expect(() => decodeDetailCoastTile(original.slice(0, -1))).toThrow();
    const extra = new Uint8Array(original.length + 1); extra.set(original); expect(() => decodeDetailCoastTile(extra)).toThrow();
    const invalid = original.slice(); new DataView(invalid.buffer).setInt16(16, -32768, true); expect(() => decodeDetailCoastTile(invalid)).toThrow();
    expect(() => decodeDetailCoastTile(original.subarray(1))).toThrow();
  });

  it('takes ownership before yielding and honors cancellation on both sides of a yield', async () => {
    const input = new Map<DetailCoastKey, DetailCoastTile>(); for (let x = 0; x < 17; x++) input.set(detailCoastKey(x, 0), samples(x, 0));
    let yields = 0;
    const result = await validateDetailCoastTilesAsync(input, { yieldControl: async () => { yields++; (input.get('coast:0:0') as DetailCoastSampleTile).coverageQ[0] = -32768; input.clear(); } });
    expect(yields).toBe(1); expect(result.size).toBe(17); expect((result.get('coast:0:0') as DetailCoastSampleTile).coverageQ[0]).toBe(-32767);
    const controller = new AbortController(); controller.abort(); await expect(validateDetailCoastTilesAsync(result, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const later = new AbortController(); await expect(validateDetailCoastTilesAsync(result, { signal: later.signal, yieldControl: async () => { later.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('partitions all corner sign patterns and extreme signed magnitudes with integer area conservation', () => {
    const tile = samples(0, 0), data = field(tile), corner = [[4, 4], [5, 4], [5, 5], [4, 5]], magnitudes = [-32767, -1, 0, 1, 32767];
    for (let pattern = 0; pattern < 625; pattern++) {
      let current = pattern; for (const [x, y] of corner) { setNode(tile, x, y, magnitudes[current % 5]); current = Math.floor(current / 5); }
      const surface = buildDetailCoastSurface(data, { column: 4, row: 4, columns: 1, rows: 1 }), cell = surface.cells[0];
      expect(cell.landAreaTwiceQ2 + cell.seaAreaTwiceQ2).toBe(524288);
      for (const triangle of [...cell.land, ...cell.sea]) for (const point of triangle) expect(Number.isSafeInteger(point.xQ) && Number.isSafeInteger(point.yQ)).toBe(true);
      for (const triangle of [...cell.land, ...cell.sea]) {
        const point = { x: triangle.reduce((sum, v) => sum + v.xQ, 0) / 768, y: triangle.reduce((sum, v) => sum + v.yQ, 0) / 768 };
        const picked = pickDetailCoastSurface(data, point)!;
        expect(picked.land).toBe(cell.land.includes(triangle)); expect(picked.height).toBeCloseTo(triangle.reduce((sum, v) => sum + v.heightMeters, 0) / 3, 6);
      }
    }
  });

  it('picks the quantized contour rather than a different raw-coverage zero', () => {
    const tile = samples(0, 0); setNode(tile, 0, 0, 1); const data = field(tile);
    // Raw interpolation at 0.5 Q8 is negative; the persisted contract rounds
    // the crossing to 1 Q8, and both rendering and picking use that polygon.
    expect(pickDetailCoastSurface(data, { x: 0.5 / 256, y: 0.2 / 256 })?.land).toBe(true);
    expect(pickDetailCoastSurface(data, { x: 1 / 256, y: 0.2 / 256 })).toMatchObject({ land: true, height: 0 });
    expect(pickDetailCoastSurface(data, { x: 1.1 / 256, y: 0.2 / 256 })?.land).toBe(false);
    const cell = buildDetailCoastSurface(data, { column: 0, row: 0, columns: 1, rows: 1 }).cells[0]; expect(cell.landAreaTwiceQ2).toBe(2);
  });

  it('classifies zero points, entire zero edges and all-zero plateaus as land without double area', () => {
    const tile = samples(0, 0), data = field(tile); setNode(tile, 4, 4, 0);
    expect(pickDetailCoastSurface(data, { x: 8, y: 8 })).toMatchObject({ land: true, height: 0 });
    setNode(tile, 5, 4, 0);
    expect(pickDetailCoastSurface(data, { x: 9, y: 8 })).toMatchObject({ land: true, height: 0 });
    let cells = buildDetailCoastSurface(data, { column: 4, row: 3, columns: 1, rows: 2 }).cells;
    const zeroEdge = cells.flatMap((cell) => cell.shore).filter((edge) => edge.a.yQ === 2048 && edge.b.yQ === 2048);
    expect(zeroEdge).toHaveLength(1); expect(zeroEdge[0].ownerTriangleId).toBe((3 * 2048 + 4) * 2 + 1);
    setNode(tile, 5, 5, 0); setNode(tile, 4, 5, 0);
    cells = buildDetailCoastSurface(data, { column: 4, row: 4, columns: 1, rows: 1 }).cells;
    expect(cells[0].landAreaTwiceQ2).toBe(524288); expect(cells[0].seaAreaTwiceQ2).toBe(0); expect(cells[0].shore).toHaveLength(0);
  });

  it('keeps every multi-tile shared crossing identical and shore segments uniquely owned', () => {
    const coverage = (x: number, y: number) => Math.max(-32767, Math.min(32767, (x - 32) * 71 + (y - 32) * 113 + 17));
    const data = field(samples(0, 0, coverage), samples(1, 0, coverage), samples(0, 1, coverage), samples(1, 1, coverage));
    const together = buildDetailCoastSurface(data, { column: 30, row: 30, columns: 4, rows: 4 });
    const separate = [buildDetailCoastSurface(data, { column: 30, row: 30, columns: 2, rows: 4 }), buildDetailCoastSurface(data, { column: 32, row: 30, columns: 2, rows: 4 })];
    const cells = separate.flatMap((v) => v.cells).sort((a, b) => a.cellId - b.cellId); expect(cells).toEqual(together.cells);
    const segments = together.cells.flatMap((cell) => cell.shore).map((edge) => [edge.a, edge.b].map((p) => `${p.xQ},${p.yQ}`).sort().join('|'));
    expect(new Set(segments).size).toBe(segments.length);
    for (const edge of together.cells.flatMap((cell) => cell.shore)) expect(pickDetailCoastSurface(data, { x: (edge.a.xQ + edge.b.xQ) / 512, y: (edge.a.yQ + edge.b.yQ) / 512 })).toMatchObject({ land: true, height: 0 });
    const restored = { ...data, tiles: new Map([...data.tiles].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))])) };
    expect(geometry(buildDetailCoastSurface(restored, { column: 30, row: 30, columns: 4, rows: 4 }))).toEqual(geometry(together));
  });

  it('accounts for all four edges and diagonal neighbours of one explicit land owner in empty sea', async () => {
    const data = field(land(2, 2)), surface = buildDetailCoastSurface(data, { column: 63, row: 63, columns: 35, rows: 35 });
    // 31² full cells, 4×31 half cells, and four corner contributions
    // of 1, 1, 1/2, 1/2 world² under the fixed NW–SE triangulation.
    expect(surface.landAreaTwiceQ2 / (2 * 256 ** 2)).toBe(4095);
    for (const point of [{ x: 129, y: 160 }, { x: 193, y: 160 }, { x: 160, y: 129 }, { x: 160, y: 193 }]) expect(pickDetailCoastSurface(data, point)).toMatchObject({ land: true, height: 0 });
    for (const point of [{ x: 128.5, y: 160 }, { x: 193.5, y: 160 }, { x: 160, y: 128.5 }, { x: 160, y: 193.5 }, { x: 193, y: 129 }]) expect(pickDetailCoastSurface(data, point)?.land).toBe(false);
    expect(pickDetailCoastSurface(data, { x: 129, y: 129 })?.land).toBe(true);
    const summary = await summarizeDetailCoast(data.tiles, { yieldControl: noWait });
    expect(summary.landAreaTwiceQ2).toBe(surface.landAreaTwiceQ2); expect(summary.processedFineCells).toBe(4096); expect(summary.processedFineCells + summary.uniformFineCells).toBe(2048 ** 2);
    expect(summary.landAreaTwiceQ2 + summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
    const segments = surface.cells.flatMap((cell) => cell.shore).map((edge) => [edge.a, edge.b].map((p) => `${p.xQ},${p.yQ}`).sort().join('|'));
    expect(new Set(segments).size).toBe(segments.length);
  });

  it('summarizes absent sea analytically and cancels a nonuniform audit cooperatively', async () => {
    const empty = await summarizeDetailCoast(new Map(), { yieldControl: noWait }); expect(empty).toMatchObject({ landAreaTwiceQ2: 0, processedFineCells: 0, uniformFineCells: 2048 ** 2 });
    const controller = new AbortController(); let yielded = 0;
    await expect(summarizeDetailCoast(mapOf(samples(0, 0, (x, y) => x % 2 === y % 2 ? 123 : -456)), { signal: controller.signal, yieldControl: async () => { yielded++; controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(yielded).toBe(1);
  });

  it('enforces bounded geometry work and has correct picks at the far world boundary', () => {
    expect(() => buildDetailCoastSurface(field(), { column: 0, row: 0, columns: 2048, rows: 2048 })).toThrow('限额');
    expect(() => buildDetailCoastSurface(field(), { column: 2048, row: 0, columns: 1, rows: 1 })).toThrow();
    expect(pickDetailCoastSurface(field(), { x: 4096, y: 4096 })).toMatchObject({ fineCellId: 2048 ** 2 - 1, land: false });
    for (const point of [{ x: -1, y: 0 }, { x: 4097, y: 0 }, { x: NaN, y: 0 }]) expect(pickDetailCoastSurface(field(), point)).toBeNull();
  });

  it('covers a skew quad with exact convex intersection and a conservative one-cell lock strip', () => {
    const quad = [{ xQ: 1024, yQ: 1024 }, { xQ: 2560, yQ: 1536 }, { xQ: 2048, yQ: 3072 }, { xQ: 1024, yQ: 2560 }];
    const cells = detailCellsIntersectingQuad(quad); expect(cells).toContain(3 * 2048 + 3); expect(cells).toContain(1 * 2048 + 1); expect(cells).not.toContain(6 * 2048 + 5);
    const aligned = detailCellsIntersectingQuad([{ xQ: 1024, yQ: 1024 }, { xQ: 1536, yQ: 1024 }, { xQ: 1536, yQ: 1536 }, { xQ: 1024, yQ: 1536 }]); expect(aligned).toHaveLength(9);
    expect(() => detailCellsIntersectingQuad([...quad].reverse())).toThrow('凸');
    expect(() => detailCellsIntersectingQuad([{ xQ: 0, yQ: 0 }, { xQ: 1048576, yQ: 0 }, { xQ: 1048576, yQ: 1048576 }, { xQ: 0, yQ: 1048576 }])).toThrow('限额');
  });

  it('records dense and sparse ingress takeover cost without a machine-dependent pass threshold', async () => {
    const dense = new Map<DetailCoastKey, DetailCoastTile>(); for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) dense.set(detailCoastKey(bx, by), samples(bx, by));
    let firstYieldAt = 0; const started = performance.now();
    await validateDetailCoastTilesAsync(dense, { yieldControl: async () => { if (!firstYieldAt) firstYieldAt = performance.now(); } });
    const denseEnd = performance.now();
    const sparse = new Map([...dense].filter((entry) => entry[1].bx < 4 && entry[1].by < 4)); let sparseFirst = 0; const sparseStart = performance.now();
    await validateDetailCoastTilesAsync(sparse, { yieldControl: async () => { if (!sparseFirst) sparseFirst = performance.now(); } });
    const sparseEnd = performance.now();
    console.info('DETAIL_COAST_INGRESS_MEASURE', JSON.stringify({ denseTiles: dense.size, denseOwnedSamples: 2049 ** 2, denseBytes: 2049 ** 2 * 4, denseBeforeFirstYieldMs: +(firstYieldAt - started).toFixed(2), denseTotalMs: +(denseEnd - started).toFixed(2), sparseTiles: sparse.size, sparseBeforeFirstYieldMs: +(sparseFirst - sparseStart).toFixed(2), sparseTotalMs: +(sparseEnd - sparseStart).toFixed(2) }));
    expect(firstYieldAt).toBeGreaterThan(started); expect(sparseFirst).toBeGreaterThan(sparseStart);
  }, 30000);
});
