import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDocument, cloneVerifiedAtlasDocument, createGenerationDraft, type AtlasCellLockBlock, type AtlasGenerationDocument, type CoastRecipe } from './atlas-format';
import { createAtlasDraft, getCellLayerSlot, hashBlock, type AtlasDraftData } from './model';
import { hashAtlasCellLockBlock } from './generation-locks';
import { OwnedAtlasSession } from './transactions';
import { AtlasGenerationSession } from './generation-session';
import { COAST_GENERATOR_FINGERPRINT } from './generation/fingerprint';

const fast = { yieldTask: async () => undefined }, rootDigest = 'a'.repeat(64);
let base: AtlasGenerationDocument, legacy: AtlasDraftData;
beforeAll(async () => {
  base = await createGenerationDraft({ name: '协作复制所有权', seed: 'cooperative-copy', size: 128 }, fast);
  legacy = await createAtlasDraft({ name: '旧格式协作边界', seed: 'cooperative-v1', size: 128 }, fast);
  const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) }; lock.flags[0] = 3;
  base.locks.set('lock:0:0', lock); base.manifest.constraints.lockRefs.push({ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) });
});
async function prepareReplacement(session: OwnedAtlasSession<AtlasGenerationDocument>) {
  const next = session.snapshot(), slot = getCellLayerSlot(next, 'elevation', 100); slot.block.values[slot.slot] = -90;
  next.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block); next.manifest.revision++;
  return session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '协作候选测试', fast);
}
const coastRecipe = (): CoastRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'coast-smoothing', version: 1, fingerprint: COAST_GENERATOR_FINGERPRINT }, parameters: { strengthPermille: 500, iterations: 1 } });

