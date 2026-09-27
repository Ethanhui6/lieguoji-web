import { beforeAll, describe, expect, it } from 'vitest';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe, type NaturalDetailShapeOutput } from './detail-shape-natural';
import { sampleDetailCoastCoverage } from '../detail-coast-field';
import { pickDetailCoastSurface } from '../detail-coast-geometry';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../detail-coast-codec';
import { createDetailShapeBaseSampler } from './detail-shape-height';

const q = (value: number) => value * 256;
const points = [[1000, 1000], [1440, 1000], [1440, 1320], [1452, 1320], [1452, 1000], [2000, 1000],
  [2000, 1720], [1672, 1720], [1672, 2100], [1660, 2100], [1660, 1720], [1000, 1720]].map(([x, y]) => ({ xQ: q(x), yQ: q(y) }));
const recipe = (): NaturalDetailShapeRecipe => ({ format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'regional-protect-channel-and-neck', pointsQ: points.map(p => ({ ...p })),
  coastStructureWorld: 96, coastRoughnessWorld: 32, reliefMeters: 2400, shelfWidthWorld: 128, islandChainCount: 0, islandsPerChain: 3 });
function base(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size * size * 2), elevations = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < size * size; id++) centers.set([q((id % size) * 32 + 16), q(Math.floor(id / size) * 32 + 16)], id * 2);
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: elevations.buffer,
    detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
let input: EmptyDetailShapeBase, generated: NaturalDetailShapeOutput;
beforeAll(async () => { input = base(); generated = await generateDetailShapeNatural({ base: input, recipe: recipe() }, { batchWork: 512, yieldControl: async () => {} }); }, 60000);
describe('regional coast actual fine-field protection', () => {
  it('keeps the drawn 12-world sea channel and 12-world land neck continuous in the actual generated pieces', () => {
    const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
    for (let y = 990; y <= 1316; y += 2) expect(pickDetailCoastSurface(field, { x: 1446, y })!.land, `channel y=${y}`).toBe(false);
    for (let y = 1716; y <= 2094; y += 2) expect(pickDetailCoastSurface(field, { x: 1666, y })!.land, `peninsula y=${y}`).toBe(true);
    expect(generated.summary.islandsPlaced).toBe(0);
    expect(generated.summary.landAreaTwiceQ2 + generated.summary.seaAreaTwiceQ2).toBe(2 * q(4096) ** 2);
    const target = new Uint32Array(generated.targetCoast);
    for (let i = 0; i < target.length; i += 2) {
      const x = target[i], y = target[i + 1]; let nearest = Infinity;
      for (let j = 0; j < points.length; j++) {
        const a = points[j], b = points[(j + 1) % points.length], dx = b.xQ - a.xQ, dy = b.yQ - a.yQ;
        const t = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(x - a.xQ - dx * t, y - a.yQ - dy * t));
      }
      // Two-world sampling gives at most one fine-cell geometric uncertainty;
      // it is not permission to expand the requested 128-world envelope.
      expect(nearest / 256).toBeLessThanOrEqual(130);
    }
  });

  it('adds no detached land or isolated sea holes at the actual fixed two-world nodes', () => {
    const minColumn = 420, minRow = 420, columns = 660, rows = 710, count = columns * rows;
    const signs = new Uint8Array(count), seen = new Uint8Array(count), queue = new Uint32Array(count);
    for (let id = 0; id < count; id++) signs[id] = Number(sampleDetailCoastCoverage(generated.detailCoast, minColumn + id % columns, minRow + Math.floor(id / columns)) >= 0);
    let landComponents = 0, seaComponents = 0;
    for (let id = 0; id < count; id++) {
      if (seen[id]) continue;
      const land = signs[id]; if (land) landComponents++; else seaComponents++;
      let start = 0, end = 1; queue[0] = id; seen[id] = 1;
      while (start < end) {
        const current = queue[start++], x = current % columns, y = Math.floor(current / columns);
        for (const next of [x ? current - 1 : -1, x + 1 < columns ? current + 1 : -1, y ? current - columns : -1, y + 1 < rows ? current + columns : -1]) {
          if (next < 0 || seen[next] || signs[next] !== land) continue;
          seen[next] = 1; queue[end++] = next;
        }
      }
    }
    expect(landComponents).toBe(1); expect(seaComponents).toBe(1);
  });

  it('roundtrips real coast and fine elevations without changing implicit Hbase or caller buffers', () => {
    const tiles = new Map([...generated.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const sampler = createDetailShapeBaseSampler(input.size, input.centersQ, generated.coarseElevations.buffer as ArrayBuffer);
    for (const [key, tile] of generated.detailCoast) expect(encodeDetailCoastTile(tiles.get(key)!)).toEqual(encodeDetailCoastTile(tile));
    for (const point of [{ x: 1446, y: 1222 }, { x: 1666, y: 1950 }, { x: 1321, y: 1447 }, { x: 2021, y: 1780 }]) {
      expect(pickDetailCoastSurface({ tiles, sampleBaseElevation: sampler }, point)).toEqual(pickDetailCoastSurface({ tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation }, point));
    }
    expect(input.detailCoast.size).toBe(0); expect(new Int32Array(input.elevationsMeters).every(value => value === -2400)).toBe(true);
  });
});
