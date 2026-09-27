import { describe, expect, it } from 'vitest';
import { HYDROLOGY_LIMITS } from './hydrology-kernel';
import { BOUNDARY_EXIT, BOUNDARY_PORT, buildHydrologyBoundaryPage, mergeHydrologyBoundaryPages,
  type HydrologyBoundaryCore, type HydrologyBoundaryInput, type HydrologyBoundarySummary } from './hydrology-boundary';

const source = { draftId: 'atlas-ph07-boundary-synthetic', revision: 7, manifestDigest: 'a'.repeat(64), rootDigest: 'b'.repeat(64) };
const left = { originColumn: 10, originRow: 10, columns: 6, rows: 6 }, right = { ...left, originColumn: 16 };
const noWait = { yieldControl: async () => {} };
type Field = (x: number, y: number) => { coverageQ: number; height: number };
const plane: Field = (x, y) => ({ coverageQ: 100, height: 500 - x - y });
function input(core: HydrologyBoundaryCore, field: Field = plane): HydrologyBoundaryInput {
  const originColumn = Math.max(0, core.originColumn - 1), originRow = Math.max(0, core.originRow - 1);
  const columns = Math.min(2049, core.originColumn + core.columns + 1) - originColumn, rows = Math.min(2049, core.originRow + core.rows + 1) - originRow;
  const coverageQ = new Int16Array(columns * rows), groundMeters = new Int16Array(columns * rows);
  for (let i = 0; i < coverageQ.length; i++) { const v = field(originColumn + i % columns, originRow + Math.floor(i / columns)); coverageQ[i] = v.coverageQ; groundMeters[i] = v.height; }
  return { source: { ...source }, core: { ...core }, samples: { originColumn, originRow, columns, rows, coverageQ, groundMeters } };
}
const page = (core: HydrologyBoundaryCore, field?: Field) => buildHydrologyBoundaryPage(input(core, field), { batch: 64 }, noWait);
const gid = (x: number, y: number) => y * 2049 + x;
function component(summary: HydrologyBoundarySummary, x: number, y: number) { return summary.componentIds[summary.nodeIds.indexOf(gid(x, y))]; }
function logical(summary: HydrologyBoundarySummary) {
  return Array.from(summary.nodeIds, (id, i) => ({ id, component: summary.componentIds[i] < 0 ? -1 : summary.components.nodeId[summary.componentIds[i]] })).sort((a, b) => a.id - b.id);
}
const flat: Field = (x, y) => ({ coverageQ: 100, height: x >= 11 && x <= 20 && y >= 11 && y <= 14 ? x === 20 && y === 12 ? 50 : 100 : 400 });

