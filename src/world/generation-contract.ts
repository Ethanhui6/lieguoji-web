import type { AtlasBlock, AtlasDetailCoastManifest, AtlasDetailCoastSurfaceContract, AtlasDraftData, AtlasDraftManifest, AtlasGridSpec, AtlasSurfaceContract, BlockKey } from './model';
import type { DetailCoastKey, DetailCoastTile } from './detail-coast-types';
import { ATLAS_COORDINATE_SCALE, ATLAS_WORLD_UNITS, validateSpec } from './model';
import { COAST_GENERATOR_FINGERPRINT, DETAIL_SHAPE_GENERATOR_FINGERPRINT, ISLAND_GENERATOR_FINGERPRINT, LANDFORM_GENERATOR_FINGERPRINT, MACRO_GENERATOR_FINGERPRINT, OCEAN_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { isStoredGeneratorFingerprint } from './generation-history';

export type AtlasFormat = 1 | 2 | 3 | 4;
export type { AtlasDetailCoastManifest, AtlasDetailCoastSurfaceContract } from './model';
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
export interface ShapeRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'shape-landmass'; version: 1; fingerprint: string };
  seed: string;
  parameters: {
    pointsQ: { xQ: number; yQ: number }[];
    coastRoughnessWorld: number; coastWavelengthWorld: number; reliefMeters: number; shelfWidthWorld: number;
  };
}
export interface OceanRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'ocean-floor'; version: 1; fingerprint: string };
  seed: string;
  parameters: { meanDepthMeters: number; reliefMeters: number; shelfWidthWorld: number };
}
export interface DetailShapeRecipe {
  format: 'lieguoji-atlas-recipe'; version: 1;
  generator: { id: 'shape-detail-landmass'; version: 1; fingerprint: string };
  seed: string;
  parameters: {
    pointsQ: { xQ: number; yQ: number }[];
    coastRoughnessWorld: number; reliefMeters: number; shelfWidthWorld: number;
    islandChainCount: number; islandsPerChain: number;
  };
}
export type GenerationRecipe = MacroRecipe | LandformRecipe | IslandRecipe | CoastRecipe | ShapeRecipe | OceanRecipe | DetailShapeRecipe;
/** Stored provenance may name an audited old implementation; execution may not. */
export type GenerationValidationMode = 'execute' | 'storage';
export interface AtlasCellRectangle { column: number; row: number; columns: number; rows: number }
/** The rectangle includes its transition band; nothing outside it is writable. */
export type GenerationScope = { kind: 'world' } | ({ kind: 'cell-rectangle'; transitionCells: number } & AtlasCellRectangle);
export interface LastGeneration {
  recipe: GenerationRecipe; scope: GenerationScope; baseManifestDigest: string; baseRootDigest: string;
  baseRevision: number; lockSetDigest: string; appliedRevision: number;
}
export interface LastDetailGeneration extends Omit<LastGeneration, 'recipe' | 'scope'> { recipe: DetailShapeRecipe; scope: { kind: 'world' } }
export interface AtlasDraftManifestV2 extends Omit<AtlasDraftManifest, 'version'> {
  version: 2; origin: AtlasCopyOrigin | null; constraints: AtlasConstraints;
  generation: { format: 'lieguoji-atlas-generation'; version: 1; lastApplied: LastGeneration | null };
}
export interface AtlasDraftManifestV3 extends Omit<AtlasDraftManifestV2, 'version'> {
  version: 3; surface: AtlasSurfaceContract;
}
export interface AtlasDraftManifestV4 extends Omit<AtlasDraftManifestV2, 'version' | 'origin' | 'generation'> {
  version: 4; origin: null; surface: AtlasDetailCoastSurfaceContract; detailCoast: AtlasDetailCoastManifest;
  // Detailed-field provenance is explicit; old coarse recipes cannot relabel v4.
  generation: { format: 'lieguoji-atlas-generation'; version: 1; lastApplied: LastDetailGeneration | null };
}
export type AtlasGenerationManifest = AtlasDraftManifestV2 | AtlasDraftManifestV3 | AtlasDraftManifestV4;
export interface AtlasLegacyGenerationDocument<F extends 2 | 3 = 2 | 3> {
  manifest: F extends 2 ? AtlasDraftManifestV2 : AtlasDraftManifestV3; blocks: Map<BlockKey, AtlasBlock>; locks: Map<string, AtlasCellLockBlock>;
  detailCoast?: never;
}
export interface AtlasDetailCoastDocument {
  manifest: AtlasDraftManifestV4; blocks: Map<BlockKey, AtlasBlock>; locks: Map<string, AtlasCellLockBlock>;
  detailCoast: Map<DetailCoastKey, DetailCoastTile>;
}
export type AtlasGenerationDocument<F extends 2 | 3 | 4 = 2 | 3 | 4> =
  ([Extract<F, 2 | 3>] extends [never] ? never : AtlasLegacyGenerationDocument<Extract<F, 2 | 3>>)
  | (4 extends F ? AtlasDetailCoastDocument : never);
