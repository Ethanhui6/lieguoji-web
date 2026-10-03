importScripts('/d3-delaunay.min.js', '/terrain-adapter.js');
const TOPOLOGY_SEED = 0x51f15e3d;
function topologyRandom() {
  let state = TOPOLOGY_SEED;
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
self.onmessage = async ({ data }) => {
  try {
    const { id, seed, template } = data, cellsX = 192, cellsY = 128, width = 1536, height = 1024;
    const started = performance.now(), random = topologyRandom(), points = [], jitter = .42;
    for (let y = 0; y < cellsY; y++) for (let x = 0; x < cellsX; x++) {
      const dx = (random() * 2 - 1) * jitter, dy = (random() * 2 - 1) * jitter;
      // Keep row/column IDs for recovered commands that use the ordered sites.
      // Boundary sites stay on the rectangle, so its entire image is triangulated.
      points.push([(x + (x === 0 || x === cellsX - 1 ? 0 : dx)) * width / (cellsX - 1),
        (y + (y === 0 || y === cellsY - 1 ? 0 : dy)) * height / (cellsY - 1)]);
    }
    const delaunay = d3.Delaunay.from(points), neighbors = points.map((_, id) => Array.from(delaunay.neighbors(id)));
    const triangles = Uint32Array.from(delaunay.triangles), topologyMs = performance.now() - started;
    const result = FmsRecoveredTerrain.generate({ width, height, cellsX, cellsY, seed, template, points, neighbors, center: [width / 2, height / 2], sizeFactor: 1, cellsDesired: 20000 });
    const generationMs = performance.now() - started - topologyMs, heights = Uint8Array.from(result.heights), hash = await digest(heights);
    const pointBytes = new Uint8Array(new Float64Array(points.flat()).buffer), triangleBytes = new Uint8Array(triangles.buffer);
    const topologyBytes = new Uint8Array(pointBytes.length + triangleBytes.length); topologyBytes.set(pointBytes); topologyBytes.set(triangleBytes, pointBytes.length);
    const topologyHash = await digest(topologyBytes);
    const topology = { kind: 'web-jittered-delaunay-v1', description: 'Fixed-seed jittered ordered points with d3-delaunay 6.0.4 adjacency; not recovered Unity topology',
      seed: TOPOLOGY_SEED, jitterFraction: jitter, columns: cellsX, rows: cellsY, pointCount: points.length,
      triangleCount: triangles.length / 3, boundary: 'rectangle-edge-sites', cellsDesired: 20000, originalUnityTopologyRecovered: false };
    self.postMessage({ id, ...result, cellsX, cellsY, heights, points, triangles, topology, topologyHash, hash, topologyMs, generationMs, elapsedMs: performance.now() - started }, [heights.buffer, triangles.buffer]);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
