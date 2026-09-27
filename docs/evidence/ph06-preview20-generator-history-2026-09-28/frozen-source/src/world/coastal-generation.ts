import { buildCoastalSurface, type CoastalCellSurface } from './coastal-surface';
import { yieldAtlas, type AtlasControl, type AtlasGeographyView } from './model';
import { incidentCellIds } from './topology';
import type { AtlasGenerationDocument, GenerationScope } from './generation-contract';

/** Signatures intentionally omit anchor IDs and coverage values: a coast lock
 * protects actual land/sea geometry, while an elevation lock additionally
 * protects the interpolated height of every actual clipped piece. */
export function coastalCellGeometrySignature(cell: CoastalCellSurface): string {
  const triangles = (pieces: CoastalCellSurface['land']) => pieces.map(piece => piece.map(vertex => [vertex.xQ6, vertex.yQ6]));
  return JSON.stringify([triangles(cell.land), triangles(cell.sea), cell.shore.map(segment => [[segment.a.xQ6, segment.a.yQ6], [segment.b.xQ6, segment.b.yQ6]])]);
}
export function coastalCellHeightSignature(cell: CoastalCellSurface): string {
  const triangles = (pieces: CoastalCellSurface['land']) => pieces.map(piece => piece.map(vertex => [vertex.xQ6, vertex.yQ6, vertex.heightMeters]));
  return JSON.stringify([triangles(cell.land), triangles(cell.sea)]);
}
/** Shared by the cooperative generation audit and final local/CAS protection.
 * The existing lock codec defines bit 0 coast, bit 1 exact elevation. */
export function assertCoastalCellProtection(before: CoastalCellSurface, after: CoastalCellSurface, flags: number, outsideScope = false): void {
  if (before.cellId !== after.cellId || !Number.isInteger(flags) || flags < 0 || flags > 3) throw new Error('裁切海岸保护的地块或锁身份无效。');
  if ((outsideScope || flags & 1) && coastalCellGeometrySignature(before) !== coastalCellGeometrySignature(after)) {
    throw new Error(outsideScope ? `局部生成会改变选区外地块 #${before.cellId} 的实际裁切海岸；候选已拒绝。` : `生成会改变海岸锁保护地块 #${before.cellId} 的实际裁切海岸；候选已拒绝。`);
  }
  if (flags & 2 && coastalCellHeightSignature(before) !== coastalCellHeightSignature(after)) throw new Error(`生成会改变高程锁保护地块 #${before.cellId} 的裁切地表高度；候选已拒绝。`);
}
export interface CoastalGenerationMeasurements {
  /** Same historic summary convention: twice physical area times 256^2. */
  landAreaQ2: number;
  worldAreaQ2: number;
  checkedCells: number;
  comparedProtectedCells: number;
}
const BATCH_CELLS = 128;
function inside(id: number, columns: number, scope: GenerationScope): boolean {
  if (scope.kind === 'world') return true;
  const x = id % columns, y = Math.floor(id / columns);
  return x >= scope.column && x < scope.column + scope.columns && y >= scope.row && y < scope.row + scope.rows;
}
function flagsAt(data: AtlasGenerationDocument, id: number): number {
  const columns = data.manifest.spec.columns, x = id % columns, y = Math.floor(id / columns);
  return data.locks.get(`lock:${Math.floor(x / 32)}:${Math.floor(y / 32)}`)?.flags[y % 32 * 32 + x % 32] ?? 0;
}
/** Actual source differences, then the complete derived 3x3 dependency halo.
 * Metadata hashes cannot stand in for examining generator output, since its
 * candidate block references have not been rehashed at this point. */
