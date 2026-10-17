import { describe, expect, it } from 'vitest';
import { createFmsOriginalDocument, originalGridFor } from './original-document';
import { originalPortCities } from './original-ports';

describe('original port cities', () => {
  it('marks only ocean-side cities with one adjacent water cell, never lakes or inland', async () => {
    const doc = await createFmsOriginalDocument('20k'), grid = (await originalGridFor(doc))!;
    // A large temperate island with an inland lake around (800, 450).
    doc.elevations = Int32Array.from(doc.points, ([x, y]) => {
      const d = Math.hypot((x - 800) / 2.6, (y - 450) / 1.6);
      if (Math.hypot(x - 800, y - 450) < 22) return 5;
      return Math.max(0, Math.round(70 - d * .5));
    });
    const h = doc.elevations, water = (c: number) => grid.neighbors[c].filter(j => h[j] < 20);
    const lakeSide = (c: number) => water(c).some(j => Math.hypot(grid.points[j][0] - 800, grid.points[j][1] - 450) < 22);
    const coastal = [...h.keys()].find(c => h[c] >= 20 && water(c).length === 1 && !lakeSide(c) && Math.abs(grid.points[c][1] - 450) < 60)!;
    const inland = [...h.keys()].find(c => h[c] >= 40 && water(c).length === 0)!;
    const lake = [...h.keys()].find(c => h[c] >= 20 && lakeSide(c) && water(c).length === 1)!;
    const at = (id: string, c: number) => ({ id, position: { x: grid.points[c][0] * 2, y: grid.points[c][1] * 2 }, capital: false });
    const ports = originalPortCities(grid, doc, [at('coast', coastal), at('inland', inland), at('lake', lake)], 2);
    expect([...ports]).toEqual(['coast']);
  });
});
