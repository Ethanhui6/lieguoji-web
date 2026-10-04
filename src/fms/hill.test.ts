import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Delaunay } from 'd3-delaunay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFmsHill, type FmsHillOptions } from './hill';
import { FmsEditHistory, type FmsDocument, type FmsPoint } from './model';
import { prepareFmsTerrainPreview } from './terrain-preview';
import { FmsTerrainClient, type FmsGenerationRequest } from './terrain-client';
import { runFmsTerrainRequest } from './terrain.worker';
import { loadFmsDocument, saveFmsDocument } from './persistence';

function fixture(): FmsDocument {
  const points: FmsPoint[] = [];
  for (let y = 0; y <= 16; y++) for (let x = 0; x <= 16; x++) points.push([x * 10, y * 10]);
  const mesh = Delaunay.from(points);
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 5,
    width: 160, height: 160, points, triangles: Uint32Array.from(mesh.triangles), neighbors: points.map((_, i) => [...mesh.neighbors(i)]),
    elevations: Int32Array.from(points, ([x, y]) => x >= 20 && x <= 140 && y >= 20 && y <= 140 ? 45 : 0) };
}
const options: FmsHillOptions = { x: 80, y: 80, radius: 50, height: 85, decay: .96, seed: 1337 };
const asPreview = (doc: FmsDocument, result: ReturnType<typeof generateFmsHill>) => ({ ...result, worldId: doc.worldId, baseRevision: doc.revision });
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror = null; onmessageerror = null;
  request?: FmsGenerationRequest;
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  postMessage(request: FmsGenerationRequest) { this.request = structuredClone(request); }
  reply(raw: unknown = runFmsTerrainRequest(this.request)) { this.onmessage?.({ data: raw } as MessageEvent); }
}
const clients: FmsTerrainClient[] = [];
function client(timeoutMs = 1000) { vi.stubGlobal('Worker', WorkerDouble); const c = new FmsTerrainClient({ timeoutMs }); clients.push(c); return c; }
const worker = () => WorkerDouble.instances.at(-1)!;
afterEach(() => { clients.splice(0).forEach(c => c.close()); WorkerDouble.instances = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('recovered native Hill wired to V5', () => {
  it('has a hand-bounded sharp peak: decay .8 makes every first neighbor below old height45', () => {
    const doc = fixture(), before = structuredClone(doc), result = generateFmsHill(doc, { ...options, height: 100, decay: .8 });
    // pow(100,.8)*1.1 < 44; later descendants cannot exceed that. Max retains 45.
    expect(result.stats.changedCells).toBe(1); expect(result.elevations[144]).toBe(100);
    expect(result.elevations.filter((h, i) => h !== doc.elevations[i])).toEqual(Int32Array.of(100)); expect(doc).toEqual(before);
  });
  it('repeats seed, preserves higher terrain, limits changes to the stamp, and changes with seed', () => {
    const doc = fixture(); doc.elevations[145] = 97;
    const a = generateFmsHill(doc, options), b = generateFmsHill(doc, options), c = generateFmsHill(doc, { ...options, seed: 72 });
    expect(a).toEqual(b); expect(a.elevations).not.toEqual(c.elevations); expect(a.elevations[145]).toBe(97);
    expect(a.stats.changedCells).toBeGreaterThan(4); expect(a.elevations[18]).toBe(doc.elevations[18]);
    expect(generateFmsHill({ ...doc, elevations: a.elevations }, options).stats.changedCells).toBe(0);
  });
  it('fixes actual cross-sea triangle edge interpolation, including a tiny island and narrow neck', () => {
    const doc = fixture();
    doc.elevations.fill(0);
    doc.points.forEach(([x, y], i) => { if ((x >= 30 && x <= 80 && y >= 30 && y <= 120) || (x === 90 && y === 80) || (x >= 100 && x <= 120 && y >= 70 && y <= 90) || (x === 140 && y === 130)) doc.elevations[i] = 45; });
    const result = generateFmsHill(doc, { ...options, x: 60, radius: 150 }); let edges = 0;
    for (let i = 0; i < doc.triangles.length; i += 3) {
      const ids = Array.from(doc.triangles.slice(i, i + 3));
      for (let j = 0; j < 3; j++) {
        const a = ids[j], b = ids[(j + 1) % 3], ha = doc.elevations[a], hb = doc.elevations[b];
        if ((ha < 20) === (hb < 20)) continue;
        edges++; expect((20 - result.elevations[a]) / (result.elevations[b] - result.elevations[a])).toBe((20 - ha) / (hb - ha));
      }
    }
    expect(edges).toBeGreaterThan(50); expect(result.stats.changedCells).toBeGreaterThan(0);
  });
  it('masks a locked center AFTER propagation, retaining the identical neighboring hill', () => {
    const doc = fixture(), ordinary = generateFmsHill(doc, options);
    doc.version = 2; doc.terrainLocks = new Uint8Array(doc.points.length); doc.terrainLocks[144] = 1;
    const locked = generateFmsHill(doc, options); expect(locked.elevations[144]).toBe(45);
    expect(locked.elevations.slice(145)).toEqual(ordinary.elevations.slice(145)); expect(locked.stats.changedCells).toBe(ordinary.stats.changedCells - 1);
  });
  it.each([{ x: -1 }, { x: 0, y: 0 }, { height: 101 }, { decay: 1 }, { radius: 0 }, { seed: -1 }, { extra: 1 }])('rejects invalid or sea placement %j without mutating input', fault => {
    const doc = fixture(), before = structuredClone(doc); expect(() => generateFmsHill(doc, { ...options, ...fault })).toThrow(); expect(doc).toEqual(before);
  });
  it('confirms as one undoable revision, rejects stale preview, and saves/restores exact v2 map', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory()); const doc = fixture();
    doc.version = 2; doc.terrainLocks = new Uint8Array(doc.points.length); doc.terrainLocks[144] = 1;
    const h = new FmsEditHistory(doc), prepared = prepareFmsTerrainPreview(doc, asPreview(doc, generateFmsHill(doc, options)), '放置山丘');
    expect(h.document).toBe(doc); const applied = h.commit(prepared.patch);
    expect(applied.revision).toBe(6); expect(() => prepareFmsTerrainPreview(applied, asPreview(doc, generateFmsHill(doc, options)))).toThrow('地图已变化');
    expect(h.undo().elevations).toEqual(doc.elevations); expect(h.redo().elevations).toEqual(applied.elevations);
    await saveFmsDocument(h.document, null); expect((await loadFmsDocument())?.document).toEqual(h.document);
  });
  it('roundtrips real Worker output and owns settings/geometry snapshots', async () => {
    const c = client(), doc = fixture(), input = { ...options }, pending = c.hill(doc, input);
    input.height = 30; doc.elevations.fill(0); doc.points[0][0] = 1; worker().reply();
    const result = await pending; expect(result.stats.height).toBe(85); expect(result.stats.changedCells).toBeGreaterThan(0);
    expect(result.drainage.stats.algorithm).toBe('land-area-runoff-v2');
  });
  it.each(['kind', 'stats', 'outside', 'coast', 'locked', 'revision'] as const)('rejects forged %s results before exposing a candidate', async fault => {
    const c = client(), doc = fixture(); doc.version = 2; doc.terrainLocks = new Uint8Array(doc.points.length); doc.terrainLocks[144] = 1;
    const pending = c.hill(doc, options), rejection = expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    const r = runFmsTerrainRequest(worker().request); if (r.kind !== 'hill-generated') throw new Error('Expected Hill');
    if (fault === 'kind') Object.assign(r, { kind: 'naturalized' });
    if (fault === 'stats') r.stats.decay = .8;
    if (fault === 'outside') r.elevations[2 * 17 + 8] = 85;
    if (fault === 'coast') r.elevations[2 * 17 + 2] = 85;
    if (fault === 'locked') r.elevations[144] = 85;
    if (fault === 'revision') r.baseRevision++;
    worker().reply(r); await rejection; expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it('cancels and ignores a late Hill response after a new request, without committing either', async () => {
    const c = client(), doc = fixture(), original = structuredClone(doc), abort = new AbortController();
    const first = c.hill(doc, options, { signal: abort.signal }), rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const old = worker(), late = old.onmessage!, response = runFmsTerrainRequest(old.request); abort.abort(); await rejection;
    const second = c.hill(doc, { ...options, seed: 71 }); late({ data: response } as MessageEvent); worker().reply();
    expect((await second).stats.seed).toBe(71); expect(doc).toEqual(original); expect(old.terminate).toHaveBeenCalledOnce();
  });
  it('times out Hill computation and permits a clean retry', async () => {
    vi.useFakeTimers(); const c = client(20), pending = c.hill(fixture(), options), rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(20); await rejection; expect(worker().terminate).toHaveBeenCalledOnce();
    const next = c.hill(fixture(), options); worker().reply(); await next; expect(vi.getTimerCount()).toBe(0);
  });
  it('reuses one Worker across naturalize, Hill and naturalize with distinct result contracts', async () => {
    const c = client(), doc = fixture();
    const first = c.naturalize(doc, { seed: 1, strength: 1 }); worker().reply();
    expect((await first).stats.algorithm).toBe('fms-shape-preserving-relief-v4');
    const second = c.hill(doc, options); worker().reply(); expect((await second).stats.algorithm).toBe('recovered-native-hill-max-web-v1');
    const third = c.naturalize(doc, { seed: 2, strength: 1 }); worker().reply(); expect((await third).stats.seed).toBe(2);
    expect(WorkerDouble.instances).toHaveLength(1);
  });
});
