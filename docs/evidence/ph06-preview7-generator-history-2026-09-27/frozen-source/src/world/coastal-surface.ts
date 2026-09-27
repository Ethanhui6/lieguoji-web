import { getCellLayerSlot, validateSpec, type AtlasGeographyView } from './model';
import { cellVertexIds, getVertexPositionQ, incidentCellIds, type AtlasPoint } from './topology';

/** Stored source coordinates are Q8. Linear zero intersections additionally
 * need halves and thirds; Q8 * 6 represents all of them exactly, without moving
 * a clipped point off its original triangle edge. This is fixed by kind v1. */
export const COASTAL_COORDINATE_SCALE = 1536;
export interface CoastalVertex {
  xQ6: number; yQ6: number; coverageQ: number; heightMeters: number;
  anchor: { kind: 'center' | 'corner' | 'shore'; id: number };
}
export type CoastalTriangle = [CoastalVertex, CoastalVertex, CoastalVertex];
export interface CoastalSegment { a: CoastalVertex; b: CoastalVertex; ownerCellId: number }
export interface CoastalCellSurface {
  cellId: number; land: CoastalTriangle[]; sea: CoastalTriangle[]; shore: CoastalSegment[];
  landAreaQ2: number; seaAreaQ2: number; totalAreaQ2: number;
  landAreaTwiceQ6: number; seaAreaTwiceQ6: number; totalAreaTwiceQ6: number;
}
export interface CoastalSurface { cells: CoastalCellSurface[]; landAreaQ2: number; seaAreaQ2: number; totalAreaQ2: number }
export interface CoastalPick { cellId: number; land: boolean; height: number }
type SourceCell = { center: CoastalVertex; corners: number[] };
type Position = Pick<CoastalVertex, 'xQ6' | 'yQ6'>;
const cross = (a: Position, b: Position, c: Position) => (b.xQ6 - a.xQ6) * (c.yQ6 - a.yQ6) - (b.yQ6 - a.yQ6) * (c.xQ6 - a.xQ6);
const samePoint = (a: Position, b: Position) => a.xQ6 === b.xQ6 && a.yQ6 === b.yQ6;
export function isCoastalSurface(data: AtlasGeographyView): boolean {
  const manifest = data.manifest as unknown as { version: number; surface?: { kind?: unknown; coordinateScale?: unknown } };
  return manifest.version === 3 && manifest.surface?.kind === 'land-mask-fan-v1' && manifest.surface.coordinateScale === 256;
}
function assertCoastalSurface(data: AtlasGeographyView) {
  if (!isCoastalSurface(data) || !validateSpec(data.manifest.spec)) throw new Error('细海岸需要第三版 land-mask-fan-v1 权威地表合同。');
}

/** Canonical ordering is independent of triangle winding / request order. */
function intersection(a: CoastalVertex, b: CoastalVertex): CoastalVertex {
  if (a.coverageQ === 0) return a;
  if (b.coverageQ === 0) return b;
  if ((a.coverageQ > 0) === (b.coverageQ > 0)) throw new Error('海岸交点需要相反覆盖值。');
  if (a.xQ6 > b.xQ6 || a.xQ6 === b.xQ6 && a.yQ6 > b.yQ6) [a, b] = [b, a];
  const denominator = a.coverageQ - b.coverageQ;
  const xQ6 = a.xQ6 + (b.xQ6 - a.xQ6) * a.coverageQ / denominator;
  const yQ6 = a.yQ6 + (b.yQ6 - a.yQ6) * a.coverageQ / denominator;
  if (!Number.isSafeInteger(xQ6) || !Number.isSafeInteger(yQ6)) throw new Error('固定覆盖场的精确海岸交点超出合同。');
  return { xQ6, yQ6, coverageQ: 0, heightMeters: 0, anchor: { kind: 'shore', id: -1 } };
}
function clip(triangle: CoastalTriangle, land: boolean): CoastalVertex[] {
  const result: CoastalVertex[] = [], inside = (point: CoastalVertex) => land ? point.coverageQ >= 0 : point.coverageQ <= 0;
  for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], aInside = inside(a), bInside = inside(b);
    if (aInside) result.push(a);
    if (aInside !== bInside) result.push(intersection(a, b));
  }
  return result.filter((point, index) => !samePoint(point, result[(index + result.length - 1) % result.length]));
}
function triangulate(points: CoastalVertex[]): CoastalTriangle[] {
  const triangles: CoastalTriangle[] = [];
  for (let i = 1; i + 1 < points.length; i++) {
    const triangle: CoastalTriangle = [points[0], points[i], points[i + 1]], area = cross(...triangle);
    if (!Number.isSafeInteger(area) || area < 0) throw new Error('海岸裁剪产生反向或非精确分片。');
    if (area > 0) triangles.push(triangle);
  }
  return triangles;
}

