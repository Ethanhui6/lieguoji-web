import { Delaunay } from 'd3-delaunay';
import { describe, expect, it, vi } from 'vitest';
import { createFmsDocument, FMS_SEA_LEVEL, type FmsDocument, type FmsPoint } from './model';
import { naturalizeFmsTerrain } from './naturalize';
import type { FmsNaturalizationOptions } from './naturalize';

function fixture(size = 41, isLand: (x: number, y: number) => boolean = (x, y) => x >= 3 && x < size - 3 && y >= 3 && y < size - 3): FmsDocument {
  const points: FmsPoint[] = [], heights: number[] = [];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) { points.push([x * 10, y * 10]); heights.push(isLand(x, y) ? 45 : 0); }
  const mesh = Delaunay.from(points);
  return {
    format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 7,
    width: (size - 1) * 10, height: (size - 1) * 10, points, triangles: Uint32Array.from(mesh.triangles),
    neighbors: points.map((_, cell) => [...mesh.neighbors(cell)]), elevations: Int32Array.from(heights),
  };
}
const mask = (heights: Int32Array) => Array.from(heights, height => height >= FMS_SEA_LEVEL);
function components(doc: FmsDocument, heights: Int32Array, land: boolean): number {
  const seen = new Set<number>(); let count = 0;
  for (let start = 0; start < heights.length; start += 1) {
    if (seen.has(start) || (heights[start] >= 20) !== land) continue;
    count += 1; seen.add(start); const queue = [start];
    for (let head = 0; head < queue.length; head += 1) for (const next of doc.neighbors[queue[head]]) {
      if (!seen.has(next) && (heights[next] >= 20) === land) { seen.add(next); queue.push(next); }
    }
  }
  return count;
}

