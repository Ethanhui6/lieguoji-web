import { validateDetailCoastTilesAsync } from './detail-coast-codec';
import { sampleDetailCoastCoverage, sampleDetailCoastNode } from './detail-coast-field';
import { checkDetailCoastAbort, detailCoastKey, yieldDetailCoast, type DetailCoastCellSurface, type DetailCoastControl, type DetailCoastField, type DetailCoastPointQ, type DetailCoastRectangle, type DetailCoastSegment, type DetailCoastSurface, type DetailCoastTiles, type DetailCoastTriangle, type DetailCoastVertex } from './detail-coast-types';

type NodeSampler = (x: number, y: number) => DetailCoastVertex;
const cross = (a: DetailCoastPointQ, b: DetailCoastPointQ, c: DetailCoastPointQ) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const same = (a: DetailCoastPointQ, b: DetailCoastPointQ) => a.xQ === b.xQ && a.yQ === b.yQ;
const CELL_AREA_TWICE = 2 * 512 * 512;
const WORLD_AREA_TWICE = 2 * (4096 * 256) ** 2;
function validateRectangle(rect: DetailCoastRectangle, limit: number) {
  if (![rect.column, rect.row, rect.columns, rect.rows].every(Number.isInteger) || rect.column < 0 || rect.row < 0 || rect.columns < 1 || rect.rows < 1 || rect.column + rect.columns > 2048 || rect.row + rect.rows > 2048 || rect.columns * rect.rows > limit) throw new Error('细海岸请求超过有效范围或单批限额。');
}
function memoSampler(sample: NodeSampler): NodeSampler {
  const nodes = new Map<number, DetailCoastVertex>();
  return (x, y) => { const key = y * 2049 + x, known = nodes.get(key); if (known) return known; const node = sample(x, y); nodes.set(key, node); return node; };
}
function sourceTriangles(sample: NodeSampler, column: number, row: number): [DetailCoastTriangle, DetailCoastTriangle] {
  const nw = sample(column, row), ne = sample(column + 1, row), se = sample(column + 1, row + 1), sw = sample(column, row + 1);
  return [[nw, ne, se], [nw, se, sw]];
}
/** Zero crossings are canonical Q8 geometry, not camera interpolation. All
 * source edges are horizontal, vertical or NW–SE diagonals, so rounding the
 * single edge parameter keeps the crossing exactly on its source edge. */
