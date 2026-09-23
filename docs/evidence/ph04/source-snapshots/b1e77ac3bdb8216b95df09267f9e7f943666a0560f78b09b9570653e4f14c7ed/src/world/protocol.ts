import type { AtlasCreateOptions, AtlasDraftData, BlockKey } from './model';
import type { AtlasEditDelta, PreparedAtlasEdit } from './transactions';
import type { AtlasCatalogEntry, AtlasStoredRoot } from './storage-types';

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
  version: 1; id: number; type: 'request' | 'ack' | 'cancel' | 'progress' | 'begin' | 'manifest' | 'block' | 'delta' | 'complete' | 'error';
  sequence?: number; body?: unknown;
}
export interface AtlasStateHeader { head: AtlasHead; root: AtlasStoredRoot; manifestLength: number; blockCount: number }
const TYPES = new Set(['request', 'ack', 'cancel', 'progress', 'begin', 'manifest', 'block', 'delta', 'complete', 'error']);
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
