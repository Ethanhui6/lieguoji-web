import { cloneBlock, decodeBlock, decodeManifest, hashBlock, hashManifest, validateAtlasDraft, type AtlasCreateOptions, type AtlasDraftData, type AtlasDraftManifest, type BlockKey } from './model';
import { affectedGeometryCells } from './topology';
import { applyAtlasDelta } from './delta';
import { decodeAtlasEditMessage, encodeAtlasEditMessage, type AtlasEditCommand, type AtlasEditDelta, type AtlasPatch } from './transactions';
import { hashAtlasRoot, validateAtlasRoot } from './storage';
import type { AtlasCommitReceipt, AtlasStoredRoot } from './storage-types';
import { decodeAtlasPacket, encodeAtlasPacket, type AtlasClientView, type AtlasDraftList, type AtlasEditResult, type AtlasHead, type AtlasMetrics, type AtlasOperation, type AtlasPacket, type AtlasPreview, type AtlasProgress, type AtlasStateHeader } from './protocol';

type Result = AtlasClientView | AtlasEditResult | AtlasPreview | AtlasDraftList | AtlasCommitReceipt | null;
type Init = { header: AtlasStateHeader; bytes: Uint8Array; offset: number; manifest?: AtlasDraftManifest; blocks: AtlasDraftData['blocks'] };
type Pending = {
  id: number; operation: AtlasOperation; started: number; requestBytes: number; responseBytes: number; largestPacketBytes: number;
  verificationMs: number; sequence: number; timer: ReturnType<typeof setTimeout>;
  resolve: (value: Result) => void; reject: (error: Error) => void;
  init?: Init; nextData?: AtlasDraftData; nextHead?: AtlasHead; nextRoot?: AtlasStoredRoot; delta?: AtlasEditDelta;
};
export interface AtlasClientOptions { onProgress?: (progress: AtlasProgress) => void; onFatal?: (error: Error) => void; timeoutMs?: number }
const object = (raw: unknown): raw is Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw);

