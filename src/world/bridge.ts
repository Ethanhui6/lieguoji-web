import { cloneDetailCoastTile, decodeDetailCoastTile, hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, type DetailCoastKey, type DetailCoastTile } from './detail-coast-types';
import { cloneVerifiedAtlasDocument, decodeAtlasManifest, hashAtlasManifest, isDetailCoastDocument, isGenerationDocument, verifyAtlasDocument, type AtlasDocument, type AtlasManifest, type AtlasFormat } from './atlas-format';
import { decodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey, atlasCellLockFlags, assertAtlasConstraintsOnly } from './generation-locks';
import { constraintsPreviewDigest, type ConstraintsPreviewInfo } from './constraints-session';
import { generationRecipeDigest, generationScopeDigest, generationLockDigest, generationPreviewDigest, type GenerationPreviewInfo } from './generation-session';
import { validateCellRectangle, type GenerationRecipe, type GenerationScope, type AtlasCellLockBlock, type AtlasCellRectangle } from './generation-contract';
import { cloneBlock, decodeBlock, hashBlock, type AtlasCreateOptions, type BlockKey } from './model';
import { affectedGeometryCells } from './topology';
import { applyAtlasDelta } from './delta';
import { decodeAtlasEditMessage, encodeAtlasEditMessage, type AtlasEditCommand, type AtlasEditDelta, type AtlasPatch } from './transactions';
import { getAtlasStorage } from './storage';
import type { AtlasCommitReceipt, AtlasStoredRoot } from './storage-types';
import { decodeAtlasPacket, encodeAtlasPacket, readAtlasComputation, type AtlasClientView, type AtlasComputationObservation, type AtlasDraftList, type AtlasEditResult, type AtlasHead, type AtlasMetrics, type AtlasOperation, type AtlasPacket, type AtlasPreview, type AtlasProgress, type AtlasStateHeader, type AtlasPreviewHeader, type AtlasGenerationPreview, type AtlasConstraintsPreview, type AtlasConstraintsHeader } from './protocol';

type Result = AtlasConstraintsPreview | AtlasGenerationPreview | AtlasClientView | AtlasEditResult | AtlasPreview | AtlasDraftList | AtlasCommitReceipt | null;
type Init = { header: AtlasStateHeader | AtlasPreviewHeader | AtlasConstraintsHeader; bytes: Uint8Array; offset: number; manifest?: AtlasManifest; blocks: AtlasDocument['blocks']; locks: Map<string, AtlasCellLockBlock>; detailCoast: Map<DetailCoastKey, DetailCoastTile> };
type Pending = {
  id: number; operation: AtlasOperation; started: number; requestBytes: number; responseBytes: number; largestPacketBytes: number;
  verificationMs: number; sequence: number; timer: ReturnType<typeof setTimeout>;
  resolve: (value: Result) => void; reject: (error: Error) => void;
  init?: Init; nextData?: AtlasDocument; nextHead?: AtlasHead; nextRoot?: AtlasStoredRoot; delta?: AtlasEditDelta;
  completed?: Record<string, unknown>; computation?: AtlasComputationObservation;
};
export interface AtlasClientOptions { onProgress?: (progress: AtlasProgress) => void; onFatal?: (error: Error) => void; timeoutMs?: number; format?: AtlasFormat }
const object = (raw: unknown): raw is Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw);

