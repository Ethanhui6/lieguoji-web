import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as AtlasFormat from './atlas-format';
import * as DetailCodec from './detail-coast-codec';
import * as Model from './model';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastSampleTile } from './detail-coast-types';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { OwnedAtlasSession, type AtlasEditControl, type AtlasPublishedRoot, type PreparedAtlasReplacement } from './transactions';
import type { AtlasDetailCoastDocument } from './generation-contract';

const fast = { yieldTask: async () => {} }, initialRoot = 'a'.repeat(64);
const blockCopyStage = '复制生成草稿分层与锁', fineCopyStage = '复制草稿细海岸';
let fixture: AtlasDetailCoastDocument;

function sampled(data: AtlasDetailCoastDocument, key = detailCoastKey(0, 0)): DetailCoastSampleTile {
  const tile = data.detailCoast.get(key);
  if (!tile || tile.mode !== 'samples') throw new Error('Expected a synthetic sampled tile');
  return tile;
}

beforeAll(async () => {
  fixture = await AtlasFormat.createGenerationDraft({ size: 128, name: '私有快照分批导出合成测试', seed: 'owned-snapshot-copy' }, fast, 4);
  // Same 33-owner layout as the existing private-ingress/replacement fixtures.
  // These are synthetic ownership/codec values, not natural-terrain acceptance.
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

async function setup() {
  const input = structuredClone(fixture);
  const session = await OwnedAtlasSession.open(input, initialRoot, fast);
  return { session, input, head: session.head, expected: structuredClone(fixture) };
}
async function prepareNext(session: OwnedAtlasSession<AtlasDetailCoastDocument>) {
  const next = structuredClone(fixture); next.manifest.revision++;
  sampled(next).elevationMeters[0] += 1;
  next.manifest.detailCoast.refs[0].hash = await DetailCodec.hashDetailCoastTile(sampled(next));
  const prepared = await session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '快照来源变化合成测试', fast);
  return { next, prepared };
}
function receipt(prepared: PreparedAtlasReplacement): AtlasPublishedRoot {
  // This synthetic receipt exercises Owned publication only, not IDB durability.
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

describe('owned snapshot export with guarded bounded copies', () => {
  it('yields after 16 coarse blocks before cloning fine data, then copies 33 fine tiles as 16/16/1 across real tasks', async () => {
    const { session, expected, head } = await setup();
    const publicClone = vi.spyOn(AtlasFormat, 'cloneVerifiedAtlasDocument');
    const blockClone = vi.spyOn(Model, 'cloneBlock'), tileClone = vi.spyOn(DetailCodec, 'cloneDetailCoastTile');
    const batches: number[] = [], timers: number[] = [], clonedAtYield: number[] = [], stages: string[] = [];
    const actual = await session.snapshotAsync({ onProgress: progress => {
      stages.push(progress.stage);
      if (stages.length === 1) {
        expect(progress).toEqual({ stage: blockCopyStage, completed: 16, total: expected.blocks.size });
        expect(blockClone).toHaveBeenCalledTimes(16); expect(tileClone).not.toHaveBeenCalled();
      }
      if (progress.stage !== fineCopyStage) return;
      expect(progress.total).toBe(33); expect(timers).toEqual(batches);
      batches.push(progress.completed); clonedAtYield.push(tileClone.mock.calls.length);
      setTimeout(() => timers.push(progress.completed), 0);
    } });
    expect(batches).toEqual([16, 32, 33]); expect(clonedAtYield).toEqual(batches); expect(timers).toEqual(batches);
    expect(stages).toContain('核验共享地理与跨块邻接'); expect(stages).toContain('核验细海岸内容摘要');
    expect(publicClone).not.toHaveBeenCalled(); expect(actual).toEqual(expected); expect(session.head).toEqual(head);
    await AtlasFormat.verifyAtlasDocument(actual, fast);
  });

  it('honours an active-operation abort delivered by a real timer between fine batches and leaves the source reusable', async () => {
    const { session, expected, head } = await setup(), controller = new AbortController();
    const batches: number[] = [];
    // Worker.close uses active.control.abort(); this tests that same signal boundary.
    // It does not pretend Owned has an independent close/dispose API.
    await expect(session.snapshotAsync({ signal: controller.signal, onProgress: progress => {
      if (progress.stage !== fineCopyStage) return;
      batches.push(progress.completed);
      if (progress.completed === 32) setTimeout(() => controller.abort(), 0);
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(batches).toEqual([16, 32]); expect(session.head).toEqual(head);
    expect(await session.snapshotAsync(fast)).toEqual(expected);
  });

  it.each([fineCopyStage, '核验细海岸内容摘要'])('rejects reentrant publication from the %s progress callback', async stage => {
    const { session } = await setup(), { prepared, next } = await prepareNext(session);
    const tileClone = vi.spyOn(DetailCodec, 'cloneDetailCoastTile');
    let published = false;
    await expect(session.snapshotAsync({ ...fast, onProgress: progress => {
      if (published || progress.stage !== stage) return;
      published = true; session.publishReplacement(prepared.candidateId, receipt(prepared));
    } })).rejects.toThrow('复制期间草稿已变化');
    expect(published).toBe(true); expect(session.head.revision).toBe(1); expect(session.head.rootDigest).toBe('b'.repeat(64));
    expect(tileClone).toHaveBeenCalledTimes(stage === fineCopyStage ? 16 : 33);
    expect(await session.snapshotAsync(fast)).toEqual(next);
  });

  it('rejects a snapshot suspended across an awaited yield when its private source is published over', async () => {
    const { session } = await setup(), { prepared, next } = await prepareNext(session), pause = pauseAtFirstFineBatch();
    const pending = session.snapshotAsync(pause.control);
    const rejected = expect(pending).rejects.toThrow('复制期间草稿已变化');
    await pause.reached;
    try { session.publishReplacement(prepared.candidateId, receipt(prepared)); }
    finally { pause.release(); }
    await rejected;
    expect(session.head.revision).toBe(1); expect(await session.snapshotAsync(fast)).toEqual(next);
  });

  it('does not mistake discarding an unpublished candidate for a source mutation', async () => {
    const { session, expected, head } = await setup(), { prepared } = await prepareNext(session), pause = pauseAtFirstFineBatch();
    const pending = session.snapshotAsync(pause.control);
    await pause.reached;
    try { session.discardReplacement(prepared.candidateId); }
    finally { pause.release(); }
    expect(await pending).toEqual(expected); expect(session.head).toEqual(head); expect(session.replacementPending).toBe(false);
  });

  it('isolates caller input, returned maps, both fine arrays, coarse arrays, locks and manifest', async () => {
    const { session, input, expected, head } = await setup(); let callerChanged = false;
    const first = await session.snapshotAsync({ ...fast, onProgress: () => {
      if (callerChanged) return; callerChanged = true;
      input.manifest.name = 'late caller mutation'; sampled(input).elevationMeters.fill(-17);
      input.detailCoast.clear(); input.locks.clear(); input.blocks.clear();
    } });
    expect(first).toEqual(expected);
    const second = await session.snapshotAsync(fast);
    expect(first.blocks).not.toBe(second.blocks); expect(first.locks).not.toBe(second.locks); expect(first.detailCoast).not.toBe(second.detailCoast);
    expect(sampled(first).coverageQ.buffer).not.toBe(sampled(second).coverageQ.buffer);
    expect(sampled(first).elevationMeters.buffer).not.toBe(sampled(second).elevationMeters.buffer);
    expect(first.locks.get(lockKey(3, 3))!.flags.buffer).not.toBe(second.locks.get(lockKey(3, 3))!.flags.buffer);
    expect(Model.getCellLayerSlot(first, 'elevation', 100).block.values.buffer).not.toBe(Model.getCellLayerSlot(second, 'elevation', 100).block.values.buffer);
    expect(Model.getVertexSlot(first, 0).block.xyQ.buffer).not.toBe(Model.getVertexSlot(second, 0).block.xyQ.buffer);
    for (const [key, block] of first.blocks) {
      const other = second.blocks.get(key)!;
      const values = block.layer === 'geometry' ? block.xyQ : block.values;
      const otherValues = other.layer === 'geometry' ? other.xyQ : other.values;
      expect(values.buffer).not.toBe(otherValues.buffer); values.fill(1);
      if (block.layer === 'geometry' && other.layer === 'geometry') expect(block.vertexIds.buffer).not.toBe(other.vertexIds.buffer);
    }
    for (const [key, tile] of first.detailCoast) {
      if (tile.mode !== 'samples') continue;
      const other = sampled(second, key);
      expect(tile.coverageQ.buffer).not.toBe(other.coverageQ.buffer); expect(tile.elevationMeters.buffer).not.toBe(other.elevationMeters.buffer);
      tile.coverageQ.fill(511); tile.elevationMeters.fill(999);
    }
    sampled(first).coverageQ.fill(511); sampled(first).elevationMeters.fill(999);
    Model.getCellLayerSlot(first, 'elevation', 100).block.values.fill(9000); Model.getVertexSlot(first, 0).block.xyQ.fill(0);
    for (const block of first.blocks.values()) if (block.layer === 'geometry') block.vertexIds.fill(0);
    first.locks.get(lockKey(3, 3))!.flags.fill(0); first.manifest.name = 'export changed';
    first.manifest.detailCoast.refs[0].hash = '0'.repeat(64); first.detailCoast.clear(); first.blocks.clear(); first.locks.clear();
    expect(second).toEqual(expected); expect(await session.snapshotAsync(fast)).toEqual(expected); expect(session.head).toEqual(head);
  });

  it('still rejects a real final-tile digest mismatch after all copying, without damaging private source', async () => {
    const { session, expected, head } = await setup(), original = DetailCodec.cloneDetailCoastTile;
    const clone = vi.spyOn(DetailCodec, 'cloneDetailCoastTile').mockImplementation(tile => {
      const copy = original(tile);
      if (copy.bx === 63 && copy.by === 63 && copy.mode === 'samples') copy.elevationMeters[0] -= 1;
      return copy;
    });
    await expect(session.snapshotAsync(fast)).rejects.toThrow('细海岸块 coast:63:63 完整摘要不符');
    clone.mockRestore();
    expect(session.head).toEqual(head); expect(await session.snapshotAsync(fast)).toEqual(expected);
  });

  it.each(['progress', 'scheduler'] as const)('propagates a %s failure unchanged without publishing or damaging source', async origin => {
    const { session, expected, head } = await setup(), failure = new Error(`synthetic ${origin} failure`); let inFineBatch = false;
    await expect(session.snapshotAsync({
      onProgress: progress => {
        if (progress.stage !== fineCopyStage) return;
        inFineBatch = true; if (origin === 'progress') throw failure;
      },
      yieldTask: async () => { if (inFineBatch && origin === 'scheduler') throw failure; },
    })).rejects.toBe(failure);
    expect(session.head).toEqual(head); expect(await session.snapshotAsync(fast)).toEqual(expected);
  });

  it('retains the legacy v1 type, exact manifest bytes and detached buffers without reopening raw ingress', async () => {
    const legacy = await Model.createAtlasDraft({ size: 128, name: '旧格式私有快照', seed: 'owned-snapshot-v1' }, fast);
    const expectedManifest = Model.encodeManifest(legacy.manifest);
    const session = await OwnedAtlasSession.open(legacy, initialRoot, fast), publicClone = vi.spyOn(AtlasFormat, 'cloneVerifiedAtlasDocument');
    const actual: Model.AtlasDraftData = await session.snapshotAsync(fast);
    expect(publicClone).not.toHaveBeenCalled(); expect(actual).toEqual(legacy); expect(Model.encodeManifest(actual.manifest)).toEqual(expectedManifest);
    Model.getCellLayerSlot(actual, 'elevation', 100).block.values.fill(500);
    expect(await session.snapshotAsync(fast)).toEqual(legacy);
  });
});
