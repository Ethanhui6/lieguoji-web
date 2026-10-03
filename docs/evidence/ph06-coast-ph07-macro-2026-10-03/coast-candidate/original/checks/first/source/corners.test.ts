import { describe, expect, it } from 'vitest';
import { roundAndIndexNaturalOutline as baseline, naturalFacingSeparation } from './baseline/detail-natural-outline';
import { roundAndIndexNaturalOutline as candidate } from './runtime/detail-natural-outline';
import { prepareInput, q, fast, exactDistance, loadCapturedOutline } from './input';

const counters = () => ({ outlineEdgeTests: 0 });
const data = (outline: Awaited<ReturnType<typeof baseline>>) => ({ edges: outline.edges, caps: outline.caps, area2: outline.area2, perimeter: outline.perimeter, roundedCorners: outline.roundedCorners });
describe('isolated adaptive corner candidate', () => {
  it('extends tangent transitions on wide long shores while conserving the entire chord envelope', async () => {
    const fixtures = [q([[800, 800], [1800, 800], [1800, 1800], [800, 1800]]),
      q([[800, 800], [2100, 1200], [1600, 2000], [1200, 1500], [800, 2000]]),
      q([[800, 800], [1600, 850], [2200, 1800], [1400, 2100], [700, 1500]])];
    for (const points of fixtures) {
      const input = { ...prepareInput(points), caps: points.map(() => 112 * 256) }, owned = structuredClone(input);
      const old = await baseline(input, 128, fast, counters()), next = await candidate(input, 128, fast, counters());
      expect(next.edges).not.toEqual(old.edges); expect(Math.sign(next.area2)).toBe(Math.sign(input.area2));
      expect(Math.max(...next.edges.map(edge => edge.length))).toBeLessThan(Math.max(...old.edges.map(edge => edge.length)));
      for (const [i, edge] of next.edges.entries()) for (let step = 0; step <= 32; step++) {
        const t = step / 32, x = edge.a.xQ + (edge.b.xQ - edge.a.xQ) * t, y = edge.a.yQ + (edge.b.yQ - edge.a.yQ) * t;
        const remaining = next.caps[i] * (1 - t) + next.caps[(i + 1) % next.caps.length] * t;
        expect(remaining).toBeGreaterThanOrEqual(0);
        expect(exactDistance(points, x, y) + remaining).toBeLessThanOrEqual(112 * 256);
      }
      expect(input).toEqual(owned);
    }
  });
  it('retains exact legacy output for short shores and insufficient caps or structure', async () => {
    const shapes = [prepareInput(q([[1000, 1000], [1100, 1000], [1100, 1100], [1000, 1100]])),
      { ...prepareInput(q([[800, 800], [1800, 800], [1800, 1800], [800, 1800]])), caps: [31, 31, 31, 31].map(n => n * 256) },
      prepareInput(q([[800, 800], [1800, 800], [1800, 1800], [800, 1800]]), 0, 16),
      prepareInput(q([[800, 800], [1800, 800], [1800, 1800], [800, 1800]]), 31, 16)];
    for (const input of shapes) expect(data(await candidate(input, 64, fast, counters()))).toEqual(data(await baseline(input, 64, fast, counters())));
  });
  it('uses neighboring source endpoint caps when a wide corner borders unequal caps', async () => {
    const points = q([[800, 800], [1800, 800], [1800, 1800], [800, 1800]]);
    const input = { ...prepareInput(points), caps: [72, 112, 96, 80].map(n => n * 256) };
    const next = await candidate(input, 128, fast, counters());
    for (const [i, edge] of next.edges.entries()) for (let step = 0; step <= 32; step++) {
      const t = step / 32, x = edge.a.xQ + (edge.b.xQ - edge.a.xQ) * t, y = edge.a.yQ + (edge.b.yQ - edge.a.yQ) * t;
      const remaining = next.caps[i] * (1 - t) + next.caps[(i + 1) % next.caps.length] * t;
      const fitsAnOriginalEdgeBudget = points.some((a, id) => {
        const b = points[(id + 1) % points.length], dx = b.xQ - a.xQ, dy = b.yQ - a.yQ;
        const projection = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / (dx * dx + dy * dy)));
        const distance = Math.hypot(x - a.xQ - dx * projection, y - a.yQ - dy * projection);
        return distance + remaining <= Math.min(input.caps[id], input.caps[(id + 1) % input.caps.length]);
      });
      expect(fitsAnOriginalEdgeBudget).toBe(true);
    }
  });
  it('retains both sides of a 12-world channel and a 12-world neck with original caps', async () => {
    const channel = q([[1200, 1200], [1268, 1200], [1268, 1248], [1280, 1248], [1280, 1200], [1380, 1200], [1380, 1360], [1200, 1360]]);
    const neck = q([[1000, 1000], [1200, 1000], [1200, 1094], [1400, 1094], [1400, 1000], [1600, 1000], [1600, 1200], [1400, 1200], [1400, 1106], [1200, 1106], [1200, 1200], [1000, 1200]]);
    expect(naturalFacingSeparation(channel, 1, 3)).toBe(12 * 256);
    expect(naturalFacingSeparation(neck, 2, 8)).toBe(12 * 256);
    for (const [points, probe, inside] of [[channel, [1274, 1220], false], [neck, [1300, 1100], true]] as const) {
      const input = prepareInput(points), old = await baseline(input, 128, fast, counters()), next = await candidate(input, 128, fast, counters());
      expect(Math.min(...input.caps)).toBe(3 * 256 - 2);
      expect(next.inside(probe[0] * 256, probe[1] * 256)).toBe(inside);
      // Compare the protected corridor's exact query distance, cap and sign.
      for (let offset = -5; offset <= 5; offset++) {
        const x = (probe[0] + (inside ? 0 : offset)) * 256, y = (probe[1] + (inside ? offset : 0)) * 256;
        const a = old.nearest(x, y), b = next.nearest(x, y);
        expect(b.distance).toBe(a.distance); expect(next.caps[b.edge]).toBe(old.caps[a.edge]); expect(next.inside(x, y)).toBe(old.inside(x, y));
      }
    }
  });
  it('keeps captured-input determinism and cancellation without changing caller data', async () => {
    const { input } = loadCapturedOutline(), owned = structuredClone(input), controller = new AbortController();
    await expect(candidate(input, 64, { signal: controller.signal, onProgress: () => controller.abort(), yieldControl: async () => {} }, counters())).rejects.toMatchObject({ name: 'AbortError' });
    expect(input).toEqual(owned);
    const first = await candidate(input, 64, fast, counters()), second = await candidate(input, 256, fast, counters());
    const old = await baseline(input, 128, fast, counters());
    expect(data(first)).toEqual(data(second)); expect(first.edges).not.toEqual(old.edges);
    expect(first.edges.length).toBeLessThanOrEqual(16384); expect(first.caps.every(cap => cap >= 0)).toBe(true);
    expect(Math.sign(first.area2)).toBe(Math.sign(old.area2)); expect(input).toEqual(owned);
  });
});
