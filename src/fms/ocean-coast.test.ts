import { describe, expect, it } from 'vitest';
import { coastFixture, linearCoastMetrics } from '../../tests/helpers/fms-coast-metrics';
import { createFmsCoastDistance, deriveFmsOceanField, extractFmsOceanCoast, type FmsCoastSegment } from './ocean-coast';
import type { FmsDocument } from './model';

const single = (elevations: number[]): FmsDocument => ({
  format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000003', revision: 0,
  width: 10, height: 10, points: [[0, 0], [10, 0], [0, 10]], triangles: new Uint32Array([0, 1, 2]),
  neighbors: [[1, 2], [0, 2], [0, 1]], elevations: Int32Array.from(elevations),
});
const decode = (field: ReturnType<typeof deriveFmsOceanField>, id: number) => (field.pixels[id * 4] * 256 + field.pixels[id * 4 + 1]) / 65535 * field.distanceCap;

describe('ocean distance from the rendered coast', () => {
  it('uses interpolated crossings, not sea/land sample masks or cell edges', () => {
    const doc = single([0, 45, 0]);
    expect(extractFmsOceanCoast(doc)).toEqual([[40 / 9, 0, 40 / 9, 50 / 9]]);
    const coast = createFmsCoastDistance(extractFmsOceanCoast(doc), 20);
    expect(coast(0, 0)).toBeCloseTo(40 / 9, 12);
    expect(coast(40 / 9, 2)).toBeCloseTo(0, 12);
    doc.elevations[1] = 22;
    expect(createFmsCoastDistance(extractFmsOceanCoast(doc), 20)(0, 0)).toBeCloseTo(100 / 11, 12);
  });
  it('accounts for exact-level edges, isolated level points, and all-level plateaus', () => {
    expect(extractFmsOceanCoast(single([0, 20, 20]))).toEqual([[10, 0, 0, 10]]);
    expect(extractFmsOceanCoast(single([0, 0, 20]))).toEqual([[0, 10, 0, 10]]);
    expect(createFmsCoastDistance(extractFmsOceanCoast(single([0, 0, 20])), 100)(3, 6)).toBe(5);
    for (const heights of [[0, 0, 0], [45, 45, 45], [20, 20, 20]]) expect(extractFmsOceanCoast(single(heights))).toEqual([]);
  });
  it('uses float32 upload positions and preserves input arrays', () => {
    const doc = single([0, 45, 0]); doc.points[1][0] = 10.0000003;
    const before = structuredClone(doc);
    const contour = extractFmsOceanCoast(doc);
    expect(contour[0][0]).toBe(Math.fround(doc.points[1][0]) * 20 / 45);
    deriveFmsOceanField(doc, 10, 8);
    expect(doc).toEqual(before);
  });
  it('ignores faces that collapse at Float32 upload despite valid double geometry', () => {
    const doc = single([0, 45, 0]); doc.width = doc.height = 20;
    doc.points = [[10, 10], [10.0000001, 10], [10, 20]];
    expect((doc.points[1][0] - doc.points[0][0]) * 10).toBeGreaterThan(1e-8);
    expect(extractFmsOceanCoast(doc)).toEqual([]);
  });
  it.each(['island', 'neck', 'asymmetric'] as const)('retains every actual crossing of %s, including small islands', kind => {
    const doc = coastFixture(kind), segments = extractFmsOceanCoast(doc), distance = createFmsCoastDistance(segments, 100);
    for (const crossing of linearCoastMetrics(doc).crossings.values()) expect(distance(...crossing)).toBeLessThan(1e-12);
    const field = deriveFmsOceanField(doc, 30, 32);
    expect(field.segmentCount).toBeGreaterThan(0);
    // Every pixel is checked against an independent exhaustive segment query.
    for (let y = 0; y < field.height; y++) for (let x = 0; x < field.width; x++) {
      const px = (x + .5) * doc.width / field.width, py = (y + .5) * doc.height / field.height;
      const expected = Math.min(30, ...segments.map(segment => bruteDistance(segment, px, py)));
      expect(Math.abs(decode(field, y * field.width + x) - expected)).toBeLessThanOrEqual(30 / 131070 + 1e-10);
    }
  });
  it('matches an exhaustive Euclidean query with long, zero-length and diagonal segments', () => {
    const segments: FmsCoastSegment[] = Array.from({ length: 257 }, (_, i) => [i * 2.1, Math.sin(i) * 50, i % 2 ? 500 : i * 2.1, i % 2 ? 200 : Math.sin(i) * 50]);
    const query = createFmsCoastDistance(segments, 40);
    for (let i = 0; i < 200; i++) {
      const x = Math.sin(i * 1.3) * 700, y = Math.cos(i) * 300;
      expect(query(x, y)).toBeCloseTo(Math.min(40, ...segments.map(segment => bruteDistance(segment, x, y))), 10);
    }
  });
  it('fills an empty sea with capped distance and creates no fictitious world-border coast', () => {
    const field = deriveFmsOceanField(single([0, 0, 0]), 8, 8);
    expect(field.segmentCount).toBe(0);
    for (let i = 0; i < field.width * field.height; i++) expect(Array.from(field.pixels.slice(i * 4, i * 4 + 4))).toEqual([255, 255, 0, 255]);
  });
  it('handles rectangular maps with equal world-space texel pitch, caps distance, and bounds sampling error', () => {
    const doc = single([0, 45, 0]); doc.width = 20;
    const field = deriveFmsOceanField(doc, 3, 32);
    expect([field.width, field.height]).toEqual([32, 16]);
    expect(field.maxSampleError).toBeLessThan(.884);
    for (let i = 0; i < field.width * field.height; i++) expect(decode(field, i)).toBeLessThanOrEqual(3);
  });
  it('bilinear RG decoding stays linear across byte carries', () => {
    const a = 255, b = 257, w = .37;
    const sampledR = ((a >>> 8) * (1 - w) + (b >>> 8) * w) / 255;
    const sampledG = ((a & 255) * (1 - w) + (b & 255) * w) / 255;
    expect(sampledR * 256 / 257 + sampledG / 257).toBeCloseTo((a * (1 - w) + b * w) / 65535, 15);
  });
});

function bruteDistance([ax, ay, bx, by]: FmsCoastSegment, x: number, y: number): number {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return Math.hypot(x - ax, y - ay);
  const projected = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
  if (projected < 0) return Math.hypot(x - ax, y - ay);
  if (projected > 1) return Math.hypot(x - bx, y - by);
  return Math.abs(dx * (ay - y) - (ax - x) * dy) / Math.hypot(dx, dy);
}
