import { MACRO_GENERATOR_FINGERPRINT, LANDFORM_GENERATOR_FINGERPRINT, ISLAND_GENERATOR_FINGERPRINT, COAST_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT, OCEAN_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { cloneAtlasDocument, createGenerationDraft, isGenerationDocument, type AtlasDocument } from './atlas-format';
import type { MacroRecipe, LandformRecipe, IslandRecipe, CoastRecipe, ShapeRecipe, OceanRecipe, AtlasCellLockBlock, GenerationScope } from './generation-contract';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { AtlasWorkerRuntime } from './atlas.worker';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket, type AtlasOperation } from './protocol';
import * as storage from './storage';
const storageV1 = storage.getAtlasStorage(1);
import { getCellLayerSlot, hashBlock } from './model';
import { atlasCellLockFlags, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { OwnedAtlasSession } from './transactions';
import { quadQ } from './generation/quality';

class LoopWorker {
  static instances: LoopWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  packets: { direction: 'request' | 'response'; bytes: number; type: string }[] = [];
  dropEditCompletion = false;
  dropInitializationCompletion = false;
  dropTiming = false;
  timingFault?: 'root' | 'total';
  holdTiming?: { seen: () => void; release: Promise<void> };
  corruptBlock = false;
  holdNextBlock?: { seen: () => void; release: Promise<void> };
  private runtime = new AtlasWorkerRuntime((bytes, transfer) => {
    if (this.closed) return;
    const packet = decodeAtlasPacket(bytes); this.packets.push({ direction: 'response', bytes: bytes.length, type: packet.header.type });
    let copy = structuredClone(bytes, { transfer });
    if (this.dropInitializationCompletion && packet.header.type === 'complete' && (packet.header.body as { operation?: string })?.operation === 'initialize') { queueMicrotask(() => this.onerror?.({ message: 'synthetic lost generation receipt' } as ErrorEvent)); return; }
    if (this.dropEditCompletion && packet.header.type === 'complete' && (packet.header.body as { operation?: string })?.operation === 'edit') {
      queueMicrotask(() => this.onerror?.({ message: 'synthetic lost durable response' } as ErrorEvent)); return;
    }
    if (this.corruptBlock && packet.header.type === 'block') { copy[copy.length - 1] ^= 1; this.corruptBlock = false; }
    if (packet.header.type === 'timing') {
      if (this.dropTiming) return;
      if (this.timingFault) {
        const body = packet.header.body as Record<string, unknown>;
        copy = encodeAtlasPacket({ ...packet.header, body: { ...body, ...(this.timingFault === 'root' ? { rootDigest: '0'.repeat(64) } : { computation: { ...body.computation as object, observedComputeMs: 0 } }) } });
      }
      if (this.holdTiming) {
        const hold = this.holdTiming; this.holdTiming = undefined; hold.seen();
        void hold.release.then(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); }); return;
      }
    }
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
function client(options: ConstructorParameters<typeof AtlasClient>[0] = {}) { const value = new AtlasClient(options); clients.push(value); return value; }
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const createOptions = { size: 128 as const, seed: 'ph04-worker-owned-boundary', name: '事务测试海洋' };
const elevation = (value: number) => ({ elevation: { ids: new Uint32Array([0]), values: new Int32Array([value]) } });

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); LoopWorker.instances = []; vi.stubGlobal('Worker', LoopWorker); });
afterEach(async () => { clients.splice(0).forEach(value => value.close()); await nextTask(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('atlas Worker durable authority with real binary transport and isolated IDB', () => {
  it('creates, edits, restores and forks v3 in its own domain through actual packet validation', async () => {
    const c = client({ format: 3 }), initial = await c.create(createOptions);
    expect(initial.data.manifest).toMatchObject({ version: 3, surface: { kind: 'land-mask-fan-v1', coordinateScale: 256 } });
    const edited = await c.edit(elevation(500), '绘制一处岛屿');
    expect(edited.head.revision).toBe(1);
    expect((await storage.getAtlasStorage(3).openAtlasDraft(initial.head.draftId))?.root.domain).toBe('atlas-draft-v3');
    expect(await storage.getAtlasStorage(2).openAtlasDraft(initial.head.draftId)).toBeNull();
    expect((await client({ format: 3 }).restore(initial.head.draftId)).data).toEqual(edited.data);
    const forked = await c.fork('自然海岸独立副本');
    expect(forked.data.manifest).toMatchObject({ version: 3, origin: { sourceFormat: 3, sourceDraftId: initial.head.draftId } });
    expect(forked.head.draftId).not.toBe(initial.head.draftId);
    expect(forked.data.blocks).toEqual(edited.data.blocks);
    expect(LoopWorker.instances.flatMap(w => w.packets).every(p => p.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
  }, 30000);

  it('copies v2 explicitly into v3 without changing the old root and rejects an implicit downgrade', async () => {
    const c = client({ format: 2 }), original = await c.create(createOptions);
    const source = await storage.getAtlasStorage(2).openAtlasDraft(original.head.draftId);
    const next = await c.generationCopy('连续海岸副本', 3);
    expect(next.data.manifest).toMatchObject({ version: 3, origin: { sourceFormat: 2, sourceDraftId: original.head.draftId } });
    expect(next.data.blocks).toEqual(original.data.blocks);
    expect(await storage.getAtlasStorage(2).openAtlasDraft(original.head.draftId)).toEqual(source);
    await expect(c.generationCopy('不能降格')).rejects.toThrow();
    expect((await storage.getAtlasStorage(3).openAtlasDraft(next.head.draftId))?.root.currentManifest).toBe(next.head.manifestDigest);
  }, 30000);

  it('rejects an unknown restore source before opening any storage path', async () => {
    const open = vi.spyOn(storageV1, 'openAtlasStorageSession'), backup = vi.spyOn(storageV1, 'openAtlasDraft');
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
    const prepare = vi.spyOn(storageV1, 'prepareAtlasCommit'), stage = vi.spyOn(storageV1, 'stageAtlasBlocks'), commit = vi.spyOn(storageV1, 'commitAtlasPreparation');
    // Local publication only needs scalar identity/root checks, never the full read handle or manifest export.
    const handle = vi.spyOn(storage.AtlasStorageSession.prototype, 'handle', 'get').mockImplementation(() => { throw new Error('unexpected full storage handle export'); });
    const manifest = vi.spyOn(OwnedAtlasSession.prototype, 'manifest').mockImplementation(() => { throw new Error('unexpected full authority manifest export'); });
    const edited = await value.edit(elevation(25), '已核验局部写入');
    expect(edited.head).toMatchObject({ revision: 1, name: createOptions.name, atlasId: value.current!.data.manifest.atlasId });
    const undone = await value.undo(); expect(undone.head.revision).toBe(2);
    expect(getCellLayerSlot(undone.data, 'elevation', 0).block.values[0]).toBe(-100);
    expect(prepare).not.toHaveBeenCalled(); expect(stage).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled(); expect(manifest).not.toHaveBeenCalled();
    expect(edited.metrics.computation).toMatchObject({ coverage: 'complete', reportingOverheadExcluded: true, partialReasons: [], invalidReasons: [] });
    expect(edited.metrics.computation!.observedComputeMs).toBeGreaterThan(0);
    expect(undone.metrics.computation?.coverage).toBe('complete');
    expect((await storage.openAtlasDraft(undone.head.draftId))?.root.rootDigest).toBe(undone.head.rootDigest);
  }, 20_000);

  it('keeps the fully verified fallback for an edit above the local block budget', async () => {
    const value = client(); await value.create(createOptions);
    const prepare = vi.spyOn(storageV1, 'prepareAtlasCommit'), stage = vi.spyOn(storageV1, 'stageAtlasBlocks'), commit = vi.spyOn(storageV1, 'commitAtlasPreparation');
    const patch = { elevation: { ids: new Uint32Array([0, 32, 64, 96, 4096]), values: new Int32Array(5).fill(50) } };
    const result = await value.edit(patch, '超出局部预算的完整提交');
    expect(result.metrics.localBudgetEligible).toBe(false);
    expect(result.metrics.computation?.coverage).toBe('partial');
    expect(result.metrics.computation?.partialReasons).toContain('full-storage-path-not-instrumented');
    const last = getCellLayerSlot(result.data, 'elevation', 4096);
    expect(result.head.revision).toBe(1); expect(last.block.values[last.slot]).toBe(50);
    expect(prepare).toHaveBeenCalledTimes(1); expect(stage).toHaveBeenCalled(); expect(commit).toHaveBeenCalledTimes(1);
    const subsequent = await value.edit(elevation(60), '完整提交后继续局部提交');
    expect(subsequent.head.revision).toBe(2); expect(commit).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('cancels a local transaction before persistence without replacing the prior root', async () => {
    const open = storage.openAtlasStorageSession, reached = deferred(), gate = deferred();
    let holdNext = false;
    vi.spyOn(storageV1, 'openAtlasStorageSession').mockImplementation(async (...args) => {
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
    vi.spyOn(storageV1, 'openAtlasStorageSession').mockImplementation(async (...args) => {
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
    expect(result.metrics.computation?.coverage).toBe('partial');
    expect(result.metrics.computation?.partialReasons).toContain('receipt-recovery');
  }, 20_000);

  it.each(['manifestDigest', 'candidateId'] as const)('keeps a committed local edit locked when its recovered receipt has a different %s', async field => {
    const open = storage.openAtlasStorageSession;
    vi.spyOn(storageV1, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args);
      if (session) {
        const local = session.commitLocal.bind(session);
        vi.spyOn(session, 'commitLocal').mockImplementationOnce(async (...localArgs) => {
          const receipt = await local(...localArgs);
          throw new storage.AtlasStorageCommittedError(receipt, new Error('synthetic lost local result'));
        });
      }
      return session;
    });
    const value = client(), initial = await value.create(createOptions), find = storage.findAtlasReceipt;
    const query = vi.spyOn(storageV1, 'findAtlasReceipt').mockImplementationOnce(async (...args) => {
      const receipt = await find(...args);
      if (!receipt) throw new Error('expected durable receipt');
      return { ...receipt, [field]: field === 'manifestDigest' ? 'f'.repeat(64) : crypto.randomUUID() };
    });
    await expect(value.edit(elevation(36), '拒绝未绑定的恢复回执')).rejects.toThrow('事务已经完成');
    expect(query).toHaveBeenCalledTimes(1); expect(LoopWorker.instances[0].closed).toBe(true);
    expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    const stored = await storage.openAtlasDraft(initial.head.draftId);
    expect(stored?.root.revision).toBe(1); expect(stored?.root.backupManifest).toBe(initial.head.manifestDigest);
    const recovered = await client().restore(initial.head.draftId);
    expect(recovered.head.rootDigest).toBe(stored?.root.rootDigest);
    expect(getCellLayerSlot(recovered.data, 'elevation', 0).block.values[0]).toBe(36);
  }, 20_000);

  it('reports a locally committed edit despite cancellation after IDB completion', async () => {
    const open = storage.openAtlasStorageSession, reached = deferred(), gate = deferred();
    vi.spyOn(storageV1, 'openAtlasStorageSession').mockImplementation(async (...args) => {
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
    vi.spyOn(storageV1, 'openAtlasStorageSession').mockImplementation(async (...args) => {
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
    const receiptQuery = vi.spyOn(storageV1, 'findAtlasReceipt').mockRejectedValueOnce(new Error('synthetic receipt read failure'));
    await expect(value.edit(elevation(35), '已完成但无法确认回执')).rejects.toThrow('事务已经完成');
    expect(receiptQuery).toHaveBeenCalledTimes(1); expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    expect(LoopWorker.instances[0].closed).toBe(true);
    await expect(value.undo()).rejects.toThrow('事务已经完成');
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.revision).toBe(1);
  }, 20_000);

  it('also locks initialization after a completed full commit whose receipt lookup fails', async () => {
    const commit = storage.commitAtlasPreparation;
    vi.spyOn(storageV1, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => {
      const receipt = await commit(...args);
      throw new storage.AtlasStorageCommittedError(receipt, new Error('synthetic completed creation failure'));
    });
    vi.spyOn(storageV1, 'findAtlasReceipt').mockRejectedValueOnce(new Error('synthetic receipt read failure'));
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
    vi.spyOn(storageV1, 'stageAtlasBlocks').mockImplementationOnce(async (...args) => { reached.release(); await gate.promise; return stage(...args); });
    const pending = value.fork('应取消的副本'), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await reached.promise; value.cancel(); await nextTask(); gate.release(); await rejected;
    expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    expect(await value.list()).toHaveLength(1);
  }, 20_000);

  it('reports a commit that completed before a late cancellation as successfully committed', async () => {
    const value = client(), reached = deferred(), gate = deferred(), commit = storage.commitAtlasPreparation;
    vi.spyOn(storageV1, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => { const receipt = await commit(...args); reached.release(); await gate.promise; return receipt; });
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
    const spy = vi.spyOn(storageV1, 'commitAtlasPreparation').mockImplementationOnce(async (...args) => { await commit(...args); throw new Error('synthetic lost storage completion'); });
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

  it('waits for the bound timing packet before publishing, and counts its actual wire bytes', async () => {
    const value = client(), initial = await value.create(createOptions), worker = LoopWorker.instances[0], reached = deferred(), gate = deferred();
    worker.packets.length = 0; worker.holdTiming = { seen: reached.release, release: gate.promise };
    let settled = false; const pending = value.edit(elevation(71), '等待计算诊断'); void pending.then(() => { settled = true; });
    await reached.promise; await nextTask(); expect(settled).toBe(false); expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    gate.release(); const edited = await pending;
    expect(edited.head.revision).toBe(1);
    expect(worker.packets.filter(row => row.direction === 'response').map(row => row.type).slice(-2)).toEqual(['complete', 'timing']);
    expect(edited.metrics.responseBytes).toBe(worker.packets.filter(row => row.direction === 'response').reduce((sum, row) => sum + row.bytes, 0));
    expect(edited.metrics.requestBytes).toBe(worker.packets.filter(row => row.direction === 'request').reduce((sum, row) => sum + row.bytes, 0));
  }, 20_000);

  it.each(['missing', 'wrong-root'] as const)('a %s timing packet locks the client without pretending the durable edit failed', async fault => {
    const value = client({ timeoutMs: 1000 }), initial = await value.create(createOptions), worker = LoopWorker.instances[0];
    if (fault === 'missing') worker.dropTiming = true; else worker.timingFault = 'root';
    await expect(value.edit(elevation(72), '已持久化诊断异常')).rejects.toThrow(fault === 'missing' ? '草稿已提交，但计算诊断回执缺失' : '草稿计算诊断未绑定已完成提交');
    expect(worker.closed).toBe(true); expect(value.head?.rootDigest).toBe(initial.head.rootDigest);
    await expect(value.undo()).rejects.toThrow();
    expect((await storage.openAtlasDraft(initial.head.draftId))?.root.revision).toBe(1);
  }, 20_000);

  it('records inconsistent timing as invalid without undoing a valid committed edit', async () => {
    const value = client(); await value.create(createOptions); LoopWorker.instances[0].timingFault = 'total';
    const edited = await value.edit(elevation(73), '数值诊断无效但世界有效');
    expect(edited.head.revision).toBe(1); expect(edited.metrics.computation?.coverage).toBe('invalid');
    expect(edited.metrics.computation?.invalidReasons).toContain('reported-observedComputeMs-mismatch');
    expect(LoopWorker.instances[0].closed).toBe(false);
  }, 20_000);
});

const macroRecipe: MacroRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed: 'ph06-worker-generation', parameters: { majorContinents: 3, landCoveragePermille: 400, coastWavelengthWorld: 384, reliefMeters: 2400 } };
async function databaseSnapshot(format: 1 | 2) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(format === 1 ? 'lieguoji-atlas-drafts-v1' : 'lieguoji-atlas-drafts-v2'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { const names = [...db.objectStoreNames]; return await new Promise<Record<string, unknown[]>>((resolve, reject) => { const tx = db.transaction(names, 'readonly'), result: Record<string, unknown[]> = {}; for (const name of names) { const request = tx.objectStore(name).getAll(); request.onsuccess = () => { result[name] = request.result; }; } tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
describe('PH06 production generation preview and durable boundaries', () => {
  it('previews real terrain without writing any store, rejects interleaved edits, then discards to the exact baseline', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), before = await databaseSnapshot(2), original = cloneAtlasDocument(initial.data);
    const p = await c.previewGeneration(macroRecipe);
    expect(p.preview.summary.majorComponentCount).toBe(3); expect(p.preview.summary.changedCellCount).toBeGreaterThan(1000);
    expect(c.current).toBe(initial); expect(c.head?.rootDigest).toBe(initial.head.rootDigest);
    expect(await databaseSnapshot(2)).toEqual(before); expect(c.current?.data).toEqual(original);
    await expect(c.edit(elevation(777), '预览中禁止写入')).rejects.toThrow('预览');
    p.preview.candidateId = crypto.randomUUID(); p.preview.manifestDigest = '0'.repeat(64);
    await c.discardGeneration(); expect(c.pendingGeneration).toBeNull(); expect(await databaseSnapshot(2)).toEqual(before);
    expect(LoopWorker.instances[0].packets.every(row => row.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
  }, 60_000);
  it('keeps pre-generation edits in undo order across generation, local edit, two kinds of undo and fresh restore', async () => {
    const c = client({ format: 2 }); await c.create(createOptions);
    const beforeGeneration = await c.edit(elevation(511), '生成前局部修改'), baseline = cloneAtlasDocument(beforeGeneration.data);
    const p = await c.previewGeneration(macroRecipe), expected = cloneAtlasDocument(p.data);
    const generated = await c.confirmGeneration(); expect(generated.head.revision).toBe(2); expect(generated.head.undoCount).toBe(2); expect(generated.data).toEqual(expected);
    const originalHeight = getCellLayerSlot(generated.data, 'elevation', 0).block.values[0];
    await c.edit(elevation(originalHeight === 999 ? 1000 : 999), '生成后修改'); const localUndo = await c.undo();
    expect(localUndo.head.revision).toBe(4); expect(localUndo.data.blocks).toEqual(expected.blocks);
    const generationUndo = await c.undo(); expect(generationUndo.head).toMatchObject({ revision: 5, undoCount: 1 }); expect(generationUndo.data.blocks).toEqual(baseline.blocks);
    expect(isGenerationDocument(generationUndo.data) && generationUndo.data.manifest.generation.lastApplied).toBeNull();
    const restored = await client({ format: 2 }).restore(generationUndo.head.draftId); expect(restored.data).toEqual(generationUndo.data);
    const priorUndo = await c.undo(); expect(priorUndo.head).toMatchObject({ revision: 6, undoCount: 0 }); expect(getCellLayerSlot(priorUndo.data, 'elevation', 0).block.values[0]).toBe(-100);
  }, 60_000);
  it('copies the explicitly selected old backup into v2 and preserves all six old stores', async () => {
    const c = client(), first = await c.create(createOptions); await c.edit(elevation(400), '建立不同主备');
    await c.restore(first.head.draftId, 'backup'); const source = await databaseSnapshot(1);
    const copy = await c.generationCopy('旧备份创世副本'); expect(copy.head.draftId).not.toBe(first.head.draftId); expect(copy.data.manifest.atlasId).toBe(first.data.manifest.atlasId);
    expect(isGenerationDocument(copy.data)).toBe(true); if (!isGenerationDocument(copy.data)) throw new Error('missing v2');
    expect(copy.data.manifest.origin).toMatchObject({ sourceSlot: 'backup', sourceFormat: 1, sourceManifestRevision: 0, sourceManifestDigest: first.head.manifestDigest });
    expect(getCellLayerSlot(copy.data, 'elevation', 0).block.values[0]).toBe(-100); expect(await databaseSnapshot(1)).toEqual(source);
    await c.previewGeneration(macroRecipe); await c.discardGeneration(); expect(await databaseSnapshot(1)).toEqual(source);
  }, 60_000);
  it('cancels during actual generation work and retains the complete database baseline', async () => {
    let cancelGeneration = false; const c = client({ format: 2, onProgress: () => { if (cancelGeneration) { cancelGeneration = false; c.cancel(); } } });
    await c.create(createOptions); const before = await databaseSnapshot(2); cancelGeneration = true;
    await expect(c.previewGeneration(macroRecipe)).rejects.toMatchObject({ name: 'AbortError' }); expect(await databaseSnapshot(2)).toEqual(before); expect(c.pendingGeneration).toBeNull();
  }, 60_000);
  it('refuses confirming an obsolete candidate after another tab saved, without replacing that tab state', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), other = client({ format: 2 }); await other.restore(initial.head.draftId);
    await c.previewGeneration(macroRecipe); const concurrent = await other.edit(elevation(987), '另一标签修改');
    await expect(c.confirmGeneration()).rejects.toThrow(); const root = await storage.getAtlasStorage(2).openAtlasDraft(initial.head.draftId); expect(root?.root.rootDigest).toBe(concurrent.head.rootDigest);
    expect(c.current?.head.rootDigest).toBe(initial.head.rootDigest); await c.discardGeneration();
  }, 60_000);
  it('locks the client after corrupt candidate transport and never writes the preview', async () => {
    const c = client({ format: 2 }); await c.create(createOptions); const before = await databaseSnapshot(2); LoopWorker.instances[0].corruptBlock = true;
    await expect(c.previewGeneration(macroRecipe)).rejects.toThrow('地理块解码后未通过字段或所有者核验。'); expect(await databaseSnapshot(2)).toEqual(before); expect(LoopWorker.instances[0].closed).toBe(true);
  }, 60_000);
  it('resolves a lost post-commit response from the original command identity and refreshes the real generated terrain', async () => {
    const c = client({ format: 2 }); await c.create(createOptions); const p = await c.previewGeneration(macroRecipe); LoopWorker.instances[0].dropInitializationCompletion = true;
    await expect(c.confirmGeneration()).rejects.toThrow('generation receipt');
    const recovery = client({ format: 2 }), receipt = await recovery.receipt(c.lastCommand!.draftId!, p.preview.commandId); expect(receipt?.manifestDigest).toBe(p.preview.manifestDigest);
    const restored = await recovery.restore(c.lastCommand!.draftId!); expect(restored.data).toEqual(p.data); expect(restored.head.revision).toBe(1);
  }, 60_000);
});

describe('PH06 confirmation and format-specific recovery', () => {
  it('returns the original durable receipt for a repeated generation confirmation without any extra store writes', async () => {
    const c = client({ format: 2 }); await c.create(createOptions); const p = await c.previewGeneration(macroRecipe); const confirmed = await c.confirmGeneration(), before = await databaseSnapshot(2), worker = LoopWorker.instances[0];
    const repeated = new Promise<Record<string, unknown>>(resolve => {
      const original = worker.onmessage; worker.onmessage = event => { original?.(event); const packet = decodeAtlasPacket(event.data); if (packet.header.id === 9001 && packet.header.type === 'complete') resolve(packet.header.body as Record<string, unknown>); };
    });
    const bytes = encodeAtlasPacket({ version: 1, id: 9001, type: 'request', body: { type: 'generation-confirm', atlasFormat: 2, candidateId: p.preview.candidateId, commandId: p.preview.commandId, previewDigest: p.preview.previewDigest, expectedRevision: p.preview.baseRevision, expectedRootDigest: p.preview.baseRootDigest } });
    worker.postMessage(bytes, [bytes.buffer]);
    await expect(repeated).resolves.toMatchObject({ operation: 'generation-receipt', receipt: { commandId: p.preview.commandId, candidateId: p.preview.candidateId, rootDigest: confirmed.head.rootDigest, committed: true } });
    expect(await databaseSnapshot(2)).toEqual(before); expect(c.head?.rootDigest).toBe(confirmed.head.rootDigest);
  }, 60_000);
  it('resolves a lost v2 local commit from v2 receipts and explicitly lists the separate old catalogue', async () => {
    const api = storage.getAtlasStorage(2), open = api.openAtlasStorageSession; let commits = 0;
    vi.spyOn(api, 'openAtlasStorageSession').mockImplementation(async (...args) => {
      const session = await open(...args); if (session) { const local = session.commitLocal.bind(session); vi.spyOn(session, 'commitLocal').mockImplementation(async (...localArgs) => { const receipt = await local(...localArgs); if (++commits === 1) throw new storage.AtlasStorageCommittedError(receipt, new Error('synthetic v2 local completion loss')); return receipt; }); } return session;
    });
    const old = client(), legacy = await old.create({ ...createOptions, name: '独立旧目录' });
    const c = client({ format: 2 }), initial = await c.create(createOptions), result = await c.edit(elevation(678), 'v2已提交回执丢失');
    expect(commits).toBe(1); expect(result.head.revision).toBe(1); expect((await api.openAtlasDraft(initial.head.draftId))?.root.backupManifest).toBe(initial.head.manifestDigest);
    expect((await c.list(1)).map(row => row.draftId)).toEqual([legacy.head.draftId]); expect((await c.list(2)).map(row => row.draftId)).toEqual([initial.head.draftId]);
  }, 30_000);
});

const landformRecipe: LandformRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'landforms', version: 1, fingerprint: LANDFORM_GENERATOR_FINGERPRINT }, seed: 'ph06-worker-landforms', parameters: { mountainRanges: 2, basins: 1, reliefMeters: 1800 } };
describe('PH06 independent landform preview and preserved locked coastline', () => {
  it('preserves actual locked land and geometry through preview, cancel, durable confirm, restore and full undo', async () => {
    const control = { yieldTask: async () => {} }, data = await createGenerationDraft(createOptions, control), api = storage.getAtlasStorage(2);
    for (let row = 20; row < 108; row++) for (let column = 20; column < 108; column++) {
      const slot = getCellLayerSlot(data, 'elevation', row * 128 + column); slot.block.values[slot.slot] = 600;
    }
    for (const ref of data.manifest.blockRefs) ref.hash = await hashBlock(data.blocks.get(ref.key)!);
    const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 1, by: 1, flags: new Uint8Array(1024).fill(1) };
    lock.flags[16 * 32 + 16] = 3; data.locks.set(lockKey(1, 1), lock); data.manifest.constraints.lockRefs.push({ bx: 1, by: 1, hash: await hashAtlasCellLockBlock(lock) });
    const prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: 'edit-' + crypto.randomUUID(), manifest: data.manifest, expectedRoot: null }, control);
    const all = [...data.blocks.values(), ...data.locks.values()];
    for (let offset = 0; offset < all.length; offset += 16) await api.stageAtlasBlocks(prep.preparationId, all.slice(offset, offset + 16), control);
    await api.commitAtlasPreparation(prep.preparationId, control);
    const c = client({ format: 2 }), initial = await c.restore(data.manifest.draftId), originalDatabase = await databaseSnapshot(2);
    const first = await c.previewGeneration(landformRecipe);
    expect(first.preview.summary.landforms).toMatchObject({ mountainRanges: 2, basins: 1, requestedMountainRanges: 2, requestedBasins: 1 });
    expect(first.preview.summary.changedCellCount).toBeGreaterThan(100);
    expect(first.preview.summary.landforms!.raisedCellCount).toBeGreaterThan(0); expect(first.preview.summary.landforms!.loweredCellCount).toBeGreaterThan(0);
    expect(await databaseSnapshot(2)).toEqual(originalDatabase); expect(c.head?.rootDigest).toBe(initial.head.rootDigest);
    for (let id = 0; id < 128 * 128; id++) {
      const before = getCellLayerSlot(data, 'elevation', id), after = getCellLayerSlot(first.data, 'elevation', id);
      expect(after.block.values[after.slot] >= 0).toBe(before.block.values[before.slot] >= 0);
      if (before.block.values[before.slot] < 0 || id === 48 * 128 + 48) expect(after.block.values[after.slot]).toBe(before.block.values[before.slot]);
    }
    for (const [key, block] of data.blocks) if (block.layer !== 'elevation') expect(first.data.blocks.get(key)).toEqual(block);
    expect(isGenerationDocument(first.data) && first.data.locks).toEqual(data.locks);
    await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(originalDatabase);
    const second = await c.previewGeneration(landformRecipe); expect(second.data.blocks).toEqual(first.data.blocks);
    const confirmed = await c.confirmGeneration(); expect(confirmed.head.revision).toBe(1);
    expect(isGenerationDocument(confirmed.data) && confirmed.data.manifest.generation.lastApplied?.recipe).toEqual(landformRecipe);
    const restored = await client({ format: 2 }).restore(data.manifest.draftId); expect(restored.data).toEqual(confirmed.data);
    const undone = await c.undo(); expect(undone.head.revision).toBe(2); expect(undone.data.blocks).toEqual(data.blocks); expect(isGenerationDocument(undone.data) && undone.data.locks).toEqual(data.locks);
    expect((await api.openAtlasDraft(data.manifest.draftId))?.manifest.revision).toBe(2);
  }, 90000);
  it('explains missing land without changing the saved ocean and supports later valid generation', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), before = await databaseSnapshot(2);
    await expect(c.previewGeneration(landformRecipe)).rejects.toThrow('可修改区域');
    expect(await databaseSnapshot(2)).toEqual(before); expect(c.head?.rootDigest).toBe(initial.head.rootDigest); expect(c.pendingGeneration).toBeNull();
    await c.previewGeneration(macroRecipe); await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before);
  }, 60000);
});

const islandRecipe: IslandRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'island-chains', version: 1, fingerprint: ISLAND_GENERATOR_FINGERPRINT }, seed: 'ph06-worker-islands', parameters: { chainCount: 1, islandsPerChain: 3, radiusWorld: 80, reliefMeters: 1500 } };
const coastRecipe: CoastRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'coast-smoothing', version: 1, fingerprint: COAST_GENERATOR_FINGERPRINT }, parameters: { strengthPermille: 1000, iterations: 3 } };
describe('PH06 island chains and real coast geometry durable integration', () => {
  it('creates three actual islands, smooths their shared coast geometry, restores, then undoes both operations to the saved ocean', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), ocean = cloneAtlasDocument(initial.data), savedOcean = await databaseSnapshot(2);
    const islands = await c.previewGeneration(islandRecipe);
    expect(islands.preview.summary.islands).toMatchObject({ chainCount: 1, newIslandCount: 3, originalComponentCount: 0 });
    expect(islands.preview.summary.majorComponentCount).toBe(3); expect(await databaseSnapshot(2)).toEqual(savedOcean);
    await c.confirmGeneration(); const savedIslands = cloneAtlasDocument(c.current!.data), islandDatabase = await databaseSnapshot(2);
    const coast = await c.previewGeneration(coastRecipe);
    expect(coast.preview.recipe).toEqual(coastRecipe); expect(coast.preview.summary.coast?.changedVertexCount).toBeGreaterThan(0);
    expect(coast.preview.summary.majorComponentCount).toBe(3); expect(await databaseSnapshot(2)).toEqual(islandDatabase);
    for (const [key, block] of savedIslands.blocks) if (block.layer !== 'geometry') expect(coast.data.blocks.get(key)).toEqual(block);
    await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(islandDatabase);
    const second = await c.previewGeneration(coastRecipe); expect(second.data.blocks).toEqual(coast.data.blocks);
    const smoothed = await c.confirmGeneration(); expect(smoothed.head.revision).toBe(2);
    expect(isGenerationDocument(smoothed.data) && smoothed.data.manifest.generation.lastApplied?.recipe).toEqual(coastRecipe);
    const fresh = await client({ format: 2 }).restore(initial.head.draftId); expect(fresh.data).toEqual(smoothed.data);
    const coastUndo = await c.undo(); expect(coastUndo.head.revision).toBe(3); expect(coastUndo.data.blocks).toEqual(savedIslands.blocks);
    expect(isGenerationDocument(coastUndo.data) && coastUndo.data.manifest.generation.lastApplied?.recipe).toEqual(islandRecipe);
    const islandsUndo = await c.undo(); expect(islandsUndo.head.revision).toBe(4); expect(islandsUndo.data.blocks).toEqual(ocean.blocks);
    expect(isGenerationDocument(islandsUndo.data) && islandsUndo.data.manifest.generation.lastApplied).toBeNull();
    expect((await client({ format: 2 }).restore(initial.head.draftId)).data.blocks).toEqual(ocean.blocks);
  }, 90000);
  it('shows zero coastline changes on an empty ocean and discards without claiming any saved modification', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), before = await databaseSnapshot(2);
    const coast = await c.previewGeneration(coastRecipe);
    expect(coast.preview.summary.coast).toMatchObject({ coastlineEdges: 0, changedVertexCount: 0, iterationsApplied: 0 });
    expect(coast.data.blocks).toEqual(initial.data.blocks); expect(await databaseSnapshot(2)).toEqual(before);
    await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before); expect(c.head?.revision).toBe(0);
  }, 60000);
});

