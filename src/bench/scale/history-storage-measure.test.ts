import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, digestFixture, digestScaleValue } from './fixture';
import { appendScaleHistory, createScaleHistory, verifyScaleHistory } from './history';
import { inspectScaleStoredPackage, measureHistoryStorage } from './history-storage-measure';
import type { ScaleSnapshot } from './protocol';
import { readScaleSnapshot, saveScaleSnapshot, SCALE_BENCH_DB, SCALE_BENCH_STORE } from './storage';
import type { ScaleHistory } from './types';

const UUID = '11111111-1111-4111-8111-111111111111', RUN = `scale-${UUID}`;
const OTHER = 'scale-existing-experiment', noWait = { yieldTask: async () => {} };
let history: ScaleHistory;
async function raw(runId: string): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SCALE_BENCH_DB, 1);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SCALE_BENCH_STORE, 'readonly'), request = tx.objectStore(SCALE_BENCH_STORE).get(runId);
      tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
beforeAll(async () => {
  const fixture = await createFixture({ seed: 'ph03-storage-measure-test', scenario: 'continent', geoProfile: 'basic', entityProfile: 'basic' }, noWait);
  const parent = { runId: 'scale-earlier-source', seq: 7, hash: await digestFixture(fixture) };
  const initial = await createScaleHistory(fixture, 'scale-caller-history', parent);
  history = (await appendScaleHistory(initial, fixture, { type: 'structure-batch', count: 1 })).history;
});
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
  await saveScaleSnapshot(OTHER, { pureSynthetic: new Uint16Array([3, 7, 11]) }, { expectedRevision: 0, payloadHash: 'a'.repeat(64) });
  await saveScaleSnapshot(OTHER, { pureSynthetic: new Uint16Array([4, 8, 12]) }, { expectedRevision: 1, payloadHash: 'b'.repeat(64) });
});
afterEach(() => vi.restoreAllMocks());

describe('PH03 long-history actual isolated storage measurement', () => {
  it('rejects invalid package-inspection IDs before any database access', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    for (const id of ['', 'run-player-world', '../lieguoji-test-continent-v1', 'scale-UPPER', `scale-${'x'.repeat(92)}`]) await expect(inspectScaleStoredPackage(id)).rejects.toThrow('标识无效');
    expect(open).not.toHaveBeenCalled();
  });

  it('commits whole typed history twice, fully verifies both slots and proves complete package preservation', async () => {
    const original = await digestScaleValue(history), unrelated = await raw(OTHER);
    const open = vi.spyOn(indexedDB, 'open'), list = vi.spyOn(indexedDB, 'databases');
    const result = await measureHistoryStorage(history, noWait);
    expect(result).toMatchObject({ runId: RUN, sourceRunId: history.runId, revision: 2, historyLength: 1, refresh: { required: true, verified: false, expectedSequence: 1, expectedRevision: 2 } });
    expect(result.saves.map(row => row.revision)).toEqual([1, 2]);
    expect(result.saves[1].pairPayloadBytes).toBe(result.saves[0].payloadBytes * 2);
    expect(result.reads.current.hash).toBe(result.expectedHash); expect(result.reads.backup.hash).toBe(result.expectedHash);
    expect(result.reads.current.snapshotHash).toBe(result.snapshotHash); expect(result.reads.backup.snapshotHash).toBe(result.snapshotHash);
    expect(result.packageProtection.operation).toBe('append-in-memory');
    expect(result.packageProtection.before.hash).toBe(result.packageProtection.after.hash);
    expect(result.packageProtection.before.hash).not.toBe(result.expectedHash);
    expect(result.sourceHistoryHashBefore).toBe(original); expect(result.sourceHistoryHashAfter).toBe(original);
    for (const source of ['current', 'backup'] as const) {
      const read = await readScaleSnapshot<ScaleSnapshot>(RUN, { source });
      expect(read.payload!.history.parent).toEqual(history.parent);
      expect(read.payload!.history.runId).toBe(RUN);
      expect(read.payload!.history.initial.atlas.land).toBeInstanceOf(Uint8Array);
      expect(read.payload!.history.initial.state.population).toBeInstanceOf(Float64Array);
      expect((await verifyScaleHistory(read.payload!.history, noWait)).hash).toBe(result.expectedHash);
    }
    expect(await raw(OTHER)).toEqual(unrelated);
    expect(open.mock.calls.every(([name]) => name === SCALE_BENCH_DB)).toBe(true); expect(list).not.toHaveBeenCalled();
    for (const time of [result.verifyBeforeSaveMs, result.snapshotDigestMs, ...result.saves.map(row => row.elapsedMs), result.reads.current.readMs, result.reads.current.verifyMs, result.reads.backup.readMs, result.reads.backup.verifyMs]) expect(time).toBeGreaterThanOrEqual(0);
  });

  it('rejects a tampered history before opening any database and preserves the caller', async () => {
    const bad = structuredClone(history); bad.entries[0].afterHash = 'c'.repeat(64);
    const before = await digestScaleValue(bad), open = vi.spyOn(indexedDB, 'open');
    await expect(measureHistoryStorage(bad, noWait)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled(); expect(await digestScaleValue(bad)).toBe(before);
  });

  it('pre-cancellation performs no storage work', async () => {
    const controller = new AbortController(); controller.abort(); const open = vi.spyOn(indexedDB, 'open');
    await expect(measureHistoryStorage(history, { ...noWait, signal: controller.signal })).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });

  it('cancels between commits, retaining the successful isolated first commit and unrelated original pair', async () => {
    const before = await raw(OTHER), sourceBefore = await digestScaleValue(history), controller = new AbortController();
    await expect(measureHistoryStorage(history, { ...noWait, signal: controller.signal, onProgress(progress) { if (progress.stage === '长历史主备提交' && progress.completed === 1) controller.abort(); } })).rejects.toThrow();
    const stored = await readScaleSnapshot<ScaleSnapshot>(RUN);
    expect(stored.revision).toBe(1); expect(stored.payload!.history.runId).toBe(RUN);
    expect(await raw(OTHER)).toEqual(before); expect(await digestScaleValue(history)).toBe(sourceBefore);
    const pair = await raw(RUN) as { backup: unknown }; expect(pair.backup).toBeNull();
  });

  it('a failed second commit preserves the exact first pair and prior unrelated experiment', async () => {
    const unrelated = await raw(OTHER), sourceBefore = await digestScaleValue(history), originalPut = IDBObjectStore.prototype.put;
    let firstPair: unknown, writes = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === RUN && ++writes === 2) throw new DOMException('Synthetic storage quota failure', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });
    await expect(measureHistoryStorage(history, { yieldTask: async () => { if (writes === 1 && firstPair === undefined) firstPair = await raw(RUN); } })).rejects.toThrow('quota');
    expect(firstPair).toBeDefined(); expect(await raw(RUN)).toEqual(firstPair); expect(await raw(OTHER)).toEqual(unrelated);
    expect(await digestScaleValue(history)).toBe(sourceBefore);
  });

  it('a colliding generated key is rejected by CAS and never replaces its main/backup', async () => {
    await saveScaleSnapshot(RUN, { previousExperiment: true }, { expectedRevision: 0, payloadHash: 'd'.repeat(64) });
    const before = await raw(RUN);
    await expect(measureHistoryStorage(history, noWait)).rejects.toThrow('修订号冲突');
    expect(await raw(RUN)).toEqual(before);
  });
});
