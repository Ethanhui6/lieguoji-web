import { encodeBlock, yieldAtlas, type AtlasControl } from './model';
import { generationCanonical, validateAtlasDetailCoastManifest, type AtlasDetailCoastDocument } from './generation-contract';
import { detailCoastKey, type DetailCoastCellSurface, type DetailCoastField, type DetailCoastTriangle } from './detail-coast-types';
import { buildDetailCoastSurface, detailCellsIntersectingQuad } from './detail-coast-geometry';
import { sampleDetailCoastNode } from './detail-coast-field';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { quadQ } from './generation/quality';

const FINE_ACROSS = 2048, DISPLAY_ACROSS = 64, DISPLAY_CELLS = 32, MAX_BATCH = 4096;
const triGeometry = (triangles: DetailCoastTriangle[]) => triangles.map(triangle => triangle.map(vertex => [vertex.xQ, vertex.yQ]));
const triHeights = (triangles: DetailCoastTriangle[]) => triangles.map(triangle => triangle.map(vertex => [vertex.xQ, vertex.yQ, vertex.heightMeters]));

/** Coverage magnitudes are not the authority. Preserve quantized pieces,
 * areas and zero-edge ownership, while allowing equivalent field encodings. */
export function detailCoastCellGeometrySignature(cell: DetailCoastCellSurface): string {
  return JSON.stringify([triGeometry(cell.land), triGeometry(cell.sea), cell.landAreaTwiceQ2, cell.seaAreaTwiceQ2,
    cell.shore.map(segment => [segment.a.xQ, segment.a.yQ, segment.b.xQ, segment.b.yQ, segment.ownerTriangleId])]);
}
export function detailCoastCellHeightSignature(cell: DetailCoastCellSurface): string {
  return JSON.stringify([triHeights(cell.land), triHeights(cell.sea)]);
}
/** Actual source vertices also define isolated zero-area land ties. Geometry
 * alone cannot distinguish an isolated zero land point from entirely sea.
 * Positive-to-zero in an otherwise identical land piece is allowed. */
function nodeSignature(field: DetailCoastField, cell: DetailCoastCellSurface, height: boolean): string {
  return JSON.stringify([[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dy]) => {
    const node = sampleDetailCoastNode(field, cell.column + dx, cell.row + dy);
    return height ? [node.coverageQ >= 0, node.heightMeters] : node.coverageQ >= 0;
  }));
}
/** Reusable final-piece guard; both fields must describe verified private
 * snapshots, including their actual Hbase samplers when bit 1 is present. */
export function assertDetailCoastCellProtection(before: DetailCoastCellSurface, after: DetailCoastCellSurface,
  beforeField: DetailCoastField, afterField: DetailCoastField, flags: number): void {
  if (before.cellId !== after.cellId || !Number.isInteger(flags) || flags < 1 || flags > 3) throw new Error('细海岸保护身份或锁位无效。');
  if (flags & 1 && (detailCoastCellGeometrySignature(before) !== detailCoastCellGeometrySignature(after)
    || nodeSignature(beforeField, before, false) !== nodeSignature(afterField, after, false))) {
    throw new Error(`海岸锁保护细格 #${before.cellId} 的实际海陆片、零面积归属或岸线。`);
  }
  if (flags & 2 && (detailCoastCellHeightSignature(before) !== detailCoastCellHeightSignature(after)
    || nodeSignature(beforeField, before, true) !== nodeSignature(afterField, after, true))) {
    throw new Error(`高程锁保护细格 #${before.cellId} 的实际片高度场。`);
  }
}

async function assertFineDirectory(data: AtlasDetailCoastDocument, control?: AtlasControl): Promise<void> {
  const directory = data.manifest.detailCoast;
  if (!validateAtlasDetailCoastManifest(directory) || data.detailCoast.size !== directory.refs.length) throw new Error('细海岸引用内容缺失或含额外数据。');
  for (let index = 0; index < directory.refs.length; index++) {
    const ref = directory.refs[index], tile = data.detailCoast.get(detailCoastKey(ref.bx, ref.by));
    if (!tile || tile.bx !== ref.bx || tile.by !== ref.by) throw new Error('受引用细海岸块缺失或身份不符。');
    if ((index + 1) % 64 === 0 || index + 1 === directory.refs.length) await yieldAtlas(control, '核验细海岸保护引用', index + 1, directory.refs.length);
  }
}
async function assertFixedCoarseLayers(base: AtlasDetailCoastDocument, next: AtlasDetailCoastDocument, control?: AtlasControl): Promise<void> {
  if (base.blocks.size !== next.blocks.size || base.manifest.blockRefs.length !== next.manifest.blockRefs.length) throw new Error('细海岸候选缺少粗地理块。');
  let completed = 0;
  for (const [key, before] of base.blocks) {
    const after = next.blocks.get(key);
    if (!after || after.layer !== before.layer || after.bx !== before.bx || after.by !== before.by) throw new Error('细海岸候选缺少对应的粗地理块。');
    if (before.layer !== 'elevation' && before !== after) {
      const a = encodeBlock(before), b = encodeBlock(after);
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('本阶段细海岸替换不能改变真实粗格几何或其他粗数据层。');
    }
    completed++;
    if (completed % 8 === 0 || completed === base.blocks.size) await yieldAtlas(control, '核验细海岸固定粗数据层', completed, base.blocks.size);
  }
}