function crossing(a: DetailCoastVertex, b: DetailCoastVertex): DetailCoastVertex {
  if (a.coverageQ === 0) return a;
  if (b.coverageQ === 0) return b;
  if ((a.coverageQ > 0) === (b.coverageQ > 0)) throw new Error('细海岸交点需要异号覆盖值。');
  if (a.xQ > b.xQ || a.xQ === b.xQ && a.yQ > b.yQ) [a, b] = [b, a];
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length !== 512 || dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) throw new Error('细海岸源边不符合固定三角合同。');
  const numerator = length * Math.abs(a.coverageQ), denominator = Math.abs(a.coverageQ - b.coverageQ);
  // Strict opposite-sign endpoints must retain a nonempty side after rounding.
  const offset = Math.max(1, Math.min(length - 1, Math.floor((2 * numerator + denominator) / (2 * denominator))));
  return { xQ: a.xQ + Math.sign(dx) * offset, yQ: a.yQ + Math.sign(dy) * offset, coverageQ: 0, heightMeters: 0 };
}
function clip(triangle: DetailCoastTriangle, land: boolean): DetailCoastVertex[] {
  const points: DetailCoastVertex[] = [], inside = (v: DetailCoastVertex) => land ? v.coverageQ >= 0 : v.coverageQ <= 0;
  for (let index = 0; index < 3; index++) {
    const a = triangle[index], b = triangle[(index + 1) % 3];
    if (inside(a)) points.push(a);
    if (inside(a) !== inside(b)) points.push(crossing(a, b));
  }
  return points.filter((point, index) => !same(point, points[(index + points.length - 1) % points.length]));
}
function triangulate(points: DetailCoastVertex[]): DetailCoastTriangle[] {
  const triangles: DetailCoastTriangle[] = [];
  for (let index = 1; index + 1 < points.length; index++) {
    const triangle: DetailCoastTriangle = [points[0], points[index], points[index + 1]], area = cross(...triangle);
    if (!Number.isSafeInteger(area) || area < 0) throw new Error('细海岸裁切片面积无效。');
    if (area > 0) triangles.push(triangle);
  }
  return triangles;
}
function neighbourTriangle(column: number, row: number, orientation: number, edge: number): { column: number; row: number; orientation: number } | null {
  const candidates = orientation === 0
    ? [{ column, row: row - 1, orientation: 1 }, { column: column + 1, row, orientation: 1 }, { column, row, orientation: 1 }]
    : [{ column, row, orientation: 0 }, { column, row: row + 1, orientation: 0 }, { column: column - 1, row, orientation: 0 }];
  const next = candidates[edge]; return next.column < 0 || next.row < 0 || next.column >= 2048 || next.row >= 2048 ? null : next;
}
function shoreline(sample: NodeSampler, triangle: DetailCoastTriangle, column: number, row: number, orientation: number): DetailCoastSegment[] {
  if (!triangle.some((v) => v.coverageQ < 0)) return [];
  const ownerTriangleId = (row * 2048 + column) * 2 + orientation;
  const zeroPoints: DetailCoastVertex[] = [];
  for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverageQ === 0) zeroPoints.push(a);
    if (a.coverageQ * b.coverageQ < 0) zeroPoints.push(crossing(a, b));
    if (a.coverageQ === 0 && b.coverageQ === 0) {
      // Entire zero edges belong to land, including zero-area ridges. Only a
      // negative side emits them; two negative sides choose the lower id.
      const next = neighbourTriangle(column, row, orientation, edge);
      if (next) {
        const nextId = (next.row * 2048 + next.column) * 2 + next.orientation;
        if (nextId < ownerTriangleId && sourceTriangles(sample, next.column, next.row)[next.orientation].some((v) => v.coverageQ < 0)) return [];
      }
      return [{ a, b, ownerTriangleId }];
    }
  }
  const unique = zeroPoints.filter((point, index) => zeroPoints.findIndex((candidate) => same(point, candidate)) === index);
  return unique.length === 2 ? [{ a: unique[0], b: unique[1], ownerTriangleId }] : [];
}
function buildCell(sample: NodeSampler, column: number, row: number, withShore: boolean): DetailCoastCellSurface {
  const land: DetailCoastTriangle[] = [], sea: DetailCoastTriangle[] = [], shore: DetailCoastSegment[] = [];
  const sources = sourceTriangles(sample, column, row);
  for (let orientation = 0; orientation < 2; orientation++) {
    const triangle = sources[orientation];
    if (triangle.every((v) => v.coverageQ >= 0)) land.push(triangle);
    else { land.push(...triangulate(clip(triangle, true))); sea.push(...triangulate(clip(triangle, false))); }
    if (withShore) shore.push(...shoreline(sample, triangle, column, row, orientation));
  }
  const landAreaTwiceQ2 = land.reduce((sum, triangle) => sum + cross(...triangle), 0), seaAreaTwiceQ2 = sea.reduce((sum, triangle) => sum + cross(...triangle), 0);
  if (landAreaTwiceQ2 + seaAreaTwiceQ2 !== CELL_AREA_TWICE) throw new Error('细海岸裁切面积不守恒。');
  return { cellId: row * 2048 + column, column, row, land, sea, shore, landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2: CELL_AREA_TWICE };
}
/** Bounded viewport/display-tile work, never an implicit whole-world mesh. */
export function buildDetailCoastSurface(field: DetailCoastField, rectangle: DetailCoastRectangle): DetailCoastSurface {
  validateRectangle(rectangle, 4096);
  const sample = memoSampler((x, y) => sampleDetailCoastNode(field, x, y)), cells: DetailCoastCellSurface[] = [];
  let landAreaTwiceQ2 = 0, seaAreaTwiceQ2 = 0;
  for (let row = rectangle.row; row < rectangle.row + rectangle.rows; row++) for (let column = rectangle.column; column < rectangle.column + rectangle.columns; column++) {
    const cell = buildCell(sample, column, row, true); cells.push(cell); landAreaTwiceQ2 += cell.landAreaTwiceQ2; seaAreaTwiceQ2 += cell.seaAreaTwiceQ2;
  }
  return { cells, landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2: landAreaTwiceQ2 + seaAreaTwiceQ2 };
}
function contains(triangle: DetailCoastTriangle, point: DetailCoastPointQ): boolean { return cross(triangle[0], triangle[1], point) >= 0 && cross(triangle[1], triangle[2], point) >= 0 && cross(triangle[2], triangle[0], point) >= 0; }
function heightAt(triangle: DetailCoastTriangle, point: DetailCoastPointQ): number {
  const area = cross(...triangle);
  return (cross(point, triangle[1], triangle[2]) * triangle[0].heightMeters + cross(triangle[0], point, triangle[2]) * triangle[1].heightMeters + cross(triangle[0], triangle[1], point) * triangle[2].heightMeters) / area;
}
export interface DetailCoastPick { fineCellId: number; column: number; row: number; land: boolean; height: number }
/** Uses the actual quantized polygons. Raw coverage interpolation is not the
 * geographic authority. Zero nodes/edges are land even when they have no area. */
