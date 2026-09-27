import { describe, expect, it } from 'vitest';
import { buildHydrologyKernel, canonicalHydrologyCoastCrossing, HYDROLOGY_LIMITS, HYDROLOGY_STATUS, HYDROLOGY_TERMINAL, NO_WATER, type HydrologyInput, type HydrologyResult } from './hydrology-kernel';
import { buildDetailCoastSurface } from '../../../../src/world/detail-coast-geometry';
import type { DetailCoastField } from '../../../../src/world/detail-coast-types';

const control = { yieldControl: async () => {} };
function terrain(columns: number, rows: number, height: (x: number, y: number) => number | null): HydrologyInput {
  const coverageQ = new Int16Array(columns * rows), groundMeters = new Int16Array(columns * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const id = y * columns + x, h = height(x, y); coverageQ[id] = h === null ? -32767 : 32767; groundMeters[id] = h === null ? -100 : h;
  }
  return { columns, rows, originColumn: 128, originRow: 256, coverageQ, groundMeters };
}
const bowl = () => terrain(9, 9, (x, y) => x === 0 || y === 0 || x === 8 || y === 8 ? null : x >= 3 && x <= 5 && y >= 3 && y <= 5 ? 10 : 100);
function trace(result: HydrologyResult, start: number) {
  const visited = new Set<number>(); let id = start;
  while (result.receiver[id] >= 0) {
    expect(visited.has(id)).toBe(false); visited.add(id);
    const to = result.receiver[id]; expect(result.groundMeters[to]).toBeLessThanOrEqual(result.groundMeters[id]);
    expect(Math.abs(id % result.columns - to % result.columns) + Math.abs(Math.floor(id / result.columns) - Math.floor(to / result.columns))).toBe(1);
    expect(result.coverageQ[to]).toBeGreaterThanOrEqual(0); expect(result.basinId[to]).toBe(result.basinId[id]); id = to;
    if (visited.size > result.stats.landNodes) throw new Error('unexpected cycle');
  }
  return id;
}
function conserved(result: HydrologyResult) {
  let total = 0;
  for (const id of result.basins.terminalNode) total += result.contributingSamples[id];
  expect(total).toBe(result.stats.landNodes);
  const rank = new Int32Array(result.receiver.length).fill(-1);
  result.topologicalOrder.forEach((id, i) => { expect(rank[id]).toBe(-1); rank[id] = i; });
  for (let id = 0; id < result.receiver.length; id++) if (result.receiver[id] >= 0) expect(rank[result.receiver[id]]).toBeGreaterThan(rank[id]);
}
function sameDrainage(a: HydrologyResult, b: HydrologyResult) {
  for (const key of ['coverageQ', 'groundMeters', 'receiver', 'basinId', 'contributingSamples', 'drainageStatus', 'lakeWaterSurfaceMeters', 'topologicalOrder'] as const) expect(a[key]).toEqual(b[key]);
  expect(a.basins).toEqual(b.basins); expect(a.stats).toEqual(b.stats);
}

