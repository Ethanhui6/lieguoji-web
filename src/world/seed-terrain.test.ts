import { describe, expect, it, vi } from 'vitest';
import { generateTerrainResearch, SEED_TERRAIN_TEMPLATES, validSeedTerrainRequest, type SeedTerrainRequest } from './seed-terrain';
import { parseTerrainImport } from './terrain-import';
import { researchForLayout } from './recovered-terrain/research';
import { createTerrainTopology } from './recovered-terrain/topology';
import { generateRecoveredHeights, RECOVERED_WORK_LIMIT, type RecoveredGraph } from './recovered-terrain/engine';
import { boundedIndices, finiteMean, firstMinimumIndex } from './recovered-terrain/numeric';

const fast = { yieldTask: async () => {} };
const request = (seed = '421730'): SeedTerrainRequest => ({ seed, template: 'archipelago', layout: 'square-v1' });
const read = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as {
  width: number; height: number; heights: number[]; count: number; hash: string; topologyHash: string;
  topologyMs: number; generationMs: number; elapsedMs: number; id: number;
};

describe('reviewed local seed terrain', () => {
  it('preserves classic research numeric hashes while the public request only admits square-v1', async () => {
    const bytes = await researchForLayout('421730', 'archipelago', 'classic-v1', fast), raw = read(bytes);
    expect(raw.hash).toBe('491e2fb4a7242724ee0462b965657f8d43581f67e47a4ef1430a5cbab3eb59a4');
    expect(raw.topologyHash).toBe('ede5a394c6957c7eef5f7fd31061732ec3708491d2015e5061057f395e2072cf');
    const parsed = await parseTerrainImport(bytes, fast);
    expect(parsed.summary).toMatchObject({ pointCount: 24576, triangleCount: 48514, width: 1536, height: 1024 });
    expect(validSeedTerrainRequest({ ...request(), layout: 'classic-v1' })).toBe(false);
  }, 120000);

  it.each(SEED_TERRAIN_TEMPLATES.flatMap(template => ['421730', '列国纪-验收-2'].map(seed => ({ template: template.id, seed }))))(
    'generates and independently verifies the complete square mesh for $template / $seed', async ({ template, seed }) => {
      const bytes = await generateTerrainResearch({ seed, template, layout: 'square-v1' }, fast), raw = read(bytes);
      const parsed = await parseTerrainImport(bytes, fast);
      expect(parsed.summary).toMatchObject({ pointCount: 36864, triangleCount: 72962, width: 1536, height: 1536,
        mapping: { offsetX: 0, offsetY: 0, width: 4096, height: 4096 } });
      expect(raw).toMatchObject({ id: 1, topologyMs: 0, generationMs: 0, elapsedMs: 0 });
      expect(raw.heights.length).toBe(36864); expect(raw.heights.some(height => height < 20)).toBe(true); expect(raw.heights.some(height => height > 20)).toBe(true);
      expect(raw.heights.every(height => Number.isInteger(height) && height >= 0 && height <= 100)).toBe(true);
      expect(bytes.byteLength).toBeLessThanOrEqual(12 * 1024 * 1024);
    }, 120000,
  );

  it('is byte-deterministic across interleaved requests without reading or replacing global Math.random', async () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Ambient random must not be read'); });
    try {
      const owned = request(), expected = { ...owned };
      let mutated = false;
      const first = generateTerrainResearch(owned, { yieldTask: async () => { if (!mutated) { owned.seed = 'caller-changed'; owned.template = 'pangea'; mutated = true; } } });
      const second = generateTerrainResearch({ seed: 'other-world', template: 'highIsland', layout: 'square-v1' }, fast);
      const [a, b] = await Promise.all([first, second]), repeated = await generateTerrainResearch(expected, fast);
      expect(a).toEqual(repeated); expect(read(a).hash).not.toBe(read(b).hash); expect(Math.random).toBe(random); expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  }, 120000);

  it('rejects script/graph/unknown fields and seed/template/capacity mutations before doing work', async () => {
    const invalid: unknown[] = [null, [], {}, { ...request(), seed: '' }, { ...request(), seed: ' ' }, { ...request(), seed: ' abc' },
      { ...request(), seed: 'a'.repeat(81) }, { ...request(), seed: 'a\u0000b' }, { ...request(), seed: 42 }, { ...request(), template: 'MoreWorldV8' },
      { ...request(), layout: 'classic-v1' }, { ...request(), points: [] }, { ...request(), script: 'Math.random=()=>1' }, { ...request(), initialHeights: [] },
      { ...request(), workLimit: Infinity }, { ...request(), cellsX: 1000000 }];
    for (const value of invalid) {
      expect(validSeedTerrainRequest(value)).toBe(false);
      await expect(generateTerrainResearch(value as SeedTerrainRequest, { yieldTask: async () => { throw new Error('Should not start generation'); } })).rejects.toThrow('参数无效');
    }
    const overCapacity: RecoveredGraph = { width: 1536, height: 1536, cellsX: 50001, cellsY: 1, points: Array(50001).fill([0, 0]), neighbors: [] };
    await expect(generateRecoveredHeights(overCapacity, '421730', 'archipelago', fast)).rejects.toThrow('工作上限');
  });

  it('cancels at topology and generation checkpoints and rejects an exhausted deterministic work budget', async () => {
    for (const target of ['建立种子地形点网', '生成种子地形']) {
      const abort = new AbortController(), stages: string[] = [];
      await expect(generateTerrainResearch(request(), { ...fast, signal: abort.signal, onProgress: progress => {
        stages.push(progress.stage); if (progress.stage === target) abort.abort();
      } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(stages).toContain(target);
    }
    const abort = new AbortController(); abort.abort();
    await expect(generateTerrainResearch(request(), { ...fast, signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const topology = await createTerrainTopology('classic-v1', fast);
    await expect(generateRecoveredHeights(topology, '421730', 'archipelago', { ...fast, workLimit: 1 })).rejects.toThrow('工作预算');
    await expect(generateRecoveredHeights(topology, '421730', 'archipelago', { ...fast, workLimit: RECOVERED_WORK_LIMIT + 1 })).rejects.toThrow('工作上限');
  }, 120000);

  it('uses finite project numeric operations with stable ties and bounded loops', () => {
    expect(finiteMean([4, 3, 7, 0])).toBe(3.5); expect(() => finiteMean([])).toThrow(); expect(() => finiteMean([NaN])).toThrow();
    expect(firstMinimumIndex([5, 2, 2], (a, b) => a - b)).toBe(1); expect(() => firstMinimumIndex([], (a, b) => a - b)).toThrow();
    expect(boundedIndices(3)).toEqual([0, 1, 2]); for (const invalid of [-1, 1.5, Infinity, 50001]) expect(() => boundedIndices(invalid)).toThrow();
  });
});
