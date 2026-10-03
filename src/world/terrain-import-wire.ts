import type { AtlasDetailCoastDocument } from './generation-contract';
import type { TerrainImportSummary } from './terrain-import';

export const TERRAIN_IMPORT_MAX_BYTES = 12 * 1024 * 1024;
export interface TerrainImportIdentity {
  candidateId: string; commandId: string; draftId: string; manifestDigest: string; sourceSha256: string;
}
export interface TerrainImportPreview { data: AtlasDetailCoastDocument; summary: TerrainImportSummary; identity: TerrainImportIdentity }
export interface TerrainImportHeader extends TerrainImportIdentity {
  summary: TerrainImportSummary; manifestLength: number; blockCount: number; lockCount: number; detailCoastCount: number;
}
export const importObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const importHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const importExact = (value: unknown, keys: string[]): value is Record<string, unknown> => importObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
/** Receiver boundary for every field consumed by UI or exported provenance. */
export function validTerrainImportSummary(raw: unknown): raw is TerrainImportSummary {
  const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const label = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!importExact(raw, ['sourceSha256', 'sourceBytes', 'pointCount', 'triangleCount', 'width', 'height', 'seed', 'template', 'sourceHeightHash', 'sourceTopologyHash', 'converter', 'mapping'])
    || !importHash(raw.sourceSha256) || !importHash(raw.sourceHeightHash) || !importHash(raw.sourceTopologyHash) || !integer(raw.sourceBytes, 2, TERRAIN_IMPORT_MAX_BYTES)
    || !integer(raw.pointCount, 4, 50000) || !integer(raw.triangleCount, 2, 100000) || !finite(raw.width, 1, 1000000) || !finite(raw.height, 1, 1000000)
    || !label(raw.seed, 80) || !label(raw.template, 80) || raw.converter !== 'research-to-atlas-v4-v1') return false;
  const mapping = raw.mapping;
  if (!importExact(mapping, ['scale', 'offsetX', 'offsetY', 'width', 'height', 'seaLevel', 'metersPerUnit', 'outerSeaMeters', 'note'])
    || !finite(mapping.scale, 0.004096, 4096) || !finite(mapping.offsetX, 0, 2048) || !finite(mapping.offsetY, 0, 2048) || !finite(mapping.width, 0, 4096) || !finite(mapping.height, 0, 4096)
    || mapping.seaLevel !== 20 || mapping.metersPerUnit !== 100 || mapping.outerSeaMeters !== -2000 || !label(mapping.note, 2048)) return false;
  return mapping.scale === 4096 / Math.max(raw.width, raw.height) && mapping.width === raw.width * mapping.scale && mapping.height === raw.height * mapping.scale
    && mapping.offsetX === (4096 - mapping.width) / 2 && mapping.offsetY === (4096 - mapping.height) / 2;
}
export async function terrainInputDigest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)), value => value.toString(16).padStart(2, '0')).join('');
}
