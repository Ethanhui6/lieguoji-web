import type { AtlasCreateOptions, AtlasDraftData, BlockKey } from './model';
import type { AtlasEditDelta, PreparedAtlasEdit } from './transactions';
import type { AtlasCatalogEntry, AtlasStorageTiming, AtlasStoredRoot } from './storage-types';

export const ATLAS_PACKET_LIMIT = 512 * 1024;
export const ATLAS_FRAGMENT_BYTES = ATLAS_PACKET_LIMIT - 4096;
export interface AtlasHead {
  draftId: string; atlasId: string; name: string; revision: number;
  rootDigest: string; manifestDigest: string; readOnly: boolean; undoCount: number; hasBackup: boolean;
}
export interface AtlasMetrics {
  requestBytes: number; responseBytes: number; largestPacketBytes: number;
  rootBytes: number; manifestBytes: number; deltaBytes: number;
  workerMs: number; roundTripMs: number; receiverVerificationMs: number;
  preparationMs?: number; cooperativeYieldMs?: number; localBudgetEligible?: boolean;
  writeBlocks?: number; affectedCells?: number;
  computation?: AtlasComputationObservation;
}
export type AtlasObservedSpan = { startMs: number; endMs: number };
export interface AtlasComputationObservation {
  version: 1; scope: 'worker-request-through-complete-send'; coverage: 'complete' | 'partial' | 'invalid';
  observedComputeMs: number | null; requestWallMs: number; requestDecodeMs: number;
  ownedPreparationWallMs: number; ownedYieldWaitMs: number;
  storage: AtlasStorageTiming | null; storageComputeMs: number | null; storageUnattributedMs: number | null;
  workerOutsidePhasesMs: number; ackWaitMs: number;
  /** Included subset of the phases above, never added a second time. */
  packetEncodeSendMs: number;
  phases: { ownedPreparation: AtlasObservedSpan | null; storageCall: AtlasObservedSpan | null; ownedYields: AtlasObservedSpan[]; acknowledgements: AtlasObservedSpan[] };
  partialReasons: string[]; invalidReasons: string[]; reportingOverheadExcluded: true;
}
export interface AtlasTimingLedger {
  startedAt: number; endedAt: number; requestDecodeMs: number; packetEncodeSendMs: number;
  ownedPreparation: AtlasObservedSpan | null; storageCall: AtlasObservedSpan | null;
  ownedYields: AtlasObservedSpan[]; acknowledgements: AtlasObservedSpan[];
  storageTimings: AtlasStorageTiming[]; partialReasons: string[];
}
const timingEpsilon = 1e-6; // Floating-point arithmetic only, never a millisecond tolerance.
const elapsed = (span: AtlasObservedSpan) => span.endMs - span.startMs;
/** Wall-clock observation with only explicit waiting removed; WebCrypto waiting remains. */
export function observeAtlasComputation(ledger: AtlasTimingLedger): AtlasComputationObservation {
  const invalidReasons: string[] = [], partialReasons = [...ledger.partialReasons];
  const requestWallMs = ledger.endedAt - ledger.startedAt;
  const offset = (span: AtlasObservedSpan): AtlasObservedSpan => ({ startMs: span.startMs - ledger.startedAt, endMs: span.endMs - ledger.startedAt });
  const phases = { ownedPreparation: ledger.ownedPreparation && offset(ledger.ownedPreparation), storageCall: ledger.storageCall && offset(ledger.storageCall), ownedYields: ledger.ownedYields.map(offset), acknowledgements: ledger.acknowledgements.map(offset) };
  const finite = (value: number) => Number.isFinite(value) && value >= -timingEpsilon;
  const validSpan = (span: AtlasObservedSpan) => finite(span.startMs) && Number.isFinite(span.endMs) && span.endMs + timingEpsilon >= span.startMs && span.endMs <= requestWallMs + timingEpsilon;
  const disjoint = (spans: AtlasObservedSpan[]) => [...spans].sort((a, b) => a.startMs - b.startMs).every((span, index, sorted) => index === 0 || span.startMs + timingEpsilon >= sorted[index - 1].endMs);
  const allSpans = [...(phases.ownedPreparation ? [phases.ownedPreparation] : []), ...(phases.storageCall ? [phases.storageCall] : []), ...phases.acknowledgements];
  if (![requestWallMs, ledger.requestDecodeMs, ledger.packetEncodeSendMs].every(finite) || !allSpans.every(validSpan) || !phases.ownedYields.every(validSpan)) invalidReasons.push('non-finite-negative-or-outside-request-span');
  if (!disjoint(allSpans) || !disjoint(phases.ownedYields)) invalidReasons.push('overlapping-observed-phases');
  if (phases.ownedYields.some(span => !phases.ownedPreparation || span.startMs + timingEpsilon < phases.ownedPreparation.startMs || span.endMs > phases.ownedPreparation.endMs + timingEpsilon)) invalidReasons.push('yield-outside-owned-preparation');
  if (!phases.ownedPreparation) partialReasons.push('owned-preparation-not-observed');
  if (!phases.storageCall) partialReasons.push('storage-call-not-observed');
  if (ledger.storageTimings.length !== 1) partialReasons.push('storage-timing-count-not-one');
  const storage = ledger.storageTimings.length === 1 ? structuredClone(ledger.storageTimings[0]) : null;
  const ownedPreparationWallMs = phases.ownedPreparation ? elapsed(phases.ownedPreparation) : 0, ownedYieldWaitMs = phases.ownedYields.reduce((sum, span) => sum + elapsed(span), 0), ackWaitMs = phases.acknowledgements.reduce((sum, span) => sum + elapsed(span), 0);
  let storageComputeMs: number | null = null, storageUnattributedMs: number | null = null;
  if (storage) {
    if (storage.version !== 1 || storage.path !== 'local' || storage.outcome !== 'committed' || storage.coverage !== 'complete') partialReasons.push('storage-not-complete-local-commit');
    invalidReasons.push(...storage.invalidReasons.map(reason => `storage:${reason}`));
    const fields = [storage.totalWallMs, storage.preflightWallMs, storage.preflightYieldWallMs, storage.transactionWallMs, storage.transactionEnqueueSyncWallMs, storage.transactionCallbacksSyncWallMs, storage.transactionValidationSyncWallMs, storage.transactionWaitResidualMs, storage.postCommitVerifyWallMs, storage.postCommitCacheWallMs];
    if (fields.some(value => value === null)) partialReasons.push('storage-phase-not-reached');
    if (fields.some(value => value !== null && !finite(value))) invalidReasons.push('invalid-storage-phase-duration');
    if (storage.preflightYieldWallMs > storage.preflightWallMs + timingEpsilon || storage.totalWallMs > (phases.storageCall ? elapsed(phases.storageCall) : 0) + timingEpsilon) invalidReasons.push('storage-phase-exceeds-owning-span');
    if (fields.every(value => value !== null)) {
      if (storage.transactionValidationSyncWallMs! > storage.transactionCallbacksSyncWallMs! + timingEpsilon || Math.abs(storage.transactionWallMs! - storage.transactionEnqueueSyncWallMs! - storage.transactionCallbacksSyncWallMs! - storage.transactionWaitResidualMs!) > timingEpsilon) invalidReasons.push('storage-transaction-partition-mismatch');
      storageUnattributedMs = storage.totalWallMs - storage.preflightWallMs - storage.transactionWallMs! - storage.postCommitVerifyWallMs! - storage.postCommitCacheWallMs!;
      if (!finite(storageUnattributedMs)) invalidReasons.push('negative-storage-unattributed-time');
      storageComputeMs = storage.totalWallMs - storage.preflightYieldWallMs - storage.transactionWaitResidualMs!;
    }
  }
  const workerOutsidePhasesMs = requestWallMs - ownedPreparationWallMs - (storage?.totalWallMs ?? 0) - ackWaitMs;
  if (!finite(workerOutsidePhasesMs) || ownedYieldWaitMs > ownedPreparationWallMs + timingEpsilon || ledger.requestDecodeMs > workerOutsidePhasesMs + timingEpsilon || ledger.packetEncodeSendMs > requestWallMs + timingEpsilon) invalidReasons.push('negative-or-inconsistent-worker-residual');
  const observedComputeMs = storageComputeMs === null ? null : ownedPreparationWallMs - ownedYieldWaitMs + storageComputeMs + workerOutsidePhasesMs;
  if (observedComputeMs !== null && !finite(observedComputeMs)) invalidReasons.push('invalid-observed-computation');
  return { version: 1, scope: 'worker-request-through-complete-send', coverage: invalidReasons.length ? 'invalid' : partialReasons.length ? 'partial' : 'complete', observedComputeMs, requestWallMs, requestDecodeMs: ledger.requestDecodeMs, ownedPreparationWallMs, ownedYieldWaitMs, storage, storageComputeMs, storageUnattributedMs, workerOutsidePhasesMs, ackWaitMs, packetEncodeSendMs: ledger.packetEncodeSendMs, phases, partialReasons: [...new Set(partialReasons)], invalidReasons: [...new Set(invalidReasons)], reportingOverheadExcluded: true };
}
/** Reject malformed diagnostics; preserve negative/inconsistent observations as invalid, never as zero. */
export function readAtlasComputation(raw: unknown): AtlasComputationObservation {
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const reasons = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 240);
  const span = (value: unknown): value is AtlasObservedSpan => object(value) && typeof value.startMs === 'number' && Number.isFinite(value.startMs) && typeof value.endMs === 'number' && Number.isFinite(value.endMs);
  if (!object(raw) || raw.version !== 1 || raw.scope !== 'worker-request-through-complete-send' || raw.reportingOverheadExcluded !== true || !['complete', 'partial', 'invalid'].includes(raw.coverage as string) || !reasons(raw.partialReasons) || !reasons(raw.invalidReasons) || !object(raw.phases)) throw new Error('草稿计算诊断格式无效；提交状态需恢复核对。');
  for (const key of ['requestWallMs', 'requestDecodeMs', 'ownedPreparationWallMs', 'ownedYieldWaitMs', 'workerOutsidePhasesMs', 'ackWaitMs', 'packetEncodeSendMs']) if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw new Error('草稿计算诊断缺失有限数值。');
  for (const key of ['observedComputeMs', 'storageComputeMs', 'storageUnattributedMs']) if (raw[key] !== null && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) throw new Error('草稿计算诊断缺失阶段数值。');
  if (raw.phases.ownedPreparation !== null && !span(raw.phases.ownedPreparation) || raw.phases.storageCall !== null && !span(raw.phases.storageCall) || !Array.isArray(raw.phases.ownedYields) || !Array.isArray(raw.phases.acknowledgements) || !raw.phases.ownedYields.every(span) || !raw.phases.acknowledgements.every(span)) throw new Error('草稿计算诊断阶段边界无效。');
  if (raw.storage !== null) {
    const storage = raw.storage;
    if (!object(storage) || storage.version !== 1 || !['local', 'replay'].includes(storage.path as string) || !['committed', 'committed-error', 'replayed', 'cancelled', 'failed', 'fallback'].includes(storage.outcome as string) || !['complete', 'partial'].includes(storage.coverage as string) || !reasons(storage.invalidReasons)) throw new Error('草稿存储计算诊断无效。');
    for (const key of ['totalWallMs', 'preflightWallMs', 'preflightYieldWallMs']) if (typeof storage[key] !== 'number' || !Number.isFinite(storage[key])) throw new Error('草稿存储计量缺少有限数值。');
    for (const key of ['transactionWallMs', 'transactionEnqueueSyncWallMs', 'transactionCallbacksSyncWallMs', 'transactionValidationSyncWallMs', 'transactionWaitResidualMs', 'postCommitVerifyWallMs', 'postCommitCacheWallMs']) if (storage[key] !== null && (typeof storage[key] !== 'number' || !Number.isFinite(storage[key]))) throw new Error('草稿存储计量阶段无效。');
  }
  const value = raw as unknown as AtlasComputationObservation;
  const checked = observeAtlasComputation({ startedAt: 0, endedAt: value.requestWallMs, requestDecodeMs: value.requestDecodeMs, packetEncodeSendMs: value.packetEncodeSendMs, ownedPreparation: value.phases.ownedPreparation, storageCall: value.phases.storageCall, ownedYields: value.phases.ownedYields, acknowledgements: value.phases.acknowledgements, storageTimings: value.storage ? [value.storage] : [], partialReasons: value.partialReasons });
  checked.invalidReasons = [...new Set([...checked.invalidReasons, ...value.invalidReasons])];
  for (const key of ['observedComputeMs', 'ownedPreparationWallMs', 'ownedYieldWaitMs', 'storageComputeMs', 'storageUnattributedMs', 'workerOutsidePhasesMs', 'ackWaitMs'] as const) {
    const expected = checked[key], actual = value[key];
    if (expected === null || actual === null ? expected !== actual : Math.abs(expected - actual) > timingEpsilon) checked.invalidReasons.push(`reported-${key}-mismatch`);
  }
  if (checked.coverage !== value.coverage) checked.invalidReasons.push('reported-coverage-mismatch');
  if (checked.invalidReasons.length) checked.coverage = 'invalid';
  return checked;
}
/** UI copy; the bridge separately owns the verified receive state. */
export interface AtlasClientView { data: AtlasDraftData; head: AtlasHead; metrics: AtlasMetrics }
export interface AtlasEditResult extends AtlasClientView {
  delta: AtlasEditDelta; dirtyKeys: BlockKey[]; changedVertexIds: number[]; affectedCellIds: number[];
}
export type AtlasPreview = PreparedAtlasEdit & { metrics: AtlasMetrics };
export type AtlasDraftList = AtlasCatalogEntry[];
export interface AtlasProgress { stage: string; completed: number; total: number }
export type AtlasOperation =
  | { type: 'create'; options: Pick<AtlasCreateOptions, 'size' | 'seed' | 'name'>; draftId: string; commandId: string }
  | { type: 'restore'; draftId: string; source: 'current' | 'backup' }
  | { type: 'edit' | 'preview' }
  | { type: 'undo'; commandId: string }
  | { type: 'fork'; name?: string; draftId: string; commandId: string }
  | { type: 'list' }
  | { type: 'receipt'; draftId: string; commandId: string };
