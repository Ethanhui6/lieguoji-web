import { cloneVerifiedAtlasDocument, isDetailCoastDocument } from '../atlas-format';
import { generationExact, validateAddDetailRecipe, type AddDetailRecipe, type AtlasDetailCoastDocument, type AtlasDocument } from '../generation-contract';
import { cloneBlock, getCellLayerSlot, hashBlock, yieldAtlas, type AtlasControl, type BlockKey } from '../model';
import { extractDetailCoastBase } from '../detail-coast-base';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey } from '../detail-coast-types';
import { assertAtlasReplacementLocksPreserved } from '../generation-locks';
import { quadQ } from './quality';
import { generateDetailShapeAdd, type DetailShapeAddSummary } from './detail-shape-add';
import type { GenerationOutput } from './macro';

export interface AddDetailAdapterOutput {
  data: AtlasDetailCoastDocument;
  summary: GenerationOutput['summary'] & { detailAdd: DetailShapeAddSummary & { componentBasis: 'coarse-center-4-neighbor' } };
}

/** The independent additive recipe owns and verifies the actual v4 document.
 * It derives the complete true-quad lock list; no UI flags authorize omission.
 * Non-elevation layers, catalogs, previous provenance and locks stay intact.
 * The session binds new provenance/revision and publishes only after a receipt. */
