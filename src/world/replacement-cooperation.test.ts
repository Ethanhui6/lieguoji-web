import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as geography from './model';
import * as format from './atlas-format';
import * as locks from './generation-locks';
import { OwnedAtlasSession, type AtlasConstraintEdit, type AtlasPublishedRoot, type PreparedAtlasReplacement } from './transactions';

const fast = { yieldTask: async () => {} }, root = 'a'.repeat(64), accountingStage = '核算完整地图撤销字节';
const commandId = () => `edit-${crypto.randomUUID()}`;
let source: format.AtlasGenerationDocument<3>;
beforeAll(async () => {
  source = await format.createGenerationDraft({ size: 128, seed: 'replacement-cooperation-v3', name: '完整替换真实字节计账' }, fast, 3);
  for (const [bx, by] of [[0, 0], [1, 1], [3, 3]]) {
    const lock: format.AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) };
    lock.flags[1023] = 3; source.locks.set(locks.lockKey(bx, by), lock);
    source.manifest.constraints.lockRefs.push({ bx, by, hash: await locks.hashAtlasCellLockBlock(lock) });
  }
});
afterEach(() => { vi.restoreAllMocks(); });

function replacement(session: OwnedAtlasSession<format.AtlasGenerationDocument<3>>) {
  const manifest = session.manifest() as format.AtlasGenerationDocument<3>['manifest']; manifest.revision++;
  return { manifest, blocks: source.blocks, locks: source.locks };
}
function lockCommand(session: OwnedAtlasSession): AtlasConstraintEdit {
  const head = session.head;
  return { format: 'lieguoji-atlas-constraint-edit', version: 1, draftId: head.draftId, commandId: commandId(), expectedRevision: head.revision, expectedRootDigest: head.rootDigest,
    rectangle: { column: 0, row: 0, columns: 1, rows: 1 }, mask: 1, action: 'set' };
}
/** This is an owned-session publication receipt, not an IndexedDB test. */
const receipt = (session: OwnedAtlasSession, prepared: PreparedAtlasReplacement): AtlasPublishedRoot => ({ draftId: session.head.draftId, commandId: prepared.commandId,
  revision: prepared.revision, rootDigest: prepared.revision.toString(16).padStart(64, '0'), manifestDigest: prepared.manifestDigest });

describe('cooperative exact whole-map undo accounting', () => {
  it('reports only completed canonical manifest, block and lock encodings in bounded batches', async () => {
    const session = await OwnedAtlasSession.open(source, root, fast), before = session.head;
    const expectedBytes = format.encodeAtlasManifest(session.manifest()).length
      + [...source.blocks.values()].reduce((sum, block) => sum + geography.encodeBlock(block).length, 0)
      + [...source.locks.values()].reduce((sum, block) => sum + locks.encodeAtlasCellLockBlock(block).length, 0);
    const manifestEncode = vi.spyOn(format, 'encodeAtlasManifest'), blockEncode = vi.spyOn(geography, 'encodeBlock'), lockEncode = vi.spyOn(locks, 'encodeAtlasCellLockBlock');
    const progress: { completed: number; total: number; encodedObjects: number; bytes: number }[] = [];
    const encoded = () => [...manifestEncode.mock.results, ...blockEncode.mock.results, ...lockEncode.mock.results];
    const prepared = await session.prepareReplacement(replacement(session), commandId(), '核算真实完整基线', {
      ...fast, onProgress: value => {
        if (value.stage === accountingStage) progress.push({ ...value, encodedObjects: encoded().length, bytes: encoded().reduce((sum, result) => sum + (result.value as Uint8Array).length, 0) });
      },
    });
    const total = 1 + source.blocks.size + source.locks.size;
    expect(progress.map(value => value.completed)).toEqual([8, 16, 24, 32, 40, 48, 56, 64, total]);
    for (const value of progress) { expect(value.total).toBe(total); expect(value.encodedObjects).toBe(value.completed); }
    expect(progress.at(-1)!.bytes).toBe(expectedBytes);
    expect(manifestEncode).toHaveBeenCalledTimes(1); expect(manifestEncode.mock.calls[0][0].revision).toBe(0);
    expect(blockEncode).toHaveBeenCalledTimes(source.blocks.size); expect(lockEncode).toHaveBeenCalledTimes(source.locks.size);
    expect(session.head).toEqual(before); expect(session.readLocks()).toEqual([...source.locks.values()]);
    session.discardReplacement(prepared.candidateId); expect(session.replacementPending).toBe(false); expect(session.head).toEqual(before);
  });

  it.each(['first batch', 'last batch'])('cancels during the %s of real accounting without pending authority, consumed history or reentry', async boundary => {
    const session = await OwnedAtlasSession.open(source, root, fast), before = session.head, beforeManifest = format.encodeAtlasManifest(session.manifest()), beforeLocks = session.readLocks();
    const controller = new AbortController(), target = boundary === 'first batch' ? 8 : 1 + source.blocks.size + source.locks.size;
    const batches: number[] = []; let accountingReached = false, cancelled = false;
    await expect(session.prepareReplacement(replacement(session), commandId(), '计账中取消', {
      signal: controller.signal,
      onProgress: value => { if (value.stage === accountingStage) { batches.push(value.completed); accountingReached = value.completed === target; } },
      yieldTask: async () => {
        if (!accountingReached) return;
        expect(session.replacementPending).toBe(false); expect(session.head).toEqual(before);
        await expect(session.prepareReplacement(replacement(session), commandId(), '计账重入', fast)).rejects.toThrow('已有一笔');
        await expect(session.prepareConstraints(lockCommand(session), fast)).rejects.toThrow('已有一笔');
        cancelled = true; controller.abort();
      },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true); expect(batches.at(-1)).toBe(target); if (boundary === 'first batch') expect(batches).toEqual([8]);
    expect(session.head).toEqual(before); expect(session.replacementPending).toBe(false); expect(session.undoKind).toBeNull();
    expect(format.encodeAtlasManifest(session.manifest())).toEqual(beforeManifest); expect(session.readLocks()).toEqual(beforeLocks);
    const retry = await session.prepareReplacement(replacement(session), commandId(), '取消后有效替换', fast);
    session.publishReplacement(retry.candidateId, receipt(session, retry)); expect(session.head.undoCount).toBe(1);
    const undoProgress: string[] = [], undo = await session.prepareReplacementUndo(commandId(), { ...fast, onProgress: value => { undoProgress.push(value.stage); } });
    expect(undoProgress).not.toContain(accountingStage); session.publishReplacement(undo.candidateId, receipt(session, undo));
    expect(session.head.undoCount).toBe(0); expect(session.undoKind).toBeNull(); expect(session.readLocks()).toEqual(beforeLocks);
    expect(session.manifest().blockRefs).toEqual(source.manifest.blockRefs);
  });
});
