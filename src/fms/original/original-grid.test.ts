import { describe, expect, it } from 'vitest';
import { buildOriginalGrid, decodeOriginalSites, originalCoastEdges, originalGridShape } from './original-grid';
import { originalLandLinear, originalParchmentRect, originalSeaSrgb, ORIGINAL_PRESETS } from './original-style';
import { generateRecoveredHeights } from '../../world/recovered-terrain/engine';
import * as g20 from './grids/grid-20k';

describe('original BasicMap grid', () => {
  it('reproduces the jittered grid shape of every built-in density', () => {
    expect(originalGridShape(20000)).toEqual({ spacing: 8.49, cellsX: 188, cellsY: 106 });
    expect(originalGridShape(30000)).toMatchObject({ cellsX: 231, cellsY: 130 });
    expect(originalGridShape(40000)).toMatchObject({ cellsX: 267, cellsY: 150 });
  });

  it('decodes 19,928 row-major sites inside 1600x900 and builds a bounded Voronoi graph', () => {
    const points = decodeOriginalSites(g20.sites);
    expect(points).toHaveLength(g20.cells);
    points.forEach(([x, y], i) => {
      expect(Math.abs(x - (8.49 / 2 + (i % 188) * 8.49))).toBeLessThanOrEqual(8.49 * .45 + .01);
      expect(Math.abs(y - (8.49 / 2 + Math.floor(i / 188) * 8.49))).toBeLessThanOrEqual(8.49 * .45 + .01);
    });
    const grid = buildOriginalGrid('20k', points);
    expect(grid.polygons.every(p => p.length >= 6)).toBe(true);
    expect(grid.neighbors.every((n, i) => n.length > 0 && n.length <= 16 && !n.includes(i) && n.every(j => grid.neighbors[j].includes(i)))).toBe(true);
    // Shared edges equal the Euler count of the clipped planar map.
    expect(grid.edges.length).toBeGreaterThan(points.length * 2.9);
  });

  it('runs the recovered templates on the original grid and finds coast edges between land and sea', async () => {
    const grid = buildOriginalGrid('20k', decodeOriginalSites(g20.sites));
    const heights = await generateRecoveredHeights(grid, '1337', 'continents');
    const land = heights.filter(h => h >= 20).length;
    expect(land).toBeGreaterThan(1000); expect(land).toBeLessThan(heights.length - 1000);
    const coast = originalCoastEdges(grid, heights);
    expect(coast.length).toBeGreaterThan(100);
    const again = await generateRecoveredHeights(grid, '1337', 'continents');
    expect(again).toEqual(heights);
  });
});

describe('original display style', () => {
  it('keeps the eight serialized presets and the parchment quad', () => {
    expect(ORIGINAL_PRESETS).toHaveLength(8);
    expect(ORIGINAL_PRESETS[0]).toMatchObject({ shallowSea: 0x3c9cff, deepSea: 0x1487ff, coastLine: 0x5f5f5f, parchment: true, heightBackground: true });
    const r = originalParchmentRect();
    expect(r.width).toBeCloseTo(1662, 0); expect(r.height).toBeCloseTo(914.67, 1);
    expect(r.x + r.width / 2).toBeCloseTo(800, 6); expect(r.y + r.height / 2).toBeCloseTo(450, 6);
  });

  it('outputs the Shader189 mode-1 gray and blends the sea between preset colors', () => {
    expect(originalLandLinear(20, 'height-background')).toEqual([.8, .8, .8].map(Math.fround));
    expect(originalLandLinear(100, 'height-background')).toEqual([0, 0, 0]);
    const shallow = originalSeaSrgb(ORIGINAL_PRESETS[0], 0), deep = originalSeaSrgb(ORIGINAL_PRESETS[0], 1);
    expect(shallow.map(v => Math.round(v * 255))).toEqual([0x3c, 0x9c, 0xff]);
    expect(deep.map(v => Math.round(v * 255))).toEqual([0x14, 0x87, 0xff]);
  });
});
