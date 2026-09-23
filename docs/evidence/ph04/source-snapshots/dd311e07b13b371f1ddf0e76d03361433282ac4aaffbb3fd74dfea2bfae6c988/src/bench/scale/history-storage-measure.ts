import { digestScaleValue, scaleYield } from './fixture';
import { appendScaleHistory, branchScaleHistory, SCALE_HISTORY_LIMIT, verifyScaleHistory } from './history';
import type { ScaleSnapshot } from './protocol';
import { readScaleSnapshot, saveScaleSnapshot, SCALE_BENCH_DB, SCALE_BENCH_STORE } from './storage';
import type { ScaleControl, ScaleHistory } from './types';

/** Read the entire stored pair, not only the caller-supplied tail digest. */
export async function inspectScaleStoredPackage(runId: string) {
  if (typeof runId !== 'string' || !/^scale-[a-z0-9][a-z0-9-]{0,89}$/.test(runId)) throw new Error('实验运行标识无效，未访问数据库。');
  const start = performance.now();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(SCALE_BENCH_DB, 1);
    // This observation must never create or upgrade a database.
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => { settled = true; reject(request.error ?? new Error('无法读取实验包装。')); };
    request.onblocked = () => { settled = true; reject(new Error('实验包装读取被数据库升级阻塞。')); };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; resolve(request.result);
    };
  });
  let record: { database: string; databaseVersion: number; storageId: string; present: boolean; value: unknown };
  try {
    record = await new Promise((resolve, reject) => {
      const transaction = db.transaction(SCALE_BENCH_STORE, 'readonly');
      const store = transaction.objectStore(SCALE_BENCH_STORE), value = store.get(runId), key = store.getKey(runId);
      transaction.oncomplete = () => {
        if (key.result === undefined) reject(new Error('已保存实验包装缺失，不能证明源记录保留。'));
        else resolve({ database: db.name, databaseVersion: db.version, storageId: runId, present: true, value: value.result });
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('实验包装读取失败。'));
      transaction.onabort = () => reject(transaction.error ?? new Error('实验包装读取中断。'));
    });
  } finally { db.close(); }
  const readMs = performance.now() - start, digestStart = performance.now();
  const hash = await digestScaleValue(record);
  return { hash, readMs, digestMs: performance.now() - digestStart };
}

/**
 * Long-history storage costs in the dedicated experimental database only.
 * Each invocation owns a new UUID key. Cancellation cannot interrupt an already
 * submitted IDB transaction; committed experimental samples remain available.
 * It never deletes samples, repairs an old key, or claims a browser refresh.
 */