export interface AtlasPacket {
  version: 1; id: number; type: 'request' | 'ack' | 'cancel' | 'progress' | 'begin' | 'manifest' | 'block' | 'delta' | 'complete' | 'timing' | 'error';
  sequence?: number; body?: unknown;
}
export interface AtlasStateHeader { head: AtlasHead; root: AtlasStoredRoot; manifestLength: number; blockCount: number }
const TYPES = new Set(['request', 'ack', 'cancel', 'progress', 'begin', 'manifest', 'block', 'delta', 'complete', 'timing', 'error']);
const encoder = new TextEncoder();

/** Every postMessage carries exactly this byte array, so framing is counted. */
export function encodeAtlasPacket(header: AtlasPacket, payload: Uint8Array = new Uint8Array()): Uint8Array<ArrayBuffer> {
  const metadata = encoder.encode(JSON.stringify(header)), size = 4 + metadata.length + payload.length;
  if (size > ATLAS_PACKET_LIMIT) throw new Error('草稿消息超过512 KiB单片上限。');
  const bytes = new Uint8Array(size); new DataView(bytes.buffer).setUint32(0, metadata.length, true);
  bytes.set(metadata, 4); bytes.set(payload, 4 + metadata.length); return bytes;
}
export function decodeAtlasPacket(input: unknown): { header: AtlasPacket; payload: Uint8Array } {
  if (!(input instanceof Uint8Array) || Object.getPrototypeOf(input) !== Uint8Array.prototype || !(input.buffer instanceof ArrayBuffer)
    || input.length < 4 || input.length > ATLAS_PACKET_LIMIT) throw new Error('草稿消息片格式或容量无效。');
  const bytes = input.slice(), size = new DataView(bytes.buffer).getUint32(0, true);
  if (size === 0 || size > bytes.length - 4) throw new Error('草稿消息头长度无效。');
  const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + size))) as AtlasPacket;
  if (!header || typeof header !== 'object' || Array.isArray(header) || header.version !== 1 || !Number.isSafeInteger(header.id) || header.id <= 0
    || !TYPES.has(header.type) || Object.keys(header).some(key => !['version', 'id', 'type', 'sequence', 'body'].includes(key))
    || header.sequence !== undefined && (!Number.isSafeInteger(header.sequence) || header.sequence < 0)) throw new Error('草稿消息版本或请求身份无效。');
  return { header, payload: bytes.slice(4 + size) };
}
