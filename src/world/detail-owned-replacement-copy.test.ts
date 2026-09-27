import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as AtlasFormat from './atlas-format';
import * as DetailCodec from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastSampleTile } from './detail-coast-types';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { getCellLayerSlot, getVertexSlot } from './model';
import { OwnedAtlasSession, type AtlasEditControl, type AtlasPublishedRoot, type PreparedAtlasReplacement } from './transactions';
import type { AtlasDetailCoastDocument } from './generation-contract';

const fast = { yieldTask: async () => {} }, initialRoot = 'a'.repeat(64);
const fineCopyStage = '复制完整候选细海岸';
let fixture: AtlasDetailCoastDocument;

function sampled(data: AtlasDetailCoastDocument, key = detailCoastKey(0, 0)): DetailCoastSampleTile {
  const tile = data.detailCoast.get(key);
  if (!tile || tile.mode !== 'samples') throw new Error('Expected a synthetic sampled tile');
  return tile;
}

beforeAll(async () => {
  fixture = await AtlasFormat.createGenerationDraft({ size: 128, name: '私有候选分批导出合成测试', seed: 'owned-replacement-copy' }, fast, 4);
  // Reuse the existing private-ingress fixture layout: 33 real sampled tiles,
  // including a west/north owner layout and the opposite world corner.
  // This is an ownership/codec fixture, not generated terrain acceptance.
  for (let index = 0; index < 33; index++) {
    const bx = index < 32 ? index : 63, by = index < 32 ? 0 : 63;
    const count = detailCoastOwnerLayout(bx, by).count;
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples',
      coverageQ: new Int16Array(count).fill(-512), elevationMeters: new Int16Array(count).fill(-500 - index) } as const;
    fixture.detailCoast.set(detailCoastKey(bx, by), tile);
    fixture.manifest.detailCoast.refs.push({ bx, by, hash: await DetailCodec.hashDetailCoastTile(tile) });
  }
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 3, by: 3, flags: new Uint8Array(1024) } as const;
  lock.flags[1023] = 1;
  fixture.locks.set(lockKey(lock.bx, lock.by), lock);
  fixture.manifest.constraints.lockRefs = [{ bx: 3, by: 3, hash: await hashAtlasCellLockBlock(lock) }];
  await AtlasFormat.verifyAtlasDocument(fixture, fast);
}, 30000);
afterEach(() => vi.restoreAllMocks());

