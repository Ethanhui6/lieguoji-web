import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScaleFixture, ScaleHistory, ScaleOptions, ScaleState, ScaleTransaction } from './types';
import type { ScaleOperation, ScaleReply, ScaleRequest, ScaleResult, ScaleSnapshot } from './protocol';

// These doubles isolate the Worker commit protocol. Real core determinism,
// validation and history replay remain covered by the separate core test files.
const core = vi.hoisted(() => ({ create: vi.fn(), digest: vi.fn(), bytes: vi.fn(), history: vi.fn(), append: vi.fn(), seek: vi.fn(), verify: vi.fn(), branch: vi.fn(), measure: vi.fn() }));
vi.mock('./fixture', () => ({ createFixture: core.create, digestFixture: core.digest, byteSize: core.bytes }));
vi.mock('./history', () => ({ createScaleHistory: core.history, appendScaleHistory: core.append, seekScaleHistory: core.seek, verifyScaleHistory: core.verify, branchScaleHistory: core.branch }));
vi.mock('./measure', () => ({ measureFixture: core.measure }));

const options: ScaleOptions = { seed: 'synthetic-session', scenario: 'continent', geoProfile: 'basic', entityProfile: 'basic' };
function fixture(seed = 'synthetic-session', batch = 0): ScaleFixture {
  const land = new Uint8Array([1, 0, 1]);
  return { options: { ...options, seed }, atlas: { land, regionByCell: new Uint32Array(land.buffer.slice(0, 0)) }, state: { revision: batch, batch, population: new Float64Array([123]), grain: new Float64Array([456]), regionAdmin: new Uint32Array([0]), armyCell: new Uint32Array([0]), elevationOverrides: [] } } as unknown as ScaleFixture;
}
const hash = (value: ScaleFixture) => createHash('sha256').update(JSON.stringify({ seed: value.options.seed, state: value.state.batch, revision: value.state.revision, land: [...value.atlas.land] })).digest('hex');
function timeline(initial: ScaleFixture, runId: string): ScaleHistory {
  return { format: 'lieguoji-scale-history', version: 1, runId, parent: null, initial: structuredClone(initial), initialHash: hash(initial), checkpointEvery: 32, entries: [], checkpoints: [] };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
type ResultReply = Extract<ScaleReply, { kind: 'result' }>;
let receiver: { onmessage: ((event: MessageEvent<ScaleRequest>) => void) | null; postMessage: ReturnType<typeof vi.fn> };
let replies: ScaleReply[], serial: number;
function post(operation: ScaleOperation, transport: 'clone' | 'transfer' = 'transfer') {
  const id = ++serial;
  receiver.onmessage!({ data: { id, operation, transport } } as MessageEvent<ScaleRequest>);
  return id;
}
async function reply(id: number): Promise<ScaleReply> {
  await vi.waitFor(() => expect(replies.some(item => item.id === id && item.kind !== 'progress')).toBe(true));
  return replies.find(item => item.id === id && item.kind !== 'progress')!;
}
async function result(operation: ScaleOperation, transport: 'clone' | 'transfer' = 'transfer') {
  const response = await reply(post(operation, transport));
  expect(response.kind).toBe('result'); return (response as ResultReply).result;
}
async function snapshot(): Promise<Omit<ScaleResult, 'metrics'>> { return result({ type: 'snapshot', includeHistory: true }); }

beforeEach(async () => {
  vi.resetModules(); for (const mock of Object.values(core)) mock.mockReset();
  replies = []; serial = 0;
  receiver = { onmessage: null, postMessage: vi.fn((message: ScaleReply, transfer: { transfer: Transferable[] }) => { replies.push(structuredClone(message, transfer)); }) };
  vi.stubGlobal('self', receiver);
  core.create.mockImplementation(async (input: ScaleOptions) => fixture(input.seed));
  core.digest.mockImplementation(async (input: ScaleFixture) => hash(input)); core.bytes.mockReturnValue(128);
  core.history.mockImplementation(async (input: ScaleFixture, id: string) => timeline(input, id));
  core.append.mockImplementation(async (history: ScaleHistory, current: ScaleFixture, input: ScaleTransaction) => {
    const before = current.state;
    const state: ScaleState = input.type === 'restore-state' ? { ...structuredClone(input.state), revision: before.revision + 1 } : { ...structuredClone(before), batch: before.batch + 1, revision: before.revision + 1 };
    const next = { ...current, state }, seq = history.entries.length + 1;
    return { fixture: next, undo: { expectedRevision: state.revision, before }, summary: 'synthetic edit', history: { ...history, entries: [...history.entries, { seq, input: structuredClone(input), beforeHash: hash(current), afterHash: hash(next) }] } };
  });
  core.seek.mockImplementation(async (history: ScaleHistory, sequence: number) => fixture(history.initial.options.seed, sequence));
  core.verify.mockImplementation(async (history: ScaleHistory) => { const restored = fixture(history.initial.options.seed, history.entries.length); return { fixture: restored, hash: hash(restored), entries: history.entries.length }; });
  core.branch.mockImplementation(async (history: ScaleHistory, sequence: number, id: string) => {
    const next = fixture(history.initial.options.seed, sequence); return { fixture: next, history: { ...timeline(next, id), parent: { runId: history.runId, seq: sequence, hash: hash(next) } } };
  });
  await import('./scale.worker');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('experimental Worker candidate-to-commit protocol', () => {
  it.each(['clone', 'transfer'] as const)('%s transport preserves authoritative buffers across repeated snapshots', async transport => {
    const generated = await result({ type: 'generate', options }, transport);
    expect(generated.fixture.atlas.land.byteLength).toBe(3);
    generated.fixture.atlas.land[0] = 9;
    const first = await result({ type: 'snapshot', includeHistory: true }, transport), second = await result({ type: 'snapshot' }, transport);
    expect([...first.fixture.atlas.land]).toEqual([1, 0, 1]); expect(first.hash).toBe(second.hash);
    expect(second.fixture.atlas.land.byteLength).toBe(3);
    const sends = receiver.postMessage.mock.calls.filter(([message]) => message.kind === 'result');
    for (const [, transferList] of sends) {
      expect(new Set(transferList.transfer).size).toBe(transferList.transfer.length);
      expect(transferList.transfer.length > 0).toBe(transport === 'transfer');
    }
  });

  it('cancel during the final hash preserves the full original session and undo stack', async () => {
    await result({ type: 'generate', options }); await result({ type: 'edit', input: { type: 'structure-batch', count: 1 } });
    const before = await snapshot(), gate = deferred<string>();
    core.digest.mockImplementationOnce(() => gate.promise);
    const id = post({ type: 'undo' });
    await vi.waitFor(() => expect(core.digest).toHaveBeenLastCalledWith(expect.objectContaining({ state: expect.objectContaining({ batch: 0, revision: 2 }) })));
    receiver.onmessage!({ data: { type: 'cancel' } } as MessageEvent<ScaleRequest>);
    gate.resolve(hash(fixture(options.seed, 0)));
    expect(await reply(id)).toMatchObject({ kind: 'error', cancelled: true });
    expect(await snapshot()).toEqual(before);
    const undone = await result({ type: 'undo' });
    expect(undone.fixture.state).toMatchObject({ batch: 0, revision: 2 }); expect(undone.historyLength).toBe(2);
  });

  it('final hash rejection preserves original state and allows an ordinary retry', async () => {
    await result({ type: 'generate', options }); const before = await snapshot();
    core.digest.mockRejectedValueOnce(new Error('synthetic digest failure'));
    expect(await reply(post({ type: 'edit', input: { type: 'structure-batch', count: 1 } }))).toMatchObject({ kind: 'error', cancelled: false, message: 'synthetic digest failure' });
    expect(await snapshot()).toEqual(before);
    expect((await result({ type: 'edit', input: { type: 'structure-batch', count: 1 } })).sequence).toBe(1);
  });

  it.each(['generate', 'edit', 'undo', 'seek', 'live', 'branch', 'load'] as const)('failed result post for %s never commits its candidate', async action => {
    await result({ type: 'generate', options }); await result({ type: 'edit', input: { type: 'structure-batch', count: 1 } });
    if (action === 'live') await result({ type: 'seek', sequence: 0 });
    const before = await result({ type: 'snapshot' });
    const imported: ScaleSnapshot = { format: 'lieguoji-scale-experiment', version: 1, history: timeline(fixture('incoming'), 'scale-incoming') };
    const operations: Record<typeof action, ScaleOperation> = { generate: { type: 'generate', options: { ...options, seed: 'replacement' } }, edit: { type: 'edit', input: { type: 'structure-batch', count: 1 } }, undo: { type: 'undo' }, seek: { type: 'seek', sequence: 0 }, live: { type: 'live' }, branch: { type: 'branch', sequence: 0 }, load: { type: 'load', snapshot: imported } };
    receiver.postMessage.mockImplementationOnce(() => { throw new DOMException('synthetic post failure', 'DataCloneError'); });
    expect(await reply(post(operations[action]))).toMatchObject({ kind: 'error', message: 'synthetic post failure', cancelled: false });
    expect(await result({ type: 'snapshot' })).toEqual(before);
  });

  it('rejects unexpected operation/transport without triggering the expensive measurement path', async () => {
    await result({ type: 'generate', options }); const before = await snapshot();
    expect(await reply(post({ type: 'future-operation' } as unknown as ScaleOperation))).toMatchObject({ kind: 'error', message: expect.stringContaining('不支持') });
    const id = ++serial;
    receiver.onmessage!({ data: { id, operation: { type: 'snapshot' }, transport: 'unknown' } } as unknown as MessageEvent<ScaleRequest>);
    expect(await reply(id)).toMatchObject({ kind: 'error', message: expect.stringContaining('传输方式无效') });
    expect(core.measure).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
  });

  it('reports an error-channel failure as a fatal Worker error instead of an unhandled rejection', async () => {
    await result({ type: 'generate', options });
    const scheduled: (() => void)[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => { scheduled.push(callback); return 1; }) as typeof setTimeout);
    receiver.postMessage.mockImplementation(() => { throw new Error('synthetic broken channel'); });
    post({ type: 'edit', input: { type: 'structure-batch', count: 1 } });
    for (let index = 0; index < 12 && !scheduled.length; index++) await Promise.resolve();
    expect(scheduled).toHaveLength(1); expect(scheduled[0]).toThrow('无法发送结果或错误');
  });
});
