import { describe, expect, it } from 'vitest';
import { createLocalReliefBackground } from './detail-local-background';

const noWait = async () => {};
const q = (node: number) => node * 512;

describe('old real-land background for local mountain replacement', () => {
  it('preserves a flat old upland exactly across batches without rereading source nodes', async () => {
    const bounds = { left: 512, top: 512, right: 576, bottom: 560 };
    const run = async (batch: number) => {
      const reads = new Set<string>();
      const background = await createLocalReliefBackground({ ...bounds, readLandHeight: (x, y) => {
        const key = `${x}:${y}`; expect(reads.has(key)).toBe(false); reads.add(key); return 740;
      } }, batch, { yieldControl: noWait });
      expect(background.summary.sourceNodesRead).toBe(reads.size);
      expect(background.summary.reductionWork).toBeLessThanOrEqual(background.summary.reductionWorkBound);
      return background;
    };
    const a = await run(64), b = await run(2048);
    for (const [x, y] of [[512, 512], [513.25, 526.75], [527.125, 543.5], [576, 560]]) {
      expect(a.sample(q(x), q(y))).toBeCloseTo(740, 10); expect(b.sample(q(x), q(y))).toBe(a.sample(q(x), q(y)));
    }
    expect(a.summary).toEqual(b.summary);
  });

  it('does not let an isolated old summit lift the entire replacement background', async () => {
    const values = new Int16Array(113 * 113).fill(180), original = values.slice();
    values[56 * 113 + 56] = 11000; original[56 * 113 + 56] = 11000;
    const background = await createLocalReliefBackground({ left: 512, top: 512, right: 576, bottom: 576,
      readLandHeight: (x, y) => values[(y - 488) * 113 + x - 488] }, 128, { yieldControl: noWait });
    for (const [x, y] of [[512, 512], [535.5, 549.25], [544, 544], [560, 544], [576, 576]]) expect(background.sample(q(x), q(y))).toBeCloseTo(180, 10);
    expect(values).toEqual(original);
  });

  it('excludes sea and zero-coverage nodes instead of turning a small island into a lowland', async () => {
    const background = await createLocalReliefBackground({ left: 1000, top: 1000, right: 1032, bottom: 1032,
      readLandHeight: (x, y) => x >= 1014 && x <= 1018 && y >= 1014 && y <= 1018 ? 650 : null }, 128, { yieldControl: noWait });
    expect(background.summary.landNodesRead).toBe(25);
    expect(background.sample(q(1016), q(1016))).toBeCloseTo(650, 10);
    const sea = await createLocalReliefBackground({ left: 1000, top: 1000, right: 1008, bottom: 1008, readLandHeight: () => null }, 128, { yieldControl: noWait });
    expect(sea.summary.validGridAnchors).toBe(0); expect(sea.sample(q(1004), q(1004))).toBeUndefined();
  });

  it('uses the true lower quartile and continuous shared interpolation rather than independent blocks', async () => {
    const source = (x: number, y: number) => 100 + 2 * x + y + (x === 528 && y === 528 ? 9000 : 0);
    const background = await createLocalReliefBackground({ left: 512, top: 512, right: 552, bottom: 552, readLandHeight: source }, 128, { yieldControl: noWait });
    for (const [cx, cy] of [[512, 512], [520, 528], [544, 544]]) {
      // Independent sorted-window oracle plus the cubic basis exactly at an
      // anchor, where the neighbouring weights are [1,4,1]/6 on each axis.
      let expected = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const window: number[] = [];
        for (let y = cy + dy * 8 - 16; y <= cy + dy * 8 + 16; y++) for (let x = cx + dx * 8 - 16; x <= cx + dx * 8 + 16; x++) window.push(source(x, y));
        window.sort((a, b) => a - b);
        expected += window[Math.ceil(window.length / 4) - 1] * (dx ? 1 : 4) * (dy ? 1 : 4) / 36;
      }
      expect(background.sample(q(cx), q(cy))).toBeCloseTo(expected, 9);
    }
    for (const line of [520, 528, 536, 544]) {
      const left = background.sample(q(line) - 1, q(530.25))!, on = background.sample(q(line), q(530.25))!, right = background.sample(q(line) + 1, q(530.25))!;
      expect(Math.abs(left - on)).toBeLessThan(0.02); expect(Math.abs(right - on)).toBeLessThan(0.02);
      expect(Math.abs((on - left) - (right - on))).toBeLessThan(0.0001);
      const above = background.sample(q(530.25), q(line) - 1)!, below = background.sample(q(530.25), q(line) + 1)!;
      expect(Math.abs(above - below)).toBeLessThan(0.02);
    }
    expect(() => background.sample(q(511), q(528))).toThrow(/范围/);
  });

  it('clips world-edge windows without duplicated or outside reads', async () => {
    for (const edge of [0, 2040]) {
      const reads = new Set<string>();
      const background = await createLocalReliefBackground({ left: edge, top: edge, right: edge + 8, bottom: edge + 8, readLandHeight: (x, y) => {
        expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(2048); expect(y).toBeLessThanOrEqual(2048);
        const key = `${x}:${y}`; expect(reads.has(key)).toBe(false); reads.add(key); return 0;
      } }, 64, { yieldControl: noWait });
      expect(reads.size).toBe(33 ** 2); expect(background.sample(q(edge), q(edge))).toBe(0); expect(background.sample(q(edge + 8), q(edge + 8))).toBe(0);
    }
  });

  it('cancels real source-read and reduction work without altering the old source', async () => {
    for (const phase of ['read-local-old-land-background', 'reduce-local-old-land-background']) {
      const values = new Int16Array(113 * 113).fill(860), original = values.slice(), controller = new AbortController(); let reached = false;
      await expect(createLocalReliefBackground({ left: 512, top: 512, right: 576, bottom: 576,
        readLandHeight: (x, y) => values[(y - 488) * 113 + x - 488] }, 64, { signal: controller.signal, yieldControl: noWait,
        onProgress: current => { if (current === phase) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(values).toEqual(original);
    }
  });
});