describe('PH06 candidate hashing cancellation', () => {
  it('observes cancellation during actual final candidate hashing before any durable preparation exists', async () => {
    let reached = false;
    const c = client({ format: 2, onProgress: progress => { if (!reached && progress.stage === '核验候选地理块' && progress.completed > 0) { reached = true; c.cancel(); } } });
    const initial = await c.create(createOptions), before = await databaseSnapshot(2);
    await expect(c.previewGeneration(islandRecipe)).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(c.pendingGeneration).toBeNull(); expect(c.head?.rootDigest).toBe(initial.head.rootDigest); expect(await databaseSnapshot(2)).toEqual(before);
    const second = await c.previewGeneration(islandRecipe); expect(second.preview.summary.islands?.newIslandCount).toBe(3); await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before);
  }, 60000);
});

const cellHeight = (data: AtlasDocument, id: number) => { const slot = getCellLayerSlot(data, 'elevation', id); return slot.block.values[slot.slot]; };
const cellLocks = (data: AtlasDocument, id: number) => { if (!isGenerationDocument(data)) throw new Error('expected v2'); return atlasCellLockFlags(data, id); };
function directRequest(worker: LoopWorker, id: number, operation: AtlasOperation) {
  const response = new Promise<ReturnType<typeof decodeAtlasPacket>>(resolve => {
    const original = worker.onmessage;
    worker.onmessage = event => { original?.(event); const packet = decodeAtlasPacket(event.data); if (packet.header.id === id && ['complete', 'error'].includes(packet.header.type)) { worker.onmessage = original; resolve(packet); } };
  });
  const bytes = encodeAtlasPacket({ version: 1, id, type: 'request', body: operation }); worker.postMessage(bytes, [bytes.buffer]); return response;
}

