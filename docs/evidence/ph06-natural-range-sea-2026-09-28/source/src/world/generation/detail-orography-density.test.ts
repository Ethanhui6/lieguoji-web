import { expect, it, vi } from 'vitest';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe } from './detail-shape-natural';
import * as orography from './detail-orography';

const q = (value: number) => value * 256;
// The unchanged real regional-coast fixture that rejected its 193rd AABB
// candidate. The coast suite separately asserts its channel/neck protection.
const points = [[1000, 1000], [1440, 1000], [1440, 1320], [1452, 1320], [1452, 1000], [2000, 1000],
  [2000, 1720], [1672, 1720], [1672, 2100], [1660, 2100], [1660, 1720], [1000, 1720]].map(([x, y]) => ({ xQ: q(x), yQ: q(y) }));
function recipe(): NaturalDetailShapeRecipe {
  return { format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'regional-protect-channel-and-neck', pointsQ: points.map(p => ({ ...p })),
    coastStructureWorld: 96, coastRoughnessWorld: 32, reliefMeters: 2400, shelfWidthWorld: 128, islandChainCount: 0, islandsPerChain: 3 };
}
function base(): EmptyDetailShapeBase {
  const size = 128, centers = new Int32Array(size * size * 2), elevations = new Int32Array(size * size).fill(-2400);
  for (let id = 0; id < size * size; id++) centers.set([q((id % size) * 32 + 16), q(Math.floor(id / size) * 32 + 16)], id * 2);
  return { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: elevations.buffer,
    detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
}
type Field = Awaited<ReturnType<typeof orography.createOrographyField>>;

/** Bypass every index, rectangle-intersection predicate and production union.
 * Directly sum all real supports and then unnormalized run powers. */
function exhaustive(field: Field, x: number, y: number) {
  const smooth = (v: number) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };
  const bump = (v: number) => Math.abs(v) < 1 ? (1 - v * v) ** 3 : 0;
  const runs = field.ends.map(() => 0);
  for (const n of field.supports) {
    const dx = x - n.xQ, dy = y - n.yQ, across = -dx * n.ty + dy * n.tx, section = n.section!;
    const reach = across < 0 ? section.leftReachQ : section.rightReachQ;
    const shoulder = (across < 0 ? section.leftShoulderQ : section.rightShoulderQ) / 4096;
    const end = field.ends[n.run];
    const start = ((x - end.first.xQ) * end.first.tx + (y - end.first.yQ) * end.first.ty) / end.fadeQ + Number(end.branch);
    const finish = ((end.last.xQ - x) * end.last.tx + (end.last.yQ - y) * end.last.ty) / end.fadeQ;
    runs[n.run] += n.peakQ * n.weight * bump((dx * n.tx + dy * n.ty) / n.alongQ)
      * ((1 - shoulder) * bump(across / n.crestQ) + shoulder * bump(across / reach)) * smooth(start) * smooth(finish);
  }
  const maximum = Math.max(0, ...runs);
  return maximum >= 1e-3 ? runs.reduce((sum, h) => sum + h ** 64, 0) ** (1 / 64) - 1e-6
    : 1e-6 * ((1 + runs.reduce((sum, h) => sum + (h / 1e-6) ** 64, 0)) ** (1 / 64) - 1);
}

it('retains every actual regional ridge contribution while removing only empty AABB corners from fine-tree buckets', async () => {
  let captured: Field | undefined;
  const original = orography.createOrographyField;
  const spy = vi.spyOn(orography, 'createOrographyField').mockImplementationOnce(async (...args) => {
    captured = await original(...args); return captured;
  });
  try { await generateDetailShapeNatural({ base: base(), recipe: recipe() }, { batchWork: 512, yieldControl: async () => {} }); }
  finally { spy.mockRestore(); }
  expect(captured).toBeDefined(); const field = captured!;
  // The failure evidence contains these same 819 real supports and five runs.
  // Reducing branch/support count is not an acceptable density repair.
  expect(field.supports).toHaveLength(819); expect(field.curves).toHaveLength(5);
  expect(field.supports.every(n => !!n.section)).toBe(true);
  expect(field.stats.rejectedBranches).toBe(0);
  expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(192);
  expect(field.stats.indexReferences).toBeLessThanOrEqual(262144);
  expect(field.stats.supportNodes).toBeLessThanOrEqual(4096);
  let positiveQueries = 0;
  const compare = (x: number, y: number) => {
    const sample = field.sample(x, y), expected = exhaustive(field, x, y);
    expect(sample.massQ).toBeCloseTo(expected, 7);
    expect(sample.kernelTests).toBeLessThanOrEqual(192);
    if (expected > 0) positiveQueries++;
  };
  // Failed cluster plus surrounding buckets: exact edges/corners, with both
  // axes independently shifted by one Q8 unit to exercise either ownership.
  for (let y = 1248; y <= 1568; y += 32) for (let x = 1152; x <= 1472; x += 32) {
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) compare(q(x) + dx, q(y) + dy);
  }
  // Every real ribbon's rotated support corners and neighbouring Q8 points.
  // These are computed independently from support data, not index internals.
  for (const n of field.supports) for (const direction of [-1, 1]) {
    const along = direction * n.alongQ;
    for (const across of [-Math.max(n.section!.leftReachQ, n.crestQ), Math.max(n.section!.rightReachQ, n.crestQ)]) {
      const x = Math.round(n.xQ + n.tx * along - n.ty * across), y = Math.round(n.yQ + n.ty * along + n.tx * across);
      for (const delta of [-1, 0, 1]) compare(x + delta, y + delta);
    }
  }
  expect(positiveQueries).toBeGreaterThan(100);
}, 60000);
