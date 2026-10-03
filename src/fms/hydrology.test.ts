import { describe, expect, it } from 'vitest';
import { createFmsDocument, FMS_SEA_LEVEL, type FmsDocument, type FmsPoint } from './model';
import { deriveFmsDrainage, type FmsDrainage, type FmsDrainageOptions } from './hydrology';

function mesh(points: FmsPoint[], triangles: number[], elevations: number[]): FmsDocument {
  const neighbors = points.map(() => new Set<number>());
  for (let index = 0; index < triangles.length; index += 3) {
    const [a, b, c] = triangles.slice(index, index + 3);
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
  }
  return {
    format: 'lieguoji-fms-world', version: 1, worldId: 'dfb362ab-e88b-48a3-b7d8-451c2d1bcfea', revision: 0,
    width: 10, height: 10, points, triangles: Uint32Array.from(triangles),
    neighbors: neighbors.map(cells => [...cells]), elevations: Int32Array.from(elevations),
  };
}

/** Four explicit triangles form a two-column strip. No production topology helper is used. */
function strip(heights = [0, 25, 100, 30, 80, 90]): FmsDocument {
  return mesh([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
    [0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5], heights);
}

/** Exhaustive path bottleneck oracle via Floyd-Warshall, independent of priority flooding. */
function minimumSpillSurfaces(doc: FmsDocument, terminals: number[]): number[] {
  const count = doc.points.length;
  const costs = Array.from({ length: count }, (_, a) => Array.from({ length: count }, (_, b) =>
    a === b ? doc.elevations[a] : doc.neighbors[a].includes(b) ? Math.max(doc.elevations[a], doc.elevations[b]) : Infinity));
  for (let via = 0; via < count; via += 1) for (let a = 0; a < count; a += 1) for (let b = 0; b < count; b += 1)
    costs[a][b] = Math.min(costs[a][b], Math.max(costs[a][via], costs[via][b]));
  return costs.map((row, cell) => doc.elevations[cell] < FMS_SEA_LEVEL
    ? doc.elevations[cell] : Math.min(...terminals.map(terminal => row[terminal])));
}

/** Kahn's independent upstream elimination proves acyclicity and recomputes conservation. */
function checkConservation(doc: FmsDocument, drainage: FmsDrainage): void {
  const count = doc.points.length, upstream = new Uint32Array(count), flow = drainage.runoff.slice();
  let edgesValid = true, descends = true, seaValid = true;
  for (let source = 0; source < count; source += 1) {
    const target = drainage.receiver[source], land = doc.elevations[source] >= FMS_SEA_LEVEL;
    if (!land) expect(flow[source]).toBe(0);
    if (target !== -1) {
      edgesValid &&= target !== source && doc.neighbors[source].includes(target);
      descends &&= drainage.filledElevation[target] <= drainage.filledElevation[source];
      upstream[target] += 1;
    }
    if (!land) seaValid &&= target === -1 && drainage.lakeDepth[source] === 0;
  }
  const queue: number[] = [];
  upstream.forEach((degree, cell) => { if (!degree) queue.push(cell); });
  for (let head = 0; head < queue.length; head += 1) {
    const source = queue[head], target = drainage.receiver[source];
    if (target === -1) continue;
    flow[target] += flow[source];
    if (--upstream[target] === 0) queue.push(target);
  }
  expect({ edgesValid, descends, seaValid, visited: queue.length }).toEqual({ edgesValid: true, descends: true, seaValid: true, visited: count });
  flow.forEach((value, i) => expect(drainage.accumulation[i]).toBeCloseTo(value, 7));
  expect(drainage.stats.seaDischarge + drainage.stats.endorheicDischarge).toBeCloseTo(drainage.stats.landArea, 6);
  expect(drainage.riverSegments.every(([source, target]) => drainage.receiver[source] === target
    && drainage.accumulation[source] >= drainage.stats.minCatchment && doc.elevations[source] >= FMS_SEA_LEVEL
    && drainage.lakeDepth[source] <= 0.5 && doc.elevations[target] <= doc.elevations[source])).toBe(true);
}

describe('FMS height-derived static runoff', () => {
  it('routes two actual tributaries through a confluence to sea with exact catchment totals', () => {
    const doc = strip(), before = structuredClone(doc);
    const drainage = deriveFmsDrainage(doc, { minCatchment: .8 });
    // Cells 4 and 5 feed 3, then 1, then sea 0. Cell 2 has its own coastal outlet.
    expect([...drainage.receiver]).toEqual([-1, 0, 0, 1, 3, 3]);
    [1.92, 1 + .21 + 1/6, .21 + 1/3, 1, 1/3, 1/6].forEach((value, i) => expect(drainage.accumulation[i]).toBeCloseTo(value, 12));
    expect(drainage.riverSegments).toEqual([[1, 0], [3, 1]]);
    expect(drainage.stats).toMatchObject({ algorithm: 'land-area-runoff-v2', cellCount: 6, landCells: 5, seaCells: 1, connectedComponents: 1,
      endorheicBasins: 0, filledLandCells: 0, maxLakeDepth: 0, minCatchment: .8,
      riverSegmentCount: 2, endorheicDischarge: 0 });
    expect(drainage.stats.landArea).toBeCloseTo(1.92, 12);
    expect(doc).toEqual(before);
    checkConservation(doc, drainage);
  });

  it('fills a closed depression to its lowest saddle and excludes submerged internal flow lines', () => {
    const doc = strip([0, 60, 100, 25, 30, 90]);
    const drainage = deriveFmsDrainage(doc, { minCatchment: .1 });
    expect([...drainage.filledElevation]).toEqual([0, 60, 100, 60, 60, 90]);
    expect([...drainage.filledElevation]).toEqual(minimumSpillSurfaces(doc, [0]));
    expect([...drainage.lakeDepth]).toEqual([0, 0, 0, 35, 30, 0]);
    expect([...doc.elevations]).toEqual([0, 60, 100, 25, 30, 90]);
    expect(drainage.riverSegments).toEqual([[1, 0], [2, 0], [5, 3]]);
    expect(drainage.stats).toMatchObject({ filledLandCells: 2, maxLakeDepth: 35 });
    checkConservation(doc, drainage);
  });

  it('agrees with all-path minimax spill heights across varied small terrains and multiple seas', () => {
    // Fixed samples include broad flats, a second sea, a high saddle and coastal height 20.
    const samples = [[0, 45, 45, 45, 45, 45], [0, 90, 30, 20, 65, 19],
      [0, 90, 35, 25, 21, 80], [0, 21, 20, 100, 20, 20], [19, 90, 20, 30, 60, 0]];
    for (const heights of samples) {
      const doc = strip(heights), drainage = deriveFmsDrainage(doc, { minCatchment: 1 });
      const seas = heights.flatMap((height, cell) => height < 20 ? [cell] : []);
      expect([...drainage.filledElevation]).toEqual(minimumSpillSurfaces(doc, seas));
      checkConservation(doc, drainage);
    }
  });

  it('does not let neighbor or triangle iteration order change flat routing or runoff', () => {
    const doc = strip([0, 45, 45, 45, 45, 45]);
    const original = deriveFmsDrainage(doc, { minCatchment: 1 });
    const reordered = { ...doc, neighbors: doc.neighbors.map(neighbors => [...neighbors].reverse()),
      triangles: Uint32Array.of(5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 1, 0) };
    const rearranged = deriveFmsDrainage(reordered, { minCatchment: 1 });
    expect(rearranged.receiver).toEqual(original.receiver);
    rearranged.accumulation.forEach((value, i) => expect(value).toBeCloseTo(original.accumulation[i], 12));
    expect(deriveFmsDrainage(doc, { minCatchment: 1 })).toEqual(original);
    checkConservation(doc, original);
  });

  it('returns no invented runoff, lakes or rivers for a completely marine mesh', () => {
    const doc = strip([-100, 0, 19, -2, 5, 10]), drainage = deriveFmsDrainage(doc);
    expect([...drainage.receiver]).toEqual([-1, -1, -1, -1, -1, -1]);
    expect([...drainage.accumulation]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...drainage.filledElevation]).toEqual([...doc.elevations]);
    expect([...drainage.lakeDepth]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(drainage.riverSegments).toEqual([]);
    expect(drainage.stats).toMatchObject({ landCells: 0, seaCells: 6, endorheicBasins: 0, minCatchment: 512,
      seaDischarge: 0, endorheicDischarge: 0, maxAccumulation: 0 });
    checkConservation(doc, drainage);
  });

  it('keeps an entirely continental mesh endorheic instead of inventing an off-map sea outlet', () => {
    const doc = strip([80, 70, 90, 25, 60, 100]), drainage = deriveFmsDrainage(doc, { minCatchment: 1 });
    expect([...drainage.receiver].flatMap((target, source) => target === -1 ? [source] : [])).toEqual([3]);
    expect(drainage.accumulation[3]).toBeCloseTo(2, 12);
    expect(drainage.stats).toMatchObject({ landCells: 6, seaCells: 0, endorheicBasins: 1,
      seaDischarge: 0 });
    expect([...drainage.filledElevation]).toEqual(minimumSpillSurfaces(doc, [3]));
    checkConservation(doc, drainage);
    const flat = strip([20, 20, 20, 20, 20, 20]), sameHeight = deriveFmsDrainage(flat, { minCatchment: 1 });
    expect([...sameHeight.receiver].flatMap((target, source) => target === -1 ? [source] : [])).toEqual([0]);
    expect(sameHeight.stats.seaCells).toBe(0);
    checkConservation(flat, sameHeight);
  });

  it('separately preserves a landlocked component even when another graph component has sea', () => {
    const doc = mesh([[0, 0], [1, 0], [0, 1], [5, 5], [6, 5], [5, 6]], [0, 1, 2, 3, 4, 5], [0, 30, 40, 60, 25, 70]);
    const drainage = deriveFmsDrainage(doc, { minCatchment: 1 });
    expect([...drainage.receiver]).toEqual([-1, 0, 0, 4, -1, 4]);
    const firstArea = .5 * (1 - (20/30) * (20/40));
    [firstArea, firstArea/2, firstArea/2, 1/6, .5, 1/6].forEach((value, i) => expect(drainage.accumulation[i]).toBeCloseTo(value, 12));
    expect(drainage.stats).toMatchObject({ connectedComponents: 2, endorheicBasins: 1, landCells: 5,
      endorheicDischarge: .5 });
    checkConservation(doc, drainage);
  });

  it('uses catchment threshold only for visibility, never to alter receivers or physical accumulation', () => {
    const doc = strip(), fine = deriveFmsDrainage(doc, { minCatchment: .1 }), major = deriveFmsDrainage(doc, { minCatchment: 1.2 });
    expect(major.receiver).toEqual(fine.receiver);
    expect(major.accumulation).toEqual(fine.accumulation);
    expect(major.filledElevation).toEqual(fine.filledElevation);
    expect(major.riverSegments).toEqual([[1, 0]]);
    expect(deriveFmsDrainage(doc).riverSegments).toEqual([]);
  });

  it('does not overflow integer extremes or create negative/nonfinite filled depths', () => {
    const high = 2_147_483_647, doc = strip([-2_147_483_648, high, high, 20, 20, high]);
    const drainage = deriveFmsDrainage(doc, { minCatchment: 1 });
    expect(drainage.filledElevation[3]).toBe(high);
    expect(drainage.lakeDepth[3]).toBe(Math.fround(high - 20));
    expect(drainage.stats.maxLakeDepth).toBe(Math.fround(high - 20));
    expect([...drainage.filledElevation].every(Number.isFinite)).toBe(true);
    expect([...drainage.lakeDepth].every(depth => Number.isFinite(depth) && depth >= 0)).toBe(true);
    checkConservation(doc, drainage);
  });

  it.each([0, -1, NaN, Infinity, 8192 ** 2 + 1])('rejects invalid catchment threshold %s', minCatchment => {
    expect(() => deriveFmsDrainage(strip(), { minCatchment })).toThrow('汇水面积阈值');
  });

  it('rejects malformed options and input geometry before attempting a traversal', () => {
    for (const options of [null, [], { decorativeRivers: 5 }])
      expect(() => deriveFmsDrainage(strip(), options as FmsDrainageOptions)).toThrow('汇水面积阈值');
    const doc = strip();
    for (const invalid of [null, { ...doc, version: 2 }, { ...doc, elevations: new Float32Array(6) },
      { ...doc, triangles: new Uint32Array([0, 1, 99]) }, { ...doc, neighbors: doc.neighbors.map(() => []) }])
      expect(() => deriveFmsDrainage(invalid as FmsDocument)).toThrow('绘图文档无效');
  });

  it('routes the actual 36,864-site web topology without cycles and conserves every land unit', async () => {
    const doc = await createFmsDocument({ yieldTask: async () => {} });
    doc.points.forEach(([x, y], cell) => {
      const radius = Math.hypot((x - doc.width / 2) / (doc.width / 2), (y - doc.height / 2) / (doc.height / 2));
      doc.elevations[cell] = radius > 0.9 ? 0 : Math.max(20, Math.floor(20 + 80 * (1 - radius) + 9 * Math.sin(x / 65) * Math.cos(y / 83)));
    });
    const original = doc.elevations.slice(), drainage = deriveFmsDrainage(doc);
    expect(drainage.receiver).toHaveLength(36_864);
    expect(drainage.stats).toMatchObject({ cellCount: 36_864, connectedComponents: 1, endorheicBasins: 0 });
    expect(drainage.stats.landCells).toBeGreaterThan(10_000);
    expect(drainage.stats.seaCells).toBeGreaterThan(1_000);
    expect(drainage.riverSegments.length).toBeGreaterThan(0);
    expect(drainage.stats.minCatchment).toBe(Math.max(512, drainage.stats.landArea * 0.003));
    expect(doc.elevations).toEqual(original);
    checkConservation(doc, drainage);
  }, 15_000);
});
