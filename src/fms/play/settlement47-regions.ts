import { assertFmsDocument, type FmsDocument } from '../model';
import type { Point } from '../../sim/types';
import { settlementBiomeData } from './settlement25-biomes';
import { edgeKey, landFaces, mergeRing, polygonArea, type Vertex } from './settlement25-mesh';
import { SETTLEMENT25_ALGORITHM, settlementRegions, type Region } from './settlement25-regions';

/** Only new civilization47 worlds may select this partitioner. The frozen
 * settlement25 algorithm and its old save fingerprint remain byte-for-byte. */
export const SETTLEMENT47_ALGORITHM = 'terrain-connected-unions-perimeter-v1' as const;

type Border = { length: number; resistance: number; edges: number };
type Cluster = {
  ring: Vertex[]; area: number; x: number; y: number; height: number;
  members: number[]; adjacent: Map<number, Border>; revision: number; live: boolean;
};
type Entry = { a: number; b: number; ar: number; br: number; cost: number };

class Queue {
  private values: Entry[] = [];
  private less(a: Entry, b: Entry): boolean {
    return a.cost < b.cost || a.cost === b.cost && (a.a < b.a || a.a === b.a && a.b < b.b);
  }
  push(entry: Entry): void {
    let index = this.values.push(entry) - 1;
    while (index) {
      const parent = (index - 1) >> 1;
      if (!this.less(entry, this.values[parent])) break;
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = entry;
  }
  pop(): Entry | undefined {
    const first = this.values[0], last = this.values.pop();
    if (!this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.less(this.values[child + 1], this.values[child])) child++;
      if (!this.less(this.values[child], last!)) break;
      this.values[index] = this.values[child]; index = child;
    }
    this.values[index] = last!;
    return first;
  }
}

const middle = (ring: Vertex[]): Point => ({
  x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
  y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
});
const stalled = (error: unknown): boolean => error instanceof Error &&
  /^为保留海岸与湖泊，本次划分停在 \d+ 个辖区，未能达到所选数量；/.test(error.message);

/** Prefer the established generator. Retry only its explicit geometric
 * dead-end, never bad input, disconnected-island or climate errors. */
export function settlementRegions47(document: FmsDocument, cityCount: number): {
  regions: Region[]; algorithm: typeof SETTLEMENT25_ALGORITHM | typeof SETTLEMENT47_ALGORITHM;
} {
  try { return { regions: settlementRegions(document, cityCount), algorithm: SETTLEMENT25_ALGORITHM }; }
  catch (error) { if (!stalled(error)) throw error; }
  return { regions: perimeterRegions47(document, cityCount), algorithm: SETTLEMENT47_ALGORITHM };
}

/** A deterministic alternative merge order, not a different land mask. The
 * original cost penalizes boundary length above 60; on finely indented full
 * continents that local ordering can strand one otherwise valid city. This
 * cost considers the eventual 200-vertex province cap throughout the merge.
 * Every merge still goes through the unchanged single-ring mesh validator. */
