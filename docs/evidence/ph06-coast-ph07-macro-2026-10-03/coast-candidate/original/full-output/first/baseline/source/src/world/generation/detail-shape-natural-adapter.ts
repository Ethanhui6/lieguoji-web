import { cloneVerifiedAtlasDocument, isDetailCoastDocument } from '../atlas-format';
import { generationExact, validateNaturalDetailRecipe, type AtlasDetailCoastDocument, type AtlasDocument, type NaturalDetailRecipe } from '../generation-contract';
import { getCellLayerSlot, hashBlock, UNASSIGNED, yieldAtlas, type AtlasControl, type BlockKey } from '../model';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey } from '../detail-coast-types';
import { extractDetailCoastBase } from '../detail-coast-base';
import { generateDetailShapeNatural, type NaturalDetailShapeSummary } from './detail-shape-natural';
import { createNaturalOceanBase, NATURAL_OCEAN_BASE_PROFILE } from './natural-ocean-base';
import type { GenerationOutput } from './macro';

export interface NaturalDetailAdapterOutput {
  /** Complete private candidate data, before the session binds its next revision. */
  data: AtlasDetailCoastDocument;
  summary: GenerationOutput['summary'] & {
    detailNatural: NaturalDetailShapeSummary & { componentBasis: 'coarse-center-4-neighbor'; oceanBaseProfile: typeof NATURAL_OCEAN_BASE_PROFILE };
  };
}

/** Actual document ingress is the security boundary. Kernel presence booleans
 * are derived here from a verified private snapshot, never supplied by callers.
 * The kernel output remains a candidate; only the session/storage CAS publishes. */
