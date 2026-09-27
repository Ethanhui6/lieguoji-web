import { expect, it } from 'vitest';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe } from '../../../src/world/generation/detail-shape-natural';
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

it('captures the unchanged real protected-channel relief density refusal', async () => {
  await expect(generateDetailShapeNatural({ base: base(), recipe: recipe() }, { batchWork: 512, yieldControl: async () => {} })).rejects.toThrow('山系局部密度超出有界查询预算。');
}, 60000);