export async function measureHistoryStorage(history: ScaleHistory, control: ScaleControl = {}) {
  const started = performance.now();
  control.signal?.throwIfAborted();
  const sourceRunId = history.runId, sourceHistoryHashBefore = await digestScaleValue(history);
  const copy = structuredClone(history), runId = `scale-${crypto.randomUUID()}`;
  if (runId === sourceRunId || runId === copy.parent?.runId) throw new Error('实验 UUID 与源身份冲突，未写入数据库。');
  // Preserve the original parent/initialHash relationship; this is an isolated
  // storage specimen of the same history, not a fabricated historical branch.
  copy.runId = runId;
  await scaleYield(control, '长历史保存前完整核验', 0, copy.entries.length);
  const verifyStart = performance.now(), verified = await verifyScaleHistory(copy, control);
  const verifyBeforeSaveMs = performance.now() - verifyStart;
  control.signal?.throwIfAborted();
  const snapshot: ScaleSnapshot = { format: 'lieguoji-scale-experiment', version: 1, history: copy };
  const packageStart = performance.now(), snapshotHash = await digestScaleValue(snapshot);
  const snapshotDigestMs = performance.now() - packageStart;
  const saves = [];
  for (const expectedRevision of [0, 1]) {
    await scaleYield(control, '长历史主备提交', expectedRevision, 2);
    control.signal?.throwIfAborted();
    const saveStart = performance.now();
    const saved = await saveScaleSnapshot(runId, snapshot, { expectedRevision, payloadHash: verified.hash });
    saves.push({ elapsedMs: performance.now() - saveStart, ...saved });
    control.signal?.throwIfAborted();
  }

  const readAndVerify = async (source: 'current' | 'backup') => {
    await scaleYield(control, `长历史读取${source === 'current' ? '主档' : '备份'}`, 0, copy.entries.length);
    const readStart = performance.now(), saved = await readScaleSnapshot<ScaleSnapshot>(runId, { source });
    const readMs = performance.now() - readStart;
    control.signal?.throwIfAborted();
    if (!saved.payload || saved.payload.format !== 'lieguoji-scale-experiment' || saved.payload.version !== 1 || saved.payload.history?.runId !== runId || saved.revision !== 2) throw new Error('长历史主备身份或修订号不匹配。');
    const verifyStart = performance.now(), restored = await verifyScaleHistory(saved.payload.history, control);
    const verifyMs = performance.now() - verifyStart;
    if (restored.hash !== verified.hash || restored.hash !== saved.payloadHash || restored.entries !== copy.entries.length) throw new Error('长历史主备完整重算与保存前不一致。');
    const digestStart = performance.now(), restoredSnapshotHash = await digestScaleValue(saved.payload);
    const digestMs = performance.now() - digestStart;
    if (restoredSnapshotHash !== snapshotHash) throw new Error('长历史主备包内容与保存前不一致。');
    control.signal?.throwIfAborted();
    return { source, readMs, verifyMs, digestMs, hash: restored.hash, snapshotHash: restoredSnapshotHash, revision: saved.revision, historyLength: restored.entries, payloadBytes: saved.payloadBytes, pairPayloadBytes: saved.pairPayloadBytes };
  };
  const current = await readAndVerify('current'), backup = await readAndVerify('backup');
  const before = await inspectScaleStoredPackage(runId);
  await scaleYield(control, '长历史源包装保护对照', 0, 1);
  const protectionStart = performance.now();
  let operation: 'append-in-memory' | 'branch-and-append-in-memory';
  if (copy.entries.length < SCALE_HISTORY_LIMIT) {
    const appended = await appendScaleHistory(copy, verified.fixture, { type: 'structure-batch', count: 1 });
    if (appended.history.entries.length !== copy.entries.length + 1 || appended.history.entries.at(-1)?.afterHash === verified.hash) throw new Error('源保护对照未产生实际追加。');
    operation = 'append-in-memory';
  } else {
    const branch = await branchScaleHistory(copy, Math.floor(copy.entries.length / 2), `scale-${crypto.randomUUID()}`, control);
    const appended = await appendScaleHistory(branch.history, branch.fixture, { type: 'structure-batch', count: 1 });
    if (branch.history.runId === runId || appended.history.entries.length !== 1) throw new Error('源保护对照未产生独立分支追加。');
    operation = 'branch-and-append-in-memory';
  }
  const operationMs = performance.now() - protectionStart;
  const after = await inspectScaleStoredPackage(runId);
  if (before.hash !== after.hash) throw new Error('追加或分支改变了源库完整主备包装。');
  if (await digestScaleValue(snapshot) !== snapshotHash) throw new Error('追加或分支改变了传入存储的历史包。');
  const sourceHistoryHashAfter = await digestScaleValue(history);
  if (sourceHistoryHashAfter !== sourceHistoryHashBefore) throw new Error('存储测量改变了调用方源历史。');
  control.signal?.throwIfAborted();
  return {
    format: 'lieguoji-scale-history-storage-measurement' as const, version: 1 as const,
    database: SCALE_BENCH_DB, runId, sourceRunId, historyLength: copy.entries.length, expectedHash: verified.hash, revision: 2,
    backupSemantics: 'Two consecutive commits of the identical fully verified history; backup is the preceding identical submission, not an earlier historical point.',
    verifyBeforeSaveMs, snapshotDigestMs, snapshotHash, saves, reads: { current, backup },
    packageProtection: { operation, operationMs, before, after, unchanged: true },
    sourceHistoryHashBefore, sourceHistoryHashAfter,
    refresh: { required: true, verified: false, runId, expectedHash: verified.hash, expectedSequence: copy.entries.length, expectedRevision: 2 },
    elapsedMs: performance.now() - started,
    limitations: [
      'Dedicated experimental key only; no production game database is read or written.',
      'Logical payload bytes are not IndexedDB physical disk usage or peak heap.',
      'Independent reads close/reopen IndexedDB but do not reload the page or Worker; browser refresh remains required.',
      'Cancellation is observed between operations; an in-flight IDB transaction may complete and its isolated sample is retained.',
    ],
  };
}