describe('PH07-T1 bounded fine drainage first slice', () => {
  it('routes a real sloping island to exact coast terminals without uphill steps or changing ground', async () => {
    const input = terrain(9, 7, (x, y) => x === 0 || x === 8 || y === 0 || y === 6 ? null : (8 - x) * 40 + Math.abs(y - 3) * 7);
    const before = input.groundMeters.slice(), result = await buildHydrologyKernel(input, {}, control);
    expect(result.groundMeters).toEqual(before); expect(input.groundMeters).toEqual(before);
    for (let id = 0; id < input.coverageQ.length; id++) if (input.coverageQ[id] >= 0) {
      const terminal = trace(result, id), bid = result.basinId[id];
      expect(result.basins.terminalNode[bid]).toBe(terminal); expect(result.drainageStatus[id]).toBe(HYDROLOGY_STATUS.ocean);
      expect(result.basins.partial[bid]).toBe(0); expect(result.basins.coastXQ[bid]).toBeGreaterThanOrEqual(0);
    }
    expect(result.lakeWaterSurfaceMeters.every(v => v === NO_WATER)).toBe(true); conserved(result);
  });

  it('resolves an equal-height plateau with stable nearest-exit ties and no artificial height perturbation', async () => {
    const input = terrain(7, 5, (x, y) => x === 0 || y === 0 || x === 6 || y === 4 ? null : 100);
    const a = await buildHydrologyKernel(input, { batch: 64 }, control), b = await buildHydrologyKernel(input, { batch: 8192 }, control);
    sameDrainage(a, b);
    // North and south coast seeds are one hop away; row-major seed order wins.
    expect(a.receiver[2 * 7 + 3]).toBe(1 * 7 + 3);
    for (let id = 0; id < input.coverageQ.length; id++) if (input.coverageQ[id] >= 0) { trace(a, id); expect(a.groundMeters[id]).toBe(100); }
    conserved(a);
  });

  it('retains a measured closed depression and its lowest saddle while keeping water distinct from land', async () => {
    const input = bowl(), before = input.groundMeters.slice(), result = await buildHydrologyKernel(input, {}, control);
    const bid = result.basinId[4 * 9 + 4], root = 3 * 9 + 3;
    expect(result.basins.terminalNode[bid]).toBe(root); expect(result.receiver[root]).toBe(HYDROLOGY_TERMINAL.depression);
    expect(result.basins.terminalKind[bid]).toBe(HYDROLOGY_STATUS.endorheic); expect(result.basins.partial[bid]).toBe(0);
    expect(result.basins.candidateSpillMeters[bid]).toBe(100);
    const from = result.basins.spillFromNode[bid], to = result.basins.spillToNode[bid];
    expect(result.basinId[from]).toBe(bid); expect(result.basinId[to]).not.toBe(bid);
    expect(Math.max(result.groundMeters[from], result.groundMeters[to])).toBe(100);
    expect(result.contributingSamples[root]).toBeGreaterThanOrEqual(9);
    expect(result.groundMeters).toEqual(before); expect(result.lakeWaterSurfaceMeters.every(v => v === NO_WATER)).toBe(true);
    for (let id = 0; id < input.coverageQ.length; id++) if (input.coverageQ[id] >= 0) trace(result, id);
    conserved(result);
  });

  it('marks every upstream node unresolved when its flat outlet is on the crop boundary', async () => {
    const input = terrain(9, 7, x => (8 - x) * 10), result = await buildHydrologyKernel(input, {}, control);
    expect(result.basins.terminalNode).toHaveLength(1); expect(result.basins.terminalNode[0]).toBe(8);
    expect(result.receiver[8]).toBe(HYDROLOGY_TERMINAL.unresolved);
    expect(result.basins.terminalKind[0]).toBe(HYDROLOGY_STATUS.unresolved);
    expect(result.drainageStatus.every(v => v === HYDROLOGY_STATUS.unresolved)).toBe(true);
    expect(result.contributingSamples[8]).toBe(63); conserved(result);
  });

  it('does not claim a complete interior basin when its contributing catchment reaches a crop edge', async () => {
    const input = terrain(9, 9, (x, y) => (Math.abs(x - 4) + Math.abs(y - 4)) * 10);
    const result = await buildHydrologyKernel(input, {}, control), bid = result.basinId[4 * 9 + 4];
    expect(result.basins.terminalKind[bid]).toBe(HYDROLOGY_STATUS.endorheic); expect(result.basins.partial[bid]).toBe(1);
    expect(result.drainageStatus.every(v => v === HYDROLOGY_STATUS.unresolved)).toBe(true);
    expect(result.basins.candidateSpillMeters[bid]).toBe(NO_WATER); conserved(result);
  });

  it('preserves two islands separated by an actual 12-world channel and stops on each bank', async () => {
    const input = terrain(20, 11, (x, y) => y > 0 && y < 10 && (x >= 1 && x <= 5 || x >= 12 && x <= 18) ? 50 : null);
    const result = await buildHydrologyKernel(input, {}, control);
    for (let id = 0; id < input.coverageQ.length; id++) if (input.coverageQ[id] >= 0) {
      const terminal = trace(result, id); expect(terminal % 20 < 6).toBe(id % 20 < 6);
    }
    const left = result.basinId[5 * 20 + 5], right = result.basinId[5 * 20 + 12];
    expect(result.basins.coastXQ[right] - result.basins.coastXQ[left]).toBe(12 * 256);
    expect(result.basins.coastYQ[right]).toBe(result.basins.coastYQ[left]); conserved(result);
  });

  it('matches actual v4 canonical sea crossings including integer clamps and zero endpoints', async () => {
    for (const [land, sea] of [[32767, -1], [1, -32767], [117, -923], [0, -80]]) {
      const coverageQ = new Int16Array(33 * 33).fill(sea), elevationMeters = new Int16Array(33 * 33).fill(-100);
      coverageQ[0] = coverageQ[33] = land; elevationMeters[0] = elevationMeters[33] = land === 0 ? 0 : 100;
      const field: DetailCoastField = { tiles: new Map([['coast:0:0', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples', coverageQ, elevationMeters }]]), sampleBaseElevation: () => -100 };
      const surface = buildDetailCoastSurface(field, { column: 0, row: 0, columns: 1, rows: 1 });
      const original = surface.cells[0].shore.flatMap(s => [s.a, s.b]).find(p => p.yQ === 0)!;
      expect(original).toBeDefined();
      const a = { xQ: 0, yQ: 0, coverageQ: land }, b = { xQ: 512, yQ: 0, coverageQ: sea };
      expect(canonicalHydrologyCoastCrossing(a, b)).toEqual({ xQ: original.xQ, yQ: original.yQ });
      expect(canonicalHydrologyCoastCrossing(b, a)).toEqual(canonicalHydrologyCoastCrossing(a, b));
    }
  });

  it('does not route over a zero-area coastal line or use a diagonal land bridge', async () => {
    const input = terrain(7, 7, () => null);
    for (let x = 1; x <= 5; x++) { input.coverageQ[3 * 7 + x] = 0; input.groundMeters[3 * 7 + x] = 0; }
    const result = await buildHydrologyKernel(input, {}, control);
    for (let x = 1; x <= 5; x++) { const id = 3 * 7 + x; expect(result.receiver[id]).toBeLessThan(0); expect(result.basins.terminalKind[result.basinId[id]]).toBe(HYDROLOGY_STATUS.ocean); }
    const diagonal = terrain(5, 5, () => null); diagonal.coverageQ[1 * 5 + 1] = diagonal.coverageQ[2 * 5 + 2] = 32767; diagonal.groundMeters[6] = 20; diagonal.groundMeters[12] = 10;
    const disconnected = await buildHydrologyKernel(diagonal, {}, control);
    expect(disconnected.receiver[6]).toBeLessThan(0); expect(disconnected.basinId[6]).not.toBe(disconnected.basinId[12]);
  });

  it('recognizes a zero node on an incident NW-SE source coast without introducing a diagonal route', async () => {
    const input = terrain(5, 5, () => 10), center = 12;
    input.coverageQ[center] = 0; input.groundMeters[center] = 0; input.coverageQ[6] = -100; input.groundMeters[6] = -10;
    const result = await buildHydrologyKernel(input, {}, control), bid = result.basinId[center];
    expect(result.receiver[center]).toBe(-5);
    expect(result.basins.coastXQ[bid]).toBe((input.originColumn + 2) * 512);
    expect(result.basins.coastYQ[bid]).toBe((input.originRow + 2) * 512);
    expect(result.basins.terminalKind[bid]).toBe(HYDROLOGY_STATUS.ocean); conserved(result);
  });

  it('owns integer terrain and dimensions before the first callback and remains transferable', async () => {
    const original = bowl(), changed = bowl(), expected = await buildHydrologyKernel(original, { batch: 64 }, control);
    let mutated = false;
    const result = await buildHydrologyKernel(changed, { batch: 64 }, { ...control, onProgress: () => {
      if (!mutated) { mutated = true; changed.coverageQ.fill(-32767); changed.groundMeters.fill(-99); changed.columns = 2; changed.originColumn = 0; }
    } });
    sameDrainage(result, expected); expect(result.columns).toBe(9); expect(result.originColumn).toBe(128);
    const cloned = structuredClone(result); sameDrainage(cloned, result);
  });

  it('never aliases caller arrays through overwritten slice during the first capture callback', async () => {
    const original = terrain(3, 3, (x, y) => x === 1 && y === 1 ? 50 : null), expected = await buildHydrologyKernel(original, {}, control);
    const source = terrain(3, 3, (x, y) => x === 1 && y === 1 ? 50 : null); let sliceCalls = 0, mutated = false;
    for (const array of [source.coverageQ, source.groundMeters]) Object.defineProperty(array, 'slice', { value: () => { sliceCalls++; return array; } });
    const result = await buildHydrologyKernel(source, {}, { ...control, onProgress: phase => {
      if (phase === 'capture' && !mutated) { mutated = true; source.coverageQ.fill(-32767); source.groundMeters.fill(-100); }
    } });
    expect(mutated).toBe(true); expect(sliceCalls).toBe(0); expect(result.stats.landNodes).toBe(1);
    expect(result.coverageQ.buffer).not.toBe(source.coverageQ.buffer); expect(result.groundMeters.buffer).not.toBe(source.groundMeters.buffer);
    sameDrainage(result, expected);
  });

  it('copies a typed-array subclass without consulting overridden iterator or species', async () => {
    const original = bowl(), expected = await buildHydrologyKernel(original, {}, control); let iteratorCalls = 0, speciesCalls = 0;
    class CustomInt16Array extends Int16Array {}
    Object.defineProperty(CustomInt16Array, Symbol.species, { get: () => { speciesCalls++; throw new Error('source species must not run'); } });
    const coverageQ = new CustomInt16Array(original.coverageQ.length), groundMeters = new CustomInt16Array(original.groundMeters.length);
    Int16Array.prototype.set.call(coverageQ, original.coverageQ); Int16Array.prototype.set.call(groundMeters, original.groundMeters);
    for (const array of [coverageQ, groundMeters]) Object.defineProperty(array, Symbol.iterator, { value: () => { iteratorCalls++; throw new Error('source iterator must not run'); } });
    const source = { ...original, coverageQ, groundMeters }; let mutated = false;
    const result = await buildHydrologyKernel(source, {}, { ...control, onProgress: phase => {
      if (phase === 'capture' && !mutated) { mutated = true; coverageQ.fill(-32767); groundMeters.fill(-100); }
    } });
    expect(mutated).toBe(true); expect(iteratorCalls).toBe(0); expect(speciesCalls).toBe(0);
    expect(Object.getPrototypeOf(result.coverageQ)).toBe(Int16Array.prototype); expect(Object.getPrototypeOf(result.groundMeters)).toBe(Int16Array.prototype);
    expect(result.coverageQ.buffer).not.toBe(coverageQ.buffer); expect(result.groundMeters.buffer).not.toBe(groundMeters.buffer);
    sameDrainage(result, expected);
  });

  it('cancels the actual routing, basin and accumulation passes without mutating caller terrain', async () => {
    const make = () => terrain(25, 25, (x, y) => x === 0 || y === 0 || x === 24 || y === 24 ? null : x >= 7 && x <= 17 && y >= 7 && y <= 17 ? 10 : 100);
    const observed = new Set<string>(); await buildHydrologyKernel(make(), { batch: 64 }, { ...control, onProgress: phase => { observed.add(phase); } });
    for (const phase of ['capture', 'strict-descent', 'route-flats', 'closed-flats', 'accumulation', 'propagate-basins', 'spill-candidates', 'complete']) {
      expect(observed.has(phase)).toBe(true); const input = make(), before = structuredClone(input), abort = new AbortController();
      await expect(buildHydrologyKernel(input, { batch: 64 }, { ...control, signal: abort.signal, onProgress: name => { if (name === phase) abort.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(input).toEqual(before);
    }
  });

  it('rejects invalid coverage, height, size, shared storage and hard budgets without writing input', async () => {
    const good = bowl();
    for (const change of [(v: HydrologyInput) => { v.coverageQ[0] = -32768; }, (v: HydrologyInput) => { v.groundMeters[0] = 1; },
      (v: HydrologyInput) => { v.coverageQ[10] = 0; v.groundMeters[10] = 1; }, (v: HydrologyInput) => { v.groundMeters[10] = 12001; }]) {
      const input = bowl(); change(input); const before = structuredClone(input); await expect(buildHydrologyKernel(input, {}, control)).rejects.toThrow(); expect(input).toEqual(before);
    }
    await expect(buildHydrologyKernel({ ...good, columns: 513 }, {}, control)).rejects.toThrow('范围');
    await expect(buildHydrologyKernel({ ...good, originColumn: 2045 }, {}, control)).rejects.toThrow('范围');
    await expect(buildHydrologyKernel({ ...good, coverageQ: new Int16Array(new SharedArrayBuffer(good.coverageQ.byteLength)) }, {}, control)).rejects.toThrow('私有');
    await expect(buildHydrologyKernel(good, { maximumTypedArrayBytes: 48 * good.coverageQ.length - 1 }, control)).rejects.toThrow('预算');
    const before = structuredClone(good); await expect(buildHydrologyKernel(good, { maximumOperations: 30 }, control)).rejects.toThrow('操作预算'); expect(good).toEqual(before);
  });

  it('keeps medium-grid work and all typed arrays within explicit hard bounds', async () => {
    const input = terrain(256, 256, (x, y) => x === 0 || y === 0 || x === 255 || y === 255 ? null : (255 - x) * 10 + Math.abs(y - 128));
    const result = await buildHydrologyKernel(input, { batch: 8192 }, control);
    expect(result.stats.landNodes).toBe(254 ** 2); expect(result.stats.operations).toBeLessThanOrEqual(HYDROLOGY_LIMITS.operationsPerNode * 256 ** 2 + 1024);
    expect(result.stats.typedArrayBytes).toBe(24 * 256 ** 2 + 24 * result.stats.basinCount);
    expect(result.stats.typedArrayBytes).toBeLessThanOrEqual(48 * 256 ** 2); expect(result.stats.maximumQueueLength).toBeLessThanOrEqual(result.stats.landNodes);
    expect(result.topologicalOrder).toHaveLength(result.stats.landNodes); conserved(result);
    expect(result.drainageStatus.every((value, id) => input.coverageQ[id] < 0 ? value === 0 : value === HYDROLOGY_STATUS.ocean)).toBe(true);
  });

  it('handles an entirely known sea patch without inventing drainage or lake water', async () => {
    const input = terrain(16, 16, () => null), result = await buildHydrologyKernel(input, {}, control);
    expect(result.stats.landNodes).toBe(0); expect(result.stats.basinCount).toBe(0); expect(result.topologicalOrder).toHaveLength(0);
    expect(result.basinId.every(v => v === -1)).toBe(true); expect(result.receiver.every(v => v === HYDROLOGY_TERMINAL.excluded)).toBe(true);
    expect(result.lakeWaterSurfaceMeters.every(v => v === NO_WATER)).toBe(true); conserved(result);
  });
});
