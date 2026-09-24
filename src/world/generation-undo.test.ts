import { beforeAll, describe, expect, it } from 'vitest';
import { cloneBlock, encodeBlock, hashBlock, type AtlasBlock, type BlockKey } from './model';
import { createGenerationDraft, encodeAtlasManifest, type AtlasCellLockBlock, type AtlasGenerationDocument } from './atlas-format';
import { encodeAtlasCellLockBlock, hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { OwnedAtlasSession, type AtlasEditCommand, type AtlasPublishedRoot, type PreparedAtlasEdit, type PreparedAtlasReplacement } from './transactions';

const noWait = { yieldTask: async () => {} }, limit = 64 * 1024 * 1024;
let small: AtlasGenerationDocument, large: AtlasGenerationDocument;
const commandId = () => `edit-${crypto.randomUUID()}`;
const rootDigest = (revision: number) => (revision + 1).toString(16).padStart(64, '0');
beforeAll(async () => {
  small = await createGenerationDraft({ size: 128, seed: 'ph06-undo-small-synthetic', name: '完整替换候选隔离测试' }, noWait);
  large = await createGenerationDraft({ size: 256, seed: 'ph06-undo-budget-synthetic', name: '完整地图撤销实际编码预算测试' }, noWait);
  // Real encoded attachments, not a stubbed budget or forged private counter.
  // Each block's final cell is protected; all test changes target unlocked cell 0.
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) };
    lock.flags[1023] = 2; large.locks.set(lockKey(bx, by), lock);
    large.manifest.constraints.lockRefs.push({ bx, by, hash: await hashAtlasCellLockBlock(lock) });
  }
}, 30000);

/** A synthetic receipt exercises the owned-session contract only. These tests
 * do not claim an IndexedDB commit; its atomic path has separate storage tests. */
function receipt(session: OwnedAtlasSession, prepared: PreparedAtlasEdit | PreparedAtlasReplacement): AtlasPublishedRoot {
  return { draftId: session.head.draftId, commandId: prepared.commandId, revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest: rootDigest(prepared.revision) };
}
function localCommand(session: OwnedAtlasSession, value: number): AtlasEditCommand {
  const head = session.head;
  return { format: 'lieguoji-atlas-edit', version: 1, draftId: head.draftId, expectedRevision: head.revision, expectedRootDigest: head.rootDigest, commandId: commandId(), reason: '保留在完整地图操作之前的局部修改', patch: { elevation: { ids: new Uint32Array([0]), values: new Int32Array([value]) } } };
}
function firstElevation(session: OwnedAtlasSession): number {
  const block = session.readBlocks(['elevation:0:0'])[0]; if (block.layer !== 'elevation') throw new Error('fixture layer'); return block.values[0];
}
async function replacement(session: OwnedAtlasSession<AtlasGenerationDocument>, template: AtlasGenerationDocument, value: number): Promise<AtlasGenerationDocument> {
  const manifest = session.manifest(); if (manifest.version !== 2) throw new Error('fixture format'); manifest.revision++;
  const block = cloneBlock(template.blocks.get('elevation:0:0')!); if (block.layer !== 'elevation') throw new Error('fixture layer'); block.values[0] = value;
  manifest.blockRefs.find(ref => ref.key === 'elevation:0:0')!.hash = await hashBlock(block);
  const blocks = new Map<BlockKey, AtlasBlock>(template.blocks); blocks.set('elevation:0:0', block);
  return { manifest, blocks, locks: template.locks };
}

