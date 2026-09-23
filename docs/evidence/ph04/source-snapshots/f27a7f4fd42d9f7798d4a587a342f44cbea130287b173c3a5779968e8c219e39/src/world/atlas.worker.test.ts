import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { AtlasWorkerRuntime } from './atlas.worker';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket } from './protocol';
import * as storage from './storage';
import { getCellLayerSlot } from './model';

class LoopWorker {
  static instances: LoopWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  packets: { direction: 'request' | 'response'; bytes: number; type: string }[] = [];
  dropEditCompletion = false;
  corruptBlock = false;
  holdNextBlock?: { seen: () => void; release: Promise<void> };
  private runtime = new AtlasWorkerRuntime((bytes, transfer) => {
    if (this.closed) return;
    const packet = decodeAtlasPacket(bytes); this.packets.push({ direction: 'response', bytes: bytes.length, type: packet.header.type });
    const copy = structuredClone(bytes, { transfer });
    if (this.dropEditCompletion && packet.header.type === 'complete' && (packet.header.body as { operation?: string })?.operation === 'edit') {
      queueMicrotask(() => this.onerror?.({ message: 'synthetic lost durable response' } as ErrorEvent)); return;
    }
    if (this.corruptBlock && packet.header.type === 'block') { copy[copy.length - 1] ^= 1; this.corruptBlock = false; }
    if (this.holdNextBlock && packet.header.type === 'block') {
      const hold = this.holdNextBlock; this.holdNextBlock = undefined; hold.seen();
      void hold.release.then(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); }); return;
    }
    queueMicrotask(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); });
  });
  constructor() { LoopWorker.instances.push(this); }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const packet = decodeAtlasPacket(bytes); this.packets.push({ direction: 'request', bytes: bytes.length, type: packet.header.type });
    const copy = structuredClone(bytes, { transfer });
    queueMicrotask(() => { if (!this.closed) this.runtime.receive(copy); });
  }
  terminate() { if (!this.closed) { this.closed = true; this.runtime.close(); } }
}
const clients: AtlasClient[] = [];
function client() { const value = new AtlasClient(); clients.push(value); return value; }
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const createOptions = { size: 128 as const, seed: 'ph04-worker-owned-boundary', name: '事务测试海洋' };
const elevation = (value: number) => ({ elevation: { ids: new Uint32Array([0]), values: new Int32Array([value]) } });

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); LoopWorker.instances = []; vi.stubGlobal('Worker', LoopWorker); });
afterEach(async () => { clients.splice(0).forEach(value => value.close()); await nextTask(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('atlas Worker durable authority with real binary transport and isolated IDB', () => {
  it('rejects an unknown restore source before opening any storage path', async () => {
    const open = vi.spyOn(storage, 'openAtlasStorageSession'), backup = vi.spyOn(storage, 'openAtlasDraft');
    let deliver!: (body: unknown) => void;
    const error = new Promise<unknown>(resolve => { deliver = resolve; });
    const runtime = new AtlasWorkerRuntime(bytes => { const { header } = decodeAtlasPacket(bytes); if (header.type === 'error') deliver(header.body); });
    runtime.receive(encodeAtlasPacket({ version: 1, id: 1, type: 'request', body: { type: 'restore', draftId: `atlas-${crypto.randomUUID()}`, source: 'future' } }));
    await expect(error).resolves.toMatchObject({ message: '草稿恢复来源无效。', committed: false, fatal: false });
    expect(open).not.toHaveBeenCalled(); expect(backup).not.toHaveBeenCalled(); runtime.close();
  });

  it('initializes through bounded acknowledged fragments and publishes only dirty-block copies after preview and commit', async () => {
    const value = client(), initial = await value.create(createOptions), worker = LoopWorker.instances[0];
    expect(initial.head).toMatchObject({ revision: 0, readOnly: false, undoCount: 0, hasBackup: false });
    expect(worker.packets.filter(packet => packet.type === 'block')).toHaveLength(64);
    expect(worker.packets.every(packet => packet.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
    expect(initial.metrics.responseBytes).toBe(worker.packets.filter(packet => packet.direction === 'response').reduce((sum, packet) => sum + packet.bytes, 0));
    expect(initial.metrics.requestBytes).toBe(worker.packets.filter(packet => packet.direction === 'request').reduce((sum, packet) => sum + packet.bytes, 0));
    const oldRoot = initial.head.rootDigest, oldDirty = initial.data.blocks.get('elevation:0:0'), oldUnchanged = initial.data.blocks.get('elevation:1:0');
    const preview = await value.preview(elevation(80), '预览局部陆地');
    expect(value.head?.rootDigest).toBe(oldRoot);
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.rootDigest).toBe(oldRoot);
    expect(preview).toMatchObject({ baseRevision: 0, baseRootDigest: oldRoot, affectedCellCount: 1, localBudgetEligible: true });
    // The UI mirror must not be a backdoor into verified receive state or Worker authority.
    getCellLayerSlot(initial.data, 'elevation', 0).block.values[0] = 11999;
    initial.head.rootDigest = 'f'.repeat(64);
    const edited = await value.edit(elevation(80), '确认局部陆地', { revision: preview.baseRevision, rootDigest: preview.baseRootDigest });
    expect(edited.head).toMatchObject({ revision: 1, undoCount: 1, hasBackup: true });
    expect(getCellLayerSlot(edited.data, 'elevation', 0).block.values[0]).toBe(80);
    expect(edited.data.blocks.get('elevation:0:0')).not.toBe(oldDirty);
    expect(edited.data.blocks.get('elevation:1:0')).toBe(oldUnchanged);
    expect(edited.dirtyKeys).toEqual(['elevation:0:0']);
    expect(edited.delta.rootDigest).toBe((await storage.openAtlasDraft(edited.head.draftId))?.root.rootDigest);
    const undone = await value.undo();
    expect(getCellLayerSlot(undone.data, 'elevation', 0).block.values[0]).toBe(-100);
    expect(undone.head).toMatchObject({ revision: 2, undoCount: 0 });
  }, 20_000);

  it('rejects a stale preview without changing the committed root', async () => {
    const value = client(); await value.create(createOptions);
    const preview = await value.preview(elevation(10), '旧预览');
    const head = (await value.edit(elevation(20), '先完成另一编辑')).head;
    await expect(value.edit(elevation(10), '过期确认', { revision: preview.baseRevision, rootDigest: preview.baseRootDigest })).rejects.toThrow('版本已变化');
    expect(value.head?.rootDigest).toBe(head.rootDigest);
    expect((await storage.openAtlasDraft(head.draftId))?.root.rootDigest).toBe(head.rootDigest);
  }, 20_000);

  it('uses the verified local commit for edit and undo without restaging or reading a full candidate', async () => {
    const value = client(); await value.create(createOptions);
    const prepare = vi.spyOn(storage, 'prepareAtlasCommit'), stage = vi.spyOn(storage, 'stageAtlasBlocks'), commit = vi.spyOn(storage, 'commitAtlasPreparation');
    const edited = await value.edit(elevation(25), '已核验局部写入');
    expect(edited.head.revision).toBe(1);
    const undone = await value.undo(); expect(undone.head.revision).toBe(2);
    expect(getCellLayerSlot(undone.data, 'elevation', 0).block.values[0]).toBe(-100);
    expect(prepare).not.toHaveBeenCalled(); expect(stage).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    expect((await storage.openAtlasDraft(undone.head.draftId))?.root.rootDigest).toBe(undone.head.rootDigest);
  }, 20_000);

  it('keeps the fully verified fallback for an edit above the local block budget', async () => {
    const value = client(); await value.create(createOptions);
    const prepare = vi.spyOn(storage, 'prepareAtlasCommit'), stage = vi.spyOn(storage, 'stageAtlasBlocks'), commit = vi.spyOn(storage, 'commitAtlasPreparation');
    const patch = { elevation: { ids: new Uint32Array([0, 32, 64, 96, 4096]), values: new Int32Array(5).fill(50) } };
    const result = await value.edit(patch, '超出局部预算的完整提交');
    expect(result.metrics.localBudgetEligible).toBe(false);
    const last = getCellLayerSlot(result.data, 'elevation', 4096);
    expect(result.head.revision).toBe(1); expect(last.block.values[last.slot]).toBe(50);
    expect(prepare).toHaveBeenCalledTimes(1); expect(stage).toHaveBeenCalled(); expect(commit).toHaveBeenCalledTimes(1);
    const subsequent = await value.edit(elevation(60), '完整提交后继续局部提交');
    expect(subsequent.head.revision).toBe(2); expect(commit).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('cancels a local transaction before persistence without replacing the prior root', async () => {
    const open = storage.openAtlasStorageSession, reached = deferred(), gate = deferred();
    let holdNext = false;
    vi.spyOn(storage, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args);
      if (session) {
        const local = session.commitLocal.bind(session);
        vi.spyOn(session, 'commitLocal').mockImplementation(async (...localArgs) => {
          if (holdNext) { holdNext = false; reached.release(); await gate.promise; }
          return local(...localArgs);
        });
      }
      return session;
    });
    const value = client(), initial = await value.create(createOptions); holdNext = true;
    const pending = value.edit(elevation(31), '取消局部提交'), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await reached.promise; value.cancel(); await nextTask(); gate.release(); await rejected;
    expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.rootDigest).toBe(initial.head.rootDigest);
    const retry = await value.edit(elevation(32), '明确新操作'); expect(retry.head.revision).toBe(1);
  }, 20_000);

  it('resolves a lost local commit completion by the same receipt without rotating backup twice', async () => {
    const open = storage.openAtlasStorageSession; let loseNext = true, commits = 0;
    vi.spyOn(storage, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args);
      if (session) {
        const local = session.commitLocal.bind(session);
        vi.spyOn(session, 'commitLocal').mockImplementation(async (...localArgs) => {
          commits++; const receipt = await local(...localArgs);
          if (loseNext) { loseNext = false; throw new Error('synthetic lost local completion'); }
          return receipt;
        });
      }
      return session;
    });
    const value = client(), initial = await value.create(createOptions), result = await value.edit(elevation(33), '本地提交回执恢复');
    expect(commits).toBe(1); expect(result.head.revision).toBe(1);
    const stored = await storage.openAtlasDraft(initial.head.draftId);
    expect(stored?.root.backupManifest).toBe(initial.head.manifestDigest);
    expect(stored?.root.rootDigest).toBe(result.head.rootDigest);
  }, 20_000);

  it('reports a locally committed edit despite cancellation after IDB completion', async () => {
    const open = storage.openAtlasStorageSession, reached = deferred(), gate = deferred();
    vi.spyOn(storage, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args);
      if (session) {
        const local = session.commitLocal.bind(session);
        vi.spyOn(session, 'commitLocal').mockImplementationOnce(async (...localArgs) => {
          const receipt = await local(...localArgs); reached.release(); await gate.promise; return receipt;
        });
      }
      return session;
    });
    const value = client(); await value.create(createOptions);
    const pending = value.edit(elevation(34), '完成后取消');
    await reached.promise; value.cancel(); await nextTask(); gate.release();
    const result = await pending; expect(result.head.revision).toBe(1);
    expect((await storage.openAtlasDraft(result.head.draftId))?.root.rootDigest).toBe(result.head.rootDigest);
  }, 20_000);

  it('locks the client when a completed local commit cannot recover its receipt', async () => {
    const open = storage.openAtlasStorageSession;
    vi.spyOn(storage, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args);
      if (session) {
        const local = session.commitLocal.bind(session);
        vi.spyOn(session, 'commitLocal').mockImplementationOnce(async (...localArgs) => {
          const receipt = await local(...localArgs);
          throw new storage.AtlasStorageCommittedError(receipt, new Error('synthetic post-completion failure'));
        });
      }
      return session;
    });
    const value = client(), initial = await value.create(createOptions);
    const receiptQuery = vi.spyOn(storage, 'findAtlasReceipt').mockRejectedValueOnce(new Error('synthetic receipt read failure'));
    await expect(value.edit(elevation(35), '已完成但无法确认回执')).rejects.toThrow('事务已经完成');
    expect(receiptQuery).toHaveBeenCalledTimes(1); expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    expect(LoopWorker.instances[0].closed).toBe(true);
    await expect(value.undo()).rejects.toThrow('事务已经完成');
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.revision).toBe(1);
  }, 20_000);

  it('also locks initialization after a completed full commit whose receipt lookup fails', async () => {
    const commit = storage.commitAtlasPreparation;
    vi.spyOn(storage, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => {
      const receipt = await commit(...args);
      throw new storage.AtlasStorageCommittedError(receipt, new Error('synthetic completed creation failure'));
    });
    vi.spyOn(storage, 'findAtlasReceipt').mockRejectedValueOnce(new Error('synthetic receipt read failure'));
    const value = client(); await expect(value.create(createOptions)).rejects.toThrow('事务已经完成');
    expect(value.current).toBeNull(); expect(LoopWorker.instances[0].closed).toBe(true);
    const fresh = client(), entries = await fresh.list(); expect(entries).toHaveLength(1);
    const recovered = await fresh.restore(entries[0].draftId); expect(recovered.head.revision).toBe(0);
  }, 20_000);

  it('rejects a stale verified storage session and requires an explicit restore before accepting the newer root', async () => {
    const first = client(), initial = await first.create(createOptions), second = client();
    await second.restore(initial.head.draftId);
    const current = await second.edit(elevation(41), '另一标签先提交');
    await expect(first.edit(elevation(42), '旧会话不能覆盖')).rejects.toThrow(/CAS|变化|失效/);
    expect(first.head?.rootDigest).toBe(initial.head.rootDigest);
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.rootDigest).toBe(current.head.rootDigest);
    await first.restore(initial.head.draftId);
    const accepted = await first.edit(elevation(43), '明确恢复后提交'); expect(accepted.head.revision).toBe(2);
  }, 20_000);

  it('restores the older backup as read-only and forks without changing the source root', async () => {
    const value = client(), initial = await value.create(createOptions);
    const edited = await value.edit(elevation(100), '存入主档'), root = edited.head.rootDigest;
    const backup = await value.restore(initial.head.draftId, 'backup');
    expect(backup.head).toMatchObject({ revision: 0, rootDigest: root, readOnly: true });
    expect(backup.head.manifestDigest).toBe(initial.head.manifestDigest);
    await expect(value.edit(elevation(30), '不可覆盖')).rejects.toThrow('只读');
    await expect(value.undo()).rejects.toThrow('只读');
    const copy = await value.fork('备份独立副本');
    expect(copy.head.draftId).not.toBe(initial.head.draftId);
    expect(copy.head).toMatchObject({ atlasId: initial.head.atlasId, revision: 0, readOnly: false });
    expect(getCellLayerSlot(copy.data, 'elevation', 0).block.values[0]).toBe(-100);
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.rootDigest).toBe(root);
    expect(await value.list()).toHaveLength(2);
  }, 20_000);

  it('cancels a staged new draft without replacing an existing view or publishing its root', async () => {
    const value = client(), initial = await value.create(createOptions), reached = deferred(), gate = deferred();
    const stage = storage.stageAtlasBlocks;
    vi.spyOn(storage, 'stageAtlasBlocks').mockImplementationOnce(async (...args) => { reached.release(); await gate.promise; return stage(...args); });
    const pending = value.fork('应取消的副本'), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await reached.promise; value.cancel(); await nextTask(); gate.release(); await rejected;
    expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    expect(await value.list()).toHaveLength(1);
  }, 20_000);

  it('reports a commit that completed before a late cancellation as successfully committed', async () => {
    const value = client(), reached = deferred(), gate = deferred(), commit = storage.commitAtlasPreparation;
    vi.spyOn(storage, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => { const receipt = await commit(...args); reached.release(); await gate.promise; return receipt; });
    const pending = value.create(createOptions);
    await reached.promise; value.cancel(); await nextTask(); gate.release();
    const result = await pending;
    expect(result.head.revision).toBe(0);
    expect((await storage.openAtlasDraft(result.head.draftId))?.root.rootDigest).toBe(result.head.rootDigest);
    expect(await value.list()).toHaveLength(1);
  }, 20_000);

  it('cancelled initialization and its late block cannot replace the previous receive mirror', async () => {
    const value = client(), initial = await value.create(createOptions), reached = deferred(), late = deferred();
    const edited = await value.edit(elevation(45), '保留当前视图'), priorView = value.current;
    LoopWorker.instances[0].holdNextBlock = { seen: reached.release, release: late.promise };
    const restoring = value.restore(initial.head.draftId, 'backup'), rejected = expect(restoring).rejects.toMatchObject({ name: 'AbortError' });
    await reached.promise; value.cancel(); await rejected;
    expect(value.current).toBe(priorView);
    expect(value.head).toMatchObject({ rootDigest: edited.head.rootDigest, revision: 1, readOnly: false });
    late.release(); await nextTask();
    expect(getCellLayerSlot(value.current!.data, 'elevation', 0).block.values[0]).toBe(45);
    expect(await value.list()).toHaveLength(1);
  }, 20_000);

  it('resolves a lost storage completion by command receipt without repeating the commit', async () => {
    const value = client(), commit = storage.commitAtlasPreparation;
    const spy = vi.spyOn(storage, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => { await commit(...args); throw new Error('synthetic lost storage completion'); });
    const result = await value.create(createOptions);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.head).toMatchObject({ revision: 0, hasBackup: false });
    expect((await value.receipt(result.head.draftId, value.lastCommand!.commandId!))?.rootDigest).toBe(result.head.rootDigest);
  }, 20_000);

  it('a lost durable Worker reply is fatal; a fresh client queries the same command without rotating backup', async () => {
    const value = client(), initial = await value.create(createOptions);
    LoopWorker.instances[0].dropEditCompletion = true;
    await expect(value.edit(elevation(60), '提交后响应丢失')).rejects.toThrow('lost durable response');
    expect(value.current?.head.revision).toBe(0);
    await expect(value.undo()).rejects.toThrow('lost durable response');
    const identity = value.lastCommand!, fresh = client(), receipt = await fresh.receipt(initial.head.draftId, identity.commandId!);
    expect(receipt).toMatchObject({ committed: true, revision: 1 });
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.revision).toBe(1);
    const restored = await fresh.restore(initial.head.draftId);
    expect(restored.head.rootDigest).toBe(receipt?.rootDigest);
    expect(restored.head.revision).toBe(1);
  }, 20_000);

  it('rejects a corrupted initialization block and leaves the fully committed draft recoverable', async () => {
    const value = client(); LoopWorker.instances[0].corruptBlock = true;
    await expect(value.create(createOptions)).rejects.toThrow();
    expect(value.current).toBeNull();
    const fresh = client(), entries = await fresh.list(); expect(entries).toHaveLength(1);
    const restored = await fresh.restore(entries[0].draftId);
    expect(restored.head.rootDigest).toBe(entries[0].rootDigest);
  }, 20_000);
});
