import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Delaunay } from 'd3-delaunay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateClickHeights } from '../world/recovered-terrain/click-engine';
import { fmsTemplatePlacement, generateFmsLocalTemplate, prepareFmsTemplatePreview, type FmsTemplateOptions } from './local-template';
import { FmsEditHistory, type FmsDocument, type FmsPoint } from './model';
import { fixedFmsCoastVertices } from './coastline';
import { FmsTerrainClient, type FmsGenerationRequest } from './terrain-client';
import { runFmsTemplateRequest } from './terrain.worker';
import { loadFmsDocument, saveFmsDocument } from './persistence';

function fixture(): FmsDocument {
  const points: FmsPoint[] = [];
  for (let y = 0; y <= 32; y++) for (let x = 0; x <= 32; x++) points.push([x * 10, y * 10]);
  // One extra off-grid site represents coast-refined topology: no cellsX*cellsY fiction.
  points.push([156, 154]);
  const mesh = Delaunay.from(points);
  return { format: 'lieguoji-fms-world', version: 2, worldId: '00000000-0000-4000-8000-000000000001', revision: 5,
    width: 320, height: 320, points, triangles: Uint32Array.from(mesh.triangles), neighbors: points.map((_, i) => [...mesh.neighbors(i)]),
    elevations: Int32Array.from(points, ([x, y]) => x >= 40 && x <= 280 && y >= 40 && y <= 280 ? 35 : 0), terrainLocks: new Uint8Array(points.length) };
}
const options: FmsTemplateOptions = { x: 160, y: 160, template: 'pangea', seed: 1337, preserveCoast: true };
const fast = { yieldTask: async () => {} };
const candidate = (doc: FmsDocument, elevations: Int32Array) => ({ worldId: doc.worldId, baseRevision: doc.revision, elevations });
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror = null; onmessageerror = null;
  request?: FmsGenerationRequest;
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  postMessage(request: FmsGenerationRequest) { this.request = structuredClone(request); }
  async reply(raw?: unknown) { this.onmessage?.({ data: raw ?? await runFmsTemplateRequest(this.request) } as MessageEvent); }
}
const clients: FmsTerrainClient[] = [];
function client(timeoutMs = 5000) { vi.stubGlobal('Worker', WorkerDouble); const c = new FmsTerrainClient({ timeoutMs }); clients.push(c); return c; }
const worker = () => WorkerDouble.instances.at(-1)!;
afterEach(() => { clients.splice(0).forEach(c => c.close()); WorkerDouble.instances = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('original click template V5 integration', () => {
  it('recovers nearest-site center and exact float32 boundary-derived size, including zero at edge', () => {
    const doc = fixture();
    expect(fmsTemplatePlacement(doc, { x: 158, y: 161 })).toEqual({ centerCell: 544, center: [160, 160], sizeFactor: Math.fround(.3) });
    expect(fmsTemplatePlacement(doc, { x: 9, y: 151 }).sizeFactor).toBe(Math.fround(10 / 320));
    expect(fmsTemplatePlacement(doc, { x: 312, y: 151 }).sizeFactor).toBe(Math.fround(10 / 320));
    expect(fmsTemplatePlacement(doc, { x: 0, y: 151 }).sizeFactor).toBe(0);
  });
  it.each(['pangea', 'highIsland'] as const)('runs %s from zero then max-merges, without radius crop or changing existing high terrain', async template => {
    const doc = fixture(); doc.elevations.fill(0); doc.elevations[544] = 99;
    const input = { ...options, preserveCoast: false, template }, before = structuredClone(doc);
    const source = await generateClickHeights(doc, String(input.seed), template, fmsTemplatePlacement(doc, input), fast);
    const result = await generateFmsLocalTemplate(doc, input, fast);
    expect(result.elevations).toEqual(Int32Array.from(source, (h, i) => Math.max(h, before.elevations[i])));
    expect(result.stats.newLandCells).toBeGreaterThan(5); expect(result.elevations[544]).toBe(99); expect(doc).toEqual(before);
    if (template === 'highIsland') expect(result.elevations[0]).toBeGreaterThan(0); // Global Add/Mask survives outside local features.
    expect(await generateFmsLocalTemplate(doc, input, fast)).toEqual(result);
    expect((await generateFmsLocalTemplate(doc, { ...input, seed: 71 }, fast)).elevations).not.toEqual(result.elevations);
  });
  it('changes template placement with the selected site, and accepts the original zero scale at edges', async () => {
    const doc = fixture(); doc.elevations.fill(0);
    const a = await generateFmsLocalTemplate(doc, { ...options, preserveCoast: false }, fast);
    const b = await generateFmsLocalTemplate(doc, { ...options, x: 70, y: 90, preserveCoast: false }, fast);
    expect(a.elevations).not.toEqual(b.elevations);
    expect((await generateFmsLocalTemplate(doc, { ...options, x: 0, preserveCoast: false }, fast)).stats.sizeFactor).toBe(0);
  });
  it('preserves actual interpolated coast, tiny island and narrow neck while raising inland terrain', async () => {
    const doc = fixture();
    doc.points.forEach(([x, y], i) => { doc.elevations[i] = ((x >= 40 && x <= 180 && y >= 40 && y <= 260) || (x >= 190 && x <= 220 && y === 160) || (x >= 230 && x <= 260 && y >= 140 && y <= 180) || (x === 280 && y === 280)) ? 25 : 0; });
    doc.terrainLocks![544] = 1;
    const result = await generateFmsLocalTemplate(doc, options, fast), coast = fixedFmsCoastVertices(doc);
    expect(result.stats.changedCells).toBeGreaterThan(0); expect(result.stats.newLandCells).toBe(0);
    coast.forEach((locked, i) => { if (locked) expect(result.elevations[i]).toBe(doc.elevations[i]); });
    let crossings = 0;
    for (let i = 0; i < doc.triangles.length; i += 3) for (let j = 0; j < 3; j++) {
      const a = doc.triangles[i + j], b = doc.triangles[i + (j + 1) % 3], ha = doc.elevations[a], hb = doc.elevations[b];
      if ((ha < 20) === (hb < 20)) continue;
      crossings++; expect((20 - result.elevations[a]) / (result.elevations[b] - result.elevations[a])).toBe((20 - ha) / (hb - ha));
    }
    expect(crossings).toBeGreaterThan(100); expect(result.elevations[544]).toBe(doc.elevations[544]);
  });
  it('applies player locks after generation in both modes and can leave blank sea unchanged under coast protection', async () => {
    const doc = fixture(); doc.elevations.fill(0);
    expect((await generateFmsLocalTemplate(doc, options, fast)).stats.changedCells).toBe(0);
    const free = await generateFmsLocalTemplate(doc, { ...options, preserveCoast: false }, fast);
    doc.terrainLocks!.fill(1, 530, 560);
    const locked = await generateFmsLocalTemplate(doc, { ...options, preserveCoast: false }, fast);
    locked.elevations.forEach((h, i) => expect(h).toBe(doc.terrainLocks![i] ? doc.elevations[i] : free.elevations[i]));
  });
  it('cancels bounded computation and rejects budget exhaustion without changing input', async () => {
    const doc = fixture(), before = structuredClone(doc), controller = new AbortController();
    await expect(generateFmsLocalTemplate(doc, options, { ...fast, workLimit: 1 })).rejects.toThrow('预算');
    await expect(generateFmsLocalTemplate(doc, options, { signal: controller.signal, yieldTask: async () => { controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(doc).toEqual(before);
  });
  it.each([{ x: -1 }, { x: 321 }, { template: 'archipelago' }, { preserveCoast: 1 }, { sizeFactor: .2 }, { seed: -1 }])('rejects unsupported parameters %j', async fault => {
    await expect(generateFmsLocalTemplate(fixture(), { ...options, ...fault } as FmsTemplateOptions, fast)).rejects.toThrow();
  });
  it('confirms one revision with exact undo/redo and isolated v2 save/reload, rejecting stale or illegal candidates', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory()); const doc = fixture(), before = structuredClone(doc);
    const result = await generateFmsLocalTemplate(doc, options, fast), preview = candidate(doc, result.elevations), prepared = prepareFmsTemplatePreview(doc, preview, options);
    const history = new FmsEditHistory(doc), applied = history.commit(prepared.patch); expect(doc).toEqual(before);
    expect(applied.revision).toBe(6); expect(history.undo().elevations).toEqual(doc.elevations); expect(history.redo().elevations).toEqual(applied.elevations);
    await saveFmsDocument(history.document, null); expect((await loadFmsDocument())?.document).toEqual(history.document);
    expect(() => prepareFmsTemplatePreview(applied, preview, options)).toThrow('地图已变化');
    const forged = result.elevations.slice(); forged[0] = 100;
    expect(() => prepareFmsTemplatePreview(doc, candidate(doc, forged), options)).toThrow('保护');
    forged[0] = 0; forged[544] = 1;
    expect(() => prepareFmsTemplatePreview(doc, candidate(doc, forged), { ...options, preserveCoast: false })).toThrow('降低');
  });
  it('roundtrips the real async Worker response bound to owned options, heights and geometry', async () => {
    const c = client(), doc = fixture(), input = { ...options }, pending = c.localTemplate(doc, input);
    input.preserveCoast = false; doc.elevations.fill(0); doc.points[0][0] = 1;
    await worker().reply(); const result = await pending;
    expect(result.stats.preserveCoast).toBe(true); expect(result.stats.changedCells).toBeGreaterThan(0); expect(result.drainage.stats.algorithm).toBe('land-area-runoff-v2');
  });
  it.each(['coast', 'lock', 'lower', 'kind', 'scale', 'template', 'mode', 'new-land', 'revision'] as const)('rejects forged %s Worker output', async fault => {
    const doc = fixture(); doc.terrainLocks![544] = 1;
    const c = client(), pending = c.localTemplate(doc, options), rejection = expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    const response = await runFmsTemplateRequest(worker().request); if (response.kind !== 'template-generated') throw new Error('Expected template response');
    if (fault === 'coast') response.elevations[0] = 90;
    if (fault === 'lock') response.elevations[544] = 99;
    if (fault === 'lower') response.elevations[543] = 1;
    if (fault === 'kind') Object.assign(response, { kind: 'hill-generated' });
    if (fault === 'scale') response.stats.sizeFactor = .1;
    if (fault === 'template') response.stats.template = 'highIsland';
    if (fault === 'mode') response.stats.preserveCoast = false;
    if (fault === 'new-land') response.stats.newLandCells++;
    if (fault === 'revision') response.baseRevision++;
    await worker().reply(response); await rejection; expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it('terminates on timeout and ignores old delivery after cancellation and a new request', async () => {
    const c = client(), doc = fixture(), controller = new AbortController();
    const a = c.localTemplate(doc, options, { signal: controller.signal }), rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const old = worker(), late = old.onmessage!, response = await runFmsTemplateRequest(old.request); controller.abort(); await rejected;
    const b = c.localTemplate(doc, { ...options, seed: 71 }); late({ data: response } as MessageEvent); await worker().reply(); expect((await b).stats.seed).toBe(71);
    vi.useFakeTimers(); const timed = client(20).localTemplate(doc, options), timeout = expect(timed).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(20); await timeout; expect(worker().terminate).toHaveBeenCalledOnce();
  });
});
