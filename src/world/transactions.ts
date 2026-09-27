import { cloneDetailCoastTile, encodeDetailCoastTile } from './detail-coast-codec';
import type { DetailCoastKey } from './detail-coast-types';
import { isDetailCoastDocument } from './generation-format';
import {
  cloneBlock, encodeBlock, getCellLayerSlot, getVertexSlot, hashBlock,
  UNASSIGNED, validateBlock, yieldAtlas,
  type AtlasBlock, type BlockKey,
} from './model';
import { cloneAtlasDocument, cloneVerifiedAtlasDocument, encodeAtlasManifest, hashAtlasManifest, isGenerationDocument, type AtlasDocument, type AtlasManifest } from './atlas-format';
import { assertAtlasConstraintsOnly, assertAtlasLocksPreserved, assertAtlasReplacementLocksPreserved, encodeAtlasCellLockBlock, hashAtlasCellLockBlock, hashAtlasLockSet, lockKey } from './generation-locks';
import { generationExact, generationInt, validateCellRectangle, type AtlasCellRectangle } from './generation-contract';
import { cellBlock, incidentCellIds, validateLocalGeometry } from './topology';

export const MAX_EDIT_CELLS = 1024;
export const MAX_EDIT_VERTICES = 4096;
export const MAX_EDIT_MESSAGE_BYTES = 128 * 1024;
type CellPatch<T extends Int32Array | Uint32Array> = { ids: Uint32Array; values: T };
export type AtlasPatch = {
  vertices?: { ids: Uint32Array; xyQ: Int32Array };
  elevation?: CellPatch<Int32Array>;
  simMembership?: CellPatch<Uint32Array>;
  adminMembership?: CellPatch<Uint32Array>;
};
export interface AtlasEditCommand {
  format: 'lieguoji-atlas-edit'; version: 1;
  draftId: string; commandId: string;
  expectedRevision: number; expectedRootDigest: string;
  reason: string; patch: AtlasPatch;
}
export interface AtlasEditControl {
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  yieldTask?: () => Promise<void>;
}
export interface AtlasPublishedRoot {
  draftId: string; commandId: string; revision: number;
  rootDigest: string; manifestDigest: string;
}
export interface AtlasEditDelta {
  format: 'lieguoji-atlas-delta'; version: 1;
  draftId: string; commandId: string; revision: number; manifestDigest: string;
  baseRevision: number; baseRootDigest: string; rootDigest: string;
  reason: string; patch: AtlasPatch;
  blockRefs: { key: BlockKey; hash: string }[];
}
export interface PreparedAtlasReplacement {
  candidateId: string; commandId: string; baseRevision: number; baseRootDigest: string; baseManifestDigest: string;
  revision: number; manifestDigest: string; reason: string;
}
export interface AtlasConstraintEdit {
  format: 'lieguoji-atlas-constraint-edit'; version: 1; draftId: string; commandId: string;
  expectedRevision: number; expectedRootDigest: string; rectangle: AtlasCellRectangle;
  mask: 1 | 2 | 3; action: 'set' | 'clear';
}
export interface PreparedAtlasConstraints extends PreparedAtlasReplacement {
  rectangle: AtlasCellRectangle; mask: 1 | 2 | 3; action: 'set' | 'clear';
  changedCellCount: number; beforeLockSetDigest: string; afterLockSetDigest: string;
}
type ReplacementMode = 'geography' | 'constraints';
export interface PreparedAtlasEdit {
  candidateId: string; commandId: string; baseRevision: number;
  baseRootDigest: string; revision: number; manifestDigest: string;
  readKeys: BlockKey[]; writeKeys: BlockKey[];
  geometryVertexIds: number[]; affectedCellIds: number[];
  ownerCoordinates: string[]; displayBlocks: string[];
  directCellCount: number; affectedCellCount: number; localBudgetEligible: boolean;
  requestBytes: number; responseBytes: number; preparationMs: number; cooperativeYieldMs: number;
}
type UndoEntry<T extends AtlasDocument> = { kind: 'patch'; inverse: AtlasPatch } | { kind: 'whole'; data: T; bytes: number; mode: ReplacementMode };
type Candidate<T extends AtlasDocument> = {
  public: PreparedAtlasEdit; data: T; inverse: AtlasPatch;
  delta: AtlasEditDelta; undo: boolean;
};
const HEX = /^[a-f0-9]{64}$/;
const COMMAND = /^edit-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(k => Object.hasOwn(value, k)) && Reflect.ownKeys(value).every(k => typeof k === 'string' && (required.includes(k) || optional.includes(k)));
function ownArray(value: Int32Array | Uint32Array, kind: 'int' | 'uint') {
  return value.buffer instanceof ArrayBuffer && Object.getPrototypeOf(value) === (kind === 'int' ? Int32Array.prototype : Uint32Array.prototype)
    && Reflect.ownKeys(value).length === value.length;
}
function abort(control?: AtlasEditControl) {
  if (control?.signal?.aborted) throw new DOMException('编辑已取消，原草稿未修改。', 'AbortError');
}
async function checkpoint(control: AtlasEditControl | undefined, stage: string, completed: number, total: number) {
  abort(control); control?.onProgress?.({ stage, completed, total });
  if (control?.yieldTask) await control.yieldTask();
  else await new Promise<void>(resolve => setTimeout(resolve, 0));
  abort(control);
}
function idsAreUnique(ids: Uint32Array, maximum: number) {
  return ownArray(ids, 'uint') && ids.length > 0 && ids.length <= maximum && new Set(ids).size === ids.length;
}
export function validateAtlasPatch(raw: unknown): raw is AtlasPatch {
  if (!record(raw) || !exact(raw, [], ['vertices', 'elevation', 'simMembership', 'adminMembership']) || Object.keys(raw).length === 0) return false;
  if (Object.values(raw).some(value => value === undefined)) return false;
  if (raw.vertices !== undefined) {
    const p = raw.vertices;
    if (!record(p) || !exact(p, ['ids', 'xyQ']) || !(p.ids instanceof Uint32Array) || !(p.xyQ instanceof Int32Array)
      || !idsAreUnique(p.ids, MAX_EDIT_VERTICES) || !ownArray(p.xyQ, 'int') || p.xyQ.length !== p.ids.length * 2) return false;
  }
  const cells = new Set<number>();
  for (const key of ['elevation', 'simMembership', 'adminMembership'] as const) {
    const p = raw[key]; if (p === undefined) continue;
    if (!record(p) || !exact(p, ['ids', 'values']) || !(p.ids instanceof Uint32Array)
      || !(key === 'elevation' ? p.values instanceof Int32Array : p.values instanceof Uint32Array)
      || !idsAreUnique(p.ids, MAX_EDIT_CELLS) || !ownArray(p.values as Int32Array | Uint32Array, key === 'elevation' ? 'int' : 'uint') || (p.values as Int32Array).length !== p.ids.length) return false;
    for (const id of p.ids) cells.add(id);
  }
  return cells.size <= MAX_EDIT_CELLS;
}
export function validateAtlasEdit(raw: unknown): raw is AtlasEditCommand {
  return record(raw) && exact(raw, ['format', 'version', 'draftId', 'commandId', 'expectedRevision', 'expectedRootDigest', 'reason', 'patch'])
    && raw.format === 'lieguoji-atlas-edit' && raw.version === 1
    && typeof raw.draftId === 'string' && /^atlas-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw.draftId)
    && typeof raw.commandId === 'string' && COMMAND.test(raw.commandId)
    && Number.isSafeInteger(raw.expectedRevision) && (raw.expectedRevision as number) >= 0
    && typeof raw.expectedRootDigest === 'string' && HEX.test(raw.expectedRootDigest)
    && typeof raw.reason === 'string' && raw.reason.trim().length > 0 && raw.reason.length <= 120
    && validateAtlasPatch(raw.patch);
}

