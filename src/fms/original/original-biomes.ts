import { FMS_CLIMATE_DEFAULTS, generateFmsClimateGrid, recoveredBiome } from '../climate';
import { deriveFmsClimateRivers, recoveredRiverMoisture, type FmsClimateRivers } from '../climate-rivers';
import { srgbToLinear } from '../height-palette';
import type { FmsDocument } from '../model';
import type { OriginalGrid } from './original-grid';

/** Biomes..cctor 0x363F20: the Unity color table the map actually uses
 * (it differs from the embedded main.mjs palette). Gamma-space values. */
export const ORIGINAL_BIOME_COLORS: readonly (readonly [number, number, number])[] = [
  [60, 130, 210], [255, 204, 0], [255, 230, 140], [230, 220, 110], [170, 230, 100], [150, 230, 70], [30, 200, 80],
  [80, 220, 30], [50, 190, 70], [90, 140, 60], [180, 160, 100], [220, 240, 255], [20, 180, 70],
].map(c => c.map(v => Math.fround(v / 255)) as [number, number, number]);

export interface OriginalClimate { precipitation: Uint8Array; temperature: Int8Array; rivers: FmsClimateRivers }

/** Grid climate and main.mjs Rivers.generate on the original grid's own
 * row-major cells (Voronoi neighbors, no triangle-mesh ribbon). */
export function originalClimate(grid: OriginalGrid, doc: FmsDocument, rainfall = FMS_CLIMATE_DEFAULTS.precipitation): OriginalClimate {
  const heights = Uint8Array.from(doc.elevations, h => Math.min(100, Math.max(0, h)));
  const { precipitation, temperature } = generateFmsClimateGrid(heights, grid.cellsX, grid.cellsY, { ...FMS_CLIMATE_DEFAULTS, precipitation: rainfall });
  return { precipitation, temperature, rivers: deriveFmsClimateRivers({ ...doc, neighbors: grid.neighbors }, precipitation, false) };
}

/** main.mjs Biomes.define with the recovered matrix and river moisture. */
export function originalBiomeIds(grid: OriginalGrid, doc: FmsDocument, climate: OriginalClimate): Uint8Array {
  return Uint8Array.from(doc.elevations, (h, cell) => recoveredBiome(
    recoveredRiverMoisture(cell, doc.elevations, grid.neighbors, climate.precipitation, climate.rivers),
    climate.temperature[cell], h, Boolean(climate.rivers.riverIds[cell])));
}

/** World.GetDrawProvinceMeshVertices 0x6B55B0, biome branch: the cell's
 * linear biome color x10 plus every neighbor whose biome is not 0/-1, divided
 * by the count. (Its height check reads the cell itself, so water neighbors
 * are excluded only by their Marine biome.) A land cell without a biome uses
 * colors[3] unconverted. Returns linear RGB per cell. */
export function originalBiomeLinear(grid: OriginalGrid, ids: Uint8Array): Float32Array {
  const f = Math.fround, linear = ORIGINAL_BIOME_COLORS.map(c => c.map(v => f(srgbToLinear(v))));
  const out = new Float32Array(ids.length * 3);
  for (let cell = 0; cell < ids.length; cell++) {
    const id = ids[cell];
    if (!id) { out.set(ORIGINAL_BIOME_COLORS[3], cell * 3); continue; }
    let r = f(linear[id][0] * 10), g = f(linear[id][1] * 10), b = f(linear[id][2] * 10), n = 10;
    for (const j of grid.neighbors[cell]) { const k = ids[j]; if (!k) continue; r = f(r + linear[k][0]); g = f(g + linear[k][1]); b = f(b + linear[k][2]); n++; }
    out[cell * 3] = f(r / n); out[cell * 3 + 1] = f(g / n); out[cell * 3 + 2] = f(b / n);
  }
  return out;
}
