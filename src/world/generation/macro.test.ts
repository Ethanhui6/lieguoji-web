import { beforeAll, describe, expect, it } from 'vitest';
import { cloneBlock, hashBlock } from '../model';
import type { AtlasBlock, AtlasSize, BlockKey } from '../model';
import { createGenerationDraft } from '../generation-format';
import type { AtlasGenerationDocument, GenerationScope, MacroRecipe } from '../generation-contract';
import { getCellQuad, getVertexPositionQ, vertexSlotLocation } from '../topology';
import { MACRO_GENERATOR_FINGERPRINT } from './fingerprint';
import { generateMacro } from './macro';
import type { GenerationOutput } from './macro';
import { inspectGeneration } from './quality';

const noWait = { yieldTask: async () => {} };
const ids = { draftId: 'atlas-11111111-1111-4111-8111-111111111111', atlasId: 'geo-22222222-2222-4222-8222-222222222222' };
const recipe = (majorContinents = 6, landCoveragePermille = 650, seed = '山海-72', coastWavelengthWorld = 384, reliefMeters = 2600): MacroRecipe => ({
  format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed,
  parameters: { majorContinents, landCoveragePermille, coastWavelengthWorld, reliefMeters },
});
const fresh = (size: AtlasSize = 128) => createGenerationDraft({ ...ids, size, seed: 'macro-shared-geometry', name: '大陆生成测试' }, noWait);
const input = (base: AtlasGenerationDocument, value = recipe()) => ({ base, recipe: value, scope: { kind: 'world' as const } });
async function hashes(blocks: Map<BlockKey, AtlasBlock>) {
  return Promise.all([...blocks].sort(([a], [b]) => a.localeCompare(b)).map(async ([key, value]) => [key, await hashBlock(value)]));
}
/** A separate oracle uses polygon world-coordinate shoelaces and its own
 * row/column BFS. It never consumes the generator's territories or area arrays. */
function independent(base: AtlasGenerationDocument, generated: GenerationOutput) {
  const data = { ...base, blocks: generated.blocks }, size = base.manifest.spec.columns, count = size * size;
  const land = new Uint8Array(count), seen = new Uint8Array(count); let worldArea = 0, landArea = 0, maxArea = 0, components = 0, landCells = 0;
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    const id = row * size + column, points = getCellQuad(data, id);
    const area = points.reduce((sum, point, index) => { const next = points[(index + 1) % 4]; return sum + point.x * next.y - next.x * point.y; }, 0) * 256 ** 2;
    const elevation = generated.blocks.get(`elevation:${Math.floor(column / 32)}:${Math.floor(row / 32)}`)!;
    if (elevation.layer !== 'elevation') throw new Error('Wrong test elevation');
    worldArea += area; maxArea = Math.max(maxArea, area);
    if (elevation.values[row % 32 * 32 + column % 32] >= 0) { land[id] = 1; landArea += area; landCells++; }
  }
  for (let first = 0; first < count; first++) if (land[first] && !seen[first]) {
    components++; const queue = [first]; seen[first] = 1;
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head], x = id % size, y = Math.floor(id / size);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const next = ny * size + nx; if (land[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
  }
  return { worldArea, landArea, maxArea, components, landCells };
}
let base: AtlasGenerationDocument;
beforeAll(async () => { base = await fresh(); }, 30000);