export interface DetailCoastLockAudit {
  lockedCoarseCells: number; protectedFineCells: number; checkedFineCells: number;
  checkedDisplayTiles: number; maxBuiltFineCells: number;
}
/** Async whole-replacement guard only. Caller has already verified hashes,
 * envelopes and ownership and checked immutable identity/origin/lock bytes.
 * This is intentionally not a public substitute for document verification.
 * No whole-world mesh is retained: a ≤4 MiB sparse mask and at most two 32²
 * fine-cell surfaces exist at once; SAT work never exceeds 4096 cells/quad.
 * The fixed old quad is authoritative. Touching fine cells are protected,
 * including nodes owned by adjacent sparse tiles and zero-line owner lookup.
 */
export async function assertOwnedDetailCoastLocksPreserved(base: AtlasDetailCoastDocument, next: AtlasDetailCoastDocument,
  control?: AtlasControl): Promise<DetailCoastLockAudit> {
  control?.signal?.throwIfAborted();
  if (base.manifest.version !== 4 || next.manifest.version !== 4
    || generationCanonical(base.manifest.spec) !== generationCanonical(next.manifest.spec)) throw new Error('细海岸保护需要同规格的第四版私有地理。');
  await assertFineDirectory(base, control); await assertFineDirectory(next, control);
  await assertFixedCoarseLayers(base, next, control);
  const masks = new Map<number, Uint8Array>();
  let lockedCoarseCells = 0, protectedFineCells = 0, heightLocks = false, coverBatch = 0, lockBlocks = 0;
  for (const lock of base.locks.values()) {
    for (let slot = 0; slot < lock.flags.length; slot++) {
      const flags = lock.flags[slot]; if (!flags) continue;
      if (flags & ~3) throw new Error('细海岸含未知锁位。');
      const column = lock.bx * 32 + slot % 32, row = lock.by * 32 + Math.floor(slot / 32), cellId = row * base.manifest.spec.columns + column;
      const covered = detailCellsIntersectingQuad(quadQ(base, cellId).map(([xQ, yQ]) => ({ xQ, yQ })));
      if (coverBatch + covered.length > MAX_BATCH) {
        await yieldAtlas(control, '计算真实地块细海岸锁覆盖', lockBlocks, base.locks.size); coverBatch = 0;
      }
      for (const id of covered) {
        const x = id % FINE_ACROSS, y = Math.floor(id / FINE_ACROSS), tileId = Math.floor(y / DISPLAY_CELLS) * DISPLAY_ACROSS + Math.floor(x / DISPLAY_CELLS);
        let mask = masks.get(tileId); if (!mask) { mask = new Uint8Array(DISPLAY_CELLS ** 2); masks.set(tileId, mask); }
        const position = y % DISPLAY_CELLS * DISPLAY_CELLS + x % DISPLAY_CELLS;
        if (!mask[position]) protectedFineCells++;
        mask[position] |= flags;
      }
      coverBatch += covered.length; lockedCoarseCells++; heightLocks ||= !!(flags & 2);
    }
    lockBlocks++;
    await yieldAtlas(control, '计算真实地块细海岸锁覆盖', lockBlocks, base.locks.size); coverBatch = 0;
  }
  const audit: DetailCoastLockAudit = { lockedCoarseCells, protectedFineCells, checkedFineCells: 0, checkedDisplayTiles: 0, maxBuiltFineCells: 0 };
  if (!masks.size) return audit;
  const makeField = async (data: AtlasDetailCoastDocument): Promise<DetailCoastField> => {
    // Coast-only locks do not need Hbase. A harmless placeholder supplies
    // unused heights while signs, geometry and zero ownership stay exact.
    if (!heightLocks) return { tiles: data.detailCoast, sampleBaseElevation: () => 0 };
    const samples = await extractDetailCoastBase(data, control);
    return { tiles: data.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(samples.size, samples.centersQ, samples.elevationsMeters) };
  };
  const beforeField = await makeField(base), afterField = await makeField(next);
  for (const [tileId, mask] of masks) {
    control?.signal?.throwIfAborted();
    const rectangle = { column: tileId % DISPLAY_ACROSS * DISPLAY_CELLS, row: Math.floor(tileId / DISPLAY_ACROSS) * DISPLAY_CELLS, columns: DISPLAY_CELLS, rows: DISPLAY_CELLS };
    const before = buildDetailCoastSurface(beforeField, rectangle), after = buildDetailCoastSurface(afterField, rectangle);
    audit.maxBuiltFineCells = Math.max(audit.maxBuiltFineCells, before.cells.length + after.cells.length);
    for (let slot = 0; slot < mask.length; slot++) if (mask[slot]) {
      assertDetailCoastCellProtection(before.cells[slot], after.cells[slot], beforeField, afterField, mask[slot]); audit.checkedFineCells++;
    }
    audit.checkedDisplayTiles++;
    await yieldAtlas(control, '核验真实细海岸片与区域锁', audit.checkedFineCells, protectedFineCells);
  }
  control?.signal?.throwIfAborted(); return audit;
}
