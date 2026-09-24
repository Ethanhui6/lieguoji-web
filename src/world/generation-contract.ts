import type { AtlasBlock, AtlasDraftData, AtlasDraftManifest, AtlasGridSpec, BlockKey } from './model';
import { COAST_GENERATOR_FINGERPRINT, ISLAND_GENERATOR_FINGERPRINT, LANDFORM_GENERATOR_FINGERPRINT, MACRO_GENERATOR_FINGERPRINT } from './generation/fingerprint';

export type AtlasFormat = 1 | 2;
export type LockKey = `lock:${number}:${number}`;
export interface AtlasCellLockBlock {
  format: 'lieguoji-atlas-cell-locks'; version: 1; bx: number; by: number; flags: Uint8Array;
}
export interface AtlasConstraints {
  format: 'lieguoji-atlas-constraints'; version: 1; lockCodec: 'cell-lock-mask-v1';
  lockRefs: { bx: number; by: number; hash: string }[];
}
export interface AtlasCopyOrigin {
  format: 'lieguoji-atlas-copy-origin'; version: 1; sourceFormat: AtlasFormat;
  sourceDraftId: string; sourceSlot: 'current' | 'backup'; sourceManifestDigest: string;
  sourceManifestRevision: number; observedRootDigest: string;
}
export interface MacroRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'macro-landmass'; version: 1; fingerprint: string };
  seed: string;
  parameters: { majorContinents: number; landCoveragePermille: number; coastWavelengthWorld: number; reliefMeters: number };
}
export interface LandformRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'landforms'; version: 1; fingerprint: string };
  seed: string;
  parameters: { mountainRanges: number; basins: number; reliefMeters: number };
}
export interface IslandRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'island-chains'; version: 1; fingerprint: string };
  seed: string;
  parameters: { chainCount: number; islandsPerChain: number; radiusWorld: number; reliefMeters: number };
}
export interface CoastRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'coast-smoothing'; version: 1; fingerprint: string };
  parameters: { strengthPermille: number; iterations: number };
}
export type GenerationRecipe = MacroRecipe | LandformRecipe | IslandRecipe | CoastRecipe;
export interface AtlasCellRectangle { column: number; row: number; columns: number; rows: number }
/** The rectangle includes its transition band; nothing outside it is writable. */
export type GenerationScope = { kind: 'world' } | ({ kind: 'cell-rectangle'; transitionCells: number } & AtlasCellRectangle);
export interface LastGeneration {
  recipe: GenerationRecipe; scope: GenerationScope; baseManifestDigest: string; baseRootDigest: string;
  baseRevision: number; lockSetDigest: string; appliedRevision: number;
}
export interface AtlasDraftManifestV2 extends Omit<AtlasDraftManifest, 'version'> {
  version: 2; origin: AtlasCopyOrigin | null; constraints: AtlasConstraints;
  generation: { format: 'lieguoji-atlas-generation'; version: 1; lastApplied: LastGeneration | null };
}
export interface AtlasGenerationDocument {
  manifest: AtlasDraftManifestV2; blocks: Map<BlockKey, AtlasBlock>; locks: Map<string, AtlasCellLockBlock>;
}
export type AtlasDocument = AtlasDraftData | AtlasGenerationDocument;
export type AtlasManifest = AtlasDraftManifest | AtlasDraftManifestV2;
export type AtlasManifestFor<F extends AtlasFormat> = F extends 1 ? AtlasDraftManifest : AtlasDraftManifestV2;
export const generationHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const generationInt = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export function generationExact(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Reflect.ownKeys(value).length === names.length && names.every(name => { const d = Object.getOwnPropertyDescriptor(value, name); return d?.enumerable && 'value' in d; });
}
export function generationArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !('value' in d)) return false; }
  return true;
}
export function generationCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(generationCanonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${generationCanonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function generationDigest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function validateMacroRecipe(raw: unknown): raw is MacroRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'macro-landmass' || raw.generator.version !== 1 || !generationHash(raw.generator.fingerprint) || raw.generator.fingerprint !== MACRO_GENERATOR_FINGERPRINT || !generationExact(raw.parameters, ['majorContinents', 'landCoveragePermille', 'coastWavelengthWorld', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.majorContinents, 1, 6) && generationInt(p.landCoveragePermille, 150, 650) && generationInt(p.coastWavelengthWorld, 128, 1024) && generationInt(p.reliefMeters, 200, 6000);
  } catch { return false; }
}
export function validateLandformRecipe(raw: unknown): raw is LandformRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'landforms' || raw.generator.version !== 1 || !generationHash(raw.generator.fingerprint) || raw.generator.fingerprint !== LANDFORM_GENERATOR_FINGERPRINT || !generationExact(raw.parameters, ['mountainRanges', 'basins', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.mountainRanges, 0, 8) && generationInt(p.basins, 0, 8) && generationInt(p.reliefMeters, 200, 6000) && generationInt(p.mountainRanges + p.basins, 1, 12);
  } catch { return false; }
}
/** Closed registration: adding a recipe requires an implemented codec and source fingerprint. */
export function validateGenerationRecipe(raw: unknown): raw is GenerationRecipe {
  return validateMacroRecipe(raw) || validateLandformRecipe(raw) || validateIslandRecipe(raw) || validateCoastRecipe(raw);
}
export function validateIslandRecipe(raw: unknown): raw is IslandRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'island-chains' || raw.generator.version !== 1 || raw.generator.fingerprint !== ISLAND_GENERATOR_FINGERPRINT || !generationHash(raw.generator.fingerprint) || !generationExact(raw.parameters, ['chainCount', 'islandsPerChain', 'radiusWorld', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.chainCount, 1, 3) && generationInt(p.islandsPerChain, 2, 6) && generationInt(p.radiusWorld, 64, 128) && generationInt(p.reliefMeters, 200, 3000);
  } catch { return false; }
}
export function validateCoastRecipe(raw: unknown): raw is CoastRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'coast-smoothing' || raw.generator.version !== 1 || raw.generator.fingerprint !== COAST_GENERATOR_FINGERPRINT || !generationHash(raw.generator.fingerprint) || !generationExact(raw.parameters, ['strengthPermille', 'iterations'])) return false;
    return generationInt(raw.parameters.strengthPermille, 100, 1000) && generationInt(raw.parameters.iterations, 1, 4);
  } catch { return false; }
}
export function encodeGenerationRecipe(recipe: GenerationRecipe): Uint8Array {
  if (!validateGenerationRecipe(recipe)) throw new Error('生成配方、参数或实现指纹不兼容。');
  return new TextEncoder().encode(generationCanonical(recipe));
}
export function validateCellRectangle(raw: unknown, spec?: AtlasGridSpec): raw is AtlasCellRectangle {
  return generationExact(raw, ['column', 'row', 'columns', 'rows'])
    && generationInt(raw.column, 0, (spec?.columns ?? 512) - 1) && generationInt(raw.row, 0, (spec?.rows ?? 512) - 1)
    && generationInt(raw.columns, 1, spec?.columns ?? 512) && generationInt(raw.rows, 1, spec?.rows ?? 512)
    && raw.column + raw.columns <= (spec?.columns ?? 512) && raw.row + raw.rows <= (spec?.rows ?? 512);
}
export function validateGenerationScope(raw: unknown, spec?: AtlasGridSpec): raw is GenerationScope {
  if (generationExact(raw, ['kind']) && raw.kind === 'world') return true;
  return generationExact(raw, ['kind', 'column', 'row', 'columns', 'rows', 'transitionCells']) && raw.kind === 'cell-rectangle'
    && validateCellRectangle({ column: raw.column, row: raw.row, columns: raw.columns, rows: raw.rows }, spec)
    && generationInt(raw.transitionCells, 0, Math.min(16, Math.floor((Math.min(raw.columns as number, raw.rows as number) - 1) / 2)));
}
export function validateGenerationOperation(recipe: unknown, scope: unknown, spec?: AtlasGridSpec): boolean {
  return validateGenerationRecipe(recipe) && validateGenerationScope(scope, spec)
    && (scope.kind === 'world' || recipe.generator.id === 'landforms' || recipe.generator.id === 'coast-smoothing');
}
export function encodeMacroRecipe(recipe: MacroRecipe): Uint8Array {
  if (!validateMacroRecipe(recipe)) throw new Error('生成配方、参数或实现指纹不兼容。');
  return new TextEncoder().encode(generationCanonical(recipe));
}
export function validateCopyOrigin(raw: unknown): raw is AtlasCopyOrigin {
  return generationExact(raw, ['format', 'version', 'sourceFormat', 'sourceDraftId', 'sourceSlot', 'sourceManifestDigest', 'sourceManifestRevision', 'observedRootDigest']) && raw.format === 'lieguoji-atlas-copy-origin' && raw.version === 1 && (raw.sourceFormat === 1 || raw.sourceFormat === 2) && typeof raw.sourceDraftId === 'string' && /^atlas-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw.sourceDraftId) && (raw.sourceSlot === 'current' || raw.sourceSlot === 'backup') && generationHash(raw.sourceManifestDigest) && generationInt(raw.sourceManifestRevision) && generationHash(raw.observedRootDigest);
}
export function validateAtlasConstraints(raw: unknown, spec?: AtlasGridSpec): raw is AtlasConstraints {
  if (!generationExact(raw, ['format', 'version', 'lockCodec', 'lockRefs']) || raw.format !== 'lieguoji-atlas-constraints' || raw.version !== 1 || raw.lockCodec !== 'cell-lock-mask-v1' || !generationArray(raw.lockRefs)) return false;
  let previous = -1;
  for (const ref of raw.lockRefs) {
    if (!generationExact(ref, ['bx', 'by', 'hash']) || !generationInt(ref.bx, 0, (spec?.columns ?? 512) / 32 - 1) || !generationInt(ref.by, 0, (spec?.rows ?? 512) / 32 - 1) || !generationHash(ref.hash)) return false;
    const order = ref.by * 16 + ref.bx; if (order <= previous) return false; previous = order;
  }
  return true;
}
