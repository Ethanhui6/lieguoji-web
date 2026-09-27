import { cloneBlock, createAtlasDraft, getBlock, hashBlock, validateAtlasGeography, validateAtlasGeographyAsync, validateGeographyManifestFields, yieldAtlas, type AtlasControl, type AtlasCreateOptions } from './model';
import { cloneAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey, validateAtlasCellLockBlock } from './generation-locks';
import { generationCanonical, generationDigest, generationExact, generationHash, generationInt, validateAtlasConstraints, validateAtlasSurface, validateAtlasDetailCoastSurface, validateAtlasDetailCoastManifest, validateDetailShapeRecipe, validateCopyOrigin, validateGenerationOperation, type AtlasGenerationManifest, type AtlasGenerationDocument, type AtlasDetailCoastDocument, type AtlasDraftManifestV4 } from './generation-contract';
import { cloneDetailCoastTiles, hashDetailCoastTile, validateDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey } from './detail-coast-types';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export function validateGenerationManifest(raw: unknown): raw is AtlasGenerationManifest {
  try {
    if (!raw || typeof raw !== 'object') return false;
    const descriptor = Object.getOwnPropertyDescriptor(raw, 'version');
    if (!descriptor || !('value' in descriptor) || descriptor.value !== 2 && descriptor.value !== 3 && descriptor.value !== 4) return false;
    const fields = ['format', 'version', 'kind', 'draftId', 'atlasId', 'name', 'seed', 'revision', 'spec', 'catalogs', 'blockRefs', 'origin', 'constraints', 'generation'];
    if (descriptor.value === 3) fields.push('surface');
    if (descriptor.value === 4) fields.push('surface', 'detailCoast');
    if (!generationExact(raw, fields) || raw.version === 3 && !validateAtlasSurface(raw.surface)
      || raw.version === 4 && (!validateAtlasDetailCoastSurface(raw.surface) || !validateAtlasDetailCoastManifest(raw.detailCoast)) || !validateGeographyManifestFields(raw)) return false;
    const value = raw as Record<string, unknown> & typeof raw;
    if (value.origin !== null && !validateCopyOrigin(value.origin) || !validateAtlasConstraints(value.constraints, raw.spec) || !generationExact(value.generation, ['format', 'version', 'lastApplied']) || value.generation.format !== 'lieguoji-atlas-generation' || value.generation.version !== 1) return false;
    if (value.origin !== null && (raw.version === 4 || (value.origin as { sourceFormat: number }).sourceFormat > raw.version)) return false;
    const last = value.generation.lastApplied;
    if (last === null) return true;
    if (!generationExact(last, ['recipe', 'scope', 'baseManifestDigest', 'baseRootDigest', 'baseRevision', 'lockSetDigest', 'appliedRevision']) || !validateGenerationOperation(last.recipe, last.scope, raw.spec, 'storage')) return false;
    if (raw.version === 4 ? !validateDetailShapeRecipe(last.recipe, raw.spec, 'storage') : validateDetailShapeRecipe(last.recipe, raw.spec, 'storage')) return false;
    return generationHash(last.baseManifestDigest) && generationHash(last.baseRootDigest) && generationHash(last.lockSetDigest) && generationInt(last.baseRevision, 0, Number.MAX_SAFE_INTEGER - 1) && last.appliedRevision === last.baseRevision + 1 && generationInt(last.appliedRevision, 1, raw.revision);
  } catch { return false; }
}
export function encodeGenerationManifest(manifest: AtlasGenerationManifest): Uint8Array {
  if (!validateGenerationManifest(manifest)) throw new Error('生成草稿 manifest、配方、锁或来源版本无效。');
  return encoder.encode(generationCanonical(manifest));
}
export function decodeGenerationManifest(bytes: Uint8Array): AtlasGenerationManifest {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.length > 16 * 1024 * 1024) throw new Error('生成草稿 manifest 编码超限。');
  let raw: unknown; try { raw = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('生成草稿 manifest 不是有效 UTF-8／JSON。'); }
  if (!validateGenerationManifest(raw)) throw new Error('生成草稿格式、配方或锁版本不兼容。');
  const canonical = encodeGenerationManifest(raw);
  if (canonical.length !== bytes.length || canonical.some((v, i) => v !== bytes[i])) throw new Error('生成草稿 manifest 非规范编码。');
  return raw;
}
export function hashGenerationManifest(manifest: AtlasGenerationManifest): Promise<string> { return generationDigest(encodeGenerationManifest(manifest)); }
/** Shape guard only; full structure, referenced content and hashes are checked
 * by the validation/verification APIs below. Exact envelopes reject old fields. */