describe('PH06 constraints through real Worker transport and IDB', () => {
  it('sets both lock bits, clears only exact elevation, restores and mixed-undo returns every earlier geography and lock state', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), rectangle = { column: 0, row: 0, columns: 2, rows: 2 };
    await c.edit(elevation(600), '锁定之前的陆地'); const before = await databaseSnapshot(2), geography = cloneAtlasDocument(c.current!.data);
    const discarded = await c.previewConstraints(rectangle, 3, 'set'); expect(discarded.preview.changedCellCount).toBe(4); expect(await databaseSnapshot(2)).toEqual(before);
    expect(c.current!.data).toEqual(geography); await c.discardConstraints(); expect(await databaseSnapshot(2)).toEqual(before);
    const p = await c.previewConstraints(rectangle, 3, 'set');
    p.preview.mask = 1; p.preview.action = 'clear'; p.preview.rectangle.columns = 128;
    if (!isGenerationDocument(p.data)) throw new Error('expected v2'); p.data.locks.get(lockKey(0, 0))!.flags.fill(0);
    const locked = await c.confirmConstraints(); expect(locked.head).toMatchObject({ revision: 2, undoCount: 2 });
    expect(locked.data.blocks).toEqual(geography.blocks); expect(cellLocks(locked.data, 0)).toBe(3); expect(cellLocks(locked.data, 2)).toBe(0);
    await expect(c.edit(elevation(700), '准确高程锁拒绝')).rejects.toThrow('锁');
    await expect(c.previewGeneration(macroRecipe)).rejects.toThrow(/锁定|区域锁/);
    await c.previewConstraints(rectangle, 2, 'clear'); const cleared = await c.confirmConstraints();
    expect(cleared.head.revision).toBe(3); expect(cellLocks(cleared.data, 0)).toBe(1); expect(cleared.data.blocks).toEqual(geography.blocks);
    const edited = await c.edit(elevation(700), '解高程锁后仍是陆地'); expect(edited.head.revision).toBe(4);
    const saved = await databaseSnapshot(2); await expect(c.edit(elevation(-5), '海岸锁拒绝变海')).rejects.toThrow('锁'); expect(await databaseSnapshot(2)).toEqual(saved);
    expect((await client({ format: 2 }).restore(initial.head.draftId)).data).toEqual(edited.data);
    const editUndo = await c.undo(); expect(editUndo.head.revision).toBe(5); expect(cellHeight(editUndo.data, 0)).toBe(600); expect(cellLocks(editUndo.data, 0)).toBe(1);
    const clearUndo = await c.undo(); expect(clearUndo.head.revision).toBe(6); expect(cellLocks(clearUndo.data, 0)).toBe(3);
    const lockUndo = await c.undo(); expect(lockUndo.head.revision).toBe(7); expect(cellLocks(lockUndo.data, 0)).toBe(0); expect(lockUndo.data.blocks).toEqual(geography.blocks);
    const originalUndo = await c.undo(); expect(originalUndo.head).toMatchObject({ revision: 8, undoCount: 0 }); expect(originalUndo.data.blocks).toEqual(initial.data.blocks);
    expect((await client({ format: 2 }).restore(initial.head.draftId)).data).toEqual(originalUndo.data);
  }, 90_000);

  it('cancels actual lock computation without changing any store and leaves a subsequent preview usable', async () => {
    let armed = false, reached = false;
    const c = client({ format: 2, onProgress: progress => { if (armed && progress.stage === '计算选区锁定变化') { armed = false; reached = true; c.cancel(); } } });
    const initial = await c.create(createOptions), before = await databaseSnapshot(2); armed = true;
    await expect(c.previewConstraints({ column: 0, row: 0, columns: 128, rows: 128 }, 3, 'set')).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(c.pendingConstraints).toBeNull(); expect(c.head?.rootDigest).toBe(initial.head.rootDigest); expect(await databaseSnapshot(2)).toEqual(before);
    await c.previewConstraints({ column: 31, row: 31, columns: 2, rows: 2 }, 1, 'set'); await c.discardConstraints(); expect(await databaseSnapshot(2)).toEqual(before);
  }, 30_000);

  it('replays only the exact confirmed lock receipt and rejects changed confirmation identity without another write', async () => {
    const c = client({ format: 2 }); await c.create(createOptions);
    const p = await c.previewConstraints({ column: 31, row: 31, columns: 2, rows: 2 }, 3, 'set'), confirmed = await c.confirmConstraints(), before = await databaseSnapshot(2);
    const operation: Extract<AtlasOperation, { type: 'constraints-confirm' }> = { type: 'constraints-confirm', atlasFormat: 2, candidateId: p.preview.candidateId,
      commandId: p.preview.commandId, previewDigest: p.preview.previewDigest, expectedRevision: p.preview.baseRevision, expectedRootDigest: p.preview.baseRootDigest };
    const replay = await directRequest(LoopWorker.instances[0], 9101, operation);
    expect(replay.header).toMatchObject({ type: 'complete', body: { operation: 'constraints-receipt', receipt: { candidateId: p.preview.candidateId, commandId: p.preview.commandId, rootDigest: confirmed.head.rootDigest, committed: true } } });
    const rejected = await directRequest(LoopWorker.instances[0], 9102, { ...operation, previewDigest: '0'.repeat(64) });
    expect(rejected.header).toMatchObject({ type: 'error', body: { committed: false, fatal: false } }); expect((rejected.header.body as { message: string }).message).toContain('重复确认');
    expect(await databaseSnapshot(2)).toEqual(before); expect(c.head?.rootDigest).toBe(confirmed.head.rootDigest);
  }, 30_000);

  it('refuses v1 and read-only lock edits without creating or modifying their storage domains', async () => {
    const legacy = client(), old = await legacy.create(createOptions), oldBytes = await databaseSnapshot(1), requests = LoopWorker.instances[0].packets.length;
    await expect(legacy.previewConstraints({ column: 0, row: 0, columns: 1, rows: 1 }, 1, 'set')).rejects.toThrow('请先打开可编辑的创世草稿。');
    expect(LoopWorker.instances[0].packets).toHaveLength(requests); expect(await databaseSnapshot(1)).toEqual(oldBytes);
    expect((await indexedDB.databases()).map(db => db.name)).not.toContain('lieguoji-atlas-drafts-v2');
    const c = client({ format: 2 }), fresh = await c.create(createOptions); await c.edit(elevation(600), '创建备份'); await c.restore(fresh.head.draftId, 'backup');
    const saved = await databaseSnapshot(2); await expect(c.previewConstraints({ column: 0, row: 0, columns: 1, rows: 1 }, 1, 'set')).rejects.toThrow('可编辑');
    expect(await databaseSnapshot(2)).toEqual(saved); expect((await storage.openAtlasDraft(old.head.draftId))?.root.currentManifest).toBe(old.head.manifestDigest);
  }, 30_000);
});

