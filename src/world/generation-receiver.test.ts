import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { cloneAtlasDocument, createGenerationDraft, encodeAtlasManifest, hashAtlasManifest, type AtlasDocument, type AtlasGenerationDocument, type MacroRecipe } from './atlas-format';
import { encodeBlock, getCellLayerSlot, hashBlock, type AtlasDraftData } from './model';
import { generationLockDigest, generationPreviewDigest, generationRecipeDigest, generationScopeDigest, type GenerationPreviewInfo } from './generation-session';
import { MACRO_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { quadMeasure, quadQ } from './generation/quality';
import { decodeAtlasPacket, encodeAtlasPacket, type AtlasHead, type AtlasOperation } from './protocol';
import { getAtlasStorage } from './storage';
import type { AtlasStoredRoot } from './storage-types';
import { decodeAtlasEditMessage, encodeAtlasEditMessage, type AtlasEditDelta } from './transactions';

/** Only the Worker is replaced. Every reply crosses the real binary decoder,
 * manifest/block hashes, full geography verification and receiver ownership. */
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(bytes: Uint8Array, transfer: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  request() {
    const packets = this.postMessage.mock.calls.map(([bytes]) => decodeAtlasPacket(bytes));
    const packet = packets.filter(packet => packet.header.type === 'request').at(-1);
    if (!packet) throw new Error('missing request');
    return { ...packet, operation: packet.header.body as AtlasOperation };
  }
  reply(bytes: Uint8Array) { this.onmessage?.({ data: bytes } as MessageEvent); }
}
const clients: AtlasClient[] = [];
let baseline: AtlasGenerationDocument, baselineRoot: AtlasStoredRoot, baselineDigest: string;
const recipe: MacroRecipe = { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed: 'receiver-wire-fixture', parameters: { majorContinents: 1, landCoveragePermille: 400, coastWavelengthWorld: 384, reliefMeters: 2400 } };
const commandId = () => `edit-${crypto.randomUUID()}`;
function head(data: AtlasDocument, root: AtlasStoredRoot): AtlasHead {
  return { draftId: data.manifest.draftId, atlasId: data.manifest.atlasId, name: data.manifest.name, revision: data.manifest.revision,
    rootDigest: root.rootDigest, manifestDigest: root.currentManifest, readOnly: false, hasBackup: root.backupManifest !== null, undoCount: 0 };
}
async function rootFor(data: AtlasDocument, format: 1 | 2, commit = commandId()): Promise<AtlasStoredRoot> {
  const root: AtlasStoredRoot = { format: 'lieguoji-atlas-root', version: 1, domain: format === 1 ? 'atlas-draft-v1' : 'atlas-draft-v2',
    draftId: data.manifest.draftId, revision: data.manifest.revision, currentManifest: await hashAtlasManifest(data.manifest),
    backupManifest: data.manifest.revision ? baselineDigest : null, lastCommitId: commit, rootDigest: '0'.repeat(64) };
  root.rootDigest = await getAtlasStorage(format).hashAtlasRoot(root); return root;
}
function stream(worker: WorkerDouble, data: AtlasDocument, source: AtlasStoredRoot | GenerationPreviewInfo) {
  const id = worker.request().header.id, bytes = encodeAtlasManifest(data.manifest); let sequence = 0;
  const preview = 'candidateId' in source, h = preview ? null : head(data, source);
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'begin', sequence: sequence++, body: {
    ...(preview ? { kind: 'generation-preview', preview: source } : { kind: 'durable', root: source, head: h }),
    manifestLength: bytes.length, blockCount: data.blocks.size, lockCount: 0,
  } }));
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'manifest', sequence: sequence++, body: { offset: 0 } }, bytes));
  for (const [index, ref] of data.manifest.blockRefs.entries()) worker.reply(encodeAtlasPacket({ version: 1, id, type: 'block', sequence: sequence++, body: { key: ref.key, index } }, encodeBlock(data.blocks.get(ref.key)!)));
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'complete', body: preview
    ? { operation: 'generation-preview', preview: source, metrics: {} }
    : { operation: 'initialize', root: source, head: h, metrics: {} } }));
}
function client(format: 1 | 2 = 2) {
  const fatal = vi.fn(), value = new AtlasClient({ format, onFatal: fatal }); clients.push(value);
  return { value, fatal, worker: WorkerDouble.instances.at(-1)! };
}
async function initialized() {
  const h = client(), restoring = h.value.restore(baseline.manifest.draftId); stream(h.worker, baseline, baselineRoot); await restoring; return h;
}
async function candidate(op: Extract<AtlasOperation, { type: 'generation-preview' }>, mismatch?: 'recipe' | 'base-root') {
  // Deliberately a tiny valid geography fixture, not a macro-generation quality
  // claim. These tests isolate the transport/provenance contract.
  const data = cloneAtlasDocument(baseline), slot = getCellLayerSlot(data, 'elevation', 0);
  slot.block.values[slot.slot] = 650; data.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block);
  data.manifest.revision = 1;
  const recipeDigest = await generationRecipeDigest(recipe), scopeDigest = await generationScopeDigest(op.scope), lockSetDigest = await generationLockDigest(baseline);
  data.manifest.generation.lastApplied = { recipe: structuredClone(recipe), scope: structuredClone(op.scope), baseManifestDigest: baselineDigest,
    baseRootDigest: baselineRoot.rootDigest, baseRevision: 0, lockSetDigest, appliedRevision: 1 };
  if (mismatch === 'recipe') { const applied = data.manifest.generation.lastApplied.recipe; if (!('seed' in applied)) throw new Error('fixture must have a generation seed'); applied.seed = 'different-valid-provenance'; }
  if (mismatch === 'base-root') data.manifest.generation.lastApplied.baseRootDigest = 'a'.repeat(64);
  const partial = { candidateId: crypto.randomUUID(), commandId: op.commandId, baseRevision: 0, baseRootDigest: baselineRoot.rootDigest, baseManifestDigest: baselineDigest,
    revision: 1, manifestDigest: await hashAtlasManifest(data.manifest), reason: '接收边界合成候选', recipe: structuredClone(recipe), scope: structuredClone(op.scope), recipeDigest, scopeDigest, lockSetDigest,
    summary: { changedCellCount: 1, landAreaQ2: quadMeasure(quadQ(data, 0)).areaQ2, worldAreaQ2: 2 * (4096 * 256) ** 2, majorComponentCount: 1, minElevationMeters: -100, maxElevationMeters: 650 } };
  return { data, preview: { ...partial, previewDigest: await generationPreviewDigest(partial) } };
}
async function preview(h: Awaited<ReturnType<typeof initialized>>, mismatch?: 'recipe' | 'base-root') {
  const receiving = h.value.previewGeneration(recipe), request = h.worker.request();
  if (request.operation.type !== 'generation-preview') throw new Error('missing preview request');
  const generated = await candidate(request.operation, mismatch); stream(h.worker, generated.data, generated.preview);
  return { receiving, generated };
}

