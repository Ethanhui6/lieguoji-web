import { afterEach, describe, expect, it, vi } from 'vitest';
import { yieldAtlasWorkerTask } from './worker-yield';
import { AtlasWorkerRuntime } from './atlas.worker';
import { yieldAtlas } from './model';
import { decodeAtlasPacket } from './protocol';

type Active = Parameters<AtlasWorkerRuntime['control']>[0];
function active(): Active {
  return { id: 1, control: new AbortController(), durable: false, sequence: 0, started: performance.now(),
    timing: { startedAt: 0, endedAt: 0, requestDecodeMs: 0, packetEncodeSendMs: 0, ownedPreparation: null, storageCall: null, ownedYields: [], acknowledgements: [], storageTimings: [], partialReasons: [] } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Worker cooperative task scheduling without generator changes', () => {
  it('awaits the posted background task with its receiver, and propagates scheduling failures without falling back', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    let complete!: () => void, callbackRan = false, finished = false;
    const scheduler = { postTask: vi.fn(function (this: unknown, callback: () => void, options: { priority: 'background' }) {
      expect(this).toBe(scheduler); expect(options).toEqual({ priority: 'background' });
      return new Promise<void>(resolve => { complete = () => { callback(); callbackRan = true; resolve(); }; });
    }) };
    vi.stubGlobal('scheduler', scheduler);
    const pending = yieldAtlasWorkerTask().then(() => { finished = true; });
    expect(scheduler.postTask).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(callbackRan).toBe(false); expect(finished).toBe(false); expect(timer).not.toHaveBeenCalled();
    complete(); await pending; expect(callbackRan).toBe(true); expect(finished).toBe(true);
    const rejection = new Error('scheduler rejected its task');
    scheduler.postTask.mockImplementationOnce(() => Promise.reject(rejection));
    await expect(yieldAtlasWorkerTask()).rejects.toBe(rejection);
    const synchronousFailure = new Error('scheduler method threw');
    scheduler.postTask.mockImplementationOnce(() => { throw synchronousFailure; });
    await expect(yieldAtlasWorkerTask()).rejects.toBe(synchronousFailure);
    expect(timer).not.toHaveBeenCalled();
  });

  it('uses a real zero-delay timer task when postTask is unavailable, not an already resolved microtask', async () => {
    vi.stubGlobal('scheduler', undefined);
    const timer = vi.spyOn(globalThis, 'setTimeout'); let finished = false;
    const pending = yieldAtlasWorkerTask().then(() => { finished = true; });
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 0);
    await Promise.resolve(); expect(finished).toBe(false);
    await pending; expect(finished).toBe(true);
    vi.stubGlobal('scheduler', {});
    await yieldAtlasWorkerTask(); expect(timer).toHaveBeenCalledTimes(2);
  });

  it('wires all runtime controls while preserving progress, before/after cancellation and durable verification semantics', async () => {
    let beforeTask: (() => void) | undefined;
    const scheduler = { postTask: vi.fn((callback: () => void, options: { priority: 'background' }) => {
      expect(options).toEqual({ priority: 'background' });
      return new Promise<void>(resolve => setTimeout(() => { beforeTask?.(); callback(); resolve(); }, 0));
    }) };
    vi.stubGlobal('scheduler', scheduler);
    const progress: string[] = [], runtime = new AtlasWorkerRuntime(bytes => {
      const { header } = decodeAtlasPacket(bytes);
      if (header.type === 'progress') progress.push((header.body as { stage: string }).stage);
    });
    try {
      const alreadyCancelled = active(); alreadyCancelled.control.abort();
      await expect(yieldAtlas(runtime['control'](alreadyCancelled), 'before-cancel', 0, 1)).rejects.toMatchObject({ name: 'AbortError' });
      expect(scheduler.postTask).not.toHaveBeenCalled(); expect(progress).toEqual([]);

      const working = active(), ordinary = runtime['control'](working);
      expect(ordinary.signal).toBe(working.control.signal); expect(ordinary.yieldTask).toBe(yieldAtlasWorkerTask);
      beforeTask = () => working.control.abort();
      await expect(yieldAtlas(ordinary, 'after-cancel', 1, 1)).rejects.toMatchObject({ name: 'AbortError' });
      expect(progress).toEqual(['after-cancel']); expect(scheduler.postTask).toHaveBeenCalledTimes(1);

      working.durable = true;
      const durable = runtime['durableControl'](working);
      expect(durable).not.toHaveProperty('signal'); expect(durable.yieldTask).toBe(yieldAtlasWorkerTask);
      await expect(yieldAtlas(durable, 'durable-read', 1, 1)).resolves.toBeUndefined();
      expect(progress).toEqual(['after-cancel', 'durable-read']);

      beforeTask = undefined;
      const preparing = active(), preparation = runtime['preparationControl'](preparing);
      expect(preparation.signal).toBe(preparing.control.signal);
      await yieldAtlas(preparation, 'owned-work', 1, 1);
      expect(scheduler.postTask).toHaveBeenCalledTimes(3); expect(preparing.timing.ownedYields).toHaveLength(1);
      expect(preparing.timing.ownedYields[0].endMs).toBeGreaterThanOrEqual(preparing.timing.ownedYields[0].startMs);
      expect(progress).toEqual(['after-cancel', 'durable-read', 'owned-work']);
    } finally { runtime.close(); }
  });
});
