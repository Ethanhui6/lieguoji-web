import { hashAtlasManifest, isGenerationDocument } from './atlas-format';
import { generationCanonical, generationDigest, generationExact } from './generation-contract';
import { hashAtlasLockSet } from './generation-locks';
import { yieldAtlas, type AtlasControl } from './model';
import { OwnedAtlasSession, type AtlasConstraintEdit, type PreparedAtlasConstraints } from './transactions';
import type { GenerationConfirm } from './generation-session';

export interface ConstraintsPreviewInfo extends PreparedAtlasConstraints { previewDigest: string }
export type ConstraintsConfirm = GenerationConfirm;
/** Explicit fields avoid accidentally hashing previewDigest into itself. Every
 * prepared identity, selected operation and measured result is bound. */
export function constraintsPreviewDigest(p: Omit<ConstraintsPreviewInfo, 'previewDigest'>): Promise<string> {
  return generationDigest(new TextEncoder().encode(generationCanonical({
    candidateId: p.candidateId, commandId: p.commandId, baseRevision: p.baseRevision, baseRootDigest: p.baseRootDigest,
    baseManifestDigest: p.baseManifestDigest, revision: p.revision, manifestDigest: p.manifestDigest, reason: p.reason,
    rectangle: p.rectangle, mask: p.mask, action: p.action, changedCellCount: p.changedCellCount,
    beforeLockSetDigest: p.beforeLockSetDigest, afterLockSetDigest: p.afterLockSetDigest,
  })));
}

/** Pure-lock candidates remain owned by the Worker session until persistence
 * completes. Neither a returned preview nor its digest grants write authority. */
export class AtlasConstraintsSession {
  #preview?: ConstraintsPreviewInfo;
  #busy = false;
  constructor(private session: OwnedAtlasSession) {}
  get pending() { return this.#preview ? structuredClone(this.#preview) : null; }
  async preview(command: AtlasConstraintEdit, control?: AtlasControl): Promise<ConstraintsPreviewInfo> {
    control?.signal?.throwIfAborted();
    if (this.#busy || this.#preview || this.session.replacementPending) throw new Error('请先确认或取消当前编辑预览。');
    this.#busy = true; let prepared: PreparedAtlasConstraints | undefined;
    try {
      // OwnedAtlasSession validates and snapshots the command before yielding.
      prepared = await this.session.prepareConstraints(command, control);
      if (this.session.replacementMode(prepared.candidateId) !== 'constraints') throw new Error('区域锁预览不能引用地理候选。');
      const owned = structuredClone(prepared), previewDigest = await constraintsPreviewDigest(owned);
      await yieldAtlas(control, '绑定区域锁预览摘要', 1, 1);
      this.#assertCurrent(owned);
      this.#preview = { ...owned, previewDigest }; return structuredClone(this.#preview);
    } catch (error) { if (prepared) this.#discardOwned(prepared.candidateId); throw error; }
    finally { this.#busy = false; }
  }
  async confirm(raw: ConstraintsConfirm, control?: AtlasControl) {
    const p = this.#preview;
    if (this.#busy || !p || !generationExact(raw, ['candidateId', 'commandId', 'previewDigest', 'expectedRevision', 'expectedRootDigest'])
      || raw.candidateId !== p.candidateId || raw.commandId !== p.commandId || raw.previewDigest !== p.previewDigest
      || raw.expectedRevision !== p.baseRevision || raw.expectedRootDigest !== p.baseRootDigest) throw new Error('区域锁确认未绑定当前私有预览。');
    this.#assertCurrent(p); this.#busy = true;
    try {
      control?.signal?.throwIfAborted();
      const data = await this.session.replacementDocumentAsync(p.candidateId, control);
      if (!isGenerationDocument(data) || await hashAtlasManifest(data.manifest) !== p.manifestDigest
        || await hashAtlasLockSet(data.manifest.constraints, data.manifest.spec) !== p.afterLockSetDigest
        || await constraintsPreviewDigest(p) !== p.previewDigest) throw new Error('区域锁私有候选或预览摘要发生变化。');
      await yieldAtlas(control, '复核区域锁确认摘要', 1, 1);
      if (this.#preview !== p) throw new Error('区域锁预览已取消或替换。');
      this.#assertCurrent(p);
      return { data, preview: structuredClone(p) };
    // Confirmation cancellation leaves the already displayed private candidate
    // intact. The UI can confirm it again or explicitly discard it, just like
    // a generation preview; only cancelled preview construction removes it.
    } finally { this.#busy = false; }
  }
  discard(candidateId: string) {
    if (!this.#preview || this.#preview.candidateId !== candidateId) throw new Error('区域锁预览已经失效。');
    this.#discardOwned(candidateId);
  }
  published(candidateId: string) {
    const p = this.#preview;
    if (!p || p.candidateId !== candidateId) throw new Error('已提交区域锁身份不一致。');
    const head = this.session.head;
    if (head.revision !== p.revision || head.manifestDigest !== p.manifestDigest) throw new Error('区域锁候选尚未由持久回执发布。');
    this.#preview = undefined;
  }
  #assertCurrent(p: PreparedAtlasConstraints) {
    const head = this.session.head;
    if (head.revision !== p.baseRevision || head.rootDigest !== p.baseRootDigest || head.manifestDigest !== p.baseManifestDigest) throw new Error('区域锁基线已变化，请重新读取草稿。');
    if (this.session.replacementMode(p.candidateId) !== 'constraints') throw new Error('区域锁确认不能引用地理候选。');
  }
  #discardOwned(candidateId: string) {
    // Another owner may already have expired this candidate. Never discard a
    // different/current geography candidate while cleaning up our old preview.
    try { if (this.session.replacementMode(candidateId) === 'constraints') this.session.discardReplacement(candidateId); }
    catch { /* An expired owned candidate is already discarded or published. */ }
    if (this.#preview?.candidateId === candidateId) this.#preview = undefined;
  }
}
