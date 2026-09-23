import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDraft } from '../worldgen/engine';
import { decodeWorkspace, encodeWorkspace, loadWorkspace, saveWorkspace } from './store';
import type { Workspace } from './store';

const DB = 'lieguoji-world-studio-v1';

function workspace(name = '双岛草稿'): Workspace {
  const draft = createDraft('存档回归-2026', true);
  draft.name = name;
  draft.nations = [
    { id: 'nation-east', name: '东国', color: '#337788' },
    { id: 'nation-west', name: '西国', color: '#884433' },
  ];
  for (const [index, nation] of draft.nations.entries()) {
    Object.assign(draft.cells[index], {
      land: true, elevation: 0.4 + index * 0.2, moisture: 0.7,
      terrain: index === 0 ? 'forest' : 'mountain', ownerId: nation.id,
    });
    draft.cities.push({ id: `city-${index}`, name: `${nation.name}都`, cellId: draft.cells[index].id, capital: true });
  }
  draft.rivers = [[{ x: 200, y: 120 }, { x: 210, y: 180 }, { x: 230, y: 220 }]];
  return {
    schemaVersion: 1, draft,
    runs: [
      { id: 'run-east-2026', name: '东国历史', createdAt: '2026-09-23T06:00:00.000Z' },
      { id: 'run-west-2026', name: '西国历史', createdAt: '2026-09-23T07:00:00.000Z' },
    ],
  };
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function slots(): Promise<{ current: unknown; backup: unknown; revision: unknown }> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('records', 'readonly');
      const store = transaction.objectStore('records');
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      transaction.oncomplete = () => resolve({ current: current.result, backup: backup.result, revision: revision.result });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

async function replaceSlot(key: 'current' | 'backup' | 'revision', value: unknown): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('records', 'readwrite');
      transaction.objectStore('records').put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe('世界工坊的完整存档与冲突保护', () => {
  it('空工坊返回空草稿和初始 revision', async () => {
    expect(await loadWorkspace()).toEqual({ data: null, revision: 0, recovered: false });
  });

  it('编码和解码保留海陆拓扑、地形、归属、城市、河流和历史列表，且不共享对象', async () => {
    const original = workspace();
    const encoded = await encodeWorkspace(original);
    const decoded = await decodeWorkspace(encoded);
    expect(decoded).toEqual(original);
    expect(decoded.draft.cells[0].polygon).not.toBe(original.draft.cells[0].polygon);
    expect(encoded.data.draft).not.toBe(original.draft);
    decoded.draft.cells[0].elevation = 0.1;
    decoded.draft.nations[0].name = '已修改';
    decoded.draft.cities[0].name = '已修改';
    decoded.runs[0].name = '已修改';
    expect(await decodeWorkspace(encoded)).toEqual(original);
  });

  it.each(['draft', 'runs'] as const)('拒绝对 %s 的有效结构篡改', async field => {
    const encoded = await encodeWorkspace(workspace());
    if (field === 'draft') encoded.data.draft.cells[0].elevation = 0.9;
    else encoded.data.runs[0].name = '伪造历史名称';
    await expect(decodeWorkspace(encoded)).rejects.toThrow('校验和');
  });

  it('拒绝未来封装版本、未来草稿版本及缺失地图字段', async () => {
    const encoded = await encodeWorkspace(workspace());
    await expect(decodeWorkspace({ ...encoded, version: 2 })).rejects.toThrow('更新版本');
    await expect(decodeWorkspace({ ...encoded, data: { ...encoded.data, schemaVersion: 2 } })).rejects.toThrow('版本');
    await expect(decodeWorkspace({ ...encoded, data: { ...encoded.data, draft: { ...encoded.data.draft, schemaVersion: 2 } } })).rejects.toThrow('版本');
    const incompleteDraft: Partial<Workspace['draft']> = { ...encoded.data.draft };
    delete incompleteDraft.rivers;
    await expect(decodeWorkspace({ ...encoded, data: { ...encoded.data, draft: incompleteDraft } })).rejects.toThrow('损坏');
  });

  it('IndexedDB 往返保留完整草稿与运行列表，调用者的后续编辑不污染存档', async () => {
    const source = workspace();
    const expected = structuredClone(source);
    expect(await saveWorkspace(source, 0)).toBe(1);
    source.draft.name = '尚未保存的新名';
    source.runs.pop();
    expect(await loadWorkspace()).toEqual({ data: expected, revision: 1, recovered: false });
  });

  it('旧标签 revision 不能覆盖更新后的主槽、备份或计数', async () => {
    const first = workspace('第一稿'), second = workspace('新标签已保存');
    const oldRevision = await saveWorkspace(first, 0);
    await saveWorkspace(second, oldRevision);
    const before = await slots();
    await expect(saveWorkspace(workspace('旧标签修改'), oldRevision)).rejects.toThrow('另一窗口');
    expect(await slots()).toEqual(before);
    expect((await loadWorkspace()).data).toEqual(second);
  });

  it('同时保存只有一个成功，revision 只增长一次并保留实际上一稿', async () => {
    const previous = workspace('并发前');
    const revision = await saveWorkspace(previous, 0);
    const candidates = [workspace('并发甲'), workspace('并发乙')];
    const results = await Promise.allSettled(candidates.map(candidate => saveWorkspace(candidate, revision)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results.findIndex(result => result.status === 'fulfilled');
    const saved = await loadWorkspace(), raw = await slots();
    expect(saved).toEqual({ data: candidates[winner], revision: revision + 1, recovered: false });
    expect(await decodeWorkspace(raw.backup)).toEqual(previous);
  });

  it('损坏主槽恢复有效备份，并在保存恢复稿时保留该备份', async () => {
    const previous = workspace('有效备份');
    const firstRevision = await saveWorkspace(previous, 0);
    const revision = await saveWorkspace(workspace('即将损坏'), firstRevision);
    await replaceSlot('current', { broken: true });
    const recovered = await loadWorkspace();
    expect(recovered).toEqual({ data: previous, revision, recovered: true });
    expect(await saveWorkspace(recovered.data!, recovered.revision)).toBe(revision + 1);
    const raw = await slots();
    expect(await decodeWorkspace(raw.backup)).toEqual(previous);
    expect(await loadWorkspace()).toEqual({ data: previous, revision: revision + 1, recovered: false });
  });

  it.each(['envelope', 'workspace', 'draft'] as const)('未来 %s 版本主槽即使有有效旧备份也不回退、不覆盖任何槽', async versionLayer => {
    const previous = workspace('旧备份');
    const revision = await saveWorkspace(previous, 0);
    await saveWorkspace(workspace('当前稿'), revision);
    const encoded = await encodeWorkspace(workspace('新版本草稿'));
    const future = versionLayer === 'envelope' ? { ...encoded, version: 2 }
      : versionLayer === 'workspace' ? { ...encoded, data: { ...encoded.data, schemaVersion: 2 } }
        : { ...encoded, data: { ...encoded.data, draft: { ...encoded.data.draft, schemaVersion: 2 } } };
    await replaceSlot('current', future);
    const before = await slots();
    expect(await decodeWorkspace(before.backup)).toEqual(previous);
    await expect(loadWorkspace()).rejects.toThrow('更新版本');
    await expect(saveWorkspace(previous, revision + 1)).rejects.toThrow('更新版本');
    expect(await slots()).toEqual(before);
  });

  it('无效历史列表不能落盘，保留已有有效数据', async () => {
    await saveWorkspace(workspace(), 0);
    const before = await slots();
    const invalid = workspace();
    invalid.runs[1].id = invalid.runs[0].id;
    await expect(saveWorkspace(invalid, 1)).rejects.toThrow('校验失败');
    expect(await slots()).toEqual(before);
  });

  it('损坏的版本计数不会被当作新工坊载入', async () => {
    await saveWorkspace(workspace(), 0);
    await replaceSlot('revision', -1);
    const before = await slots();
    await expect(loadWorkspace()).rejects.toThrow('版本计数损坏');
    expect(await slots()).toEqual(before);
  });
});
