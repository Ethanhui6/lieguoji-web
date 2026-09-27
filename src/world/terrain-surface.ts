import { getCellLayerSlot, validateSpec, type AtlasGeographyView } from './model';
import { cellNeighbors, cellVertexIds, getVertexPositionQ, incidentCellIds } from './topology';

/** Display-only, world-coordinate triangles. These buffers own their memory;
 * they are never written into authoritative geometry, elevations or saves. */
export interface TerrainSurfaceMesh {
  positions: Float32Array;
  heights: Float32Array;
  lights: Float32Array;
  indices: Uint32Array;
}
export interface TerrainSurface { land: TerrainSurfaceMesh; sea: TerrainSurfaceMesh }
interface Point { x: number; y: number }
interface CellSample extends Point { height: number; corners: number[]; light?: number }
interface CornerSample extends Point { height: number; light: number }
interface MeshBuilder { positions: number[]; heights: number[]; lights: number[]; indices: number[]; corners: Map<number, number> }
const builder = (): MeshBuilder => ({ positions: [], heights: [], lights: [], indices: [], corners: new Map() });
const finish = (mesh: MeshBuilder): TerrainSurfaceMesh => ({ positions: new Float32Array(mesh.positions), heights: new Float32Array(mesh.heights), lights: new Float32Array(mesh.lights), indices: new Uint32Array(mesh.indices) });
const boundedLight = (light: number) => Math.max(.87, Math.min(1.13, light));

/** Reconstruct a continuous display field inside real shared quads. Each
 * original cell height remains an exact sample at its actual area centroid.
 * The four fans use real shared corners, with one inverse-distance value per
 * (vertex, sea/land class). Across a coastline only positions are shared.
 *
 * Work and memory are proportional to the explicitly requested cells and their
 * incident/one-neighbour halo. No manifest/block scan, whole-world allocation,
 * random noise, global cache, source mutation or persisted derived field. */
