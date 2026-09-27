import { describe, expect, it } from 'vitest';
import { buildHydrologyKernel, type HydrologyResult } from './hydrology-kernel';
import { buildHydrologyTrace, HYDROLOGY_TRACE_LIMIT, validateHydrologyTrace, validateHydrologyTraceRequest, type HydrologyTrace, type HydrologyTraceRequest } from './hydrology-trace';

const expected = { draftId: 'atlas-synthetic-hydrology', revision: 2, manifestDigest: 'a'.repeat(64), rootDigest: 'b'.repeat(64) };
const source: HydrologyTrace['source'] = { ...expected, atlasId: 'atlas-source', version: 4, lockSetDigest: 'c'.repeat(64), rootBinding: 'current-owned-session-head' };
const request: HydrologyTraceRequest = { expected, rectangle: { originColumn: 20, originRow: 30, columns: 5, rows: 3 }, sourceNode: { column: 20, row: 31 } };
const noWait = { yieldControl: async () => {} };
async function slope() {
  return buildHydrologyKernel({ ...request.rectangle, coverageQ: Int16Array.from({ length: 15 }, (_, i) => i % 5 === 4 ? -100 : 100), groundMeters: Int16Array.from({ length: 15 }, (_, i) => i % 5 === 4 ? -100 : 500 - i % 5 * 100) }, {}, noWait);
}