async function persistLocalScopeFixture() {
  const control = { yieldTask: async () => {} }, data = await createGenerationDraft({ ...createOptions, seed: 'local-scope-worker-fixture' }, control), api = storage.getAtlasStorage(2);
  for (let row = 20; row < 108; row++) for (let column = 20; column < 65 + (row % 4 < 2 ? 1 : 0); column++) {
    const slot = getCellLayerSlot(data, 'elevation', row * 128 + column); slot.block.values[slot.slot] = 1500;
  }
  for (const ref of data.manifest.blockRefs) ref.hash = await hashBlock(data.blocks.get(ref.key)!);
  const prep = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: null }, control);
  const blocks = [...data.blocks.values()]; for (let offset = 0; offset < blocks.length; offset += 16) await api.stageAtlasBlocks(prep.preparationId, blocks.slice(offset, offset + 16), control);
  await api.commitAtlasPreparation(prep.preparationId, control); return data;
}
describe('PH06 local landform and shared-coast durable scopes', () => {
  it.each(['landforms', 'coast'] as const)('persists actual %s scope and changes while preserving every outside quad and the real lock across refresh and undo', async kind => {
    const fixture = await persistLocalScopeFixture(), c = client({ format: 2 }); await c.restore(fixture.manifest.draftId);
    await c.previewConstraints({ column: 48, row: 48, columns: 1, rows: 1 }, 3, 'set'); await c.confirmConstraints();
    const baseline = cloneAtlasDocument(c.current!.data), before = await databaseSnapshot(2);
    const scope: GenerationScope = { kind: 'cell-rectangle', column: 32, row: 32, columns: 64, rows: 64, transitionCells: 4 };
    const recipe = kind === 'landforms' ? { ...landformRecipe, seed: 'local-worker-landforms', parameters: { mountainRanges: 1, basins: 1, reliefMeters: 900 } } : coastRecipe;
    const p = await c.previewGeneration(recipe, scope); expect(p.preview.scope).toEqual(scope); expect(p.preview.summary.changedCellCount).toBeGreaterThan(0);
    if (kind === 'landforms') expect(p.preview.summary.landforms).toMatchObject({ mountainRanges: 1, basins: 1 });
    else expect(p.preview.summary.coast?.changedVertexCount).toBeGreaterThan(0);
    expect(await databaseSnapshot(2)).toEqual(before); expect(cellHeight(p.data, 48 * 128 + 48)).toBe(1500); expect(cellLocks(p.data, 48 * 128 + 48)).toBe(3);
    const changedOutside: number[] = [], changedClassification: number[] = [];
    for (let id = 0; id < 128 * 128; id++) {
      const column = id % 128, row = Math.floor(id / 128), oldHeight = cellHeight(baseline, id), newHeight = cellHeight(p.data, id);
      if ((oldHeight >= 0) !== (newHeight >= 0)) changedClassification.push(id);
      if (column < 32 || column >= 96 || row < 32 || row >= 96) {
        const a = quadQ(baseline, id), b = quadQ(p.data, id);
        if (oldHeight !== newHeight || a.some((point, index) => point[0] !== b[index][0] || point[1] !== b[index][1])) changedOutside.push(id);
      }
    }
    expect(changedOutside).toEqual([]); expect(changedClassification).toEqual([]);
    for (const [key, block] of baseline.blocks) if (block.layer !== (kind === 'landforms' ? 'elevation' : 'geometry')) expect(p.data.blocks.get(key)).toEqual(block);
    const candidate = cloneAtlasDocument(p.data); await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before);
    const repeated = await c.previewGeneration(recipe, scope); expect(repeated.data).toEqual(candidate);
    const confirmed = await c.confirmGeneration(); expect(confirmed.head.revision).toBe(2); expect(confirmed.data).toEqual(candidate);
    expect(isGenerationDocument(confirmed.data) && confirmed.data.manifest.generation.lastApplied).toMatchObject({ recipe, scope, baseRevision: 1, appliedRevision: 2 });
    expect((await client({ format: 2 }).restore(fixture.manifest.draftId)).data).toEqual(confirmed.data);
    const undone = await c.undo(); expect(undone.head.revision).toBe(3); expect(undone.data.blocks).toEqual(baseline.blocks); expect(cellLocks(undone.data, 48 * 128 + 48)).toBe(3);
    expect(isGenerationDocument(undone.data) && undone.data.manifest.generation.lastApplied).toBeNull();
    expect((await client({ format: 2 }).restore(fixture.manifest.draftId)).data).toEqual(undone.data);
  }, 90_000);
});