export type AtlasDocument = AtlasDraftData | AtlasGenerationDocument;
export type AtlasManifest = AtlasDraftManifest | AtlasGenerationManifest;
export type AtlasManifestFor<F extends AtlasFormat> = F extends 1 ? AtlasDraftManifest : F extends 2 ? AtlasDraftManifestV2 : F extends 3 ? AtlasDraftManifestV3 : AtlasDraftManifestV4;
export function validateAtlasSurface(raw: unknown): raw is AtlasSurfaceContract {
  return generationExact(raw, ['kind', 'coordinateScale']) && raw.kind === 'land-mask-fan-v1' && raw.coordinateScale === 256;
}
export function validateAtlasDetailCoastSurface(raw: unknown): raw is AtlasDetailCoastSurfaceContract {
  return generationExact(raw, ['kind', 'coordinateScale', 'stepWorld', 'tileCells']) && raw.kind === 'sparse-coast-field-v1'
    && raw.coordinateScale === 256 && raw.stepWorld === 2 && raw.tileCells === 32;
}
export function validateAtlasDetailCoastManifest(raw: unknown): raw is AtlasDetailCoastManifest {
  if (!generationExact(raw, ['format', 'version', 'codec', 'refs']) || raw.format !== 'lieguoji-atlas-detail-coast' || raw.version !== 1
    || raw.codec !== 'signed-distance-q8-v1' || !generationArray(raw.refs) || raw.refs.length > 4096) return false;
  let previous = -1;
  for (const ref of raw.refs) {
    if (!generationExact(ref, ['bx', 'by', 'hash']) || !generationInt(ref.bx, 0, 63) || !generationInt(ref.by, 0, 63) || !generationHash(ref.hash)) return false;
    const order = ref.by * 64 + ref.bx; if (order <= previous) return false; previous = order;
  }
  return true;
}
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
function acceptsGeneratorFingerprint(id: string, fingerprint: unknown, current: string, mode: GenerationValidationMode): boolean {
  return generationHash(fingerprint) && (mode === 'execute' || mode === 'storage')
    && (fingerprint === current || mode === 'storage' && isStoredGeneratorFingerprint(id, fingerprint));
}
export function validateMacroRecipe(raw: unknown, mode: GenerationValidationMode = 'execute'): raw is MacroRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'macro-landmass' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('macro-landmass', raw.generator.fingerprint, MACRO_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['majorContinents', 'landCoveragePermille', 'coastWavelengthWorld', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.majorContinents, 1, 6) && generationInt(p.landCoveragePermille, 150, 650) && generationInt(p.coastWavelengthWorld, 128, 1024) && generationInt(p.reliefMeters, 200, 6000);
  } catch { return false; }
}
export function validateLandformRecipe(raw: unknown, mode: GenerationValidationMode = 'execute'): raw is LandformRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'landforms' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('landforms', raw.generator.fingerprint, LANDFORM_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['mountainRanges', 'basins', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.mountainRanges, 0, 8) && generationInt(p.basins, 0, 8) && generationInt(p.reliefMeters, 200, 6000) && generationInt(p.mountainRanges + p.basins, 1, 12);
  } catch { return false; }
}
/** Closed registration: adding a recipe requires an implemented codec and source fingerprint. */
export function validateGenerationRecipe(raw: unknown, spec?: AtlasGridSpec, mode: GenerationValidationMode = 'execute'): raw is GenerationRecipe {
  return validateMacroRecipe(raw, mode) || validateLandformRecipe(raw, mode) || validateIslandRecipe(raw, mode) || validateCoastRecipe(raw, mode) || validateShapeRecipe(raw, spec, mode) || validateOceanRecipe(raw, spec, mode) || validateDetailShapeRecipe(raw, spec, mode);
}
export function validateIslandRecipe(raw: unknown, mode: GenerationValidationMode = 'execute'): raw is IslandRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'island-chains' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('island-chains', raw.generator.fingerprint, ISLAND_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['chainCount', 'islandsPerChain', 'radiusWorld', 'reliefMeters'])) return false;
    const p = raw.parameters;
    return generationInt(p.chainCount, 1, 3) && generationInt(p.islandsPerChain, 2, 6) && generationInt(p.radiusWorld, 64, 128) && generationInt(p.reliefMeters, 200, 3000);
  } catch { return false; }
}
export function validateCoastRecipe(raw: unknown, mode: GenerationValidationMode = 'execute'): raw is CoastRecipe {
  try {
    if (!generationExact(raw, ['format', 'version', 'generator', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'coast-smoothing' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('coast-smoothing', raw.generator.fingerprint, COAST_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['strengthPermille', 'iterations'])) return false;
    return generationInt(raw.parameters.strengthPermille, 100, 1000) && generationInt(raw.parameters.iterations, 1, 4);
  } catch { return false; }
}
/** An explicit operation records sea-floor provenance without changing blank-v2 creation. */
export function validateOceanRecipe(raw: unknown, spec?: AtlasGridSpec, mode: GenerationValidationMode = 'execute'): raw is OceanRecipe {
  try {
    if (spec !== undefined && !validateSpec(spec)) return false;
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'ocean-floor' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('ocean-floor', raw.generator.fingerprint, OCEAN_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['meanDepthMeters', 'reliefMeters', 'shelfWidthWorld'])) return false;
    const p = raw.parameters;
    return generationInt(p.meanDepthMeters, 1000, 6000) && generationInt(p.reliefMeters, 0, 2000) && generationInt(p.shelfWidthWorld, 64, 1024);
  } catch { return false; }
}
type ShapePointQ = ShapeRecipe['parameters']['pointsQ'][number];
const orientationQ = (a: ShapePointQ, b: ShapePointQ, c: ShapePointQ) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const onSegmentQ = (a: ShapePointQ, b: ShapePointQ, p: ShapePointQ) => p.xQ >= Math.min(a.xQ, b.xQ) && p.xQ <= Math.max(a.xQ, b.xQ) && p.yQ >= Math.min(a.yQ, b.yQ) && p.yQ <= Math.max(a.yQ, b.yQ);
function segmentsIntersectQ(a: ShapePointQ, b: ShapePointQ, c: ShapePointQ, d: ShapePointQ): boolean {
  const abC = orientationQ(a, b, c), abD = orientationQ(a, b, d), cdA = orientationQ(c, d, a), cdB = orientationQ(c, d, b);
  return abC === 0 && onSegmentQ(a, b, c) || abD === 0 && onSegmentQ(a, b, d)
    || cdA === 0 && onSegmentQ(c, d, a) || cdB === 0 && onSegmentQ(c, d, b)
    || (abC < 0 && abD > 0 || abC > 0 && abD < 0) && (cdA < 0 && cdB > 0 || cdA > 0 && cdB < 0);
}
/** Q8 points form an implicit closed, simple polygon. Validation never closes,
 * simplifies, reorders, clamps or otherwise changes the player's contour.
 * At most 256 points in the bounded Q8 world keep integer cross products and
 * accumulated signed area below Number.MAX_SAFE_INTEGER.
 */
export function validateShapeRecipe(raw: unknown, spec?: AtlasGridSpec, mode: GenerationValidationMode = 'execute'): raw is ShapeRecipe {
  try {
    if (spec !== undefined && !validateSpec(spec)) return false;
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'shape-landmass' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('shape-landmass', raw.generator.fingerprint, SHAPE_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['pointsQ', 'coastRoughnessWorld', 'coastWavelengthWorld', 'reliefMeters', 'shelfWidthWorld'])) return false;
    const p = raw.parameters;
    if (!generationArray(p.pointsQ) || !generationInt(p.pointsQ.length, 3, 256) || !generationInt(p.coastRoughnessWorld, 0, 128) || !generationInt(p.coastWavelengthWorld, 64, 512) || !generationInt(p.reliefMeters, 200, 6000) || !generationInt(p.shelfWidthWorld, 32, 256)) return false;
    const maxXQ = (spec?.width ?? ATLAS_WORLD_UNITS) * (spec?.coordinateScale ?? ATLAS_COORDINATE_SCALE);
    const maxYQ = (spec?.height ?? ATLAS_WORLD_UNITS) * (spec?.coordinateScale ?? ATLAS_COORDINATE_SCALE);
    const seen = new Set<string>();
    for (const point of p.pointsQ) {
      if (!generationExact(point, ['xQ', 'yQ']) || !generationInt(point.xQ, 0, maxXQ) || !generationInt(point.yQ, 0, maxYQ)) return false;
      const key = `${point.xQ}:${point.yQ}`; if (seen.has(key)) return false; seen.add(key);
    }
    const points = p.pointsQ as ShapePointQ[], count = points.length;
    let area2 = 0;
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % count], previous = points[(i + count - 1) % count];
      area2 += a.xQ * b.yQ - b.xQ * a.yQ;
      // Adjacent edges may meet at a straight continuation, never double back.
      if (orientationQ(previous, a, b) === 0 && (previous.xQ - a.xQ) * (b.xQ - a.xQ) + (previous.yQ - a.yQ) * (b.yQ - a.yQ) > 0) return false;
      for (let j = i + 1; j < count; j++) {
        if (j === i + 1 || i === 0 && j === count - 1) continue;
        if (segmentsIntersectQ(a, b, points[j], points[(j + 1) % count])) return false;
      }
    }
    return area2 !== 0;
  } catch { return false; }
}
export function encodeGenerationRecipe(recipe: GenerationRecipe): Uint8Array {
  if (!validateGenerationRecipe(recipe)) throw new Error('生成配方、参数或实现指纹不兼容。');
  return new TextEncoder().encode(generationCanonical(recipe));
}
/** New fine-field recipe, with the exact v1 kernel ranges and preserved Q8
 * contour. No old shape fingerprint or implicit boundary clamping is accepted. */
