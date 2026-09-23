import type { AtlasBlock, AtlasDraftManifest } from './model';

export interface AtlasStoredRoot {
  format: 'lieguoji-atlas-root'; version: 1; domain: 'atlas-draft-v1';
  draftId: string; revision: number; currentManifest: string; backupManifest: string | null;
  lastCommitId: string; rootDigest: string;
}
export interface AtlasStorageControl {
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  yieldTask?: () => Promise<void>;
  /** commitLocal emits once. Full preparation/staging paths emit no fabricated
   * timing. Observer exceptions never change a storage result. */
  onTiming?: (timing: AtlasStorageTiming) => void;
}
/** Observed elapsed time, not CPU time or physical disk I/O. Null means that
 * phase was not reached. Callback validation is a subset, never added twice. */
export interface AtlasStorageTiming {
  version: 1;
  path: 'local' | 'replay';
  outcome: 'committed' | 'committed-error' | 'replayed' | 'cancelled' | 'failed' | 'fallback';
  coverage: 'complete' | 'partial';
  invalidReasons: string[];
  /** From commitLocal entry to preparing this report; excludes the observer. */
  totalWallMs: number;
  /** Includes WebCrypto elapsed waits and the separately reported yield. */
  preflightWallMs: number;
  preflightYieldWallMs: number;
  /** Enqueue through the authoritative transaction settle continuation. */
  transactionWallMs: number | null;
  transactionEnqueueSyncWallMs: number | null;
  transactionCallbacksSyncWallMs: number | null;
  /** Subset of callbacks: final raw comparison/CAS/quota/write enqueue body. */
  transactionValidationSyncWallMs: number | null;
  /** Wall minus enqueue and callbacks, un-clamped; includes event scheduling. */
  transactionWaitResidualMs: number | null;
  postCommitVerifyWallMs: number | null;
  postCommitCacheWallMs: number | null;
}
export interface AtlasPrepareRequest {
  candidateId: string; commandId: string; manifest: AtlasDraftManifest;
  /** Exact root obtained from open/commit. Null is only for an absent new draft. */
  expectedRoot: AtlasStoredRoot | null;
}
export interface AtlasLocalCommitRequest extends AtlasPrepareRequest { dirtyBlocks: AtlasBlock[] }
export interface AtlasPreparation {
  preparationId: string; candidateId: string; commandId: string; draftId: string;
  requestDigest: string; manifestDigest: string; revision: number;
}
export interface AtlasCommitReceipt {
  draftId: string; commandId: string; candidateId: string; requestDigest: string;
  revision: number; rootDigest: string; manifestDigest: string;
  root: AtlasStoredRoot; baseRoot: AtlasStoredRoot | null;
  committed: true; replayed: boolean; logicalBytes: number; pairReferencedBytes: number;
}
export interface AtlasReadHandle {
  draftId: string; source: 'current' | 'backup'; readOnly: boolean;
  root: AtlasStoredRoot; manifest: AtlasDraftManifest; manifestDigest: string;
  /** Logical encoded referenced content, not physical disk allocation. */
  referencedBytes: number;
  /** Null when an explicitly recovered other slot has missing raw blocks. */
  pairReferencedBytes: number | null;
}
export interface AtlasBlockPage { blocks: AtlasBlock[]; nextCursor: number | null; encodedBytes: number }
export interface AtlasCatalogEntry {
  draftId: string; name: string; revision: number; size: number; rootDigest: string;
  currentManifest: string; backupAvailable: boolean;
}
