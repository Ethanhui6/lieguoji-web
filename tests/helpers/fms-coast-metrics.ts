import { Delaunay } from 'd3-delaunay';
import type { FmsDocument, FmsPoint } from '../../src/fms/model';

/** Independent acceptance geometry: clip the actual render triangles at h=20.
 * Uses float32 positions, as uploaded by FmsRenderer. No production coast-lock
 * helper is called. Areas are world units squared, distances are world units. */
type Vertex = readonly [number, number, number];
function clippedTriangle(vertices: Vertex[]): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3];
    if (a[2] >= 20) result.push(a);
    if ((a[2] < 20) !== (b[2] < 20)) {
      const t = (20 - a[2]) / (b[2] - a[2]);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 20]);
    }
  }
  return result;
}
function area(polygon: Vertex[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; sum += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(sum) * .5;
}
export function linearCoastMetrics(doc: FmsDocument, heights = doc.elevations, sectionX?: number, round = true) {
  const vertices: Vertex[] = doc.points.map(([x, y], i) => [round?Math.fround(x):x, round?Math.fround(y):y, heights[i]]);
  const crossings = new Map<string, readonly [number, number]>(), triangleAreas: number[] = [], intervals: [number, number][] = [];
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const ids = Array.from(doc.triangles.slice(offset, offset + 3)), polygon = clippedTriangle(ids.map(id => vertices[id]));
    triangleAreas.push(area(polygon));
    for (let i = 0; i < 3; i++) {
      const low = Math.min(ids[i], ids[(i + 1) % 3]), high = Math.max(ids[i], ids[(i + 1) % 3]), a = vertices[low], b = vertices[high];
      if ((a[2] < 20) === (b[2] < 20)) continue;
      const t = (20 - a[2]) / (b[2] - a[2]);
      crossings.set(`${low}:${high}`, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    if (sectionX !== undefined && polygon.length) {
      const ys: number[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if (a[0] === sectionX) ys.push(a[1]);
        if ((a[0] < sectionX && b[0] > sectionX) || (a[0] > sectionX && b[0] < sectionX)) ys.push(a[1] + (b[1] - a[1]) * (sectionX - a[0]) / (b[0] - a[0]));
      }
      if (ys.length) intervals.push([Math.min(...ys), Math.max(...ys)]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], interval[1]); else merged.push([...interval]);
  }
  return { crossings, triangleAreas, landArea: triangleAreas.reduce((sum, value) => sum + value, 0), sectionIntervals: merged };
}
export function compareLinearCoasts(doc: FmsDocument, candidate: Int32Array, sectionX?: number) {
  const before = linearCoastMetrics(doc, doc.elevations, sectionX), after = linearCoastMetrics(doc, candidate, sectionX);
  let maxCrossingDisplacement = 0, missingCrossings = 0, changedTriangles = 0, absoluteAreaChange = 0;
  for (const [key, a] of before.crossings) {
    const b = after.crossings.get(key);
    if (!b) missingCrossings++; else maxCrossingDisplacement = Math.max(maxCrossingDisplacement, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  for (let i = 0; i < before.triangleAreas.length; i++) {
    const difference = Math.abs(before.triangleAreas[i] - after.triangleAreas[i]);
    absoluteAreaChange += difference; if (difference !== 0) changedTriangles++;
  }
  return { crossingCount: before.crossings.size, candidateCrossingCount: after.crossings.size, missingCrossings,
    maxCrossingDisplacement, changedTriangles, absoluteAreaChange, landAreaBefore: before.landArea, landAreaAfter: after.landArea,
    sectionBefore: before.sectionIntervals, sectionAfter: after.sectionIntervals };
}
export function coastFixture(kind: 'island' | 'neck' | 'asymmetric'): FmsDocument {
  const size = kind === 'island' ? 9 : 41, points: FmsPoint[] = [], heights: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    points.push([x * 10, y * 10]);
    const land = kind === 'island' ? x === 4 && y === 4 :
      ((x >= 3 && x <= 16 && y >= 7 && y <= 33) && !(kind === 'asymmetric' && x <= 9 && y >= 16 && y <= 23))
      || (x >= 24 && x <= 37 && y >= 7 && y <= 33)
      || (x >= 16 && x <= 24 && y === 27)
      || (kind === 'asymmetric' && ((x === 20 && y === 3) || (x === 13 && y >= 2 && y < 7)));
    heights.push(land ? 45 : 0);
  }
  const mesh = Delaunay.from(points);
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000003', revision: 0,
    width: (size - 1) * 10, height: (size - 1) * 10, points, triangles: Uint32Array.from(mesh.triangles),
    neighbors: points.map((_, id) => [...mesh.neighbors(id)]), elevations: Int32Array.from(heights) };
}
