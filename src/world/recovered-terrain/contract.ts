export const SEED_TERRAIN_GENERATOR_ID = 'recovered-height-square-v1' as const;
export const SEED_TERRAIN_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'archipelago', label: '群岛', description: '交错岛链、浅海与狭长海峡。' }),
  Object.freeze({ id: 'continents', label: '多大陆', description: '数块大陆与彼此分隔的海洋。' }),
  Object.freeze({ id: 'highIsland', label: '高山大岛', description: '高耸山地向低地与海岸延伸。' }),
  Object.freeze({ id: 'pangea', label: '联合大陆', description: '宽广连贯的大陆与海湾。' }),
] as const);
export type SeedTerrainTemplate = typeof SEED_TERRAIN_TEMPLATES[number]['id'];
export interface SeedTerrainRequest { seed: string; template: SeedTerrainTemplate; layout: 'square-v1' }
export function validSeedTerrainRequest(raw: unknown): raw is SeedTerrainRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>, keys = Object.keys(value);
  return keys.length === 3 && ['seed', 'template', 'layout'].every(key => Object.hasOwn(value, key))
    && typeof value.seed === 'string' && value.seed.length > 0 && value.seed.length <= 80 && value.seed.trim() === value.seed
    && ![...value.seed].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    && SEED_TERRAIN_TEMPLATES.some(template => template.id === value.template) && value.layout === 'square-v1';
}
