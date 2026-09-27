import { describe, expect, it } from 'vitest';
import { detailTerrainCellLighting, detailTerrainNodeLights, detailTerrainPieceRelief } from './detail-terrain-shader';
import { buildDetailCoastSurface, pickDetailCoastSurface } from './detail-coast-geometry';
import { sampleDetailCoastNode } from './detail-coast-field';
import { detailCoastNodeOwner, detailCoastOwnerLayout, type DetailCoastField, type DetailCoastKey, type DetailCoastSampleTile, type DetailCoastTriangle, type DetailCoastVertex } from './detail-coast-types';

function fixture() {
  const tiles = new Map<DetailCoastKey, DetailCoastSampleTile>();
  const field: DetailCoastField = { tiles, sampleBaseElevation: () => -17 };
  const set = (x: number, y: number, coverageQ: number, heightMeters: number) => {
    const owner = detailCoastNodeOwner(x, y); let tile = tiles.get(owner.key);
    if (!tile) {
      const { count } = detailCoastOwnerLayout(owner.bx, owner.by);
      tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx: owner.bx, by: owner.by, mode: 'samples', coverageQ: new Int16Array(count).fill(-32767), elevationMeters: new Int16Array(count).fill(-17) };
      tiles.set(owner.key, tile);
    }
    tile.coverageQ[owner.slot] = coverageQ; tile.elevationMeters[owner.slot] = heightMeters;
  };
  const fill = (column: number, row: number, sample: (x: number, y: number) => [number, number]) => {
    for (let y = Math.max(0, row - 1); y <= Math.min(2048, row + 3); y++) for (let x = Math.max(0, column - 1); x <= Math.min(2048, column + 3); x++) set(x, y, ...sample(x, y));
  };
  const light = (column: number, row: number) => detailTerrainCellLighting((x, y) => sampleDetailCoastNode(field, x, y), column, row);
  return { field, tiles, set, fill, light };
}
const cross = (a: DetailCoastVertex, b: DetailCoastVertex, c: DetailCoastVertex) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
function at(triangle: DetailCoastTriangle, lights: ReturnType<typeof detailTerrainCellLighting>, land: boolean, point: DetailCoastVertex) {
  const area = cross(...triangle);
  return (cross(point, triangle[1], triangle[2]) * lights.lightAt(triangle[0], land) + cross(triangle[0], point, triangle[2]) * lights.lightAt(triangle[1], land) + cross(triangle[0], triangle[1], point) * lights.lightAt(triangle[2], land)) / area;
}
function point(xQ: number, yQ: number): DetailCoastVertex { return { xQ, yQ, coverageQ: 0, heightMeters: 0 }; }

