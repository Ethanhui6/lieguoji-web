import { hashAtlasManifest, isGenerationDocument, type AtlasDocument } from './atlas-format';
import { hashBlock, yieldAtlas, type AtlasControl } from './model';
import { hashAtlasLockSet } from './generation-locks';
import { encodeGenerationRecipe, generationCanonical, generationDigest, validateMacroRecipe, validateLandformRecipe, validateIslandRecipe, validateShapeRecipe, validateOceanRecipe, validateCoastRecipe, validateGenerationRecipe, validateGenerationScope, validateGenerationOperation } from './generation-contract';
import type { GenerationRecipe, GenerationScope } from './generation-contract';
import { generateMacro, type GenerationOutput } from './generation/macro';
import { generateLandforms, type LandformOutput } from './generation/landforms';
import { generateIslands, type IslandOutput } from './generation/islands';
import { generateCoast, type CoastOutput } from './generation/coast';
import { generateShape, type ShapeOutput } from './generation/shape';
import { generateOcean, type OceanOutput } from './generation/ocean';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';

export interface GenerationPreviewInfo extends PreparedAtlasReplacement {
  recipe: GenerationRecipe; scope: GenerationScope; recipeDigest: string; scopeDigest: string; lockSetDigest: string;
  summary: GenerationOutput['summary'] & { landforms?: LandformOutput['summary']; islands?: IslandOutput['summary']; coast?: CoastOutput['summary']; shape?: ShapeOutput['summary']['shape']; ocean?: OceanOutput['summary']['ocean'] }; previewDigest: string;
}
export interface GenerationConfirm {
  candidateId: string; commandId: string; previewDigest: string; expectedRevision: number; expectedRootDigest: string;
}
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(x => x.toString(16).padStart(2, '0')).join('');
export const generationRecipeDigest = (recipe: GenerationRecipe) => generationDigest(encodeGenerationRecipe(recipe));
export const generationScopeDigest = (scope: GenerationScope) => {
  if (!validateGenerationScope(scope)) throw new Error('生成范围无效。');
  return generationDigest(new TextEncoder().encode(generationCanonical(scope)));
};
export const generationLockDigest = (data: AtlasDocument) => {
  if (!isGenerationDocument(data)) throw new Error('生成需要独立第二版草稿。');
  return hashAtlasLockSet(data.manifest.constraints, data.manifest.spec);
};
export const generationPreviewDigest = (p: Omit<GenerationPreviewInfo, 'previewDigest'>) => digest([p.candidateId, p.commandId, p.baseRevision, p.baseRootDigest, p.baseManifestDigest, p.revision, p.manifestDigest, p.reason, p.recipeDigest, p.scopeDigest, p.lockSetDigest, p.summary]);

