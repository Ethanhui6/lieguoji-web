import { encodeDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';
import { createGenerationDraft, createGenerationCopy, encodeAtlasManifest, hashAtlasManifest, isDetailCoastDocument, isGenerationDocument, type AtlasDocument } from './atlas-format';
import { encodeAtlasCellLockBlock, lockKey } from './generation-locks';
import { AtlasGenerationSession, type GenerationPreviewInfo, type GenerationConfirm } from './generation-session';
import { AtlasConstraintsSession, type ConstraintsPreviewInfo } from './constraints-session';
import { blockKey, createAtlasDraft, encodeBlock } from './model';
import { decodeAtlasEditMessage, encodeAtlasEditMessage, OwnedAtlasSession, type AtlasEditDelta, type PreparedAtlasEdit } from './transactions';
import * as storage from './storage';
import type { AtlasBlockPage, AtlasCommitReceipt, AtlasStoredRoot } from './storage-types';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, observeAtlasComputation, type AtlasHead, type AtlasOperation, type AtlasPacket, type AtlasStateHeader, type AtlasTimingLedger } from './protocol';

type Sender = (bytes: Uint8Array, transfer: Transferable[]) => void;
type Active = { id: number; control: AbortController; durable: boolean; sequence: number; started: number; commandId?: string; draftId?: string; timing: AtlasTimingLedger };
type WaitAck = { id: number; sequence: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; sentAt?: number };