describe('v4 continuous same-side display light (CPU; GPU execution separately required)', () => {
  it('preserves a physical plane and the full one-sided slope at all four world corners', () => {
    const f = fixture(), expected = 1 + Math.atan(12 / 40) / (Math.PI / 2) * .13;
    for (const [column, row] of [[0, 0], [2047, 0], [0, 2047], [2047, 2047]]) {
      f.fill(column, row, (x, y) => [-1, -600 + (x - column) * 10 + (y - row) * 14]);
      const lights = f.light(column, row), cell = buildDetailCoastSurface(f.field, { column, row, columns: 1, rows: 1 }).cells[0];
      for (const triangle of cell.sea) for (const vertex of triangle) expect(lights.lightAt(vertex, false)).toBeCloseTo(expected, 12);
    }
    const node = point(0, 0); node.heightMeters = 12; node.coverageQ = 1;
    expect(detailTerrainNodeLights(node, node, node, node, node)).toEqual([1, 1]);
  });

  it('removes finite lighting jumps across real fine-cell edges, owner boundaries and the NW-SE fan', () => {
    const f = fixture(), column = 31, row = 32;
    f.fill(column, row, (x, y) => [-100, -500 + 8 * (x - column) ** 2 + 4 * (y - row) ** 2]);
    const cells = buildDetailCoastSurface(f.field, { column, row, columns: 2, rows: 1 }).cells;
    const left = f.light(column, row), right = f.light(column + 1, row);
    expect(Math.abs(detailTerrainPieceRelief(...cells[0].sea[0]).light - detailTerrainPieceRelief(...cells[1].sea[1]).light)).toBeGreaterThan(.01);
    for (const t of [0, .125, .5, .875, 1]) {
      const shared = point((column + 1) * 512, (row + t) * 512);
      expect(at(cells[0].sea[0], left, false, shared)).toBeCloseTo(at(cells[1].sea[1], right, false, shared), 12);
      const diagonal = point((column + t) * 512, (row + t) * 512);
      expect(at(cells[0].sea[0], left, false, diagonal)).toBeCloseTo(at(cells[0].sea[1], left, false, diagonal), 12);
    }
  });

  it('shares actual quantized shore vertices between cells without importing the other side height', () => {
    const f = fixture(), column = 31, row = 32;
    const fill = (seaHeight: number) => f.fill(column, row, (x, y) => y <= row ? [3, 100 + (x - column) * 15] : [-1021, seaHeight]);
    fill(-600);
    const snapshot = JSON.stringify(buildDetailCoastSurface(f.field, { column, row, columns: 2, rows: 1 }));
    const cells = buildDetailCoastSurface(f.field, { column, row, columns: 2, rows: 1 }).cells;
    const left = f.light(column, row), right = f.light(column + 1, row);
    const shared = cells[0].shore.flatMap(segment => [segment.a, segment.b]).find(vertex => vertex.xQ === (column + 1) * 512)!;
    expect(shared.yQ - row * 512).toBe(2); // 3/1024 crossing rounds 1.5 Q8 to 2.
    for (const land of [true, false]) expect(left.lightAt(shared, land)).toBe(right.lightAt(shared, land));
    const originalLand = cells[0].land.flatMap(triangle => triangle.map(vertex => left.lightAt(vertex, true)));
    fill(-12000); const changed = f.light(column, row);
    expect(cells[0].land.flatMap(triangle => triangle.map(vertex => changed.lightAt(vertex, true)))).toEqual(originalLand);
    expect(changed.lightAt(shared, false)).not.toBe(left.lightAt(shared, false));
    fill(-600); expect(JSON.stringify(buildDetailCoastSurface(f.field, { column, row, columns: 2, rows: 1 }))).toBe(snapshot);
  });

  it('keeps zero nodes and zero edges side-specific, bounded, and consistent with real land priority', () => {
    const f = fixture(), column = 8, row = 8;
    f.fill(column, row, (x, y) => x === column + 1 ? [0, 0] : x < column + 1 ? [1, 200 + (y - row) * 40] : [-1, -800 - (y - row) * 90]);
    const a = f.light(column, row), b = f.light(column + 1, row), zero = sampleDetailCoastNode(f.field, column + 1, row);
    expect(a.lightAt(zero, true)).toBe(b.lightAt(zero, true)); expect(a.lightAt(zero, false)).toBe(b.lightAt(zero, false));
    expect(a.lightAt(zero, true)).not.toBe(a.lightAt(zero, false));
    expect(pickDetailCoastSurface(f.field, { x: (column + 1) * 2, y: row * 2 + .75 })).toMatchObject({ land: true, height: 0 });
    for (const land of [true, false]) { const value = a.lightAt(zero, land); expect(value).toBeGreaterThanOrEqual(.87); expect(value).toBeLessThanOrEqual(1.13); }
  });

  it('uses no more than twelve unique immutable source samples per cell', () => {
    const f = fixture(); f.fill(31, 31, (x, y) => [-1, -600 + x + y]);
    const before = structuredClone(f.tiles), calls: string[] = [];
    const lights = detailTerrainCellLighting((x, y) => { calls.push(`${x}:${y}`); return sampleDetailCoastNode(f.field, x, y); }, 31, 31);
    expect(calls).toHaveLength(12); expect(new Set(calls).size).toBe(12); expect(lights.sampledNodes).toBe(12);
    for (const triangle of buildDetailCoastSurface(f.field, { column: 31, row: 31, columns: 1, rows: 1 }).cells[0].sea) for (const vertex of triangle) lights.lightAt(vertex, false);
    expect(calls).toHaveLength(12); expect(f.tiles).toEqual(before);
  });

  it('leaves thin clipped pieces, exact height and geographic decisions intact', () => {
    const f = fixture(), column = 10, row = 10;
    f.fill(column, row, () => [-32767, -12000]); f.set(column, row, 1, 12000);
    const original = buildDetailCoastSurface(f.field, { column, row, columns: 1, rows: 1 }), before = structuredClone(f.tiles);
    const lighting = f.light(column, row);
    expect(original.cells[0].shore.some(segment => Math.max(segment.a.xQ - column * 512, segment.a.yQ - row * 512) === 1)).toBe(true);
    for (const [land, triangles] of [[true, original.cells[0].land], [false, original.cells[0].sea]] as const) for (const triangle of triangles) {
      const q = point((2 * triangle[0].xQ + triangle[1].xQ + triangle[2].xQ) / 4, (2 * triangle[0].yQ + triangle[1].yQ + triangle[2].yQ) / 4);
      const expectedHeight = (2 * triangle[0].heightMeters + triangle[1].heightMeters + triangle[2].heightMeters) / 4;
      expect(pickDetailCoastSurface(f.field, { x: q.xQ / 256, y: q.yQ / 256 })).toMatchObject({ land, height: expectedHeight });
      const light = at(triangle, lighting, land, q); expect(Number.isFinite(light)).toBe(true); expect(light).toBeGreaterThanOrEqual(.87); expect(light).toBeLessThanOrEqual(1.13);
    }
    expect(buildDetailCoastSurface(f.field, { column, row, columns: 1, rows: 1 })).toEqual(original); expect(f.tiles).toEqual(before);
  });
});