describe('bounded private fine hydrology boundary pages', () => {
  it('joins a real descending seam by actual global endpoints, preserving unknown external land', async () => {
    const a = await page(left), b = await page(right), result = await mergeHydrologyBoundaryPages([a, b], { batch: 64 }, noWait);
    const seam = Array.from(result.ports.from).findIndex((from, i) => from === gid(15, 12) && result.ports.to[i] === gid(16, 12));
    expect(seam).toBeGreaterThanOrEqual(0); expect(result.ports.kind[seam]).toBe(BOUNDARY_PORT.land); expect(result.ports.relation[seam]).toBe(-1);
    expect(result.ports.targetComponent[seam]).toBe(component(result, 16, 12));
    expect(result.ports.kind).toContain(BOUNDARY_PORT.unknownLand); expect(result.stats.unresolvedComponents).toBeGreaterThan(0);
    expect(new Set(result.nodeIds).size).toBe(left.columns * left.rows * 2);
    expect(result).not.toHaveProperty('receiver'); expect(result).not.toHaveProperty('lakeWaterSurfaceMeters');
  });
  it('merges an equal-height plateau and discovers its single lower exit on the other page', async () => {
    const a = await page(left, flat), b = await page(right, flat), cA = component(a.summary, 12, 12);
    expect(a.summary.components.unresolved[cA]).toBe(1); expect(a.summary.components.exitKind[cA]).toBe(BOUNDARY_EXIT.none);
    const result = await mergeHydrologyBoundaryPages([a, b], {}, noWait), c = component(result, 12, 12);
    expect(component(result, 18, 12)).toBe(c); expect(result.components.nodeId[c]).toBe(gid(11, 11));
    expect(result.components.exitKind[c]).toBe(BOUNDARY_EXIT.lowerLand); expect(result.components.exitTo[c]).toBe(gid(20, 12));
    expect(result.components.unresolved[c]).toBe(0); expect(result.components.nodeCount[c]).toBe(39);
  });
  it('orders equal candidate exits by actual global target/source identity, independent of page order and batches', async () => {
    const two: Field = (x, y) => x === 11 && y === 12 ? { coverageQ: 100, height: 50 } : flat(x, y);
    const a = await page(left, two), b = await page(right, two);
    const first = await mergeHydrologyBoundaryPages([a, b], { batch: 64 }, noWait), reverse = await mergeHydrologyBoundaryPages([b, a], { batch: 8192 }, noWait);
    expect(reverse).toEqual(first); const c = component(first, 13, 12);
    expect(first.components.exitTo[c]).toBe(gid(11, 12)); expect(first.components.exitFrom[c]).toBe(gid(11, 11));
  });
  it('keeps component identity and outlet candidates stable when the same domain is split into four cores', async () => {
    const two = await mergeHydrologyBoundaryPages([await page(left, flat), await page(right, flat)], {}, noWait);
    const fourPages = [];
    for (const originRow of [10, 13]) for (const originColumn of [10, 16]) fourPages.push(await page({ originColumn, originRow, columns: 6, rows: 3 }, flat));
    const four = await mergeHydrologyBoundaryPages(fourPages.reverse(), {}, noWait);
    expect(logical(four)).toEqual(logical(two)); expect(four.components).toEqual(two.components);
  });
  it('never joins the two banks across an actual twelve-world sea channel', async () => {
    const channel: Field = x => x >= 14 && x <= 19 ? { coverageQ: -100, height: -50 } : { coverageQ: 100, height: 100 };
    const result = await mergeHydrologyBoundaryPages([await page(left, channel), await page(right, channel)], {}, noWait);
    const west = component(result, 13, 12), east = component(result, 20, 12);
    expect(west).not.toBe(east); expect(component(result, 15, 12)).toBe(-1); expect(component(result, 16, 12)).toBe(-1);
    expect(result.components.exitKind[west]).toBe(BOUNDARY_EXIT.coast); expect(result.components.exitKind[east]).toBe(BOUNDARY_EXIT.coast);
    expect(result.components.coastXQ[east] - result.components.coastXQ[west]).toBe(12 * 256);
    for (let i = 0; i < result.ports.from.length; i++) expect(result.ports.kind[i] === BOUNDARY_PORT.land && result.ports.component[i] === west && result.ports.targetComponent[i] === east).toBe(false);
  });
  it('does not turn a zero-zero seam with negative incident thirds into a land bridge', async () => {
    const zeroEdge: Field = (x, y) => y === 12 && (x === 15 || x === 16) ? { coverageQ: 0, height: 0 } : { coverageQ: -100, height: -30 };
    const result = await mergeHydrologyBoundaryPages([await page(left, zeroEdge), await page(right, zeroEdge)], {}, noWait);
    const a = component(result, 15, 12), b = component(result, 16, 12); expect(a).not.toBe(b);
    expect(result.components.coastXQ[a]).toBe(15 * 512); expect(result.components.coastYQ[a]).toBe(12 * 512);
    expect(Array.from(result.ports.from).some((from, i) => from === gid(15, 12) && result.ports.to[i] === gid(16, 12))).toBe(false);
  });
  it('connects the same zero seam when a real incident third vertex supplies land area', async () => {
    const zeroLand: Field = (x, y) => y === 12 && (x === 15 || x === 16) ? { coverageQ: 0, height: 0 } : x === 15 && y === 11 ? { coverageQ: 100, height: 20 } : { coverageQ: -100, height: -30 };
    const result = await mergeHydrologyBoundaryPages([await page(left, zeroLand), await page(right, zeroLand)], {}, noWait);
    expect(component(result, 15, 12)).toBe(component(result, 16, 12));
  });
  it('retains crop uncertainty and represents the physical world boundary without inventing ocean', async () => {
    const constant: Field = () => ({ coverageQ: 100, height: 100 });
    const a = await page({ originColumn: 0, originRow: 0, columns: 6, rows: 6 }, constant), b = await page({ originColumn: 6, originRow: 0, columns: 6, rows: 6 }, constant);
    const result = await mergeHydrologyBoundaryPages([a, b], {}, noWait);
    expect(result.components.exitKind).toEqual(Uint8Array.of(BOUNDARY_EXIT.none)); expect(result.components.unresolved).toEqual(Uint8Array.of(1));
    expect(result.ports.kind).toContain(BOUNDARY_PORT.worldBoundary); expect(result.ports.kind).toContain(BOUNDARY_PORT.unknownLand); expect(result.ports.kind).not.toContain(BOUNDARY_PORT.coast);
  });
  it('rejects contradictory shared halo nodes, overlapping cores and mixed source identities', async () => {
    const a = await page(left), altered = input(right); altered.samples.groundMeters[0]++;
    await expect(mergeHydrologyBoundaryPages([a, await buildHydrologyBoundaryPage(altered, {}, noWait)], {}, noWait)).rejects.toThrow('不一致');
    await expect(mergeHydrologyBoundaryPages([a, a], {}, noWait)).rejects.toThrow('重复所有者');
    const otherSource = input(right); otherSource.source.rootDigest = 'c'.repeat(64);
    await expect(mergeHydrologyBoundaryPages([a, await buildHydrologyBoundaryPage(otherSource, {}, noWait)], {}, noWait)).rejects.toThrow('固定地理来源');
    await expect(mergeHydrologyBoundaryPages([a, structuredClone(a)], {}, noWait)).rejects.toThrow('不能伪造');
  });
  it('requires exactly the complete halo and validates source values and page topology', async () => {
    const missing = input(left); missing.samples.columns--;
    await expect(buildHydrologyBoundaryPage(missing, {}, noWait)).rejects.toThrow('halo');
    const invalid = input(left); invalid.samples.coverageQ[0] = -32768;
    await expect(buildHydrologyBoundaryPage(invalid, {}, noWait)).rejects.toThrow('节点海陆');
    const a = await page(left);
    await expect(mergeHydrologyBoundaryPages([a], {}, noWait)).rejects.toThrow('2–4');
    await expect(mergeHydrologyBoundaryPages([a, await page({ ...right, originColumn: 30 })], {}, noWait)).rejects.toThrow('相邻核心');
    await expect(buildHydrologyBoundaryPage(input({ originColumn: 1, originRow: 1, columns: 511, rows: 1 }), {}, noWait)).rejects.toThrow('512');
  });
  it('uses intrinsic private input copies before callbacks and never consults source species/iterator/slice', async () => {
    const data = input(left), baseline = await page(left);
    class HostileInt16 extends Int16Array {
      static get [Symbol.species]() { throw new Error('species must not run'); }
      override [Symbol.iterator](): ArrayIterator<number> { throw new Error('iterator must not run'); }
      override slice(): Int16Array<ArrayBuffer> { throw new Error('slice must not run'); }
    }
    const c = new HostileInt16(data.samples.coverageQ.length), h = new HostileInt16(data.samples.groundMeters.length);
    Int16Array.prototype.set.call(c, data.samples.coverageQ); Int16Array.prototype.set.call(h, data.samples.groundMeters); data.samples.coverageQ = c; data.samples.groundMeters = h;
    const actual = await buildHydrologyBoundaryPage(data, {}, { ...noWait, onProgress: () => { c.fill(-100); h.fill(-100); data.source.revision = 99; data.core.originColumn = 999; } });
    expect(actual.summary).toEqual(baseline.summary);
    expect(actual.source.revision).toBe(source.revision); expect(actual.core).toEqual(left);
  });
  it('does not trust caller-mutated summaries, metadata, list aliases or getters as merge authority', async () => {
    const a = await page(left, flat), b = await page(right, flat), baseline = await mergeHydrologyBoundaryPages([a, b], {}, noWait);
    a.summary.nodeIds.fill(0); a.summary.componentIds.fill(-1); a.source.revision = 999; a.core.originColumn = 999;
    const list = [a, b], actual = await mergeHydrologyBoundaryPages(list, {}, { ...noWait, onProgress: () => { list.length = 0; } });
    expect(actual).toEqual(baseline);
    let called = false; const data = input(left); Object.defineProperty(data.samples, 'coverageQ', { get() { called = true; throw new Error('getter must not run'); } });
    await expect(buildHydrologyBoundaryPage(data, {}, noWait)).rejects.toThrow('字段'); expect(called).toBe(false);
  });
  it('cancels real cooperative page and merge work without poisoning reusable private inputs', async () => {
    const abort = new AbortController(), data = input({ originColumn: 10, originRow: 10, columns: 20, rows: 20 }), original = structuredClone(data);
    await expect(buildHydrologyBoundaryPage(data, { batch: 64 }, { ...noWait, signal: abort.signal, onProgress: phase => { if (phase === 'boundary-union-flats') abort.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(data).toEqual(original);
    const a = await page(left), b = await page(right), cancelMerge = new AbortController();
    await expect(mergeHydrologyBoundaryPages([a, b], {}, { ...noWait, signal: cancelMerge.signal, onProgress: () => cancelMerge.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect((await mergeHydrologyBoundaryPages([a, b], {}, noWait)).stats.coreNodes).toBe(72);
  });
  it('enforces total working budgets without raising the existing kernel limits', async () => {
    const a = await page(left), b = await page(right), merged = await mergeHydrologyBoundaryPages([a, b], {}, noWait);
    expect(merged.stats.jobPeakTypedArrayBytes).toBeLessThanOrEqual(HYDROLOGY_LIMITS.typedArrayBytes);
    expect(merged.stats.operations).toBeLessThanOrEqual(merged.stats.sampleNodes * HYDROLOGY_LIMITS.operationsPerNode + 1024);
    expect(merged.stats.inputRetainedTypedArrayBytes).toBe(a.summary.stats.summaryTypedArrayBytes + b.summary.stats.summaryTypedArrayBytes + a.summary.stats.sampleNodes * 4 + b.summary.stats.sampleNodes * 4);
    await expect(mergeHydrologyBoundaryPages([a, b], { maximumTypedArrayBytes: merged.stats.jobPeakTypedArrayBytes - 1 }, noWait)).rejects.toThrow('内存预算');
    await expect(mergeHydrologyBoundaryPages([a, b], { maximumOperations: 1 }, noWait)).rejects.toThrow('操作预算');
    await expect(mergeHydrologyBoundaryPages([a, b], { maximumTypedArrayBytes: HYDROLOGY_LIMITS.typedArrayBytes + 1 }, noWait)).rejects.toThrow('超限');
  });
});
