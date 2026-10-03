import { commitFmsEdit, FMS_SEA_LEVEL, FmsModelError, type FmsDocument, type FmsEditPatch } from './model';

/** The worker owns a candidate buffer, never the committed document. Validate
 * the complete result before making a patch; a rejected preview changes nothing. */
export function prepareFmsTerrainPreview(document: FmsDocument, candidate: {
  worldId: string; baseRevision: number; elevations: Int32Array;
}): { patch: FmsEditPatch; document: FmsDocument } {
  if (candidate.worldId !== document.worldId || candidate.baseRevision !== document.revision) {
    throw new FmsModelError('revision-conflict', '地图已变化，请重新生成地形预览。');
  }
  if (!(candidate.elevations instanceof Int32Array) || candidate.elevations.length !== document.elevations.length) {
    throw new FmsModelError('invalid-edit', '地形预览数据不完整，原地图保持不变。');
  }
  const changes = [];
  for (let cell = 0; cell < candidate.elevations.length; cell++) {
    const previous = document.elevations[cell], next = candidate.elevations[cell];
    if (next < 0 || next > 100 || (previous >= FMS_SEA_LEVEL) !== (next >= FMS_SEA_LEVEL)) {
      throw new FmsModelError('invalid-edit', '地形预览改变了锁定的海陆轮廓，未应用。');
    }
    if (next !== previous) changes.push(Object.freeze({ cell, previous, next }));
  }
  const patch = Object.freeze({ worldId: document.worldId, baseRevision: document.revision,
    label: '生成自然地形', changes: Object.freeze(changes) });
  return { patch, document: commitFmsEdit(document, patch) };
}