/** A candidate lives only in the owning Worker until a durable receipt publishes it. */
export class AtlasGenerationSession {
  #preview?: GenerationPreviewInfo;
  constructor(private session: OwnedAtlasSession) {}
  get pending() { return this.#preview ? structuredClone(this.#preview) : null; }
  async preview(commandId: string, expectedRevision: number, expectedRootDigest: string, rawRecipe: GenerationRecipe, rawScope: GenerationScope, control?: AtlasControl) {
    if (this.#preview || this.session.replacementPending) throw new Error('请先确认或取消当前生成预览。');
    if (!validateGenerationRecipe(rawRecipe) || !validateGenerationScope(rawScope)) throw new Error('生成配方或范围版本不受支持。');
    const recipe = structuredClone(rawRecipe), scope = structuredClone(rawScope), head = this.session.head;
    if (head.revision !== expectedRevision || head.rootDigest !== expectedRootDigest) throw new Error('生成基线已变化，请重新打开草稿。');
    const base = await this.session.snapshotAsync(control); if (!isGenerationDocument(base)) throw new Error('请先创建第二版草稿，或明确复制旧草稿后生成。');
    if (!validateGenerationOperation(recipe, scope, base.manifest.spec)) throw new Error('生成范围越界或该操作尚不支持局部范围；大陆重建与岛链使用整图，山系盆地和海岸可选择局部。');
    if (recipe.generator.id === 'macro-landmass' && base.locks.size) throw new Error('重建大陆需要未锁定的整张地图；保留海岸时请选择山系与盆地生成。');
    const recipeDigest = await generationRecipeDigest(recipe), scopeDigest = await generationScopeDigest(scope), lockSetDigest = await generationLockDigest(base);
    let output: Pick<GenerationOutput, 'blocks' | 'summary'>;
    let details: Pick<GenerationPreviewInfo['summary'], 'landforms' | 'islands' | 'coast' | 'shape' | 'ocean'> = {}, reason: string;
    if (validateMacroRecipe(recipe)) {
      output = await generateMacro({ base, recipe, scope }, control ?? {}); reason = '根据种子生成大陆与高程';
    } else if (validateLandformRecipe(recipe)) {
      const result = await generateLandforms({ base, parameters: { seed: recipe.seed, ...recipe.parameters }, scope }, control ?? {});
      output = result; details = { landforms: structuredClone(result.summary) }; reason = '保留海岸生成山系与盆地';
    } else if (validateIslandRecipe(recipe)) {
      const result = await generateIslands({ base, parameters: { seed: recipe.seed, ...recipe.parameters } }, control ?? {});
      output = result; details = { islands: structuredClone(result.summary) }; reason = '保留现有陆地生成岛链';
    } else if (validateShapeRecipe(recipe, base.manifest.spec)) {
      const result = await generateShape({ base, recipe }, control ?? {});
      output = result; details = { shape: structuredClone(result.summary.shape) }; reason = '按手绘轮廓生成大陆与近海地形';
    } else if (validateOceanRecipe(recipe, base.manifest.spec)) {
      const result = await generateOcean({ base, recipe }, control ?? {});
      output = result; details = { ocean: structuredClone(result.summary.ocean) }; reason = '保留陆地与内湖生成陆架和深海';
    } else if (validateCoastRecipe(recipe)) {
      const result = await generateCoast({ base, parameters: recipe.parameters, scope }, control ?? {});
      output = result; details = { coast: structuredClone(result.summary) }; reason = '细化真实海岸共享顶点';
    } else throw new Error('生成配方尚未实现或轮廓无效。');
    const summary: GenerationPreviewInfo['summary'] = {
      changedCellCount: output.summary.changedCellCount, landAreaQ2: output.summary.landAreaQ2,
      worldAreaQ2: output.summary.worldAreaQ2, majorComponentCount: output.summary.majorComponentCount,
      minElevationMeters: output.summary.minElevationMeters, maxElevationMeters: output.summary.maxElevationMeters,
      ...details,
    };
    control?.signal?.throwIfAborted();
    // base and generator output belong only to this invocation. Copy metadata
    // and map shells here; copying/revalidating all base buffers only to discard
    // them would repeat a synchronous full-world pass. prepareReplacement
    // still takes its own complete buffer copy and verifies every hash/quad.
    const next = { manifest: structuredClone(base.manifest), blocks: new Map(output.blocks), locks: new Map(base.locks) };
    await yieldAtlas(control, '整理候选分层引用', next.blocks.size, next.blocks.size);
    for (let start = 0; start < next.manifest.blockRefs.length; start += 8) {
      const end = Math.min(start + 8, next.manifest.blockRefs.length);
      for (let index = start; index < end; index++) {
        control?.signal?.throwIfAborted();
        const ref = next.manifest.blockRefs[index], block = next.blocks.get(ref.key);
        if (!block) throw new Error('生成器遗漏权威地理块。');
        ref.hash = await hashBlock(block);
      }
      await yieldAtlas(control, '核验候选地理块', end, next.manifest.blockRefs.length);
    }
    next.manifest.revision = head.revision + 1;
    next.manifest.generation.lastApplied = { recipe, scope, baseManifestDigest: head.manifestDigest, baseRootDigest: head.rootDigest, baseRevision: head.revision, lockSetDigest, appliedRevision: next.manifest.revision };
    const prepared = await this.session.prepareReplacement(next, commandId, reason, control);
    try {
      const partial = { ...prepared, recipe, scope, recipeDigest, scopeDigest, lockSetDigest, summary };
      const preview = { ...partial, previewDigest: await generationPreviewDigest(partial) }; control?.signal?.throwIfAborted();
      this.#preview = preview; return structuredClone(preview);
    } catch (error) { this.session.discardReplacement(prepared.candidateId); throw error; }
  }
  async confirm(raw: GenerationConfirm, control?: AtlasControl) {
    const p = this.#preview;
    if (!p || raw.candidateId !== p.candidateId || raw.commandId !== p.commandId || raw.previewDigest !== p.previewDigest || raw.expectedRevision !== p.baseRevision || raw.expectedRootDigest !== p.baseRootDigest
      || this.session.head.revision !== p.baseRevision || this.session.head.rootDigest !== p.baseRootDigest) throw new Error('生成确认未绑定当前预览和草稿。');
    const data = await this.session.replacementDocumentAsync(p.candidateId, control);
    if (await hashAtlasManifest(data.manifest) !== p.manifestDigest || await generationLockDigest(data) !== p.lockSetDigest || await generationPreviewDigest(p) !== p.previewDigest) throw new Error('生成预览摘要发生变化。');
    return { data, preview: structuredClone(p) };
  }
  discard(candidateId: string) {
    if (!this.#preview || this.#preview.candidateId !== candidateId) throw new Error('生成预览已经失效。');
    this.session.discardReplacement(candidateId); this.#preview = undefined;
  }
  published(candidateId: string) { if (this.#preview?.candidateId !== candidateId) throw new Error('已提交生成身份不一致。'); this.#preview = undefined; }
}