export function buildTerrainSurface(data: AtlasGeographyView, cellIds: readonly number[] | Uint32Array): TerrainSurface {
  const spec = data.manifest.spec;
  if (!validateSpec(spec)) throw new Error('连续地表需要有效的权威地理规格。');
  const ids = Array.from(cellIds), unique = new Set<number>();
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id < 0 || id >= spec.columns * spec.rows || unique.has(id)) throw new Error('连续地表需要不重复且有效的可见地块。');
    unique.add(id);
  }
  const heights = new Map<number, number>(), vertices = new Map<number, Point>(), cells = new Map<number, CellSample>();
  const corners = { land: new Map<number, CornerSample>(), sea: new Map<number, CornerSample>() }, land = builder(), sea = builder();
  function heightAt(id: number) {
    const existing = heights.get(id); if (existing !== undefined) return existing;
    const { block, slot } = getCellLayerSlot(data, 'elevation', id), height = block.values[slot];
    if (block.layer !== 'elevation' || !Number.isSafeInteger(height) || height < -12000 || height > 12000) throw new Error('连续地表缺少有效的真实高程。');
    heights.set(id, height); return height;
  }
  function vertexAt(id: number) {
    const existing = vertices.get(id); if (existing) return existing;
    const point = getVertexPositionQ(data, id);
    if (!Number.isSafeInteger(point.xQ) || !Number.isSafeInteger(point.yQ)) throw new Error('连续地表缺少真实定点共享坐标。');
    const result = { x: point.xQ / spec.coordinateScale, y: point.yQ / spec.coordinateScale }; vertices.set(id, result); return result;
  }
  function cellAt(id: number): CellSample {
    const existing = cells.get(id); if (existing) return existing;
    const sorted = cellVertexIds(spec, id), corners = [sorted[0], sorted[1], sorted[3], sorted[2]], points = corners.map(vertexAt), origin = points[0];
    let area = 0, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) throw new Error('连续地表拒绝退化或非凸的真实地块。');
      const ax = a.x - origin.x, ay = a.y - origin.y, bx = b.x - origin.x, by = b.y - origin.y, cross = ax * by - ay * bx;
      area += cross; nx += (ax + bx) * cross; ny += (ay + by) * cross;
    }
    if (!(area > 0) || !Number.isFinite(nx + ny + area)) throw new Error('连续地表实际面积重心无效。');
    const sample: CellSample = { x: origin.x + nx / (3 * area), y: origin.y + ny / (3 * area), height: heightAt(id), corners };
    cells.set(id, sample); return sample;
  }
  function lightAt(id: number): number {
    const cell = cellAt(id); if (cell.light !== undefined) return cell.light;
    let xx = 0, xy = 0, yy = 0, xh = 0, yh = 0;
    for (const neighbor of cellNeighbors(spec, id)) {
      if ((heightAt(neighbor) >= 0) !== (cell.height >= 0)) continue;
      const sample = cellAt(neighbor), dx = sample.x - cell.x, dy = sample.y - cell.y, dh = sample.height - cell.height, distance2 = dx * dx + dy * dy;
      if (!(distance2 > 0)) throw new Error('连续地表相邻真实重心重合。');
      const weight = 1 / distance2;
      xx += dx * dx * weight; xy += dx * dy * weight; yy += dy * dy * weight; xh += dx * dh * weight; yh += dy * dh * weight;
    }
    // A distance-weighted local plane follows actual centroid positions. The
    // rank-one solution also supports an isolated coast strip/world corner;
    // a single isolated cell is flat. Opposite-class heights never enter it.
    const determinant = xx * yy - xy * xy, trace = xx + yy;
    const gx = determinant > 1e-10 ? (xh * yy - yh * xy) / determinant : trace ? xh / trace : 0;
    const gy = determinant > 1e-10 ? (yh * xx - xh * xy) / determinant : trace ? yh / trace : 0;
    cell.light = boundedLight(1 + .13 * Math.atan((gx + gy) / 8) / (Math.PI / 2)); return cell.light;
  }
  function cornerAt(id: number, isLand: boolean) {
    const cache = isLand ? corners.land : corners.sea, existing = cache.get(id); if (existing) return existing;
    const point = vertexAt(id); let weightSum = 0, weightedHeight = 0, weightedLight = 0;
    // The topology helper yields a fixed row/column order. Therefore separate
    // display cores reconstruct exactly the same Float32 endpoint values.
    for (const incident of incidentCellIds(spec, id)) {
      if ((heightAt(incident) >= 0) !== isLand) continue;
      const cell = cellAt(incident), distance = Math.hypot(cell.x - point.x, cell.y - point.y);
      if (!(distance > 0)) throw new Error('连续地表角点与真实面积重心重合。');
      const weight = 1 / distance; weightSum += weight; weightedHeight += cell.height * weight; weightedLight += lightAt(incident) * weight;
    }
    if (!(weightSum > 0)) throw new Error('连续地表角点缺少同海陆类别的真实样本。');
    const sample: CornerSample = { ...point, height: weightedHeight / weightSum, light: boundedLight(weightedLight / weightSum) }; cache.set(id, sample); return sample;
  }
  function append(mesh: MeshBuilder, sample: CornerSample) {
    const index = mesh.heights.length; mesh.positions.push(sample.x, sample.y); mesh.heights.push(sample.height); mesh.lights.push(sample.light); return index;
  }
  for (const id of ids) {
    const cell = cellAt(id), isLand = cell.height >= 0, mesh = isLand ? land : sea;
    const center = append(mesh, { ...cell, light: lightAt(id) }), quad: number[] = [];
    for (const vertex of cell.corners) {
      let index = mesh.corners.get(vertex);
      if (index === undefined) { index = append(mesh, cornerAt(vertex, isLand)); mesh.corners.set(vertex, index); }
      quad.push(index);
    }
    for (let side = 0; side < 4; side++) mesh.indices.push(center, quad[side], quad[(side + 1) % 4]);
  }
  return { land: finish(land), sea: finish(sea) };
}