export function pickDetailCoastSurface(field: DetailCoastField, point: { x: number; y: number }): DetailCoastPick | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 4096 || point.y > 4096) return null;
  const column = Math.min(2047, Math.floor(point.x / 2)), row = Math.min(2047, Math.floor(point.y / 2));
  const sample = memoSampler((x, y) => sampleDetailCoastNode(field, x, y)), target = { xQ: point.x * 256, yQ: point.y * 256 };
  const result = { fineCellId: row * 2048 + column, column, row };
  const cell = buildCell(sample, column, row, false);
  for (const triangle of cell.land) if (contains(triangle, target)) return { ...result, land: true, height: heightAt(triangle, target) };
  for (const triangle of sourceTriangles(sample, column, row)) for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverageQ === 0 && same(a, target) || a.coverageQ === 0 && b.coverageQ === 0 && cross(a, b, target) === 0 && target.xQ >= Math.min(a.xQ, b.xQ) && target.xQ <= Math.max(a.xQ, b.xQ) && target.yQ >= Math.min(a.yQ, b.yQ) && target.yQ <= Math.max(a.yQ, b.yQ)) return { ...result, land: true, height: 0 };
  }
  for (const triangle of cell.sea) if (contains(triangle, target)) return { ...result, land: false, height: heightAt(triangle, target) };
  throw new Error('细海岸点未被权威裁切片覆盖。');
}
export interface DetailCoastSummary {
  landAreaTwiceQ2: number; seaAreaTwiceQ2: number; totalAreaTwiceQ2: number;
  explicitTiles: number; sampledTiles: number; processedFineCells: number; uniformFineCells: number;
}
/** Owns its input before yielding. A full area audit is cooperative and runs
 * after edits, never once per frame; uniform regions are proven analytically. */
