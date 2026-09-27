import { blockKey, encodeBlock, getCellLayerSlot, getVertexSlot, validateSpec, type AtlasControl, type AtlasGridSpec } from './model';
import { cellVertexIds, incidentCellIds } from './topology';
import { generationCanonical, generationDigest, generationExact, generationInt, validateAtlasConstraints, validateAtlasSurface, validateAtlasDetailCoastSurface, validateAtlasDetailCoastManifest, type AtlasCellLockBlock, type AtlasConstraints, type AtlasDocument, type AtlasGenerationDocument, type AtlasDetailCoastDocument, type LockKey } from './generation-contract';
import { encodeDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';
import { buildCoastalSurface } from './coastal-surface';
import { assertCoastalCellProtection } from './coastal-generation';
import { assertOwnedDetailCoastLocksPreserved } from './detail-coast-locks';

export const LOCK_COAST = 1, LOCK_ELEVATION = 2;
export function lockKey(bx: number, by: number): LockKey {
  if (!generationInt(bx, 0, 15) || !generationInt(by, 0, 15)) throw new Error('地块锁坐标无效。');
  return `lock:${bx}:${by}`;
}
export function validateAtlasCellLockBlock(raw: unknown, spec?: AtlasGridSpec): raw is AtlasCellLockBlock {
  return generationExact(raw, ['format', 'version', 'bx', 'by', 'flags']) && raw.format === 'lieguoji-atlas-cell-locks' && raw.version === 1 && generationInt(raw.bx, 0, (spec?.columns ?? 512) / 32 - 1) && generationInt(raw.by, 0, (spec?.rows ?? 512) / 32 - 1) && raw.flags instanceof Uint8Array && Object.getPrototypeOf(raw.flags) === Uint8Array.prototype && raw.flags.buffer instanceof ArrayBuffer && raw.flags.length === 1024 && Reflect.ownKeys(raw.flags).length === 1024 && raw.flags.every(flag => (flag & ~3) === 0) && raw.flags.some(flag => flag !== 0);
}
export function encodeAtlasCellLockBlock(block: AtlasCellLockBlock): Uint8Array {
  if (!validateAtlasCellLockBlock(block)) throw new Error('地块锁内容或 codec 无效。');
  const bytes = new Uint8Array(1040), view = new DataView(bytes.buffer);
  bytes.set([76, 71, 65, 76]); view.setUint16(4, 1, true); view.setUint16(6, block.bx, true); view.setUint16(8, block.by, true); view.setUint16(10, 1024, true); bytes.set(block.flags, 16);
  return bytes;
}
export function decodeAtlasCellLockBlock(bytes: Uint8Array, spec?: AtlasGridSpec): AtlasCellLockBlock {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.length !== 1040) throw new Error('地块锁编码类型或长度无效。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (![76, 71, 65, 76].every((v, i) => bytes[i] === v) || view.getUint16(4, true) !== 1 || view.getUint16(10, true) !== 1024 || view.getUint32(12, true) !== 0) throw new Error('地块锁未知 codec、保留字段或长度。');
  const block: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: view.getUint16(6, true), by: view.getUint16(8, true), flags: bytes.slice(16) };
  if (!validateAtlasCellLockBlock(block, spec)) throw new Error('地块锁含未知位、空块或越界坐标。');
  return block;
}
export function cloneAtlasCellLockBlock(block: AtlasCellLockBlock): AtlasCellLockBlock {
  if (!validateAtlasCellLockBlock(block)) throw new Error('不能复制未知地块锁。');
  return { ...block, flags: block.flags.slice() };
}
export function hashAtlasCellLockBlock(block: AtlasCellLockBlock): Promise<string> { return generationDigest(encodeAtlasCellLockBlock(block)); }
/** Constraints carry codec identity; the fixed shared-grid identity is explicit. */
export function hashAtlasLockSet(constraints: AtlasConstraints, spec: AtlasGridSpec): Promise<string> {
  if (!validateSpec(spec) || !validateAtlasConstraints(constraints, spec)) throw new Error('地块锁集合版本、规格或引用无效。');
  return generationDigest(new TextEncoder().encode(generationCanonical({ constraints, spec })));
}
export function atlasCellLockFlags(data: AtlasGenerationDocument, cellId: number): number {
  const spec = data.manifest.spec;
  if (!generationInt(cellId, 0, spec.columns * spec.rows - 1)) throw new Error('地块锁查询越界。');
  const column = cellId % spec.columns, row = Math.floor(cellId / spec.columns), bx = Math.floor(column / 32), by = Math.floor(row / 32), ref = data.manifest.constraints.lockRefs.find(r => r.bx === bx && r.by === by);
  if (!ref) return 0;
  const block = data.locks.get(lockKey(bx, by)); if (!block || !validateAtlasCellLockBlock(block, spec)) throw new Error('受引用地块锁缺失或损坏。');
  return block.flags[row % 32 * 32 + column % 32];
}
/** One ring includes every shared-corner sign and neighboring-center weight
 * affected by a source sample/vertex edit. The caller supplies actual changes. */
