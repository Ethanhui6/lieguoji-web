import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScaleBridge } from './bridge';
import type { ScaleReply, ScaleRequest } from './protocol';

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent<ScaleReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(message: ScaleRequest) => void>();
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  reply(data: ScaleReply) { this.onmessage?.({ data } as MessageEvent<ScaleReply>); }
}
beforeEach(() => { WorkerDouble.instances = []; vi.stubGlobal('Worker', WorkerDouble); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('scale bridge fatal lifecycle', () => {
  it.each(['error', 'decode'] as const)('%s terminates the worker and rejects both pending and all later calls', async failure => {
    const bridge = new ScaleBridge(), worker = WorkerDouble.instances[0];
    const first = bridge.snapshot(), second = bridge.measure({ historyLengths: [64] });
    const failures = Promise.allSettled([first, second]);
    if (failure === 'error') worker.onerror?.({ message: 'synthetic worker crash' } as ErrorEvent);
    else worker.onmessageerror?.();
    expect((await failures).map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const sent = worker.postMessage.mock.calls.length;
    await expect(bridge.snapshot()).rejects.toThrow(failure === 'error' ? 'synthetic worker crash' : '无法解码');
    expect(() => bridge.cancel()).toThrow();
    expect(worker.postMessage).toHaveBeenCalledTimes(sent);
  });

  it('closing settles pending work and cannot silently post to a terminated worker', async () => {
    const bridge = new ScaleBridge(), worker = WorkerDouble.instances[0], pending = bridge.snapshot();
    const settled = Promise.allSettled([pending]); bridge.close();
    expect((await settled)[0].status).toBe('rejected');
    await expect(bridge.snapshot()).rejects.toThrow('已关闭');
    expect(worker.postMessage).toHaveBeenCalledTimes(1); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('a caller-side clone error only rejects that request; a later cancellation reply still settles normally', async () => {
    const bridge = new ScaleBridge(), worker = WorkerDouble.instances[0];
    worker.postMessage.mockImplementationOnce(() => { throw new DOMException('synthetic clone fault', 'DataCloneError'); });
    await expect(bridge.snapshot()).rejects.toThrow('synthetic clone fault');
    const next = bridge.snapshot(), request = worker.postMessage.mock.calls.at(-1)![0];
    expect('id' in request).toBe(true);
    worker.reply({ id: 'id' in request ? request.id : 0, kind: 'error', message: 'cancelled before commit', cancelled: true });
    await expect(next).rejects.toMatchObject({ name: 'AbortError', message: 'cancelled before commit' });
    expect(worker.terminate).not.toHaveBeenCalled(); bridge.close();
  });
});