beforeAll(async () => {
  baseline = await createGenerationDraft({ size: 128, seed: 'generation-receiver-fixture', name: '接收边界草稿' });
  baselineDigest = await hashAtlasManifest(baseline.manifest); baselineRoot = await rootFor(baseline, 2);
});
beforeEach(() => { WorkerDouble.instances = []; vi.stubGlobal('Worker', WorkerDouble); });
afterEach(() => { clients.splice(0).forEach(value => value.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('generation receiver ownership and adversarial valid envelopes', () => {
  it.each(['confirm', 'discard'] as const)('public candidate mutation cannot change the private %s identity', async action => {
    const h = await initialized(), { receiving, generated } = await preview(h), exposed = await receiving;
    const expected = structuredClone(generated.preview), current = h.value.current;
    exposed.preview.candidateId = crypto.randomUUID(); exposed.preview.commandId = commandId(); exposed.preview.previewDigest = 'f'.repeat(64);
    exposed.preview.manifestDigest = 'e'.repeat(64); exposed.preview.baseRootDigest = 'd'.repeat(64); exposed.preview.baseRevision = 999;
    getCellLayerSlot(exposed.data, 'elevation', 0).block.values[0] = 11999;
    expect(h.value.pendingGeneration).toBe(exposed);
    const result = action === 'confirm' ? h.value.confirmGeneration() : h.value.discardGeneration(), request = h.worker.request();
    expect(request.operation).toMatchObject({ type: `generation-${action}`, candidateId: expected.candidateId });
    if (action === 'confirm') {
      expect(request.operation).toMatchObject({ commandId: expected.commandId, previewDigest: expected.previewDigest, expectedRevision: 0, expectedRootDigest: expected.baseRootDigest });
      stream(h.worker, generated.data, await rootFor(generated.data, 2, expected.commandId));
      const confirmed = await result;
      expect(confirmed && 'data' in confirmed && getCellLayerSlot(confirmed.data, 'elevation', 0).block.values[0]).toBe(650);
      expect(h.value.head?.manifestDigest).toBe(expected.manifestDigest);
    } else {
      h.worker.reply(encodeAtlasPacket({ version: 1, id: request.header.id, type: 'complete', body: { operation: 'generation-discard', candidateId: expected.candidateId } }));
      expect(await result).toBeNull(); expect(h.value.current).toBe(current);
    }
    expect(h.value.pendingGeneration).toBeNull(); expect(h.fatal).not.toHaveBeenCalled();
  });

  it.each([1, 2] as const)('rejects a fully hashed v%s manifest streamed under the opposite valid root domain', async manifestVersion => {
    const m = baseline.manifest;
    const legacy: AtlasDraftData = { manifest: { format: m.format, version: 1, kind: m.kind, draftId: m.draftId, atlasId: m.atlasId, name: m.name,
      seed: m.seed, revision: m.revision, spec: m.spec, catalogs: m.catalogs, blockRefs: m.blockRefs }, blocks: baseline.blocks };
    const data = manifestVersion === 1 ? legacy : baseline, wrongFormat = manifestVersion === 1 ? 2 : 1, root = await rootFor(data, wrongFormat), h = client(wrongFormat);
    const receiving = h.value.restore(data.manifest.draftId), rejected = expect(receiving).rejects.toThrow('版本与持久领域');
    expect(getAtlasStorage(wrongFormat).validateAtlasRoot(root)).toBe(true); expect(root.currentManifest).toBe(await hashAtlasManifest(data.manifest));
    stream(h.worker, data, root); await rejected;
    expect(h.value.current).toBeNull(); expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(['recipe', 'base-root'] as const)('rejects valid rehashed candidate content with mismatched %s provenance', async mismatch => {
    const h = await initialized(), current = h.value.current;
    const { receiving, generated } = await preview(h, mismatch), rejected = expect(receiving).rejects.toThrow('来源记录');
    expect(generated.preview.manifestDigest).toBe(await hashAtlasManifest(generated.data.manifest));
    expect(generated.preview.previewDigest).toBe(await generationPreviewDigest(generated.preview));
    await rejected; expect(h.value.current).toBe(current); expect(h.value.pendingGeneration).toBeNull(); expect(h.fatal).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid v1-domain root around a v2 local delta before replacing the verified baseline', async () => {
    const h = await initialized(), current = h.value.current, patch = { elevation: { ids: new Uint32Array([0]), values: new Int32Array([650]) } };
    const editing = h.value.edit(patch, '错误领域回执'), rejected = expect(editing).rejects.toThrow('持久根未绑定'), request = h.worker.request();
    const command = decodeAtlasEditMessage(request.payload), data = cloneAtlasDocument(baseline), slot = getCellLayerSlot(data, 'elevation', 0);
    slot.block.values[slot.slot] = 650; data.manifest.revision = 1;
    const ref = data.manifest.blockRefs.find(ref => ref.key === slot.key)!; ref.hash = await hashBlock(slot.block);
    const root = await rootFor(data, 1, command.commandId), delta: AtlasEditDelta = { format: 'lieguoji-atlas-delta', version: 1, draftId: data.manifest.draftId,
      commandId: command.commandId, baseRevision: 0, baseRootDigest: baselineRoot.rootDigest, revision: 1, rootDigest: root.rootDigest,
      manifestDigest: root.currentManifest, reason: '错误领域回执', patch, blockRefs: [{ ...ref }] };
    h.worker.reply(encodeAtlasPacket({ version: 1, id: request.header.id, type: 'delta', sequence: 0, body: { root, head: head(data, root) } }, encodeAtlasEditMessage(delta)));
    await rejected; expect(h.value.current).toBe(current); expect(h.value.currentFormat).toBe(2); expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });
});