export function atlasCoastalAffectedCellIds(spec: AtlasGridSpec, cellIds: Iterable<number>, vertexIds: Iterable<number>): number[] {
  const sources = new Set(cellIds), result = new Set<number>();
  for (const vertex of vertexIds) for (const cell of incidentCellIds(spec, vertex)) sources.add(cell);
  for (const cell of sources) {
    if (!generationInt(cell, 0, spec.columns * spec.rows - 1)) throw new Error('细海岸影响地块越界。');
    const column = cell % spec.columns, row = Math.floor(cell / spec.columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = column + dx, y = row + dy;
      if (x >= 0 && y >= 0 && x < spec.columns && y < spec.rows) result.add(y * spec.columns + x);
    }
  }
  return [...result].sort((a, b) => a - b);
}
/** Only for verified, privately owned v2 documents. Validation/hashing at the
 * caller establishes both complete envelopes; this guard independently keeps
 * every actual geography byte and all non-constraint manifest fields fixed.
 * It does not authorize an ordinary geography edit to change any lock. */
export function assertAtlasConstraintsOnly(base: AtlasDocument, next: AtlasDocument): void {
  if (base.manifest.version !== 2 && base.manifest.version !== 3 && base.manifest.version !== 4 || next.manifest.version !== 2 && next.manifest.version !== 3 && next.manifest.version !== 4 || base.manifest.version !== next.manifest.version || !('locks' in base) || !('locks' in next)) throw new Error('纯锁事务仅支持同版已有生成草稿。');
  const fields = ['format', 'version', 'kind', 'draftId', 'atlasId', 'name', 'seed', 'revision', 'spec', 'catalogs', 'blockRefs', 'origin', 'constraints', 'generation'];
  if (base.manifest.version === 3) {
    fields.push('surface');
    if (!validateAtlasSurface(base.manifest.surface) || next.manifest.version !== 3 || !validateAtlasSurface(next.manifest.surface)) throw new Error('纯锁事务不能改变权威地表合同。');
  }
  if (base.manifest.version === 4) {
    fields.push('surface', 'detailCoast');
    assertDetailContract(base, next);
    assertDetailBytesEqual(base, next);
  }
  if (!generationExact(base.manifest, fields) || !generationExact(next.manifest, fields)
    || !generationInt(base.manifest.revision, 0, Number.MAX_SAFE_INTEGER - 1) || next.manifest.revision !== base.manifest.revision + 1
    || generationCanonical({ ...base.manifest, revision: 0, constraints: null }) !== generationCanonical({ ...next.manifest, revision: 0, constraints: null })) throw new Error('纯锁事务不能改变地理引用、身份、名称、目录、来源或生成历史，且修订必须递增一。');
  for (const data of [base, next]) {
    if (!validateAtlasConstraints(data.manifest.constraints, data.manifest.spec) || data.locks.size !== data.manifest.constraints.lockRefs.length || data.blocks.size !== data.manifest.blockRefs.length) throw new Error('纯锁事务的完整锁集合或地理块缺失。');
    for (const ref of data.manifest.constraints.lockRefs) {
      const lock = data.locks.get(lockKey(ref.bx, ref.by));
      if (!validateAtlasCellLockBlock(lock, data.manifest.spec) || lock.bx !== ref.bx || lock.by !== ref.by) throw new Error('纯锁事务含未知、缺失或越界地块锁。');
    }
  }
  for (const ref of base.manifest.blockRefs) {
    const a = base.blocks.get(ref.key), b = next.blocks.get(ref.key);
    if (!a || !b || blockKey(a.layer, a.bx, a.by) !== ref.key || blockKey(b.layer, b.bx, b.by) !== ref.key) throw new Error('纯锁事务不能替换或遗漏实际地理块。');
    const before = encodeBlock(a), after = encodeBlock(b);
    if (before.length !== after.length || before.some((value, i) => value !== after[i])) throw new Error('纯锁事务不能修改任何实际地理值。');
  }
}
function assertDetailContract(base: AtlasDocument, next: AtlasDocument): void {
  for (const data of [base, next]) {
    if (data.manifest.version !== 4 || !validateAtlasDetailCoastSurface(data.manifest.surface) || !validateAtlasDetailCoastManifest(data.manifest.detailCoast)
      || !('detailCoast' in data) || !data.detailCoast || data.detailCoast.size !== data.manifest.detailCoast.refs.length) throw new Error('细海岸合同或完整内容无效。');
  }
  if (generationCanonical((base as AtlasDetailCoastDocument).manifest.surface) !== generationCanonical((next as AtlasDetailCoastDocument).manifest.surface)) throw new Error('普通编辑不能改变细海岸解释。');
}
function assertDetailBytesEqual(base: AtlasDocument, next: AtlasDocument): void {
  assertDetailContract(base, next);
  const a = base as AtlasDetailCoastDocument, b = next as AtlasDetailCoastDocument;
  if (generationCanonical(a.manifest.detailCoast) !== generationCanonical(b.manifest.detailCoast)) throw new Error('本操作不能改变细海岸引用。');
  for (const ref of a.manifest.detailCoast.refs) {
    const key = detailCoastKey(ref.bx, ref.by), before = a.detailCoast.get(key), after = b.detailCoast.get(key);
    if (!before || !after) throw new Error('受保护细海岸块缺失。');
    const x = encodeDetailCoastTile(before), y = encodeDetailCoastTile(after);
    if (x.length !== y.length || x.some((value, i) => value !== y[i])) throw new Error('本操作不能修改实际细海岸数据。');
  }
}
/** Common identity/lock checks; no piece reconstruction or async work here. */
function assertAtlasLockIdentity(base: AtlasDocument, next: AtlasDocument): void {
  if (base.manifest.version !== next.manifest.version) throw new Error('普通编辑不能切换草稿格式。');
  if (base.manifest.version === 1) return;
  if (base.manifest.version !== 2 && base.manifest.version !== 3 && base.manifest.version !== 4) throw new Error('未知权威地表格式，普通编辑已保护。');
  if (base.manifest.version === 4) assertDetailContract(base, next);
  if (base.manifest.version === 3 && (next.manifest.version !== 3 || !validateAtlasSurface(base.manifest.surface) || !validateAtlasSurface(next.manifest.surface) || generationCanonical(base.manifest.surface) !== generationCanonical(next.manifest.surface))) throw new Error('普通编辑不能改变权威地表合同。');
  if (base.manifest.draftId !== next.manifest.draftId || base.manifest.atlasId !== next.manifest.atlasId || generationCanonical(base.manifest.spec) !== generationCanonical(next.manifest.spec)) throw new Error('原草稿操作不能更换地理身份或规格。');
  if (!('locks' in base) || !('locks' in next) || generationCanonical(base.manifest.origin) !== generationCanonical(next.manifest.origin) || generationCanonical(base.manifest.constraints) !== generationCanonical(next.manifest.constraints)) throw new Error('普通编辑不能改变来源或锁集合。');
  if (!validateAtlasConstraints(base.manifest.constraints, base.manifest.spec) || base.locks.size !== base.manifest.constraints.lockRefs.length || next.locks.size !== next.manifest.constraints.lockRefs.length) throw new Error('地块锁集合缺失或含额外数据。');
  for (const ref of base.manifest.constraints.lockRefs) {
    const key = lockKey(ref.bx, ref.by), a = base.locks.get(key), b = next.locks.get(key);
    if (!a || !b || a !== b && (!validateAtlasCellLockBlock(a, base.manifest.spec) || !validateAtlasCellLockBlock(b, next.manifest.spec) || a.flags.some((v, i) => v !== b.flags[i]))) throw new Error('锁内容变化或缺失，必须明确解锁事务。');
  }
}
/** Whole-replacement boundary only. Both OwnedAtlasSession and final storage
 * call this after complete private ingestion/hash verification. A public
 * caller cannot skip validation or provide an authorization boolean. */
