import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FmsTerrainClient, type FmsTerrainRequest, type FmsTerrainResponse } from './terrain-client';
import { runFmsTerrainRequest } from './terrain.worker';
import type { FmsDocument } from './model';

function fixture(): FmsDocument {
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 7,
    width: 10, height: 10, points: [[0, 0], [10, 0], [0, 10]], triangles: Uint32Array.of(0, 1, 2),
    neighbors: [[1, 2], [0, 2], [0, 1]], elevations: Int32Array.of(45, 0, 0) };
}
const options = { seed: 42, strength: .75 };
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: FmsTerrainRequest[] = [];
  terminate = vi.fn();
  postMessage = vi.fn((request: FmsTerrainRequest, transfer?: Transferable[]) => {
    this.messages.push(structuredClone(request, transfer ? { transfer } : undefined));
  });
  constructor() { WorkerDouble.instances.push(this); }
  reply(raw: unknown = runFmsTerrainRequest(this.messages.at(-1))) { this.onmessage?.({ data: raw } as MessageEvent); }
}
const clients: FmsTerrainClient[] = [];
function client(timeoutMs?: number) { const value = new FmsTerrainClient({ timeoutMs }); clients.push(value); return value; }
function current() { return WorkerDouble.instances.at(-1)!; }
function success(worker = current()) {
  const response = runFmsTerrainRequest(worker.messages.at(-1));
  expect(response.kind).toBe('naturalized');
  if (response.kind !== 'naturalized') throw new Error('Expected the real small-fixture computation to succeed.');
  return response;
}
beforeEach(() => { WorkerDouble.instances = []; vi.stubGlobal('Worker', WorkerDouble); });
afterEach(() => { clients.splice(0).forEach(value => value.close()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('isolated FMS terrain Worker client', () => {
  it('clones input without transfer or detachment, returns real relief/drainage, and reuses a healthy Worker', async () => {
    const instance = client(), doc = fixture(), original = structuredClone(doc);
    const first = instance.naturalize(doc, options), worker = current();
    expect(worker.postMessage.mock.calls[0]).toHaveLength(1);
    expect(worker.messages[0].document.elevations.buffer).not.toBe(doc.elevations.buffer);
    worker.reply(); const result = await first;
    expect(result).toMatchObject({ worldId: doc.worldId, baseRevision: 7, stats: { landMaskPreserved: true, landCells: 1 }, drainage: { stats: { landCells: 1, seaDischarge: 1 } } });
    expect(doc).toEqual(original); expect(doc.elevations.byteLength).toBe(12); expect(doc.triangles.byteLength).toBe(12);
    const second = instance.naturalize({ ...doc, revision: 8 }, { ...options, seed: 43 }); worker.reply();
    expect(await second).toMatchObject({ baseRevision: 8, stats: { seed: 43 } });
    expect(WorkerDouble.instances).toHaveLength(1); expect(worker.messages.map(value => value.requestId)).toEqual([1, 2]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });
  it('terminates on AbortSignal, removes listeners, ignores terminated-worker replies, and can restart', async () => {
    const instance = client(), controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    const first = instance.naturalize(fixture(), options, { signal: controller.signal }), rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const old = current(), late = old.onmessage!, response = success(old); controller.abort(); await rejection;
    expect(old.terminate).toHaveBeenCalledOnce(); expect(old.onmessage).toBeNull(); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    const next = instance.naturalize(fixture(), options); late({ data: response } as MessageEvent); current().reply();
    await expect(next).resolves.toMatchObject({ baseRevision: 7 }); expect(WorkerDouble.instances).toHaveLength(2);
  });
  it('does not start for pre-aborted input and rejects concurrent work without disrupting the first request', async () => {
    const instance = client(), controller = new AbortController(); controller.abort('custom reason');
    await expect(instance.naturalize(fixture(), options, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(WorkerDouble.instances).toHaveLength(0);
    const first = instance.naturalize(fixture(), options);
    await expect(instance.naturalize(fixture(), options)).rejects.toMatchObject({ code: 'busy' });
    expect(current().messages).toHaveLength(1); current().reply(); await first;
  });
  it('cleans the completion listener so an old signal cannot cancel a subsequent request', async () => {
    const instance = client(), controller = new AbortController();
    const first = instance.naturalize(fixture(), options, { signal: controller.signal }); current().reply(); await first;
    const second = instance.naturalize(fixture(), options); controller.abort(); current().reply();
    await expect(second).resolves.toMatchObject({ worldId: fixture().worldId }); expect(current().terminate).not.toHaveBeenCalled();
  });
  it.each(['requestId', 'worldId', 'baseRevision'] as const)('rejects a live stale or mismatched %s and permits a clean retry', async key => {
    const instance = client(), pending = instance.naturalize(fixture(), options), worker = current(), response = success();
    const rejection = expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    worker.reply({ ...response, [key]: key === 'worldId' ? 'other-world' : -1 }); await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = instance.naturalize(fixture(), options); current().reply(); await retry;
  });
  it.each(['length', 'sea-changed', 'stats', 'receiver', 'cycle', 'nonfinite'] as const)('rejects malformed %s payloads', async fault => {
    const instance = client(), doc = fixture();
    if (fault === 'cycle') doc.elevations.fill(45);
    const pending = instance.naturalize(doc, options), response = success(), rejection = expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    if (fault === 'length') response.elevations = new Int32Array(2);
    if (fault === 'sea-changed') response.elevations[1] = 1;
    if (fault === 'stats') response.stats.changedCells = 999;
    if (fault === 'receiver') response.drainage.receiver[0] = 10;
    if (fault === 'cycle') { response.drainage.receiver[0] = 1; response.drainage.receiver[1] = 0; response.drainage.filledElevation.fill(100); }
    if (fault === 'nonfinite') response.drainage.lakeDepth[0] = NaN;
    current().reply(response); await rejection; expect(current().terminate).toHaveBeenCalledOnce();
  });
  it.each(['error', 'messageerror', 'worker-error'] as const)('settles %s and starts a fresh Worker after failure', async fault => {
    const instance = client();
    const pending = instance.naturalize(fixture(), options), worker = current(), rejection = expect(pending).rejects.toBeInstanceOf(Error);
    if (fault === 'error') {
      const request = worker.messages[0];
      worker.reply({ kind: 'error', requestId: request.requestId, worldId: request.document.worldId, baseRevision: 7, code: 'no-land', message: '请先绘制陆地。' } satisfies FmsTerrainResponse);
    } else if (fault === 'messageerror') worker.onmessageerror?.();
    else worker.onerror?.({ message: 'synthetic Worker failure' } as ErrorEvent);
    await rejection; expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = instance.naturalize(fixture(), options); current().reply(); await retry;
  });
  it('recovers from a postMessage clone failure without detaching the source', async () => {
    const instance = client(), doc = fixture(), first = instance.naturalize(doc, options), worker = current(); worker.reply(); await first;
    worker.postMessage.mockImplementationOnce(() => { throw new Error('clone failed'); });
    await expect(instance.naturalize(doc, options)).rejects.toMatchObject({ code: 'send-error' });
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(doc.elevations.byteLength).toBe(12);
    const retry = instance.naturalize(doc, options); current().reply(); await retry;
  });
  it('keeps simultaneous clients isolated when one is cancelled', async () => {
    const a = client(), b = client(), first = a.naturalize(fixture(), options), workerA = current();
    const second = b.naturalize({ ...fixture(), worldId: '00000000-0000-4000-8000-000000000002' }, options), workerB = current();
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' }); a.cancel(); await rejection;
    workerB.reply(); await expect(second).resolves.toMatchObject({ worldId: '00000000-0000-4000-8000-000000000002' });
    expect(workerA.terminate).toHaveBeenCalledOnce(); expect(workerB.terminate).not.toHaveBeenCalled();
  });
  it('times out once, clears resources and retries without leaving timers or Workers alive', async () => {
    vi.useFakeTimers(); const instance = client(25), pending = instance.naturalize(fixture(), options), worker = current();
    const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(25); await rejection; expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    const retry = instance.naturalize(fixture(), options); current().reply(); await retry; expect(vi.getTimerCount()).toBe(0);
  });
  it('cancel is reusable while close permanently rejects and releases the active request', async () => {
    const instance = client(), pending = instance.naturalize(fixture(), options), rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    instance.cancel(); await rejection;
    const retry = instance.naturalize(fixture(), options), second = expect(retry).rejects.toMatchObject({ name: 'AbortError' }); instance.close(); await second;
    await expect(instance.naturalize(fixture(), options)).rejects.toMatchObject({ code: 'closed' });
  });
  it('bounds timeout/input and returns structured Worker errors for invalid source data', async () => {
    expect(() => new FmsTerrainClient({ timeoutMs: Infinity })).toThrow();
    const instance = client(); await expect(instance.naturalize(fixture(), { seed: -1, strength: 1 })).rejects.toMatchObject({ code: 'invalid-request' });
    expect(WorkerDouble.instances).toHaveLength(0);
    const doc = fixture(); doc.elevations.fill(0);
    const pending = instance.naturalize(doc, options); current().reply(); await expect(pending).rejects.toMatchObject({ code: 'no-land' });
    expect(runFmsTerrainRequest({ kind: 'unsupported' })).toMatchObject({ kind: 'error', code: 'generation-failed' });
  });
});
