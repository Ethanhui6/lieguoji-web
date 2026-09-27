import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as AtlasFormat from './atlas-format';
import { AtlasClient } from './bridge';
import { OwnedAtlasSession, type PreparedAtlasReplacement } from './transactions';
import { AtlasConstraintsSession, type ConstraintsPreviewInfo } from './constraints-session';
import { generationLockDigest, generationPreviewDigest, generationRecipeDigest, generationScopeDigest, type GenerationPreviewInfo } from './generation-session';
import { hashAtlasCellLockBlock, encodeAtlasCellLockBlock, lockKey } from './generation-locks';
import { ADD_DETAIL_GENERATOR_FINGERPRINT } from './generation/fingerprint';
import { getAtlasStorage } from './storage';
import { encodeBlock } from './model';
import { encodeDetailCoastTile, hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout } from './detail-coast-types';
import { ATLAS_FRAGMENT_BYTES, decodeAtlasPacket, encodeAtlasPacket, type AtlasHead, type AtlasOperation, type AtlasPacket, type AtlasProgress } from './protocol';
import type { AtlasDetailCoastDocument, AtlasDocument, AddDetailRecipe } from './generation-contract';
import type { AtlasStoredRoot } from './storage-types';

const fast = { yieldTask: async () => {} }, database = getAtlasStorage(4);
const clients: AtlasClient[] = [];
type PreviewKind = 'generation' | 'constraints';
let fixture: AtlasDetailCoastDocument, countPublicClones = () => 0;
const detail = (data: AtlasDocument): AtlasDetailCoastDocument => {
  if (!AtlasFormat.isDetailCoastDocument(data)) throw new Error('Expected v4 transport fixture');
  return data;
};
const recipe = (): AddDetailRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1,
  generator: { id: 'add-detail-landmass', version: 1, fingerprint: ADD_DETAIL_GENERATOR_FINGERPRINT }, seed: 'synthetic-receiver-binding-only',
  parameters: { pointsQ: [{ xQ: 1200 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1200 * 256 }, { xQ: 1264 * 256, yQ: 1264 * 256 }], coastRoughnessWorld: 0, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 } });

