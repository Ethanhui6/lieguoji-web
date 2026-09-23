import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, it, expect } from 'vitest';
import { createWorld } from './sim/demo';
import { initializeStatecraft } from './sim/core';
import type { World } from './sim/types';
import { encodeSave, decodeSave, writeSave, readSave, parseSaveFile } from './persistence';
import legacyCustomFixture from '../tests/fixtures/legacy-custom-0.1.json';
import legacyDemoFixture from '../tests/fixtures/legacy-demo-0.1.json';

const legacyCustom = (): World => structuredClone(legacyCustomFixture.world) as World;
const modernCustom = () => initializeStatecraft(legacyCustom(), 'war');
const dbName = (scope = 'test-continent') => scope === 'test-continent' ? 'lieguoji-test-continent-v1' : `lieguoji-${scope}-v1`;
async function database(scope?: string): Promise<IDBDatabase> {
 return new Promise((resolve, reject) => {
  const request = indexedDB.open(dbName(scope), 1);
  request.onupgradeneeded = () => request.result.createObjectStore('saves');
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
 });
}
async function slots(scope?: string) {
 const db = await database(scope);
 try { return await new Promise<{ current: unknown; backup: unknown; revision: unknown }>((resolve, reject) => {
  const tx = db.transaction('saves', 'readonly'), store = tx.objectStore('saves');
  const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
  tx.oncomplete = () => resolve({ current: current.result, backup: backup.result, revision: revision.result });
  tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
 }); } finally { db.close(); }
}
async function replace(key: string, value: unknown, scope?: string) {
 const db = await database(scope);
 try { await new Promise<void>((resolve, reject) => {
  const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(value, key);
  tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
 }); } finally { db.close(); }
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe('双版本存档与原档保护', () => {
 it.each([['旧战役', createWorld], ['旧自建', legacyCustom], ['经营自建', modernCustom]] as const)('%s 完整往返、版本对齐且不共享对象', async (_name, factory) => {
  const world = factory(), original = structuredClone(world), saved = await encodeSave(world), recovered = await decodeSave(saved);
  expect(saved.version).toBe(world.schemaVersion); expect(saved.rulesVersion).toBe(world.rulesVersion);
  expect(recovered).toEqual(original); expect(recovered).not.toBe(saved.world); expect(saved.world).not.toBe(world);
  const file = new File([JSON.stringify(saved)], 'world.save.json', { type: 'application/json' });
  expect(await parseSaveFile(file)).toEqual(original);
 });

 it.each([['旧战役', legacyDemoFixture, 'test-continent'], ['旧自建', legacyCustomFixture, 'custom-run-legacy-regression']] as const)('%s 固定旧发布样本载入不补字段、不写回、不改变在途军队', async (_name, fixture, scope) => {
  const world = fixture.world, original = JSON.stringify(fixture), revision = 7;
  expect(await decodeSave(fixture)).toEqual(world);
  await replace('current', fixture, scope); await replace('revision', revision, scope); const before = await slots(scope);
  const first = await readSave(scope), second = await readSave(scope);
  expect(first).toEqual({ world, revision, recovery: false }); expect(second).toEqual(first);
  expect(first.world).toMatchObject({ schemaVersion: 1, rulesVersion: '0.1.0' });
  expect(Object.hasOwn(first.world!, 'statecraft')).toBe(false); expect(await slots(scope)).toEqual(before);
  expect(first.world!.armies).toEqual(world.armies); expect(JSON.stringify(fixture)).toBe(original);
 });

 it('编码使用同一快照计算校验和，异步期间修改原对象不污染保存结果', async () => {
  const world = modernCustom(), before = structuredClone(world), saving = encodeSave(world);
  world.day = 20; world.nations[0].name = '并发修改'; world.statecraft!.provinces[0].grain++;
  expect(await decodeSave(await saving)).toEqual(before);
 });

 it('解码对已校验的快照返回，调用者并发修改封装不影响结果', async () => {
  const saved = await encodeSave(modernCustom()), before = structuredClone(saved.world), reading = decodeSave(saved);
  saved.world.day = 9; saved.world.nations[0].name = '校验期间修改';
  expect(await reading).toEqual(before);
 });

 it('拒绝双版本中的有效结构篡改与不匹配版本，不默默升级旧存档', async () => {
  for (const world of [legacyCustom(), modernCustom()]) {
   const envelope = await encodeSave(world); envelope.world.day++;
   await expect(decodeSave(envelope)).rejects.toThrow('校验和');
  }
  const old = await encodeSave(legacyCustom()), modern = await encodeSave(modernCustom());
  await expect(decodeSave({ ...old, version: 2 })).rejects.toThrow('版本');
  await expect(decodeSave({ ...old, rulesVersion: '0.2.0' })).rejects.toThrow('版本');
  await expect(decodeSave({ ...old, world: modern.world })).rejects.toThrow('版本');
  await expect(decodeSave({ ...modern, world: old.world })).rejects.toThrow('版本');
 });

 it.each(['version', 'rules', 'world-schema', 'world-rules', 'statecraft-version'] as const)('未来 %s 主槽有有效旧备份时仍锁写，所有槽均不变', async layer => {
  const old = legacyCustom(), revision = await writeSave(old, 0);
  await writeSave({ ...old, day: old.day + 3 }, revision);
  const saved = await encodeSave(modernCustom());
  const future = layer === 'version' ? { ...saved, version: 99 }
   : layer === 'rules' ? { ...saved, rulesVersion: '99.0.0' }
    : layer === 'world-schema' ? { ...saved, world: { ...saved.world, schemaVersion: 99 } }
     : layer === 'world-rules' ? { ...saved, world: { ...saved.world, rulesVersion: '99.0.0' } }
      : { ...saved, world: { ...saved.world, statecraft: { ...saved.world.statecraft, version: 99 } } };
  await replace('current', future); const before = await slots();
  expect(await decodeSave(before.backup)).toEqual(old);
  await expect(decodeSave(future)).rejects.toThrow('版本不兼容');
  await expect(readSave()).rejects.toThrow('版本不兼容');
  await expect(writeSave(modernCustom(), revision + 1)).rejects.toThrow('版本不兼容');
  expect(await slots()).toEqual(before);
 });

 it('坏主槽恢复有效旧备份，恢复后的保存仍保留有效备份', async () => {
  const old = legacyCustom(), revision = await writeSave(old, 0);
  await writeSave({ ...old, day: old.day + 3 }, revision); await replace('current', { broken: true });
  const result = await readSave(); expect(result).toEqual({ world: old, recovery: true, revision: 2 });
  await writeSave(result.world!, result.revision);
  expect(await decodeSave((await slots()).backup)).toEqual(old); expect((await readSave()).recovery).toBe(false);
 });

 it('经营存档拒绝旧标签及并发保存，原子保留赢家之前的备份', async () => {
  const world = modernCustom(); const revision = await writeSave(world, 0), before = await slots();
  await expect(writeSave({ ...world, day: world.day + 1 }, 0)).rejects.toThrow('另一窗口'); expect(await slots()).toEqual(before);
  const candidates = [{ ...world, day: world.day + 2 }, { ...world, day: world.day + 3 }];
  const settled = await Promise.allSettled(candidates.map(candidate => writeSave(candidate, revision)));
  expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1);
  const winner = settled.findIndex(result => result.status === 'fulfilled');
  expect(await readSave()).toEqual({ world: candidates[winner], recovery: false, revision: revision + 1 });
  expect(await decodeSave((await slots()).backup)).toEqual(world);
 });

 it('旧自建创建经营副本仅写新空间，原空间 current/backup/revision 和输入对象不变', async () => {
  const old = legacyCustom(); old.day = 12;
  await writeSave(old, 0, 'custom-run-old'); await writeSave({ ...old, day: 13 }, 1, 'custom-run-old');
  const snapshot = (await readSave('custom-run-old')).world!, original = structuredClone(snapshot), before = await slots('custom-run-old');
  const copy = initializeStatecraft(snapshot, 'war'); copy.custom = { ...copy.custom!, id: 'run-new' };
  await writeSave(copy, 0, 'custom-run-new');
  expect(snapshot).toEqual(original); expect(await slots('custom-run-old')).toEqual(before);
  expect((await readSave('custom-run-old')).world).toEqual(original);
  expect((await readSave('custom-run-new')).world).toEqual(copy);
  expect(copy.statecraft!.relations.every(relation => relation.status === 'war')).toBe(true);
 });

 it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '1'])('损坏 revision %s 拒绝读取和写入，保留所有槽', async value => {
  await writeSave(createWorld(), 0); await replace('revision', value); const before = await slots();
  await expect(readSave()).rejects.toThrow('版本计数'); await expect(writeSave(createWorld(), 1)).rejects.toThrow('版本计数');
  expect(await slots()).toEqual(before);
 });

 it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, undefined])('无效调用 revision %s 不落盘', async value => {
  await writeSave(createWorld(), 0); const before = await slots();
  await expect(writeSave(createWorld(), value as number)).rejects.toThrow('版本计数'); expect(await slots()).toEqual(before);
 });
});
