import { describe, expect, it, vi } from 'vitest';
import { placeCountryLabel, pointInsideCountryLand, type CountryLabelPoint } from './label-placement';

const point = (id: number) => ({ xQ: id * 2 + 1, yQ: 100 });
const cells = (columns: number, x: number, y: number, width: number, height: number) => Array.from({ length: width * height }, (_, index) => (y + Math.floor(index / width)) * columns + x + index % width);
const pause = async () => {};
const box = (x: number, y: number, width: number, height: number): CountryLabelPoint[] => [{ xQ: x, yQ: y }, { xQ: x + width, yQ: y }, { xQ: x + width, yQ: y + height }, { xQ: x, yQ: y + height }];
const inside = (polygon: CountryLabelPoint[], p: CountryLabelPoint) => polygon.every((a, index) => { const b = polygon[(index + 1) % polygon.length]; return (b.xQ - a.xQ) * (p.yQ - a.yQ) - (b.yQ - a.yQ) * (p.xQ - a.xQ) > 0; });

describe('country display label placement', () => {
  it('anchors inside the deepest part of the largest component, not between it and an enclave', async () => {
    const owned = [...cells(20, 2, 1, 7, 5), ...cells(20, 15, 6, 2, 2)], snapshot = [...owned], resolve = vi.fn(point);
    const placed = await placeCountryLabel({ columns: 20, rows: 10, ownedCellIds: owned }, resolve);
    expect(placed).toEqual({ cellId: 65, pointQ: point(65), depth: 2, componentCells: 35 });
    expect(resolve.mock.calls).toEqual([[65]]); expect(owned).toEqual(snapshot);
  });

  it('breaks equal component, depth and centre-distance ties by stable cell IDs, independent of input ordering', async () => {
    const owned = [...cells(10, 1, 1, 2, 2), ...cells(10, 7, 6, 2, 2)];
    const first = await placeCountryLabel({ columns: 10, rows: 10, ownedCellIds: owned }, point);
    expect(first?.cellId).toBe(11); expect(first?.componentCells).toBe(4);
    expect(await placeCountryLabel({ columns: 10, rows: 10, ownedCellIds: [...owned].reverse() }, point)).toEqual(first);
    expect((await placeCountryLabel({ columns: 4, rows: 2, ownedCellIds: [4, 3] }, point))?.componentCells).toBe(1);
    expect((await placeCountryLabel({ columns: 4, rows: 2, ownedCellIds: [4, 3] }, point))?.cellId).toBe(3);
  });

  it('uses an actual clipped coastal fragment even when the quad centre and land union centre lie in sea', async () => {
    const polygons = [box(0, 0, 8, 20), box(24, 0, 8, 20)], before = structuredClone(polygons);
    const derived = pointInsideCountryLand(polygons)!;
    expect(polygons.some(polygon => inside(polygon, derived))).toBe(true);
    expect(derived).toEqual({ xQ: 4, yQ: 10 }); expect(polygons).toEqual(before);
    const placed = await placeCountryLabel({ columns: 1, rows: 1, ownedCellIds: [0] }, () => derived);
    expect(placed?.pointQ).toEqual(derived); expect(placed?.pointQ).not.toBe(derived);
    expect(pointInsideCountryLand([...polygons].reverse())).toEqual(derived);
  });

  it('tries ranked real-land candidates within the main component, with no centre or enclave fallback', async () => {
    const owned = [...cells(8, 0, 0, 3, 3), 63], asked: number[] = [];
    const placed = await placeCountryLabel({ columns: 8, rows: 8, ownedCellIds: owned }, id => { asked.push(id); return id === 1 ? point(id) : null; });
    expect(asked).toEqual([9, 1]); expect(placed?.cellId).toBe(1);
    const missing = vi.fn(() => null);
    expect(await placeCountryLabel({ columns: 8, rows: 8, ownedCellIds: owned }, missing)).toBeNull();
    expect(missing.mock.calls).toHaveLength(9); expect(missing.mock.calls.flat()).not.toContain(63);
    expect(await placeCountryLabel({ columns: 8, rows: 8, ownedCellIds: [] }, missing)).toBeNull();
    expect(pointInsideCountryLand([])).toBeNull();
  });

  it('accepts high-order convex clipped regions and floating subtraction residue without relaxing the vertex budget', () => {
    const region = Array.from({ length: 40 }, (_, i) => ({ xQ: 500000 + 10 * Math.cos(i * Math.PI / 20), yQ: 500000 + 10 * Math.sin(i * Math.PI / 20) }));
    const placed = pointInsideCountryLand([region])!;
    expect(placed.xQ).toBeCloseTo(500000, 7); expect(placed.yQ).toBeCloseTo(500000, 7);
    const clipped = [{ xQ: 999999, yQ: 999999 }, { xQ: 999999.5, yQ: 999999 + 1e-10 }, { xQ: 1000000, yQ: 999999 }, { xQ: 1000000, yQ: 1000000 }, { xQ: 999999, yQ: 1000000 }];
    expect(pointInsideCountryLand([clipped])).toEqual({ xQ: 999999.5, yQ: 999999.4 });
    expect(() => pointInsideCountryLand([Array.from({ length: 65 }, (_, i) => ({ xQ: 100 + Math.cos(i * Math.PI * 2 / 65), yQ: 100 + Math.sin(i * Math.PI * 2 / 65) }))])).toThrow('裁片无效');
  });

  it('handles all 65,536 owned cells with one resolved inside point and bounded cooperative work', async () => {
    const owned = Array.from({ length: 65536 }, (_, id) => id), resolve = vi.fn(point), yieldTask = vi.fn(pause);
    const placed = await placeCountryLabel({ columns: 256, rows: 256, ownedCellIds: owned }, resolve, { yieldTask });
    expect(placed).toEqual({ cellId: 32639, pointQ: point(32639), depth: 127, componentCells: 65536 });
    expect(resolve).toHaveBeenCalledTimes(1); expect(yieldTask.mock.calls.length).toBeGreaterThan(0); expect(yieldTask.mock.calls.length).toBeLessThanOrEqual(384);
  });

  it('uses the complete irregular mesh graph and explicit world edge, with actual centres for ties', async () => {
    const links: Record<number, number[]> = { 0: [5], 5: [0, 11], 11: [5, 2], 2: [11, 9], 9: [2] };
    const input = { columns: 4, rows: 3, ownedCellIds: [9, 2, 11, 0, 5], neighbors: (id: number) => links[id], isBoundary: (id: number) => id === 0 || id === 9 };
    expect(await placeCountryLabel(input, point)).toEqual({ cellId: 11, pointQ: point(11), depth: 2, componentCells: 5 });
    const centres: Record<number, CountryLabelPoint> = { 0: { xQ: 0, yQ: 10 }, 2: { xQ: 1, yQ: 10 }, 5: { xQ: 100, yQ: 10 } };
    const triangle = { columns: 4, rows: 3, ownedCellIds: [0, 2, 5], neighbors: (id: number) => [0, 2, 5].filter(next => next !== id), isBoundary: () => true, centerQ: (id: number) => centres[id] };
    expect((await placeCountryLabel(triangle, point))?.cellId).toBe(2);
    await expect(placeCountryLabel({ ...triangle, isBoundary: () => false }, point)).rejects.toThrow('真实世界边界');
  });

  it('rejects repeated IDs, invalid grid bounds and unverified resolver coordinates', async () => {
    for (const ownedCellIds of [[0, 0], [-1], [4], [1.5]]) await expect(placeCountryLabel({ columns: 2, rows: 2, ownedCellIds }, point)).rejects.toThrow();
    await expect(placeCountryLabel({ columns: 513, rows: 2, ownedCellIds: [0] }, point)).rejects.toThrow();
    await expect(placeCountryLabel({ columns: 512, rows: 512, ownedCellIds: Array.from({ length: 65537 }, (_, id) => id) }, point)).rejects.toThrow();
    await expect(placeCountryLabel({ columns: 1, rows: 1, ownedCellIds: [0] }, () => ({ xQ: NaN, yQ: 1 }))).rejects.toThrow('真实陆地内点');
    await expect(placeCountryLabel({ columns: 2, rows: 2, ownedCellIds: [0, 1], neighbors: id => id ? [] : [1], isBoundary: () => true }, point)).rejects.toThrow('双向一致');
    for (const adjacent of [[0], [1, 1], [-1], [4]]) await expect(placeCountryLabel({ columns: 2, rows: 2, ownedCellIds: [0], neighbors: () => adjacent }, point)).rejects.toThrow('邻接');
    await expect(placeCountryLabel({ columns: 8, rows: 8, ownedCellIds: [0], neighbors: () => Array.from({ length: 33 }, (_, i) => i + 1) }, point)).rejects.toThrow('邻接');
    expect(() => pointInsideCountryLand([[{ xQ: 0, yQ: 0 }, { xQ: 10, yQ: 0 }, { xQ: 2, yQ: 2 }, { xQ: 10, yQ: 10 }, { xQ: 0, yQ: 10 }]])).toThrow('凸陆地');
  });

  it('honours cancellation before work, during component traversal and after asynchronous geometry resolution', async () => {
    const early = new AbortController(); early.abort(); const resolve = vi.fn(point);
    await expect(placeCountryLabel({ columns: 2, rows: 2, ownedCellIds: [0] }, resolve, { signal: early.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(resolve).not.toHaveBeenCalled();
    const traversal = new AbortController();
    await expect(placeCountryLabel({ columns: 64, rows: 64, ownedCellIds: cells(64, 0, 0, 64, 64) }, resolve, { signal: traversal.signal, yieldTask: async () => { traversal.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(resolve).not.toHaveBeenCalled();
    const geometry = new AbortController();
    await expect(placeCountryLabel({ columns: 1, rows: 1, ownedCellIds: [0] }, async id => { geometry.abort(); return point(id); }, { signal: geometry.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
