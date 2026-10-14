import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertFmsFullMapSource, generateFmsFullMap, prepareFmsFullMapPreview, type FmsFullMapOptions } from './full-map-terrain';
import { createFmsDocument, FmsEditHistory, type FmsDocument } from './model';
import { FmsTerrainClient, type FmsGenerationRequest } from './terrain-client';
import { runFmsFullMapRequest } from './terrain.worker';

const options: FmsFullMapOptions = { seed: '421730', template: 'continents' };
let ocean: FmsDocument;
beforeAll(async () => { ocean = await createFmsDocument({ yieldTask: async () => {} }); });
const clone = () => structuredClone(ocean);

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror = null; onmessageerror = null;
  request?: FmsGenerationRequest;
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  postMessage(request: FmsGenerationRequest) { this.request = structuredClone(request); }
  async reply(response?: unknown) { this.onmessage?.({ data: response ?? await runFmsFullMapRequest(this.request) } as MessageEvent); }
}
const clients: FmsTerrainClient[] = [];
const client = () => { vi.stubGlobal('Worker', WorkerDouble); const value = new FmsTerrainClient(); clients.push(value); return value; };
afterEach(() => { clients.splice(0).forEach(value => value.close()); WorkerDouble.instances = []; vi.unstubAllGlobals(); });