describe('real competing continents and continuous branched elevations', () => {
  for (const [continents, coverage, seed, wave] of [
    [1, 150, 'single-low', 1024], [1, 650, 'single-high', 128], [2, 450, 'two-currents', 512], [3, 450, 'three-shores', 384],
    [4, 450, 'four-corners', 768], [5, 450, 'five-bays', 256], [6, 150, 'six-low', 1024], [6, 650, '山海-72', 128],
    [6, 650, '非矩形大陆', 768], [6, 650, 'irregular-voronoi-19', 512],
  ] as const) it(`independently measures ${continents} continents at ${coverage}‰ for ${seed}`, async () => {
    const value = recipe(continents, coverage, seed, wave, 6000), generated = await generateMacro(input(base, value), noWait), actual = independent(base, generated);
    expect(actual.components).toBe(continents);
    expect(Math.abs(1000 * actual.landArea - coverage * actual.worldArea)).toBeLessThanOrEqual(1000 * actual.maxArea);
    expect(actual.worldArea).toBe(2 * (4096 * 256) ** 2);
    expect(generated.summary.landAreaQ2).toBe(actual.landArea);
    expect(generated.diagnostics.componentCells.every(count => count > 20)).toBe(true);
    expect(generated.summary.maxElevationMeters).toBe(6000); expect(generated.summary.minElevationMeters).toBe(-3000);
    expect(generated.diagnostics.coastlineEdges).toBeGreaterThan(100);
    expect(generated.changedKeys.every(key => key.startsWith('elevation:'))).toBe(true);
  }, 30000);

  it('has identical geographic bytes under different cooperative schedules and never changes the baseline', async () => {
    const before = await hashes(base.blocks), manifest = structuredClone(base.manifest);
    const a = await generateMacro(input(base), { ...noWait, batchCells: 64 });
    const b = await generateMacro(input(base), { ...noWait, batchCells: 8192 });
    expect(await hashes(a.blocks)).toEqual(await hashes(b.blocks)); expect(a.summary).toEqual(b.summary);
    expect(await hashes(base.blocks)).toEqual(before); expect(base.manifest).toEqual(manifest); expect(base.locks.size).toBe(0);
    for (const [key, block] of a.blocks) if (block.layer !== 'elevation') expect(block).toBe(base.blocks.get(key));
    const changed = a.blocks.get(a.changedKeys[0])!; if (changed.layer !== 'elevation') throw new Error('Wrong test layer'); changed.values.fill(999);
    expect(await hashes(base.blocks)).toEqual(before);
  }, 30000);

  it('uses one world-coordinate layout on all three real grid sizes with the same exact gates', async () => {
    const value = recipe(6, 650, 'three-real-scales', 1024, 200); let sites: [number, number][] | undefined;
    for (const size of [128, 256, 512] as const) {
      const draft = size === 128 ? base : await fresh(size), generated = await generateMacro(input(draft, value), noWait), actual = independent(draft, generated);
      if (sites) expect(generated.diagnostics.sitesQ).toEqual(sites); sites = generated.diagnostics.sitesQ;
      expect(actual.components).toBe(6); expect(Math.abs(1000 * actual.landArea - 650 * actual.worldArea)).toBeLessThanOrEqual(1000 * actual.maxArea);
      expect(generated.summary.maxElevationMeters).toBe(200); expect(actual.landCells).toBeGreaterThan(size * size * .6);
    }
  }, 90000);

  it('responds to seed, absolute wavelength and relief parameters with real changed elevation data', async () => {
    const a = await generateMacro(input(base, recipe(3, 450, 'field-controls', 128, 200)), noWait);
    const b = await generateMacro(input(base, recipe(3, 450, 'field-controls', 1024, 200)), noWait);
    const c = await generateMacro(input(base, recipe(3, 450, 'field-controls', 128, 6000)), noWait);
    const d = await generateMacro(input(base, recipe(3, 450, 'other-seed', 128, 200)), noWait);
    expect(await hashes(a.blocks)).not.toEqual(await hashes(b.blocks)); expect(await hashes(a.blocks)).not.toEqual(await hashes(c.blocks)); expect(await hashes(a.blocks)).not.toEqual(await hashes(d.blocks));
    expect(independent(base, a).landArea).toBe(independent(base, c).landArea); expect(a.diagnostics.sitesQ).not.toEqual(d.diagnostics.sitesQ);
  }, 30000);

  it('honors actual edited shared quads rather than nominal cell counts', async () => {
    const edited = await fresh(), size = edited.manifest.spec.columns, vertex = 64 * (size + 1) + 64;
    const position = getVertexPositionQ(edited, vertex), { key, slot } = vertexSlotLocation(edited.manifest.spec, vertex), block = cloneBlock(edited.blocks.get(key)!);
    if (block.layer !== 'geometry') throw new Error('Wrong geometry fixture');
    block.xyQ[2 * slot] = 64 * 4096 * 256 / size + 4096 * 256 / size / 4; block.xyQ[2 * slot + 1] = position.yQ;
    edited.blocks.set(key, block); edited.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(block);
    const generated = await generateMacro(input(edited), noWait), actual = independent(edited, generated);
    expect(actual.components).toBe(6); expect(Math.abs(1000 * actual.landArea - 650 * actual.worldArea)).toBeLessThanOrEqual(1000 * actual.maxArea);
    expect(actual.landArea).not.toBe(actual.landCells * actual.worldArea / size ** 2);
    expect(generated.blocks.get(key)).toBe(block);
  }, 30000);

  it('rejects empty seas, all-zero land and scattered isolated cells using final data', async () => {
    await expect(inspectGeneration(base, recipe().parameters, noWait)).rejects.toThrow('连通分量');
    const blocks = new Map(base.blocks);
    for (const [key, original] of blocks) if (original.layer === 'elevation') { const block = cloneBlock(original); block.values.fill(0); blocks.set(key, block); }
    await expect(inspectGeneration({ manifest: base.manifest, blocks }, recipe(1, 450).parameters, noWait)).rejects.toThrow('面积误差');
    for (const block of blocks.values()) if (block.layer === 'elevation') for (let slot = 0; slot < 1024; slot++) block.values[slot] = slot % 2 === 0 && Math.floor(slot / 32) % 2 === 0 ? 1 : -1;
    await expect(inspectGeneration({ manifest: base.manifest, blocks }, recipe(6, 450).parameters, noWait)).rejects.toThrow('连通分量');
  }, 30000);

  it('rejects unknown fingerprints, out-of-range parameters, local scope and nonzero locks before any output', async () => {
    for (const value of [recipe(0), recipe(7), recipe(6, 149), recipe(6, 651), recipe(6, 650, 'x', 127), recipe(6, 650, 'x', 1025), recipe(6, 650, 'x', 128, 199), recipe(6, 650, 'x', 128, 6001)]) await expect(generateMacro(input(base, value), noWait)).rejects.toThrow('配方');
    const changed = recipe(); changed.generator.fingerprint = '0'.repeat(64); await expect(generateMacro(input(base, changed), noWait)).rejects.toThrow('指纹');
    await expect(generateMacro({ ...input(base), scope: { kind: 'cell-rectangle' } as unknown as GenerationScope }, noWait)).rejects.toThrow('范围');
    const locked = { ...base, locks: new Map([['lock:0:0', { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 0, by: 0, flags: new Uint8Array(1024).fill(1) }]]) };
    await expect(generateMacro(input(locked), noWait)).rejects.toThrow('区域锁');
  });

  it('cancels real work in geometry, field, growth, distance, output and final audit without mutating input', async () => {
    const before = await hashes(base.blocks);
    for (const stage of ['读取真实共享地理', '构造连续分枝与海岸势场', '按真实面积连通生成大陆', '传播连续陆地与海底岸距', '写入私有连续高程候选', '独立核验实际面积与高程']) {
      const aborter = new AbortController(); let observed = false;
      await expect(generateMacro(input(base), { ...noWait, signal: aborter.signal, onProgress: progress => {
        expect(progress.completed).toBeGreaterThanOrEqual(0); expect(progress.completed).toBeLessThanOrEqual(progress.total);
        if (progress.stage === stage) { observed = true; aborter.abort(new Error('intentional-stage-cancel')); }
      } })).rejects.toThrow('intentional-stage-cancel');
      expect(observed).toBe(true); expect(await hashes(base.blocks)).toEqual(before);
    }
    const aborter = new AbortController(); setTimeout(() => aborter.abort(new Error('real-event-loop-cancel')), 0);
    await expect(generateMacro(input(base), { signal: aborter.signal })).rejects.toThrow('real-event-loop-cancel');
    expect(await hashes(base.blocks)).toEqual(before);
  }, 30000);
});