async function changedNeighborhood(base: AtlasGenerationDocument, next: AtlasGenerationDocument, control?: AtlasControl): Promise<Set<number>> {
  const affected = new Set<number>(), { columns, rows } = base.manifest.spec;
  const include = (cell: number) => {
    const x = cell % columns, y = Math.floor(cell / columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < columns && y + dy >= 0 && y + dy < rows) affected.add((y + dy) * columns + x + dx);
  };
  let checked = 0;
  for (const [key, before] of base.blocks) {
    control?.signal?.throwIfAborted(); const after = next.blocks.get(key);
    if (!after || after.layer !== before.layer || after.bx !== before.bx || after.by !== before.by) throw new Error('裁切海岸候选缺少对应的权威地理块。');
    if (before !== after && before.layer === 'elevation' && after.layer === 'elevation') {
      if (before.values.length !== after.values.length) throw new Error('裁切海岸高程块长度变化。');
      for (let slot = 0; slot < before.values.length; slot++) if (before.values[slot] !== after.values[slot]) include((before.by * 32 + Math.floor(slot / 32)) * columns + before.bx * 32 + slot % 32);
    } else if (before !== after && before.layer === 'geometry' && after.layer === 'geometry') {
      if (before.vertexIds.length !== after.vertexIds.length || before.xyQ.length !== after.xyQ.length) throw new Error('裁切海岸共享几何长度变化。');
      for (let slot = 0; slot < before.vertexIds.length; slot++) {
        if (before.vertexIds[slot] !== after.vertexIds[slot]) throw new Error('裁切海岸共享顶点身份变化。');
        if (before.xyQ[slot * 2] !== after.xyQ[slot * 2] || before.xyQ[slot * 2 + 1] !== after.xyQ[slot * 2 + 1]) for (const id of incidentCellIds(base.manifest.spec, before.vertexIds[slot])) include(id);
      }
    }
    checked++; await yieldAtlas(control, '定位真实裁切海岸的变更依赖', checked, base.blocks.size);
  }
  return affected;
}

/** Inputs are verified, privately owned generation-session snapshots. Work is
 * cooperatively divided by real cells, including exact area accumulation and
 * dependent lock/scope comparisons. Failure never edits/restores either input. */
export async function inspectCoastalGeneration(base: AtlasGenerationDocument, next: AtlasGenerationDocument, scope: GenerationScope, control?: AtlasControl): Promise<CoastalGenerationMeasurements> {
  control?.signal?.throwIfAborted();
  if (base.manifest.version !== 3 || next.manifest.version !== 3 || JSON.stringify(base.manifest.spec) !== JSON.stringify(next.manifest.spec)
    || JSON.stringify(base.manifest.surface) !== JSON.stringify(next.manifest.surface)) throw new Error('裁切海岸核验只接受同规格的第三版权威地表。');
  const total = base.manifest.spec.columns * base.manifest.spec.rows;
  const affected = base.locks.size || scope.kind !== 'world' ? await changedNeighborhood(base, next, control) : new Set<number>();
  let landAreaTwiceQ6 = 0, totalAreaTwiceQ6 = 0, comparedProtectedCells = 0;
  for (let start = 0; start < total; start += BATCH_CELLS) {
    control?.signal?.throwIfAborted(); const end = Math.min(total, start + BATCH_CELLS), ids = Array.from({ length: end - start }, (_, offset) => start + offset);
    const after = buildCoastalSurface(next as AtlasGeographyView, ids);
    const compareIds = ids.filter(id => affected.has(id) && (flagsAt(base, id) || !inside(id, base.manifest.spec.columns, scope)));
    const before = compareIds.length ? new Map(buildCoastalSurface(base as AtlasGeographyView, compareIds).cells.map(cell => [cell.cellId, cell])) : new Map<number, CoastalCellSurface>();
    for (const cell of after.cells) {
      if (!Number.isSafeInteger(cell.landAreaTwiceQ6) || !Number.isSafeInteger(cell.totalAreaTwiceQ6) || cell.landAreaTwiceQ6 < 0 || cell.landAreaTwiceQ6 > cell.totalAreaTwiceQ6) throw new Error('实际裁切地表面积无效。');
      landAreaTwiceQ6 += cell.landAreaTwiceQ6; totalAreaTwiceQ6 += cell.totalAreaTwiceQ6;
      const previous = before.get(cell.cellId);
      if (previous) { assertCoastalCellProtection(previous, cell, flagsAt(base, cell.cellId), !inside(cell.cellId, base.manifest.spec.columns, scope)); comparedProtectedCells++; }
    }
    if (!Number.isSafeInteger(landAreaTwiceQ6) || !Number.isSafeInteger(totalAreaTwiceQ6)) throw new Error('实际裁切海岸面积累计超出精确范围。');
    await yieldAtlas(control, '核验实际裁切海岸面积与保护边界', end, total);
  }
  // The coastal kernel's Q6 coordinate is 6*Q8: twice-area /36 retains the
  // generation summary's historic twice-Q8 convention (kernel areaQ2 is /72).
  return { landAreaQ2: landAreaTwiceQ6 / 36, worldAreaQ2: totalAreaTwiceQ6 / 36, checkedCells: total, comparedProtectedCells };
}
