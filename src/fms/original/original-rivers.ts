import { Geometry, GlProgram, Mesh, Shader } from 'pixi.js';
import { originalClimate, type OriginalClimate } from './original-biomes';
import { recoveredRiverControls, recoveredRiverThickness } from '../river-shape';
import type { FmsDocument, FmsPoint } from '../model';
import type { OriginalGrid } from './original-grid';

/** Rivers on the original grid, the way the original builds and draws them:
 * - climate and Rivers.generate (installed main.mjs) run on the grid cells
 *   themselves, which are row-major cellsX x cellsY like Azgaar's grid;
 * - getRiverPoints: land cells at their site, the sea mouth at
 *   World.GetSharedEdgeMid (the shared Voronoi edge's middle), an off-map
 *   end at getBorderPoint; addMeandering then adds the midpoints;
 * - StateLineRenderer.BuildRiverPath 0x4E5840 joins them with cubic curves,
 *   CalculateInterpolationPoints 0x4E5FF0 = clamp(Math.Round(length + 6),
 *   6, 12) on world-space segment length;
 * - DrawSingleRiver 0x4E97B0 instantiates Prefab/TradeLine (Shapes Polyline,
 *   thickness 0.125 world units, Meters, opaque, round joins) and sets point
 *   i of N to (0.7 + i * 0.7 / N) * 1.5 times that, in World.riverColor. */
export const ORIGINAL_RIVERS = 'recovered-original-grid-rivers-v1';
const WORLD_PER_MAP = 240 / 1600;
export const ORIGINAL_RIVER_BASE_WIDTH = Math.fround(.125) / WORLD_PER_MAP;
/** level0 World#44231 riverColor, serialized at the first field. */
export const ORIGINAL_RIVER_COLOR = [0.030526895076036453, 0.8741216659545898, 0.9245283007621765] as const;

/** .NET Math.Round(double): ties go to the even integer. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value), diff = value - floor;
  if (diff > .5) return floor + 1;
  if (diff < .5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}
export function originalRiverInterpolation(mapLength: number): number {
  return Math.min(12, Math.max(6, roundHalfEven(mapLength * WORLD_PER_MAP + 6)));
}

export interface OriginalRiverData { paths: number[][]; flux: Uint16Array; precipitation: Uint8Array }

/** generateFmsClimateGrid + deriveFmsClimateRivers on the grid's own cells. */
export function originalRivers(grid: OriginalGrid, doc: FmsDocument, climate: OriginalClimate = originalClimate(grid, doc)): OriginalRiverData {
  return { paths: climate.rivers.paths, flux: climate.rivers.flux, precipitation: climate.precipitation };
}

/** World.GetSharedEdgeMid for every adjacent cell pair. */
export function originalSharedEdgeMids(grid: OriginalGrid): Map<string, FmsPoint> {
  const mids = new Map<string, FmsPoint>();
  for (const { a, b, segment } of grid.edges) mids.set(a < b ? `${a}:${b}` : `${b}:${a}`, [(segment[0] + segment[2]) / 2, (segment[1] + segment[3]) / 2]);
  return mids;
}

