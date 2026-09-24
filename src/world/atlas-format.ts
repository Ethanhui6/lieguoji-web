import { cloneAtlasDraft, cloneVerifiedAtlasDraft, decodeManifest, encodeManifest, hashManifest, validateAtlasDraft, validateAtlasDraftAsync, validateManifest, verifyAtlasDraft, type AtlasControl, type AtlasGeographyView } from './model';
import { cloneGenerationDocument, cloneVerifiedGenerationDocument, decodeGenerationManifest, encodeGenerationManifest, hashGenerationManifest, validateGenerationDocument, validateGenerationDocumentAsync, validateGenerationManifest, verifyGenerationDocument } from './generation-format';
import { generationExact, validateCopyOrigin, type AtlasCopyOrigin, type AtlasDocument, type AtlasGenerationDocument, type AtlasManifest } from './generation-contract';
export type * from './generation-contract';
export type { AtlasGeographyView } from './model';
export { createGenerationDraft } from './generation-format';

function version(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(raw, 'version'); return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function documentVersion(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(raw, 'manifest'); return descriptor && 'value' in descriptor ? version(descriptor.value) : undefined;
}
export function isGenerationDocument(raw: unknown): raw is AtlasGenerationDocument { return documentVersion(raw) === 2 && generationExact(raw, ['manifest', 'blocks', 'locks']); }
export function validateAtlasManifest(raw: unknown): raw is AtlasManifest { return version(raw) === 1 ? validateManifest(raw) : version(raw) === 2 && validateGenerationManifest(raw); }
export function encodeAtlasManifest(manifest: AtlasManifest): Uint8Array {
  if (version(manifest) === 1) return encodeManifest(manifest as Extract<AtlasManifest, { version: 1 }>);
  if (version(manifest) === 2) return encodeGenerationManifest(manifest as Extract<AtlasManifest, { version: 2 }>);
  throw new Error('未知 Atlas 格式已锁写。');
}
export function decodeAtlasManifest(bytes: Uint8Array): AtlasManifest {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.length > 16 * 1024 * 1024) throw new Error('Atlas manifest 编码超限。');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (version(raw) === 1) return decodeManifest(bytes);
  if (version(raw) === 2) return decodeGenerationManifest(bytes);
  throw new Error('未知 Atlas manifest 版本已保护。');
}
export function hashAtlasManifest(manifest: AtlasGeographyView['manifest']): Promise<string> {
  // Each real codec validates its exact envelope once; dispatch never relabels it.
  if (version(manifest) === 1) return hashManifest(manifest as Extract<AtlasManifest, { version: 1 }>);
  if (version(manifest) === 2) return hashGenerationManifest(manifest as Extract<AtlasManifest, { version: 2 }>);
  throw new Error('Atlas manifest 格式或版本无效。');
}
export function validateAtlasDocument(raw: unknown): raw is AtlasDocument { return documentVersion(raw) === 1 ? validateAtlasDraft(raw) : documentVersion(raw) === 2 && validateGenerationDocument(raw); }
export async function validateAtlasDocumentAsync(raw: unknown, control?: AtlasControl): Promise<boolean> { return documentVersion(raw) === 1 ? validateAtlasDraftAsync(raw, control) : documentVersion(raw) === 2 && await validateGenerationDocumentAsync(raw, control); }
export async function verifyAtlasDocument(raw: unknown, control?: AtlasControl): Promise<void> {
  if (documentVersion(raw) === 1) return verifyAtlasDraft(raw, control);
  if (documentVersion(raw) === 2) return verifyGenerationDocument(raw, control);
  throw new Error('未知 Atlas 草稿版本已保护。');
}
export function cloneAtlasDocument<T extends AtlasDocument>(data: T): T { return (isGenerationDocument(data) ? cloneGenerationDocument(data) : cloneAtlasDraft(data)) as T; }
/** Ingress ownership is taken synchronously before the first await. All real
 * geometry and hashes are then checked cooperatively before returning data.
 * Prefer this API at asynchronous snapshot/preview/transport boundaries; the
 * synchronous codec/copy API above deliberately retains its existing checks. */
export async function cloneVerifiedAtlasDocument<T extends AtlasDocument>(data: T, control?: AtlasControl): Promise<T> { return (isGenerationDocument(data) ? await cloneVerifiedGenerationDocument(data, control) : await cloneVerifiedAtlasDraft(data, control)) as T; }
/** Creates private data only. The caller commits the new identity in the v2 store. */
export async function createGenerationCopy(source: AtlasDocument, origin: AtlasCopyOrigin, options: { draftId: string; name?: string }, control?: AtlasControl): Promise<AtlasGenerationDocument> {
  if (!validateCopyOrigin(origin) || !options || !generationExact(options, Object.hasOwn(options, 'name') ? ['draftId', 'name'] : ['draftId']) || typeof options.draftId !== 'string') throw new Error('显式副本来源或参数无效。');
  const ownedOrigin = structuredClone(origin), ownedOptions = structuredClone(options), owned = await cloneVerifiedAtlasDocument(source, control);
  if (ownedOptions.draftId === owned.manifest.draftId || ownedOrigin.sourceFormat !== owned.manifest.version || ownedOrigin.sourceDraftId !== owned.manifest.draftId || ownedOrigin.sourceManifestRevision !== owned.manifest.revision || ownedOrigin.sourceManifestDigest !== await hashAtlasManifest(owned.manifest)) throw new Error('显式副本未绑定核验的固定来源，或仍使用原身份。');
  const manifest = { ...owned.manifest, version: 2 as const, draftId: ownedOptions.draftId, name: ownedOptions.name ?? owned.manifest.name, revision: 0, origin: ownedOrigin, constraints: isGenerationDocument(owned) ? owned.manifest.constraints : { format: 'lieguoji-atlas-constraints' as const, version: 1 as const, lockCodec: 'cell-lock-mask-v1' as const, lockRefs: [] }, generation: { format: 'lieguoji-atlas-generation' as const, version: 1 as const, lastApplied: null } };
  if (!validateGenerationManifest(manifest)) throw new Error('显式副本身份或格式无效。');
  control?.signal?.throwIfAborted(); return { manifest, blocks: owned.blocks, locks: isGenerationDocument(owned) ? owned.locks : new Map() };
}