/** Exact logical wire representation: canonical metadata + tagged little-endian arrays. */
export function encodeAtlasEditMessage(value: AtlasEditCommand | AtlasEditDelta): Uint8Array {
  if (!validateAtlasEdit(value) && !validateAtlasDelta(value)) throw new Error('不能编码未知版本或无效编辑字段。');
  const { patch } = value;
  const metadata = value.format === 'lieguoji-atlas-edit'
    ? { format: value.format, version: value.version, draftId: value.draftId, commandId: value.commandId, expectedRevision: value.expectedRevision, expectedRootDigest: value.expectedRootDigest, reason: value.reason }
    : { format: value.format, version: value.version, draftId: value.draftId, commandId: value.commandId, baseRevision: value.baseRevision, baseRootDigest: value.baseRootDigest, revision: value.revision, rootDigest: value.rootDigest, manifestDigest: value.manifestDigest, reason: value.reason, blockRefs: value.blockRefs.map(ref => ({ key: ref.key, hash: ref.hash })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
  const header = encoder.encode(JSON.stringify(metadata));
  const arrays: { tag: number; value: Int32Array | Uint32Array }[] = [];
  if (patch.vertices) arrays.push({ tag: 1, value: patch.vertices.ids }, { tag: 2, value: patch.vertices.xyQ });
  if (patch.elevation) arrays.push({ tag: 3, value: patch.elevation.ids }, { tag: 4, value: patch.elevation.values });
  if (patch.simMembership) arrays.push({ tag: 5, value: patch.simMembership.ids }, { tag: 6, value: patch.simMembership.values });
  if (patch.adminMembership) arrays.push({ tag: 7, value: patch.adminMembership.ids }, { tag: 8, value: patch.adminMembership.values });
  const size = 8 + header.byteLength + arrays.reduce((sum, a) => sum + 6 + a.value.byteLength, 0);
  if (size > MAX_EDIT_MESSAGE_BYTES) throw new Error('编辑消息超过局部事务预算。');
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer); view.setUint32(0, header.byteLength, true); view.setUint32(4, arrays.length, true); bytes.set(header, 8);
  let offset = 8 + header.byteLength;
  for (const array of arrays) {
    view.setUint8(offset++, array.tag); view.setUint8(offset++, array.value instanceof Int32Array ? 1 : 2);
    view.setUint32(offset, array.value.length, true); offset += 4;
    for (const n of array.value) { if (array.value instanceof Int32Array) view.setInt32(offset, n, true); else view.setUint32(offset, n, true); offset += 4; }
  }
  return bytes;
}

export function validateAtlasDelta(raw: unknown): raw is AtlasEditDelta {
  if (!record(raw) || !exact(raw, ['format', 'version', 'draftId', 'commandId', 'baseRevision', 'baseRootDigest', 'revision', 'rootDigest', 'manifestDigest', 'reason', 'patch', 'blockRefs'])
    || raw.format !== 'lieguoji-atlas-delta' || raw.version !== 1
    || typeof raw.rootDigest !== 'string' || !HEX.test(raw.rootDigest) || typeof raw.manifestDigest !== 'string' || !HEX.test(raw.manifestDigest)
    || !Number.isSafeInteger(raw.revision) || raw.revision !== (raw.baseRevision as number) + 1
    || !Array.isArray(raw.blockRefs) || Object.getPrototypeOf(raw.blockRefs) !== Array.prototype
    || Reflect.ownKeys(raw.blockRefs).length !== raw.blockRefs.length + 1 || raw.blockRefs.length === 0 || raw.blockRefs.length > 1024) return false;
  if (!validateAtlasEdit({ format: 'lieguoji-atlas-edit', version: 1, draftId: raw.draftId, commandId: raw.commandId, expectedRevision: raw.baseRevision, expectedRootDigest: raw.baseRootDigest, reason: raw.reason, patch: raw.patch })) return false;
  const seen = new Set<string>();
  for (const ref of raw.blockRefs) {
    if (!record(ref) || !exact(ref, ['key', 'hash']) || typeof ref.key !== 'string' || !/^(geometry|elevation|sim-membership|admin-membership):(?:[0-9]|1[0-5]):(?:[0-9]|1[0-5])$/.test(ref.key)
      || typeof ref.hash !== 'string' || !HEX.test(ref.hash) || seen.has(ref.key)) return false;
    seen.add(ref.key);
  }
  return true;
}

/** Strict bounded decoder for the actual binary request / successful delta. */
export function decodeAtlasEditMessage(input: Uint8Array): AtlasEditCommand | AtlasEditDelta {
  if (!(input instanceof Uint8Array) || !(input.buffer instanceof ArrayBuffer) || input.byteLength < 8 || input.byteLength > MAX_EDIT_MESSAGE_BYTES) throw new Error('编辑消息大小或缓冲区无效。');
  const bytes = input.slice(), view = new DataView(bytes.buffer), headerLength = view.getUint32(0, true), count = view.getUint32(4, true);
  if (headerLength > bytes.length - 8 || count === 0 || count > 8 || count % 2) throw new Error('编辑消息头或字段数量无效。');
  const header: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + headerLength)));
  if (!record(header) || Object.hasOwn(header, 'patch')) throw new Error('编辑消息头无效。');
  let offset = 8 + headerLength; const fields = new Map<number, Uint32Array | Int32Array>();
  for (let i = 0; i < count; i++) {
    if (offset + 6 > bytes.length) throw new Error('编辑消息字段被截断。');
    const tag = view.getUint8(offset++), kind = view.getUint8(offset++), length = view.getUint32(offset, true); offset += 4;
    if (tag < 1 || tag > 8 || fields.has(tag) || kind !== ([2, 4].includes(tag) ? 1 : 2) || length === 0 || offset + length * 4 > bytes.length) throw new Error('编辑消息类型、数量或字段重复。');
    const values = kind === 1 ? new Int32Array(length) : new Uint32Array(length);
    for (let j = 0; j < length; j++) { values[j] = kind === 1 ? view.getInt32(offset, true) : view.getUint32(offset, true); offset += 4; }
    fields.set(tag, values);
  }
  if (offset !== bytes.length) throw new Error('编辑消息包含多余字节。');
  const patch: AtlasPatch = {};
  for (const [id, value] of [[1, 2], [3, 4], [5, 6], [7, 8]]) if (fields.has(id) !== fields.has(value)) throw new Error('编辑字段缺少ID或值。');
  if (fields.has(1)) patch.vertices = { ids: fields.get(1) as Uint32Array, xyQ: fields.get(2) as Int32Array };
  if (fields.has(3)) patch.elevation = { ids: fields.get(3) as Uint32Array, values: fields.get(4) as Int32Array };
  if (fields.has(5)) patch.simMembership = { ids: fields.get(5) as Uint32Array, values: fields.get(6) as Uint32Array };
  if (fields.has(7)) patch.adminMembership = { ids: fields.get(7) as Uint32Array, values: fields.get(8) as Uint32Array };
  const decoded = { ...header, patch };
  if (!validateAtlasEdit(decoded) && !validateAtlasDelta(decoded)) throw new Error('编辑消息版本、基线或内容未通过校验。');
  const canonical = encodeAtlasEditMessage(decoded);
  if (canonical.length !== bytes.length || !canonical.every((v, i) => v === bytes[i])) throw new Error('编辑消息不是规范编码。');
  return decoded;
}