describe('PH06 drawn outline durable integration', () => {
  it('binds the actual outline to preview, cancel, persisted restore and undo without touching ocean before confirm', async () => {
    const c = client({ format: 2 }), initial = await c.create(createOptions), before = await databaseSnapshot(2);
    const recipe: ShapeRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: 'hand-drawn-worker', parameters: {
      pointsQ: [{xQ:900*256,yQ:900*256},{xQ:2900*256,yQ:1000*256},{xQ:2800*256,yQ:2800*256},{xQ:1900*256,yQ:2200*256},{xQ:1000*256,yQ:2900*256}],
      coastRoughnessWorld: 32, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128,
    } };
    const p = await c.previewGeneration(recipe);
    expect(p.preview.summary.shape?.newLandCellCount).toBeGreaterThan(100); expect(p.preview.recipe).toEqual(recipe);
    expect(await databaseSnapshot(2)).toEqual(before); expect(c.head?.rootDigest).toBe(initial.head.rootDigest);
    for (const [key, block] of initial.data.blocks) if (block.layer !== 'elevation') expect(p.data.blocks.get(key)).toEqual(block);
    await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before);
    const repeat = await c.previewGeneration(recipe); expect(repeat.data.blocks).toEqual(p.data.blocks);
    const confirmed = await c.confirmGeneration(); expect(confirmed.head.revision).toBe(1);
    expect(isGenerationDocument(confirmed.data) && confirmed.data.manifest.generation.lastApplied?.recipe).toEqual(recipe);
    const restored = await client({ format: 2 }).restore(initial.head.draftId); expect(restored.data).toEqual(confirmed.data);
    const undone = await c.undo(); expect(undone.head.revision).toBe(2); expect(undone.data.blocks).toEqual(initial.data.blocks);
    expect(isGenerationDocument(undone.data) && undone.data.manifest.generation.lastApplied).toBeNull();
  }, 90000);
});

