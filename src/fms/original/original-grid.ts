import { Delaunay } from 'd3-delaunay';
import type { FmsCoastSegment } from '../ocean-coast';

/** The original's built-in blank maps (StreamingAssets/BasicMap/1, 2, 4.save).
 * Each is an Azgaar-style jittered grid over 1600x900 map units, row-major,
 * spacing = round(sqrt(1600*900/desired), 2); verified for every site. */
export const ORIGINAL_MAP_WIDTH = 1600, ORIGINAL_MAP_HEIGHT = 900;
export const ORIGINAL_GRIDS = {
  '20k': { desired: 20000, load: () => import('./grids/grid-20k') },
  '30k': { desired: 30000, load: () => import('./grids/grid-30k') },
  '40k': { desired: 40000, load: () => import('./grids/grid-40k') },
} as const;
export type OriginalGridId = keyof typeof ORIGINAL_GRIDS;

export interface OriginalGrid {
  id: OriginalGridId; width: number; height: number; cellsX: number; cellsY: number; spacing: number;
  points: [number, number][]; neighbors: number[][];
  /** Voronoi cell polygons clipped to the map rectangle, flat x,y pairs. */
  polygons: Float64Array[];
  /** Shared Voronoi edges: cell a, cell b and the segment between them. */
  edges: { a: number; b: number; segment: FmsCoastSegment }[];
}

export function originalGridShape(desired: number) {
  const spacing = Math.round(Math.sqrt(ORIGINAL_MAP_WIDTH * ORIGINAL_MAP_HEIGHT / desired) * 100) / 100;
  return { spacing, cellsX: Math.floor((ORIGINAL_MAP_WIDTH + spacing / 2 - 1e-10) / spacing), cellsY: Math.floor((ORIGINAL_MAP_HEIGHT + spacing / 2 - 1e-10) / spacing) };
}

export function decodeOriginalSites(base64: string): [number, number][] {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), values = new Float32Array(bytes.buffer);
  const points: [number, number][] = [];
  for (let i = 0; i < values.length; i += 2) points.push([values[i], values[i + 1]]);
  return points;
}

export function buildOriginalGrid(id: OriginalGridId, points: [number, number][]): OriginalGrid {
  const { spacing, cellsX, cellsY } = originalGridShape(ORIGINAL_GRIDS[id].desired);
  if (cellsX * cellsY !== points.length) throw new Error('原作格网点数与布局不一致。');
  const delaunay = Delaunay.from(points), voronoi = delaunay.voronoi([0, 0, ORIGINAL_MAP_WIDTH, ORIGINAL_MAP_HEIGHT]);
  const polygons: Float64Array[] = [];
  const owners = new Map<string, { cell: number; segment: FmsCoastSegment }>(), edges: OriginalGrid['edges'] = [];
  for (let cell = 0; cell < points.length; cell++) {
    const ring = voronoi.cellPolygon(cell) ?? [];
    // d3 closes the ring by repeating its first vertex.
    const flat = new Float64Array(Math.max(0, ring.length - 1) * 2);
    for (let i = 0; i < ring.length - 1; i++) { flat[i * 2] = ring[i][0]; flat[i * 2 + 1] = ring[i][1]; }
    polygons.push(flat);
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[i + 1], ka = `${ax},${ay}`, kb = `${bx},${by}`, key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const other = owners.get(key);
      if (other) { edges.push({ a: other.cell, b: cell, segment: other.segment }); owners.delete(key); }
      else owners.set(key, { cell, segment: [ax, ay, bx, by] });
    }
  }
  // Neighbors share a visible clipped edge; raw Delaunay hull fans along the
  // map border would otherwise join distant boundary cells.
  const neighbors: number[][] = points.map(() => []);
  for (const { a, b } of edges) { neighbors[a].push(b); neighbors[b].push(a); }
  return { id, width: ORIGINAL_MAP_WIDTH, height: ORIGINAL_MAP_HEIGHT, cellsX, cellsY, spacing, points, neighbors, polygons, edges };
}

export async function loadOriginalGrid(id: OriginalGridId): Promise<OriginalGrid> {
  const module = await ORIGINAL_GRIDS[id].load();
  return buildOriginalGrid(id, decodeOriginalSites(module.sites));
}

/** BorderDataProcessor.IsCoastLineEdge: exactly one side below sea level. */
export function originalCoastEdges(grid: OriginalGrid, heights: ArrayLike<number>, seaLevel = 20): FmsCoastSegment[] {
  return grid.edges.filter(({ a, b }) => (heights[a] < seaLevel) !== (heights[b] < seaLevel)).map(edge => edge.segment);
}
