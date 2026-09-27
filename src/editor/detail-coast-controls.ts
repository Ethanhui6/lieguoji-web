import { validateDetailShapeRecipe, validateAddDetailRecipe, validateNaturalDetailRecipe, validateAddNaturalDetailRecipe, type DetailShapeRecipe, type AddDetailRecipe, type NaturalDetailRecipe, type AddNaturalDetailRecipe } from '../world/generation-contract';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, ADD_DETAIL_GENERATOR_FINGERPRINT, NATURAL_DETAIL_GENERATOR_FINGERPRINT, ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT } from '../world/generation/fingerprint';

export interface DetailCoastControls {
  version: 1 | 2; seed: string; structure: number; roughness: number;
  shelf: number; relief: number; islands: number; islandsPerChain: number;
}
export type FineTerrainRecipe = DetailShapeRecipe | AddDetailRecipe | NaturalDetailRecipe | AddNaturalDetailRecipe;
/** New empty worlds start at v2. Loading an existing recipe restores its actual
 * version and all exposed parameters without relabeling the saved fingerprint. */
export function defaultDetailCoastControls(seed: string): DetailCoastControls {
  return { version: 2, seed, structure: 96, roughness: 16, shelf: 72, relief: 2400, islands: 1, islandsPerChain: 3 };
}
export function restoreDetailCoastControls(raw: unknown, fallbackSeed: string): DetailCoastControls {
  if (validateNaturalDetailRecipe(raw, undefined, 'storage') || validateAddNaturalDetailRecipe(raw, undefined, 'storage')) {
    const p = raw.parameters;
    return { version: 2, seed: raw.seed, structure: p.coastStructureWorld, roughness: p.coastRoughnessWorld, shelf: p.shelfWidthWorld, relief: p.reliefMeters, islands: p.islandChainCount, islandsPerChain: p.islandsPerChain };
  }
  if (validateDetailShapeRecipe(raw, undefined, 'storage') || validateAddDetailRecipe(raw, undefined, 'storage')) {
    const p = raw.parameters;
    return { version: 1, seed: raw.seed, structure: 0, roughness: p.coastRoughnessWorld, shelf: p.shelfWidthWorld, relief: p.reliefMeters, islands: p.islandChainCount, islandsPerChain: p.islandsPerChain };
  }
  return defaultDetailCoastControls(fallbackSeed);
}
/** Friendly local input feedback supplements, never replaces, Worker checks. */
export function makeDetailCoastRecipe(controls: DetailCoastControls, points: readonly { xQ: number; yQ: number }[], additive: boolean): FineTerrainRecipe {
  if (points.length < 3 || new Set(points.map(point => `${point.xQ}:${point.yQ}`)).size < 3) throw new Error('请画出至少三个不同的点，围成一片大陆；松手后轮廓会自动闭合。');
  const marginWorld = controls.version === 2 ? controls.structure + controls.roughness + 52 : controls.roughness + 4;
  const marginQ = marginWorld * 256, maxQ = 4096 * 256;
  if (points.some(point => point.xQ < marginQ || point.yQ < marginQ || point.xQ > maxQ - marginQ || point.yQ > maxQ - marginQ)) throw new Error(`轮廓太靠近地图边缘。请向地图中央移一些，至少留出 ${marginWorld} 世界单位海水，也为湾岬变化留出空间。`);
  const parameters = { pointsQ: points.map(point => ({ ...point })), coastRoughnessWorld: controls.roughness, reliefMeters: controls.relief, shelfWidthWorld: controls.shelf, islandChainCount: controls.islands, islandsPerChain: controls.islandsPerChain };
  let recipe: FineTerrainRecipe;
  if (controls.version === 2) {
    const natural = { ...parameters, coastStructureWorld: controls.structure };
    recipe = additive
      ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'add-detail-landmass', version: 2, fingerprint: ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT }, seed: controls.seed, parameters: natural }
      : { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 2, fingerprint: NATURAL_DETAIL_GENERATOR_FINGERPRINT }, seed: controls.seed, parameters: natural };
  } else {
    recipe = additive
      ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'add-detail-landmass', version: 1, fingerprint: ADD_DETAIL_GENERATOR_FINGERPRINT }, seed: controls.seed, parameters }
      : { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: controls.seed, parameters };
  }
  if (!validateDetailShapeRecipe(recipe) && !validateAddDetailRecipe(recipe) && !validateNaturalDetailRecipe(recipe) && !validateAddNaturalDetailRecipe(recipe)) throw new Error('轮廓或参数暂不符合生成要求。请让轮廓围成一片区域、不交叉，避免重复折返，并检查地形参数。');
  return recipe;
}