function perimeterRegions47(document: FmsDocument, cityCount: number): Region[] {
  assertFmsDocument(document);
  const faces = landFaces(document), scale = 1000 / Math.max(document.width, document.height);
  const surface = settlementBiomeData(document);
  const rivers = new Set(surface.rivers.segments.map(([a, b]) => edgeKey(
    { key: 'p' + a, x: 0, y: 0 }, { key: 'p' + b, x: 0, y: 0 },
  )));
  const clusters: Cluster[] = faces.map((face, index) => {
    const center = middle(face.ring), area = polygonArea(face.ring);
    return { ring: face.ring, area, x: center.x, y: center.y, height: face.height,
      members: [index], adjacent: new Map(), revision: 0, live: true };
  });
  const edges = new Map<string, { face: number; length: number }>();
  faces.forEach((face, index) => face.ring.forEach((a, offset) => {
    const b = face.ring[(offset + 1) % face.ring.length], key = edgeKey(a, b);
    const previous = edges.get(key), length = Math.hypot(a.x - b.x, a.y - b.y);
    if (!previous) { edges.set(key, { face: index, length }); return; }
    const other = previous.face;
    const resistance = 1 + Math.max(0, (face.height + faces[other].height) / 2 - 55) / 18
      + Math.abs(face.height - faces[other].height) / 15 + (rivers.has(key) ? 3 : 0);
    const border = { length, resistance: length * resistance, edges: 1 };
    clusters[index].adjacent.set(other, border);
    clusters[other].adjacent.set(index, border);
  }));
  const heap = new Queue();
  let offers = 0;
  const offer = (aa: number, bb: number): void => {
    const a = Math.min(aa, bb), b = Math.max(aa, bb), x = clusters[a], y = clusters[b];
    const border = x.adjacent.get(b);
    if (!x.live || !y.live || !border) return;
    if (++offers > 2_000_000) throw Error('辖区生成超出安全预算，原稿已保留。');
    const ward = ((x.x - y.x) ** 2 + (x.y - y.y) ** 2) * x.area * y.area / (x.area + y.area);
    const neck = 1 + Math.min(4, Math.sqrt(Math.min(x.area, y.area)) / Math.max(border.length, 1e-9));
    const boundary = x.ring.length + y.ring.length - 2 * border.edges;
    const cost = ward * neck * border.resistance / border.length * (1 + (boundary / 200) ** 2);
    heap.push({ a, b, ar: x.revision, br: y.revision, cost });
  };
  clusters.forEach((cluster, index) => { for (const neighbor of cluster.adjacent.keys()) if (index < neighbor) offer(index, neighbor); });
  let count = clusters.length, pops = 0;
  while (count > cityCount) {
    if (++pops > 2_000_000) throw Error('辖区生成超出安全预算，原稿已保留。');
    const entry = heap.pop();
    if (!entry) throw Error(`为保留真实海岸与湖泊，备用划分仍停在 ${count} 个辖区，无法得到 ${cityCount} 座城市；原稿已保留。`);
    const a = clusters[entry.a], b = clusters[entry.b];
    if (!a.live || !b.live || a.revision !== entry.ar || b.revision !== entry.br) continue;
    const ring = mergeRing(a.ring, b.ring);
    if (!ring) continue;
    const area = a.area + b.area;
    a.x = (a.x * a.area + b.x * b.area) / area;
    a.y = (a.y * a.area + b.y * b.area) / area;
    a.height = (a.height * a.area + b.height * b.area) / area;
    a.area = area; a.ring = ring; a.members.push(...b.members); a.revision++; b.live = false; count--;
    a.adjacent.delete(entry.b);
    for (const [neighbor, border] of b.adjacent) {
      if (neighbor === entry.a) continue;
      const old = a.adjacent.get(neighbor);
      const next = old ? { length: old.length + border.length,
        resistance: old.resistance + border.resistance, edges: old.edges + border.edges } : border;
      a.adjacent.set(neighbor, next);
      clusters[neighbor].adjacent.delete(entry.b);
      clusters[neighbor].adjacent.set(entry.a, next);
    }
    b.adjacent.clear();
    for (const neighbor of a.adjacent.keys()) offer(entry.a, neighbor);
  }
  const ids = clusters.flatMap((cluster, index) => cluster.live ? [index] : []);
  const index = new Map(ids.map((id, position) => [id, position]));
  const regions = ids.map(id => {
    const cluster = clusters[id];
    if (cluster.area * scale * scale < .01) throw Error('地图含无法建立城市的极小独立碎片，请扩大该岛或用海洋笔刷移除；原稿已保留。');
    let best = cluster.members[0], score = Infinity;
    const radius = Math.sqrt(cluster.area / Math.PI);
    for (const member of cluster.members) {
      const face = faces[member], point = middle(face.ring);
      const heights = face.source.map(source => document.elevations[source]);
      const slope = Math.max(...heights) - Math.min(...heights);
      const water = face.source.some(source => surface.rivers.riverIds[source] > 0
        || document.neighbors[source].some(neighbor => document.elevations[neighbor] < 20));
      const value = Math.hypot(point.x - cluster.x, point.y - cluster.y) / radius
        + Math.max(0, face.height - 35) / 30 + slope / 35 - (water ? .15 : 0);
      if (value < score) { score = value; best = member; }
    }
    return { ring: cluster.ring, area: cluster.area, center: middle(faces[best].ring),
      height: cluster.height, members: cluster.members,
      neighbors: new Set([...cluster.adjacent.keys()].map(neighbor => index.get(neighbor)!)) };
  });
  // The returned polygons and face ownership must agree with the actual h=20
  // clipped land. A bad candidate cannot become a city or be written to a save.
  const seen = new Uint8Array(faces.length);
  for (const region of regions) {
    if (region.ring.length < 3 || region.ring.length > 200) throw Error('备用辖区边界无效，原稿已保留。');
    let faceArea = 0;
    for (const member of region.members) {
      if (member < 0 || member >= faces.length || seen[member]++) throw Error('备用辖区地形面重复或越界，原稿已保留。');
      faceArea += polygonArea(faces[member].ring);
    }
    if (Math.abs(faceArea - polygonArea(region.ring)) > Math.max(1e-6, faceArea * 1e-8))
      throw Error('备用辖区面积与实际陆地不一致，原稿已保留。');
  }
  if (regions.length !== cityCount || seen.some(value => value !== 1)) throw Error('备用辖区未完整覆盖陆地，原稿已保留。');
  return regions;
}
