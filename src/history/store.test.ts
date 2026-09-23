import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../sim/demo';
import { legacyEngine } from '../engine/registry';
import { readSave, writeSave } from '../persistence';
import { MAX_HISTORY_BYTES } from './core';
import { decodeHistoryFile, encodeHistoryFile, MAX_HISTORY_STORAGE_BYTES, parseHistoryFile, readHistoryRun, writeHistoryRun } from './store';
import type { HistoryRecord } from './store';
import type { World } from '../sim/types';

const DB = 'lieguoji-history-v1', UNKNOWN_ENGINE = 'b'.repeat(64);
const id = (number = 1) => `run-h-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
type Candidate = Pick<HistoryRecord, 'world' | 'history' | 'readOnly'>;
type RawSlots = { format: string; version: number; revision: number; current: { version: number; checksum: string; record: HistoryRecord }; backup: { version: number; checksum: string; record: HistoryRecord } | null };
const size = (raw: unknown): number => raw === null || raw === undefined ? 0 : new TextEncoder().encode(JSON.stringify(raw)).byteLength;
async function candidate(storageId = id()): Promise<Candidate> {
  const world = legacyEngine.initializeStatecraft({ ...createWorld(), scenario: 'custom-world', custom: { id: storageId, name: '史册测试山河', seed: 'history-store', rivers: [] } } as World, 'peace');
  return { world, history: await legacyEngine.createHistory(world, { runId: storageId }), readOnly: false };
}
async function advance(previous: Candidate): Promise<Candidate> {
  return { ...await legacyEngine.appendHistory(previous.history, previous.world, { type: 'step', days: 1 }), readOnly: previous.readOnly };
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('runs'); request.result.createObjectStore('meta'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function rawState() {
  const db = await database();
  try { return await new Promise<{ runs: Array<[IDBValidKey, RawSlots]>; usage: unknown }>((resolve, reject) => {
    const tx = db.transaction(['runs', 'meta'], 'readonly'), store = tx.objectStore('runs');
    const values = store.getAll(), keys = store.getAllKeys(), usage = tx.objectStore('meta').get('usage');
    tx.oncomplete = () => resolve({ runs: keys.result.map((key, index) => [key, values.result[index]]), usage: usage.result });
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function replace(storageId: string, change: (slots: RawSlots) => void): Promise<void> {
  const state = await rawState(), target = state.runs.find(([key]) => key === storageId)!;
  change(target[1]);
  const total = state.runs.reduce((sum, [, slots]) => sum + size(slots.current) + size(slots.backup), 0);
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['runs', 'meta'], 'readwrite');
    tx.objectStore('runs').put(target[1], storageId);
    tx.objectStore('meta').put({ format: 'lieguoji-history-usage', version: 1, bytes: total }, 'usage');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function replaceUsage(value: unknown) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(value, 'usage');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function replaceFingerprint(storageId: string, slot: 'current' | 'backup', fingerprint: string) {
  const envelope = structuredClone((await rawState()).runs.find(([key]) => key === storageId)![1][slot]!);
  envelope.record.history.engineFingerprint = fingerprint;
  const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(envelope.record)));
  envelope.checksum = [...new Uint8Array(checksum)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  await replace(storageId, slots => { slots[slot] = envelope; });
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('独立历史库的整对保存与保护', () => {
  it('首次读取不创建数据库或空运行', async () => {
    expect(await readHistoryRun(id())).toEqual({ record: null, revision: 0, recovery: false, bytes: 0 });
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('完整往返保留来源、快照和历史，容量计入UTF8世界及封装字节', async () => {
    const first = await candidate(), second = await advance(first), third = await advance(second);
    expect(await writeHistoryRun(id(), first, 0)).toMatchObject({ revision: 1 });
    expect(await writeHistoryRun(id(), second, 1)).toMatchObject({ revision: 2 });
    const result = await writeHistoryRun(id(), third, 2), state = await rawState(), slots = state.runs[0][1];
    expect(await readHistoryRun(id())).toEqual({ record: { ...third, storageId: id() }, revision: 3, recovery: false, bytes: result.bytes });
    expect(slots.backup!.record).toEqual({ ...second, storageId: id() });
    expect(result.bytes).toBe(size(slots.current) + size(slots.backup));
    expect(result.bytes).toBeGreaterThan(size(third.history) + size(second.history));
    expect(state.usage).toEqual({ format: 'lieguoji-history-usage', version: 1, bytes: result.bytes });
    const loaded = (await readHistoryRun(id())).record!; loaded.world.nations[0].name = '读取后更改';
    expect((await readHistoryRun(id())).record!.world).toEqual(third.world);
  });

  it('整个候选包在异步哈希前复制，等待期间编辑不会造成快照历史错配', async () => {
    const input = await candidate(), expected = structuredClone(input), saving = writeHistoryRun(id(), input, 0);
    input.world.day = 19; input.history.initial.world.nations[0].name = '异步编辑'; input.history.engineFingerprint = 'b'.repeat(64);
    await saving; expect((await readHistoryRun(id())).record).toEqual({ ...expected, storageId: id() });
  });

  it('旧标签和并发保存只有一个赢家，快照历史备份与revision同步', async () => {
    const first = await candidate(), second = await advance(first), third = await advance(second);
    await writeHistoryRun(id(), first, 0);
    const results = await Promise.allSettled([writeHistoryRun(id(), second, 1), writeHistoryRun(id(), third, 1)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results[0].status === 'fulfilled' ? second : third, before = await rawState();
    expect((await readHistoryRun(id())).record).toEqual({ ...winner, storageId: id() });
    expect(before.runs[0][1].backup!.record).toEqual({ ...first, storageId: id() });
    await expect(writeHistoryRun(id(), third, 1)).rejects.toThrow('另一窗口'); expect(await rawState()).toEqual(before);
  });

  it('不同运行并发写入共享容量计数不会丢更新', async () => {
    const a = await candidate(id(1)), b = await candidate(id(2));
    await Promise.all([writeHistoryRun(id(1), a, 0), writeHistoryRun(id(2), b, 0)]);
    const state = await rawState(), total = state.runs.reduce((sum, [, slots]) => sum + size(slots.current) + size(slots.backup), 0);
    expect(state.usage).toMatchObject({ bytes: total });
    expect((await readHistoryRun(id(1))).bytes).toBe(total); expect((await readHistoryRun(id(2))).bytes).toBe(total);
    expect((await readHistoryRun(id(3))).record).toBeNull(); expect((await rawState()).runs).toHaveLength(2);
  });

  it('meta写入遭遇quota时整对运行写入与revision全部回滚', async () => {
    const initial = await candidate(), next = await advance(initial); await writeHistoryRun(id(), initial, 0); const before = await rawState();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'meta') throw new DOMException('synthetic quota limit', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(writeHistoryRun(id(), next, 1)).rejects.toThrow();
    vi.restoreAllMocks(); expect(await rawState()).toEqual(before); expect((await readHistoryRun(id())).record!.world).toEqual(initial.world);
  });

  it('异步IDB请求失败同样撤销已经排队的current、backup和容量写入', async () => {
    const first = await candidate(), next = await advance(first); await writeHistoryRun(id(), first, 0); const before = await rawState();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      // add on the existing usage key causes an asynchronous ConstraintError.
      if (this.name === 'meta') return this.add(value, key);
      return original.call(this, value, key);
    });
    await expect(writeHistoryRun(id(), next, 1)).rejects.toThrow('原记录及备份未修改');
    vi.restoreAllMocks(); expect(await rawState()).toEqual(before);
  });

  it('写事务CAS也比较主槽原值，未增加revision的损坏替换不能被覆盖', async () => {
    const first = await candidate(), next = await advance(first); await writeHistoryRun(id(), first, 0);
    const slots = structuredClone((await rawState()).runs[0][1]); slots.current.checksum = '0'.repeat(64);
    const original = IDBDatabase.prototype.transaction; let injected = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (this.name === DB && mode === 'readwrite' && !injected) { injected = true; original.call(this, 'runs', 'readwrite').objectStore('runs').put(slots, id()); }
      return original.call(this, stores, mode, options);
    });
    await expect(writeHistoryRun(id(), next, 1)).rejects.toThrow('另一窗口'); vi.restoreAllMocks();
    expect((await rawState()).runs[0][1]).toEqual(slots);
  });

  it('坏主包整体回退到备份，后续保存不把坏主包提升为备份', async () => {
    const first = await candidate(), second = await advance(first); await writeHistoryRun(id(), first, 0); await writeHistoryRun(id(), second, 1);
    await replace(id(), slots => { slots.current.checksum = '0'.repeat(64); });
    const before = await rawState(), recovered = await readHistoryRun(id());
    expect(recovered).toMatchObject({ record: { ...first, storageId: id() }, revision: 2, recovery: true });
    expect(await rawState()).toEqual(before);
    await writeHistoryRun(id(), recovered.record!, 2);
    const after = await rawState(); expect(after.runs[0][1].backup).toEqual(before.runs[0][1].backup);
    expect((await readHistoryRun(id())).recovery).toBe(false);
  });

  it.each(['slots', 'envelope', 'world-schema', 'world-rules', 'statecraft', 'history', 'history-rules', 'initial-world', 'checkpoint-world', 'backup-history', 'backup-world'] as const)('未来%s先锁写，即使其他整包有效也不回退或覆盖', async layer => {
    const first = await candidate(), next = await advance(first); await writeHistoryRun(id(), first, 0); await writeHistoryRun(id(), next, 1);
    await replace(id(), slots => {
      const record = slots.current.record;
      if (layer === 'slots') slots.version = 99;
      else if (layer === 'envelope') slots.current.version = 99;
      else if (layer === 'world-schema') Object.assign(record.world, { schemaVersion: 99 });
      else if (layer === 'world-rules') Object.assign(record.world, { rulesVersion: '99.0.0' });
      else if (layer === 'statecraft') Object.assign(record.world.statecraft!, { version: 99 });
      else if (layer === 'history') Object.assign(record.history, { version: 99 });
      else if (layer === 'history-rules') Object.assign(record.history, { rulesVersion: '99.0.0' });
      else if (layer === 'initial-world') Object.assign(record.history.initial.world, { schemaVersion: 99 });
      else if (layer === 'checkpoint-world') record.history.checkpoints.push({ seq: 32, hash: '0'.repeat(64), world: { ...record.world, schemaVersion: 99 } as unknown as World });
      else if (layer === 'backup-history') Object.assign(slots.backup!.record.history, { version: 99 });
      else Object.assign(slots.backup!.record.history.initial.world.statecraft!, { version: 99 });
    });
    const before = await rawState(); await expect(readHistoryRun(id())).rejects.toThrow('锁定写入');
    await expect(writeHistoryRun(id(), next, 2)).rejects.toThrow('锁定写入'); expect(await rawState()).toEqual(before);
  });

  it('已有未知指纹记录仍可读取和导出原包，不执行新规则或回退旧备份', async () => {
    const first = await candidate(), second = await advance(first);
    await writeHistoryRun(id(), first, 0); await writeHistoryRun(id(), second, 1);
    await replaceFingerprint(id(), 'current', UNKNOWN_ENGINE);
    const before = await rawState(), loaded = await readHistoryRun(id());
    expect(loaded).toMatchObject({ record: { world: second.world, history: { engineFingerprint: UNKNOWN_ENGINE } }, recovery: false, revision: 2 });
    const history = loaded.record!.history, original = JSON.stringify(history);
    expect(await decodeHistoryFile(await encodeHistoryFile(history))).toEqual(history);
    await expect(writeHistoryRun(id(), second, 2)).rejects.toThrow('未知引擎');
    expect(JSON.stringify(history)).toBe(original); expect(await rawState()).toEqual(before);
  });

  it.each([false, true])('未知引擎候选readOnly=%s不能建立运行或伪造末态归档', async readOnly => {
    const unknown = await candidate(); unknown.history.engineFingerprint = UNKNOWN_ENGINE;
    await expect(writeHistoryRun(id(), { ...unknown, readOnly }, 0)).rejects.toThrow('历史引擎未知');
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('未知备份引擎保护独立于当前槽正常与否，不被已知候选覆盖', async () => {
    const first = await candidate(), second = await advance(first);
    await writeHistoryRun(id(), first, 0); await writeHistoryRun(id(), second, 1);
    await replaceFingerprint(id(), 'backup', UNKNOWN_ENGINE);
    const before = await rawState();
    expect((await readHistoryRun(id())).record!.world).toEqual(second.world);
    await expect(writeHistoryRun(id(), await advance(second), 2)).rejects.toThrow('未知引擎');
    expect(await rawState()).toEqual(before);
  });

  it('写事务内发现未知引擎替换时拒绝，不能仅依赖较早的只读检查', async () => {
    const first = await candidate(), next = await advance(first); await writeHistoryRun(id(), first, 0);
    const slots = structuredClone((await rawState()).runs[0][1]); slots.current.record.history.engineFingerprint = UNKNOWN_ENGINE;
    const original = IDBDatabase.prototype.transaction; let injected = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (this.name === DB && mode === 'readwrite' && !injected) { injected = true; original.call(this, 'runs', 'readwrite').objectStore('runs').put(slots, id()); }
      return original.call(this, stores, mode, options);
    });
    await expect(writeHistoryRun(id(), next, 1)).rejects.toThrow('未知引擎'); vi.restoreAllMocks();
    expect((await rawState()).runs[0][1]).toEqual(slots);
  });

  it('旧规则历史包保持schema1/rules0.1原样，无经营字段迁移', async () => {
    const world: World = { ...createWorld(), scenario: 'custom-world', custom: { id: id(), name: '旧规则记录', seed: 'legacy-history', rivers: [] } };
    const history = await legacyEngine.createHistory(world, { runId: id() }), before = structuredClone(world);
    await writeHistoryRun(id(), { world, history, readOnly: false }, 0); const slots = await rawState();
    const loaded = await readHistoryRun(id()); expect(loaded.record!.world).toEqual(before);
    expect(Object.hasOwn(loaded.record!.world, 'statecraft')).toBe(false); expect(await rawState()).toEqual(slots);
  });

  it.each(['storage-id', 'source-id', 'tail', 'tail-event', 'checkpoint-hash'] as const)('身份或完整末态%s错配不落盘', async field => {
    const bad = await candidate();
    if (field === 'storage-id') bad.history.runId = id(2);
    else if (field === 'source-id') bad.world.custom!.id = id(2);
    else if (field === 'tail') bad.world.nations[0].name = '结构合法但非历史末态';
    else if (field === 'tail-event') bad.world.nextEventId++;
    else bad.history.initial.hash = '0'.repeat(64);
    await expect(writeHistoryRun(id(), bad, 0)).rejects.toThrow(); expect(await indexedDB.databases()).toEqual([]);
  });

  it('只读导入保留源id和原历史包，任何后续write都拒绝', async () => {
    const source = await candidate('run-original-source'), immutable = structuredClone(source.history);
    await writeHistoryRun(id(), { ...source, readOnly: true }, 0); const before = await rawState();
    expect((await readHistoryRun(id())).record).toEqual({ ...source, storageId: id(), readOnly: true });
    expect((await readHistoryRun(id())).record!.history).toEqual(immutable);
    await expect(writeHistoryRun(id(), { ...source, readOnly: true }, 1)).rejects.toThrow('只读');
    await expect(writeHistoryRun(id(), { ...await candidate(), readOnly: false }, 1)).rejects.toThrow('只读');
    await expect(writeHistoryRun(id(), { ...await candidate(), readOnly: false }, 0)).rejects.toThrow('只读');
    expect(await rawState()).toEqual(before); expect(source.history).toEqual(immutable);
  });

  it('全局200MiB预算包括新current和前current备份，超额不改任何槽', async () => {
    const first = await candidate(), next = await advance(first); await writeHistoryRun(id(), first, 0);
    await replaceUsage({ format: 'lieguoji-history-usage', version: 1, bytes: MAX_HISTORY_STORAGE_BYTES });
    const before = await rawState(); await expect(writeHistoryRun(id(), next, 1)).rejects.toThrow('200 MiB'); expect(await rawState()).toEqual(before);
    await expect(writeHistoryRun(id(2), await candidate(id(2)), 0)).rejects.toThrow('200 MiB'); expect(await rawState()).toEqual(before);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, undefined, null, '1'])('无效调用revision %s拒绝且不创建记录', async expected => {
    await expect(writeHistoryRun(id(), await candidate(), expected as number)).rejects.toThrow('版本计数'); expect(await indexedDB.databases()).toEqual([]);
  });

  it.each([-1, 0, 0.5, NaN, null, '1'])('损坏已存revision %s不能读取或写入', async invalid => {
    const first = await candidate(); await writeHistoryRun(id(), first, 0);
    await replace(id(), slots => { Object.assign(slots, { revision: invalid }); }); const before = await rawState();
    await expect(readHistoryRun(id())).rejects.toThrow('版本计数'); await expect(writeHistoryRun(id(), first, 1)).rejects.toThrow('版本计数'); expect(await rawState()).toEqual(before);
  });

  it.each(['../run-h-file', 'run-old', 'run-h-no-uuid', id().toUpperCase()])('无效storageId %s在开库前拒绝', async invalid => {
    await expect(readHistoryRun(invalid)).rejects.toThrow('身份'); await expect(writeHistoryRun(invalid, await candidate(), 0)).rejects.toThrow('身份'); expect(await indexedDB.databases()).toEqual([]);
  });

  it('未来容量版本和损坏容量计数锁写，不通过修复计数覆盖原记录', async () => {
    const first = await candidate(); await writeHistoryRun(id(), first, 0);
    for (const invalid of [{ format: 'lieguoji-history-usage', version: 2, bytes: 100 }, { format: 'lieguoji-history-usage', version: 1, bytes: -1 }, { format: 'lieguoji-history-usage', version: 1, bytes: 0 }]) {
      await replaceUsage(invalid); const before = await rawState();
      await expect(readHistoryRun(id())).rejects.toThrow(); await expect(writeHistoryRun(id(), first, 1)).rejects.toThrow(); expect(await rawState()).toEqual(before);
    }
  });

  it('建立历史记录和独立分支不写旧存档DB的current/backup/revision', async () => {
    const original = createWorld(); await writeSave(original, 0); await writeSave({ ...original, day: 1 }, 1);
    const old = await readSave();
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('lieguoji-test-continent-v1'); request.onsuccess = () => resolve(request.result); });
    const readOldSlots = () => new Promise<unknown[]>(resolve => { const request = db.transaction('saves').objectStore('saves').getAll(); request.onsuccess = () => resolve(request.result); });
    const before = await readOldSlots(), first = await candidate(); await writeHistoryRun(id(), first, 0); await writeHistoryRun(id(2), await candidate(id(2)), 0);
    expect(await readOldSlots()).toEqual(before); expect(await readSave()).toEqual(old); db.close();
  });
});

describe('历史文件完整性与大小', () => {
  it('文件往返，编码和解码都先复制，原始checksum及source-id不改', async () => {
    const source = (await candidate()).history, expected = structuredClone(source), encoding = encodeHistoryFile(source);
    source.initial.world.nations[0].name = '并发变更'; const file = await encoding;
    expect(file.history).toEqual(expected); const before = JSON.stringify(file), decoding = decodeHistoryFile(file);
    file.history.initial.world.day = 100; expect(await decoding).toEqual(expected);
    expect(await parseHistoryFile(new File([before], 'history.json', { type: 'application/json' }))).toEqual(expected);
  });

  it('拒绝内容篡改和重新包装的伪造检查点hash', async () => {
    const history = (await candidate()).history, file = await encodeHistoryFile(history);
    file.history.engineFingerprint = 'b'.repeat(64); await expect(decodeHistoryFile(file)).rejects.toThrow('校验和');
    history.initial.hash = '0'.repeat(64); await expect(encodeHistoryFile(history)).rejects.toThrow('校验和');
  });

  it.each(['export', 'history', 'world', 'checkpoint', 'statecraft'] as const)('未来%s文件层拒绝且不碰数据库', async layer => {
    const file = await encodeHistoryFile((await candidate()).history);
    if (layer === 'export') Object.assign(file, { version: 99 });
    else if (layer === 'history') Object.assign(file.history, { version: 99 });
    else if (layer === 'world') Object.assign(file.history.initial.world, { schemaVersion: 99 });
    else if (layer === 'statecraft') Object.assign(file.history.initial.world.statecraft!, { version: 99 });
    else file.history.checkpoints.push({ seq: 32, hash: '0'.repeat(64), world: { ...file.history.initial.world, schemaVersion: 99 } as unknown as World });
    await expect(decodeHistoryFile(file)).rejects.toThrow('锁定写入'); expect(await indexedDB.databases()).toEqual([]);
  });

  it('拒绝超过20MiB加小封装余量的UTF8文件和非JSON文件', async () => {
    await expect(parseHistoryFile(new File(['界'.repeat(Math.ceil((MAX_HISTORY_BYTES + 4097) / 3))], 'large.json'))).rejects.toThrow('20 MiB');
    await expect(parseHistoryFile(new File(['not json'], 'bad.json'))).rejects.toThrow('JSON');
  });
});