/** Dedicated production draft Worker, with independently verified receive state. */
export class AtlasClient {
  private worker: Worker;
  private serial = 0;
  private fatal?: Error;
  private pending?: Pending;
  private receiveQueue = Promise.resolve();
  private verified?: AtlasDraftData;
  private verifiedHead?: AtlasHead;
  private view: AtlasClientView | null = null;
  private lastIdentity: { draftId?: string; commandId?: string } | null = null;
  private readonly timeoutMs: number;
  constructor(private options: AtlasClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.worker = new Worker(new URL('./atlas.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => {
      const message: unknown = event.data;
      this.receiveQueue = this.receiveQueue.then(() => this.receive(message)).catch(error => this.fail(error instanceof Error ? error : new Error('草稿响应验证失败。')));
    };
    this.worker.onerror = event => this.fail(new Error(event.message || '草稿线程失败，请刷新后恢复持久存档。'));
    this.worker.onmessageerror = () => this.fail(new Error('草稿线程消息无法解码，请刷新后恢复。'));
  }
  get current() { return this.view; }
  get head() { return this.view ? { ...this.view.head } : null; }
  get lastCommand() { return this.lastIdentity ? { ...this.lastIdentity } : null; }
  fail(error: Error) {
    if (this.fatal) return;
    this.fatal = error; this.worker.terminate();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    this.options.onFatal?.(error);
  }
  close() { this.fail(new Error('草稿线程已关闭。')); }
  private send(pending: Pending, type: AtlasPacket['type'], body?: unknown, payload?: Uint8Array, sequence?: number) {
    const bytes = encodeAtlasPacket({ version: 1, id: pending.id, type, ...(body === undefined ? {} : { body }), ...(sequence === undefined ? {} : { sequence }) }, payload);
    pending.requestBytes += bytes.length; pending.largestPacketBytes = Math.max(pending.largestPacketBytes, bytes.length);
    this.worker.postMessage(bytes, [bytes.buffer]);
  }
  private arm(pending: Pending) {
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => this.fail(new Error('草稿操作长时间无响应；提交状态未知，请刷新后查询原commandId并恢复，勿重复提交。')), this.timeoutMs);
  }
  private request<T extends Result>(operation: AtlasOperation, payload?: Uint8Array): Promise<T> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.pending) return Promise.reject(new Error('上一笔草稿操作尚未完成。'));
    return new Promise<T>((resolve, reject) => {
      const pending: Pending = { id: ++this.serial, operation, started: performance.now(), requestBytes: 0, responseBytes: 0, largestPacketBytes: 0, verificationMs: 0, sequence: 0, timer: undefined as unknown as ReturnType<typeof setTimeout>, resolve: value => resolve(value as T), reject };
      this.pending = pending;
      if ('commandId' in operation) this.lastIdentity = { commandId: operation.commandId, draftId: 'draftId' in operation ? operation.draftId : this.verifiedHead?.draftId };
      this.arm(pending);
      try { this.send(pending, 'request', operation, payload); }
      catch (error) { clearTimeout(pending.timer); this.pending = undefined; reject(error); }
    });
  }
  cancel() {
    if (this.fatal) throw this.fatal;
    if (this.pending) this.send(this.pending, 'cancel');
  }
  create(options: Pick<AtlasCreateOptions, 'size' | 'seed' | 'name'>) { return this.request<AtlasClientView>({ type: 'create', options, draftId: `atlas-${crypto.randomUUID()}`, commandId: `edit-${crypto.randomUUID()}` }); }
  restore(draftId: string, source: 'current' | 'backup' = 'current') { return this.request<AtlasClientView>({ type: 'restore', draftId, source }); }
  list() { return this.request<AtlasDraftList>({ type: 'list' }); }
  /** A retry reads durable command identity; it never resubmits or rotates backup. */
  receipt(draftId: string, commandId: string) { return this.request<AtlasCommitReceipt | null>({ type: 'receipt', draftId, commandId }); }
  undo() { return this.request<AtlasEditResult>({ type: 'undo', commandId: `edit-${crypto.randomUUID()}` }); }
  fork(name?: string) { return this.request<AtlasClientView>({ type: 'fork', ...(name === undefined ? {} : { name }), draftId: `atlas-${crypto.randomUUID()}`, commandId: `edit-${crypto.randomUUID()}` }); }
  private editCommand(patch: AtlasPatch, reason: string, expected?: { revision: number; rootDigest: string }) {
    if (this.fatal) throw this.fatal;
    if (this.pending) throw new Error('上一笔草稿操作尚未完成。');
    const head = this.verifiedHead; if (!head) throw new Error('请先创建或恢复草稿。');
    if (head.readOnly) throw new Error('当前备份为只读，请创建独立副本。');
    const command: AtlasEditCommand = { format: 'lieguoji-atlas-edit', version: 1, draftId: head.draftId, commandId: `edit-${crypto.randomUUID()}`, expectedRevision: expected?.revision ?? head.revision, expectedRootDigest: expected?.rootDigest ?? head.rootDigest, patch, reason };
    this.lastIdentity = { draftId: command.draftId, commandId: command.commandId }; return encodeAtlasEditMessage(command);
  }
  async preview(patch: AtlasPatch, reason: string) { return this.request<AtlasPreview>({ type: 'preview' }, this.editCommand(patch, reason)); }
  async edit(patch: AtlasPatch, reason: string, expected?: { revision: number; rootDigest: string }) { return this.request<AtlasEditResult>({ type: 'edit' }, this.editCommand(patch, reason, expected)); }
  private async checkRoot(raw: unknown): Promise<AtlasStoredRoot> {
    if (!validateAtlasRoot(raw) || await hashAtlasRoot(raw) !== raw.rootDigest) throw new Error('持久根格式或完整摘要无效。');
    return structuredClone(raw);
  }
  private checkHead(raw: unknown, root: AtlasStoredRoot): AtlasHead {
    if (!object(raw) || raw.draftId !== root.draftId || typeof raw.atlasId !== 'string' || typeof raw.name !== 'string'
      || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || typeof raw.readOnly !== 'boolean'
      || raw.rootDigest !== root.rootDigest || raw.manifestDigest !== (raw.readOnly ? root.backupManifest : root.currentManifest)
      || !raw.readOnly && raw.revision !== root.revision || raw.hasBackup !== (root.backupManifest !== null)
      || !Number.isSafeInteger(raw.undoCount) || (raw.undoCount as number) < 0 || (raw.undoCount as number) > 100) throw new Error('草稿视图头与持久根不一致。');
    return structuredClone(raw) as unknown as AtlasHead;
  }
  private metrics(pending: Pending, raw: unknown): AtlasMetrics {
    const values = object(raw) ? raw : {};
    const finite = (name: string) => typeof values[name] === 'number' && Number.isFinite(values[name]) && values[name] >= 0 ? values[name] as number : 0;
    return { requestBytes: pending.requestBytes, responseBytes: pending.responseBytes, largestPacketBytes: pending.largestPacketBytes, rootBytes: finite('rootBytes'), manifestBytes: finite('manifestBytes'), deltaBytes: finite('deltaBytes'), workerMs: finite('workerMs'), roundTripMs: performance.now() - pending.started, receiverVerificationMs: pending.verificationMs,
      ...(values.preparationMs === undefined ? {} : { preparationMs: finite('preparationMs'), cooperativeYieldMs: finite('cooperativeYieldMs'), localBudgetEligible: values.localBudgetEligible === true, writeBlocks: finite('writeBlocks'), affectedCells: finite('affectedCells') }) };
  }
  private async receive(input: unknown) {
    if (this.fatal) return;
    const { header, payload } = decodeAtlasPacket(input), pending = this.pending;
    if (!pending || header.id !== pending.id) return; // Late packets cannot replace another request's state.
    pending.responseBytes += (input as Uint8Array).length; pending.largestPacketBytes = Math.max(pending.largestPacketBytes, (input as Uint8Array).length); this.arm(pending);
    const started = performance.now(), body = header.body;
    if (header.type === 'progress') { if (object(body) && typeof body.stage === 'string' && typeof body.completed === 'number' && typeof body.total === 'number') this.options.onProgress?.(body as unknown as AtlasProgress); return; }
    if (header.type === 'error') {
      if (!object(body) || typeof body.message !== 'string') throw new Error('无效线程错误回执。');
      const error = new Error(body.message); if (body.cancelled) error.name = 'AbortError';
      if (typeof body.draftId === 'string' || typeof body.commandId === 'string') this.lastIdentity = { draftId: body.draftId as string | undefined, commandId: body.commandId as string | undefined };
      if (body.fatal || body.committed) this.fail(error);
      else { clearTimeout(pending.timer); this.pending = undefined; pending.reject(error); }
      return;
    }
    if (['begin', 'manifest', 'block', 'delta'].includes(header.type)) {
      if (header.sequence !== pending.sequence++) throw new Error('草稿分片顺序或身份不符。');
      if (header.type === 'begin') {
        if (!['create', 'restore', 'fork'].includes(pending.operation.type) || !object(body) || pending.init || pending.nextData || !Number.isSafeInteger(body.manifestLength) || (body.manifestLength as number) <= 0 || (body.manifestLength as number) > 16 * 1024 * 1024 || !Number.isSafeInteger(body.blockCount) || (body.blockCount as number) < 1 || (body.blockCount as number) > 1024) throw new Error('草稿初始化头无效。');
        const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root);
        if (!('draftId' in pending.operation) || pending.operation.draftId !== head.draftId || pending.operation.type === 'restore' && (pending.operation.source === 'backup') !== head.readOnly || pending.operation.type !== 'restore' && head.readOnly) throw new Error('初始化来源或草稿身份与请求不一致。');
        pending.init = { header: { head, root, manifestLength: body.manifestLength as number, blockCount: body.blockCount as number }, bytes: new Uint8Array(body.manifestLength as number), offset: 0, blocks: new Map() };
      } else if (header.type === 'manifest') {
        const init = pending.init;
        if (!init || init.manifest || !object(body) || body.offset !== init.offset || payload.length === 0 || init.offset + payload.length > init.bytes.length) throw new Error('草稿manifest分片缺失、重复或越界。');
        init.bytes.set(payload, init.offset); init.offset += payload.length;
        if (init.offset === init.bytes.length) {
          init.manifest = decodeManifest(init.bytes);
          if (await hashManifest(init.manifest) !== init.header.head.manifestDigest || init.manifest.draftId !== init.header.head.draftId || init.manifest.atlasId !== init.header.head.atlasId || init.manifest.name !== init.header.head.name || init.manifest.revision !== init.header.head.revision || init.manifest.blockRefs.length !== init.header.blockCount) throw new Error('草稿manifest与已核验根不符。');
        }
      } else if (header.type === 'block') {
        const init = pending.init;
        if (!init?.manifest || !object(body) || body.index !== init.blocks.size) throw new Error('草稿块顺序无效。');
        const reference = init.manifest.blockRefs[init.blocks.size], block = decodeBlock(payload, init.manifest.spec);
        if (!reference || reference.key !== body.key || `${block.layer}:${block.bx}:${block.by}` !== reference.key || await hashBlock(block) !== reference.hash) throw new Error('草稿块身份或完整摘要不符。');
        init.blocks.set(reference.key, block);
      } else {
        if (!['edit', 'undo'].includes(pending.operation.type) || !this.verified || !this.verifiedHead || pending.init || pending.delta || !object(body)) throw new Error('增量缺少已核验基线。');
        const delta = decodeAtlasEditMessage(payload); if (delta.format !== 'lieguoji-atlas-delta') throw new Error('成功响应不是编辑增量。');
        const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root);
        if (root.lastCommitId !== delta.commandId || root.rootDigest !== delta.rootDigest || root.currentManifest !== delta.manifestDigest || root.backupManifest !== this.verifiedHead.manifestDigest || head.readOnly
          || head.draftId !== delta.draftId || head.revision !== delta.revision || head.atlasId !== this.verified.manifest.atlasId || head.name !== this.verified.manifest.name
          || delta.commandId !== this.lastIdentity?.commandId) throw new Error('持久根未绑定此编辑增量。');
        pending.nextData = await applyAtlasDelta(this.verified, this.verifiedHead.rootDigest, delta); pending.delta = delta; pending.nextHead = head; pending.nextRoot = root;
      }
      pending.verificationMs += performance.now() - started;
      if (this.fatal || this.pending !== pending) return;
      this.send(pending, 'ack', undefined, undefined, header.sequence); return;
    }
    if (header.type !== 'complete' || !object(body)) throw new Error('未知草稿响应。');
    let result: Result;
    if (body.operation === 'list') {
      if (pending.operation.type !== 'list' || !Array.isArray(body.entries)) throw new Error('草稿目录响应不符。'); result = body.entries;
    } else if (body.operation === 'receipt') {
      if (pending.operation.type !== 'receipt') throw new Error('提交查询响应不符。');
      if (body.receipt !== null) {
        if (!object(body.receipt) || body.receipt.draftId !== pending.operation.draftId || body.receipt.commandId !== pending.operation.commandId || body.receipt.committed !== true) throw new Error('提交查询身份不符。');
        await this.checkRoot(body.receipt.root);
      }
      result = body.receipt as AtlasCommitReceipt | null;
    } else if (body.operation === 'preview') {
      if (pending.operation.type !== 'preview' || !object(body.preview)) throw new Error('编辑预览响应不符。');
      result = { ...body.preview, metrics: this.metrics(pending, body.metrics) } as unknown as AtlasPreview;
    } else {
      const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root);
      if (body.operation === 'initialize') {
        const init = pending.init;
        if (!init?.manifest || init.offset !== init.bytes.length || init.blocks.size !== init.header.blockCount || root.rootDigest !== init.header.root.rootDigest || head.manifestDigest !== init.header.head.manifestDigest) throw new Error('草稿初始化未完整接收。');
        pending.nextData = { manifest: init.manifest, blocks: init.blocks };
        if (!validateAtlasDraft(pending.nextData)) throw new Error('草稿初始化完整几何或引用核验失败。');
      } else if (body.operation !== 'edit' || !pending.delta || root.rootDigest !== pending.nextRoot?.rootDigest || head.manifestDigest !== pending.nextHead?.manifestDigest) throw new Error('编辑成功回执缺少对应增量。');
      if (!pending.nextData) throw new Error('成功回执没有完整草稿视图。');
      if (this.fatal || this.pending !== pending) return;
      pending.verificationMs += performance.now() - started;
      const previous = this.view, dirtyKeys = pending.delta?.blockRefs.map(ref => ref.key);
      const blocks = dirtyKeys && previous ? new Map(previous.data.blocks) : new Map<BlockKey, ReturnType<typeof cloneBlock>>();
      for (const key of dirtyKeys ?? [...pending.nextData.blocks.keys()]) blocks.set(key, cloneBlock(pending.nextData.blocks.get(key)!));
      this.verified = pending.nextData; this.verifiedHead = structuredClone(head);
      this.view = { data: { manifest: structuredClone(this.verified.manifest), blocks }, head: structuredClone(head), metrics: this.metrics(pending, body.metrics) };
      result = this.view;
      if (pending.delta) {
        const changedVertexIds = [...(pending.delta.patch.vertices?.ids ?? [])];
        const affectedCellIds = [...new Set([...affectedGeometryCells(this.verified.manifest.spec, changedVertexIds), ...(pending.delta.patch.elevation?.ids ?? []), ...(pending.delta.patch.simMembership?.ids ?? []), ...(pending.delta.patch.adminMembership?.ids ?? [])])].sort((a, b) => a - b);
        result = { ...this.view, delta: pending.delta, dirtyKeys: dirtyKeys!, changedVertexIds, affectedCellIds };
      }
    }
    if (this.fatal || this.pending !== pending) return;
    clearTimeout(pending.timer); this.pending = undefined; pending.resolve(result);
  }
}
