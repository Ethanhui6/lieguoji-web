import { cloneBlock, createAtlasDraft, getBlock, hashBlock, validateAtlasGeography, validateAtlasGeographyAsync, validateGeographyManifestFields, yieldAtlas, type AtlasControl, type AtlasCreateOptions } from './model';
import { cloneAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey, validateAtlasCellLockBlock } from './generation-locks';
import { generationCanonical, generationDigest, generationExact, generationHash, generationInt, validateAtlasConstraints, validateCopyOrigin, validateGenerationOperation, type AtlasDraftManifestV2, type AtlasGenerationDocument } from './generation-contract';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export function validateGenerationManifest(raw: unknown): raw is AtlasDraftManifestV2 {
  try {
    if (!generationExact(raw, ['format', 'version', 'kind', 'draftId', 'atlasId', 'name', 'seed', 'revision', 'spec', 'catalogs', 'blockRefs', 'origin', 'constraints', 'generation']) || raw.version !== 2 || !validateGeographyManifestFields(raw)) return false;
    const value = raw as Record<string, unknown> & typeof raw;
    if (value.origin !== null && !validateCopyOrigin(value.origin) || !validateAtlasConstraints(value.constraints, raw.spec) || !generationExact(value.generation, ['format', 'version', 'lastApplied']) || value.generation.format !== 'lieguoji-atlas-generation' || value.generation.version !== 1) return false;
    const last = value.generation.lastApplied;
    return last === null || generationExact(last, ['recipe', 'scope', 'baseManifestDigest', 'baseRootDigest', 'baseRevision', 'lockSetDigest', 'appliedRevision']) && validateGenerationOperation(last.recipe, last.scope, raw.spec) && generationHash(last.baseManifestDigest) && generationHash(last.baseRootDigest) && generationHash(last.lockSetDigest) && generationInt(last.baseRevision, 0, Number.MAX_SAFE_INTEGER - 1) && last.appliedRevision === last.baseRevision + 1 && generationInt(last.appliedRevision, 1, raw.revision);
  } catch { return false; }
}
export function encodeGenerationManifest(manifest: AtlasDraftManifestV2): Uint8Array {
  if (!validateGenerationManifest(manifest)) throw new Error('生成草稿 manifest、配方、锁或来源版本无效。');
  return encoder.encode(generationCanonical(manifest));
}
export function decodeGenerationManifest(bytes: Uint8Array): AtlasDraftManifestV2 {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.length > 16 * 1024 * 1024) throw new Error('生成草稿 manifest 编码超限。');
  let raw: unknown; try { raw = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('生成草稿 manifest 不是有效 UTF-8／JSON。'); }
  if (!validateGenerationManifest(raw)) throw new Error('生成草稿格式、配方或锁版本不兼容。');
  const canonical = encodeGenerationManifest(raw);
  if (canonical.length !== bytes.length || canonical.some((v, i) => v !== bytes[i])) throw new Error('生成草稿 manifest 非规范编码。');
  return raw;
}
export function hashGenerationManifest(manifest: AtlasDraftManifestV2): Promise<string> { return generationDigest(encodeGenerationManifest(manifest)); }
export function generationEnvelope(raw: unknown): raw is AtlasGenerationDocument {
  if (!generationExact(raw, ['manifest', 'blocks', 'locks']) || !validateGenerationManifest(raw.manifest)) return false;
  for (const map of [raw.blocks, raw.locks]) if (!(map instanceof Map) || Object.getPrototypeOf(map) !== Map.prototype || Reflect.ownKeys(map).length !== 0) return false;
  const data = raw as unknown as AtlasGenerationDocument;
  if (data.blocks.size !== data.manifest.blockRefs.length || data.locks.size !== data.manifest.constraints.lockRefs.length) return false;
  for (const ref of data.manifest.constraints.lockRefs) {
    const block = data.locks.get(lockKey(ref.bx, ref.by));
    if (!validateAtlasCellLockBlock(block, data.manifest.spec) || block.bx !== ref.bx || block.by !== ref.by) return false;
  }
  return true;
}
export function validateGenerationDocument(raw: unknown): raw is AtlasGenerationDocument { return generationEnvelope(raw) && validateAtlasGeography(raw); }
export async function validateGenerationDocumentAsync(raw: unknown, control?: AtlasControl): Promise<boolean> {
  control?.signal?.throwIfAborted();
  return generationEnvelope(raw) && await validateAtlasGeographyAsync(raw, control);
}
export async function verifyGenerationDocument(raw: unknown, control?: AtlasControl): Promise<void> {
  if (!generationEnvelope(raw) || !await validateAtlasGeographyAsync(raw, control)) throw new Error('生成草稿结构、几何或地块锁无效。');
  for (let i = 0; i < raw.manifest.blockRefs.length; i++) {
    const ref = raw.manifest.blockRefs[i]; if (await hashBlock(getBlock(raw, ref.key)) !== ref.hash) throw new Error(`地理块 ${ref.key} 完整摘要不符。`);
    if (i % 16 === 15) await yieldAtlas(control, '核验生成草稿地理块', i + 1, raw.manifest.blockRefs.length);
  }
  for (let i = 0; i < raw.manifest.constraints.lockRefs.length; i++) {
    const ref = raw.manifest.constraints.lockRefs[i]; if (await hashAtlasCellLockBlock(raw.locks.get(lockKey(ref.bx, ref.by))!) !== ref.hash) throw new Error('地块锁完整摘要不符。');
    if (i % 16 === 15) await yieldAtlas(control, '核验地块锁', i + 1, raw.manifest.constraints.lockRefs.length);
  }
  control?.signal?.throwIfAborted();
}
function copyEnvelope(raw: AtlasGenerationDocument): AtlasGenerationDocument {
  if (!generationEnvelope(raw)) throw new Error('不能复制未知生成草稿封套。');
  return { manifest: structuredClone(raw.manifest), blocks: new Map([...raw.blocks].map(([key, block]) => [key, cloneBlock(block)])), locks: new Map([...raw.locks].map(([key, block]) => [key, cloneAtlasCellLockBlock(block)])) };
}
export function cloneGenerationDocument(raw: AtlasGenerationDocument): AtlasGenerationDocument {
  if (!validateGenerationDocument(raw)) throw new Error('不能复制结构或几何无效的生成草稿。');
  return copyEnvelope(raw);
}
export async function cloneVerifiedGenerationDocument(raw: AtlasGenerationDocument, control?: AtlasControl): Promise<AtlasGenerationDocument> {
  control?.signal?.throwIfAborted(); const owned = copyEnvelope(raw); // Ownership before first await.
  // Report completed buffer copies, then let the complete geometry/hash
  // verification cooperate. No progress tick runs while caller buffers remain
  // aliased, and no expensive synchronous full-world geometry pass is added.
  await yieldAtlas(control, '复制生成草稿分层与锁', owned.blocks.size + owned.locks.size, owned.blocks.size + owned.locks.size);
  await verifyGenerationDocument(owned, control); return owned;
}
export async function createGenerationDraft(options: AtlasCreateOptions, control?: AtlasControl): Promise<AtlasGenerationDocument> {
  const base = await createAtlasDraft(options, control);
  return { manifest: { ...base.manifest, version: 2, origin: null, constraints: { format: 'lieguoji-atlas-constraints', version: 1, lockCodec: 'cell-lock-mask-v1', lockRefs: [] }, generation: { format: 'lieguoji-atlas-generation', version: 1, lastApplied: null } }, blocks: base.blocks, locks: new Map() };
}