/** getRiverPoints + addMeandering (installed main.mjs 3230–3304). */
export function originalRiverPoints(grid: OriginalGrid, heights: ArrayLike<number>, cells: readonly number[], mids = originalSharedEdgeMids(grid)): FmsPoint[] {
  const border = (cell: number): FmsPoint => {
    const [x, y] = grid.points[cell], min = Math.min(y, grid.height - y, x, grid.width - x);
    if (min === y) return [x, 0];
    if (min === grid.height - y) return [x, grid.height];
    if (min === x) return [0, y];
    return [grid.width, y];
  };
  const points = cells.map((cell, i): FmsPoint => {
    if (cell === -1) return border(cells[i - 1]);
    if (heights[cell] < 20 && i > 0) { const prev = cells[i - 1]; return mids.get(cell < prev ? `${cell}:${prev}` : `${prev}:${cell}`) ?? [...grid.points[cell]]; }
    return [...grid.points[cell]];
  });
  const meandered: FmsPoint[] = [], last = cells.length - 1;
  for (let i = 0, step = heights[cells[0]] < 20 ? 1 : 10; i <= last; i++, step++) {
    const [x1, y1] = points[i];
    meandered.push([x1, y1]);
    if (i === last) break;
    const [x2, y2] = points[i + 1];
    if (cells[i + 1] === -1) { meandered.push([x2, y2]); break; }
    const dist2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (dist2 <= 25 && cells.length >= 6) continue;
    const meander = .5 + 1 / step + Math.max(.5 - step / 100, 0), angle = Math.atan2(y2 - y1, x2 - x1);
    const sin = Math.sin(angle) * meander, cos = Math.cos(angle) * meander;
    if (step < 10 && (dist2 > 64 || (dist2 > 36 && cells.length < 5))) {
      meandered.push([(x1 * 2 + x2) / 3 - sin, (y1 * 2 + y2) / 3 + cos], [(x1 + x2 * 2) / 3 + sin / 2, (y1 + y2 * 2) / 3 - cos / 2]);
    } else if (dist2 > 25 || cells.length < 6) {
      meandered.push([(x1 + x2) / 2 - sin, (y1 + y2) / 2 + cos]);
    }
  }
  return meandered;
}

/** BuildRiverPath: cubic segments with the recovered tangent handles. */
export function originalRiverPath(points: readonly FmsPoint[]): FmsPoint[] {
  if (points.length < 2) return [...points];
  const path: FmsPoint[] = [[...points[0]]];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], [c, d] = recoveredRiverControls(points, i);
    const count = originalRiverInterpolation(Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let k = 1; k <= count; k++) {
      const t = k / count, s = 1 - t;
      path.push(k === count ? [...b] : [0, 1].map(j => s * s * s * a[j] + 3 * s * s * t * c[j] + 3 * s * t * t * d[j] + t * t * t * b[j]) as FmsPoint);
    }
  }
  return path;
}

/** Ribbon triangles with DrawSingleRiver's per-point taper, in map units. */
export function originalRiverRibbon(path: readonly FmsPoint[], out: number[]): void {
  const n = path.length; if (n < 2) return;
  const left: FmsPoint[] = [], right: FmsPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = recoveredRiverThickness(i, n) * ORIGINAL_RIVER_BASE_WIDTH / 2, nx = d ? -(b[1] - a[1]) / d * r : 0, ny = d ? (b[0] - a[0]) / d * r : 0;
    left.push([path[i][0] + nx, path[i][1] + ny]); right.push([path[i][0] - nx, path[i][1] - ny]);
  }
  for (let i = 0; i + 1 < n; i++) out.push(...left[i], ...right[i], ...left[i + 1], ...right[i], ...right[i + 1], ...left[i + 1]);
}

export interface OriginalRiverGeometry { positions: Float32Array; stats: { algorithm: string; rivers: number; points: number; triangles: number } }

export function originalRiverGeometry(grid: OriginalGrid, doc: FmsDocument, climate?: OriginalClimate): OriginalRiverGeometry {
  const { paths } = originalRivers(grid, doc, climate), mids = originalSharedEdgeMids(grid), out: number[] = [];
  let points = 0;
  for (const cells of paths) { const path = originalRiverPath(originalRiverPoints(grid, doc.elevations, cells, mids)); points += path.length; originalRiverRibbon(path, out); }
  const positions = Float32Array.from(out);
  return { positions, stats: { algorithm: ORIGINAL_RIVERS, rivers: paths.length, points, triangles: positions.length / 6 } };
}

const vertex = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main(){vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
out vec4 finalColor;
void main(){finalColor=vec4(${ORIGINAL_RIVER_COLOR.map(c => c.toFixed(6)).join(',')},1.0);}`;

/** One opaque mesh: overlapping ribbons at confluences do not darken. */
export function originalRiverMesh(geometry: OriginalRiverGeometry): Mesh<Geometry, Shader> {
  return new Mesh({
    geometry: new Geometry({ attributes: { aPosition: { buffer: geometry.positions, format: 'float32x2' } } }),
    shader: new Shader({ glProgram: GlProgram.from({ vertex, fragment, name: 'original-rivers' }) }),
  });
}
