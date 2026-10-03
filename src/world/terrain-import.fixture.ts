import { Delaunay } from 'd3-delaunay';

/** Synthetic, independently encoded input for converter/Worker tests. Contains
 * no installed-game content and invokes no conversion production helpers. */
export async function terrainImportFixture(options: { width?: number; height?: number; heights?: number[] } = {}) {
  const width = options.width ?? 4, height = options.height ?? 2;
  const points = Array.from({ length: 9 }, (_, index): [number, number] => [index % 3 * width / 2, Math.floor(index / 3) * height / 2]);
  const triangles = [...Delaunay.from(points).triangles], heights = options.heights ?? [0, 0, 0, 0, 80, 0, 0, 0, 0];
  const data = { format: 'fms-terrain-research', version: 2, id: 1, width, height, seed: 'synthetic-terrain-import', template: 'fixture', heights, count: points.length,
    seaLevel: 20, cellsX: 3, cellsY: 3, points, triangles,
    topology: { kind: 'web-jittered-delaunay-v1', description: 'Synthetic fixture using d3-delaunay 6.0.4', seed: 1, jitterFraction: 0, columns: 3, rows: 3,
      pointCount: points.length, triangleCount: triangles.length / 3, boundary: 'rectangle-edge-sites', cellsDesired: 9, originalUnityTopologyRecovered: false },
    hash: '', topologyHash: '', topologyMs: 1, generationMs: 1, elapsedMs: 2, rendering: 'Synthetic barycentric terrain fixture' };
  await rehashTerrainImportFixture(data);
  return { data, bytes: new TextEncoder().encode(JSON.stringify(data)) };
}
export async function rehashTerrainImportFixture(data: { points: number[][]; triangles: number[]; heights: number[]; hash: string; topologyHash: string }) {
  const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
  const buffer = new ArrayBuffer(data.points.length * 16 + data.triangles.length * 4), view = new DataView(buffer);
  data.points.forEach((point, index) => { view.setFloat64(index * 16, point[0], true); view.setFloat64(index * 16 + 8, point[1], true); });
  data.triangles.forEach((value, index) => view.setUint32(data.points.length * 16 + index * 4, value, true));
  data.hash = await digest(Uint8Array.from(data.heights)); data.topologyHash = await digest(new Uint8Array(buffer));
}