async function candidateData(heightDelta = 1) {
  const next = structuredClone(fixture);
  next.manifest.revision++;
  sampled(next).elevationMeters[0] += heightDelta;
  next.manifest.detailCoast.refs[0].hash = await DetailCodec.hashDetailCoastTile(sampled(next));
  return next;
}
async function setup() {
  const session = await OwnedAtlasSession.open(fixture, initialRoot, fast);
  const next = await candidateData();
  const prepared = await session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '合成候选导出测试', fast);
  return { session, next, prepared, head: session.head, expected: structuredClone(next) };
}
function receipt(prepared: PreparedAtlasReplacement): AtlasPublishedRoot {
  // Synthetic publication receipt tests Owned's identity contract only.
  // No IDB durability or real commit is claimed by this test file.
  return { draftId: fixture.manifest.draftId, commandId: prepared.commandId, revision: prepared.revision,
    manifestDigest: prepared.manifestDigest, rootDigest: 'b'.repeat(64) };
}
function pauseAtFirstFineBatch() {
  let reach!: () => void, release!: () => void, waiting = false, paused = false;
  const reached = new Promise<void>(resolve => { reach = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const control: AtlasEditControl = {
    onProgress: progress => { if (progress.stage === fineCopyStage && progress.completed === 16) waiting = true; },
    yieldTask: async () => { if (waiting && !paused) { paused = true; reach(); await released; } },
  };
  return { control, reached, release: () => release() };
}

describe('owned replacement export with bounded independent copies', () => {
  it('copies 33 sampled tiles as 16/16/1 across real tasks without reopening public raw ingress', async () => {
    const { session, prepared, expected, head } = await setup();
    const publicClone = vi.spyOn(AtlasFormat, 'cloneVerifiedAtlasDocument');
    const tileClone = vi.spyOn(DetailCodec, 'cloneDetailCoastTile');
    const batches: number[] = [], timers: number[] = [], clonedAtYield: number[] = [];
    const actual = await session.replacementDocumentAsync(prepared.candidateId, {
      onProgress: progress => {
        if (progress.stage !== fineCopyStage) return;
        expect(progress.total).toBe(33);
        // A preceding timer must run before the next batch is observable.
        expect(timers).toEqual(batches);
        batches.push(progress.completed); clonedAtYield.push(tileClone.mock.calls.length);
        setTimeout(() => timers.push(progress.completed), 0);
      },
    });
    expect(batches).toEqual([16, 32, 33]); expect(clonedAtYield).toEqual(batches); expect(timers).toEqual(batches);
    expect(publicClone).not.toHaveBeenCalled();
    expect(actual).toEqual(expected); expect(session.head).toEqual(head); expect(session.replacementPending).toBe(true);
    await AtlasFormat.verifyAtlasDocument(actual, fast);
  });

  it('observes a timer-delivered cancellation between fine batches and retains the candidate for retry', async () => {
    const { session, prepared, expected, head } = await setup(), controller = new AbortController();
    const batches: number[] = [];
    await expect(session.replacementDocumentAsync(prepared.candidateId, {
      signal: controller.signal,
      onProgress: progress => {
        if (progress.stage !== fineCopyStage) return;
        batches.push(progress.completed);
        if (progress.completed === 32) setTimeout(() => controller.abort(), 0);
      },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(batches).toEqual([16, 32]); expect(session.head).toEqual(head); expect(session.replacementPending).toBe(true);
    expect(await session.replacementDocumentAsync(prepared.candidateId, fast)).toEqual(expected);
  });

  it.each(['discard', 'publish'] as const)('rejects an in-flight export when the candidate is removed by %s', async action => {
    const { session, prepared, expected, head } = await setup(), pause = pauseAtFirstFineBatch();
    const pending = session.replacementDocumentAsync(prepared.candidateId, pause.control);
    const rejected = expect(pending).rejects.toThrow(/候选.*失效|候选.*变化/);
    await pause.reached;
    try {
      if (action === 'discard') session.discardReplacement(prepared.candidateId);
      else session.publishReplacement(prepared.candidateId, receipt(prepared));
    } finally { pause.release(); }
    await rejected;
    expect(session.replacementPending).toBe(false);
    if (action === 'discard') { expect(session.head).toEqual(head); expect(session.snapshot()).toEqual(fixture); }
    else { expect(session.head.revision).toBe(1); expect(session.snapshot()).toEqual(expected); }
  });

  it('does not return an old export after a different valid candidate replaces it during a yield', async () => {
    const { session, prepared, head } = await setup(), pause = pauseAtFirstFineBatch();
    const pending = session.replacementDocumentAsync(prepared.candidateId, pause.control);
    const rejected = expect(pending).rejects.toThrow(/候选.*失效|候选.*变化/);
    await pause.reached;
    let replacement!: PreparedAtlasReplacement, next!: AtlasDetailCoastDocument;
    try {
      session.discardReplacement(prepared.candidateId); next = await candidateData(2);
      replacement = await session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '替代合成候选', fast);
    } finally { pause.release(); }
    await rejected;
    expect(replacement.candidateId).not.toBe(prepared.candidateId); expect(session.head).toEqual(head);
    expect(await session.replacementDocumentAsync(replacement.candidateId, fast)).toEqual(next);
  });

  it('isolates caller input, returned maps, both fine arrays, coarse arrays, locks and manifest', async () => {
    const { session, prepared, next, expected, head } = await setup();
    // Public prepare already owns next before this method is entered.
    next.manifest.name = 'caller changed'; sampled(next).elevationMeters.fill(-17); next.detailCoast.clear(); next.locks.clear();
    const first = await session.replacementDocumentAsync(prepared.candidateId, fast);
    expect(first).toEqual(expected);
    const second = await session.replacementDocumentAsync(prepared.candidateId, fast);
    expect(first.blocks).not.toBe(second.blocks); expect(first.locks).not.toBe(second.locks); expect(first.detailCoast).not.toBe(second.detailCoast);
    expect(sampled(first).coverageQ.buffer).not.toBe(sampled(second).coverageQ.buffer);
    expect(sampled(first).elevationMeters.buffer).not.toBe(sampled(second).elevationMeters.buffer);
    sampled(first).coverageQ.fill(511); sampled(first).elevationMeters.fill(999);
    getCellLayerSlot(first, 'elevation', 100).block.values.fill(9000);
    getVertexSlot(first, 0).block.xyQ.fill(0);
    first.locks.get(lockKey(3, 3))!.flags.fill(0); first.manifest.name = 'export changed';
    first.manifest.detailCoast.refs[0].hash = '0'.repeat(64); first.detailCoast.clear(); first.blocks.clear(); first.locks.clear();
    expect(second).toEqual(expected); expect(await session.replacementDocumentAsync(prepared.candidateId, fast)).toEqual(expected);
    expect(session.head).toEqual(head); expect(session.snapshot()).toEqual(fixture);
  });

  it('still performs real full-reference hash verification after the last copied batch', async () => {
    const { session, prepared, expected, head } = await setup(), original = DetailCodec.cloneDetailCoastTile;
    const clone = vi.spyOn(DetailCodec, 'cloneDetailCoastTile').mockImplementation(tile => {
      const copy = original(tile);
      if (copy.bx === 63 && copy.by === 63 && copy.mode === 'samples') copy.elevationMeters[0] -= 1;
      return copy;
    });
    await expect(session.replacementDocumentAsync(prepared.candidateId, fast)).rejects.toThrow('细海岸块 coast:63:63 完整摘要不符');
    clone.mockRestore();
    expect(session.head).toEqual(head); expect(session.replacementPending).toBe(true);
    expect(await session.replacementDocumentAsync(prepared.candidateId, fast)).toEqual(expected);
  });

  it('propagates a copy scheduler rejection without publishing or discarding the private candidate', async () => {
    const { session, prepared, expected, head } = await setup(), failure = new Error('synthetic scheduler failure');
    let fail = false;
    await expect(session.replacementDocumentAsync(prepared.candidateId, {
      onProgress: progress => { if (progress.stage === fineCopyStage) fail = true; },
      yieldTask: async () => { if (fail) throw failure; },
    })).rejects.toBe(failure);
    expect(session.head).toEqual(head); expect(session.replacementPending).toBe(true);
    expect(await session.replacementDocumentAsync(prepared.candidateId, fast)).toEqual(expected);
  });
});
