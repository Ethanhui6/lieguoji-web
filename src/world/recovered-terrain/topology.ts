import { Delaunay } from 'd3-delaunay';
import { yieldAtlas, type AtlasControl } from '../model';
import type { RecoveredGraph } from './engine';

export const TOPOLOGY_SEED = 0x51f15e3d;
export interface TerrainTopology extends RecoveredGraph { triangles: Uint32Array }
export type InternalTerrainLayout = 'square-v1' | 'classic-v1';
/** Both layouts retain the audited research worker's point/RNG/neighbor order.
 * classic-v1 is an internal compatibility test path, never a UI request. */
export async function createTerrainTopology(layout: InternalTerrainLayout, control?: AtlasControl): Promise<TerrainTopology> {
  if (layout !== 'square-v1' && layout !== 'classic-v1') throw new Error('地形点网版本无效。');
  control?.signal?.throwIfAborted();
  const cellsX = 192, cellsY = layout === 'square-v1' ? 192 : 128, width = 1536, height = layout === 'square-v1' ? 1536 : 1024;
  let state = TOPOLOGY_SEED;
  const random = () => {
    state += 0x6d2b79f5; let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const points: [number, number][] = [], jitter = 0.42;
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      // Boundary sites still consume two draws before their offsets are zeroed.
      const dx = (random() * 2 - 1) * jitter, dy = (random() * 2 - 1) * jitter;
      points.push([(x + (x === 0 || x === cellsX - 1 ? 0 : dx)) * width / (cellsX - 1),
        (y + (y === 0 || y === cellsY - 1 ? 0 : dy)) * height / (cellsY - 1)]);
    }
    if (y % 8 === 7) await yieldAtlas(control, '建立种子地形点网', y + 1, cellsY);
  }
  await yieldAtlas(control, '连接种子地形三角网', 0, points.length);
  const delaunay = Delaunay.from(points), triangles = Uint32Array.from(delaunay.triangles);
  await yieldAtlas(control, '连接种子地形三角网', points.length, points.length);
  const neighbors: number[][] = [];
  for (let id = 0; id < points.length; id++) {
    neighbors.push([...delaunay.neighbors(id)]);
    if (id % 2048 === 0) await yieldAtlas(control, '核验种子地形邻接', id, points.length);
  }
  return { cellsX, cellsY, width, height, points, triangles, neighbors };
}
