import type { FmsDocument } from '../model';
export function grid(height: (x: number, y: number) => number = () => 45): FmsDocument {
  const points: [number, number][] = [], triangles: number[] = [], n = 25;
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) points.push([x * 10, y * 10]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; triangles.push(a,b,c,b,d,c); }
  const neighbors = points.map(() => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3) { const [a,b,c] = triangles.slice(i,i+3); neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b); }
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 0, width: 250, height: 250, points, triangles: new Uint32Array(triangles), neighbors: neighbors.map(n => [...n]), elevations: Int32Array.from(points, ([x,y]) => height(x,y)) };
}
