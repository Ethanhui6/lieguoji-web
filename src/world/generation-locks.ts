import { blockKey, encodeBlock, getCellLayerSlot, getVertexSlot, validateSpec, type AtlasGridSpec } from './model';
import { cellVertexIds, incidentCellIds } from './topology';
import { generationCanonical, generationDigest, generationExact, generationInt, validateAtlasConstraints, type AtlasCellLockBlock, type AtlasConstraints, type AtlasDocument, type AtlasGenerationDocument, type LockKey } from './generation-contract';

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
/** Only for verified, privately owned v2 documents. Validation/hashing at the
 * caller establishes both complete envelopes; this guard independently keeps
 * every actual geography byte and all non-constraint manifest fields fixed.
 * It does not authorize an ordinary geography edit to change any lock. */
export function assertAtlasConstraintsOnly(base: AtlasDocument, next: AtlasDocument): void {
  if (base.manifest.version !== 2 || next.manifest.version !== 2 || !('locks' in base) || !('locks' in next)) throw new Error('纯锁事务仅支持已有第二版草稿。');
  const fields = ['format', 'version', 'kind', 'draftId', 'atlasId', 'name', 'seed', 'revision', 'spec', 'catalogs', 'blockRefs', 'origin', 'constraints', 'generation'];
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
/** Baselines are verified/owned; optional IDs bound ordinary edit work to its delta. */
export function assertAtlasLocksPreserved(base: AtlasDocument, next: AtlasDocument, changedCellIds?: Iterable<number>, changedVertexIds?: Iterable<number>): void {
  if (base.manifest.version !== next.manifest.version) throw new Error('普通编辑不能切换草稿格式。');
  if (base.manifest.version === 1) return;
  if (base.manifest.draftId !== next.manifest.draftId || base.manifest.atlasId !== next.manifest.atlasId || generationCanonical(base.manifest.spec) !== generationCanonical(next.manifest.spec)) throw new Error('原草稿操作不能更换地理身份或规格。');
  if (!('locks' in base) || !('locks' in next) || next.manifest.version !== 2 || generationCanonical(base.manifest.origin) !== generationCanonical(next.manifest.origin) || generationCanonical(base.manifest.constraints) !== generationCanonical(next.manifest.constraints)) throw new Error('普通编辑不能改变来源或锁集合。');
  if (!validateAtlasConstraints(base.manifest.constraints, base.manifest.spec) || base.locks.size !== base.manifest.constraints.lockRefs.length || next.locks.size !== next.manifest.constraints.lockRefs.length) throw new Error('地块锁集合缺失或含额外数据。');
  for (const ref of base.manifest.constraints.lockRefs) {
    const key = lockKey(ref.bx, ref.by), a = base.locks.get(key), b = next.locks.get(key);
    if (!a || !b || a !== b && (!validateAtlasCellLockBlock(a, base.manifest.spec) || !validateAtlasCellLockBlock(b, next.manifest.spec) || a.flags.some((v, i) => v !== b.flags[i]))) throw new Error('锁内容变化或缺失，必须明确解锁事务。');
  }
  if (base.manifest.constraints.lockRefs.length === 0) return;
  const flagsAt = (cellId: number) => {
    const spec = base.manifest.spec; if (!generationInt(cellId, 0, spec.columns * spec.rows - 1)) throw new Error('地块锁查询越界。');
    const column = cellId % spec.columns, row = Math.floor(cellId / spec.columns);
    return base.locks.get(lockKey(Math.floor(column / 32), Math.floor(row / 32)))?.flags[row % 32 * 32 + column % 32] ?? 0;
  };
  const cells = changedCellIds ?? Array.from({ length: base.manifest.spec.columns * base.manifest.spec.rows }, (_, i) => i), vertices = new Set(changedVertexIds);
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
}
