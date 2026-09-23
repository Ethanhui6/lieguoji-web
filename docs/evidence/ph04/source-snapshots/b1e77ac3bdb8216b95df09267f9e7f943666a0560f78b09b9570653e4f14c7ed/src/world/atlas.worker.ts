import { blockKey, createAtlasDraft, encodeBlock, encodeManifest, hashManifest, type AtlasDraftData } from './model';
import { decodeAtlasEditMessage, encodeAtlasEditMessage, OwnedAtlasSession, type AtlasEditDelta, type PreparedAtlasEdit } from './transactions';
import * as storage from './storage';
import type { AtlasCommitReceipt, AtlasStoredRoot } from './storage-types';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, type AtlasHead, type AtlasOperation, type AtlasPacket, type AtlasStateHeader } from './protocol';

type Sender = (bytes: Uint8Array, transfer: Transferable[]) => void;
type Active = { id: number; control: AbortController; durable: boolean; sequence: number; started: number; commandId?: string; draftId?: string };
type WaitAck = { id: number; sequence: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Only this Worker runtime touches authority and the dedicated atlas database. */
export class AtlasWorkerRuntime {
  private session?: OwnedAtlasSession;
  private root?: AtlasStoredRoot;
  private readOnly = false;
  private active?: Active;
  private waiting?: WaitAck;
  constructor(private send: Sender) {}
  close() {
    this.active?.control.abort();
    if (this.waiting) { const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.reject(new Error('草稿线程已终止。')); }
  }
  private post(id: number, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    const bytes = encodeAtlasPacket({ version: 1, id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    this.send(bytes, [bytes.buffer]);
  }
  private async chunk(active: Active, type: 'begin' | 'manifest' | 'block' | 'delta', body?: unknown, payload?: Uint8Array) {
    if (!active.durable) active.control.signal.throwIfAborted();
    const sequence = active.sequence++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = undefined; reject(new Error('草稿接收确认超时，请重新打开后核对持久存档。')); }, 30_000);
      this.waiting = { id: active.id, sequence, resolve, reject, timer };
      try { this.post(active.id, type, body, payload, sequence); }
      catch (error) { clearTimeout(timer); this.waiting = undefined; reject(error); }
    });
  }
  private head(): AtlasHead {
    if (!this.session || !this.root) throw new Error('尚未加载草稿。');
    const head = this.session.head, manifest = this.session.manifest();
    return { ...head, atlasId: manifest.atlasId, name: manifest.name, readOnly: this.readOnly, hasBackup: this.root.backupManifest !== null };
  }
  receive(input: unknown) {
    let packet: ReturnType<typeof decodeAtlasPacket>;
    try { packet = decodeAtlasPacket(input); } catch { return; }
    const { header, payload } = packet;
    if (header.type === 'ack') {
      const wait = this.waiting;
      if (wait && wait.id === header.id && wait.sequence === header.sequence) { clearTimeout(wait.timer); this.waiting = undefined; wait.resolve(); }
      return;
    }
    if (header.type === 'cancel') {
      if (this.active?.id === header.id && !this.active.durable) {
        this.active.control.abort();
        if (this.waiting?.id === header.id) { const wait = this.waiting; clearTimeout(wait.timer); this.waiting = undefined; wait.reject(new DOMException('操作已取消。', 'AbortError')); }
      }
      return;
    }
    if (header.type !== 'request') return;
    if (this.active) { this.post(header.id, 'error', { message: '草稿线程仍有操作进行中。', cancelled: false, fatal: false, committed: false }); return; }
    const active: Active = { id: header.id, control: new AbortController(), durable: false, sequence: 0, started: performance.now() };
    this.active = active;
    void this.execute(active, header.body as AtlasOperation, payload).catch(error => {
      this.post(active.id, 'error', { message: error instanceof Error ? error.message : '草稿线程操作失败。', cancelled: error instanceof Error && error.name === 'AbortError', fatal: active.durable, committed: active.durable, draftId: active.draftId, commandId: active.commandId });
    }).finally(() => { if (this.active === active) this.active = undefined; });
  }
  private control(active: Active) {
    return { signal: active.control.signal, onProgress: (progress: { stage: string; completed: number; total: number }) => this.post(active.id, 'progress', progress) };
  }
  private async persist(active: Active, data: { manifest: AtlasDraftData['manifest']; blocks: AtlasDraftData['blocks'] }, commandId: string, candidateId: string, expectedRoot: AtlasStoredRoot | null): Promise<AtlasCommitReceipt> {
    active.commandId = commandId; active.draftId = data.manifest.draftId;
    const control = this.control(active), digest = await hashManifest(data.manifest);
    try {
      const preparation = await storage.prepareAtlasCommit({ candidateId, commandId, manifest: data.manifest, expectedRoot }, control);
      const blocks = [...data.blocks.values()];
      for (let i = 0; i < blocks.length; i += 8) {
        await storage.stageAtlasBlocks(preparation.preparationId, blocks.slice(i, i + 8), control);
        control.onProgress({ stage: '准备不可变草稿块', completed: Math.min(i + 8, blocks.length), total: blocks.length });
        await new Promise<void>(resolve => setTimeout(resolve, 0)); control.signal.throwIfAborted();
      }
      const receipt = await storage.commitAtlasPreparation(preparation.preparationId, control);
      active.durable = true; return receipt;
    } catch (error) {
      // A lost completion must be resolved from its durable command, never retried as a new write.
      let receipt: AtlasCommitReceipt | null = null;
      try { receipt = await storage.findAtlasReceipt(data.manifest.draftId, commandId); } catch { /* Retain the original failure; do not retry a write. */ }
      if (receipt && receipt.manifestDigest === digest && receipt.candidateId === candidateId) { active.durable = true; return receipt; }
      throw error;
    }
  }
  private async initialize(active: Active, session: OwnedAtlasSession, root: AtlasStoredRoot, readOnly: boolean) {
    const manifest = session.manifest(), manifestBytes = encodeManifest(manifest), rootBytes = storage.encodeAtlasRoot(root);
    const head: AtlasHead = { ...session.head, atlasId: manifest.atlasId, name: manifest.name, readOnly, hasBackup: root.backupManifest !== null };
    const begin: AtlasStateHeader = { head, root, manifestLength: manifestBytes.length, blockCount: manifest.blockRefs.length };
    await this.chunk(active, 'begin', begin);
    for (let offset = 0; offset < manifestBytes.length; offset += ATLAS_FRAGMENT_BYTES) {
      await this.chunk(active, 'manifest', { offset }, manifestBytes.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
    }
    for (let i = 0; i < manifest.blockRefs.length; i++) {
      const ref = manifest.blockRefs[i], [block] = session.readBlocks([ref.key]);
      await this.chunk(active, 'block', { key: ref.key, index: i }, encodeBlock(block));
      if (i % 8 === 7) this.post(active.id, 'progress', { stage: '传输已核验草稿块', completed: i + 1, total: manifest.blockRefs.length });
    }
    if (!active.durable) active.control.signal.throwIfAborted();
    this.session = session; this.root = root; this.readOnly = readOnly;
    this.post(active.id, 'complete', { operation: 'initialize', head, root, metrics: { workerMs: performance.now() - active.started, rootBytes: rootBytes.length, manifestBytes: manifestBytes.length, deltaBytes: 0 } });
  }
  private async execute(active: Active, operation: AtlasOperation, payload: Uint8Array) {
    if (!operation || typeof operation !== 'object') throw new Error('草稿操作格式无效。');
    const control = this.control(active);
    if (operation.type === 'list') { this.post(active.id, 'complete', { operation: 'list', entries: await storage.listAtlasDrafts(control) }); return; }
    if (operation.type === 'receipt') { this.post(active.id, 'complete', { operation: 'receipt', receipt: await storage.findAtlasReceipt(operation.draftId, operation.commandId, control) }); return; }
    if (operation.type === 'create') {
      const data = await createAtlasDraft({ ...operation.options, draftId: operation.draftId }, control);
      const receipt = await this.persist(active, data, operation.commandId, crypto.randomUUID(), null);
      const session = await OwnedAtlasSession.open(data, receipt.rootDigest);
      await this.initialize(active, session, receipt.root, false); return;
    }
    if (operation.type === 'restore') {
      const handle = await storage.openAtlasDraft(operation.draftId, { source: operation.source, signal: control.signal });
      if (!handle) throw new Error('没有找到该草稿存档。');
      const data: AtlasDraftData = { manifest: handle.manifest, blocks: new Map() }; let cursor: number | null = 0;
      while (cursor !== null) {
        const page = await storage.readAtlasBlockPage(handle, cursor, control);
        for (const block of page.blocks) { const key = blockKey(block.layer, block.bx, block.by); if (data.blocks.has(key)) throw new Error('存档分页出现重复块。'); data.blocks.set(key, block); }
        cursor = page.nextCursor; control.onProgress({ stage: '读取固定存档根', completed: data.blocks.size, total: data.manifest.blockRefs.length });
      }
      const session = await OwnedAtlasSession.open(data, handle.root.rootDigest, control);
      await this.initialize(active, session, handle.root, handle.readOnly); return;
    }
    if (!this.session || !this.root) throw new Error('请先创建或恢复草稿。');
    if (operation.type === 'fork') {
      const data = this.session.snapshot();
      data.manifest.draftId = operation.draftId; data.manifest.revision = 0;
      data.manifest.name = operation.name ?? `${data.manifest.name.slice(0, 116)} 副本`;
      const receipt = await this.persist(active, data, operation.commandId, crypto.randomUUID(), null);
      await this.initialize(active, await OwnedAtlasSession.open(data, receipt.rootDigest), receipt.root, false); return;
    }
    if (this.readOnly) throw new Error('备份来源为只读，请创建独立副本后继续编辑。');
    let prepared: PreparedAtlasEdit | undefined;
    try {
      if (operation.type === 'edit' || operation.type === 'preview') {
        const command = decodeAtlasEditMessage(payload); if (command.format !== 'lieguoji-atlas-edit') throw new Error('该操作必须发送编辑请求。');
        active.commandId = command.commandId; active.draftId = command.draftId;
        prepared = await this.session.prepare(command, control);
      } else if (operation.type === 'undo') prepared = await this.session.prepareUndo(operation.commandId, control);
      else throw new Error('未知草稿操作。');
      if (operation.type === 'preview') {
        this.session.discard(prepared.candidateId); const preview = prepared; prepared = undefined;
        this.post(active.id, 'complete', { operation: 'preview', preview, metrics: { workerMs: performance.now() - active.started, rootBytes: 0, manifestBytes: 0, deltaBytes: 0 } }); return;
      }
      const manifest = this.session.candidateManifest(prepared.candidateId), blocks = this.session.candidateBlocks(prepared.candidateId);
      const receipt = await this.persist(active, { manifest, blocks: new Map(blocks.map(block => [blockKey(block.layer, block.bx, block.by), block])) }, prepared.commandId, prepared.candidateId, this.root);
      const delta: AtlasEditDelta = this.session.publish(prepared.candidateId, receipt), info = prepared; prepared = undefined;
      this.root = receipt.root;
      const bytes = encodeAtlasEditMessage(delta), rootBytes = storage.encodeAtlasRoot(receipt.root);
      await this.chunk(active, 'delta', { head: this.head(), root: receipt.root }, bytes);
      this.post(active.id, 'complete', { operation: 'edit', head: this.head(), root: receipt.root, metrics: { workerMs: performance.now() - active.started, rootBytes: rootBytes.length, manifestBytes: 0, deltaBytes: bytes.length, preparationMs: info.preparationMs, cooperativeYieldMs: info.cooperativeYieldMs, localBudgetEligible: info.localBudgetEligible, writeBlocks: info.writeKeys.length, affectedCells: info.affectedCellCount } });
    } catch (error) { if (prepared) this.session.discard(prepared.candidateId); throw error; }
  }
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const runtime = new AtlasWorkerRuntime((bytes, transfer) => self.postMessage(bytes, { transfer }));
  self.onmessage = event => runtime.receive(event.data);
}
