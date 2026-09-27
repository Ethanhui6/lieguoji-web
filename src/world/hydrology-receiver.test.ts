import { describe, expect, it } from 'vitest';
import { buildHydrologyBoundaryPage, buildHydrologyPageReceivers, preflightHydrologyReceivers, RECEIVER_STATUS, RECEIVER_TERMINAL,
  type HydrologyBoundaryCore, type HydrologyBoundaryInput, type HydrologyPageReceivers } from './hydrology-boundary';
import { NO_WATER } from './hydrology-kernel';
const source = { draftId: 'receiver-synthetic', revision: 0, manifestDigest: 'a'.repeat(64), rootDigest: 'b'.repeat(64) };
const fast = { yieldControl: async () => {} };
const cores = (): [HydrologyBoundaryCore, HydrologyBoundaryCore] => [{ originColumn: 20, originRow: 20, columns: 8, rows: 8 }, { originColumn: 28, originRow: 20, columns: 8, rows: 8 }];
type Terrain = (x: number, y: number) => { c: number; h: number };
function raw(core: HydrologyBoundaryCore, terrain: Terrain): HydrologyBoundaryInput {
  const x0 = Math.max(0, core.originColumn - 1), y0 = Math.max(0, core.originRow - 1), x1 = Math.min(2049, core.originColumn + core.columns + 1), y1 = Math.min(2049, core.originRow + core.rows + 1);
  const columns = x1 - x0, rows = y1 - y0, coverageQ = new Int16Array(columns * rows), groundMeters = new Int16Array(columns * rows);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const value = terrain(x, y), i = (y - y0) * columns + x - x0; coverageQ[i] = value.c; groundMeters[i] = value.h; }
  return { source: { ...source }, core: { ...core }, samples: { originColumn: x0, originRow: y0, columns, rows, coverageQ, groundMeters } };
}
async function pages(terrain: Terrain, pair = cores()) { return Promise.all(pair.map(core => buildHydrologyBoundaryPage(raw(core, terrain), {}, fast))); }
const at = (result: HydrologyPageReceivers, x: number, y: number) => result.nodeIds.indexOf(y * 2049 + x);
function trace(result: HydrologyPageReceivers, x: number, y: number) {
  let i = at(result, x, y); const seen = new Set<number>(), ids: number[] = [];
  while (i >= 0) {
    const id = result.nodeIds[i]; expect(seen.has(id)).toBe(false); seen.add(id); ids.push(id);
    const next = result.receiverNodeIds[i]; if (next < 0) return { ids, terminal: next, index: i };
    const to = result.nodeIds.indexOf(next); expect(to).toBeGreaterThanOrEqual(0);
    expect(Math.abs(id % 2049 - next % 2049) + Math.abs(Math.floor(id / 2049) - Math.floor(next / 2049))).toBe(1);
    expect(result.groundMeters[to]).toBeLessThanOrEqual(result.groundMeters[i]); expect(result.contributingSamples[to]).toBeGreaterThan(result.contributingSamples[i]); i = to;
  }
  throw Error('Broken receiver');
}
describe('two private core+halo receiver data, separate from single-domain trace', () => {
  it('crosses the page seam by actual downhill edges and accumulates the core samples at an actual coast', async () => {
    const result = await buildHydrologyPageReceivers(await pages(x => x >= 35 ? { c: -512, h: -100 } : { c: 512, h: 1000 - x }), {}, fast);
    const path = trace(result, 20, 23);
    expect(path.ids).toContain(23 * 2049 + 27); expect(path.ids).toContain(23 * 2049 + 28);
    expect(path.terminal).toBe(RECEIVER_TERMINAL.coast); expect(result.contributingSamples[path.index]).toBe(15);
    expect(result.coastXQ[path.index]).toBe(69 * 256); expect(result.stats.crossPageReceivers).toBe(8);
    expect([...result.lakeWaterSurfaceMeters].every(value => value === NO_WATER)).toBe(true);
  });
  it('routes a flat across the seam to the real lower neighbour and is stable across page order/batch', async () => {
    const input = await pages(x => x >= 35 ? { c: -512, h: -100 } : { c: 512, h: x === 34 ? 100 : 300 });
    const a = await buildHydrologyPageReceivers(input, { batch: 64 }, fast), b = await buildHydrologyPageReceivers([...input].reverse(), { batch: 8192 }, fast);
    const path = trace(a, 20, 22); expect(path.terminal).toBe(RECEIVER_TERMINAL.coast); expect(path.ids.some(id => id % 2049 === 34)).toBe(true);
    for (const key of ['nodeIds', 'receiverNodeIds', 'terminalNodeIds', 'contributingSamples', 'drainageStatus'] as const) expect(a[key]).toEqual(b[key]);
  });
  it('stops a cropped flat at a real external boundary and propagates unresolved to its upstream nodes', async () => {
    const result = await buildHydrologyPageReceivers(await pages(() => ({ c: 512, h: 300 })), {}, fast), path = trace(result, 33, 25);
    expect(path.terminal).toBe(RECEIVER_TERMINAL.unresolved); expect(result.boundaryTargetNodeIds[path.index]).toBeGreaterThanOrEqual(0);
    expect([...result.drainageStatus].every(value => value === RECEIVER_STATUS.unresolved)).toBe(true);
    expect([...result.coastXQ].every(value => value === -1)).toBe(true); expect(result.contributingSamples[path.index]).toBe(128);
  });
  it('uses a witnessed lower halo as unresolved, never jumps to its ID outside the owned cores', async () => {
    const result = await buildHydrologyPageReceivers(await pages(x => ({ c: 512, h: 1000 - x })), {}, fast), path = trace(result, 20, 24);
    expect(path.ids.at(-1)).toBe(24 * 2049 + 35); expect(path.terminal).toBe(RECEIVER_TERMINAL.unresolved);
    expect(result.boundaryTargetNodeIds[path.index]).toBe(24 * 2049 + 36);
  });
  it('does not bridge the two banks of a real 12-world negative-coverage channel', async () => {
    const result = await buildHydrologyPageReceivers(await pages(x => x >= 26 && x <= 31 ? { c: -512, h: -200 } : { c: 512, h: 300 }), {}, fast);
    const west = trace(result, 20, 24), east = trace(result, 35, 24);
    expect(west.terminal).toBe(RECEIVER_TERMINAL.coast); expect(east.terminal).toBe(RECEIVER_TERMINAL.coast);
    expect(west.ids.every(id => id % 2049 < 26)).toBe(true); expect(east.ids.every(id => id % 2049 > 31)).toBe(true);
    for (let x = 26; x <= 31; x++) expect(result.receiverNodeIds[at(result, x, 24)]).toBe(RECEIVER_TERMINAL.excluded);
  });
  it('records a real closed low centre without manufacturing a lake surface', async () => {
    const result = await buildHydrologyPageReceivers(await pages((x, y) => ({ c: 512, h: 100 + 20 * (Math.abs(x - 27) + Math.abs(y - 24)) })), {}, fast);
    const path = trace(result, 32, 23); expect(path.terminal).toBe(RECEIVER_TERMINAL.depression);
    expect(path.ids.at(-1)).toBe(24 * 2049 + 27); expect(result.lakeWaterSurfaceMeters[path.index]).toBe(NO_WATER);
    expect(result.contributingSamplesIncomplete[path.index]).toBe(1);
  });
  it('does not join a zero-zero seam whose actual incident third vertices are sea', async () => {
    const pair: [HydrologyBoundaryCore, HydrologyBoundaryCore] = [{ originColumn: 20, originRow: 20, columns: 1, rows: 1 }, { originColumn: 21, originRow: 20, columns: 1, rows: 1 }];
    const result = await buildHydrologyPageReceivers(await pages((x, y) => y === 20 && (x === 20 || x === 21) ? { c: 0, h: 0 } : { c: -512, h: -100 }, pair), {}, fast);
    expect([...result.receiverNodeIds]).toEqual([RECEIVER_TERMINAL.coast, RECEIVER_TERMINAL.coast]);
    expect([...result.contributingSamples]).toEqual([1, 1]); expect(result.stats.crossPageReceivers).toBe(0);
  });
  it('keeps world edges unresolved, not fabricated sea beyond the map', async () => {
    const pair: [HydrologyBoundaryCore, HydrologyBoundaryCore] = [{ originColumn: 0, originRow: 0, columns: 8, rows: 8 }, { originColumn: 8, originRow: 0, columns: 8, rows: 8 }];
    const result = await buildHydrologyPageReceivers(await pages(() => ({ c: 512, h: 100 }), pair), {}, fast), path = trace(result, 10, 4);
    expect(path.terminal).toBe(RECEIVER_TERMINAL.unresolved); expect(result.coastXQ[path.index]).toBe(-1);
  });
  it('recognizes a zero node already on a real source-triangle coast without a diagonal receiver', async () => {
    const result = await buildHydrologyPageReceivers(await pages((x, y) => x === 22 && y === 22 ? { c: 0, h: 0 }
      : x === 21 && y === 21 ? { c: -512, h: -100 } : { c: 512, h: 100 }), {}, fast);
    const zero = at(result, 22, 22);
    expect(result.receiverNodeIds[zero]).toBe(RECEIVER_TERMINAL.coast);
    expect(result.coastXQ[zero]).toBe(22 * 512); expect(result.coastYQ[zero]).toBe(22 * 512);
    expect(trace(result, 22, 23).terminal).toBe(RECEIVER_TERMINAL.coast);
  });
  it('uses private captured terrain even if original input and public summaries are changed', async () => {
    const inputs = cores().map(core => raw(core, x => ({ c: 512, h: 1000 - x }))), owned = await Promise.all(inputs.map(input => buildHydrologyBoundaryPage(input, {}, fast)));
    const before = await buildHydrologyPageReceivers(owned, {}, fast);
    for (let i = 0; i < 2; i++) { inputs[i].samples.coverageQ.fill(-100); owned[i].summary.nodeIds.fill(0); owned[i].core.columns = 1; owned[i].source.revision = 99; }
    const after = await buildHydrologyPageReceivers(owned, {}, fast); expect(after.receiverNodeIds).toEqual(before.receiverNodeIds); expect(after.source.revision).toBe(0);
    await expect(buildHydrologyPageReceivers([structuredClone(owned[0]), owned[1]], {}, fast)).rejects.toThrow('私有');
  });
  it('rejects mismatched true halo bytes, excessive cores and insufficient preflight budgets', async () => {
    const a = raw(cores()[0], () => ({ c: 512, h: 300 })), b = raw(cores()[1], () => ({ c: 512, h: 300 })); b.samples.groundMeters[0] = 301;
    const pair = await Promise.all([a, b].map(input => buildHydrologyBoundaryPage(input, {}, fast)));
    await expect(buildHydrologyPageReceivers(pair, {}, fast)).rejects.toThrow('不一致');
    expect(() => preflightHydrologyReceivers([{ ...cores()[0], columns: 129 }, { ...cores()[1], originColumn: 149 }])).toThrow('128');
    expect(() => preflightHydrologyReceivers(cores(), { maximumTypedArrayBytes: 1 })).toThrow('预算');
    const full = preflightHydrologyReceivers([{ originColumn: 128, originRow: 128, columns: 128, rows: 128 }, { originColumn: 256, originRow: 128, columns: 128, rows: 128 }]);
    expect(full.coreNodes).toBe(32768); expect(full.sampleNodes).toBe(33800); expect(full.maximumLiveTypedArrayBytes).toBe(4143984);
  });
  it('cancels during actual flat routing and enforces the original combined operation limit', async () => {
    const pair = await pages(x => x >= 35 ? { c: -512, h: -200 } : { c: 512, h: 300 }), controller = new AbortController(); let reached = false;
    await expect(buildHydrologyPageReceivers(pair, { batch: 64 }, { ...fast, signal: controller.signal, onProgress: phase => { if (phase === 'receiver-route-flats') { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); await expect(buildHydrologyPageReceivers(pair, { maximumOperations: 1 }, fast)).rejects.toThrow('预算');
    const actual = await buildHydrologyPageReceivers(pair, {}, fast); expect(actual.stats.operations).toBeLessThanOrEqual(actual.stats.maximumOperations);
  });
  it('keeps an actual pair of 128 cores within the fixed operation and typed-array bounds', async () => {
    const pair: [HydrologyBoundaryCore, HydrologyBoundaryCore] = [{ originColumn: 128, originRow: 128, columns: 128, rows: 128 }, { originColumn: 256, originRow: 128, columns: 128, rows: 128 }];
    const result = await buildHydrologyPageReceivers(await pages(x => ({ c: 512, h: 1000 - x }), pair), {}, fast);
    expect(result.stats.coreNodes).toBe(32768); expect(result.stats.sampleNodes).toBe(33800);
    expect(result.stats.operations).toBeLessThanOrEqual(33800 * 64 + 1024); expect(result.stats.maximumLiveTypedArrayBytes).toBe(4143984);
    expect(result.stats.outputTypedArrayBytes).toBe(32768 * 36); expect(result.contributingSamples[at(result, 383, 180)]).toBe(256);
    expect(trace(result, 128, 180).terminal).toBe(RECEIVER_TERMINAL.unresolved);
  }, 30000);
});
