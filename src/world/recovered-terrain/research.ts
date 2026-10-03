import { generateRecoveredHeights } from './engine';
import { createTerrainTopology, TOPOLOGY_SEED, type InternalTerrainLayout } from './topology';
import { validSeedTerrainRequest, type SeedTerrainTemplate } from './contract';
import { yieldAtlas, type AtlasControl } from '../model';

async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Internal layout selector exists only for fixed classic compatibility tests.
 * Public callers use generateTerrainResearch, whose request accepts square-v1. */
export async function researchForLayout(seed: string, template: SeedTerrainTemplate, layout: InternalTerrainLayout, control?: AtlasControl): Promise<Uint8Array> {
  if (!validSeedTerrainRequest({ seed, template, layout: 'square-v1' })) throw new Error('种子或内建模板无效。');
  const topology = await createTerrainTopology(layout, control);
  const heights = await generateRecoveredHeights(topology, seed, template, control);
  await yieldAtlas(control, '校验种子地形数据', 0, heights.length);
  const topologyBytes = new Uint8Array(topology.points.length * 16 + topology.triangles.byteLength), view = new DataView(topologyBytes.buffer);
  topology.points.forEach((point, id) => { view.setFloat64(id * 16, point[0], true); view.setFloat64(id * 16 + 8, point[1], true); });
  topology.triangles.forEach((vertex, index) => view.setUint32(topology.points.length * 16 + index * 4, vertex, true));
  const hash = await digest(heights), topologyHash = await digest(topologyBytes);
  control?.signal?.throwIfAborted();
  // Zero timings mean runtime measurements are intentionally not recorded.
  // The byte representation is deterministic, including property order.
  const bytes = new TextEncoder().encode(JSON.stringify({
    format: 'fms-terrain-research', version: 2, id: 1, width: topology.width, height: topology.height, seed, template,
    heights: Array.from(heights), count: heights.length, seaLevel: 20, cellsX: topology.cellsX, cellsY: topology.cellsY,
    points: topology.points, triangles: Array.from(topology.triangles),
    topology: { kind: 'web-jittered-delaunay-v1', description: 'Fixed-seed jittered ordered points with d3-delaunay 6.0.4 adjacency; not recovered Unity topology',
      seed: TOPOLOGY_SEED, jitterFraction: 0.42, columns: topology.cellsX, rows: topology.cellsY, pointCount: heights.length,
      triangleCount: topology.triangles.length / 3, boundary: 'rectangle-edge-sites', cellsDesired: 20000, originalUnityTopologyRecovered: false },
    topologyHash, hash, topologyMs: 0, generationMs: 0, elapsedMs: 0,
    rendering: 'Deterministic local seed terrain; zero timings are intentionally unrecorded',
  }));
  if (bytes.length > 12 * 1024 * 1024) throw new Error('生成的地形超过 12 MiB 上限。');
  await yieldAtlas(control, '校验种子地形数据', heights.length, heights.length);
  return bytes;
}
