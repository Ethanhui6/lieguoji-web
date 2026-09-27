import { cloneVerifiedAtlasDocument, isDetailCoastDocument } from '../atlas-format';
import { generationExact, validateGenerationOperation, validateLocalDetailReliefRecipe, type AtlasDetailCoastDocument, type AtlasDocument, type GenerationScope, type LocalDetailReliefRecipe } from '../generation-contract';
import { yieldAtlas, type AtlasControl } from '../model';
import { extractDetailCoastBase } from '../detail-coast-base';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey } from '../detail-coast-types';
import { assertAtlasReplacementLocksPreserved } from '../generation-locks';
import { quadQ } from './quality';
import { generateLocalDetailRelief, type DetailLocalReliefSummary } from './detail-local-relief';
import type { GenerationOutput } from './macro';

export interface LocalDetailReliefAdapterOutput {
  data: AtlasDetailCoastDocument;
  summary: GenerationOutput['summary'] & { detailLocalRelief: DetailLocalReliefSummary & {
    componentBasis: 'coarse-center-4-neighbor'; elevationRangeBasis: 'stored-samples-and-coarse-base';
  } };
}

/** Rebuild only permitted fine land heights. The independent kernel cannot
 * write coarse geography; keeping its complete Hbase unchanged also freezes
 * all implicit sea and uniform-land nodes outside the local operation. */
export async function generateLocalDetailReliefAtlas(input: { base: AtlasDocument; recipe: LocalDetailReliefRecipe; scope: GenerationScope }, control?: AtlasControl): Promise<LocalDetailReliefAdapterOutput> {
  control?.signal?.throwIfAborted();
  if (!generationExact(input, ['base', 'recipe', 'scope']) || !isDetailCoastDocument(input.base)
    || !validateLocalDetailReliefRecipe(input.recipe) || !validateGenerationOperation(input.recipe, input.scope, input.base.manifest.spec)
    || input.scope.kind !== 'cell-rectangle') throw new Error('局部山地需要第四版已有陆地、当前配方和带过渡区的选框。');
  const recipe = structuredClone(input.recipe), scope = structuredClone(input.scope), base = await cloneVerifiedAtlasDocument(input.base, control);
  if (!isDetailCoastDocument(base)) throw new Error('旧版地图不能执行细地形局部生成。');
  const measured = await extractDetailCoastBase(base, control), total = measured.size ** 2;
  const quadsQ = new Int32Array(total * 8), ids: number[] = [], flags: number[] = [];
  for (let id = 0; id < total; id++) {
    quadsQ.set(quadQ(base, id).flat(), id * 8);
    const x = id % measured.size, y = Math.floor(id / measured.size), flag = base.locks.get(`lock:${Math.floor(x / 32)}:${Math.floor(y / 32)}`)?.flags[y % 32 * 32 + x % 32] ?? 0;
    if (flag) { ids.push(id); flags.push(flag); }
    if ((id + 1) % 512 === 0 || id + 1 === total) await yieldAtlas(control, '读取局部山地的真实选区与锁', id + 1, total);
  }
  const output = await generateLocalDetailRelief({ base: { format: 'lieguoji-detail-local-relief-base', version: 1, size: measured.size,
    centersQ: measured.centersQ, elevationsMeters: measured.elevationsMeters, quadsQ: quadsQ.buffer,
    detailCoast: base.detailCoast, locks: { cellIds: Uint32Array.from(ids).buffer, flags: Uint8Array.from(flags).buffer } },
    seed: recipe.seed, reliefMeters: recipe.parameters.reliefMeters, scope }, {
    signal: control?.signal, yieldControl: control?.yieldTask,
    onProgress: (phase, completed, all) => control?.onProgress?.({ stage: `局部山地：${phase}`, completed, total: all }),
  });
  if (output.summary.totalAreaTwiceQ2 !== measured.worldAreaTwiceQ2
    || output.summary.landAreaTwiceQ2 + output.summary.seaAreaTwiceQ2 !== measured.worldAreaTwiceQ2
    || output.summary.changedFineNodeCount <= 0 || output.summary.changedCoarseSamples !== 0) throw new Error('局部山地候选没有合法的细高程改动，原世界未改变。');
  const next: AtlasDetailCoastDocument = { manifest: structuredClone(base.manifest), blocks: new Map(base.blocks), locks: new Map(base.locks), detailCoast: output.detailCoast };
  next.manifest.detailCoast.refs = [];
  const tiles = [...next.detailCoast.values()].sort((a, b) => a.by * 64 + a.bx - b.by * 64 - b.bx);
  const heights = new Int32Array(measured.elevationsMeters);
  let minElevationMeters = 12000, maxElevationMeters = -12000;
  for (const height of heights) { minElevationMeters = Math.min(minElevationMeters, height); maxElevationMeters = Math.max(maxElevationMeters, height); }
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index]; control?.signal?.throwIfAborted();
    if (next.detailCoast.get(detailCoastKey(tile.bx, tile.by)) !== tile) throw new Error('局部山地细场身份不一致。');
    next.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) });
    if (tile.mode === 'samples') for (const height of tile.elevationMeters) { minElevationMeters = Math.min(minElevationMeters, height); maxElevationMeters = Math.max(maxElevationMeters, height); }
    if ((index + 1) % 8 === 0 || index + 1 === tiles.length) await yieldAtlas(control, '核验局部山地细场摘要', index + 1, tiles.length);
  }
  await assertAtlasReplacementLocksPreserved(base, next, control);
  // This legacy summary field deliberately remains coarse-center connectivity.
  // The true fine land area is unchanged and comes from the kernel's coverage audit.
  const seen = new Uint8Array(total), queue = new Uint32Array(total); let majorComponentCount = 0, visited = 0;
  for (let first = 0; first < total; first++) {
    if (heights[first] >= 0 && !seen[first]) {
      majorComponentCount++; let head = 0, tail = 1; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++], x = id % measured.size, y = Math.floor(id / measured.size);
        for (const near of [x > 0 ? id - 1 : -1, x + 1 < measured.size ? id + 1 : -1, y > 0 ? id - measured.size : -1, y + 1 < measured.size ? id + measured.size : -1]) if (near >= 0 && heights[near] >= 0 && !seen[near]) { seen[near] = 1; queue[tail++] = near; }
        if (++visited % 1024 === 0) await yieldAtlas(control, '核对未变的粗陆地连通片', visited, total);
      }
    }
    if ((first + 1) % 1024 === 0) await yieldAtlas(control, '汇总局部山地采样范围', first + 1, total);
  }
  control?.signal?.throwIfAborted();
  return { data: next, summary: { changedCellCount: 0, landAreaQ2: output.summary.landAreaTwiceQ2, worldAreaQ2: output.summary.totalAreaTwiceQ2,
    majorComponentCount, minElevationMeters, maxElevationMeters,
    detailLocalRelief: { ...output.summary, componentBasis: 'coarse-center-4-neighbor', elevationRangeBasis: 'stored-samples-and-coarse-base' } } };
}
