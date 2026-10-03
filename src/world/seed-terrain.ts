import { validSeedTerrainRequest, type SeedTerrainRequest } from './recovered-terrain/contract';
import { researchForLayout } from './recovered-terrain/research';
import type { AtlasControl } from './model';

export { SEED_TERRAIN_GENERATOR_ID, SEED_TERRAIN_TEMPLATES, validSeedTerrainRequest } from './recovered-terrain/contract';
export type { SeedTerrainRequest, SeedTerrainTemplate } from './recovered-terrain/contract';

/** Produces owned, deterministic research-v2 bytes for the existing strict
 * terrain importer. This function creates no Atlas or persisted draft itself. */
export async function generateTerrainResearch(request: SeedTerrainRequest, control?: AtlasControl): Promise<Uint8Array> {
  control?.signal?.throwIfAborted();
  if (!validSeedTerrainRequest(request)) throw new Error('种子地形参数无效；仅接受四种内建模板和正方形点网。');
  const { seed, template } = request; // Own primitives before the first yield.
  return researchForLayout(seed, template, 'square-v1', control);
}