/** Only this Worker runtime touches authority and the dedicated atlas database. */
export class AtlasWorkerRuntime {
  private session?: OwnedAtlasSession;
  private generationSession?: AtlasGenerationSession;
  private constraintsSession?: AtlasConstraintsSession;
  private completedGenerations = new Map<string, { confirmation: GenerationConfirm; receipt: AtlasCommitReceipt }>();
  private completedConstraints = new Map<string, { confirmation: GenerationConfirm; receipt: AtlasCommitReceipt }>();
  private sourceSlot: 'current' | 'backup' = 'current';
  private get database() { return storage.getAtlasStorage(this.session?.format ?? 1); }
  private root?: AtlasStoredRoot;
  private storageSession?: storage.AtlasStorageSession;
  private readOnly = false;
  private active?: Active;
  private waiting?: WaitAck;
  constructor(private send: Sender) {}
  close() {
    this.active?.control.abort();
    this.storageSession?.close(); this.storageSession = undefined;
    if (this.waiting) { const wait = this.waiting; this.waiting = undefined; clearTimeout(wait.timer); wait.reject(new Error('草稿线程已终止。')); }
  }
  private post(id: number, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    const started = performance.now();
    const bytes = encodeAtlasPacket({ version: 1, id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    this.send(bytes, [bytes.buffer]);
    if (this.active?.id === id && type !== 'timing') this.active.timing.packetEncodeSendMs += performance.now() - started;
  }
  private async chunk(active: Active, type: 'begin' | 'manifest' | 'block' | 'lock' | 'detail-coast' | 'delta', body?: unknown, payload?: Uint8Array) {
    if (!active.durable) active.control.signal.throwIfAborted();
    const sequence = active.sequence++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = undefined; reject(new Error('草稿接收确认超时，请重新打开后核对持久存档。')); }, 30_000);
      this.waiting = { id: active.id, sequence, resolve, reject, timer };
      try { this.post(active.id, type, body, payload, sequence); if (this.waiting?.id === active.id) this.waiting.sentAt = performance.now(); }
      catch (error) { clearTimeout(timer); this.waiting = undefined; reject(error); }
    });
  }
  private head(): AtlasHead {
    if (!this.session || !this.root) throw new Error('尚未加载草稿。');
    return { ...this.session.head, ...this.session.metadata, readOnly: this.readOnly, hasBackup: this.root.backupManifest !== null };
  }
  receive(input: unknown) {
    const receivedAt = performance.now();
    let packet: ReturnType<typeof decodeAtlasPacket>;
    try { packet = decodeAtlasPacket(input); } catch { return; }
    const decodedAt = performance.now();
    const { header, payload } = packet;
    if (header.type === 'ack') {
      const wait = this.waiting;
      if (wait && wait.id === header.id && wait.sequence === header.sequence) {
        if (this.active?.id === header.id && wait.sentAt !== undefined) this.active.timing.acknowledgements.push({ startMs: wait.sentAt, endMs: receivedAt });
        clearTimeout(wait.timer); this.waiting = undefined; wait.resolve();
      }
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
    const active: Active = { id: header.id, control: new AbortController(), durable: false, sequence: 0, started: receivedAt,
      timing: { startedAt: receivedAt, endedAt: receivedAt, requestDecodeMs: decodedAt - receivedAt, packetEncodeSendMs: 0, ownedPreparation: null, storageCall: null, ownedYields: [], acknowledgements: [], storageTimings: [], partialReasons: [] } };
    this.active = active;
    void this.execute(active, header.body as AtlasOperation, payload).catch(error => {
      this.post(active.id, 'error', { message: error instanceof Error ? error.message : '草稿线程操作失败。', cancelled: error instanceof Error && error.name === 'AbortError', fatal: active.durable, committed: active.durable, draftId: active.draftId, commandId: active.commandId });
    }).finally(() => { if (this.active === active) this.active = undefined; });
  }
  private control(active: Active) {
    return { signal: active.control.signal, onProgress: (progress: { stage: string; completed: number; total: number }) => this.post(active.id, 'progress', progress),
      onTiming: (timing: storage.AtlasStorageTiming) => { active.timing.storageTimings.push(structuredClone(timing)); } };
  }
  private preparationControl(active: Active) {
    return { ...this.control(active), yieldTask: async () => {
      const startMs = performance.now(); await new Promise<void>(resolve => setTimeout(resolve, 0));
      active.timing.ownedYields.push({ startMs, endMs: performance.now() });
    } };
  }
  /** Once IDB completed, cancellation cannot turn verification into a rollback. */
  private durableControl(active: Active) { return { onProgress: this.control(active).onProgress }; }
  private async openStorageSession(active: Active, root: AtlasStoredRoot) {
    active.timing.partialReasons.push('storage-session-open-or-reopen');
    const session = await storage.getAtlasStorage(root.domain === 'atlas-draft-v4' ? 4 : root.domain === 'atlas-draft-v3' ? 3 : root.domain === 'atlas-draft-v2' ? 2 : 1).openAtlasStorageSession(root.draftId, active.durable ? this.durableControl(active) : this.control(active));
    if (!session || session.currentRootDigest !== root.rootDigest) { session?.close(); throw new Error('草稿持久根在载入时已变化，请刷新后重新读取。'); }
    return session;
  }
  private async persist(active: Active, data: AtlasDocument, commandId: string, candidateId: string, expectedRoot: AtlasStoredRoot | null, mode: 'geography' | 'constraints' = 'geography'): Promise<AtlasCommitReceipt> {
    active.timing.partialReasons.push('full-storage-path-not-instrumented');
    active.commandId = commandId; active.draftId = data.manifest.draftId;
    const control = this.control(active), database = storage.getAtlasStorage(data.manifest.version), digest = await hashAtlasManifest(data.manifest);
    try {
      const preparation = await database.prepareAtlasCommit({ candidateId, commandId, manifest: data.manifest, expectedRoot }, control);
      const blocks = [...data.blocks.values(), ...(isGenerationDocument(data) ? data.locks.values() : []), ...(isDetailCoastDocument(data) ? data.detailCoast.values() : [])];
      const encoder = new TextEncoder(), pageBaseBytes = encoder.encode(preparation.preparationId).length;
      let page: typeof blocks = [], pageBytes = pageBaseBytes, staged = 0, sinceYield = 0;
      const checkpoint = async (stage: string, completed: number) => {
        control.onProgress({ stage, completed, total: blocks.length });
        await new Promise<void>(resolve => setTimeout(resolve, 0)); control.signal.throwIfAborted(); sinceYield = 0;
      };
      const stagePage = async () => {
        if (!page.length) return;
        control.signal.throwIfAborted();
        await database.stageAtlasBlocks(preparation.preparationId, page, control);
        staged += page.length; page = []; pageBytes = pageBaseBytes;
        await checkpoint('准备不可变草稿块', staged);
      };
      for (let i = 0; i < blocks.length; i++) {
        control.signal.throwIfAborted();
        const block = blocks[i];
        // The same encoded byte/key/envelope account as storage's public page
        // boundary. A private candidate cannot change while packing yields.
        const item = block.format === 'lieguoji-detail-coast-tile'
          ? { key: detailCoastKey(block.bx, block.by), bytes: encodeDetailCoastTile(block) }
          : block.format === 'lieguoji-atlas-cell-locks'
            ? { key: lockKey(block.bx, block.by), bytes: encodeAtlasCellLockBlock(block) }
            : { key: blockKey(block.layer, block.bx, block.by), bytes: encodeBlock(block) };
        const itemBytes = item.bytes.length + encoder.encode(item.key).length + 128;
        if (pageBaseBytes + itemBytes > storage.ATLAS_STORAGE_PAGE_BYTES) throw new Error('Atlas 单项准备超过 512 KiB，未发布草稿。');
        if (pageBytes + itemBytes > storage.ATLAS_STORAGE_PAGE_BYTES) await stagePage();
        page.push(block); pageBytes += itemBytes; sinceYield++;
        if (sinceYield === 16) await checkpoint('编码不可变草稿页', i + 1);
      }
      await stagePage();
      const receipt = await (mode === 'constraints' ? database.commitAtlasConstraintsPreparation : database.commitAtlasPreparation)(preparation.preparationId, control);
      active.durable = true; return receipt;
    } catch (error) {
      active.timing.partialReasons.push('receipt-recovery');
      if (error instanceof storage.AtlasStorageCommittedError) active.durable = true;
      // A lost completion must be resolved from its durable command, never retried as a new write.
      let receipt: AtlasCommitReceipt | null = null;
      try { receipt = await storage.getAtlasStorage(data.manifest.version).findAtlasReceipt(data.manifest.draftId, commandId); } catch { /* Retain the original failure; do not retry a write. */ }
      if (receipt && receipt.manifestDigest === digest && receipt.candidateId === candidateId) { active.durable = true; return receipt; }
      throw error;
    }
  }
  private async persistLocal(active: Active, data: AtlasDocument, prepared: PreparedAtlasEdit): Promise<AtlasCommitReceipt> {
    if (!this.root) throw new Error('尚未加载持久根。');
    active.commandId = prepared.commandId; active.draftId = data.manifest.draftId;
    if (!this.storageSession?.valid) {
      this.storageSession?.close(); this.storageSession = await this.openStorageSession(active, this.root);
    }
    try {
      const request = { candidateId: prepared.candidateId, commandId: prepared.commandId, manifest: data.manifest, expectedRoot: this.root, dirtyBlocks: [...data.blocks.values()] }, control = this.control(active);
      const startMs = performance.now();
      let receipt: AtlasCommitReceipt;
      try { receipt = await this.storageSession.commitLocal(request, control); }
      finally { active.timing.storageCall = { startMs, endMs: performance.now() }; }
      active.durable = true; return receipt;
    } catch (error) {
      if (error instanceof storage.AtlasStorageFallbackError) return this.persist(active, data, prepared.commandId, prepared.candidateId, this.root);
      active.timing.partialReasons.push('receipt-recovery');
      if (error instanceof storage.AtlasStorageCommittedError) active.durable = true;
      const digest = await hashAtlasManifest(data.manifest);
      let receipt: AtlasCommitReceipt | null = null;
      try { receipt = await storage.getAtlasStorage(data.manifest.version).findAtlasReceipt(data.manifest.draftId, prepared.commandId); } catch { /* Do not turn an uncertain completion into another write. */ }
      if (receipt && receipt.manifestDigest === digest && receipt.candidateId === prepared.candidateId) { active.durable = true; return receipt; }
      throw error;
    }
  }
  private async initialize(active: Active, session: OwnedAtlasSession, root: AtlasStoredRoot, readOnly: boolean, nextStorage?: storage.AtlasStorageSession) {
    const manifest = session.manifest(), manifestBytes = encodeAtlasManifest(manifest), rootBytes = storage.getAtlasStorage(manifest.version).encodeAtlasRoot(root);
    const head: AtlasHead = { ...session.head, atlasId: manifest.atlasId, name: manifest.name, readOnly, hasBackup: root.backupManifest !== null };
    const locks = session.readLocks();
    const begin: AtlasStateHeader = { kind: 'durable', head, root, manifestLength: manifestBytes.length, blockCount: manifest.blockRefs.length, lockCount: locks.length, ...(manifest.version === 4 ? { detailCoastCount: manifest.detailCoast.refs.length } : {}) };
    await this.chunk(active, 'begin', begin);
    for (let offset = 0; offset < manifestBytes.length; offset += ATLAS_FRAGMENT_BYTES) {
      await this.chunk(active, 'manifest', { offset }, manifestBytes.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
    }
    for (let i = 0; i < manifest.blockRefs.length; i++) {
      const ref = manifest.blockRefs[i], [block] = session.readBlocks([ref.key]);
      await this.chunk(active, 'block', { key: ref.key, index: i }, encodeBlock(block));
      if (i % 8 === 7) this.post(active.id, 'progress', { stage: '传输已核验草稿块', completed: i + 1, total: manifest.blockRefs.length });
    }
    for (let index = 0; index < locks.length; index++) { const lock = locks[index]; await this.chunk(active, 'lock', { key: lockKey(lock.bx, lock.by), index }, encodeAtlasCellLockBlock(lock)); }
    if (manifest.version === 4) for (let index = 0; index < manifest.detailCoast.refs.length; index++) {
      const ref = manifest.detailCoast.refs[index], key = detailCoastKey(ref.bx, ref.by);
      const [tile] = session.readDetailCoast([key]);
      await this.chunk(active, 'detail-coast', { key, index }, encodeDetailCoastTile(tile));
      if (index % 16 === 15) this.post(active.id, 'progress', { stage: '传输真实细海岸', completed: index + 1, total: manifest.detailCoast.refs.length });
    }
    if (!active.durable) active.control.signal.throwIfAborted();
    this.storageSession?.close(); this.storageSession = nextStorage;
    if (this.session !== session) { this.generationSession = new AtlasGenerationSession(session); this.constraintsSession = new AtlasConstraintsSession(session); }
    this.session = session; this.root = root; this.readOnly = readOnly; this.sourceSlot = readOnly ? 'backup' : 'current';
    this.post(active.id, 'complete', { operation: 'initialize', head, root, metrics: { workerMs: performance.now() - active.started, rootBytes: rootBytes.length, manifestBytes: manifestBytes.length, deltaBytes: 0 } });
  }
  private async sendGenerationPreview(active: Active, preview: GenerationPreviewInfo | ConstraintsPreviewInfo, kind: 'generation-preview' | 'constraints-preview' = 'generation-preview') {
    const data = await this.session!.replacementDocumentAsync(preview.candidateId, this.control(active)), bytes = encodeAtlasManifest(data.manifest);
    const locks = isGenerationDocument(data) ? [...data.locks.values()] : [];
    await this.chunk(active, 'begin', { kind, preview, manifestLength: bytes.length, blockCount: data.manifest.blockRefs.length, lockCount: locks.length, ...(isDetailCoastDocument(data) ? { detailCoastCount: data.detailCoast.size } : {}) });
    for (let offset = 0; offset < bytes.length; offset += ATLAS_FRAGMENT_BYTES) await this.chunk(active, 'manifest', { offset }, bytes.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
    for (let index = 0; index < data.manifest.blockRefs.length; index++) { const ref = data.manifest.blockRefs[index]; await this.chunk(active, 'block', { key: ref.key, index }, encodeBlock(data.blocks.get(ref.key)!)); if ((index + 1) % 8 === 0 || index + 1 === data.manifest.blockRefs.length) this.post(active.id, 'progress', { stage: '传输已核验生成候选', completed: index + 1, total: data.manifest.blockRefs.length }); }
    for (let index = 0; index < locks.length; index++) { const lock = locks[index]; await this.chunk(active, 'lock', { key: lockKey(lock.bx, lock.by), index }, encodeAtlasCellLockBlock(lock)); }
    if (isDetailCoastDocument(data)) for (let index = 0; index < data.manifest.detailCoast.refs.length; index++) {
      const ref = data.manifest.detailCoast.refs[index], key = detailCoastKey(ref.bx, ref.by);
      await this.chunk(active, 'detail-coast', { key, index }, encodeDetailCoastTile(data.detailCoast.get(key)!));
      if (index % 16 === 15) this.post(active.id, 'progress', { stage: '传输细海岸候选', completed: index + 1, total: data.detailCoast.size });
    }
    active.control.signal.throwIfAborted(); this.post(active.id, 'complete', { operation: kind, preview, metrics: { workerMs: performance.now() - active.started, rootBytes: 0, manifestBytes: bytes.length, deltaBytes: 0 } });
  }
  private async execute(active: Active, operation: AtlasOperation, payload: Uint8Array) {
    if (!operation || typeof operation !== 'object') throw new Error('草稿操作格式无效。');
    if (operation.atlasFormat !== undefined && operation.atlasFormat !== 1 && operation.atlasFormat !== 2 && operation.atlasFormat !== 3 && operation.atlasFormat !== 4) throw new Error('未知草稿格式，未选择其他数据库。');
    const control = this.control(active), database = storage.getAtlasStorage(operation.atlasFormat ?? this.session?.format ?? 1);
    if (this.generationSession?.pending && !['generation-confirm', 'generation-discard', 'receipt', 'list'].includes(operation.type)) throw new Error('请先确认或取消生成预览。');
    if (this.constraintsSession?.pending && !['constraints-confirm', 'constraints-discard', 'receipt', 'list'].includes(operation.type)) throw new Error('请先确认或取消区域锁预览。');
    if (operation.type === 'list') { this.post(active.id, 'complete', { operation: 'list', entries: await database.listAtlasDrafts(control) }); return; }
    if (operation.type === 'receipt') { this.post(active.id, 'complete', { operation: 'receipt', receipt: await database.findAtlasReceipt(operation.draftId, operation.commandId, control) }); return; }
    if (operation.type === 'create') {
      const options = { ...operation.options, draftId: operation.draftId };
      const data = await (database.format === 1 ? createAtlasDraft(options, control) : createGenerationDraft(options, control, database.format));
      const receipt = await this.persist(active, data, operation.commandId, crypto.randomUUID(), null);
      const nextStorage = await this.openStorageSession(active, receipt.root);
      try { const session = await OwnedAtlasSession.open(data, receipt.rootDigest, this.durableControl(active)); await this.initialize(active, session, receipt.root, false, nextStorage); }
      catch (error) { nextStorage.close(); throw error; }
      return;
    }
    if (operation.type === 'restore') {
      if (operation.source !== 'current' && operation.source !== 'backup') throw new Error('草稿恢复来源无效。');
      const nextStorage = operation.source === 'current' ? await database.openAtlasStorageSession(operation.draftId, control) : undefined;
      try {
        const handle = operation.source === 'current' ? nextStorage?.handle : await database.openAtlasDraft(operation.draftId, { ...control, source: 'backup' });
        if (!handle) throw new Error('没有找到该草稿存档。');
        const data = (handle.manifest.version === 4 ? { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() } : handle.manifest.version !== 1 ? { manifest: handle.manifest, blocks: new Map(), locks: new Map() } : { manifest: handle.manifest, blocks: new Map() }) as AtlasDocument; let cursor: number | null = 0;
        while (cursor !== null) {
          const page: AtlasBlockPage = nextStorage ? await nextStorage.readPage(cursor, control) : await database.readAtlasBlockPage(handle, cursor, control);
          for (const block of page.blocks) { const key = blockKey(block.layer, block.bx, block.by); if (data.blocks.has(key)) throw new Error('存档分页出现重复块。'); data.blocks.set(key, block); }
          if (isGenerationDocument(data)) for (const lock of page.locks ?? []) { const key = lockKey(lock.bx, lock.by); if (data.locks.has(key)) throw new Error('存档分页出现重复锁块。'); data.locks.set(key, lock); }
          if (isDetailCoastDocument(data)) for (const tile of page.detailCoast ?? []) { const key = detailCoastKey(tile.bx, tile.by); if (data.detailCoast.has(key)) throw new Error('存档分页出现重复细海岸块。'); data.detailCoast.set(key, tile); }
          cursor = page.nextCursor; control.onProgress({ stage: '读取固定存档根', completed: data.blocks.size + (isGenerationDocument(data) ? data.locks.size : 0) + (isDetailCoastDocument(data) ? data.detailCoast.size : 0), total: data.manifest.blockRefs.length + (isGenerationDocument(data) ? data.manifest.constraints.lockRefs.length : 0) + (isDetailCoastDocument(data) ? data.manifest.detailCoast.refs.length : 0) });
        }
        const session = await OwnedAtlasSession.open(data, handle.root.rootDigest, control);
        await this.initialize(active, session, handle.root, handle.readOnly, nextStorage ?? undefined);
      } catch (error) { nextStorage?.close(); throw error; }
      return;
    }
    if (operation.type === 'generation-confirm' && this.completedGenerations.has(operation.commandId)) {
      const completed = this.completedGenerations.get(operation.commandId)!, c = completed.confirmation;
      if (operation.candidateId !== c.candidateId || operation.previewDigest !== c.previewDigest || operation.expectedRevision !== c.expectedRevision || operation.expectedRootDigest !== c.expectedRootDigest) throw new Error('已提交生成的重复确认与原候选不一致。');
      this.post(active.id, 'complete', { operation: 'generation-receipt', receipt: structuredClone(completed.receipt) }); return;
    }
    if (!this.session || !this.root) throw new Error('请先创建或恢复草稿。');
    if (operation.type === 'constraints-confirm' && this.completedConstraints.has(operation.commandId)) {
      const completed = this.completedConstraints.get(operation.commandId)!, c = completed.confirmation;
      if (operation.candidateId !== c.candidateId || operation.previewDigest !== c.previewDigest || operation.expectedRevision !== c.expectedRevision || operation.expectedRootDigest !== c.expectedRootDigest) throw new Error('已提交区域锁的重复确认与原候选不一致。');
      this.post(active.id, 'complete', { operation: 'constraints-receipt', receipt: structuredClone(completed.receipt) }); return;
    }
    if ((operation.type === 'generation-copy' || operation.type === 'fork') && this.session.format === 4) throw new Error('第四版副本转换尚未实现，原草稿保持不变。');
    if (operation.type === 'generation-copy' || operation.type === 'fork' && this.session.format !== 1) {
      const source = this.session.snapshot(), head = this.session.head;
      const format = operation.type === 'generation-copy' ? operation.targetFormat ?? 2 : this.session.format;
      if (format !== 2 && format !== 3) throw new Error('创世副本目标格式无效。');
      const data = await createGenerationCopy(source, { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: source.manifest.version, sourceDraftId: head.draftId, sourceSlot: this.sourceSlot, sourceManifestDigest: head.manifestDigest, sourceManifestRevision: head.revision, observedRootDigest: this.root.rootDigest }, { draftId: operation.draftId, name: operation.name, format }, control);
      const receipt = await this.persist(active, data, operation.commandId, crypto.randomUUID(), null), nextStorage = await this.openStorageSession(active, receipt.root);
      try { await this.initialize(active, await OwnedAtlasSession.open(data, receipt.rootDigest, this.durableControl(active)), receipt.root, false, nextStorage); }
      catch (error) { nextStorage.close(); throw error; } return;
    }
    if (operation.type === 'fork') {
      const data = this.session.snapshot();
      data.manifest.draftId = operation.draftId; data.manifest.revision = 0;
      data.manifest.name = operation.name ?? `${data.manifest.name.slice(0, 116)} 副本`;
      const receipt = await this.persist(active, data, operation.commandId, crypto.randomUUID(), null);
      const nextStorage = await this.openStorageSession(active, receipt.root);
      try { await this.initialize(active, await OwnedAtlasSession.open(data, receipt.rootDigest, this.durableControl(active)), receipt.root, false, nextStorage); }
      catch (error) { nextStorage.close(); throw error; }
      return;
    }
    if (operation.atlasFormat !== undefined && operation.atlasFormat !== this.session.format) throw new Error('操作格式与当前会话不符。');
    if (this.readOnly) throw new Error('备份来源为只读，请创建独立副本后继续编辑。');
    if (operation.type === 'constraints-preview') {
      let preview: ConstraintsPreviewInfo | undefined;
      try { preview = await this.constraintsSession!.preview(operation.command, control); await this.sendGenerationPreview(active, preview, 'constraints-preview'); }
      catch (error) { if (preview) this.constraintsSession!.discard(preview.candidateId); throw error; } return;
    }
    if (operation.type === 'constraints-discard') { this.constraintsSession!.discard(operation.candidateId); this.post(active.id, 'complete', { operation: 'constraints-discard', candidateId: operation.candidateId }); return; }
    if (operation.type === 'generation-preview') {
      let preview: GenerationPreviewInfo | undefined;
      try { preview = await this.generationSession!.preview(operation.commandId, operation.expectedRevision, operation.expectedRootDigest, operation.recipe, operation.scope, control); await this.sendGenerationPreview(active, preview); }
      catch (error) { if (preview) this.generationSession!.discard(preview.candidateId); throw error; } return;
    }
    if (operation.type === 'generation-discard') { this.generationSession!.discard(operation.candidateId); this.post(active.id, 'complete', { operation: 'generation-discard', candidateId: operation.candidateId }); return; }
    if (operation.type === 'generation-confirm' || operation.type === 'constraints-confirm' || operation.type === 'undo' && this.session.undoKind === 'whole') {
      const undo = operation.type === 'undo';
      const prepared = undo ? await this.session.prepareReplacementUndo(operation.commandId, control) : operation.type === 'constraints-confirm' ? (await this.constraintsSession!.confirm({ candidateId: operation.candidateId, commandId: operation.commandId, previewDigest: operation.previewDigest, expectedRevision: operation.expectedRevision, expectedRootDigest: operation.expectedRootDigest }, control)).preview : (await this.generationSession!.confirm(operation, control)).preview;
      try {
        const data = await this.session.replacementDocumentAsync(prepared.candidateId, control), receipt = await this.persist(active, data, prepared.commandId, prepared.candidateId, this.root, this.session.replacementMode(prepared.candidateId));
        this.session.publishReplacement(prepared.candidateId, receipt); if (operation.type === 'generation-confirm') {
          this.generationSession!.published(prepared.candidateId);
          this.completedGenerations.set(operation.commandId, { confirmation: { candidateId: operation.candidateId, commandId: operation.commandId, previewDigest: operation.previewDigest, expectedRevision: operation.expectedRevision, expectedRootDigest: operation.expectedRootDigest }, receipt: structuredClone(receipt) });
          if (this.completedGenerations.size > 32) this.completedGenerations.delete(this.completedGenerations.keys().next().value!);
        }
        if (operation.type === 'constraints-confirm') {
          this.constraintsSession!.published(prepared.candidateId);
          this.completedConstraints.set(operation.commandId, { confirmation: { candidateId: operation.candidateId, commandId: operation.commandId, previewDigest: operation.previewDigest, expectedRevision: operation.expectedRevision, expectedRootDigest: operation.expectedRootDigest }, receipt: structuredClone(receipt) });
          if (this.completedConstraints.size > 32) this.completedConstraints.delete(this.completedConstraints.keys().next().value!);
        }
        const nextStorage = await this.openStorageSession(active, receipt.root);
        try { await this.initialize(active, this.session, receipt.root, false, nextStorage); } catch (error) { nextStorage.close(); throw error; }
      } catch (error) { if (!active.durable && undo) this.session.discardReplacement(prepared.candidateId); throw error; } return;
    }
    let prepared: PreparedAtlasEdit | undefined;
    try {
      if (operation.type === 'edit' || operation.type === 'preview') {
        const command = decodeAtlasEditMessage(payload); if (command.format !== 'lieguoji-atlas-edit') throw new Error('该操作必须发送编辑请求。');
        active.commandId = command.commandId; active.draftId = command.draftId;
        const startMs = performance.now();
        try { prepared = await this.session.prepare(command, this.preparationControl(active)); }
        finally { active.timing.ownedPreparation = { startMs, endMs: performance.now() }; }
      } else if (operation.type === 'undo') {
        const startMs = performance.now();
        try { prepared = await this.session.prepareUndo(operation.commandId, this.preparationControl(active)); }
        finally { active.timing.ownedPreparation = { startMs, endMs: performance.now() }; }
      }
      else throw new Error('未知草稿操作。');
      if (operation.type === 'preview') {
        this.session.discard(prepared.candidateId); const preview = prepared; prepared = undefined;
        this.post(active.id, 'complete', { operation: 'preview', preview, metrics: { workerMs: performance.now() - active.started, rootBytes: 0, manifestBytes: 0, deltaBytes: 0 } }); return;
      }
      const data = this.session.candidateStorageDocument(prepared.candidateId);
      const receipt = prepared.localBudgetEligible ? await this.persistLocal(active, data, prepared) : await this.persist(active, data, prepared.commandId, prepared.candidateId, this.root);
      if (!this.storageSession?.valid || this.storageSession.currentRootDigest !== receipt.rootDigest) {
        this.storageSession?.close(); this.storageSession = await this.openStorageSession(active, receipt.root);
      }
      const delta: AtlasEditDelta = this.session.publish(prepared.candidateId, receipt), info = prepared; prepared = undefined;
      this.root = receipt.root;
      const bytes = encodeAtlasEditMessage(delta), rootBytes = this.database.encodeAtlasRoot(receipt.root), head = this.head();
      await this.chunk(active, 'delta', { head, root: receipt.root }, bytes);
      this.post(active.id, 'complete', { operation: 'edit', head, root: receipt.root, metrics: { workerMs: performance.now() - active.started, rootBytes: rootBytes.length, manifestBytes: 0, deltaBytes: bytes.length, preparationMs: info.preparationMs, cooperativeYieldMs: info.cooperativeYieldMs, localBudgetEligible: info.localBudgetEligible, writeBlocks: info.writeKeys.length, affectedCells: info.affectedCellCount } });
      active.timing.endedAt = performance.now();
      this.post(active.id, 'timing', { operation: 'edit', commandId: info.commandId, rootDigest: receipt.rootDigest, computation: observeAtlasComputation(active.timing) });
    } catch (error) { if (prepared) this.session.discard(prepared.candidateId); throw error; }
  }
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const runtime = new AtlasWorkerRuntime((bytes, transfer) => self.postMessage(bytes, { transfer }));
  self.onmessage = event => runtime.receive(event.data);
}
