import { describe, expect, it } from 'vitest';
import { srgbToLinear } from '../height-palette';
import { createFmsOriginalDocument, originalGridFor } from './original-document';
import { ORIGINAL_BIOME_COLORS, originalBiomeIds, originalBiomeLinear, originalClimate } from './original-biomes';
import type { OriginalGrid } from './original-grid';

describe('original biome colors (Shader189 mode 0)', () => {
  it('uses the Unity Biomes.colors table, not the main.mjs palette', () => {
    expect(ORIGINAL_BIOME_COLORS).toHaveLength(13);
    expect(ORIGINAL_BIOME_COLORS[0].map(v => Math.round(v * 255))).toEqual([60, 130, 210]);
    expect(ORIGINAL_BIOME_COLORS[1].map(v => Math.round(v * 255))).toEqual([255, 204, 0]);
    expect(ORIGINAL_BIOME_COLORS[12].map(v => Math.round(v * 255))).toEqual([20, 180, 70]);
  });

  it('weights the cell x10 against non-marine neighbors, in linear space', () => {
    // Cell 0 (grassland) with neighbors 1 (glacier) and 2 (marine).
    const grid = { neighbors: [[1, 2], [0], [0]] } as unknown as OriginalGrid;
    const out = originalBiomeLinear(grid, Uint8Array.from([4, 11, 0]));
    const lin = (id: number, k: number) => srgbToLinear(ORIGINAL_BIOME_COLORS[id][k]);
    for (let k = 0; k < 3; k++) expect(out[k]).toBeCloseTo((lin(4, k) * 10 + lin(11, k)) / 11, 5);
    // A cell without a biome keeps colors[3] unconverted (original quirk).
    expect(Array.from(out.subarray(6, 9))).toEqual(ORIGINAL_BIOME_COLORS[3].map(Math.fround));
  });

  it('assigns land biomes from the grid climate on the original grid', async () => {
    const doc = await createFmsOriginalDocument('20k'), grid = (await originalGridFor(doc))!;
    doc.elevations = Int32Array.from(doc.points, ([x, y]) => Math.max(0, Math.round(90 - Math.hypot((x - 800) / 3.2, (y - 450) / 2.2) * .9)));
    const ids = originalBiomeIds(grid, doc, originalClimate(grid, doc));
    let land = 0;
    for (let cell = 0; cell < ids.length; cell++) {
      if (doc.elevations[cell] < 20) expect(ids[cell]).toBe(0);
      else { land++; expect(ids[cell]).toBeGreaterThan(0); expect(ids[cell]).toBeLessThan(13); }
    }
    expect(land).toBeGreaterThan(1000);
    expect(new Set(Array.from(ids).filter(Boolean)).size).toBeGreaterThan(1);
  });
});
