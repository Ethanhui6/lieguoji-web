import { beforeAll, describe, expect, it } from 'vitest';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../detail-coast-codec';
import { buildDetailCoastSurface, pickDetailCoastSurface, summarizeDetailCoast } from '../detail-coast-geometry';
import { detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastTile } from '../detail-coast-types';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { buildDetailShapeDistanceIndex } from './detail-shape-distance';
import { generateDetailShapeNatural, type NaturalDetailShapeOutput, type NaturalDetailShapeRecipe, type EmptyDetailShapeBase } from './detail-shape-natural';
import { naturalArcField, roundAndIndexNaturalOutline } from './detail-natural-outline';
import { createNaturalRelief } from './detail-natural-relief';

const noWait = async () => {};
function base(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < heights.length; id++) { centers[id * 2] = (id % size * 32 + 16) * 256; centers[id * 2 + 1] = (Math.floor(id / size) * 32 + 16) * 256; }
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
function recipe(): NaturalDetailShapeRecipe {
  return { format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'regional-natural-v2', coastStructureWorld: 112, coastRoughnessWorld: 24,
    reliefMeters: 2200, shelfWidthWorld: 112, islandChainCount: 0, islandsPerChain: 3,
    pointsQ: [[1100, 1100], [1900, 1100], [1900, 1740], [1100, 1740]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })) };
}
const bytes = (value: NaturalDetailShapeOutput) => [...value.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]);
let source: EmptyDetailShapeBase, world: NaturalDetailShapeOutput;
beforeAll(async () => { source = base(); world = await generateDetailShapeNatural({ base: source, recipe: recipe() }, { yieldControl: noWait, batchWork: 512 }); }, 60000);

