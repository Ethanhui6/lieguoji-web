import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket } from './protocol';

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(bytes: Uint8Array, transfer: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  reply(bytes: Uint8Array) { this.onmessage?.({ data: bytes } as MessageEvent); }
}
beforeEach(() => { WorkerDouble.instances = []; vi.stubGlobal('Worker', WorkerDouble); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const settleMessages = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('atlas client transport lifecycle', () => {
  it.each(['error', 'messageerror'] as const)('%s permanently rejects pending and future operations', async type => {
    const fatal = vi.fn(), client = new AtlasClient({ onFatal: fatal }), worker = WorkerDouble.instances[0];
    const result = client.list(); const rejection = expect(result).rejects.toThrow();
    if (type === 'error') worker.onerror?.({ message: 'synthetic fatal' } as ErrorEvent); else worker.onmessageerror?.();
    await rejection; await expect(client.list()).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledTimes(1); expect(fatal).toHaveBeenCalledTimes(1);
    expect(() => client.cancel()).toThrow(); expect(client.current).toBeNull(); client.close();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('sends actual framed bytes, rejects overlap and ignores a stale request identity', async () => {
    const client = new AtlasClient(), worker = WorkerDouble.instances[0], result = client.list();
    const [wire, transfer] = worker.postMessage.mock.calls[0], packet = decodeAtlasPacket(wire);
    expect(packet.header.body).toEqual({ type: 'list' }); expect(transfer).toEqual([wire.buffer]);
    await expect(client.list()).rejects.toThrow('尚未完成');
    worker.reply(encodeAtlasPacket({ version: 1, id: packet.header.id + 9, type: 'complete', body: { operation: 'list', entries: ['stale'] } }));
    await settleMessages();
    worker.reply(encodeAtlasPacket({ version: 1, id: packet.header.id, type: 'complete', body: { operation: 'list', entries: [] } }));
    await expect(result).resolves.toEqual([]); client.close();
  });

  it('ordinary cancellation waits for the Worker result and leaves the client reusable', async () => {
    const client = new AtlasClient(), worker = WorkerDouble.instances[0], result = client.list();
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' }); client.cancel();
    const request = decodeAtlasPacket(worker.postMessage.mock.calls[0][0]).header, cancel = decodeAtlasPacket(worker.postMessage.mock.calls[1][0]).header;
    expect(cancel).toMatchObject({ type: 'cancel', id: request.id });
    worker.reply(encodeAtlasPacket({ version: 1, id: request.id, type: 'error', body: { message: 'cancelled before commit', cancelled: true, fatal: false, committed: false } }));
    await rejection;
    const next = client.list(), id = decodeAtlasPacket(worker.postMessage.mock.calls.at(-1)![0]).header.id;
    worker.reply(encodeAtlasPacket({ version: 1, id, type: 'complete', body: { operation: 'list', entries: [] } }));
    await expect(next).resolves.toEqual([]); expect(worker.terminate).not.toHaveBeenCalled(); client.close();
  });

  it('times out an unresponsive worker without retrying a possibly committed operation', async () => {
    vi.useFakeTimers();
    const client = new AtlasClient({ timeoutMs: 25 }), worker = WorkerDouble.instances[0], result = client.list();
    const rejected = expect(result).rejects.toThrow('提交状态未知');
    await vi.advanceTimersByTimeAsync(26); await rejected;
    expect(worker.postMessage).toHaveBeenCalledTimes(1); expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(client.list()).rejects.toThrow('提交状态未知');
  });

  it('rejects an undecodable response and does not publish any partial view', async () => {
    const client = new AtlasClient(), worker = WorkerDouble.instances[0], result = client.list();
    const rejected = expect(result).rejects.toThrow(); worker.reply(new Uint8Array([1, 2]));
    await rejected; expect(client.current).toBeNull(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('counts packet framing against the transport cap and rejects future packets', () => {
    expect(() => encodeAtlasPacket({ version: 1, id: 1, type: 'block' }, new Uint8Array(ATLAS_PACKET_LIMIT))).toThrow('512 KiB');
    const bytes = encodeAtlasPacket({ version: 1, id: 1, type: 'request', body: { type: 'list' } });
    const json = new TextDecoder().decode(bytes.subarray(4)).replace('"version":1', '"version":2'); bytes.set(new TextEncoder().encode(json), 4);
    expect(() => decodeAtlasPacket(bytes)).toThrow('版本');
  });
});
