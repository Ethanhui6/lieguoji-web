import { it, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe } from '../../../src/world/generation/detail-shape-natural';
import { createNaturalCoastArcPlan, roundAndIndexNaturalOutline } from '../../../src/world/generation/detail-natural-outline';
import { pickDetailCoastSurface } from '../../../src/world/detail-coast-geometry';
import { FIELD_Q, roundRatio, noiseQ12, seedHash } from '../../../src/world/generation/seed';

const output = '.autopilot/ph06/asymmetric-topology-probe', q = (value: number) => value * 256, fast = { yieldControl: async () => {} };
const sourceFiles = ['src/world/generation/detail-shape-natural.ts', 'src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-shape-natural.test.ts'];
const hashes = () => sourceFiles.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
const write = (name: string, value: unknown) => writeFileSync(`${output}/${name}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
type P = { x: number; y: number };
function inside(points: P[], point: P) {
  let yes = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) yes = !yes;
  }
  return yes;
}
it('exports only the unchanged failing production fixture topology and local field causes', async () => {
  const before = hashes(), size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < heights.length; id++) centers.set([q(id % size * 32 + 16), q(Math.floor(id / size) * 32 + 16)], id * 2);
  const base: EmptyDetailShapeBase = { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
  const recipe: NaturalDetailShapeRecipe = { format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'regional-natural-v2', coastStructureWorld: 112, coastRoughnessWorld: 24,
    reliefMeters: 2200, shelfWidthWorld: 112, islandChainCount: 0, islandsPerChain: 3,
    pointsQ: [[1100, 1100], [1900, 1100], [1900, 1740], [1100, 1740]].map(([x, y]) => ({ xQ: q(x), yQ: q(y) })) };
  write('started.json', { recordedAt: new Date().toISOString(), sourceBefore: before, recipe, scope: 'one exact production generator fixture only' });
  const generated = await generateDetailShapeNatural({ base, recipe }, { ...fast, batchWork: 512 });
  const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation }, target = new Uint32Array(generated.targetCoast);
  const graph = new Map<string, Set<string>>(), coordinates = new Map<string, P>();
  for (let i = 0; i < target.length; i += 4) {
    const a = `${target[i]}:${target[i + 1]}`, b = `${target[i + 2]}:${target[i + 3]}`;
    coordinates.set(a, { x: target[i] / 256, y: target[i + 1] / 256 }); coordinates.set(b, { x: target[i + 2] / 256, y: target[i + 3] / 256 });
    if (!graph.has(a)) graph.set(a, new Set()); if (!graph.has(b)) graph.set(b, new Set()); graph.get(a)!.add(b); graph.get(b)!.add(a);
  }
  const visited = new Set<string>(), loops: { points: P[]; areaWorld2: number; bbox: object; centroid: P; vertexCount: number; actualCenterLand: boolean; originalCenterLand: boolean; degrees: number[] }[] = [];
  for (const start of graph.keys()) if (!visited.has(start)) {
    const points: P[] = [], degrees: number[] = []; let previous = '', at = start;
    while (!visited.has(at)) {
      visited.add(at); points.push(coordinates.get(at)!); degrees.push(graph.get(at)!.size);
      const next = [...graph.get(at)!].find(key => key !== previous); if (!next) break; previous = at; at = next;
    }
    let area2 = 0, cx = 0, cy = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length], cross = a.x * b.y - b.x * a.y; area2 += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross; }
    const centroid = { x: cx / (3 * area2), y: cy / (3 * area2) };
    loops.push({ points, areaWorld2: Math.abs(area2) / 2, bbox: { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) }, centroid, vertexCount: points.length, actualCenterLand: pickDetailCoastSurface(field, centroid)!.land, originalCenterLand: centroid.x > 1100 && centroid.x < 1900 && centroid.y > 1100 && centroid.y < 1740, degrees: [...new Set(degrees)] });
  }
  loops.sort((a, b) => b.areaWorld2 - a.areaWorld2);
  const summary = loops.map(({ points, ...row }, i) => ({ ...row, insideLargestLoop: i > 0 && inside(loops[0].points, row.centroid) }));
  write('topology.json', { recordedAt: new Date().toISOString(), sourceBefore: before, recipe, targetSegments: generated.summary.targetSegments, components: loops.length, loops: summary, targetDiagnosticOnly: true });
  write('loops.json', loops);
  // Rectangle has no opposing-shore cap below its 136-world displacement
  // allowance. Reconstruct the unchanged public outline helpers to diagnose
  // exact design terms; the generated coverage above remains authoritative.
  const outline = await roundAndIndexNaturalOutline({ points: recipe.pointsQ, caps: recipe.pointsQ.map(() => q(136)), structureWorld: 112, roughnessWorld: 24, area2: 2 * q(800) * q(640) }, 512, fast, { outlineEdgeTests: 0 });
  const seed = seedHash(`shape-detail-landmass@2\0${recipe.seed}`), plan = await createNaturalCoastArcPlan({ seed, perimeterQ: outline.perimeter, structureWorld: 112 }, 512, fast);
  const sample = (xWorld: number, yWorld: number) => {
    const x = Math.round(q(xWorld)), y = Math.round(q(yWorld)), nearest = outline.nearest(x, y), signed = outline.inside(x, y) ? nearest.distance : -nearest.distance;
    let structural = 0, detail = 0, amplitude = 0, arc = 0, displacement = 0;
    if (nearest.distance <= q(136) + 512 && nearest.edge >= 0) {
      const id = nearest.edge; amplitude = outline.caps[id] + roundRatio((outline.caps[(id + 1) % outline.caps.length] - outline.caps[id]) * nearest.t, 1048576);
      arc = outline.edges[id].arc + roundRatio(outline.edges[id].length * nearest.t, 1048576); structural = plan.sample(arc);
      const u = roundRatio(3 * x - 4 * y, 5), v = roundRatio(4 * x + 3 * y, 5);
      detail = roundRatio(3 * noiseQ12(seed, 7113, u, v, q(48)) + noiseQ12(seed, 7114, u, v, q(12)), 4);
      displacement = roundRatio(amplitude * (112 * structural + 24 * detail), 136 * FIELD_Q);
    }
    return { x: xWorld, y: yWorld, nearestEdge: nearest.edge, nearestT: nearest.t, distanceWorld: nearest.distance / 256, sourceInside: signed >= 0, arcWorld: arc / 256, structuralQ: structural, detailQ: detail, capWorld: amplitude / 256, signedWorld: signed / 256, displacementWorld: displacement / 256, rawDesignWorld: (signed + displacement) / 256, actual: pickDetailCoastSurface(field, { x: xWorld, y: yWorld }) };
  };
  const local = loops.slice(1).map((loop, index) => {
    const bounds = loop.bbox as { minX: number; maxX: number; minY: number; maxY: number }, samples: ReturnType<typeof sample>[] = [];
    for (let y = Math.floor(bounds.minY / 2) * 2 - 8; y <= Math.ceil(bounds.maxY / 2) * 2 + 8; y += 2) for (let x = Math.floor(bounds.minX / 2) * 2 - 8; x <= Math.ceil(bounds.maxX / 2) * 2 + 8; x += 2) samples.push(sample(x, y));
    return { index: index + 1, centroid: sample(loop.centroid.x, loop.centroid.y), samples };
  });
  write('local-design.json', { interpretation: 'Exact public-helper reconstruction of original rectangle design, compared with actual generated coverage; no mutation', seed, perimeterWorld: outline.perimeter / 256, features: plan.features, local });
  const after = hashes(); write('source-binding.json', { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) });
  expect(after).toEqual(before); expect(summary.length).toBeGreaterThan(0);
  console.log(JSON.stringify({ diagnostic: true, components: loops.length, loops: summary }));
}, 60000);
