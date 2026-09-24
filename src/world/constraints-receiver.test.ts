import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { cloneAtlasDocument, createGenerationDraft, encodeAtlasManifest, hashAtlasManifest, isGenerationDocument, type AtlasDocument, type AtlasGenerationDocument } from './atlas-format';
import { constraintsPreviewDigest, type ConstraintsPreviewInfo } from './constraints-session';
import { encodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey, atlasCellLockFlags } from './generation-locks';
import { generationLockDigest } from './generation-session';
import { encodeBlock, getCellLayerSlot, hashBlock } from './model';
import { decodeAtlasPacket, encodeAtlasPacket, type AtlasHead, type AtlasOperation } from './protocol';
import { getAtlasStorage } from './storage';
import type { AtlasStoredRoot } from './storage-types';

/** Only the transport endpoint is synthetic. All replies cross the production
 * decoder, actual geography/lock verification and private receiver state. */
class ConstraintsWorkerDouble {
  static instances: ConstraintsWorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(bytes: Uint8Array, transfer: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() { ConstraintsWorkerDouble.instances.push(this); }
  request() {
    const packet = this.postMessage.mock.calls.map(([bytes]) => decodeAtlasPacket(bytes)).filter(packet => packet.header.type === 'request').at(-1);
    if (!packet) throw new Error('missing request');
    return { ...packet, operation: packet.header.body as AtlasOperation };
  }
  reply(bytes: Uint8Array) { this.onmessage?.({ data: bytes } as MessageEvent); }
}
const clients: AtlasClient[] = [];
let baseline: AtlasGenerationDocument, root: AtlasStoredRoot;
const rectangle = { column: 0, row: 0, columns: 2, rows: 2 };
const commandId = () => `edit-${crypto.randomUUID()}`;
async function rootFor(data: AtlasDocument, commit = commandId()): Promise<AtlasStoredRoot> {
  const next: AtlasStoredRoot = { format: 'lieguoji-atlas-root', version: 1, domain: 'atlas-draft-v2', draftId: data.manifest.draftId,
    revision: data.manifest.revision, currentManifest: await hashAtlasManifest(data.manifest), backupManifest: data.manifest.revision ? root.currentManifest : null,
    lastCommitId: commit, rootDigest: '0'.repeat(64) };
  next.rootDigest = await getAtlasStorage(2).hashAtlasRoot(next); return next;
}
function head(data: AtlasDocument, stored: AtlasStoredRoot): AtlasHead {
  return { draftId: data.manifest.draftId, atlasId: data.manifest.atlasId, name: data.manifest.name, revision: data.manifest.revision,
    rootDigest: stored.rootDigest, manifestDigest: stored.currentManifest, readOnly: false, hasBackup: stored.backupManifest !== null, undoCount: 0 };
}
function stream(worker: ConstraintsWorkerDouble, data: AtlasGenerationDocument, source: AtlasStoredRoot | ConstraintsPreviewInfo) {
  const id = worker.request().header.id, bytes = encodeAtlasManifest(data.manifest), preview = 'candidateId' in source;
  const viewHead = preview ? null : head(data, source); let sequence = 0;
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'begin', sequence: sequence++, body: {
    ...(preview ? { kind: 'constraints-preview', preview: source } : { kind: 'durable', root: source, head: viewHead }),
    manifestLength: bytes.length, blockCount: data.blocks.size, lockCount: data.locks.size,
  } }));
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'manifest', sequence: sequence++, body: { offset: 0 } }, bytes));
  for (const [index, ref] of data.manifest.blockRefs.entries()) worker.reply(encodeAtlasPacket({ version: 1, id, type: 'block', sequence: sequence++, body: { key: ref.key, index } }, encodeBlock(data.blocks.get(ref.key)!)));
  for (const [index, ref] of data.manifest.constraints.lockRefs.entries()) worker.reply(encodeAtlasPacket({ version: 1, id, type: 'lock', sequence: sequence++, body: { key: lockKey(ref.bx, ref.by), index } }, encodeAtlasCellLockBlock(data.locks.get(lockKey(ref.bx, ref.by))!)));
  worker.reply(encodeAtlasPacket({ version: 1, id, type: 'complete', body: preview
    ? { operation: 'constraints-preview', preview: source, metrics: {} }
    : { operation: 'initialize', root: source, head: viewHead, metrics: {} } }));
}
async function initialized() {
  const fatal = vi.fn(), client = new AtlasClient({ format: 2, onFatal: fatal }); clients.push(client);
  const worker = ConstraintsWorkerDouble.instances.at(-1)!, restored = client.restore(baseline.manifest.draftId);
  stream(worker, baseline, root); await restored; return { client, worker, fatal };
}
type Fault = 'rectangle' | 'mask' | 'changed-count' | 'outside-lock' | 'missing-inside-lock' | 'geography' | 'identity';
async function candidate(operation: Extract<AtlasOperation, { type: 'constraints-preview' }>, fault?: Fault) {
  const data = cloneAtlasDocument(baseline), flags = new Uint8Array(1024);
  for (const slot of [0, 1, 32, 33]) flags[slot] = 3;
  if (fault === 'outside-lock') flags[2] = 3;
  if (fault === 'missing-inside-lock') flags[33] = 0;
  const lock = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 0, by: 0, flags };
  data.locks.set(lockKey(0, 0), lock); data.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }]; data.manifest.revision = 1;
  if (fault === 'geography') {
    const slot = getCellLayerSlot(data, 'elevation', 0); slot.block.values[slot.slot] = 900;
    data.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block);
  }
  if (fault === 'identity') data.manifest.name = 'valid but unauthorized renamed world';
  const partial = { candidateId: crypto.randomUUID(), commandId: operation.command.commandId, baseRevision: 0, baseRootDigest: root.rootDigest,
    baseManifestDigest: root.currentManifest, revision: 1, manifestDigest: await hashAtlasManifest(data.manifest), reason: '接收边界锁候选',
    rectangle: fault === 'rectangle' ? { ...rectangle, column: 1 } : { ...rectangle }, mask: fault === 'mask' ? 1 as const : 3 as const, action: 'set' as const,
    changedCellCount: fault === 'changed-count' ? 3 : 4, beforeLockSetDigest: await generationLockDigest(baseline), afterLockSetDigest: await generationLockDigest(data) };
  return { data, preview: { ...partial, previewDigest: await constraintsPreviewDigest(partial) } };
}
beforeAll(async () => { baseline = await createGenerationDraft({ size: 128, seed: 'constraints-receiver-fixture', name: '区域锁接收边界' }); root = await rootFor(baseline); });
beforeEach(() => { ConstraintsWorkerDouble.instances = []; vi.stubGlobal('Worker', ConstraintsWorkerDouble); });
afterEach(() => { clients.splice(0).forEach(client => client.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PH06 constraints receiver ownership and fully hashed hostile candidates', () => {
  it.each(['confirm', 'discard'] as const)('keeps the private %s identity after all public aliases are mutated', async action => {
    const h = await initialized(), current = h.client.current, receiving = h.client.previewConstraints(rectangle, 3, 'set'), request = h.worker.request();
    if (request.operation.type !== 'constraints-preview') throw new Error('wrong request');
    const generated = await candidate(request.operation), expected = structuredClone(generated.preview); stream(h.worker, generated.data, generated.preview);
    const exposed = await receiving;
    exposed.preview.candidateId = crypto.randomUUID(); exposed.preview.commandId = commandId(); exposed.preview.previewDigest = 'f'.repeat(64);
    exposed.preview.baseRootDigest = 'd'.repeat(64); exposed.preview.baseRevision = 999; exposed.preview.rectangle.columns = 128; exposed.preview.mask = 1; exposed.preview.action = 'clear';
    if (!isGenerationDocument(exposed.data)) throw new Error('missing v2');
    exposed.data.locks.get(lockKey(0, 0))!.flags.fill(0); getCellLayerSlot(exposed.data, 'elevation', 0).block.values[0] = 10000;
    expect(h.client.current).toBe(current); expect(h.client.pendingConstraints).toBe(exposed);
    const result = action === 'confirm' ? h.client.confirmConstraints() : h.client.discardConstraints(), command = h.worker.request();
    expect(command.operation).toMatchObject({ type: `constraints-${action}`, candidateId: expected.candidateId });
    if (action === 'confirm') {
      expect(command.operation).toMatchObject({ commandId: expected.commandId, previewDigest: expected.previewDigest, expectedRevision: 0, expectedRootDigest: root.rootDigest });
      stream(h.worker, generated.data, await rootFor(generated.data, expected.commandId));
      const confirmed = await result; if (!confirmed || !('data' in confirmed) || !isGenerationDocument(confirmed.data)) throw new Error('missing confirmed v2');
      expect(atlasCellLockFlags(confirmed.data, 0)).toBe(3); expect(getCellLayerSlot(confirmed.data, 'elevation', 0).block.values[0]).toBe(-100);
      expect(h.client.head?.manifestDigest).toBe(expected.manifestDigest);
    } else {
      h.worker.reply(encodeAtlasPacket({ version: 1, id: command.header.id, type: 'complete', body: { operation: 'constraints-discard', candidateId: expected.candidateId } }));
      expect(await result).toBeNull(); expect(h.client.current).toBe(current);
    }
    expect(h.client.pendingConstraints).toBeNull(); expect(h.fatal).not.toHaveBeenCalled();
  }, 20_000);

  it.each(['rectangle', 'mask', 'changed-count', 'outside-lock', 'missing-inside-lock', 'geography', 'identity'] as const)('rejects a fully rehashed %s candidate without replacing the verified root', async fault => {
    const h = await initialized(), current = h.client.current, receiving = h.client.previewConstraints(rectangle, 3, 'set'), request = h.worker.request();
    if (request.operation.type !== 'constraints-preview') throw new Error('wrong request');
    const generated = await candidate(request.operation, fault);
    expect(generated.preview.manifestDigest).toBe(await hashAtlasManifest(generated.data.manifest));
    expect(generated.preview.previewDigest).toBe(await constraintsPreviewDigest(generated.preview));
    expect(generated.preview.afterLockSetDigest).toBe(await generationLockDigest(generated.data));
    const rejected = expect(receiving).rejects.toThrow(fault === 'identity' ? '草稿manifest与已核验来源不符。' : /区域锁|纯锁事务/);
    stream(h.worker, generated.data, generated.preview); await rejected;
    expect(h.client.current).toBe(current); expect(h.client.head?.rootDigest).toBe(root.rootDigest); expect(h.client.pendingConstraints).toBeNull();
    expect(h.fatal).toHaveBeenCalledTimes(1); expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  }, 20_000);
});