describe('independent natural-v2 real geography kernel', () => {
  it('builds structural bays/capes beyond small roughness and real lowlands below directed mountain relief', () => {
    const target = new Uint32Array(world.targetCoast), displacements: number[] = [];
    for (let i = 0; i < target.length; i += 2) {
      const x = target[i] / 256, y = target[i + 1] / 256;
      displacements.push(Math.min(Math.abs(x - 1100), Math.abs(x - 1900), Math.abs(y - 1100), Math.abs(y - 1740)));
    }
    expect(Math.max(...displacements)).toBeGreaterThan(recipe().coastRoughnessWorld + 8);
    expect(Math.max(...displacements)).toBeLessThanOrEqual(recipe().coastStructureWorld + recipe().coastRoughnessWorld + 2);
    expect(world.summary.natural.roundedCorners).toBe(4); expect(world.summary.natural.relief.ridgeSegments).toBeGreaterThan(0);
    expect(world.summary.natural.relief.ridgeSegments).toBeLessThanOrEqual(16);
    const centers = new Int32Array(source.centersQ), interior: number[] = [];
    for (let id = 0; id < world.coarseElevations.length; id++) {
      const x = centers[id * 2] / 256, y = centers[id * 2 + 1] / 256;
      if (x > 1240 && x < 1760 && y > 1240 && y < 1600) interior.push(world.coarseElevations[id]);
    }
    expect(interior.length).toBeGreaterThan(50); expect(Math.min(...interior)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...interior)).toBeLessThan(recipe().reliefMeters * .2);
    expect(Math.max(...interior)).toBeGreaterThan(recipe().reliefMeters * .55);
    expect(world.summary.sampledTiles).toBeLessThan(4096); expect(world.summary.landAreaTwiceQ2 + world.summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
  });

  it('stores recomputed target distance and exact saturated Hbase joins, never raw structural noise', async () => {
    const index = await buildDetailShapeDistanceIndex({ coordinates: world.targetCoast, segmentCount: world.summary.targetSegments }, { yieldControl: noWait });
    const restored = createDetailShapeBaseSampler(source.size, source.centersQ, world.coarseElevations.buffer as ArrayBuffer); let samples = 0, saturated = 0;
    for (const tile of world.detailCoast.values()) if (tile.mode === 'samples') {
      const layout = detailCoastOwnerLayout(tile.bx, tile.by);
      for (let slot = 0; slot < layout.count; slot += 127) {
        const x = (layout.startX + slot % layout.width) * 512, y = (layout.startY + Math.floor(slot / layout.width)) * 512, c = tile.coverageQ[slot];
        expect(index.sample(x, y, c < 0 ? -1 : 1).coverageQ).toBe(c); samples++;
        if (Math.abs(c) === 32767) { const h = Math.round(restored(x, y)); expect(tile.elevationMeters[slot]).toBe(c > 0 ? Math.max(0, h) : Math.min(-1, h)); saturated++; }
      }
    }
    expect(samples).toBeGreaterThan(50); expect(saturated).toBeGreaterThan(0);
  });

  it('keeps final area, shore pickup and persisted height classification after real codec recovery', async () => {
    const tiles = new Map<DetailCoastKey, DetailCoastTile>([...world.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const field = { tiles, sampleBaseElevation: createDetailShapeBaseSampler(source.size, source.centersQ, world.coarseElevations.buffer as ArrayBuffer) };
    const area = await summarizeDetailCoast(tiles, { yieldControl: noWait }); expect(area.landAreaTwiceQ2).toBe(world.summary.landAreaTwiceQ2);
    expect(area.seaAreaTwiceQ2).toBe(world.summary.seaAreaTwiceQ2);
    const target = new Uint32Array(world.targetCoast), column = Math.max(0, Math.floor(target[0] / 512) - 1), row = Math.max(0, Math.floor(target[1] / 512) - 1);
    const shore = buildDetailCoastSurface(field, { column, row, columns: 3, rows: 3 }).cells.flatMap(cell => cell.shore)[0]; expect(shore).toBeDefined();
    expect(pickDetailCoastSurface(field, { x: (shore.a.xQ + shore.b.xQ) / 512, y: (shore.a.yQ + shore.b.yQ) / 512 })).toMatchObject({ land: true, height: 0 });
    const centers = new Int32Array(source.centersQ);
    for (let id = 0; id < world.coarseElevations.length; id += 47) expect(pickDetailCoastSurface(field, { x: centers[id * 2] / 256, y: centers[id * 2 + 1] / 256 })!.land).toBe(world.coarseElevations[id] >= 0);
  }, 60000);

  it('retains a deliberately narrow sea inlet under the non-adjacent feature caps', async () => {
    const narrow = recipe(); narrow.pointsQ = [[1200, 1200], [1268, 1200], [1268, 1248], [1280, 1248], [1280, 1200], [1380, 1200], [1380, 1360], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
    const result = await generateDetailShapeNatural({ base: base(), recipe: narrow }, { yieldControl: noWait, batchWork: 512 });
    const field = { tiles: result.detailCoast, sampleBaseElevation: result.sampleBaseElevation };
    expect(pickDetailCoastSurface(field, { x: 1274, y: 1220 })?.land).toBe(false);
    expect(pickDetailCoastSurface(field, { x: 1235, y: 1300 })?.land).toBe(true);
    expect(result.summary.landAreaTwiceQ2 + result.summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
  }, 60000);

  it('retains a twelve-world land neck instead of rounding separate lobes into islands', async () => {
    const narrow = recipe(); narrow.pointsQ = [[1100, 1100], [1280, 1100], [1280, 1180], [1340, 1180], [1340, 1100], [1520, 1100], [1520, 1320], [1340, 1320], [1340, 1192], [1280, 1192], [1280, 1320], [1100, 1320]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
    const result = await generateDetailShapeNatural({ base: base(), recipe: narrow }, { yieldControl: noWait, batchWork: 512 });
    const field = { tiles: result.detailCoast, sampleBaseElevation: result.sampleBaseElevation };
    for (let x = 1264; x <= 1356; x += 2) expect(pickDetailCoastSurface(field, { x, y: 1186 })?.land).toBe(true);
    expect(pickDetailCoastSurface(field, { x: 1310, y: 1160 })?.land).toBe(false);
    expect(pickDetailCoastSurface(field, { x: 1310, y: 1212 })?.land).toBe(false);
  }, 60000);

  it('is deterministic across work batches and owns source recipe/buffers before the first yield', async () => {
    const inputBase = base(), inputRecipe = recipe(); let changed = false;
    const replay = await generateDetailShapeNatural({ base: inputBase, recipe: inputRecipe }, { batchWork: 64, yieldControl: async () => {
      if (!changed) { changed = true; new Int32Array(inputBase.elevationsMeters).fill(0); inputRecipe.coastStructureWorld = 0; inputRecipe.pointsQ[0].xQ = 0; inputRecipe.seed = 'external-mutation'; }
    } });
    expect(replay.targetCoast).toEqual(world.targetCoast); expect(replay.coarseElevations).toEqual(world.coarseElevations);
    expect(bytes(replay)).toEqual(bytes(world)); expect(replay.summary).toEqual(world.summary);
  }, 60000);

  it('cancels actual natural outline and relief phases without changing source geography', async () => {
    for (const phase of ['validate-natural-outline', 'plan-natural-highlands']) {
      const inputBase = base(), original = new Uint8Array(inputBase.elevationsMeters).slice(), controller = new AbortController(); let reached = false;
      await expect(generateDetailShapeNatural({ base: inputBase, recipe: recipe() }, { signal: controller.signal, batchWork: 512, yieldControl: noWait,
        onProgress: stage => { if (stage === phase) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(new Uint8Array(inputBase.elevationsMeters)).toEqual(original); expect(inputBase.detailCoast.size).toBe(0);
    }
  }, 60000);

  it('rejects the old recipe identity, out-of-envelope input, self-contact and existing worlds', async () => {
    const wrong = { ...recipe(), version: 1 } as unknown as NaturalDetailShapeRecipe;
    await expect(generateDetailShapeNatural({ base: base(), recipe: wrong }, { yieldControl: noWait })).rejects.toThrow('第二版');
    const nearEdge = recipe(); nearEdge.pointsQ[0].xQ = 64 * 256; await expect(generateDetailShapeNatural({ base: base(), recipe: nearEdge }, { yieldControl: noWait })).rejects.toThrow('海洋边带');
    const crossed = recipe(); [crossed.pointsQ[1], crossed.pointsQ[2]] = [crossed.pointsQ[2], crossed.pointsQ[1]];
    await expect(generateDetailShapeNatural({ base: base(), recipe: crossed }, { yieldControl: noWait })).rejects.toThrow('自交');
    const nonempty = base(); nonempty.generationPresent = true; await expect(generateDetailShapeNatural({ base: nonempty, recipe: recipe() }, { yieldControl: noWait })).rejects.toThrow('空 v4');
  });
});

describe('natural outline and real relief contracts', () => {
  it('rounds corners within their feature cap, preserves the literal zero-structure contour and has no periodic arc seam', async () => {
    const points = recipe().pointsQ, area2 = 2 * 800 * 640 * 256 ** 2, caps = points.map(() => 136 * 256), control = { yieldControl: noWait };
    const rounded = await roundAndIndexNaturalOutline({ points, caps, structureWorld: 112, roughnessWorld: 24, area2 }, 128, control, { outlineEdgeTests: 0 });
    expect(rounded.roundedCorners).toBe(4); expect(rounded.inside(1100 * 256, 1100 * 256)).toBe(false);
    expect(rounded.nearest(1100 * 256, 1100 * 256).distance).toBeGreaterThan(0);
    const literal = await roundAndIndexNaturalOutline({ points, caps: points.map(() => 0), structureWorld: 0, roughnessWorld: 0, area2 }, 128, control, { outlineEdgeTests: 0 });
    expect(literal.edges.map(edge => edge.a)).toEqual(points); expect(literal.roundedCorners).toBe(0);
    for (const wavelength of [320, 768]) expect(naturalArcField(73, 11, 0, rounded.perimeter, wavelength)).toBe(naturalArcField(73, 11, rounded.perimeter, rounded.perimeter, wavelength));
  });

  it('varies actual shelf depths separately from land rise and reproduces bounded directed relief from copied buffers', async () => {
    const fixture = base(), centers = new Int32Array(fixture.centersQ), land = new Uint8Array(128 ** 2), distance = new Uint16Array(128 ** 2);
    for (let id = 0; id < land.length; id++) if (centers[id * 2] >= 1000 * 256 && centers[id * 2] <= 2200 * 256 && centers[id * 2 + 1] >= 1000 * 256 && centers[id * 2 + 1] <= 1900 * 256) { land[id] = 1; distance[id] = 32767; }
    const relief = await createNaturalRelief({ seed: 9811, size: 128, centersQ: centers, land, coastDistanceQ: distance, reliefMeters: 2200, shelfWidthWorld: 112,
      isLand: (x, y) => x >= 1000 * 256 && x <= 2200 * 256 && y >= 1000 * 256 && y <= 1900 * 256 }, 512, { yieldControl: noWait });
    expect(relief.summary.ridgeSegments).toBeGreaterThan(0); expect(relief.summary.maximumRidgeWidthWorld).toBeGreaterThanOrEqual(128);
    const widths = new Set<number>(), depths = new Set<number>();
    for (let x = 0; x <= 4096; x += 128) {
      widths.add(relief.shelfWidthAt(x * 256, 1400 * 256)); depths.add(relief.physicalHeight(x * 256, 1400 * 256, false, 48 * 256, -2400));
      expect(relief.physicalHeight(x * 256, 1400 * 256, false, 32767, -2400)).toBe(-2400);
      expect(relief.coastRiseAt(x * 256, 1400 * 256)).toBeLessThanOrEqual(36);
    }
    expect(widths.size).toBeGreaterThan(5); expect(Math.min(...widths)).toBeGreaterThanOrEqual(16); expect(Math.max(...widths)).toBeLessThanOrEqual(112); expect(depths.size).toBeGreaterThan(5);
    const q = { ...relief.ridges[0].a }, original = relief.physicalHeight(q.xQ, q.yQ, true, 32767, -2400);
    centers.fill(0); land.fill(0); distance.fill(0); relief.ridges[0].a.xQ = 0;
    expect(relief.physicalHeight(q.xQ, q.yQ, true, 32767, -2400)).toBe(original);
  });
});