export async function generateAddDetailAtlas(input: { base: AtlasDocument; recipe: AddDetailRecipe }, control?: AtlasControl): Promise<AddDetailAdapterOutput> {
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'recipe']) || !isDetailCoastDocument(input.base) || !validateAddDetailRecipe(input.recipe)) throw new Error('追加大陆需要第四版草稿与当前追加配方。');
  const recipe = structuredClone(input.recipe), base = await cloneVerifiedAtlasDocument(input.base, control);
  if (!isDetailCoastDocument(base)) throw new Error('旧版地图不能执行细海岸追加。');
  if (base.detailCoast.size === 0) throw new Error('请先画出第一片大陆，再使用追加大陆。');
  const measured = await extractDetailCoastBase(base, control), total = measured.size ** 2;
  const ids: number[] = [], flags: number[] = [];
  for (let id = 0; id < total; id++) {
    const x = id % measured.size, y = Math.floor(id / measured.size), flag = base.locks.get(`lock:${Math.floor(x / 32)}:${Math.floor(y / 32)}`)?.flags[y % 32 * 32 + x % 32] ?? 0;
    if (flag) { ids.push(id); flags.push(flag); }
    if ((id + 1) % 1024 === 0) await yieldAtlas(control, '读取已有大陆的完整区域锁', id + 1, total);
  }
  const quadsQ = new Int32Array(ids.length * 8);
  for (let index = 0; index < ids.length; index++) {
    quadsQ.set(quadQ(base, ids[index]).flat(), index * 8);
    if ((index + 1) % 128 === 0 || index + 1 === ids.length) await yieldAtlas(control, '读取锁区的真实四边形', index + 1, ids.length);
  }
  const output = await generateDetailShapeAdd({ base: { format: 'lieguoji-detail-shape-add-base', version: 1, size: measured.size,
    centersQ: measured.centersQ, elevationsMeters: measured.elevationsMeters, detailCoast: base.detailCoast,
    locks: { cellIds: Uint32Array.from(ids).buffer, flags: Uint8Array.from(flags).buffer, quadsQ: quadsQ.buffer } },
    recipe: { seed: recipe.seed, ...recipe.parameters } }, { signal: control?.signal, yieldControl: control?.yieldTask,
    onProgress: (phase, completed, all) => control?.onProgress?.({ stage: `追加大陆：${phase}`, completed, total: all }) });
  if (output.coarseElevations.length !== total || output.summary.totalAreaTwiceQ2 !== measured.worldAreaTwiceQ2
    || output.summary.landAreaTwiceQ2 + output.summary.seaAreaTwiceQ2 !== measured.worldAreaTwiceQ2 || output.summary.addedLandAreaTwiceQ2 <= 0) throw new Error('追加候选未产生合法的新陆地，原世界未改变。');
  const next: AtlasDetailCoastDocument = { manifest: structuredClone(base.manifest), blocks: new Map(base.blocks), locks: new Map(base.locks), detailCoast: output.detailCoast };
  const changed = new Set<BlockKey>(); let changedCellCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000;
  for (let id = 0; id < total; id++) {
    const height = output.coarseElevations[id], old = getCellLayerSlot(base, 'elevation', id);
    if (!Number.isInteger(height) || height < -12000 || height > 12000) throw new Error('追加大陆高程越界。');
    if (old.block.values[old.slot] !== height) {
      if (!changed.has(old.key)) { next.blocks.set(old.key, cloneBlock(old.block)); changed.add(old.key); }
      const target = getCellLayerSlot(next, 'elevation', id); target.block.values[target.slot] = height; changedCellCount++;
    }
    minElevationMeters = Math.min(minElevationMeters, height); maxElevationMeters = Math.max(maxElevationMeters, height);
    if ((id + 1) % 1024 === 0) await yieldAtlas(control, '写入新增大陆的基础地形', id + 1, total);
  }
  let hashed = 0;
  for (const ref of next.manifest.blockRefs) if (changed.has(ref.key)) {
    ref.hash = await hashBlock(next.blocks.get(ref.key)!);
    if (++hashed % 8 === 0 || hashed === changed.size) await yieldAtlas(control, '核验追加大陆基础地形摘要', hashed, changed.size);
  }
  next.manifest.detailCoast.refs = [];
  // The directory has at most 4096 entries; stable row-major registration does
  // not sort millions of nodes or retain a world-sized triangle mesh.
  const tiles = [...next.detailCoast.values()].sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx);
  for (let index = 0; index < tiles.length; index++) {
    control?.signal?.throwIfAborted(); const tile = tiles[index];
    if (next.detailCoast.get(detailCoastKey(tile.bx, tile.by)) !== tile) throw new Error('追加细海岸身份不一致。');
    next.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) });
    if (tile.mode === 'samples') for (const value of tile.elevationMeters) { minElevationMeters = Math.min(minElevationMeters, value); maxElevationMeters = Math.max(maxElevationMeters, value); }
    if ((index + 1) % 8 === 0 || index + 1 === tiles.length) await yieldAtlas(control, '核验追加大陆细场摘要', index + 1, tiles.length);
  }
  await assertAtlasReplacementLocksPreserved(base, next, control);
  const heights = output.coarseElevations, seen = new Uint8Array(total), queue = new Uint32Array(total); let majorComponentCount = 0, visited = 0;
  for (let first = 0; first < total; first++) {
    if (heights[first] >= 0 && !seen[first]) {
      majorComponentCount++; let head = 0, tail = 1; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++], x = id % measured.size, y = Math.floor(id / measured.size);
        for (const next of [x > 0 ? id - 1 : -1, x + 1 < measured.size ? id + 1 : -1, y > 0 ? id - measured.size : -1, y + 1 < measured.size ? id + measured.size : -1]) if (next >= 0 && heights[next] >= 0 && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
        if (++visited % 1024 === 0) await yieldAtlas(control, '统计追加后的粗采样连通片', visited, total);
      }
    }
    if ((first + 1) % 1024 === 0) await yieldAtlas(control, '核验追加地形采样覆盖', first + 1, total);
  }
  control?.signal?.throwIfAborted();
  return { data: next, summary: { changedCellCount, landAreaQ2: output.summary.landAreaTwiceQ2, worldAreaQ2: output.summary.totalAreaTwiceQ2,
    majorComponentCount, minElevationMeters, maxElevationMeters, detailAdd: { ...output.summary, componentBasis: 'coarse-center-4-neighbor' } } };
}