export async function generateNaturalDetailAtlas(input: { base: AtlasDocument; recipe: NaturalDetailRecipe }, control?: AtlasControl): Promise<NaturalDetailAdapterOutput> {
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'recipe']) || !isDetailCoastDocument(input.base) || !validateNaturalDetailRecipe(input.recipe)) throw new Error('细大陆生成只接受第四版空草稿与当前独立细海岸配方。');
  const recipe = structuredClone(input.recipe);
  // cloneVerified takes ownership of every input buffer before its first await.
  const base = await cloneVerifiedAtlasDocument(input.base, control);
  if (!isDetailCoastDocument(base)) throw new Error('细大陆生成需要第四版草稿。');
  const locksPresent = base.locks.size !== 0 || base.manifest.constraints.lockRefs.length !== 0;
  const entitiesPresent = base.manifest.catalogs.simRegions.length !== 0 || base.manifest.catalogs.administration.length !== 0;
  const generationPresent = base.manifest.generation.lastApplied !== null;
  if (locksPresent || entitiesPresent || generationPresent || base.detailCoast.size || base.manifest.detailCoast.refs.length) throw new Error('首个细大陆只接受没有已有细海岸、实体、地块锁或生成历史的空世界。');
  let checkedBlocks = 0;
  for (const block of base.blocks.values()) {
    if ((block.layer === 'sim-membership' || block.layer === 'admin-membership') && block.values.some(value => value !== UNASSIGNED)) throw new Error('首个细大陆不能覆盖已有归属。');
    if (block.layer === 'elevation' && block.values.some(value => value >= 0)) throw new Error('首个细大陆不能覆盖已有陆地。');
    if (++checkedBlocks % 16 === 0) await yieldAtlas(control, '核验空世界实际图层', checkedBlocks, base.blocks.size);
  }
  const measured = await extractDetailCoastBase(base, control);
  // First-only v2 semantics: initial regional ocean relief is persisted in the
  // same coarse/fine candidate. The old empty world's -100 m bytes remain the
  // comparison baseline. Additive recipes never regenerate this ocean field.
  const oceanElevations = await createNaturalOceanBase({ size: measured.size, centersQ: measured.centersQ, seed: recipe.seed }, control);
  const output = await generateDetailShapeNatural({
    base: { format: 'lieguoji-empty-detail-shape-base', version: 1, size: base.manifest.spec.columns,
      centersQ: measured.centersQ, elevationsMeters: oceanElevations.buffer as ArrayBuffer,
      detailCoast: base.detailCoast, locksPresent, entitiesPresent, generationPresent },
    recipe: { format: 'lieguoji-natural-shape-recipe', version: 2, seed: recipe.seed, ...recipe.parameters },
  }, { signal: control?.signal, yieldControl: control?.yieldTask,
    onProgress: (phase, completed, total) => control?.onProgress?.({ stage: `细大陆：${phase}`, completed, total }) });
  if (output.coarseElevations.length !== measured.size ** 2 || output.summary.totalAreaTwiceQ2 !== measured.worldAreaTwiceQ2 || output.summary.landAreaTwiceQ2 + output.summary.seaAreaTwiceQ2 !== measured.worldAreaTwiceQ2) throw new Error('细大陆候选尺寸或真实面积不守恒，原世界未改变。');
  const changed = new Set<BlockKey>(); let changedCellCount = 0, minElevationMeters = 12000, maxElevationMeters = -12000;
  for (let id = 0; id < output.coarseElevations.length; id++) {
    const height = output.coarseElevations[id];
    if (height < -12000 || height > 12000) throw new Error('细大陆粗高程越界。');
    const slot = getCellLayerSlot(base, 'elevation', id);
    if (slot.block.values[slot.slot] !== height) { slot.block.values[slot.slot] = height; changed.add(slot.key); changedCellCount++; }
    minElevationMeters = Math.min(minElevationMeters, height); maxElevationMeters = Math.max(maxElevationMeters, height);
    if ((id + 1) % 1024 === 0) await yieldAtlas(control, '写入细大陆权威粗高程', id + 1, output.coarseElevations.length);
  }
  let completed = 0;
  for (const ref of base.manifest.blockRefs) if (changed.has(ref.key)) {
    ref.hash = await hashBlock(base.blocks.get(ref.key)!);
    if (++completed % 8 === 0 || completed === changed.size) await yieldAtlas(control, '核验细大陆粗高程摘要', completed, changed.size);
  }
  base.detailCoast = output.detailCoast;
  const tiles = [...base.detailCoast.values()].sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx);
  for (let index = 0; index < tiles.length; index++) {
    control?.signal?.throwIfAborted(); const tile = tiles[index];
    if (base.detailCoast.get(detailCoastKey(tile.bx, tile.by)) !== tile) throw new Error('细大陆 tile 身份失配。');
    base.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) });
    if (tile.mode === 'samples') for (const value of tile.elevationMeters) { minElevationMeters = Math.min(minElevationMeters, value); maxElevationMeters = Math.max(maxElevationMeters, value); }
    if ((index + 1) % 8 === 0 || index + 1 === tiles.length) await yieldAtlas(control, '核验细大陆权威细场摘要', index + 1, tiles.length);
  }
  // This retained legacy summary field measures coarse center samples only.
  // Fine bays/islands and point-only contacts are represented by the fine field,
  // not by this count; the explicit basis travels with the preview digest.
  const heights = output.coarseElevations, size = base.manifest.spec.columns, seen = new Uint8Array(heights.length), queue = new Uint32Array(heights.length);
  let majorComponentCount = 0, visited = 0;
  for (let first = 0; first < heights.length; first++) {
    if (heights[first] >= 0 && !seen[first]) {
      majorComponentCount++; let head = 0, tail = 1; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++], x = id % size, y = Math.floor(id / size);
        for (const next of [x > 0 ? id - 1 : -1, x + 1 < size ? id + 1 : -1, y > 0 ? id - size : -1, y + 1 < size ? id + size : -1]) if (next >= 0 && heights[next] >= 0 && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
        if (++visited % 1024 === 0) await yieldAtlas(control, '核验细大陆粗采样连通片', visited, heights.length);
      }
    }
    if ((first + 1) % 1024 === 0) await yieldAtlas(control, '核验细大陆粗采样覆盖', first + 1, heights.length);
  }
  control?.signal?.throwIfAborted();
  return { data: base, summary: { changedCellCount, landAreaQ2: output.summary.landAreaTwiceQ2, worldAreaQ2: output.summary.totalAreaTwiceQ2,
    majorComponentCount, minElevationMeters, maxElevationMeters,
    detailNatural: { ...output.summary, componentBasis: 'coarse-center-4-neighbor', oceanBaseProfile: NATURAL_OCEAN_BASE_PROFILE } } };
}
