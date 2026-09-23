import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readScaleSnapshot, saveScaleSnapshot, scalePayloadBytes, SCALE_BENCH_DB, SCALE_BENCH_STORE } from './storage';

const RUN = 'scale-storage-synthetic';
const hash = (label: string) => createHash('sha256').update(label).digest('hex');
const options = (expectedRevision: number, label = 'synthetic-fixture') => ({ expectedRevision, payloadHash: hash(label) });
function payload(batch = 0) {
  const shared = new ArrayBuffer(32);
  new Uint8Array(shared).set([1, 2, 3, 4, 5, 6, 7, 8]);
  return {
    fixture: { format: 'synthetic-scale-data', version: 1, name: '纯合成山河', batch, land: new Uint8Array([0, 1, 1, 0]), elevation: new Float32Array([0, -0, 0.375, -1.25]), region: new Uint32Array([0xffffffff, 1, 2]), grain: new Float64Array([0.125, 9_000_000_001]) },
    history: { entries: [{ seq: 1, input: { type: 'structure-batch', count: 1 } }], checkpoints: [{ seq: 0, values: new Int16Array([-32768, 0, 32767]) }] },
    buffers: { shared, subview: new Uint16Array(shared, 4, 3), view: new DataView(shared, 2, 8), wide: new BigInt64Array([-1n, 9007199254740993n]) },
  };
}
type Payload = ReturnType<typeof payload>;
type RawPair = { format: string; version: number; runId: string; revision: number; current: { format: string; version: number; runId: string; payloadHash: string; payloadBytes: number; payload: Payload }; backup: RawPair['current'] | null };