describe('bounded real hydrology trace contract', () => {
  it('follows actual cardinal receivers and ends at the canonical coast, not the sea node', async () => {
    const kernel = await slope(), trace = buildHydrologyTrace(kernel, source, request);
    expect(trace.path).toEqual([20, 21, 22, 23].map(column => ({ column, row: 31 })));
    expect(trace.coastPointQ).toEqual({ xQ: 23 * 512 + 256, yQ: 31 * 512 });
    expect(trace).toMatchObject({ terminal: 'ocean', partial: true, contributingSamples: 1, terminalContributingSamples: 4 });
    expect(validateHydrologyTrace(JSON.parse(JSON.stringify(trace)), request)).toEqual(trace);
    trace.path[0].column = 999; expect(buildHydrologyTrace(kernel, source, request).path[0]).toEqual(request.sourceNode);
  });
  it('reports sea without invented land routes, flux or upstream samples', async () => {
    const req = { ...request, sourceNode: { column: 24, row: 31 } }, trace = buildHydrologyTrace(await slope(), source, req);
    expect(trace).toMatchObject({ path: [req.sourceNode], coastPointQ: null, terminal: 'sea', partial: false, contributingSamples: 0, terminalContributingSamples: 0 });
  });
  it('distinguishes an enclosed depression from a flat cropped boundary', async () => {
    const req = { ...request, rectangle: { originColumn: 10, originRow: 10, columns: 3, rows: 3 }, sourceNode: { column: 11, row: 11 } };
    const basin = await buildHydrologyKernel({ ...req.rectangle, coverageQ: new Int16Array(9).fill(100), groundMeters: Int16Array.from([9, 9, 9, 9, 1, 9, 9, 9, 9]) }, {}, noWait);
    expect(buildHydrologyTrace(basin, source, req)).toMatchObject({ terminal: 'depression', partial: true, contributingSamples: 9 });
    const flat = await buildHydrologyKernel({ ...req.rectangle, coverageQ: new Int16Array(9).fill(100), groundMeters: new Int16Array(9).fill(100) }, {}, noWait);
    expect(buildHydrologyTrace(flat, source, req)).toMatchObject({ terminal: 'unresolved', partial: true, coastPointQ: null });
  });
  it.each(['identity', 'scope', 'jump', 'repeat', 'coast', 'counts', 'unknown', 'future', 'accessor'] as const)('rejects %s result tampering', async fault => {
    const trace = buildHydrologyTrace(await slope(), source, request);
    if (fault === 'identity') trace.source.manifestDigest = 'f'.repeat(64);
    if (fault === 'scope') trace.rectangle.rows++;
    if (fault === 'jump') trace.path.splice(1, 1);
    if (fault === 'repeat') trace.path[2] = { ...trace.path[0] };
    if (fault === 'coast') trace.coastPointQ!.xQ += 512;
    if (fault === 'counts') trace.terminalContributingSamples = 1;
    if (fault === 'unknown') Object.assign(trace, { discharge: 100 });
    if (fault === 'future') Object.assign(trace, { version: 2 });
    if (fault === 'accessor') Object.defineProperty(trace.path[1], 'column', { get: () => { throw new Error('must not execute getter'); } });
    expect(() => validateHydrologyTrace(trace, request)).toThrow(/水文|海岸/);
  });
  it('rejects invalid requests before using getters and captures valid source parameters privately', () => {
    const input = structuredClone(request), accepted = validateHydrologyTraceRequest(input);
    input.rectangle.columns = 512; input.sourceNode.column = 2048; input.expected.revision++;
    expect(accepted).toEqual(request);
    for (const value of [1, 513, 1.5, NaN]) expect(() => validateHydrologyTraceRequest({ ...request, rectangle: { ...request.rectangle, rows: value } })).toThrow();
    expect(() => validateHydrologyTraceRequest({ ...request, rectangle: { ...request.rectangle, originColumn: 2047 } })).toThrow();
    expect(() => validateHydrologyTraceRequest({ ...request, sourceNode: { column: 2, row: 2 } })).toThrow();
    const getter = Object.defineProperty({ ...request }, 'rectangle', { get: () => { throw new Error('must not execute getter'); } });
    expect(() => validateHydrologyTraceRequest(getter)).toThrow('格式');
    const hidden = Object.defineProperty({ ...request }, 'rectangle', { value: request.rectangle, enumerable: false });
    expect(() => validateHydrologyTraceRequest(hidden)).toThrow('格式');
  });
  it('caps a real adjacent long path without joining its truncated endpoint to the far outlet', () => {
    const columns = 100, rows = 50, n = columns * rows;
    const nodes = Array.from({ length: n }, (_, i) => { const row = Math.floor(i / columns), column = row % 2 ? columns - 1 - i % columns : i % columns; return row * columns + column; });
    const receiver = new Int32Array(n), groundMeters = new Int16Array(n), contributingSamples = new Uint32Array(n);
    nodes.forEach((id, i) => { receiver[id] = nodes[i + 1] ?? -7; groundMeters[id] = n - i; contributingSamples[id] = i + 1; });
    const kernel: HydrologyResult = { originColumn: 0, originRow: 0, columns, rows, stepQ: 512, receiver, groundMeters, contributingSamples,
      coverageQ: new Int16Array(n).fill(100), basinId: new Int32Array(n), drainageStatus: new Uint8Array(n).fill(2), lakeWaterSurfaceMeters: new Int16Array(n).fill(-32768), topologicalOrder: Uint32Array.from(nodes),
      basins: { terminalNode: Uint32Array.of(nodes.at(-1)!), terminalKind: Uint8Array.of(2), partial: Uint8Array.of(1), candidateSpillMeters: Int16Array.of(-32768), spillFromNode: Int32Array.of(-1), spillToNode: Int32Array.of(-1), coastXQ: Int32Array.of(-1), coastYQ: Int32Array.of(-1) },
      stats: { nodes: n, landNodes: n, basinCount: 1, operations: 0, typedArrayBytes: 0, maximumQueueLength: 0 } };
    const req = { expected, rectangle: { originColumn: 0, originRow: 0, columns, rows }, sourceNode: { column: 0, row: 0 } };
    const trace = buildHydrologyTrace(kernel, source, req), end = nodes[HYDROLOGY_TRACE_LIMIT - 1];
    expect(trace).toMatchObject({ terminal: 'truncated', partial: true, coastPointQ: null, terminalContributingSamples: HYDROLOGY_TRACE_LIMIT });
    expect(trace.path).toHaveLength(HYDROLOGY_TRACE_LIMIT); expect(trace.path.at(-1)).toEqual({ column: end % columns, row: Math.floor(end / columns) });
    expect(new TextEncoder().encode(JSON.stringify(trace)).length).toBeLessThan(256 * 1024);
    trace.path.pop(); expect(() => validateHydrologyTrace(trace, req)).toThrow('截断');
  });
  it('rejects a corrupt private receiver rather than drawing a nonphysical shortcut', async () => {
    const kernel = await slope(); kernel.receiver[5] = 8;
    expect(() => buildHydrologyTrace(kernel, source, request)).toThrow('真实下游');
  });
});