/** A bounded, source-owned reconstruction. No world scan, generated noise,
 * persisted derived arrays, mutable global cache, or view-dependent geometry.
 * Coverage depends only on stored elevation signs. Changing ocean depth or
 * mountain height without changing signs cannot move a single shore point. */
export function buildCoastalSurface(data: AtlasGeographyView, cellIds: readonly number[] | Uint32Array): CoastalSurface {
  assertCoastalSurface(data);
  const spec = data.manifest.spec, requested = Array.from(cellIds), unique = new Set<number>();
  for (const id of requested) {
    if (!Number.isSafeInteger(id) || id < 0 || id >= spec.columns * spec.rows || unique.has(id)) throw new Error('细海岸需要不重复且有效的地块。');
    unique.add(id);
  }
  const heights = new Map<number, number>(), cells = new Map<number, SourceCell>(), positions = new Map<number, Position>(), corners = new Map<number, CoastalVertex>();
  function heightAt(id: number) {
    const known = heights.get(id); if (known !== undefined) return known;
    const { block, slot } = getCellLayerSlot(data, 'elevation', id), value = block.values[slot];
    if (!Number.isSafeInteger(value) || value < -12000 || value > 12000) throw new Error('细海岸缺少有效高程样本。');
    heights.set(id, value); return value;
  }
  function positionAt(id: number): Position {
    const known = positions.get(id); if (known) return known;
    const point = getVertexPositionQ(data, id), result = { xQ6: point.xQ * 6, yQ6: point.yQ * 6 };
    if (!Number.isSafeInteger(result.xQ6) || !Number.isSafeInteger(result.yQ6)) throw new Error('细海岸需要有效定点共享坐标。');
    positions.set(id, result); return result;
  }
  function cellAt(id: number): SourceCell {
    const known = cells.get(id); if (known) return known;
    const ids = cellVertexIds(spec, id), corners = [ids[0], ids[1], ids[3], ids[2]], points = corners.map(positionAt), origin = points[0];
    let area = 0, nx = 0, ny = 0;
    // Work in source Q8 local coordinates: each product stays an exact safe
    // integer, even for cells near the far world edge.
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if (cross(a, b, c) <= 0) throw new Error('细海岸拒绝非凸或退化的源地块。');
      const ax = (a.xQ6 - origin.xQ6) / 6, ay = (a.yQ6 - origin.yQ6) / 6, bx = (b.xQ6 - origin.xQ6) / 6, by = (b.yQ6 - origin.yQ6) / 6;
      const weight = ax * by - bx * ay; area += weight; nx += (ax + bx) * weight; ny += (ay + by) * weight;
    }
    if (![area, nx, ny].every(Number.isSafeInteger) || area <= 0) throw new Error('细海岸重心超出定点面积范围。');
    const height = heightAt(id), center: CoastalVertex = { xQ6: origin.xQ6 + Math.round(nx / (3 * area)) * 6, yQ6: origin.yQ6 + Math.round(ny / (3 * area)) * 6,
      coverageQ: height >= 0 ? 256 : -256, heightMeters: height, anchor: { kind: 'center', id } };
    for (let i = 0; i < 4; i++) if (cross(center, points[i], points[(i + 1) % 4]) <= 0) throw new Error('定点面积重心未处于源地块内部。');
    const result = { center, corners }; cells.set(id, result); return result;
  }
  function cornerAt(id: number): CoastalVertex {
    const known = corners.get(id); if (known) return known;
    const position = positionAt(id), incident = incidentCellIds(spec, id), coverageQ = incident.reduce((sum, cell) => sum + (heightAt(cell) >= 0 ? 256 : -256), 0) / incident.length;
    if (!Number.isSafeInteger(coverageQ)) throw new Error('共享覆盖值不属于固定四边形拓扑。');
    let heightMeters = 0;
    if (coverageQ !== 0) {
      let weightSum = 0, weighted = 0;
      for (const cell of incident) if ((heightAt(cell) >= 0) === (coverageQ > 0)) {
        const sample = cellAt(cell).center, distance = Math.hypot(sample.xQ6 - position.xQ6, sample.yQ6 - position.yQ6);
        if (!(distance > 0)) throw new Error('共享地表角点与地块重心重合。');
        const weight = 1 / distance; weightSum += weight; weighted += heightAt(cell) * weight;
      }
      if (!(weightSum > 0)) throw new Error('海陆角点缺少同类高程。');
      heightMeters = weighted / weightSum;
    }
    const result: CoastalVertex = { ...position, coverageQ, heightMeters, anchor: { kind: 'corner', id } }; corners.set(id, result); return result;
  }
  const result: CoastalSurface = { cells: [], landAreaQ2: 0, seaAreaQ2: 0, totalAreaQ2: 0 };
  for (const cellId of requested) {
    const source = cellAt(cellId), points = source.corners.map(cornerAt), land: CoastalTriangle[] = [], sea: CoastalTriangle[] = [], shore: CoastalSegment[] = [];
    let landAreaTwiceQ6 = 0, seaAreaTwiceQ6 = 0, totalAreaTwiceQ6 = 0;
    const col = cellId % spec.columns, row = Math.floor(cellId / spec.columns);
    const neighbors = [row > 0 ? cellId - spec.columns : -1, col + 1 < spec.columns ? cellId + 1 : -1, row + 1 < spec.rows ? cellId + spec.columns : -1, col > 0 ? cellId - 1 : -1];
    for (let side = 0; side < 4; side++) {
      const triangle: CoastalTriangle = [source.center, points[side], points[(side + 1) % 4]], area = cross(...triangle);
      const landPolygon = clip(triangle, true), seaPolygon = clip(triangle, false), landTriangles = triangulate(landPolygon), seaTriangles = triangulate(seaPolygon);
      const landArea = landTriangles.reduce((sum, value) => sum + cross(...value), 0), seaArea = seaTriangles.reduce((sum, value) => sum + cross(...value), 0);
      if (landArea + seaArea !== area) throw new Error('海岸分片未精确守恒源三角面积。');
      land.push(...landTriangles); sea.push(...seaTriangles); landAreaTwiceQ6 += landArea; seaAreaTwiceQ6 += seaArea; totalAreaTwiceQ6 += area;
      if (landArea && seaArea) {
        const zero = landPolygon.filter(point => point.coverageQ === 0);
        if (zero.length !== 2) throw new Error('细海岸零线不是唯一有效线段。');
        shore.push({ a: zero[0], b: zero[1], ownerCellId: cellId });
      } else if (points[side].coverageQ === 0 && points[(side + 1) % 4].coverageQ === 0 && neighbors[side] >= 0 && (heightAt(neighbors[side]) >= 0) !== (source.center.coverageQ > 0)) {
        // A zero shared edge is a shore only when its two open interiors have
        // opposite classes. Keep it on both cells for exact boundary picking;
        // render once through the deterministic owner, never along world edges.
        shore.push({ a: points[side], b: points[(side + 1) % 4], ownerCellId: Math.min(cellId, neighbors[side]) });
      }
    }
    const cell: CoastalCellSurface = { cellId, land, sea, shore, landAreaTwiceQ6, seaAreaTwiceQ6, totalAreaTwiceQ6,
      landAreaQ2: landAreaTwiceQ6 / 72, seaAreaQ2: seaAreaTwiceQ6 / 72, totalAreaQ2: totalAreaTwiceQ6 / 72 };
    result.cells.push(cell); result.landAreaQ2 += cell.landAreaQ2; result.seaAreaQ2 += cell.seaAreaQ2; result.totalAreaQ2 += cell.totalAreaQ2;
  }
  return result;
}
export function getCoastalCellSurface(data: AtlasGeographyView, cellId: number): CoastalCellSurface {
  return buildCoastalSurface(data, [cellId]).cells[0];
}
function contains(triangle: CoastalTriangle, point: Position) {
  return triangle.every((a, index) => {
    const b = triangle[(index + 1) % 3], p = (b.xQ6 - a.xQ6) * (point.yQ6 - a.yQ6), q = (b.yQ6 - a.yQ6) * (point.xQ6 - a.xQ6);
    return p - q >= -Number.EPSILON * 32 * (Math.abs(p) + Math.abs(q) + 1);
  });
}
function onSegment(a: Position, b: Position, point: Position) {
  const pa = (b.xQ6 - a.xQ6) * (point.yQ6 - a.yQ6), pb = (b.yQ6 - a.yQ6) * (point.xQ6 - a.xQ6);
  const coordinateTolerance = Number.EPSILON * 32 * (Math.abs(point.xQ6) + Math.abs(point.yQ6) + 1);
  return Math.abs(pa - pb) <= Number.EPSILON * 32 * (Math.abs(pa) + Math.abs(pb) + 1)
    && point.xQ6 >= Math.min(a.xQ6, b.xQ6) - coordinateTolerance && point.xQ6 <= Math.max(a.xQ6, b.xQ6) + coordinateTolerance
    && point.yQ6 >= Math.min(a.yQ6, b.yQ6) - coordinateTolerance && point.yQ6 <= Math.max(a.yQ6, b.yQ6) + coordinateTolerance;
}
/** The clipped fixed-point pieces are the authority, including the zero
 * boundary (land). The old broad-phase quad still chooses the candidate cell. */