describe('PH06 owned full-world replacement and bounded undo history', () => {
  it('reaches the actual 64 MiB encoded budget, rejects unchanged, and undoes at the limit without erasing the earlier local patch', async () => {
    const session = await OwnedAtlasSession.open(large, rootDigest(0), noWait);
    const local = await session.prepare(localCommand(session, 10), noWait); session.publish(local.candidateId, receipt(session, local));
    expect(session.head.undoCount).toBe(1); expect(session.undoKind).toBe('patch');

    // Encoded four-layer lengths are invariant under integer elevation edits.
    // Manifest lengths are measured for each actual revision, and all 64 LGAL
    // objects are counted, so this oracle also detects either omitted category.
    const geographyBytes = [...large.blocks.values()].reduce((sum, block) => sum + encodeBlock(block).length, 0);
    const lockBytes = [...large.locks.values()].reduce((sum, block) => sum + encodeAtlasCellLockBlock(block).length, 0);
    const history: { previousValue: number; bytes: number; manifestBytes: number }[] = [];
    let retained = 0, retainedManifest = 0, currentValue = 10, preparedCount = 0, rejected = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const manifestBytes = encodeAtlasManifest(session.manifest()).length, bytes = geographyBytes + lockBytes + manifestBytes;
      const candidate = await replacement(session, large, 1000 + attempt);
      if (retained + bytes > limit) {
        const beforeHead = session.head, before = session.snapshot();
        await expect(session.prepareReplacement(candidate, commandId(), '实际预算边界拒绝', noWait)).rejects.toThrow('64 MiB');
        expect(session.head).toEqual(beforeHead); expect(session.snapshot()).toEqual(before); expect(session.replacementPending).toBe(false);
        // Both are necessary for this fixture: ignoring either manifest or
        // lock bytes would incorrectly admit the next full-world operation.
        expect(retained - retainedManifest + bytes - manifestBytes).toBeLessThanOrEqual(limit);
        expect(retained - history.length * lockBytes + bytes - lockBytes).toBeLessThanOrEqual(limit);
        expect(session.undoKind).toBe('whole'); rejected = true; break;
      }
      const beforeHead = session.head, prepared = await session.prepareReplacement(candidate, commandId(), '纯数据完整地图替换', noWait); preparedCount++;
      expect(session.head).toEqual(beforeHead); expect(firstElevation(session)).toBe(currentValue);
      session.publishReplacement(prepared.candidateId, receipt(session, prepared));
      history.push({ previousValue: currentValue, bytes, manifestBytes }); retained += bytes; retainedManifest += manifestBytes;
      currentValue = 1000 + attempt; expect(firstElevation(session)).toBe(currentValue); expect(session.head.undoCount).toBe(history.length + 1);
    }
    expect(rejected).toBe(true); expect(history.length).toBeGreaterThan(1); expect(retained).toBeLessThanOrEqual(limit);
    expect(retained + geographyBytes + lockBytes + encodeAtlasManifest(session.manifest()).length).toBeGreaterThan(limit);

    // A full undo must not reserve another history copy when already at the
    // actual boundary. Each publication removes exactly one whole entry.
    const fullCount = history.length; let verifiedFreedBudget = false;
    while (history.length) {
      const previous = history.pop()!, before = session.head;
      const undo = await session.prepareReplacementUndo(commandId(), noWait); preparedCount++;
      expect(session.head).toEqual(before); expect(undo.revision).toBe(before.revision + 1);
      session.publishReplacement(undo.candidateId, receipt(session, undo)); retained -= previous.bytes;
      expect(firstElevation(session)).toBe(previous.previousValue); expect(session.head.undoCount).toBe(history.length + 1);
      if (!verifiedFreedBudget) {
        // Removing one whole entry restores admission. Discarding its new
        // candidate must neither consume budget nor erase the remaining undo.
        const head = session.head, freed = await session.prepareReplacement(await replacement(session, large, 5000), commandId(), '撤销释放后的真实预算', noWait); preparedCount++;
        session.discardReplacement(freed.candidateId); expect(session.head).toEqual(head); expect(session.replacementPending).toBe(false); verifiedFreedBudget = true;
      }
    }
    expect(preparedCount).toBe(fullCount * 2 + 1); expect(preparedCount + 1).toBeLessThanOrEqual(100);
    expect(retained).toBe(0); expect(session.undoKind).toBe('patch'); expect(firstElevation(session)).toBe(10); expect(session.head.undoCount).toBe(1);
    const patchUndo = await session.prepareUndo(commandId(), noWait); session.publish(patchUndo.candidateId, receipt(session, patchUndo));
    expect(firstElevation(session)).toBe(-100); expect(session.head.undoCount).toBe(0); expect(session.undoKind).toBeNull();
    const finalManifest = session.manifest(); if (finalManifest.version !== 2) throw new Error('fixture format');
    expect(finalManifest.blockRefs).toEqual(large.manifest.blockRefs); expect(finalManifest.constraints).toEqual(large.manifest.constraints);
    expect(session.readLocks()).toEqual([...large.locks.values()]);
  }, 180000);

  it('rejects mismatched receipts, stale bases and expired candidates without changing head or undo', async () => {
    const session = await OwnedAtlasSession.open(small, rootDigest(0), noWait), candidate = await replacement(session, small, 250), before = session.head;
    const prepared = await session.prepareReplacement(candidate, commandId(), '回执绑定测试', noWait), valid = receipt(session, prepared);
    const wrong: Partial<AtlasPublishedRoot>[] = [{ draftId: `atlas-${crypto.randomUUID()}` }, { commandId: commandId() }, { revision: prepared.revision + 1 }, { manifestDigest: 'f'.repeat(64) }, { rootDigest: 'invalid' }];
    for (const change of wrong) {
      expect(() => session.publishReplacement(prepared.candidateId, { ...valid, ...change })).toThrow('回执或基线不符');
      expect(session.head).toEqual(before); expect(firstElevation(session)).toBe(-100); expect(session.replacementPending).toBe(true);
    }
    await expect(session.prepare(localCommand(session, 400), noWait)).rejects.toThrow('已有一笔');
    session.discardReplacement(prepared.candidateId); expect(() => session.publishReplacement(prepared.candidateId, valid)).toThrow('失效'); expect(session.head).toEqual(before);
    const accepted = await session.prepareReplacement(candidate, commandId(), '有效候选', noWait); session.publishReplacement(accepted.candidateId, receipt(session, accepted));
    const published = session.head; await expect(session.prepareReplacement(candidate, commandId(), '过期修订', noWait)).rejects.toThrow('当前修订');
    expect(session.head).toEqual(published); expect(firstElevation(session)).toBe(250); expect(session.replacementPending).toBe(false);
    const wrongIdentity = await replacement(session, small, 300); wrongIdentity.manifest.atlasId = `geo-${crypto.randomUUID()}`;
    await expect(session.prepareReplacement(wrongIdentity, commandId(), '错误地理基线', noWait)).rejects.toThrow('固定身份'); expect(session.head).toEqual(published);
  });

  it('owns the candidate before yielding and rejects authority through caller data, public tokens or exported replacement buffers', async () => {
    const session = await OwnedAtlasSession.open(large, rootDigest(0), noWait), raw = await replacement(session, large, 260), originalLocks = session.readLocks();
    // The caller owns a separate lock map so its mutation also cannot corrupt
    // the shared test fixture used by other independent cases.
    raw.locks = new Map([...large.locks].map(([key, lock]) => [key, structuredClone(lock)]));
    const pending = session.prepareReplacement(raw, commandId(), '所有权隔离', noWait);
    const dirty = raw.blocks.get('elevation:0:0')!; if (dirty.layer !== 'elevation') throw new Error('fixture layer'); dirty.values[0] = 9000;
    raw.manifest.name = '外部改名'; raw.manifest.revision = 999; raw.locks.values().next().value!.flags.fill(0);
    const prepared = await pending, fixed = structuredClone(prepared), valid = receipt(session, fixed), exported = session.replacementDocument(fixed.candidateId);
    const exportedBlock = exported.blocks.get('elevation:0:0')!; if (exportedBlock.layer !== 'elevation') throw new Error('fixture layer'); exportedBlock.values[0] = 7000;
    exported.manifest.name = '导出改名'; exported.locks.values().next().value!.flags.fill(0);
    prepared.commandId = commandId(); prepared.manifestDigest = 'e'.repeat(64); prepared.baseRevision = 900; prepared.baseRootDigest = 'd'.repeat(64);
    expect(session.head).toMatchObject({ revision: 0, undoCount: 0 }); expect(firstElevation(session)).toBe(-100);
    session.publishReplacement(fixed.candidateId, valid); expect(firstElevation(session)).toBe(260); expect(session.head).toMatchObject({ revision: 1, undoCount: 1, manifestDigest: fixed.manifestDigest });
    expect(session.metadata.name).toBe(large.manifest.name); expect(session.readLocks()).toEqual(originalLocks);
    const undo = await session.prepareReplacementUndo(commandId(), noWait); session.publishReplacement(undo.candidateId, receipt(session, undo));
    expect(firstElevation(session)).toBe(-100); expect(session.head.undoCount).toBe(0); expect(session.readLocks()).toEqual(originalLocks);
  }, 30000);

  it('cancels real cooperative candidate validation with no pending authority or new undo entry', async () => {
    const session = await OwnedAtlasSession.open(small, rootDigest(0), noWait), initial = await session.prepare(localCommand(session, 33), noWait); session.publish(initial.candidateId, receipt(session, initial));
    const before = session.head, aborter = new AbortController(); let yielded = 0;
    await expect(session.prepareReplacement(await replacement(session, small, 400), commandId(), '取消未确认替换', { signal: aborter.signal, yieldTask: async () => { yielded++; aborter.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(yielded).toBe(1); expect(session.head).toEqual(before); expect(session.replacementPending).toBe(false); expect(firstElevation(session)).toBe(33); expect(session.undoKind).toBe('patch');
    const retry = await session.prepareReplacement(await replacement(session, small, 401), commandId(), '明确新候选', noWait); session.discardReplacement(retry.candidateId); expect(session.head).toEqual(before);
  });
});
