import { describe, expect, it } from 'vitest';
import { fmsAdjustColor, fmsStateLineColor, fmsStateOutlines, FMS_STATE_LINE_WIDTH } from './state-line';
import { deriveFmsSmoothedCoast } from './coast-curve';
import { FmsOceanFields } from './ocean-surface';
import { deriveFmsOceanField, extractFmsOceanCoast } from './ocean-coast';
import type { FmsDocument } from './model';

const square = (x: number, y: number, size = 10) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];

describe('recovered state outlines', () => {
  it('raises saturation and lowers value in HSV with clamping', () => {
    const [r, g, b] = fmsAdjustColor([1, .5, .5], .2, .2);
    // HSV(0, .5, 1) -> (0, .7, .8)
    expect(r).toBeCloseTo(.8, 6); expect(g).toBeCloseTo(.24, 6); expect(b).toBeCloseTo(.24, 6);
    expect(fmsAdjustColor([1, 1, 1], -.5, 2)).toEqual([0, 0, 0]);
    expect(fmsAdjustColor([.2, .4, .6], 0, 0).map(v => +v.toFixed(6))).toEqual([.2, .4, .6]);
  });

  it('applies DeepColor then the state-line adjustment', () => {
    const once = fmsAdjustColor(fmsAdjustColor([1, 128 / 255, 128 / 255], .1, .05), .2, .2);
    expect(fmsStateLineColor('#ff8080')).toBe(Math.round(once[0] * 255) << 16 | Math.round(once[1] * 255) << 8 | Math.round(once[2] * 255));
    expect(FMS_STATE_LINE_WIDTH).toBeCloseTo(1.6667, 4);
  });

  it('draws only borders between different owners; coasts and same-owner seams are left out', () => {
    const outlines = fmsStateOutlines([
      { controller: 'a', polygon: square(0, 0) }, { controller: 'a', polygon: square(10, 0) }, { controller: 'b', polygon: square(20, 0) },
      { controller: 'c', polygon: square(100, 100) },
    ], 2);
    expect([...outlines.keys()].sort()).toEqual(['a', 'b']);
    for (const owner of ['a', 'b']) {
      const lines = outlines.get(owner)!;
      expect(lines).toHaveLength(1);
      // The single shared edge x=20 (scaled 10), y 0..10 (scaled 0..5), smoothed with clamped ends.
      for (const [x, y] of lines[0]) { expect(x).toBeCloseTo(10, 5); expect(y).toBeGreaterThanOrEqual(-1e-5); expect(y).toBeLessThanOrEqual(5 + 1e-5); }
    }
    expect(outlines.get('a')).toEqual(outlines.get('b'));
  });
});

describe('ocean distance from the smoothed coast', () => {
  it('builds the field from the recovered curve and records the contour source', () => {
    const points: [number, number][] = [], elevations: number[] = [], triangles: number[] = [], n = 9;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { points.push([x * 8, y * 8]); elevations.push(Math.round(Math.max(0, 40 - 8 * Math.hypot(x - 4, y - 4)))); }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const i = y * n + x; triangles.push(i, i + 1, i + n, i + 1, i + n + 1, i + n); }
    const doc = { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000009', revision: 0, width: 64, height: 64,
      points, triangles: Uint32Array.from(triangles), neighbors: points.map(() => []), elevations: Int32Array.from(elevations) } as unknown as FmsDocument;
    const field = new FmsOceanFields().get(doc), coast = deriveFmsSmoothedCoast(doc);
    expect(field.contourSegments).toBe(extractFmsOceanCoast(doc).length);
    expect(field.segmentCount).toBe(coast.segments.length);
    expect(field.segmentCount).toBeGreaterThan(field.contourSegments!);
  });
  it('measures distance from the edge of the SDF source band, capped and clamped at zero', () => {
    const doc = { width: 40, height: 40, points: [[0, 0], [40, 0], [0, 40]], triangles: new Uint32Array([0, 1, 2]), elevations: Int32Array.from([0, 0, 0]) } as unknown as FmsDocument;
    const decode = (f: ReturnType<typeof deriveFmsOceanField>, i: number) => (f.pixels[i * 4] * 256 + f.pixels[i * 4 + 1]) / 65535 * f.distanceCap;
    const band = deriveFmsOceanField(doc, 10, 8, [[20, 0, 20, 40]], 4);
    // Texel centers sit at x = 2.5, 7.5, ... 37.5; distance to x=20 minus the 4-unit half band.
    for (let i = 0; i < 64; i++) expect(decode(band, i)).toBeCloseTo(Math.min(10, Math.max(0, Math.abs((i % 8 + .5) * 5 - 20) - 4)), 3);
  });
});
