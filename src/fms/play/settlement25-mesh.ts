import type {FmsDocument} from '../model';
import type {Point} from '../../sim/types';
// Exact h20 face clip retained from naming18; only the partitioner is new.
export type Vertex = Point & { key: string };
export type Face = { ring: Vertex[]; neighbors: number[]; height: number; source: number[] };
export const edgeKey = (a: Vertex, b: Vertex) => a.key < b.key ? `${a.key}/${b.key}` : `${b.key}/${a.key}`;
export const polygonArea = (p: Point[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;

/** Clip the same float32 mesh at the renderer's h=20 contour. Shared vertices
 * retain canonical identities; neither proximity nor convex hulls create land. */
export function landFaces(doc: FmsDocument): Face[] {
  const points = doc.points.map((p, i) => ({ x: Math.fround(p[0]), y: Math.fround(p[1]), key: `p${i}` }));
  const crossings = new Map<string, Vertex>(), faces: Face[] = [];
  const crossing = (a: number, b: number) => {
    if (a > b) [a, b] = [b, a];
    if (doc.elevations[a] === 20) return points[a];
    if (doc.elevations[b] === 20) return points[b];
    const key = `e${a}:${b}`, old = crossings.get(key); if (old) return old;
    const t = (20 - doc.elevations[a]) / (doc.elevations[b] - doc.elevations[a]);
    const v = { key, x: points[a].x + t * (points[b].x - points[a].x), y: points[a].y + t * (points[b].y - points[a].y) };
    crossings.set(key, v); return v;
  };
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const ids = Array.from(doc.triangles.slice(offset, offset + 3));
    if (!ids.some(id => doc.elevations[id] > 20)) continue;
    const ring: Vertex[] = [];
    for (let i = 0; i < 3; i++) {
      const a = ids[i], b = ids[(i + 1) % 3], insideA = doc.elevations[a] >= 20, insideB = doc.elevations[b] >= 20;
      if (insideA) ring.push(points[a]);
      if (insideA !== insideB) ring.push(crossing(a, b));
    }
    const unique = [...new Map(ring.map(v => [v.key, v])).values()];
    if (unique.length < 3 || polygonArea(unique) < 1e-7) continue;
    // Uniform orientation makes shared-edge cancellation deterministic.
    if (unique.reduce((sum, a, i) => { const b = unique[(i + 1) % unique.length]; return sum + a.x * b.y - b.x * a.y; }, 0) < 0) unique.reverse();
    faces.push({ ring: unique, neighbors: [], source: ids, height: ids.reduce((s, id) => s + doc.elevations[id], 0) / 3 });
  }
  const owners = new Map<string, number>();
  faces.forEach((face, i) => face.ring.forEach((v, j) => {
    const key = edgeKey(v, face.ring[(j + 1) % face.ring.length]), other = owners.get(key);
    if (other !== undefined) { faces[other].neighbors.push(i); face.neighbors.push(other); } else owners.set(key, i);
  }));
  return faces;
}

/** Union along shared edges only; reject holes, point contacts and >200 vertices
 * instead of silently filling sea or changing the economy's land area. */
export function mergeRing(a: Vertex[], b: Vertex[]): Vertex[] | null {
  const edges = new Map<string, [Vertex, Vertex]>(); let shared = 0;
  for (const ring of [a, b]) for (let i = 0; i < ring.length; i++) {
    const from = ring[i], to = ring[(i + 1) % ring.length], key = edgeKey(from, to);
    if (edges.has(key)) { edges.delete(key); shared++; } else edges.set(key, [from, to]);
  }
  if (!shared || edges.size < 3 || edges.size > 200) return null;
  const outgoing = new Map<string, [Vertex, Vertex]>();
  for (const edge of edges.values()) { if (outgoing.has(edge[0].key)) return null; outgoing.set(edge[0].key, edge); }
  const start = edges.values().next().value![0], ring: Vertex[] = []; let next = start;
  while (outgoing.has(next.key)) { const edge = outgoing.get(next.key)!; ring.push(next); outgoing.delete(next.key); next = edge[1]; }
  return next.key === start.key && !outgoing.size ? ring : null;
}

