import type { FmsDocument } from '../model';
import type { Point } from '../../sim/types';

type ProvinceShape = { polygon: readonly Point[] };

function inside(ring: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Display mapping from Voronoi cells to the simulation's provinces. Province
 * rings are unions of land triangles whose vertices are the cell sites, so a
 * site often lies ON a border; triangle centroids are strictly interior. Each
 * land cell takes the province holding most of its incident triangles; land
 * cells left without a vote inherit from a neighbor. Sea cells are -1. */
export function originalCellProvinces(doc: Pick<FmsDocument, 'points' | 'triangles' | 'elevations' | 'neighbors' | 'width' | 'height'>, provinces: readonly ProvinceShape[], scale: number): Int32Array {
  const rings = provinces.map(p => p.polygon.map(v => ({ x: v.x / scale, y: v.y / scale })));
  const size = 32, columns = Math.ceil(doc.width / size), rows = Math.ceil(doc.height / size), buckets: number[][] = Array.from({ length: columns * rows }, () => []);
  rings.forEach((ring, index) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of ring) { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); }
    for (let r = Math.max(0, Math.floor(minY / size)); r <= Math.min(rows - 1, Math.floor(maxY / size)); r++)
      for (let c = Math.max(0, Math.floor(minX / size)); c <= Math.min(columns - 1, Math.floor(maxX / size)); c++) buckets[r * columns + c].push(index);
  });
  const locate = (x: number, y: number) => {
    const bucket = buckets[Math.min(rows - 1, Math.max(0, Math.floor(y / size))) * columns + Math.min(columns - 1, Math.max(0, Math.floor(x / size)))];
    for (const index of bucket) if (inside(rings[index], x, y)) return index;
    return -1;
  };
  const votes = new Map<number, Map<number, number>>(), { points, triangles, elevations } = doc;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = points[triangles[t]], b = points[triangles[t + 1]], c = points[triangles[t + 2]];
    const owner = locate((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
    if (owner < 0) continue;
    for (let k = 0; k < 3; k++) {
      const cell = triangles[t + k]; if (elevations[cell] < 20) continue;
      let tally = votes.get(cell); if (!tally) votes.set(cell, tally = new Map());
      tally.set(owner, (tally.get(owner) ?? 0) + 1);
    }
  }
  const result = new Int32Array(points.length).fill(-1);
  for (const [cell, tally] of votes) {
    let best = -1, count = 0;
    for (const [owner, n] of tally) if (n > count || n === count && owner < best) { best = owner; count = n; }
    result[cell] = best;
  }
  // A province smaller than its neighbors' votes still owns the land cell
  // nearest its center, so every province remains visible on the map.
  const owned = new Set(result);
  rings.forEach((ring, index) => {
    if (owned.has(index) || !ring.length) return;
    const cx = ring.reduce((s, v) => s + v.x, 0) / ring.length, cy = ring.reduce((s, v) => s + v.y, 0) / ring.length;
    let best = -1, distance = Infinity;
    for (let cell = 0; cell < points.length; cell++) { if (elevations[cell] < 20) continue; const d = (points[cell][0] - cx) ** 2 + (points[cell][1] - cy) ** 2; if (d < distance) { distance = d; best = cell; } }
    if (best >= 0) result[best] = index;
  });
  // Rare land cells touching no interior province triangle (tiny islets
  // excluded from provinces stay unassigned only if no neighbor has one).
  for (let pass = 0; pass < 4; pass++) for (let cell = 0; cell < points.length; cell++) {
    if (elevations[cell] < 20 || result[cell] >= 0) continue;
    const neighbor = doc.neighbors[cell].find(n => result[n] >= 0);
    if (neighbor !== undefined) result[cell] = result[neighbor];
  }
  return result;
}
