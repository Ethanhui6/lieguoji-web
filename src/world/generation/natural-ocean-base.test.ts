import { beforeAll, describe, expect, it } from 'vitest';
import { createAtlasDraft } from '../model';
import { measureGeography } from './quality';
import { createNaturalOceanBase, NATURAL_OCEAN_BASE_PROFILE, NATURAL_OCEAN_BASE_SEED_DOMAIN } from './natural-ocean-base';

const size = 128, fast = { yieldTask: async () => {} }, seed = 'natural-ocean-real-centroids';
let centersQ: ArrayBuffer;
beforeAll(async () => {
  const draft = await createAtlasDraft({ size, name: '真实粗格重心海床夹具', seed: 'natural-ocean-quad-geometry' }, fast);
  centersQ = (await measureGeography(draft, fast)).xyQ.buffer as ArrayBuffer;
});

describe('fixed first-natural@2 coarse ocean base', () => {
  it('samples real centroid coordinates into bounded, spatially coherent negative depths with the stated mean', async () => {
    const original = centersQ.slice(0), progress: { stage: string; completed: number; total: number }[] = [];
    const heights = await createNaturalOceanBase({ size, centersQ, seed }, { ...fast, onProgress: value => progress.push(value) });
    expect(NATURAL_OCEAN_BASE_PROFILE).toBe('natural-ocean-base-v1'); expect(NATURAL_OCEAN_BASE_SEED_DOMAIN).toBe('natural-ocean-base@1\0');
    expect(heights).toBeInstanceOf(Int32Array); expect(heights.length).toBe(size * size); expect(centersQ).toEqual(original);
    let min = Infinity, max = -Infinity, sum = 0, horizontalDifference = 0, pairs = 0;
    for (let id = 0; id < heights.length; id++) {
      const height = heights[id]; expect(height).toBeGreaterThanOrEqual(-6500); expect(height).toBeLessThanOrEqual(-1200);
      min = Math.min(min, height); max = Math.max(max, height); sum += height;
      if (id % size !== size - 1) { horizontalDifference += Math.abs(height - heights[id + 1]); pairs++; }
    }
    expect(Math.abs(sum / heights.length + 3800)).toBeLessThanOrEqual(0.5);
    expect(max - min).toBeGreaterThan(1000); expect(horizontalDifference / pairs).toBeLessThan((max - min) / 8);
    for (const stage of ['采样自然海盆与海岭', '校准自然海床深度']) {
      const selected = progress.filter(value => value.stage === stage);
      expect(selected.map(value => value.completed)).toEqual(Array.from({ length: size * size / 1024 }, (_, index) => (index + 1) * 1024));
      expect(selected.every(value => value.total === size * size)).toBe(true);
    }
    // Keep every row-major identity but move actual centroids within their legal
    // coarse cells. A per-cell random value or nominal-grid substitute fails.
    const shifted = new Int32Array(original.slice(0));
    for (let id = 0; id < heights.length; id++) shifted[id * 2] += 4096 * 256 / size / 8;
    const moved = await createNaturalOceanBase({ size, centersQ: shifted.buffer, seed }, fast);
    expect(moved).not.toEqual(heights);
  });

  it('is deterministic and captures the caller buffer before yielding without retaining output aliases', async () => {
    const input = { size, centersQ: centersQ.slice(0), seed } as const;
    const expected = await createNaturalOceanBase(input, fast);
    let release!: () => void, calls = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = createNaturalOceanBase(input, { yieldTask: async () => { if (++calls === 1) await gate; } });
    new Int32Array(input.centersQ).fill(0); release();
    const result = await pending;
    expect(result).toEqual(expected); expect(result.buffer).not.toBe(expected.buffer);
    result.fill(-1);
    expect(await createNaturalOceanBase({ size, centersQ, seed }, fast)).toEqual(expected);
    expect(await createNaturalOceanBase({ size, centersQ, seed: seed + '-another' }, fast)).not.toEqual(expected);
  });

  it('rejects cancellation in either actual work pass without exposing a partial result or modifying input', async () => {
    const original = centersQ.slice(0);
    for (const cancelledStage of ['采样自然海盆与海岭', '校准自然海床深度']) {
      const controller = new AbortController(), progress: { stage: string; completed: number }[] = [];
      await expect(createNaturalOceanBase({ size, centersQ, seed }, { ...fast, signal: controller.signal, onProgress: value => {
        progress.push(value);
        if (value.stage === cancelledStage && value.completed === 1024) controller.abort();
      } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(progress.at(-1)).toMatchObject({ stage: cancelledStage, completed: 1024 });
      expect(centersQ).toEqual(original);
    }
    const controller = new AbortController(); controller.abort();
    await expect(createNaturalOceanBase({ size, centersQ, seed }, { ...fast, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
