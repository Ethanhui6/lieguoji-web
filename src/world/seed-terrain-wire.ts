import { SEED_TERRAIN_GENERATOR_ID, type SeedTerrainRequest } from './recovered-terrain/contract';
import { terrainInputDigest } from './terrain-import-wire';
import type { TerrainImportPreview } from './terrain-import-wire';

export interface SeedTerrainProvenance {
  generatorId: typeof SEED_TERRAIN_GENERATOR_ID; fingerprint: string;
  request: SeedTerrainRequest; requestDigest: string; sourceSha256: string;
}
export interface SeedTerrainPreview { terrain: TerrainImportPreview; generation: SeedTerrainProvenance }
export interface SeedTerrainTransferHeader {
  generatorId: typeof SEED_TERRAIN_GENERATOR_ID; fingerprint: string;
  requestDigest: string; sourceSha256: string; byteLength: number;
}
export function seedTerrainRequestDigest(request: SeedTerrainRequest): Promise<string> {
  return terrainInputDigest(new TextEncoder().encode(JSON.stringify({ generatorId: SEED_TERRAIN_GENERATOR_ID,
    fingerprint: __SEED_TERRAIN_FINGERPRINT__, request: { seed: request.seed, template: request.template, layout: request.layout } })));
}