export async function summarizeDetailCoast(tiles: DetailCoastTiles, control?: DetailCoastControl): Promise<DetailCoastSummary> {
  const owned = await validateDetailCoastTilesAsync(tiles, { signal: control?.signal, yieldControl: control?.yieldControl });
  const classes = new Map<string, number>(); let sampledTiles = 0;
  for (const [key, tile] of owned) {
    if (tile.mode === 'land') classes.set(key, 1);
    else { sampledTiles++; classes.set(key, tile.coverageQ.every((v) => v >= 0) ? 1 : tile.coverageQ.every((v) => v < 0) ? -1 : 0); }
  }
  const signAt = (bx: number, by: number) => classes.get(detailCoastKey(bx, by)) ?? -1;
  let landAreaTwiceQ2 = 0, seaAreaTwiceQ2 = 0, processedFineCells = 0, uniformFineCells = 0, completed = 0;
  for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) {
    checkDetailCoastAbort(control);
    const sign = signAt(bx, by), dependencies = [sign];
    if (bx > 0) dependencies.push(signAt(bx - 1, by));
    if (by > 0) dependencies.push(signAt(bx, by - 1));
    if (bx > 0 && by > 0) dependencies.push(signAt(bx - 1, by - 1));
    if (sign !== 0 && dependencies.every((value) => value === sign)) {
      uniformFineCells += 1024;
      if (sign > 0) landAreaTwiceQ2 += CELL_AREA_TWICE * 1024; else seaAreaTwiceQ2 += CELL_AREA_TWICE * 1024;
    } else {
      const sample = memoSampler((x, y) => ({ xQ: x * 512, yQ: y * 512, coverageQ: sampleDetailCoastCoverage(owned, x, y), heightMeters: 0 }));
      for (let row = by * 32; row < (by + 1) * 32; row++) {
        for (let column = bx * 32; column < (bx + 1) * 32; column++) { const cell = buildCell(sample, column, row, false); landAreaTwiceQ2 += cell.landAreaTwiceQ2; seaAreaTwiceQ2 += cell.seaAreaTwiceQ2; processedFineCells++; }
        if ((row + 1) % 8 === 0) await yieldDetailCoast(control);
      }
    }
    completed++; if (completed % 64 === 0) { control?.onProgress?.(completed, 4096); await yieldDetailCoast(control); }
  }
  if (landAreaTwiceQ2 + seaAreaTwiceQ2 !== WORLD_AREA_TWICE) throw new Error('细海岸全世界面积不守恒。');
  checkDetailCoastAbort(control); control?.onProgress?.(4096, 4096);
  return { landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2: WORLD_AREA_TWICE, explicitTiles: owned.size, sampledTiles, processedFineCells, uniformFineCells };
}
/** Conservatively protects every fine cell touching a convex old Q8 quad.
 * The extra protected strip is one fine cell: 2 world units along each axis,
 * and at most 2√2 world units in Euclidean distance along a skew edge.
 * This is a lock/scope cover, not a claim of exact coarse-quad land area. */
export function detailCellsIntersectingQuad(quad: readonly DetailCoastPointQ[]): Uint32Array {
  if (quad.length !== 4 || !quad.every((p) => Number.isSafeInteger(p.xQ) && Number.isSafeInteger(p.yQ) && p.xQ >= 0 && p.yQ >= 0 && p.xQ <= 4096 * 256 && p.yQ <= 4096 * 256) || quad.some((p, index) => cross(p, quad[(index + 1) % 4], quad[(index + 2) % 4]) <= 0)) throw new Error('细海岸锁需要有效凸 Q8 地块。');
  const left = Math.max(0, Math.ceil(Math.min(...quad.map((p) => p.xQ)) / 512) - 1), top = Math.max(0, Math.ceil(Math.min(...quad.map((p) => p.yQ)) / 512) - 1);
  const right = Math.min(2047, Math.floor(Math.max(...quad.map((p) => p.xQ)) / 512)), bottom = Math.min(2047, Math.floor(Math.max(...quad.map((p) => p.yQ)) / 512));
  if ((right - left + 1) * (bottom - top + 1) > 4096) throw new Error('细海岸锁覆盖超过单地块限额。');
  const result: number[] = [];
  for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
    const rect = [{ xQ: column * 512, yQ: row * 512 }, { xQ: (column + 1) * 512, yQ: row * 512 }, { xQ: (column + 1) * 512, yQ: (row + 1) * 512 }, { xQ: column * 512, yQ: (row + 1) * 512 }];
    // x/y axes are already tested by the candidate AABB. The four quad edge
    // normals complete the separating-axis test; touching counts as protected.
    if (!quad.some((a, index) => rect.every((point) => cross(a, quad[(index + 1) % 4], point) < 0))) result.push(row * 2048 + column);
  }
  return Uint32Array.from(result);
}