/** Only this session owns trusted blocks. Every ingress/egress receives a copy. */
export class OwnedAtlasSession<T extends AtlasDocument = AtlasDocument> {
  #data: T;
  #rootDigest: string;
  #manifestDigest: string;
  #candidates = new Map<string, Candidate<T>>();
  #undo: UndoEntry<T>[] = [];
  #replacement?: { data: T; public: PreparedAtlasReplacement; undo: boolean; retainedBytes: number; mode: ReplacementMode };
  #retainedBytes = 0;
  #preparing = false;
  private constructor(data: T, rootDigest: string, manifestDigest: string) {
    this.#data = data; this.#rootDigest = rootDigest; this.#manifestDigest = manifestDigest;
  }
  static async open<T extends AtlasDocument>(raw: T, rootDigest: string, control?: AtlasEditControl) {
    if (!HEX.test(rootDigest)) throw new Error('草稿根摘要无效。');
    abort(control);
    const owned = await cloneVerifiedAtlasDocument(raw, control); abort(control);
    const manifestDigest = await hashAtlasManifest(owned.manifest); abort(control);
    return new OwnedAtlasSession(owned, rootDigest, manifestDigest);
  }
  get format() { return this.#data.manifest.version; }
  get head() { return { draftId: this.#data.manifest.draftId, revision: this.#data.manifest.revision, rootDigest: this.#rootDigest, manifestDigest: this.#manifestDigest, undoCount: this.#undo.length }; }
  get metadata(): Pick<AtlasManifest, 'atlasId' | 'name'> { return { atlasId: this.#data.manifest.atlasId, name: this.#data.manifest.name }; }
  readLocks() { return 'locks' in this.#data ? [...this.#data.locks.values()].map(lock => structuredClone(lock)) : []; }
  readDetailCoast(keys: readonly DetailCoastKey[]) {
    const data = this.#data;
    if (!isDetailCoastDocument(data) || keys.length > 16 || new Set(keys).size !== keys.length) throw new Error('细海岸读取需要第四版和不超过16个独立块。');
    return keys.map(key => { const tile = data.detailCoast.get(key); if (!tile) throw new Error('细海岸引用缺失。'); return cloneDetailCoastTile(tile); });
  }
  snapshot() { return cloneAtlasDocument(this.#data); }
  async snapshotAsync(control?: AtlasEditControl): Promise<T> {
    abort(control);
    const source = this.#data, rootDigest = this.#rootDigest;
    const owned = await cloneVerifiedAtlasDocument(source, control); abort(control);
    if (this.#data !== source || this.#rootDigest !== rootDigest) throw new Error('复制期间草稿已变化，请重新读取当前版本。');
    return owned;
  }
  manifest() { return structuredClone(this.#data.manifest); }
  readBlocks(keys: readonly BlockKey[]) {
    return keys.map(key => { const block = this.#data.blocks.get(key); if (!block) throw new Error('请求的数据块不存在。'); return cloneBlock(block); });
  }
  async prepare(raw: AtlasEditCommand, control?: AtlasEditControl): Promise<PreparedAtlasEdit> {
    if (this.#data.manifest.version === 4) throw new Error('第四版细海岸编辑需要完整候选，旧局部增量不支持；原图保持不变。');
    const started = performance.now();
    if (!validateAtlasEdit(raw)) throw new Error('编辑字段、类型或局部范围无效。');
    // Copy before the first await; later caller mutations cannot alter the candidate.
    const command = structuredClone(raw);
    if (this.#preparing || this.#candidates.size || this.#replacement) throw new Error('已有一笔编辑等待完成或取消。');
    if (command.draftId !== this.#data.manifest.draftId || command.expectedRevision !== this.#data.manifest.revision || command.expectedRootDigest !== this.#rootDigest) throw new Error('草稿版本已变化，请重新读取后编辑。');
    if (this.#data.manifest.revision >= Number.MAX_SAFE_INTEGER) throw new Error('草稿版本达到上限。');
    const requestBytes = encodeAtlasEditMessage(command).byteLength;
    if (requestBytes > MAX_EDIT_MESSAGE_BYTES) throw new Error('本次编辑消息超过局部事务预算。');
    this.#preparing = true;
    try { return await this.#prepare(command, requestBytes, started, control); }
    finally { this.#preparing = false; }
  }
  async #prepare(command: AtlasEditCommand, requestBytes: number, started: number, control?: AtlasEditControl): Promise<PreparedAtlasEdit> {
    abort(control); let cooperativeYieldMs = 0;
    const candidate = { ...this.#data, manifest: structuredClone(this.#data.manifest), blocks: new Map(this.#data.blocks) } as T;
    const inverse: AtlasPatch = {}, applied: AtlasPatch = {};
    const read = new Set<BlockKey>(), writes = new Set<BlockKey>(), affected = new Set<number>(), geometryVertexIds: number[] = [];
    const ensureCopy = (key: BlockKey) => {
      read.add(key); if (!writes.has(key)) { candidate.blocks.set(key, cloneBlock(this.#data.blocks.get(key)!)); writes.add(key); }
    };
    for (const key of ['elevation', 'simMembership', 'adminMembership'] as const) {
      const patch = command.patch[key]; if (!patch) continue;
      const layer = key === 'elevation' ? 'elevation' : key === 'simMembership' ? 'sim-membership' : 'admin-membership';
      const permitted = new Set(key === 'simMembership' ? candidate.manifest.catalogs.simRegions.map(row => row.id) : candidate.manifest.catalogs.administration.filter(row => row.kind === 'leaf').map(row => row.id));
      const ids: number[] = [], before: number[] = [], after: number[] = [];
      for (let i = 0; i < patch.ids.length; i++) {
        const id = patch.ids[i], value = patch.values[i], slot = getCellLayerSlot(candidate, layer, id);
        read.add(slot.key);
        if (key !== 'elevation' && value !== UNASSIGNED && !permitted.has(value)) throw new Error('编辑引用了不存在的模拟区或行政叶。');
        const old = slot.block.values[slot.slot]; if (old === value) continue;
        ensureCopy(slot.key); const target = getCellLayerSlot(candidate, layer, id);
        target.block.values[target.slot] = value; ids.push(id); before.push(old); after.push(value); affected.add(id);
      }
      if (ids.length) {
        if (key === 'elevation') { inverse.elevation = { ids: new Uint32Array(ids), values: new Int32Array(before) }; applied.elevation = { ids: new Uint32Array(ids), values: new Int32Array(after) }; }
        else { inverse[key] = { ids: new Uint32Array(ids), values: new Uint32Array(before) }; applied[key] = { ids: new Uint32Array(ids), values: new Uint32Array(after) }; }
      }
    }
    if (command.patch.vertices) {
      const p = command.patch.vertices, ids: number[] = [], before: number[] = [], after: number[] = [];
      for (let i = 0; i < p.ids.length; i++) {
        const id = p.ids[i], x = p.xyQ[i * 2], y = p.xyQ[i * 2 + 1], source = getVertexSlot(candidate, id); read.add(source.key);
        const oldX = source.block.xyQ[source.slot * 2], oldY = source.block.xyQ[source.slot * 2 + 1];
        if (x === oldX && y === oldY) continue;
        ensureCopy(source.key); const target = getVertexSlot(candidate, id);
        target.block.xyQ[target.slot * 2] = x; target.block.xyQ[target.slot * 2 + 1] = y;
        ids.push(id); before.push(oldX, oldY); after.push(x, y); geometryVertexIds.push(id);
        for (const cell of incidentCellIds(candidate.manifest.spec, id)) affected.add(cell);
      }
      if (ids.length) { inverse.vertices = { ids: new Uint32Array(ids), xyQ: new Int32Array(before) }; applied.vertices = { ids: new Uint32Array(ids), xyQ: new Int32Array(after) }; }
    }
    if (!writes.size) throw new Error('这笔编辑没有改变任何字段。');
    // All shared geometry is checked after applying the whole patch, never one vertex at a time.
    validateLocalGeometry(candidate, geometryVertexIds);
    for (const cell of affected) {
      if (!geometryVertexIds.length) break;
      const cols = candidate.manifest.spec.columns, row = Math.floor(cell / cols), col = cell % cols;
      for (const id of [row * (cols + 1) + col, row * (cols + 1) + col + 1, (row + 1) * (cols + 1) + col, (row + 1) * (cols + 1) + col + 1]) read.add(getVertexSlot(candidate, id).key);
    }
    const writeKeys = [...writes].sort();
    for (let i = 0; i < writeKeys.length; i++) {
      const key = writeKeys[i], block = candidate.blocks.get(key)!;
      if (!validateBlock(block, candidate.manifest.spec)) throw new Error('编辑后的数据块超出字段或几何限制。');
      const hash = await hashBlock(block), reference = candidate.manifest.blockRefs.find(ref => ref.key === key);
      if (!reference) throw new Error('候选缺少数据块引用。'); reference.hash = hash;
      const beforeYield = performance.now();
      await checkpoint(control, '校验局部数据块', i + 1, writeKeys.length);
      cooperativeYieldMs += performance.now() - beforeYield;
    }
    assertAtlasLocksPreserved(this.#data, candidate, [...affected], geometryVertexIds);
    candidate.manifest.revision++;
    const manifestDigest = await hashAtlasManifest(candidate.manifest); abort(control);
    // Reserved 64-byte ASCII digest is private until publish substitutes the actual durable root.
    const delta: AtlasEditDelta = { format: 'lieguoji-atlas-delta', version: 1, draftId: command.draftId, commandId: command.commandId, baseRevision: command.expectedRevision, baseRootDigest: command.expectedRootDigest, rootDigest: '0'.repeat(64), revision: candidate.manifest.revision, manifestDigest, reason: command.reason, patch: applied, blockRefs: candidate.manifest.blockRefs.filter(ref => writes.has(ref.key)).map(ref => ({ ...ref })) };
    const responseBytes = encodeAtlasEditMessage(delta).byteLength;
    if (responseBytes > MAX_EDIT_MESSAGE_BYTES) throw new Error('本次编辑回执超过局部事务预算。');
    const publicInfo: PreparedAtlasEdit = {
      candidateId: crypto.randomUUID(), commandId: command.commandId, baseRevision: command.expectedRevision, baseRootDigest: command.expectedRootDigest,
      revision: candidate.manifest.revision, manifestDigest, readKeys: [...read].sort(), writeKeys,
      geometryVertexIds, affectedCellIds: [...affected].sort((a, b) => a - b),
      ownerCoordinates: [...new Set(writeKeys.map(key => key.split(':').slice(1).join(':')))].sort(),
      displayBlocks: [...new Set([...affected].map(cell => { const p = cellBlock(candidate.manifest.spec, cell); return `${p.bx}:${p.by}`; }))].sort(),
      directCellCount: new Set([...(command.patch.elevation?.ids ?? []), ...(command.patch.simMembership?.ids ?? []), ...(command.patch.adminMembership?.ids ?? [])]).size,
      affectedCellCount: affected.size, localBudgetEligible: affected.size <= MAX_EDIT_CELLS && writeKeys.length <= 4,
      requestBytes, responseBytes, preparationMs: performance.now() - started, cooperativeYieldMs,
    };
    this.#candidates.set(publicInfo.candidateId, { public: publicInfo, data: candidate, inverse, delta, undo: false });
    return structuredClone(publicInfo);
  }
  candidateStorageDocument(candidateId: string): T {
    const c = this.#candidate(candidateId), document = { ...c.data, manifest: structuredClone(c.data.manifest), blocks: new Map(c.public.writeKeys.map(key => [key, cloneBlock(c.data.blocks.get(key)!)])) } as T;
    if ('locks' in document) document.locks = structuredClone(document.locks);
    return document;
  }
  candidateManifest(candidateId: string): T['manifest'] { return structuredClone(this.#candidate(candidateId).data.manifest); }
  candidateBlocks(candidateId: string): AtlasBlock[] { const c = this.#candidate(candidateId); return c.public.writeKeys.map(key => cloneBlock(c.data.blocks.get(key)!)); }
  discard(candidateId: string) { this.#candidate(candidateId); this.#candidates.delete(candidateId); }
  /** Worker calls this only after the persistence transaction reports complete. */
  publish(candidateId: string, receipt: AtlasPublishedRoot): AtlasEditDelta {
    const c = this.#candidate(candidateId);
    if (receipt.draftId !== c.data.manifest.draftId || receipt.commandId !== c.public.commandId || receipt.revision !== c.public.revision
      || receipt.manifestDigest !== c.public.manifestDigest || !HEX.test(receipt.rootDigest)) throw new Error('持久化回执与待提交编辑不一致。');
    if (c.public.baseRevision !== this.#data.manifest.revision || c.public.baseRootDigest !== this.#rootDigest) throw new Error('编辑会话已变化，不能发布旧候选。');
    this.#data = c.data; this.#rootDigest = receipt.rootDigest; this.#manifestDigest = receipt.manifestDigest;
    if (c.undo) this.#popUndo(); else this.#pushUndo({ kind: 'patch', inverse: c.inverse });
    this.#candidates.clear(); return structuredClone({ ...c.delta, rootDigest: receipt.rootDigest });
  }
  async prepareUndo(commandId: string, control?: AtlasEditControl) {
    const entry = this.#undo.at(-1); if (!entry || entry.kind !== 'patch') throw new Error('当前撤销需要完整草稿事务。');
    const inverse = entry.inverse;
    const head = this.head;
    const result = await this.prepare({ format: 'lieguoji-atlas-edit', version: 1, draftId: head.draftId, commandId, expectedRevision: head.revision, expectedRootDigest: head.rootDigest, reason: '撤销上一笔编辑', patch: structuredClone(inverse) }, control);
    this.#candidate(result.candidateId).undo = true; return result;
  }
  get undoKind() { return this.#undo.at(-1)?.kind ?? null; }
  get replacementPending() { return !!this.#replacement; }
  #pushUndo(entry: UndoEntry<T>) {
    this.#undo.push(entry); if (entry.kind === 'whole') this.#retainedBytes += entry.bytes;
    if (this.#undo.length > 100) { const dropped = this.#undo.shift()!; if (dropped.kind === 'whole') this.#retainedBytes -= dropped.bytes; }
  }
  #popUndo() { const entry = this.#undo.pop(); if (entry?.kind === 'whole') this.#retainedBytes -= entry.bytes; }
  prepareReplacement(raw: T, commandId: string, reason: string, control?: AtlasEditControl) { return this.#prepareReplacement(raw, commandId, reason, false, control); }
  async prepareConstraints(raw: AtlasConstraintEdit, control?: AtlasEditControl): Promise<PreparedAtlasConstraints> {
    if (this.#preparing || this.#candidates.size || this.#replacement) throw new Error('已有一笔编辑等待完成或取消。');
    if (!isGenerationDocument(this.#data)) throw new Error('区域锁需要生成版本草稿。');
    if (!generationExact(raw, ['format', 'version', 'draftId', 'commandId', 'expectedRevision', 'expectedRootDigest', 'rectangle', 'mask', 'action'])
      || raw.format !== 'lieguoji-atlas-constraint-edit' || raw.version !== 1 || typeof raw.commandId !== 'string' || !COMMAND.test(raw.commandId)
      || raw.draftId !== this.#data.manifest.draftId || raw.expectedRevision !== this.#data.manifest.revision || raw.expectedRootDigest !== this.#rootDigest
      || !validateCellRectangle(raw.rectangle, this.#data.manifest.spec) || !generationInt(raw.mask, 1, 3) || !['set', 'clear'].includes(raw.action)) throw new Error('区域锁命令、范围或基线无效。');
    const command = structuredClone(raw), data = cloneAtlasDocument(this.#data);
    this.#preparing = true;
    try {
      abort(control); const touched = new Set<string>(); let changedCellCount = 0;
      const r = command.rectangle;
      for (let row = r.row; row < r.row + r.rows; row++) {
        for (let column = r.column; column < r.column + r.columns; column++) {
          const bx = Math.floor(column / 32), by = Math.floor(row / 32), key = lockKey(bx, by), slot = row % 32 * 32 + column % 32;
          const existing = data.locks.get(key), before = existing?.flags[slot] ?? 0;
          const after = command.action === 'set' ? before | command.mask : before & ~command.mask;
          if (before === after) continue;
          const block = existing ?? { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx, by, flags: new Uint8Array(1024) };
          block.flags[slot] = after; data.locks.set(key, block); touched.add(key); changedCellCount++;
        }
        if ((row - r.row + 1) % 8 === 0 || row + 1 === r.row + r.rows) await yieldAtlas(control, '计算选区锁定变化', row - r.row + 1, r.rows);
      }
      if (!changedCellCount) throw new Error('所选区域已经处于该锁定状态，原草稿未改变。');
      const refs = new Map(data.manifest.constraints.lockRefs.map(ref => [lockKey(ref.bx, ref.by), ref]));
      for (const key of touched) {
        abort(control); const block = data.locks.get(key)!;
        if (block.flags.every(flag => flag === 0)) { data.locks.delete(key); refs.delete(lockKey(block.bx, block.by)); }
        else refs.set(lockKey(block.bx, block.by), { bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) });
      }
      data.manifest.constraints.lockRefs = [...refs.values()].sort((a, b) => a.by - b.by || a.bx - b.bx);
      const beforeLockSetDigest = await hashAtlasLockSet(this.#data.manifest.constraints, this.#data.manifest.spec);
      const afterLockSetDigest = await hashAtlasLockSet(data.manifest.constraints, data.manifest.spec);
      data.manifest.revision++;
      const prepared = await this.#prepareReplacement(data, command.commandId, command.action === 'set' ? '锁定选区地理' : '解除选区地理锁', false, control, 'constraints', true);
      return { ...prepared, rectangle: structuredClone(r), mask: command.mask, action: command.action, changedCellCount, beforeLockSetDigest, afterLockSetDigest };
    } finally { this.#preparing = false; }
  }
  async #prepareReplacement(raw: T, commandId: string, reason: string, undo: boolean, control?: AtlasEditControl, mode: ReplacementMode = 'geography', held = false): Promise<PreparedAtlasReplacement> {
    if (!held && (this.#preparing || this.#candidates.size || this.#replacement)) throw new Error('已有一笔编辑等待完成或取消。');
    if (!COMMAND.test(commandId) || !reason.trim() || reason.length > 120) throw new Error('完整编辑命令无效。');
    this.#preparing = true;
    const source = this.#data, sourceRootDigest = this.#rootDigest, sourceManifestDigest = this.#manifestDigest;
    const checkSource = () => {
      abort(control);
      if (this.#data !== source || this.#rootDigest !== sourceRootDigest || this.#manifestDigest !== sourceManifestDigest) throw new Error('准备完整地图期间持久基线已变化。');
    };
    try {
      const data = await cloneVerifiedAtlasDocument(raw, control); checkSource();
      const base = source.manifest, next = data.manifest;
      if (next.version !== base.version || next.draftId !== base.draftId || next.atlasId !== base.atlasId || next.revision !== base.revision + 1 || !Number.isSafeInteger(next.revision)
        || next.name !== base.name || next.seed !== base.seed || JSON.stringify(next.spec) !== JSON.stringify(base.spec) || JSON.stringify(next.catalogs) !== JSON.stringify(base.catalogs)) throw new Error('完整候选改变了固定身份或未绑定当前修订。');
      if (mode === 'constraints') assertAtlasConstraintsOnly(source, data); else await assertAtlasReplacementLocksPreserved(source, data, control);
      checkSource();
      let retainedBytes = 0;
      if (!undo) {
        const blocks = [...source.blocks.values()], locks = 'locks' in source ? [...source.locks.values()] : [], detailCoast = isDetailCoastDocument(source) ? [...source.detailCoast.values()] : [], total = 1 + blocks.length + locks.length + detailCoast.length;
        for (let index = 0; index < total; index++) {
          checkSource();
          retainedBytes += index === 0 ? encodeAtlasManifest(base).length : index <= blocks.length ? encodeBlock(blocks[index - 1]).length : index <= blocks.length + locks.length ? encodeAtlasCellLockBlock(locks[index - blocks.length - 1]).length : encodeDetailCoastTile(detailCoast[index - blocks.length - locks.length - 1]).length;
          // Count actual canonical encodings, including manifest and locks.
          // Yield completed work before another whole-document copy can start.
          if ((index + 1) % 8 === 0 || index + 1 === total) {
            await checkpoint(control, '核算完整地图撤销字节', index + 1, total); checkSource();
          }
        }
      }
      if (!undo && this.#retainedBytes + retainedBytes > 64 * 1024 * 1024) throw new Error('本次完整地图撤销记录超过当前会话64 MiB预算。原图未改变；请先保存并重新打开草稿后生成。');
      const publicInfo: PreparedAtlasReplacement = { candidateId: crypto.randomUUID(), commandId, baseRevision: base.revision, baseRootDigest: sourceRootDigest, baseManifestDigest: sourceManifestDigest, revision: next.revision, manifestDigest: await hashAtlasManifest(next), reason };
      checkSource(); this.#replacement = { data, public: publicInfo, undo, retainedBytes, mode }; return structuredClone(publicInfo);
    } finally { if (!held) this.#preparing = false; }
  }
  replacementMode(candidateId: string): ReplacementMode { return this.#fullCandidate(candidateId).mode; }
  replacementDocument(candidateId: string): T { return cloneAtlasDocument(this.#fullCandidate(candidateId).data); }
  async replacementDocumentAsync(candidateId: string, control?: AtlasEditControl): Promise<T> {
    abort(control);
    const candidate = this.#fullCandidate(candidateId), source = candidate.data;
    const owned = await cloneVerifiedAtlasDocument(source, control); abort(control);
    if (this.#fullCandidate(candidateId) !== candidate || candidate.data !== source) throw new Error('复制期间完整地图候选已变化。');
    return owned;
  }
  discardReplacement(candidateId: string) { this.#fullCandidate(candidateId); this.#replacement = undefined; }
  publishReplacement(candidateId: string, receipt: AtlasPublishedRoot) {
    const c = this.#fullCandidate(candidateId), p = c.public;
    if (receipt.draftId !== c.data.manifest.draftId || receipt.commandId !== p.commandId || receipt.revision !== p.revision || receipt.manifestDigest !== p.manifestDigest || !HEX.test(receipt.rootDigest)
      || p.baseRevision !== this.#data.manifest.revision || p.baseRootDigest !== this.#rootDigest) throw new Error('完整候选的持久回执或基线不符。');
    if (c.undo) this.#popUndo(); else this.#pushUndo({ kind: 'whole', data: this.#data, bytes: c.retainedBytes, mode: c.mode });
    this.#data = c.data; this.#rootDigest = receipt.rootDigest; this.#manifestDigest = receipt.manifestDigest; this.#replacement = undefined;
  }
  async prepareReplacementUndo(commandId: string, control?: AtlasEditControl) {
    const entry = this.#undo.at(-1); if (entry?.kind !== 'whole') throw new Error('没有可撤销的完整地图编辑。');
    const data = cloneAtlasDocument(entry.data); data.manifest.revision = this.#data.manifest.revision + 1;
    return this.#prepareReplacement(data, commandId, entry.mode === 'constraints' ? '撤销上一笔区域锁修改' : '撤销上一笔地图生成', true, control, entry.mode);
  }
  #fullCandidate(id: string) { if (!this.#replacement || this.#replacement.public.candidateId !== id) throw new Error('完整地图候选已经失效。'); return this.#replacement; }
  #candidate(id: string) { const candidate = this.#candidates.get(id); if (!candidate) throw new Error('编辑候选不存在或已经失效。'); return candidate; }
}