describe('PH06 ocean floor durable integration', () => {
  it('keeps land and inland water while binding ocean preview to atomic confirm, refresh and undo', async () => {
    const fixture = await persistLocalScopeFixture(), c = client({ format: 2 }); await c.restore(fixture.manifest.draftId);
    await c.previewConstraints({ column: 1, row: 1, columns: 3, rows: 3 }, 3, 'set'); await c.confirmConstraints();
    const lakeId = 50 * 128 + 40;
    const lakePatch = { elevation: { ids: new Uint32Array([lakeId]), values: new Int32Array([-250]) } };
    const lakePreview = await c.preview(lakePatch, '独立内湖');
    await c.edit(lakePatch, '独立内湖', { revision: lakePreview.baseRevision, rootDigest: lakePreview.baseRootDigest });
    const baseline = cloneAtlasDocument(c.current!.data), before = await databaseSnapshot(2), revision = c.head!.revision;
    const recipe: OceanRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: OCEAN_GENERATOR_FINGERPRINT }, seed: 'ocean-worker', parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } };
    const p = await c.previewGeneration(recipe);
    expect(p.preview.summary.ocean?.changedSeaCellCount).toBeGreaterThan(100); expect(p.preview.recipe).toEqual(recipe);
    expect(p.preview.summary.ocean?.protectedSeaCellCount).toBe(9); expect(cellHeight(p.data, lakeId)).toBe(-250);
    expect(await databaseSnapshot(2)).toEqual(before);
    let changedSea = 0;
    for (let id = 0; id < 128 * 128; id++) {
      const a = cellHeight(baseline, id), b = cellHeight(p.data, id);
      expect(a >= 0).toBe(b >= 0);
      if (a >= 0 || cellLocks(baseline, id)) expect(b).toBe(a);
      if (a !== b) changedSea++;
    }
    expect(changedSea).toBe(p.preview.summary.ocean?.changedSeaCellCount);
    for (const [key, block] of baseline.blocks) if (block.layer !== 'elevation') expect(p.data.blocks.get(key)).toEqual(block);
    await c.discardGeneration(); expect(await databaseSnapshot(2)).toEqual(before);
    const repeat = await c.previewGeneration(recipe); expect(repeat.data).toEqual(p.data);
    const confirmed = await c.confirmGeneration(); expect(confirmed.head.revision).toBe(revision + 1);
    expect(isGenerationDocument(confirmed.data) && confirmed.data.manifest.generation.lastApplied?.recipe).toEqual(recipe);
    expect((await client({ format: 2 }).restore(fixture.manifest.draftId)).data).toEqual(confirmed.data);
    const undone = await c.undo(); expect(undone.head.revision).toBe(revision + 2); expect(undone.data.blocks).toEqual(baseline.blocks);
    expect(isGenerationDocument(undone.data) && undone.data.locks).toEqual(isGenerationDocument(baseline) && baseline.locks);
    expect((await client({ format: 2 }).restore(fixture.manifest.draftId)).data).toEqual(undone.data);
  }, 90000);
});
