import { describe, expect, it } from 'vitest';
import { createFmsOriginalDocument, originalGridFor } from './original-document';
import { ORIGINAL_RIVER_BASE_WIDTH, originalRiverGeometry, originalRiverInterpolation, originalRiverPath, originalRiverPoints, originalRiverRibbon, originalRivers, originalSharedEdgeMids, roundHalfEven } from './original-rivers';

describe('original-grid rivers', () => {
  it('rounds like .NET Math.Round and samples by world-space segment length', () => {
    expect([.5, 1.5, 2.5, 2.4999, 2.5001].map(roundHalfEven)).toEqual([0, 2, 2, 2, 3]);
    // 0.15 world units per map unit: 8.49 map units ~ 1.27 world -> round(7.27) = 7; long segments clamp at 12.
    expect(originalRiverInterpolation(8.49)).toBe(7);
    expect(originalRiverInterpolation(0)).toBe(6);
    expect(originalRiverInterpolation(100)).toBe(12);
    expect(ORIGINAL_RIVER_BASE_WIDTH).toBeCloseTo(.125 / .15, 6);
  });

  it('tapers DrawSingleRiver width from 1.05x to below 2.1x of the TradeLine thickness', () => {
    const out: number[] = [], path: [number, number][] = Array.from({ length: 11 }, (_, i) => [i * 10, 0]);
    originalRiverRibbon(path, out);
    expect(out).toHaveLength(10 * 12);
    const width = (i: number) => Math.abs(out[i * 12 + 1] - out[i * 12 + 3]);
    expect(width(0)).toBeCloseTo(1.05 * ORIGINAL_RIVER_BASE_WIDTH, 5);
    expect(width(9)).toBeGreaterThan(width(0));
    expect(width(9)).toBeLessThan(2.1 * ORIGINAL_RIVER_BASE_WIDTH);
  });

  it('runs on the original grid: land sources, Voronoi edge-middle mouths, meander midpoints and smooth curves', async () => {
    const doc = await createFmsOriginalDocument('20k'), grid = (await originalGridFor(doc))!;
    // One large tilted island well inside the frame.
    doc.elevations = Int32Array.from(doc.points, ([x, y]) => Math.max(0, Math.round(90 - Math.hypot((x - 800) / 3.2, (y - 450) / 2.2) * .9 + (x - 800) / 40)));
    const { paths } = originalRivers(grid, doc), mids = originalSharedEdgeMids(grid);
    expect(paths.length).toBeGreaterThan(3);
    for (const cells of paths) {
      expect(cells.length).toBeGreaterThanOrEqual(3);
      expect(doc.elevations[cells[0]]).toBeGreaterThanOrEqual(20);
      const end = cells[cells.length - 1], before = cells[cells.length - 2];
      if (end >= 0 && doc.elevations[end] < 20) {
        const points = originalRiverPoints(grid, doc.elevations, cells, mids), mouth = points[points.length - 1];
        // The mouth lies on the shared Voronoi edge, not at the sea cell's site.
        const edge = grid.edges.find(e => (e.a === end && e.b === before) || (e.b === end && e.a === before))!;
        expect(mouth[0]).toBeCloseTo((edge.segment[0] + edge.segment[2]) / 2, 9); expect(mouth[1]).toBeCloseTo((edge.segment[1] + edge.segment[3]) / 2, 9);
        // Land-source steps start at 10, so only single midpoints are inserted.
        expect(points.length).toBeLessThanOrEqual(cells.length * 2 - 1);
        const path = originalRiverPath(points);
        expect(path[0]).toEqual(points[0]); expect(path[path.length - 1]).toEqual(mouth);
      }
    }
    const geometry = originalRiverGeometry(grid, doc);
    expect(geometry.stats.rivers).toBe(paths.length);
    expect(geometry.positions.length).toBe(geometry.stats.triangles * 6);
    expect(geometry.positions.every(Number.isFinite)).toBe(true);
    // Deterministic for the same grid and heights.
    expect(originalRiverGeometry(grid, doc).positions).toEqual(geometry.positions);
  });
});
