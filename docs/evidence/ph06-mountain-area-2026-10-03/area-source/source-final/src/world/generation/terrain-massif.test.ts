import { expect, it } from 'vitest';
import { createOrographyField, type OrographyChain } from './detail-orography';
import { createOrographyField as frozen22 } from './test-fixtures/preview22-orography/detail-orography';
import { createMassifField, MASSIF_LIMITS } from './terrain-massif';
import { createNaturalRelief } from './detail-natural-relief';

const q = (v: number) => v * 256;
const land = (x: number, y: number) => x >= q(800) && x <= q(2200) && y >= q(1000) && y <= q(2100);
const control = { yieldControl: async () => {} };
function chains(): OrographyChain[] {
  const anchor = (x: number, y: number, width: number, peak: number) => ({ xQ: q(x), yQ: q(y), widthQ: q(width), peakQ: peak,
    section: { leftReachQ: q(width), rightReachQ: q(width), leftShoulderQ: 1400, rightShoulderQ: 1400 } });
  return [{ group: 0, seed: 9811, sampleStepQ: 512, leeQ: 1, crossSection: 'fine-tree',
    anchors: [anchor(1000, 1500, 144, 1600), anchor(1450, 1500, 144, 3800), anchor(1900, 1500, 144, 1600)] },
  { group: 1, parentGroup: 0, seed: 9811, sampleStepQ: 512, leeQ: -1, crossSection: 'fine-tree',
    anchors: [anchor(1450, 1500, 80, 3000), anchor(1650, 1780, 80, 1800), anchor(1900, 1860, 64, 650)] }];
}

it('retains exact frozen22 unflagged legacy and fine-tree physical queries', async () => {
  for (const section of [undefined, 'fine-world', 'fine-tree'] as const) {
    const input = chains().slice(0, 1).map(chain => ({ ...chain, crossSection: section }));
    const candidate = await createOrographyField(input, land, 2048, control), old = await frozen22(input, land, 2048, control);
    expect(candidate.stats).toEqual(old.stats);
    for (let y = 1360; y <= 1640; y += 16) for (let x = 1020; x <= 1880; x += 16) expect(candidate.sample(q(x), q(y))).toEqual(old.sample(q(x), q(y)));
  }
});