describe('shape-preserving web relief', () => {
  it('is repeatable with explicit seeds, changes with a seed, and never reads ambient randomness', () => {
    const doc = fixture(), saved = structuredClone(doc), rng = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Ambient RNG is not permitted'); });
    try {
      const first = naturalizeFmsTerrain(doc, { seed: 71431, strength: 1 });
      const other = naturalizeFmsTerrain(doc, { seed: 9182, strength: 1 });
      const repeated = naturalizeFmsTerrain(doc, { seed: 71431, strength: 1 });
      expect(repeated).toEqual(first);
      expect(other.elevations).not.toEqual(first.elevations);
      expect(first.stats.changedCells).toBeGreaterThan(0);
      expect(rng).not.toHaveBeenCalled();
      expect(doc).toEqual(saved);
      expect(first.elevations).not.toBe(doc.elevations);
      // Full-strength regeneration depends on shape and seed, not its earlier
      // generated coast heights. Reapplying the same choice must not drift.
      const reapplied = naturalizeFmsTerrain({ ...doc, elevations: first.elevations }, { seed: 71431, strength: 1 });
      expect(reapplied.elevations).toEqual(first.elevations);
      expect(reapplied.stats.changedCells).toBe(0);
    } finally { rng.mockRestore(); }
  });

  it('produces correlated interior relief with lower coasts, instead of independent cell coloring', () => {
    const doc = fixture(), result = naturalizeFmsTerrain(doc, { seed: 71431, strength: 1 });
    const land = Array.from(doc.elevations.keys()).filter(cell => doc.elevations[cell] >= 20);
    let adjacentDifference = 0, edgeCount = 0, separatedDifference = 0;
    land.forEach((cell, index) => {
      for (const next of doc.neighbors[cell]) if (next > cell && doc.elevations[next] >= 20) { adjacentDifference += Math.abs(result.elevations[cell] - result.elevations[next]); edgeCount += 1; }
      separatedDifference += Math.abs(result.elevations[cell] - result.elevations[land[(index + Math.floor(land.length / 3)) % land.length]]);
    });
    expect(adjacentDifference / edgeCount).toBeLessThan(separatedDifference / land.length);
    expect(result.stats.meanCoastHeight).toBeLessThan(result.stats.meanInteriorHeight!);
    expect(result.stats.maxLandHeight - result.stats.minLandHeight).toBeGreaterThan(20);
    expect(new Set(land.map(cell => result.elevations[cell])).size).toBeGreaterThan(20);
    expect(result.stats.maxDistanceToCoast).toBeGreaterThan(100);
  });

  it('preserves narrow necks, wide bays, disconnected small islands, and sea connectivity', () => {
    const doc = fixture(41, (x, y) =>
      ((x >= 3 && x <= 16 && y >= 7 && y <= 33) && !(x <= 9 && y >= 16 && y <= 23))
      || (x >= 24 && x <= 37 && y >= 7 && y <= 33)
      || (x >= 16 && x <= 24 && y === 27)
      || (x === 20 && y === 3));
    const bridge = 27 * 41 + 20, island = 3 * 41 + 20;
    doc.elevations[bridge] = 20; // The inclusive land threshold must be preserved.
    doc.elevations[0] = 19; // A nonzero sea sample must remain exactly untouched.
    const result = naturalizeFmsTerrain(doc, { seed: 42, strength: 1 });
    expect(mask(result.elevations)).toEqual(mask(doc.elevations));
    expect(result.elevations[bridge]).toBeGreaterThanOrEqual(20);
    expect(result.elevations[island]).toBeGreaterThanOrEqual(20);
    expect(result.elevations[0]).toBe(19);
    expect(components(doc, result.elevations, true)).toBe(components(doc, doc.elevations, true));
    expect(components(doc, result.elevations, false)).toBe(components(doc, doc.elevations, false));
    expect(result.stats.landComponents).toBe(2);
    expect(result.stats.landMaskPreserved).toBe(true);
    for (let cell = 0; cell < doc.elevations.length; cell += 1) if (doc.elevations[cell] < 20) expect(result.elevations[cell]).toBe(doc.elevations[cell]);
  });

  it('keeps a single-point island and reports absence of interior samples honestly', () => {
    const doc = fixture(9, (x, y) => x === 4 && y === 4);
    const result = naturalizeFmsTerrain(doc, { seed: 0, strength: 1 });
    expect(result.stats).toMatchObject({ landCells: 1, landComponents: 1, coastalLandCells: 1, meanInteriorHeight: null });
    expect(mask(result.elevations)).toEqual(mask(doc.elevations));
  });

  it('makes zero strength a fresh exact copy and intermediate strengths stay between original and target heights', () => {
    const doc = fixture(); doc.elevations[20 * 41 + 20] = 100;
    const none = naturalizeFmsTerrain(doc, { seed: 0xffffffff, strength: 0 });
    const full = naturalizeFmsTerrain(doc, { seed: 0xffffffff, strength: 1 });
    const partial = naturalizeFmsTerrain(doc, { seed: 0xffffffff, strength: 0.4 });
    expect(none.elevations).toEqual(doc.elevations); expect(none.elevations).not.toBe(doc.elevations);
    expect(none.stats.changedCells).toBe(0);
    for (let cell = 0; cell < doc.elevations.length; cell += 1) {
      expect(partial.elevations[cell]).toBeGreaterThanOrEqual(Math.min(doc.elevations[cell], full.elevations[cell]));
      expect(partial.elevations[cell]).toBeLessThanOrEqual(Math.max(doc.elevations[cell], full.elevations[cell]));
      expect(partial.elevations[cell]).toBeGreaterThanOrEqual(0); expect(partial.elevations[cell]).toBeLessThanOrEqual(100);
    }
  });

  it('handles a fully land-covered world using explicit map-boundary anchors without inventing sea', () => {
    const doc = fixture(15, () => true), result = naturalizeFmsTerrain(doc, { seed: 12, strength: 1 });
    expect(result.stats).toMatchObject({ fallbackBoundaryComponents: 1, coastalLandCells: 0, meanCoastHeight: null, seaCells: 0 });
    expect(result.elevations.every(height => height >= 20 && height <= 100)).toBe(true);
    expect(Number.isFinite(result.stats.maxDistanceToCoast)).toBe(true);
  });

  it('clearly rejects an empty ocean without inventing a random continent', () => {
    const doc = fixture(7, () => false), before = doc.elevations.slice();
    expect(() => naturalizeFmsTerrain(doc, { seed: 0, strength: 1 })).toThrow('请先绘制一块陆地');
    expect(doc.elevations).toEqual(before);
  });

  it.each([
    { seed: -1, strength: 1 }, { seed: 0x100000000, strength: 1 }, { seed: 1.5, strength: 1 }, { seed: NaN, strength: 1 },
    { seed: 1, strength: -0.1 }, { seed: 1, strength: 1.01 }, { seed: 1, strength: Infinity }, { seed: 1, strength: NaN },
    { seed: 1, strength: 1, undocumented: true }, null,
  ])('rejects invalid options %s before changing input', options => {
    const doc = fixture(7), before = structuredClone(doc);
    expect(() => naturalizeFmsTerrain(doc, options as FmsNaturalizationOptions)).toThrow('自然化参数无效');
    expect(doc).toEqual(before);
  });

  it('rejects invalid document geometry or out-of-contract elevations instead of silently repairing the source', () => {
    const doc = fixture(7);
    expect(() => naturalizeFmsTerrain({ ...doc, version: 2 } as unknown as FmsDocument, { seed: 1, strength: 1 })).toThrow('版本不兼容');
    for (const value of [-1, 101]) {
      const copy = structuredClone(doc); copy.elevations[0] = value;
      expect(() => naturalizeFmsTerrain(copy, { seed: 1, strength: 1 })).toThrow('超出0至100范围');
      expect(copy.elevations[0]).toBe(value);
    }
  });

  it('processes the actual 36,864-point mesh within the bounded synchronous worker slice', async () => {
    const doc = await createFmsDocument({ yieldTask: async () => {} });
    doc.points.forEach(([x, y], cell) => { if (x > 200 && x < 1350 && y > 180 && y < 1330 && !(x > 1000 && y > 600 && y < 850)) doc.elevations[cell] = 45; });
    const before = doc.elevations.slice(), started = performance.now();
    const result = naturalizeFmsTerrain(doc, { seed: 71431, strength: 1 });
    const elapsedMs = Math.round(performance.now() - started);
    expect(result.elevations).toHaveLength(36_864);
    expect(mask(result.elevations)).toEqual(mask(before));
    expect(doc.elevations).toEqual(before);
    expect(result.elevations.every(height => height >= 0 && height <= 100)).toBe(true);
    console.info(`FMS naturalization local numeric measurement: ${JSON.stringify({ points: doc.points.length, elapsedMs, landCells: result.stats.landCells, changedCells: result.stats.changedCells })}`);
  }, 15000);
});