async function database(version = 1, name = SCALE_BENCH_DB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(SCALE_BENCH_STORE)) request.result.createObjectStore(SCALE_BENCH_STORE); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function raw(runId = RUN, name = SCALE_BENCH_DB): Promise<RawPair> {
  const db = await database(undefined, name);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(SCALE_BENCH_STORE, 'readonly'), request = transaction.objectStore(SCALE_BENCH_STORE).get(runId);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
async function putRaw(value: unknown, runId = RUN, version = 1) {
  const db = await database(version);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SCALE_BENCH_STORE, 'readwrite');
      transaction.objectStore(SCALE_BENCH_STORE).put(value, runId);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
async function savedPair() {
  await saveScaleSnapshot(RUN, payload(0), options(0, 'day0'));
  await saveScaleSnapshot(RUN, payload(1), options(1, 'day1'));
  return raw();
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('PH03 isolated experimental structured storage', () => {
  it('absent reads and invalid identifiers never create a record or inspect another database', async () => {
    const open = vi.spyOn(indexedDB, 'open'), list = vi.spyOn(indexedDB, 'databases');
    expect(await readScaleSnapshot(RUN)).toEqual({ payload: null, payloadHash: null, revision: 0, source: 'current', recoveredFromBackup: false, payloadBytes: 0, pairPayloadBytes: 0 });
    expect(list).not.toHaveBeenCalled();
    expect(open.mock.calls.every(([name]) => name === SCALE_BENCH_DB)).toBe(true);
    open.mockClear();
    for (const id of ['', 'run-player-world', '../lieguoji-test-continent-v1', 'scale-UPPER', `scale-${'x'.repeat(92)}`]) {
      await expect(readScaleSnapshot(id)).rejects.toThrow('标识无效');
      await expect(saveScaleSnapshot(id, payload(), options(0))).rejects.toThrow('标识无效');
    }
    expect(open).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('refresh-style independent reads retain typed arrays, bit patterns, offsets and shared references', async () => {
    const input = payload(), saved = await saveScaleSnapshot(RUN, input, options(0));
    expect(saved).toEqual({ revision: 1, payloadBytes: scalePayloadBytes(input), pairPayloadBytes: scalePayloadBytes(input) });
    const first = await readScaleSnapshot<Payload>(RUN);
    expect(first).toMatchObject({ revision: 1, source: 'current', recoveredFromBackup: false, payloadHash: options(0).payloadHash, payloadBytes: saved.payloadBytes });
    expect(first.payload).toEqual(input);
    const restored = first.payload!;
    expect(restored.fixture.land).toBeInstanceOf(Uint8Array);
    expect(restored.fixture.elevation).toBeInstanceOf(Float32Array);
    expect(restored.fixture.region).toBeInstanceOf(Uint32Array);
    expect(restored.fixture.grain).toBeInstanceOf(Float64Array);
    expect(Object.is(restored.fixture.elevation[1], -0)).toBe(true);
    expect(restored.buffers.wide).toBeInstanceOf(BigInt64Array);
    expect(restored.buffers.subview.byteOffset).toBe(4);
    expect(restored.buffers.view.byteOffset).toBe(2);
    expect(restored.buffers.subview.buffer).toBe(restored.buffers.shared);
    expect(restored.buffers.view.buffer).toBe(restored.buffers.shared);
    expect([...new Uint8Array(restored.buffers.shared)]).toEqual([...new Uint8Array(input.buffers.shared)]);
    restored.fixture.land[1] = 0;
    expect((await readScaleSnapshot<Payload>(RUN)).payload).toEqual(input);
  });

  it('counts declared logical bytes, including UTF-8 metadata, without pretending to measure disk', () => {
    expect(scalePayloadBytes({ 名: '国', n: 3, ok: true, values: new Uint16Array([1, 2]), empty: null })).toBe(3 + 3 + 1 + 8 + 2 + 1 + 6 + 4 + 5);
    expect(scalePayloadBytes([new Float32Array(16), true, '中'])).toBe(64 + 1 + 3);
    const view = new Uint8Array(new ArrayBuffer(1000), 40, 2);
    expect(scalePayloadBytes(view)).toBe(2);
  });

  it('clones the complete candidate before any await and rotates only the prior committed current', async () => {
    const first = payload(), expected = structuredClone(first), pending = saveScaleSnapshot(RUN, first, options(0, 'first'));
    first.fixture.batch = 99; first.fixture.elevation[2] = 100; first.history.entries.push({ seq: 2, input: { type: 'structure-batch', count: 99 } });
    await pending;
    expect((await readScaleSnapshot(RUN)).payload).toEqual(expected);
    const second = payload(1), result = await saveScaleSnapshot(RUN, second, options(1, 'second'));
    const stored = await raw();
    expect(stored.current.payload).toEqual(second); expect(stored.backup!.payload).toEqual(expected);
    expect(result).toEqual({ revision: 2, payloadBytes: scalePayloadBytes(second), pairPayloadBytes: scalePayloadBytes(second) + scalePayloadBytes(expected) });
    const explicit = await readScaleSnapshot<Payload>(RUN, { source: 'backup' });
    expect(explicit).toMatchObject({ payload: expected, revision: 2, source: 'backup', recoveredFromBackup: true, payloadHash: hash('first') });
    expect(await raw()).toEqual(stored);
  });

  it('pre-cancellation rejects before cloning or opening any database', async () => {
    const controller = new AbortController(); controller.abort();
    const open = vi.spyOn(indexedDB, 'open'), clone = vi.spyOn(globalThis, 'structuredClone');
    await expect(saveScaleSnapshot(RUN, payload(), { ...options(0), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(clone).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });

  it('cancellation observed after input cloning still rejects before database access', async () => {
    const controller = new AbortController(), nativeClone = globalThis.structuredClone;
    const open = vi.spyOn(indexedDB, 'open');
    vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(value => {
      const copied = nativeClone(value); controller.abort(); return copied;
    });
    await expect(saveScaleSnapshot(RUN, payload(), { ...options(0), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(open).not.toHaveBeenCalled();
  });

  it('cancellation while open is pending starts no write transaction and preserves the exact original pair', async () => {
    const before = await savedPair(), controller = new AbortController();
    const open = vi.spyOn(indexedDB, 'open'), transaction = vi.spyOn(IDBDatabase.prototype, 'transaction'), close = vi.spyOn(IDBDatabase.prototype, 'close');
    const saving = saveScaleSnapshot(RUN, payload(3), { ...options(2), signal: controller.signal });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.results[0].value.readyState).toBe('pending');
    controller.abort();
    await expect(saving).rejects.toMatchObject({ name: 'AbortError' });
    expect(transaction.mock.calls.some(([, mode]) => mode === 'readwrite')).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    transaction.mockRestore(); close.mockRestore();
    expect(await raw()).toEqual(before);
  });

  it('a late cancellation after the write transaction starts reports its real completed commit', async () => {
    const before = await savedPair(), controller = new AbortController(), originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = originalPut.call(this, value, key);
      controller.abort(new Error('late cancellation must not masquerade as a rollback'));
      return request;
    });
    const saved = await saveScaleSnapshot(RUN, payload(3), { ...options(2), signal: controller.signal });
    expect(controller.signal.aborted).toBe(true); expect(saved.revision).toBe(3);
    const after = await raw();
    expect(after.revision).toBe(3); expect(after.current.payload).toEqual(payload(3)); expect(after.backup).toEqual(before.current);
  });

  it('same-revision concurrent writers have exactly one winner and stale writes preserve both slots', async () => {
    const first = payload(); await saveScaleSnapshot(RUN, first, options(0));
    const result = await Promise.allSettled([saveScaleSnapshot(RUN, payload(1), options(1, 'a')), saveScaleSnapshot(RUN, payload(2), options(1, 'b'))]);
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(item => item.status === 'rejected')).toHaveLength(1);
    const committed = await raw();
    expect(committed.revision).toBe(2); expect(committed.backup!.payload).toEqual(first);
    expect([1, 2]).toContain(committed.current.payload.fixture.batch);
    await expect(saveScaleSnapshot(RUN, payload(9), options(1))).rejects.toThrow('修订号冲突');
    expect(await raw()).toEqual(committed);
  });

  it.each(['throw', 'abort'] as const)('a %s during put does not publish or rotate any original bytes', async failure => {
    const before = await savedPair(), original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name !== SCALE_BENCH_DB) throw new Error('Unexpected database access');
      if (failure === 'throw') throw new DOMException('synthetic quota fault', 'QuotaExceededError');
      const request = original.call(this, value, key); this.transaction.abort(); return request;
    });
    await expect(saveScaleSnapshot(RUN, payload(3), options(2))).rejects.toThrow();
    expect(await raw()).toEqual(before);
  });

  it('read transaction failure preserves all raw slots and revision', async () => {
    const before = await savedPair(), original = IDBObjectStore.prototype.get;
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      const request = original.call(this, query); this.transaction.abort(); return request;
    });
    await expect(readScaleSnapshot(RUN)).rejects.toThrow();
    get.mockRestore(); expect(await raw()).toEqual(before);
  });

  it('corrupt current never falls back implicitly; explicit backup recovery is read-only and does not unlock overwrites', async () => {
    const corrupted = await savedPair(); corrupted.current.payloadBytes++;
    await putRaw(corrupted);
    await expect(readScaleSnapshot(RUN)).rejects.toThrow('容量不一致');
    const recovered = await readScaleSnapshot<Payload>(RUN, { source: 'backup' });
    expect(recovered).toMatchObject({ payload: payload(0), revision: 2, recoveredFromBackup: true, pairPayloadBytes: null });
    await expect(saveScaleSnapshot(RUN, payload(3), options(2))).rejects.toThrow('容量不一致');
    expect(await raw()).toEqual(corrupted);
    await saveScaleSnapshot('scale-explicit-recovery-copy', recovered.payload, { expectedRevision: 0, payloadHash: recovered.payloadHash! });
    expect((await readScaleSnapshot('scale-explicit-recovery-copy')).payload).toEqual(payload(0));
    expect(await raw()).toEqual(corrupted);
  });

  it('an existing undefined value is damaged evidence, never an absent run that may be overwritten', async () => {
    await putRaw(undefined);
    await expect(readScaleSnapshot(RUN)).rejects.toThrow('主备格式');
    await expect(saveScaleSnapshot(RUN, payload(), options(0))).rejects.toThrow('主备格式');
    const db = await database();
    try {
      const entries = await new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve, reject) => {
        const transaction = db.transaction(SCALE_BENCH_STORE, 'readonly'), store = transaction.objectStore(SCALE_BENCH_STORE);
        const keys = store.getAllKeys(), values = store.getAll();
        transaction.oncomplete = () => resolve({ keys: keys.result, values: values.result }); transaction.onerror = () => reject(transaction.error);
      });
      expect(entries).toEqual({ keys: [RUN], values: [undefined] });
    } finally { db.close(); }
  });

  it.each(['slots-format', 'slots-version', 'current-format', 'current-version', 'backup-format', 'backup-version'] as const)('unknown or future %s locks reads and writes even with another valid slot', async field => {
    const future = await savedPair();
    if (field === 'slots-format') future.format = 'unknown-scale-format';
    if (field === 'slots-version') future.version = 99;
    if (field === 'current-format') future.current.format = 'unknown-snapshot-format';
    if (field === 'current-version') future.current.version = 99;
    if (field === 'backup-format') future.backup!.format = 'unknown-snapshot-format';
    if (field === 'backup-version') future.backup!.version = 99;
    await putRaw(future);
    await expect(readScaleSnapshot(RUN)).rejects.toThrow('不兼容');
    await expect(readScaleSnapshot(RUN, { source: 'backup' })).rejects.toThrow('不兼容');
    await expect(saveScaleSnapshot(RUN, payload(3), options(2))).rejects.toThrow('不兼容');
    expect(await raw()).toEqual(future);
  });

  it('future database version remains intact without upgrade, fallback or writes', async () => {
    const before = await savedPair();
    const newer = await database(2); newer.close();
    await expect(readScaleSnapshot(RUN)).rejects.toThrow('无法打开实验库');
    await expect(saveScaleSnapshot(RUN, payload(3), options(2))).rejects.toThrow('无法打开实验库');
    const db = await database(2);
    try {
      const retained = await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(SCALE_BENCH_STORE, 'readonly'), request = transaction.objectStore(SCALE_BENCH_STORE).get(RUN);
        transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error);
      });
      expect(retained).toEqual(before); expect(db.version).toBe(2);
    } finally { db.close(); }
  });

  it('invalid payloads and revisions reject before touching the database', async () => {
    const open = vi.spyOn(indexedDB, 'open'), cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get: () => { throw new Error('must not execute getter'); } });
    for (const candidate of [cyclic, getter, new Map(), { bad: Infinity }, () => 1]) await expect(saveScaleSnapshot(RUN, candidate, options(0))).rejects.toThrow();
    for (const value of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER]) await expect(saveScaleSnapshot(RUN, payload(), options(value))).rejects.toThrow();
    await expect(saveScaleSnapshot(RUN, payload(), { expectedRevision: 0, payloadHash: 'short' })).rejects.toThrow('SHA-256');
    expect(open).not.toHaveBeenCalled();
  });

  it('never enumerates or opens an existing unrelated player database', async () => {
    const unrelated = 'unrelated-player-storage', db = await database(1, unrelated);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SCALE_BENCH_STORE, 'readwrite'); transaction.objectStore(SCALE_BENCH_STORE).put({ private: 'synthetic sentinel' }, RUN);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    }); db.close();
    const open = vi.spyOn(indexedDB, 'open'), enumerate = vi.spyOn(indexedDB, 'databases');
    await saveScaleSnapshot(RUN, payload(), options(0)); await readScaleSnapshot(RUN);
    expect(enumerate).not.toHaveBeenCalled(); expect(open.mock.calls.map(([name]) => name)).toEqual([SCALE_BENCH_DB, SCALE_BENCH_DB]);
    open.mockRestore(); enumerate.mockRestore();
    expect(await raw(RUN, unrelated)).toEqual({ private: 'synthetic sentinel' });
  });
});