it('builds a deterministic bounded branching valley forest within a connected mountain area', async () => {
  const field = await createOrographyField(chains().map(chain => ({ ...chain, landform: 'area-v2' })), land, 2048, control);
  if (!('massif' in field)) throw new Error('Area field not reached.');
  const area = field.massif, again = await createMassifField(chains(), land, 0, 131072, 2048, control);
  expect(field.stats.supportNodes).toBeLessThanOrEqual(4096); expect(field.stats.maximumBucketCandidates).toBeLessThanOrEqual(192);
  expect(field.stats.indexReferences).toBeLessThanOrEqual(262144); expect(field.stats.landProbes).toBeLessThanOrEqual(131072);
  for (const key of ['sourceTests', 'routingEdges', 'heapComparisons', 'spreadingTests', 'typedWorkingBytes', 'sampleTerms'] as const) expect(area.stats[key]).toBeLessThanOrEqual(MASSIF_LIMITS[key]);
  expect(area.stats.bodies).toBe(5); expect(area.stats.junctionsChecked).toBe(1); expect(area.junctions[0].heightQ).toBe(area.sample(q(1450), q(1500)).massQ);
  const { receiver, order, accumulation } = area.drainage, rank = new Uint32Array(order.length), children = new Uint8Array(order.length);
  for (let at = 0; at < order.length; at++) rank[order[at]] = at;
  for (let id = 0; id < receiver.length; id++) if (receiver[id] >= 0) {
    expect(rank[receiver[id]]).toBeLessThan(rank[id]); children[receiver[id]]++;
    expect(land(q(id % 257 * 16), q(Math.floor(id / 257) * 16))).toBe(true);
    expect(land(q(receiver[id] % 257 * 16), q(Math.floor(receiver[id] / 257) * 16))).toBe(true);
    expect(accumulation[receiver[id]]).toBeGreaterThanOrEqual(accumulation[id]);
  }
  expect(children.some(count => count >= 2)).toBe(true); expect(accumulation.some(count => count >= 32)).toBe(true);
  expect(Array.from(receiver)).toEqual(Array.from(again.drainage.receiver));
  // A mountain occupies real land outside the old 144-world support, on the
  // side opposite its branch. The actual generated field has positive relief.
  expect(area.sample(q(1450), q(1280)).massQ).toBeGreaterThan(100);
  for (let y = 1216; y <= 1920; y += 32) for (let x = 1008; x <= 1984; x += 32) {
    const center = area.sample(q(x), q(y)).massQ;
    expect(center).toBe(again.sample(q(x), q(y)).massQ); expect(Number.isFinite(center)).toBe(true); expect(center).toBeGreaterThanOrEqual(0);
    // Q8 samples immediately either side of every selected 16-world seam:
    // no discontinuity from the regional grid used for incision.
    expect(Math.abs(area.sample(q(x) - 1, q(y)).massQ - area.sample(q(x) + 1, q(y)).massQ)).toBeLessThan(1);
    expect(Math.abs(area.sample(q(x), q(y) - 1).massQ - area.sample(q(x), q(y) + 1).massQ)).toBeLessThan(1);
  }
  expect(() => area.sample(-1, q(1500))).toThrow();
  await expect(createMassifField(chains(), land, 131072 - MASSIF_LIMITS.cells + 1, 131072, 2048, control)).rejects.toThrow('总预算');
  const abort = new AbortController(); abort.abort();
  await expect(createMassifField(chains(), land, 0, 131072, 2048, { signal: abort.signal })).rejects.toBeDefined();
});

it('captures area inputs before callbacks and cancels during real valley work', async () => {
  const input = chains().map(chain => ({ ...chain, landform: 'area-v2' as const }));
  const first = await createOrographyField(input, land, 2048, control); let mutated = false;
  const second = await createOrographyField(input, land, 64, { yieldControl: async () => {
    if (!mutated) { mutated = true; input[0].seed = 0; input[0].anchors[1].xQ = q(900); input[0].anchors[1].peakQ = 1; input[0].anchors[1].section!.leftReachQ = 1; }
  } });
  expect(mutated).toBe(true); expect(second.stats).toEqual(first.stats);
  for (let y = 1200; y <= 1920; y += 24) for (let x = 1000; x <= 2000; x += 24) expect(second.sample(q(x), q(y))).toEqual(first.sample(q(x), q(y)));
  const abort = new AbortController(); let work = 0;
  await expect(createOrographyField(chains().map(chain => ({ ...chain, landform: 'area-v2' })), land, 64, { signal: abort.signal, yieldControl: control.yieldControl,
    onProgress: (phase, done) => { if (phase === 'massif-valley-forest' && done > 0) { work = done; abort.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
  expect(work).toBeGreaterThan(0);
});

it('keeps the old summary profile when fine planning produces no accepted mountain area', async () => {
  const size = 128, centersQ = new Int32Array(size * size * 2);
  for (let id = 0; id < size * size; id++) centersQ.set([q(id % size * 32 + 16), q(Math.floor(id / size) * 32 + 16)], id * 2);
  const actual = await createNaturalRelief({ seed: 9811, size, centersQ, land: new Uint8Array(size * size), coastDistanceQ: new Uint16Array(size * size),
    reliefMeters: 2400, shelfWidthWorld: 96, heightPlanning: 'fine-world', isLand: () => false }, 2048, control);
  expect(actual.summary.profile).toBe('branching-orography-v4'); expect(actual.massif).toBeUndefined();
  expect(actual.physicalHeight(q(1500), q(1500), false, q(100), -2400)).toBeLessThan(0);
});