export function isDetailCoastDocument(raw: unknown): raw is AtlasDetailCoastDocument {
  if (!generationExact(raw, ['manifest', 'blocks', 'locks', 'detailCoast']) || !raw.manifest || typeof raw.manifest !== 'object') return false;
  const descriptor = Object.getOwnPropertyDescriptor(raw.manifest, 'version');
  return !!descriptor && 'value' in descriptor && descriptor.value === 4;
}
function generationEnvelopeHeader(raw: unknown): raw is AtlasGenerationDocument {
  try {
    const detailed = isDetailCoastDocument(raw);
    if (!generationExact(raw, detailed ? ['manifest', 'blocks', 'locks', 'detailCoast'] : ['manifest', 'blocks', 'locks']) || !validateGenerationManifest(raw.manifest) || (raw.manifest.version === 4) !== detailed) return false;
    for (const map of [raw.blocks, raw.locks, ...(detailed ? [raw.detailCoast] : [])]) if (!(map instanceof Map) || Object.getPrototypeOf(map) !== Map.prototype || Reflect.ownKeys(map).length !== 0) return false;
    const data = raw as unknown as AtlasGenerationDocument;
    if (data.blocks.size !== data.manifest.blockRefs.length || data.locks.size !== data.manifest.constraints.lockRefs.length) return false;
    for (const ref of data.manifest.constraints.lockRefs) {
      const block = data.locks.get(lockKey(ref.bx, ref.by));
      if (!validateAtlasCellLockBlock(block, data.manifest.spec) || block.bx !== ref.bx || block.by !== ref.by) return false;
    }
    if (isDetailCoastDocument(data)) {
      if (data.detailCoast.size !== data.manifest.detailCoast.refs.length) return false;
    }
    return true;
  } catch { return false; }
}
function validateReferencedDetailTile(data: AtlasDetailCoastDocument, ref: AtlasDraftManifestV4['detailCoast']['refs'][number]): void {
  const tile = data.detailCoast.get(detailCoastKey(ref.bx, ref.by));
  validateDetailCoastTile(tile);
  if (tile.bx !== ref.bx || tile.by !== ref.by) throw new Error('细海岸引用与内容坐标不符。');
}
export function generationEnvelope(raw: unknown): raw is AtlasGenerationDocument {
  if (!generationEnvelopeHeader(raw)) return false;
  try { if (isDetailCoastDocument(raw)) for (const ref of raw.manifest.detailCoast.refs) validateReferencedDetailTile(raw, ref); return true; }
  catch { return false; }
}
export function validateGenerationDocument(raw: unknown): raw is AtlasGenerationDocument { return generationEnvelope(raw) && validateAtlasGeography(raw); }
export async function validateGenerationDocumentAsync(raw: unknown, control?: AtlasControl): Promise<boolean> {
  control?.signal?.throwIfAborted();
  if (!generationEnvelopeHeader(raw)) return false;
  if (isDetailCoastDocument(raw)) for (let i = 0; i < raw.manifest.detailCoast.refs.length; i++) {
    try { validateReferencedDetailTile(raw, raw.manifest.detailCoast.refs[i]); } catch { return false; }
    if (i % 16 === 15 || i === raw.manifest.detailCoast.refs.length - 1) await yieldAtlas(control, '核验细海岸条目结构', i + 1, raw.manifest.detailCoast.refs.length);
  }
  return await validateAtlasGeographyAsync(raw, control);
}
export async function verifyGenerationDocument(raw: unknown, control?: AtlasControl): Promise<void> {
  if (!generationEnvelopeHeader(raw) || !await validateAtlasGeographyAsync(raw, control)) throw new Error('生成草稿结构、几何或地块锁无效。');
  for (let i = 0; i < raw.manifest.blockRefs.length; i++) {
    const ref = raw.manifest.blockRefs[i]; if (await hashBlock(getBlock(raw, ref.key)) !== ref.hash) throw new Error(`地理块 ${ref.key} 完整摘要不符。`);
    if (i % 16 === 15) await yieldAtlas(control, '核验生成草稿地理块', i + 1, raw.manifest.blockRefs.length);
  }
  for (let i = 0; i < raw.manifest.constraints.lockRefs.length; i++) {
    const ref = raw.manifest.constraints.lockRefs[i]; if (await hashAtlasCellLockBlock(raw.locks.get(lockKey(ref.bx, ref.by))!) !== ref.hash) throw new Error('地块锁完整摘要不符。');
    if (i % 16 === 15) await yieldAtlas(control, '核验地块锁', i + 1, raw.manifest.constraints.lockRefs.length);
  }
  if (isDetailCoastDocument(raw)) for (let i = 0; i < raw.manifest.detailCoast.refs.length; i++) {
    const ref = raw.manifest.detailCoast.refs[i], key = detailCoastKey(ref.bx, ref.by);
    validateReferencedDetailTile(raw, ref);
    if (await hashDetailCoastTile(raw.detailCoast.get(key)!) !== ref.hash) throw new Error(`细海岸块 ${key} 完整摘要不符。`);
    if (i % 16 === 15 || i === raw.manifest.detailCoast.refs.length - 1) await yieldAtlas(control, '核验细海岸内容摘要', i + 1, raw.manifest.detailCoast.refs.length);
  }
  control?.signal?.throwIfAborted();
}
function copyEnvelope(raw: AtlasGenerationDocument): AtlasGenerationDocument {
  if (!generationEnvelope(raw)) throw new Error('不能复制未知生成草稿封套。');
  const blocks = new Map([...raw.blocks].map(([key, block]) => [key, cloneBlock(block)])), locks = new Map([...raw.locks].map(([key, block]) => [key, cloneAtlasCellLockBlock(block)]));
  return isDetailCoastDocument(raw)
    ? { manifest: structuredClone(raw.manifest), blocks, locks, detailCoast: cloneDetailCoastTiles(raw.detailCoast) }
    : { manifest: structuredClone(raw.manifest), blocks, locks };
}
export function cloneGenerationDocument<T extends AtlasGenerationDocument>(raw: T): T {
  if (!validateGenerationDocument(raw)) throw new Error('不能复制结构或几何无效的生成草稿。');
  return copyEnvelope(raw) as T;
}
export async function cloneVerifiedGenerationDocument<T extends AtlasGenerationDocument>(raw: T, control?: AtlasControl): Promise<T> {
  control?.signal?.throwIfAborted(); const owned = copyEnvelope(raw); // Ownership before first await.
  // Report completed buffer copies, then let the complete geometry/hash
  // verification cooperate. No progress tick runs while caller buffers remain
  // aliased, and no expensive synchronous full-world geometry pass is added.
  const count = owned.blocks.size + owned.locks.size + (isDetailCoastDocument(owned) ? owned.detailCoast.size : 0);
  // Public ingress must own both detailed arrays before yielding. This dense
  // synchronous copy is not a claim that the 250 ms progress budget is met;
  // chunk-owned private ingestion requires its separate integration path.
  await yieldAtlas(control, '复制生成草稿分层与锁', count, count);
  await verifyGenerationDocument(owned, control); return owned as T;
}
export function createGenerationDraft(options: AtlasCreateOptions, control?: AtlasControl): Promise<AtlasGenerationDocument<2>>;
export function createGenerationDraft<F extends 2 | 3 | 4>(options: AtlasCreateOptions, control: AtlasControl | undefined, format: F): Promise<AtlasGenerationDocument<F>>;
export async function createGenerationDraft(options: AtlasCreateOptions, control?: AtlasControl, format: 2 | 3 | 4 = 2): Promise<AtlasGenerationDocument> {
  if (format !== 2 && format !== 3 && format !== 4) throw new Error('未知 Atlas 地表版本，未创建草稿。');
  const base = await createAtlasDraft(options, control);
  const common = { ...base.manifest, origin: null, constraints: { format: 'lieguoji-atlas-constraints' as const, version: 1 as const, lockCodec: 'cell-lock-mask-v1' as const, lockRefs: [] }, generation: { format: 'lieguoji-atlas-generation' as const, version: 1 as const, lastApplied: null } };
  if (format === 4) {
    const manifest: AtlasDraftManifestV4 = { ...common, version: 4,
      surface: { kind: 'sparse-coast-field-v1', coordinateScale: 256, stepWorld: 2, tileCells: 32 },
      detailCoast: { format: 'lieguoji-atlas-detail-coast', version: 1, codec: 'signed-distance-q8-v1', refs: [] } };
    return { manifest, blocks: base.blocks, locks: new Map(), detailCoast: new Map() };
  }
  const manifest: AtlasGenerationManifest = format === 2 ? { ...common, version: 2 } : { ...common, version: 3, surface: { kind: 'land-mask-fan-v1', coordinateScale: 256 } };
  return { manifest, blocks: base.blocks, locks: new Map() };
}