export function validateDetailShapeRecipe(raw: unknown, spec?: AtlasGridSpec, mode: GenerationValidationMode = 'execute'): raw is DetailShapeRecipe {
  try {
    if (spec !== undefined && !validateSpec(spec)) return false;
    if (!generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) || raw.format !== 'lieguoji-atlas-recipe' || raw.version !== 1 || typeof raw.seed !== 'string' || !raw.seed.trim() || raw.seed.length > 120 || !generationExact(raw.generator, ['id', 'version', 'fingerprint']) || raw.generator.id !== 'shape-detail-landmass' || raw.generator.version !== 1 || !acceptsGeneratorFingerprint('shape-detail-landmass', raw.generator.fingerprint, DETAIL_SHAPE_GENERATOR_FINGERPRINT, mode) || !generationExact(raw.parameters, ['pointsQ', 'coastRoughnessWorld', 'reliefMeters', 'shelfWidthWorld', 'islandChainCount', 'islandsPerChain'])) return false;
    const p = raw.parameters;
    if (!generationArray(p.pointsQ) || !generationInt(p.pointsQ.length, 3, 2048) || !generationInt(p.coastRoughnessWorld, 0, 64) || !generationInt(p.reliefMeters, 200, 6000) || !generationInt(p.shelfWidthWorld, 16, 128) || !generationInt(p.islandChainCount, 0, 3) || !generationInt(p.islandsPerChain, 2, 6)) return false;
    const maxQ = ATLAS_WORLD_UNITS * ATLAS_COORDINATE_SCALE, margin = (p.coastRoughnessWorld + 4) * ATLAS_COORDINATE_SCALE, seen = new Set<string>();
    for (const point of p.pointsQ) {
      if (!generationExact(point, ['xQ', 'yQ']) || !generationInt(point.xQ, margin, maxQ - margin) || !generationInt(point.yQ, margin, maxQ - margin)) return false;
      const key = `${point.xQ}:${point.yQ}`; if (seen.has(key)) return false; seen.add(key);
    }
    const points = p.pointsQ as ShapePointQ[], count = points.length; let area2 = 0;
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % count], previous = points[(i + count - 1) % count]; area2 += a.xQ * b.yQ - b.xQ * a.yQ;
      if (orientationQ(previous, a, b) === 0 && (previous.xQ - a.xQ) * (b.xQ - a.xQ) + (previous.yQ - a.yQ) * (b.yQ - a.yQ) > 0) return false;
      for (let j = i + 1; j < count; j++) if (j !== i + 1 && !(i === 0 && j === count - 1) && segmentsIntersectQ(a, b, points[j], points[(j + 1) % count])) return false;
    }
    return Number.isSafeInteger(area2) && Math.abs(area2) >= 2 * 64 * ATLAS_COORDINATE_SCALE ** 2;
  } catch { return false; }
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
export function validateGenerationOperation(recipe: unknown, scope: unknown, spec?: AtlasGridSpec, mode: GenerationValidationMode = 'execute'): boolean {
  return validateGenerationRecipe(recipe, spec, mode) && validateGenerationScope(scope, spec)
    && (scope.kind === 'world' || recipe.generator.id === 'landforms' || recipe.generator.id === 'coast-smoothing');
}
export function encodeMacroRecipe(recipe: MacroRecipe): Uint8Array {
  if (!validateMacroRecipe(recipe)) throw new Error('生成配方、参数或实现指纹不兼容。');
  return new TextEncoder().encode(generationCanonical(recipe));
}
export function validateCopyOrigin(raw: unknown): raw is AtlasCopyOrigin {
  return generationExact(raw, ['format', 'version', 'sourceFormat', 'sourceDraftId', 'sourceSlot', 'sourceManifestDigest', 'sourceManifestRevision', 'observedRootDigest']) && raw.format === 'lieguoji-atlas-copy-origin' && raw.version === 1 && (raw.sourceFormat === 1 || raw.sourceFormat === 2 || raw.sourceFormat === 3 || raw.sourceFormat === 4) && typeof raw.sourceDraftId === 'string' && /^atlas-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw.sourceDraftId) && (raw.sourceSlot === 'current' || raw.sourceSlot === 'backup') && generationHash(raw.sourceManifestDigest) && generationInt(raw.sourceManifestRevision) && generationHash(raw.observedRootDigest);
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
