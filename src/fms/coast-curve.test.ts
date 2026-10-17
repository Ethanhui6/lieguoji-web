import { describe, expect, it } from 'vitest';
import { chainFmsCoastSegments, deriveFmsCoastCurves, fmsBasis, fmsCurveBasis, fmsCurveBasisClosed, fmsSmoothBorderLines, FMS_COAST_LINE_WIDTH } from './coast-curve';
import { extractFmsOceanCoast } from './ocean-coast';
import type { FmsCoastSegment } from './ocean-coast';

describe('recovered coastline B-spline', () => {
  it('evaluates the compiled uniform cubic basis', () => {
    expect(fmsBasis(0)).toEqual([Math.fround(1 / 6), Math.fround(4 / 6), Math.fround(1 / 6), 0]);
    expect(fmsBasis(1)).toEqual([0, Math.fround(1 / 6), Math.fround(4 / 6), Math.fround(1 / 6)]);
    for (const t of [.25, .5, .75]) expect(fmsBasis(t).reduce((a, b) => a + b)).toBeCloseTo(1, 6);
  });

  it('samples each span four times, sharing joints and clamping open ends', () => {
    const line = fmsCurveBasis([[0, 0], [6, 0], [6, 6]], 4);
    expect(line).toHaveLength(9);
    // First sample with p0=p1: 5/6 of the end point plus 1/6 of the next one.
    expect(line[0][0]).toBeCloseTo(1, 5); expect(line[0][1]).toBe(0);
    // The corner is cut, never passed through: an approximating, not interpolating, curve.
    expect(line.some(p => p[0] === 6 && p[1] === 0)).toBe(false);
    expect(line[line.length - 1][0]).toBeCloseTo(6, 5); expect(line[line.length - 1][1]).toBeCloseTo(5, 5);
  });

  it('routes rings within 0.001 to the closed variant and closes the result', () => {
    const ring: [number, number][] = [[0, 0], [8, 0], [8, 8], [0, 8], [0, .0005]];
    const closed = fmsCurveBasis(ring, 4);
    expect(closed).toEqual(fmsCurveBasisClosed(ring, 4));
    expect(closed[0]).toEqual(closed[closed.length - 1]);
    const xs = closed.map(p => p[0]);
    // The caller's repeated closing point stays a control point, as in the
    // original, so the curve touches that doubled vertex's edge but stays inside.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); expect(Math.max(...xs)).toBeLessThan(8);
  });

  it('drops interior samples within 0.001 but keeps both ends', () => {
    const [line] = fmsSmoothBorderLines([[[0, 0], [0, 0], [3, 0]]]);
    for (let i = 1; i < line.length - 1; i++) {
      expect(Math.abs(line[i][0] - line[i - 1][0]) >= .001 || Math.abs(line[i][1] - line[i - 1][1]) >= .001).toBe(true);
    }
    expect(line[0][0]).toBe(0);
  });

  it('chains shared endpoints into one open line and one loop', () => {
    const open: FmsCoastSegment[] = [[2, 0, 3, 0], [0, 0, 1, 0], [1, 0, 2, 0]];
    const loop: FmsCoastSegment[] = [[10, 10, 11, 10], [11, 11, 10, 10], [11, 10, 11, 11]];
    const chains = chainFmsCoastSegments([...open, ...loop]);
    expect(chains).toHaveLength(2);
    const line = chains.find(c => c.length === 4)!;
    expect([line[0][0], line[3][0]].sort()).toEqual([0, 3]);
    const ring = chains.find(c => c[0][0] === 10 || c[0][0] === 11)!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('smooths the real rendered sea-level contour of an island', () => {
    const points: [number, number][] = [], elevations: number[] = [], triangles: number[] = [], n = 9;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { points.push([x * 8, y * 8]); elevations.push(Math.max(0, 40 - 8 * Math.hypot(x - 4, y - 4))); }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const i = y * n + x; triangles.push(i, i + 1, i + n, i + 1, i + n + 1, i + n); }
    const segments = extractFmsOceanCoast({ points, elevations: Int32Array.from(elevations, Math.round), triangles: Uint32Array.from(triangles), width: 64, height: 64 });
    const curves = deriveFmsCoastCurves(segments);
    expect(curves.chains).toBe(1);
    const [line] = curves.lines;
    expect(line[0]).toEqual(line[line.length - 1]);
    // Every sample stays within one cell of the island center's contour radius.
    for (const [x, y] of line) expect(Math.abs(Math.hypot(x - 32, y - 32) - 20)).toBeLessThan(8);
    expect(FMS_COAST_LINE_WIDTH).toBeCloseTo(1.6667, 4);
  });
});