describe('cooperative copies retain exact ownership and complete verification', () => {
  it('owns every generation manifest, block and lock buffer before the first progress callback or yield', async () => {
    const input = cloneAtlasDocument(base), expected = structuredClone(input), stages: string[] = []; let changed = false;
    const owned = await cloneVerifiedAtlasDocument(input, { ...fast, onProgress: progress => {
      stages.push(progress.stage); if (changed) return; changed = true;
      input.manifest.name = 'late caller mutation'; input.manifest.blockRefs[0].hash = 'f'.repeat(64);
      const geometry = input.blocks.get('geometry:0:0'); if (!geometry || geometry.layer !== 'geometry') throw new Error('fixture');
      geometry.xyQ.fill(0); getCellLayerSlot(input, 'elevation', 100).block.values.fill(12000);
      input.locks.get('lock:0:0')!.flags.fill(0); input.blocks.clear(); input.locks.clear();
    } });
    expect(stages[0]).toBe('复制生成草稿分层与锁'); expect(stages).toContain('核验共享地理与跨块邻接'); expect(stages).toContain('核验生成草稿地理块');
    expect(changed).toBe(true); expect(owned).toEqual(expected); expect(owned).not.toBe(input);
  });

  it('retains the same copy-before-await protection for the unchanged v1 codec', async () => {
    const input = cloneAtlasDocument(legacy), expected = structuredClone(input); let changed = false;
    const owned = await cloneVerifiedAtlasDocument(input, { ...fast, onProgress: () => {
      if (changed) return; changed = true; input.manifest.name = 'late v1 mutation'; getCellLayerSlot(input, 'elevation', 100).block.values.fill(500); input.blocks.clear();
    } });
    expect(changed).toBe(true); expect(owned.manifest.version).toBe(1); expect(owned).toEqual(expected);
  });

  it('still rejects wrong hashes, invalid real geometry and malformed typed-array properties', async () => {
    const badHash = cloneAtlasDocument(base), height = getCellLayerSlot(badHash, 'elevation', 100); height.block.values[height.slot] = -90;
    await expect(cloneVerifiedAtlasDocument(badHash, fast)).rejects.toThrow('摘要');
    const badGeometry = cloneAtlasDocument(base), geometry = badGeometry.blocks.get('geometry:0:0'); if (!geometry || geometry.layer !== 'geometry') throw new Error('fixture');
    geometry.xyQ[0] = 1; await expect(cloneVerifiedAtlasDocument(badGeometry, fast)).rejects.toThrow('几何');
    const malformed = cloneAtlasDocument(base), values = getCellLayerSlot(malformed, 'elevation', 100).block.values;
    Object.defineProperty(values, 'unknown', { value: true, enumerable: true }); const progress = vi.fn();
    await expect(cloneVerifiedAtlasDocument(malformed, { ...fast, onProgress: progress })).rejects.toThrow('结构'); expect(progress).not.toHaveBeenCalled();
  });

  it.each(['复制生成草稿分层与锁', '核验共享地理与跨块邻接', '核验生成草稿地理块'])('cancels a session snapshot during actual %s work without modifying its private source', async stage => {
    const session = await OwnedAtlasSession.open(base, rootDigest, fast), before = session.head, controller = new AbortController();
    const progress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('snapshot cancelled', 'AbortError')); });
    await expect(session.snapshotAsync({ ...fast, signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress.mock.calls.some(([value]) => value.stage === stage)).toBe(true); expect(session.head).toEqual(before); expect(session.snapshot()).toEqual(base);
    expect(session.replacementPending).toBe(false);
  });

  it('returns detached snapshot buffers and rejects a source revision replaced while its cooperative copy is pending', async () => {
    const session = await OwnedAtlasSession.open(base, rootDigest, fast), snapshot = await session.snapshotAsync(fast);
    snapshot.manifest.name = 'external edit'; getCellLayerSlot(snapshot, 'elevation', 100).block.values.fill(12000); snapshot.locks.get('lock:0:0')!.flags.fill(0);
    expect(session.snapshot()).toEqual(base);
    const prepared = await prepareReplacement(session); let published = false;
    await expect(session.snapshotAsync({ ...fast, onProgress: () => {
      if (published) return; published = true;
      session.publishReplacement(prepared.candidateId, { draftId: base.manifest.draftId, commandId: prepared.commandId, revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest: 'b'.repeat(64) });
    } })).rejects.toThrow('复制期间草稿已变化');
    expect(published).toBe(true); expect(session.head.revision).toBe(1);
  });

  it('returns detached replacement buffers and refuses a candidate discarded while its copy is pending', async () => {
    const session = await OwnedAtlasSession.open(base, rootDigest, fast), prepared = await prepareReplacement(session);
    const first = await session.replacementDocumentAsync(prepared.candidateId, fast), expected = structuredClone(first);
    getCellLayerSlot(first, 'elevation', 100).block.values.fill(10000); first.locks.get('lock:0:0')!.flags.fill(0); first.manifest.name = 'external replacement edit';
    expect(await session.replacementDocumentAsync(prepared.candidateId, fast)).toEqual(expected);
    let discarded = false;
    await expect(session.replacementDocumentAsync(prepared.candidateId, { ...fast, onProgress: () => { if (!discarded) { discarded = true; session.discardReplacement(prepared.candidateId); } } })).rejects.toThrow('候选已经失效');
    expect(discarded).toBe(true); expect(session.replacementPending).toBe(false); expect(session.head.revision).toBe(0); expect(session.snapshot()).toEqual(base);
  });

  it('cancels the actual generator handoff before any candidate is installed, and a later confirm-copy cancellation retains only the pending candidate', async () => {
    const session = await OwnedAtlasSession.open(base, rootDigest, fast), generation = new AtlasGenerationSession(session), controller = new AbortController();
    const stages: string[] = [];
    await expect(generation.preview(`edit-${crypto.randomUUID()}`, 0, rootDigest, coastRecipe(), { kind: 'world' }, { ...fast, signal: controller.signal, onProgress: progress => {
      stages.push(progress.stage); if (progress.stage === '整理候选分层引用') controller.abort(new DOMException('handoff cancelled', 'AbortError'));
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages).toContain('整理候选分层引用'); expect(generation.pending).toBeNull(); expect(session.replacementPending).toBe(false); expect(session.snapshot()).toEqual(base);
    const p = await generation.preview(`edit-${crypto.randomUUID()}`, 0, rootDigest, coastRecipe(), { kind: 'world' }, fast), confirmController = new AbortController();
    await expect(generation.confirm({ candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: 0, expectedRootDigest: rootDigest }, {
      ...fast, signal: confirmController.signal, onProgress: () => confirmController.abort(new DOMException('confirm copy cancelled', 'AbortError')),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(generation.pending).toEqual(p); expect(session.replacementPending).toBe(true); expect(session.head.revision).toBe(0);
    generation.discard(p.candidateId); expect(session.replacementPending).toBe(false);
  });
});
