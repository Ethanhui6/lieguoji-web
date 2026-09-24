import { cloneBlock, getCellLayerSlot, getVertexSlot, hashBlock, UNASSIGNED, validateBlock, type BlockKey } from './model';
import { hashAtlasManifest, type AtlasDocument } from './atlas-format';
import { assertAtlasLocksPreserved } from './generation-locks';
import { validateLocalGeometry } from './topology';
import { validateAtlasDelta, type AtlasEditDelta } from './transactions';

/** Verified receive state only: copy changed blocks, independently hash every delta. */
export async function applyAtlasDelta<T extends AtlasDocument>(base: T, baseRootDigest: string, delta: AtlasEditDelta): Promise<T> {
  if (!validateAtlasDelta(delta) || delta.draftId !== base.manifest.draftId || delta.baseRevision !== base.manifest.revision || delta.baseRootDigest !== baseRootDigest) throw new Error('增量与当前草稿基线不一致。');
  const next = { ...base, manifest: structuredClone(base.manifest), blocks: new Map(base.blocks) } as T, dirty = new Set<BlockKey>();
  const copy = (key: BlockKey) => { if (!dirty.has(key)) { next.blocks.set(key, cloneBlock(base.blocks.get(key)!)); dirty.add(key); } };
  for (const key of ['elevation', 'simMembership', 'adminMembership'] as const) {
    const patch = delta.patch[key]; if (!patch) continue;
    const layer = key === 'elevation' ? 'elevation' : key === 'simMembership' ? 'sim-membership' : 'admin-membership';
    const permitted = new Set(key === 'simMembership' ? base.manifest.catalogs.simRegions.map(row => row.id) : base.manifest.catalogs.administration.filter(row => row.kind === 'leaf').map(row => row.id));
    for (let i = 0; i < patch.ids.length; i++) {
      const slot = getCellLayerSlot(next, layer, patch.ids[i]), value = patch.values[i];
      if (key !== 'elevation' && value !== UNASSIGNED && !permitted.has(value)) throw new Error('增量包含未知成员引用。');
      if (slot.block.values[slot.slot] === value) throw new Error('增量包含未改变的字段。');
      copy(slot.key); getCellLayerSlot(next, layer, patch.ids[i]).block.values[slot.slot] = value;
    }
  }
  if (delta.patch.vertices) {
    const patch = delta.patch.vertices;
    for (let i = 0; i < patch.ids.length; i++) {
      const slot = getVertexSlot(next, patch.ids[i]), x = patch.xyQ[i * 2], y = patch.xyQ[i * 2 + 1];
      if (slot.block.xyQ[slot.slot * 2] === x && slot.block.xyQ[slot.slot * 2 + 1] === y) throw new Error('增量包含未改变的顶点。');
      copy(slot.key); const target = getVertexSlot(next, patch.ids[i]); target.block.xyQ[target.slot * 2] = x; target.block.xyQ[target.slot * 2 + 1] = y;
    }
    validateLocalGeometry(next, [...delta.patch.vertices.ids]);
  }
  if (dirty.size !== delta.blockRefs.length || delta.blockRefs.some(ref => !dirty.has(ref.key))) throw new Error('增量脏块集合与回执不符。');
  for (const ref of delta.blockRefs) {
    const block = next.blocks.get(ref.key)!;
    if (!validateBlock(block, next.manifest.spec) || await hashBlock(block) !== ref.hash) throw new Error('增量块内容摘要不符。');
    const target = next.manifest.blockRefs.find(row => row.key === ref.key); if (!target) throw new Error('增量引用了未知块。'); target.hash = ref.hash;
  }
  assertAtlasLocksPreserved(base, next, [...(delta.patch.elevation?.ids ?? [])], [...(delta.patch.vertices?.ids ?? [])]);
  next.manifest.revision = delta.revision;
  if (await hashAtlasManifest(next.manifest) !== delta.manifestDigest) throw new Error('增量manifest摘要不符。');
  return next;
}