async function commit(data: AtlasDetailCoastDocument, root: AtlasStoredRoot | null = null, candidate?: PreparedAtlasReplacement, mode: PreviewKind = 'generation') {
  const prepared = await database.prepareAtlasCommit({ candidateId: candidate?.candidateId ?? crypto.randomUUID(), commandId: candidate?.commandId ?? `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, fast);
  const blocks = [...data.blocks.values(), ...data.locks.values(), ...data.detailCoast.values()];
  for (let start = 0; start < blocks.length; start += 16) await database.stageAtlasBlocks(prepared.preparationId, blocks.slice(start, start + 16), fast);
  return mode === 'constraints' ? database.commitAtlasConstraintsPreparation(prepared.preparationId, fast) : database.commitAtlasPreparation(prepared.preparationId, fast);
}
async function restore(draftId: string) {
  const handle = await database.openAtlasDraft(draftId, fast); if (!handle) throw new Error('Fixture must already be persisted');
  const data: AtlasDetailCoastDocument = { manifest: handle.manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() };
  let cursor: number | null = 0;
  do {
    const page = await database.readAtlasBlockPage(handle, cursor, fast);
    for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block);
    for (const lock of page.locks ?? []) data.locks.set(lockKey(lock.bx, lock.by), lock);
    for (const tile of page.detailCoast ?? []) data.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile);
    cursor = page.nextCursor;
  } while (cursor !== null);
  await AtlasFormat.verifyAtlasDocument(data, fast); return { data, root: handle.root };
}

/** A bounded protocol fixture, NOT a generator implementation or a browser.
 * Real codecs/hash verification, Owned replacement, pure-lock session and IDB
 * persist/restore stay in use. Only the generation geometry is synthetic: one
 * negative height changes, with correct immutable refs and source binding.
 * This avoids re-running the expensive geometry kernel to test UI copying. */
class FramedFixtureWorker {
  static instances: FramedFixtureWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  corruptLastPreviewTile = false;
  clonesAtComplete = 0;
  lastCandidate?: AtlasDetailCoastDocument;
  private owner?: OwnedAtlasSession;
  private constraints?: AtlasConstraintsSession;
  private pending?: GenerationPreviewInfo | ConstraintsPreviewInfo;
  private root?: AtlasStoredRoot;
  constructor() { FramedFixtureWorker.instances.push(this); }
  terminate() { this.closed = true; this.owner = undefined; this.constraints = undefined; this.pending = undefined; }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const copy = structuredClone(bytes, { transfer }), { header } = decodeAtlasPacket(copy);
    if (header.type !== 'request') return;
    void this.execute(header.id, header.body as AtlasOperation).catch(error => this.emit(header.id, 'error', { fatal: false, committed: false, message: error instanceof Error ? error.message : 'Fixture failed' }));
  }
  private emit(id: number, type: AtlasPacket['type'], body: unknown, payload?: Uint8Array, sequence?: number) {
    const bytes = encodeAtlasPacket({ version: 1, id, type, body, ...(sequence === undefined ? {} : { sequence }) }, payload);
    queueMicrotask(() => {
      if (this.closed) return;
      if (type === 'complete') this.clonesAtComplete = countPublicClones();
      this.onmessage?.({ data: bytes } as MessageEvent);
    });
  }
  private sendDocument(id: number, data: AtlasDetailCoastDocument, preview?: GenerationPreviewInfo | ConstraintsPreviewInfo, kind?: PreviewKind) {
    const manifest = AtlasFormat.encodeAtlasManifest(data.manifest), root = this.root!, head: AtlasHead = { ...this.owner!.head, atlasId: data.manifest.atlasId, name: data.manifest.name, readOnly: false, hasBackup: root.backupManifest !== null };
    const mode = kind === 'generation' ? 'generation-preview' : 'constraints-preview'; let sequence = 0;
    const chunk = (type: AtlasPacket['type'], body: unknown, payload?: Uint8Array) => this.emit(id, type, body, payload, sequence++);
    chunk('begin', { ...(preview ? { kind: mode, preview } : { kind: 'durable', root, head }), manifestLength: manifest.length, blockCount: data.blocks.size, lockCount: data.locks.size, detailCoastCount: data.detailCoast.size });
    for (let offset = 0; offset < manifest.length; offset += ATLAS_FRAGMENT_BYTES) chunk('manifest', { offset }, manifest.slice(offset, offset + ATLAS_FRAGMENT_BYTES));
    for (const [index, ref] of data.manifest.blockRefs.entries()) chunk('block', { index, key: ref.key }, encodeBlock(data.blocks.get(ref.key)!));
    for (const [index, ref] of data.manifest.constraints.lockRefs.entries()) chunk('lock', { index, key: lockKey(ref.bx, ref.by) }, encodeAtlasCellLockBlock(data.locks.get(lockKey(ref.bx, ref.by))!));
    for (const [index, ref] of data.manifest.detailCoast.refs.entries()) {
      const key = detailCoastKey(ref.bx, ref.by), payload = encodeDetailCoastTile(data.detailCoast.get(key)!);
      if (preview && this.corruptLastPreviewTile && index + 1 === data.detailCoast.size) payload[payload.length - 1] ^= 1;
      chunk('detail-coast', { index, key }, payload);
    }
    this.emit(id, 'complete', preview ? { operation: mode, preview, metrics: {} } : { operation: 'initialize', root, head, metrics: {} });
  }
  private async execute(id: number, operation: AtlasOperation) {
    if (operation.type === 'restore') {
      const restored = await restore(operation.draftId); this.root = restored.root;
      this.owner = await OwnedAtlasSession.open(restored.data, restored.root.rootDigest, fast); this.constraints = new AtlasConstraintsSession(this.owner);
      this.sendDocument(id, restored.data); return;
    }
    if (!this.owner || !this.root || !this.constraints) throw new Error('Fixture has no restored private source');
    if (operation.type === 'generation-preview') {
      const data = detail(await this.owner.snapshotAsync(fast)), base = this.owner.head, lockSetDigest = await generationLockDigest(data);
      const tile = data.detailCoast.get('coast:0:0')!; if (tile.mode !== 'samples') throw new Error('Expected sampled tile');
      tile.elevationMeters[0] += 1;
      data.manifest.detailCoast.refs[0].hash = await hashDetailCoastTile(tile); data.manifest.revision++;
      if (operation.recipe.generator.id !== 'add-detail-landmass' || operation.scope.kind !== 'world') throw new Error('Synthetic fixture accepts only additive transport binding');
      data.manifest.generation.lastApplied = { recipe: operation.recipe as AddDetailRecipe, scope: operation.scope, baseRevision: base.revision, baseRootDigest: base.rootDigest, baseManifestDigest: base.manifestDigest, lockSetDigest, appliedRevision: data.manifest.revision };
      const prepared = await this.owner.prepareReplacement(data, operation.commandId, '合成传输候选：非生成器验收', fast);
      const partial = { ...prepared, recipe: operation.recipe, scope: operation.scope, recipeDigest: await generationRecipeDigest(operation.recipe), scopeDigest: await generationScopeDigest(operation.scope), lockSetDigest,
        summary: { changedCellCount: 0, landAreaQ2: 0, worldAreaQ2: 2 * (4096 * 256) ** 2, majorComponentCount: 0, minElevationMeters: -2000, maxElevationMeters: -500 } };
      this.pending = { ...partial, previewDigest: await generationPreviewDigest(partial) };
      this.lastCandidate = structuredClone(data); this.sendDocument(id, data, this.pending, 'generation'); return;
    }
    if (operation.type === 'constraints-preview') {
      this.pending = await this.constraints.preview(operation.command, fast);
      const data = detail(await this.owner.replacementDocumentAsync(this.pending.candidateId, fast));
      this.lastCandidate = structuredClone(data); this.sendDocument(id, data, this.pending, 'constraints'); return;
    }
    if (operation.type === 'generation-discard' || operation.type === 'constraints-discard') {
      if (operation.candidateId !== this.pending?.candidateId) throw new Error('Wrong discard identity');
      if (operation.type === 'constraints-discard') this.constraints.discard(operation.candidateId); else this.owner.discardReplacement(operation.candidateId);
      this.pending = undefined; this.emit(id, 'complete', { operation: operation.type, candidateId: operation.candidateId }); return;
    }
    if (operation.type === 'generation-confirm' || operation.type === 'constraints-confirm') {
      const p = this.pending;
      if (!p || p.candidateId !== operation.candidateId || p.commandId !== operation.commandId || p.previewDigest !== operation.previewDigest || p.baseRevision !== operation.expectedRevision || p.baseRootDigest !== operation.expectedRootDigest) throw new Error('Public mutation changed confirmation binding');
      const confirmation = { candidateId: operation.candidateId, commandId: operation.commandId, previewDigest: operation.previewDigest, expectedRevision: operation.expectedRevision, expectedRootDigest: operation.expectedRootDigest };
      const data = detail(operation.type === 'constraints-confirm' ? (await this.constraints.confirm(confirmation, fast)).data : await this.owner.replacementDocumentAsync(p.candidateId, fast));
      const receipt = await commit(data, this.root, p, operation.type === 'constraints-confirm' ? 'constraints' : 'generation'); this.owner.publishReplacement(p.candidateId, receipt);
      if (operation.type === 'constraints-confirm') this.constraints.published(p.candidateId);
      this.root = receipt.root; this.pending = undefined; this.sendDocument(id, data); return;
    }
    throw new Error(`Unsupported fixture operation: ${operation.type}`);
  }
}

function client(onProgress?: (progress: AtlasProgress) => void) {
  const value = new AtlasClient({ format: 4, onProgress }); clients.push(value); return value;
}
async function setup(onProgress?: (progress: AtlasProgress) => void) {
  const data = structuredClone(fixture); data.manifest.draftId = `atlas-${crypto.randomUUID()}`;
  await commit(data); const value = client(onProgress), initial = await value.restore(data.manifest.draftId);
  return { value, initial, worker: FramedFixtureWorker.instances.at(-1)!, draftId: data.manifest.draftId };
}
const preview = (client: AtlasClient, kind: PreviewKind) => kind === 'generation' ? client.previewGeneration(recipe()) : client.previewConstraints({ column: 2, row: 2, columns: 1, rows: 1 }, 3, 'set');

beforeAll(async () => {
  fixture = await AtlasFormat.createGenerationDraft({ size: 128, name: '合成细场接收隔离测试', seed: 'receiver-private-copy' }, fast, 4);
  // 33 sampled tiles require 16 + 16 + 1 copies. The last is the world corner
  // with the larger owner layout; no generated terrain is claimed by this test.
  for (let index = 0; index < 33; index++) {
    const bx = index < 32 ? index : 63, by = index < 32 ? 0 : 63, count = detailCoastOwnerLayout(bx, by).count;
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ: new Int16Array(count).fill(-512), elevationMeters: new Int16Array(count).fill(-500 - index) } as const;
    fixture.detailCoast.set(detailCoastKey(bx, by), tile); fixture.manifest.detailCoast.refs.push({ bx, by, hash: await hashDetailCoastTile(tile) });
  }
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 3, by: 3, flags: new Uint8Array(1024) } as const;
  lock.flags[1023] = 1; fixture.locks.set(lockKey(lock.bx, lock.by), lock);
  fixture.manifest.constraints.lockRefs = [{ bx: 3, by: 3, hash: await hashAtlasCellLockBlock(lock) }];
  await AtlasFormat.verifyAtlasDocument(fixture, fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); FramedFixtureWorker.instances = []; vi.stubGlobal('Worker', FramedFixtureWorker); countPublicClones = () => 0; });
afterEach(async () => { clients.splice(0).forEach(value => value.close()); await new Promise(resolve => setTimeout(resolve, 0)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('verified private receiver copy without reopening public whole-document ingress', () => {
  it('copies both preview kinds in three real timer batches, preserves bytes and never re-enters public clone after complete', async () => {
    const publicClone = vi.spyOn(AtlasFormat, 'cloneVerifiedAtlasDocument'); countPublicClones = () => publicClone.mock.calls.length;
    for (const kind of ['generation', 'constraints'] as const) {
      const batches: number[] = [], timers: number[] = []; let active = false;
      const { value, worker } = await setup(progress => {
        if (active && progress.stage === '创建独立细海岸视图') { batches.push(progress.completed); setTimeout(() => timers.push(progress.completed), 0); }
      });
      active = true; const result = await preview(value, kind); active = false;
      expect(batches).toEqual([16, 32, 33]); expect(timers).toEqual([16, 32, 33]);
      expect(publicClone.mock.calls.length).toBe(worker.clonesAtComplete);
      expect(result.data).toEqual(worker.lastCandidate); expect(detail(result.data).detailCoast.size).toBe(33);
      for (const ref of detail(result.data).manifest.detailCoast.refs) expect(await hashDetailCoastTile(detail(result.data).detailCoast.get(detailCoastKey(ref.bx, ref.by))!)).toBe(ref.hash);
      if (kind === 'generation') await value.discardGeneration(); else await value.discardConstraints();
    }
  }, 30000);

  it('isolates public maps, both fine arrays, coarse blocks, locks, manifest and preview binding through confirm and fresh restore', async () => {
    for (const kind of ['generation', 'constraints'] as const) {
      const { value, draftId } = await setup(), result = await preview(value, kind), expected = structuredClone(result.data), data = detail(result.data);
      const tile = data.detailCoast.get('coast:0:0')!; if (tile.mode !== 'samples') throw new Error('Expected sampled tile');
      tile.coverageQ.fill(1); tile.elevationMeters.fill(12000); data.detailCoast.clear();
      for (const block of data.blocks.values()) if (block.layer === 'elevation') block.values.fill(12000);
      data.blocks.clear(); for (const lock of data.locks.values()) lock.flags.fill(0); data.locks.clear();
      data.manifest.name = 'external mutation'; data.manifest.detailCoast.refs.length = 0;
      result.preview.commandId = 'edit-external-mutation'; result.preview.candidateId = crypto.randomUUID(); result.preview.previewDigest = '0'.repeat(64);
      const committed = kind === 'generation' ? await value.confirmGeneration() : await value.confirmConstraints();
      expect(committed.data).toEqual(expected); expect(committed.head.revision).toBe(1);
      const fresh = await client().restore(draftId); expect(fresh.data).toEqual(expected); expect(fresh.head.rootDigest).toBe(committed.head.rootDigest);
      const handle = await database.openAtlasDraft(draftId, fast); expect(handle!.root.currentManifest).toBe(await AtlasFormat.hashAtlasManifest(expected.manifest));
    }
  }, 30000);

  it('closes during the second timer batch without installing a partial preview or replacing the verified current view', async () => {
    for (const kind of ['generation', 'constraints'] as const) {
      const batches: number[] = []; let active = false, closedAtTimer = false;
      const { value, worker, initial, draftId } = await setup(progress => {
        if (active && progress.stage === '创建独立细海岸视图') {
          batches.push(progress.completed);
          if (progress.completed === 32) setTimeout(() => { closedAtTimer = true; value.close(); }, 0);
        }
      });
      const before = await database.exportAtlasRawBackup(draftId); active = true;
      await expect(preview(value, kind)).rejects.toThrow('草稿线程已关闭');
      expect(closedAtTimer).toBe(true); expect(batches).toEqual([16, 32]); expect(worker.closed).toBe(true);
      expect(value.pendingGeneration).toBeNull(); expect(value.pendingConstraints).toBeNull(); expect(value.current).toBe(initial);
      expect(await database.exportAtlasRawBackup(draftId)).toEqual(before);
      await expect(value.restore(draftId)).rejects.toThrow('草稿线程已关闭');
      expect((await client().restore(draftId)).data).toEqual(initial.data);
    }
  }, 30000);

  it('rejects the corrupt last fine tile before either preview can enter private view copying or publish partial state', async () => {
    for (const kind of ['generation', 'constraints'] as const) {
      const copied: AtlasProgress[] = []; let active = false;
      const { value, initial, worker, draftId } = await setup(progress => { if (active && progress.stage.startsWith('创建')) copied.push(progress); });
      const before = await database.exportAtlasRawBackup(draftId); worker.corruptLastPreviewTile = true; active = true;
      await expect(preview(value, kind)).rejects.toThrow();
      expect(copied).toEqual([]); expect(worker.closed).toBe(true); expect(value.current).toBe(initial);
      expect(value.pendingGeneration).toBeNull(); expect(value.pendingConstraints).toBeNull();
      expect(await database.exportAtlasRawBackup(draftId)).toEqual(before);
    }
  }, 30000);
});