describe('full FMS square-v1 world generation', () => {
  it('rejects existing land, protection and mismatched ordered topology before generation', async () => {
    const land = clone(); land.elevations[100] = 45;
    await expect(assertFmsFullMapSource(land)).rejects.toThrow('空白海洋');
    const locked = clone(); locked.version = 2; locked.terrainLocks = new Uint8Array(locked.points.length); locked.terrainLocks[100] = 1;
    await expect(assertFmsFullMapSource(locked)).rejects.toThrow('空白海洋');
    const moved = clone(); moved.points[100][0] += 0.01;
    await expect(assertFmsFullMapSource(moved)).rejects.toThrow('顶点');
    expect((await runFmsFullMapRequest({ kind: 'full-map', requestId: 1, document: moved, options })).kind).toBe('error');
    const reordered = clone(); [reordered.neighbors[100][0], reordered.neighbors[100][1]] = [reordered.neighbors[100][1], reordered.neighbors[100][0]];
    await expect(assertFmsFullMapSource(reordered)).rejects.toThrow('邻接');
    const face = clone(); [face.triangles[0], face.triangles[1]] = [face.triangles[1], face.triangles[0]];
    await expect(assertFmsFullMapSource(face)).rejects.toThrow('三角面');
    expect(ocean.elevations.every(height => height === 0)).toBe(true);
  });

  it('generates repeatable full-world height data without source writes, then confirms and undoes one revision', async () => {
    const source = clone(), before = structuredClone(source);
    const first = await generateFmsFullMap(source, options, { yieldTask: async () => {} });
    const second = await generateFmsFullMap(source, options, { yieldTask: async () => {} });
    expect(second).toEqual(first);
    expect(first.stats.landCells).toBeGreaterThan(1000);
    expect(first.stats.seaCells).toBeGreaterThan(1000);
    expect(source).toEqual(before);
    const prepared = await prepareFmsFullMapPreview(source, { worldId: source.worldId, baseRevision: source.revision, ...first }, options);
    expect(source).toEqual(before);
    const history = new FmsEditHistory(source), committed = history.commit(prepared.patch);
    expect(committed.elevations).toEqual(first.elevations);
    expect(committed.revision).toBe(source.revision + 1);
    expect(history.undo().elevations).toEqual(source.elevations);
    expect(history.redo().elevations).toEqual(first.elevations);
    await expect(prepareFmsFullMapPreview(committed, { worldId: source.worldId, baseRevision: source.revision, ...first }, options)).rejects.toThrow('地图已变化');
  });

  it('cancels topology preparation before Worker startup and gives an immediate retry its own slot', async () => {
    const source = clone(), c = client();
    const first = c.fullMap(source, options), cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(WorkerDouble.instances).toHaveLength(0);
    c.cancel();
    const retryOptions: FmsFullMapOptions = { seed: '7331', template: 'pangea' };
    const retry = c.fullMap(source, retryOptions), retryCancelled = expect(retry).rejects.toMatchObject({ name: 'AbortError' });
    await cancelled;
    // Finishing the cancelled preparation must not release the retry's slot.
    await expect(c.fullMap(source, options)).rejects.toMatchObject({ code: 'busy' });
    await vi.waitFor(() => expect(WorkerDouble.instances[0]?.request?.options).toEqual(retryOptions), { timeout: 20_000 });
    expect(WorkerDouble.instances).toHaveLength(1);
    expect(WorkerDouble.instances[0].request?.requestId).toBe(1);
    c.cancel(); await retryCancelled;
    expect(source).toEqual(ocean);
  }, 30_000);

  it('reserves the client for topology preparation across every terrain entry point', async () => {
    const source = clone(), c = client();
    const first = c.fullMap(source, options), cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(c.fullMap(source, options)).rejects.toMatchObject({ code: 'busy' });
    await expect(c.naturalize(source, { seed: 1, strength: 1 })).rejects.toMatchObject({ code: 'busy' });
    await expect(c.hill(source, { x: 768, y: 768, radius: 48, height: 85, decay: .96, seed: 1 })).rejects.toMatchObject({ code: 'busy' });
    await expect(c.localTemplate(source, { x: 768, y: 768, template: 'pangea', preserveCoast: false, seed: 1 })).rejects.toMatchObject({ code: 'busy' });
    expect(WorkerDouble.instances).toHaveLength(0);
    c.cancel(); await cancelled;
  });

  it.each(['signal', 'close'] as const)('cancels topology preparation through %s without starting a Worker', async mode => {
    const c = client(), controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    const first = c.fullMap(clone(), options, { signal: controller.signal }), cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    if (mode === 'signal') controller.abort(); else c.close();
    await cancelled;
    expect(WorkerDouble.instances).toHaveLength(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    if (mode === 'close') await expect(c.fullMap(clone(), options)).rejects.toMatchObject({ code: 'closed' });
  });

  it('owns seed and template before topology preparation yields', async () => {
    const c = client(), mutableOptions = { ...options };
    const pending = c.fullMap(clone(), mutableOptions);
    mutableOptions.seed = '7331'; mutableOptions.template = 'pangea';
    await vi.waitFor(() => expect(WorkerDouble.instances[0]?.request?.options).toEqual(options), { timeout: 20_000 });
    await WorkerDouble.instances[0].reply();
    await expect(pending).resolves.toMatchObject({ stats: { seed: options.seed, template: options.template } });
  }, 30_000);

  it('keeps Worker output bound to seed, world revision and actual drainage; ignores a cancelled late response', async () => {
    const source = clone(), c = client(), cancel = new AbortController();
    const a = c.fullMap(source, options, { signal: cancel.signal }), cancelled = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(WorkerDouble.instances.length).toBe(1), { timeout: 20_000 });
    const old = WorkerDouble.instances[0], late = old.onmessage!, valid = await runFmsFullMapRequest(old.request);
    expect(valid.kind).toBe('full-map-generated');
    if (valid.kind !== 'full-map-generated') throw new Error('Expected real full-map result');
    cancel.abort(); await cancelled;
    const b = c.fullMap(source, options);
    await vi.waitFor(() => expect(WorkerDouble.instances[1]?.request?.requestId).toBe(2), { timeout: 20_000 });
    late({ data: valid } as MessageEvent);
    await WorkerDouble.instances[1].reply();
    const response = await b;
    expect(response.stats.template).toBe('continents');
    expect(response.drainage.stats.landCells).toBe(response.stats.landCells);
    const forged = { ...valid, requestId: 3, stats: { ...valid.stats, seed: 'forged' } };
    const cPromise = c.fullMap(source, options), rejection = expect(cPromise).rejects.toMatchObject({ code: 'invalid-response' });
    await vi.waitFor(() => expect(WorkerDouble.instances[1]?.request?.requestId).toBe(3), { timeout: 20_000 });
    await WorkerDouble.instances[1].reply(forged); await rejection;
  }, 30_000);
});