export async function assertAtlasReplacementLocksPreserved(base: AtlasDocument, next: AtlasDocument, control?: AtlasControl): Promise<void> {
  control?.signal?.throwIfAborted();
  if (base.manifest.version !== 4) { assertAtlasLocksPreserved(base, next); return; }
  assertAtlasLockIdentity(base, next);
  if (!('detailCoast' in base) || !('detailCoast' in next) || next.manifest.version !== 4) throw new Error('细海岸完整替换缺少私有内容。');
  await assertOwnedDetailCoastLocksPreserved(base as AtlasDetailCoastDocument, next as AtlasDetailCoastDocument, control);
}
/** Baselines are verified/owned; optional IDs bound ordinary edit work to its delta.
 * Unsupported v4 local edits keep the conservative synchronous boundary. */
export function assertAtlasLocksPreserved(base: AtlasDocument, next: AtlasDocument, changedCellIds?: Iterable<number>, changedVertexIds?: Iterable<number>): void {
  assertAtlasLockIdentity(base, next);
  if (base.manifest.version === 1) return;
  if (!('locks' in base) || !('locks' in next)) throw new Error('地块锁内容缺失。');
  if (base.manifest.constraints.lockRefs.length === 0) return;
  if (base.manifest.version === 4) {
    // Until local fine-field lock dependency evaluation is wired, a locked v4
    // accepts unchanged geography only. This conservative refusal is explicit;
    // it never claims an old center-only test protects a detailed coastline.
    assertDetailBytesEqual(base, next);
    if (generationCanonical(base.manifest.blockRefs) !== generationCanonical(next.manifest.blockRefs)) throw new Error('第四版含区域锁，细海岸局部锁依赖尚未接通；地理修改已保护。');
    for (const ref of base.manifest.blockRefs) {
      const a = base.blocks.get(ref.key), b = next.blocks.get(ref.key);
      if (!a || !b) throw new Error('受保护地理块缺失。');
      const x = encodeBlock(a), y = encodeBlock(b);
      if (x.length !== y.length || x.some((value, index) => value !== y[index])) throw new Error('第四版区域锁保护实际地理与细海岸数据。');
    }
    return;
  }
  const flagsAt = (cellId: number) => {
    const spec = base.manifest.spec; if (!generationInt(cellId, 0, spec.columns * spec.rows - 1)) throw new Error('地块锁查询越界。');
    const column = cellId % spec.columns, row = Math.floor(cellId / spec.columns);
    return base.locks.get(lockKey(Math.floor(column / 32), Math.floor(row / 32)))?.flags[row % 32 * 32 + column % 32] ?? 0;
  };
  const cells = changedCellIds === undefined ? Array.from({ length: base.manifest.spec.columns * base.manifest.spec.rows }, (_, i) => i) : [...changedCellIds], vertices = new Set(changedVertexIds);
  for (const cellId of cells) {
    const flags = flagsAt(cellId); if (!flags) continue;
    const a = getCellLayerSlot(base, 'elevation', cellId), b = getCellLayerSlot(next, 'elevation', cellId), before = a.block.values[a.slot], after = b.block.values[b.slot];
    if (flags & LOCK_ELEVATION && before !== after || flags & LOCK_COAST && (before >= 0) !== (after >= 0)) throw new Error('地块锁保护海陆分类或准确高程。');
    if (changedVertexIds === undefined && flags & LOCK_COAST) for (const id of cellVertexIds(base.manifest.spec, cellId)) vertices.add(id);
  }
  for (const vertexId of vertices) {
    if (!incidentCellIds(base.manifest.spec, vertexId).some(id => flagsAt(id) & LOCK_COAST)) continue;
    const a = getVertexSlot(base, vertexId), b = getVertexSlot(next, vertexId);
    if (a.block.xyQ[a.slot * 2] !== b.block.xyQ[b.slot * 2] || a.block.xyQ[a.slot * 2 + 1] !== b.block.xyQ[b.slot * 2 + 1]) throw new Error('共享顶点关联受保护海岸，不能移动。');
  }
  if (base.manifest.version === 3) {
    const affected = changedCellIds === undefined ? cells : atlasCoastalAffectedCellIds(base.manifest.spec, cells, vertices);
    const protectedCells = affected.filter(cell => flagsAt(cell) !== 0);
    // Same bounded reconstruction and comparison used at generation preview.
    // Neighbor edits can move a locked cell's coast without changing its center.
    for (let offset = 0; offset < protectedCells.length; offset += 256) {
      const ids = protectedCells.slice(offset, offset + 256), before = buildCoastalSurface(base, ids).cells, after = buildCoastalSurface(next, ids).cells;
      for (let index = 0; index < ids.length; index++) assertCoastalCellProtection(before[index], after[index], flagsAt(ids[index]));
    }
  }
}