export function pickCoastalSurface(data: AtlasGeographyView, cellId: number, point: AtlasPoint): CoastalPick | null {
  if (![point.x, point.y].every(Number.isFinite)) throw new Error('细海岸拾取坐标无效。');
  const cell = buildCoastalSurface(data, [cellId]).cells[0], p = { xQ6: point.x * COASTAL_COORDINATE_SCALE, yQ6: point.y * COASTAL_COORDINATE_SCALE };
  for (const segment of cell.shore) {
    if (onSegment(segment.a, segment.b, p)) return { cellId, land: true, height: 0 };
  }
  for (const [land, triangles] of [[true, cell.land], [false, cell.sea]] as const) for (const triangle of triangles) if (contains(triangle, p)) {
    if (!land) for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3];
      // The fixed tie rule also includes a zero-area junction. Such a point
      // never makes adjacent land regions connected over a positive-width edge.
      if (a.coverageQ === 0 && onSegment(a, b.coverageQ === 0 ? b : a, p)) return { cellId, land: true, height: 0 };
    }
    const [a, b, c] = triangle, area = cross(a, b, c), wa = cross(p, b, c) / area, wb = cross(p, c, a) / area, wc = 1 - wa - wb;
    const height = wa * a.heightMeters + wb * b.heightMeters + wc * c.heightMeters;
    return { cellId, land, height: land ? Math.max(0, height) : Math.min(0, height) };
  }
  return null;
}