/** Dedicated production draft Worker, with independently verified receive state. */
export class AtlasClient {
  private worker: Worker;
  private serial = 0;
  private fatal?: Error;
  private pending?: Pending;
  private receiveQueue = Promise.resolve();
  private verified?: AtlasDocument;
  private verifiedHead?: AtlasHead;
  private view: AtlasClientView | null = null;
  private format: AtlasFormat;
  private generationPreview: AtlasGenerationPreview | null = null;
  private verifiedGeneration: GenerationPreviewInfo | null = null;
  private constraintsPreview: AtlasConstraintsPreview | null = null;
  private verifiedConstraints: ConstraintsPreviewInfo | null = null;
  private lastIdentity: { draftId?: string; commandId?: string } | null = null;
  private readonly timeoutMs: number;
  constructor(private options: AtlasClientOptions = {}) {
    this.format = options.format ?? 1;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.worker = new Worker(new URL('./atlas.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => {
      const message: unknown = event.data;
      this.receiveQueue = this.receiveQueue.then(() => this.receive(message)).catch(error => this.fail(error instanceof Error ? error : new Error('草稿响应验证失败。')));
    };
    this.worker.onerror = event => this.fail(new Error(event.message || '草稿线程失败，请刷新后恢复持久存档。'));
    this.worker.onmessageerror = () => this.fail(new Error('草稿线程消息无法解码，请刷新后恢复。'));
  }
  get pendingGeneration() { return this.generationPreview; }
  get pendingConstraints() { return this.constraintsPreview; }
  get currentFormat() { return this.format; }
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
    pending.timer = setTimeout(() => this.fail(new Error(pending.completed ? '草稿已提交，但计算诊断回执缺失；请刷新后恢复，勿重复提交。' : '草稿操作长时间无响应；提交状态未知，请刷新后查询原commandId并恢复，勿重复提交。')), this.timeoutMs);
  }
  private request<T extends Result>(operation: AtlasOperation, payload?: Uint8Array): Promise<T> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.pending) return Promise.reject(new Error('上一笔草稿操作尚未完成。'));
    return new Promise<T>((resolve, reject) => {
      operation = structuredClone(operation);
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
  create(options: Pick<AtlasCreateOptions, 'size' | 'seed' | 'name'>, format: AtlasFormat = this.format) { return this.request<AtlasClientView>({ type: 'create', atlasFormat: format, options, draftId: `atlas-${crypto.randomUUID()}`, commandId: `edit-${crypto.randomUUID()}` }); }
  restore(draftId: string, source: 'current' | 'backup' = 'current', format: AtlasFormat = this.format) { return this.request<AtlasClientView>({ type: 'restore', draftId, source, atlasFormat: format }); }
  list(format: AtlasFormat = this.format) { return this.request<AtlasDraftList>({ type: 'list', atlasFormat: format }); }
  /** A retry reads durable command identity; it never resubmits or rotates backup. */
  receipt(draftId: string, commandId: string) { return this.request<AtlasCommitReceipt | null>({ type: 'receipt', draftId, commandId, atlasFormat: this.format }); }
  undo() { return this.request<AtlasClientView | AtlasEditResult>({ type: 'undo', commandId: `edit-${crypto.randomUUID()}` }); }
  fork(name?: string) { return this.request<AtlasClientView>({ type: 'fork', ...(name === undefined ? {} : { name }), draftId: `atlas-${crypto.randomUUID()}`, commandId: `edit-${crypto.randomUUID()}` }); }
  generationCopy(name?: string, targetFormat: 2 | 3 = 2) { return this.request<AtlasClientView>({ type: 'generation-copy', targetFormat, ...(name === undefined ? {} : { name }), draftId: 'atlas-' + crypto.randomUUID(), commandId: 'edit-' + crypto.randomUUID() }); }
  previewGeneration(recipe: GenerationRecipe, scope: GenerationScope = { kind: 'world' }) {
    const h = this.verifiedHead; if (!h || h.readOnly || this.format === 1) return Promise.reject(new Error('请先打开可编辑的创世草稿。'));
    return this.request<AtlasGenerationPreview>({ type: 'generation-preview', commandId: 'edit-' + crypto.randomUUID(), expectedRevision: h.revision, expectedRootDigest: h.rootDigest, recipe, scope, atlasFormat: this.format });
  }
  confirmGeneration() {
    const p = this.verifiedGeneration; if (!p) return Promise.reject(new Error('尚无可确认的生成预览。'));
    return this.request<AtlasClientView>({ type: 'generation-confirm', candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest, atlasFormat: this.format });
  }
  discardGeneration() { const p = this.verifiedGeneration; if (!p) return Promise.reject(new Error('尚无可取消的生成预览。')); return this.request<null>({ type: 'generation-discard', candidateId: p.candidateId, atlasFormat: this.format }); }
  previewConstraints(rectangle: AtlasCellRectangle, mask: 1 | 2 | 3, action: 'set' | 'clear') {
    const h = this.verifiedHead; if (!h || h.readOnly || this.format === 1) return Promise.reject(new Error('请先打开可编辑的创世草稿。'));
    return this.request<AtlasConstraintsPreview>({ type: 'constraints-preview', atlasFormat: this.format, command: { format: 'lieguoji-atlas-constraint-edit', version: 1, draftId: h.draftId, commandId: 'edit-' + crypto.randomUUID(), expectedRevision: h.revision, expectedRootDigest: h.rootDigest, rectangle, mask, action } });
  }
  confirmConstraints() {
    const p = this.verifiedConstraints; if (!p) return Promise.reject(new Error('尚无可确认的区域锁预览。'));
    return this.request<AtlasClientView>({ type: 'constraints-confirm', candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest, atlasFormat: this.format });
  }
  discardConstraints() { const p = this.verifiedConstraints; if (!p) return Promise.reject(new Error('尚无可取消的区域锁预览。')); return this.request<null>({ type: 'constraints-discard', candidateId: p.candidateId, atlasFormat: this.format }); }
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
    if (!object(raw) || !['atlas-draft-v1', 'atlas-draft-v2', 'atlas-draft-v3', 'atlas-draft-v4'].includes(String(raw.domain))) throw new Error('持久根领域未知，未读取其他格式。');
    const database = getAtlasStorage(raw.domain === 'atlas-draft-v4' ? 4 : raw.domain === 'atlas-draft-v3' ? 3 : raw.domain === 'atlas-draft-v2' ? 2 : 1);
    if (!database.validateAtlasRoot(raw) || await database.hashAtlasRoot(raw) !== raw.rootDigest) throw new Error('持久根格式或完整摘要无效。');
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
      ...(values.preparationMs === undefined ? {} : { preparationMs: finite('preparationMs'), cooperativeYieldMs: finite('cooperativeYieldMs'), localBudgetEligible: values.localBudgetEligible === true, writeBlocks: finite('writeBlocks'), affectedCells: finite('affectedCells') }),
      ...(pending.computation ? { computation: pending.computation } : {}) };
  }
  private async receivedDocument(init: Init, pending: Pending): Promise<AtlasDocument> {
    if (!init.manifest || init.offset !== init.bytes.length || init.blocks.size !== init.header.blockCount || init.locks.size !== (init.header.lockCount ?? 0) || init.detailCoast.size !== (init.header.detailCoastCount ?? 0)) throw new Error('地图内容尚未接收完整。');
    const data: AtlasDocument = init.manifest.version === 4 ? { manifest: init.manifest, blocks: init.blocks, locks: init.locks, detailCoast: init.detailCoast } : init.manifest.version !== 1 ? { manifest: init.manifest, blocks: init.blocks, locks: init.locks } : { manifest: init.manifest, blocks: init.blocks };
    await verifyAtlasDocument(data, { onProgress: progress => { if (this.fatal || this.pending !== pending) throw this.fatal ?? new Error('地图接收已终止。'); this.options.onProgress?.({ ...progress, stage: '接收端' + progress.stage }); } }); return data;
  }
  private async checkGenerationBinding(p: GenerationPreviewInfo, op: Extract<AtlasOperation, { type: 'generation-preview' }>, data?: AtlasDocument) {
    const h = this.verifiedHead, base = this.verified;
    if (!h || !base || !isGenerationDocument(base) || h.readOnly || p.commandId !== op.commandId || p.baseRevision !== h.revision || p.baseRevision !== op.expectedRevision || p.baseRootDigest !== h.rootDigest || p.baseRootDigest !== op.expectedRootDigest || p.baseManifestDigest !== h.manifestDigest || p.revision !== h.revision + 1 || typeof p.candidateId !== 'string' || !/^[0-9a-f-]{36}$/.test(p.candidateId) || !/^[0-9a-f]{64}$/.test(p.manifestDigest) || p.recipeDigest !== await generationRecipeDigest(op.recipe) || p.scopeDigest !== await generationScopeDigest(op.scope) || p.recipeDigest !== await generationRecipeDigest(p.recipe) || p.scopeDigest !== await generationScopeDigest(p.scope) || p.lockSetDigest !== await generationLockDigest(base) || p.previewDigest !== await generationPreviewDigest(p)) throw new Error('生成预览没有绑定原图、输入或输出。');
    if (data) {
      if (!isGenerationDocument(data) || await generationLockDigest(data) !== p.lockSetDigest || await hashAtlasManifest(data.manifest) !== p.manifestDigest) throw new Error('生成预览与实际收到的地图不符。');
      const applied = data.manifest.generation.lastApplied;
      if (!applied || applied.baseRevision !== p.baseRevision || applied.baseRootDigest !== p.baseRootDigest || applied.baseManifestDigest !== p.baseManifestDigest || applied.lockSetDigest !== p.lockSetDigest || applied.appliedRevision !== p.revision || await generationRecipeDigest(applied.recipe) !== p.recipeDigest || await generationScopeDigest(applied.scope) !== p.scopeDigest) throw new Error('生成地图的来源记录与已显示配方不一致。');
    }
  }
  private async checkConstraintsBinding(p: ConstraintsPreviewInfo, op: Extract<AtlasOperation, { type: 'constraints-preview' }>, data?: AtlasDocument) {
    const h = this.verifiedHead, base = this.verified, c = op.command;
    if (!h || !base || !isGenerationDocument(base) || h.readOnly || p.commandId !== c.commandId || c.draftId !== h.draftId || p.baseRevision !== h.revision || p.baseRevision !== c.expectedRevision || p.baseRootDigest !== h.rootDigest || p.baseRootDigest !== c.expectedRootDigest || p.baseManifestDigest !== h.manifestDigest || p.revision !== h.revision + 1 || typeof p.candidateId !== 'string' || !/^[0-9a-f-]{36}$/.test(p.candidateId) || !/^[0-9a-f]{64}$/.test(p.manifestDigest) || !validateCellRectangle(p.rectangle, base.manifest.spec) || ['column', 'row', 'columns', 'rows'].some(key => p.rectangle[key as keyof AtlasCellRectangle] !== c.rectangle[key as keyof AtlasCellRectangle]) || p.mask !== c.mask || ![1, 2, 3].includes(p.mask) || p.action !== c.action || !['set', 'clear'].includes(p.action) || !Number.isSafeInteger(p.changedCellCount) || p.changedCellCount < 1 || p.changedCellCount > p.rectangle.columns * p.rectangle.rows || p.beforeLockSetDigest !== await generationLockDigest(base) || p.previewDigest !== await constraintsPreviewDigest(p)) throw new Error('区域锁预览未绑定选区、输入或草稿。');
    if (data) {
      if (!isGenerationDocument(data) || await hashAtlasManifest(data.manifest) !== p.manifestDigest || await generationLockDigest(data) !== p.afterLockSetDigest) throw new Error('区域锁预览与实际收到的地图不符。');
      assertAtlasConstraintsOnly(base, data);
      const r = p.rectangle, n = base.manifest.spec.columns; let changed = 0;
      for (let row = 0; row < n; row++) {
        for (let column = 0; column < n; column++) {
          const id = row * n + column, before = atlasCellLockFlags(base, id), after = atlasCellLockFlags(data, id);
          const inside = column >= r.column && column < r.column + r.columns && row >= r.row && row < r.row + r.rows;
          const expected = inside ? p.action === 'set' ? before | p.mask : before & ~p.mask : before;
          if (after !== expected) throw new Error('区域锁候选改变了选区外内容或未按预览执行。');
          if (before !== after) changed++;
        }
        if (row % 8 === 7) { this.options.onProgress?.({ stage: '接收端核验区域锁变化', completed: row + 1, total: n }); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
      }
      if (changed !== p.changedCellCount) throw new Error('区域锁实际变化数量与预览不符。');
    }
  }
  private async receive(input: unknown) {
    if (this.fatal) return;
    const { header, payload } = decodeAtlasPacket(input), pending = this.pending;
    if (!pending || header.id !== pending.id) return; // Late packets cannot replace another request's state.
    pending.responseBytes += (input as Uint8Array).length; pending.largestPacketBytes = Math.max(pending.largestPacketBytes, (input as Uint8Array).length); this.arm(pending);
    const started = performance.now(); let body = header.body;
    if (header.type === 'progress') { if (object(body) && typeof body.stage === 'string' && typeof body.completed === 'number' && typeof body.total === 'number') this.options.onProgress?.(body as unknown as AtlasProgress); return; }
    if (header.type === 'error') {
      if (!object(body) || typeof body.message !== 'string') throw new Error('无效线程错误回执。');
      const error = new Error(body.message); if (body.cancelled) error.name = 'AbortError';
      if (typeof body.draftId === 'string' || typeof body.commandId === 'string') this.lastIdentity = { draftId: body.draftId as string | undefined, commandId: body.commandId as string | undefined };
      if (body.fatal || body.committed || pending.completed) this.fail(error);
      else { clearTimeout(pending.timer); this.pending = undefined; pending.reject(error); }
      return;
    }
    if (['begin', 'manifest', 'block', 'lock', 'detail-coast', 'delta'].includes(header.type)) {
      if (header.sequence !== pending.sequence++) throw new Error('草稿分片顺序或身份不符。');
      if (header.type === 'begin') {
        if (!object(body) || pending.init || pending.nextData || !Number.isSafeInteger(body.manifestLength) || (body.manifestLength as number) <= 0 || (body.manifestLength as number) > 16 * 1024 * 1024 || !Number.isSafeInteger(body.blockCount) || (body.blockCount as number) < 1 || (body.blockCount as number) > 1024 || body.lockCount !== undefined && (!Number.isSafeInteger(body.lockCount) || (body.lockCount as number) < 0 || (body.lockCount as number) > 256) || body.detailCoastCount !== undefined && (!Number.isSafeInteger(body.detailCoastCount) || (body.detailCoastCount as number) < 0 || (body.detailCoastCount as number) > 4096)) throw new Error('草稿初始化头无效。');
        let stateHeader: Init['header'];
        if (body.kind === 'generation-preview') {
          if (pending.operation.type !== 'generation-preview' || !object(body.preview) || body.lockCount === undefined) throw new Error('生成预览头与请求不符。');
          await this.checkGenerationBinding(body.preview as unknown as GenerationPreviewInfo, pending.operation);
          stateHeader = { kind: 'generation-preview', preview: structuredClone(body.preview) as unknown as GenerationPreviewInfo, manifestLength: body.manifestLength as number, blockCount: body.blockCount as number, lockCount: body.lockCount as number };
        } else if (body.kind === 'constraints-preview') {
          if (pending.operation.type !== 'constraints-preview' || !object(body.preview) || body.lockCount === undefined) throw new Error('区域锁预览头与请求不符。');
          await this.checkConstraintsBinding(body.preview as unknown as ConstraintsPreviewInfo, pending.operation);
          stateHeader = { kind: 'constraints-preview', preview: structuredClone(body.preview) as unknown as ConstraintsPreviewInfo, manifestLength: body.manifestLength as number, blockCount: body.blockCount as number, lockCount: body.lockCount as number };
        } else {
          if (body.kind !== undefined && body.kind !== 'durable' || !['create', 'restore', 'fork', 'generation-copy', 'generation-confirm', 'constraints-confirm', 'undo'].includes(pending.operation.type)) throw new Error('未知持久显示来源。');
          const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root), op = pending.operation;
          const expectedId = 'draftId' in op ? op.draftId : this.verifiedHead?.draftId;
          const expectedFormat = op.type === 'generation-copy' ? op.targetFormat ?? 2 : op.atlasFormat ?? this.format;
          if (expectedId !== head.draftId || root.domain !== `atlas-draft-v${expectedFormat}` || op.type === 'restore' && (op.source === 'backup') !== head.readOnly || op.type !== 'restore' && head.readOnly) throw new Error('初始化来源或草稿身份与请求不一致。');
          if (op.type === 'generation-confirm' && (!this.verifiedGeneration || root.lastCommitId !== op.commandId || root.currentManifest !== this.verifiedGeneration.manifestDigest || root.backupManifest !== this.verifiedHead?.manifestDigest)) throw new Error('持久结果未绑定已显示的候选。');
          if (op.type === 'constraints-confirm' && (!this.verifiedConstraints || root.lastCommitId !== op.commandId || root.currentManifest !== this.verifiedConstraints.manifestDigest || root.backupManifest !== this.verifiedHead?.manifestDigest)) throw new Error('持久结果未绑定已显示的区域锁候选。');
          stateHeader = { kind: 'durable', head, root, manifestLength: body.manifestLength as number, blockCount: body.blockCount as number, lockCount: (body.lockCount as number | undefined) ?? 0 };
        }
        if (body.detailCoastCount !== undefined) stateHeader.detailCoastCount = body.detailCoastCount as number;
        pending.init = { header: stateHeader, bytes: new Uint8Array(stateHeader.manifestLength), offset: 0, blocks: new Map(), locks: new Map(), detailCoast: new Map() };
      } else if (header.type === 'manifest') {
        const init = pending.init;
        if (!init || init.manifest || !object(body) || body.offset !== init.offset || payload.length === 0 || init.offset + payload.length > init.bytes.length) throw new Error('草稿manifest分片缺失、重复或越界。');
        init.bytes.set(payload, init.offset); init.offset += payload.length;
        if (init.offset === init.bytes.length) {
          init.manifest = decodeAtlasManifest(init.bytes);
          const requiredFormat = init.header.kind === 'generation-preview' || init.header.kind === 'constraints-preview' ? this.format : init.header.root.domain === 'atlas-draft-v4' ? 4 : init.header.root.domain === 'atlas-draft-v3' ? 3 : init.header.root.domain === 'atlas-draft-v2' ? 2 : 1;
          if (init.manifest.version !== requiredFormat) throw new Error('地图版本与持久领域或预览来源不符。');
          if (init.manifest.version === 4 ? init.header.detailCoastCount !== init.manifest.detailCoast.refs.length : init.header.detailCoastCount !== undefined) throw new Error('细海岸条目数与格式合同不符。');
          const expected = init.header.kind === 'generation-preview' || init.header.kind === 'constraints-preview' ? { ...this.verifiedHead!, revision: init.header.preview.revision, manifestDigest: init.header.preview.manifestDigest } : init.header.head;
          if (await hashAtlasManifest(init.manifest) !== expected.manifestDigest || init.manifest.draftId !== expected.draftId || init.manifest.atlasId !== expected.atlasId || init.manifest.name !== expected.name || init.manifest.revision !== expected.revision || init.manifest.blockRefs.length !== init.header.blockCount || (init.manifest.version !== 1 ? init.manifest.constraints.lockRefs.length : 0) !== (init.header.lockCount ?? 0)) throw new Error('草稿manifest与已核验来源不符。');
        }
      } else if (header.type === 'block') {
        const init = pending.init;
        if (!init?.manifest || !object(body) || body.index !== init.blocks.size) throw new Error('草稿块顺序无效。');
        const reference = init.manifest.blockRefs[init.blocks.size], block = decodeBlock(payload, init.manifest.spec);
        if (!reference || reference.key !== body.key || `${block.layer}:${block.bx}:${block.by}` !== reference.key || await hashBlock(block) !== reference.hash) throw new Error('草稿块身份或完整摘要不符。');
        init.blocks.set(reference.key, block);
      } else if (header.type === 'lock') {
        const init = pending.init;
        if (!init?.manifest || init.manifest.version === 1 || init.blocks.size !== init.header.blockCount || !object(body) || body.index !== init.locks.size) throw new Error('锁附件顺序或格式无效。');
        const ref = init.manifest.constraints.lockRefs[init.locks.size], lock = decodeAtlasCellLockBlock(payload, init.manifest.spec);
        if (!ref || body.key !== lockKey(ref.bx, ref.by) || lock.bx !== ref.bx || lock.by !== ref.by || await hashAtlasCellLockBlock(lock) !== ref.hash) throw new Error('锁附件身份或摘要无效。');
        init.locks.set(body.key as string, lock);
      } else if (header.type === 'detail-coast') {
        const init = pending.init;
        if (!init?.manifest || init.manifest.version !== 4 || init.blocks.size !== init.header.blockCount || init.locks.size !== (init.header.lockCount ?? 0) || !object(body) || body.index !== init.detailCoast.size) throw new Error('细海岸分片顺序或格式无效。');
        const ref = init.manifest.detailCoast.refs[init.detailCoast.size], tile = decodeDetailCoastTile(payload);
        if (!ref || body.key !== detailCoastKey(ref.bx, ref.by) || tile.bx !== ref.bx || tile.by !== ref.by || await hashDetailCoastTile(tile) !== ref.hash || init.detailCoast.has(body.key as DetailCoastKey)) throw new Error('细海岸分片身份或完整摘要不符。');
        init.detailCoast.set(body.key as DetailCoastKey, tile);
      } else {
        if (!['edit', 'undo'].includes(pending.operation.type) || this.verified?.manifest.version === 4 || !this.verified || !this.verifiedHead || pending.init || pending.delta || !object(body)) throw new Error('增量缺少已核验基线。');
        const delta = decodeAtlasEditMessage(payload); if (delta.format !== 'lieguoji-atlas-delta') throw new Error('成功响应不是编辑增量。');
        const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root);
        if (root.domain !== `atlas-draft-v${this.verified.manifest.version}` || root.lastCommitId !== delta.commandId || root.rootDigest !== delta.rootDigest || root.currentManifest !== delta.manifestDigest || root.backupManifest !== this.verifiedHead.manifestDigest || head.readOnly
          || head.draftId !== delta.draftId || head.revision !== delta.revision || head.atlasId !== this.verified.manifest.atlasId || head.name !== this.verified.manifest.name
          || delta.commandId !== this.lastIdentity?.commandId) throw new Error('持久根未绑定此编辑增量。');
        pending.nextData = await applyAtlasDelta(this.verified, this.verifiedHead.rootDigest, delta); pending.delta = delta; pending.nextHead = head; pending.nextRoot = root;
      }
      pending.verificationMs += performance.now() - started;
      if (this.fatal || this.pending !== pending) return;
      this.send(pending, 'ack', undefined, undefined, header.sequence); return;
    }
    if (header.type === 'complete' && object(body) && body.operation === 'edit') {
      if (!['edit', 'undo'].includes(pending.operation.type) || !pending.delta || pending.completed) throw new Error('草稿提交完成回执顺序无效。');
      pending.completed = body; return;
    }
    if (header.type === 'timing') {
      if (!pending.completed || !pending.delta || pending.computation || !object(body) || body.operation !== 'edit' || body.commandId !== pending.delta.commandId || body.rootDigest !== pending.delta.rootDigest || payload.length) throw new Error('草稿计算诊断未绑定已完成提交，请恢复核对。');
      pending.computation = readAtlasComputation(body.computation); body = pending.completed;
    }
    if (header.type !== 'complete' && header.type !== 'timing' || !object(body)) throw new Error('未知草稿响应。');
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
    } else if (body.operation === 'generation-receipt' || body.operation === 'constraints-receipt') {
      const op = pending.operation;
      if ((body.operation === 'generation-receipt' ? op.type !== 'generation-confirm' : op.type !== 'constraints-confirm') || !('commandId' in op) || !('candidateId' in op) || !object(body.receipt) || body.receipt.commandId !== op.commandId || body.receipt.candidateId !== op.candidateId || body.receipt.committed !== true) throw new Error('重复确认未返回原候选回执。');
      const root = await this.checkRoot(body.receipt.root);
      if (!this.view || this.verifiedHead?.rootDigest !== root.rootDigest || body.receipt.manifestDigest !== this.verifiedHead.manifestDigest) throw new Error('这次生成已经提交；当前草稿已继续变化，请查看当前版本。');
      result = this.view;
    } else if (body.operation === 'generation-discard') {
      if (pending.operation.type !== 'generation-discard' || body.candidateId !== pending.operation.candidateId || this.verifiedGeneration?.candidateId !== body.candidateId) throw new Error('生成取消回执与候选不符。');
      this.generationPreview = null; this.verifiedGeneration = null; result = null;
    } else if (body.operation === 'constraints-discard') {
      if (pending.operation.type !== 'constraints-discard' || body.candidateId !== pending.operation.candidateId || this.verifiedConstraints?.candidateId !== body.candidateId) throw new Error('区域锁取消回执与候选不符。');
      this.constraintsPreview = null; this.verifiedConstraints = null; result = null;
    } else if (body.operation === 'constraints-preview') {
      const init = pending.init;
      if (pending.operation.type !== 'constraints-preview' || init?.header.kind !== 'constraints-preview' || !object(body.preview) || JSON.stringify(body.preview) !== JSON.stringify(init.header.preview)) throw new Error('区域锁完成回执与流头不符。');
      const data = await this.receivedDocument(init, pending); await this.checkConstraintsBinding(init.header.preview, pending.operation, data);
      result = { data: await cloneVerifiedAtlasDocument(data, { onProgress: progress => this.options.onProgress?.(progress) }), preview: structuredClone(init.header.preview), metrics: this.metrics(pending, body.metrics) }; this.verifiedConstraints = structuredClone(init.header.preview); this.constraintsPreview = result;
    } else if (body.operation === 'generation-preview') {
      const init = pending.init;
      if (pending.operation.type !== 'generation-preview' || init?.header.kind !== 'generation-preview' || !object(body.preview) || JSON.stringify(body.preview) !== JSON.stringify(init.header.preview)) throw new Error('生成完成回执与流头不符。');
      const data = await this.receivedDocument(init, pending); await this.checkGenerationBinding(init.header.preview, pending.operation, data);
      result = { data: await cloneVerifiedAtlasDocument(data, { onProgress: progress => this.options.onProgress?.(progress) }), preview: structuredClone(init.header.preview), metrics: this.metrics(pending, body.metrics) }; this.verifiedGeneration = structuredClone(init.header.preview); this.generationPreview = result;
    } else if (body.operation === 'preview') {
      if (pending.operation.type !== 'preview' || !object(body.preview)) throw new Error('编辑预览响应不符。');
      result = { ...body.preview, metrics: this.metrics(pending, body.metrics) } as unknown as AtlasPreview;
    } else {
      const root = await this.checkRoot(body.root), head = this.checkHead(body.head, root);
      if (body.operation === 'initialize') {
        const init = pending.init;
        if (!init?.manifest || init.header.kind === 'generation-preview' || init.header.kind === 'constraints-preview' || root.rootDigest !== init.header.root.rootDigest || head.manifestDigest !== init.header.head.manifestDigest) throw new Error('草稿初始化未完整接收。');
        pending.nextData = await this.receivedDocument(init, pending);
      } else if (body.operation !== 'edit' || !pending.delta || root.rootDigest !== pending.nextRoot?.rootDigest || head.manifestDigest !== pending.nextHead?.manifestDigest) throw new Error('编辑成功回执缺少对应增量。');
      if (!pending.nextData) throw new Error('成功回执没有完整草稿视图。');
      if (this.fatal || this.pending !== pending) return;
      pending.verificationMs += performance.now() - started;
      const previous = this.view, dirtyKeys = pending.delta?.blockRefs.map(ref => ref.key);
      const blocks = dirtyKeys && previous ? new Map(previous.data.blocks) : new Map<BlockKey, ReturnType<typeof cloneBlock>>();
      const copiedKeys = dirtyKeys ?? [...pending.nextData.blocks.keys()];
      for (let index = 0; index < copiedKeys.length; index++) {
        const key = copiedKeys[index]; blocks.set(key, cloneBlock(pending.nextData.blocks.get(key)!));
        if (!dirtyKeys && ((index + 1) % 16 === 0 || index + 1 === copiedKeys.length)) {
          this.options.onProgress?.({ stage: '创建接收端独立地图视图', completed: index + 1, total: copiedKeys.length });
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          if (this.fatal || this.pending !== pending) return;
        }
      }
      const detailCoast = new Map<DetailCoastKey, DetailCoastTile>();
      if (isDetailCoastDocument(pending.nextData)) {
        let count = 0;
        for (const [key, tile] of pending.nextData.detailCoast) {
          detailCoast.set(key, cloneDetailCoastTile(tile)); count++;
          if (count % 16 === 0 || count === pending.nextData.detailCoast.size) {
            this.options.onProgress?.({ stage: '创建独立细海岸视图', completed: count, total: pending.nextData.detailCoast.size });
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            if (this.fatal || this.pending !== pending) return;
          }
        }
      }
      this.verified = pending.nextData; this.verifiedHead = structuredClone(head);
      this.view = { data: { ...this.verified, manifest: structuredClone(this.verified.manifest), blocks, ...(isGenerationDocument(this.verified) ? { locks: structuredClone(this.verified.locks) } : {}), ...(isDetailCoastDocument(this.verified) ? { detailCoast } : {}) } as AtlasDocument, head: structuredClone(head), metrics: this.metrics(pending, body.metrics) };
      this.format = this.verified.manifest.version; this.generationPreview = null; this.verifiedGeneration = null;
      this.constraintsPreview = null; this.verifiedConstraints = null;
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
