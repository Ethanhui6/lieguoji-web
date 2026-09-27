import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGenerationDraft, hashAtlasManifest, verifyAtlasDocument } from './atlas-format';
import * as DetailCodec from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastSampleTile } from './detail-coast-types';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { sampleDetailCoastNode } from './detail-coast-field';
import { getCellLayerSlot, hashBlock } from './model';
import { hashAtlasCellLockBlock, hashAtlasLockSet, lockKey } from './generation-locks';
import type { AtlasDetailCoastDocument } from './generation-contract';
import { OwnedAtlasSession } from './transactions';
import { buildHydrologyKernel, HYDROLOGY_STATUS, NO_WATER } from './hydrology-kernel';
import { extractOwnedHydrologySnapshot, type HydrologyNodeRectangle, type HydrologySnapshotRequest } from './hydrology-snapshot';

const fast = { yieldTask: async () => {} }, root = 'a'.repeat(64);
const patch: HydrologyNodeRectangle = { originColumn: 26, originRow: 10, columns: 16, rows: 8 };
let fixture: AtlasDetailCoastDocument;
const sampled = (data: AtlasDetailCoastDocument, bx = 0) => data.detailCoast.get(detailCoastKey(bx, 0)) as DetailCoastSampleTile;
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '水文权威细地形合成测试', seed: 'hydrology-authoritative-snapshot' }, fast, 4);
  // Real persisted coarse geometry is retained. Distinct coarse elevation
  // makes accidental substitution for explicit fine heights detectable.
  for (let id = 0; id < 128 ** 2; id++) { const { block, slot } = getCellLayerSlot(fixture, 'elevation', id); block.values[slot] = 200 + id % 128 * 2 + Math.floor(id / 128); }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  for (let bx = 0; bx < 2; bx++) {
    const layout = detailCoastOwnerLayout(bx, 0), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let i = 0; i < layout.count; i++) {
      const x = layout.startX + i % layout.width, y = Math.floor(i / layout.width), sea = x >= 29 && x <= 34;
      coverageQ[i] = sea ? -512 : 512; elevationMeters[i] = sea ? -200 : 600 + (x < 29 ? 29 - x : x - 34) * 10 + y;
    }
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by: 0, mode: 'samples', coverageQ, elevationMeters } as const;
    fixture.detailCoast.set(detailCoastKey(bx, 0), tile); fixture.manifest.detailCoast.refs.push({ bx, by: 0, hash: await DetailCodec.hashDetailCoastTile(tile) });
  }
  const land = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 2, by: 0, mode: 'land' } as const;
  fixture.detailCoast.set(detailCoastKey(2, 0), land); fixture.manifest.detailCoast.refs.push({ bx: 2, by: 0, hash: await DetailCodec.hashDetailCoastTile(land) });
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) } as const;
  lock.flags[1] = 3; lock.flags[34] = 1; fixture.locks.set(lockKey(0, 0), lock);
  fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }];
  await verifyAtlasDocument(fixture, fast);
}, 30000);
afterEach(() => vi.restoreAllMocks());
async function setup() { const input = structuredClone(fixture), session = await OwnedAtlasSession.open(input, root, fast); return { session, input }; }
function request(session: OwnedAtlasSession, rectangle = patch): HydrologySnapshotRequest {
  const { draftId, revision, manifestDigest, rootDigest } = session.head;
  return { expected: { draftId, revision, manifestDigest, rootDigest }, rectangle: { ...rectangle } };
}

describe('authoritative owned v4 hydrology snapshot', () => {
  it('reads exact 2-world owners and keeps a canonical 12-world sea channel across a fine tile seam', async () => {
    const { session } = await setup(), head = session.head, actual = await extractOwnedHydrologySnapshot(session, request(session), fast);
    expect(actual.source).toEqual({ ...request(session).expected, version: 4, atlasId: fixture.manifest.atlasId, lockSetDigest: await hashAtlasLockSet(fixture.manifest.constraints, fixture.manifest.spec), rootBinding: 'current-owned-session-head' });
    expect(actual.stats).toEqual({ sampledNodes: 128, explicitFineNodes: 128, uniformLandNodes: 0, implicitSeaNodes: 0, baseSamplerPrepared: false, outputTypedArrayBytes: 512, sourceCoarseCells: 16384 });
    expect(actual.locks.lockedCoarseCells).toBe(2); expect(actual.locks.refs).toEqual(fixture.manifest.constraints.lockRefs);
    const expectedField = { tiles: fixture.detailCoast, sampleBaseElevation: () => { throw new Error('explicit nodes must not use coarse fallback'); } };
    for (let i = 0; i < 128; i++) { const node = sampleDetailCoastNode(expectedField, 26 + i % 16, 10 + Math.floor(i / 16)); expect(actual.kernelInput.coverageQ[i]).toBe(node.coverageQ); expect(actual.kernelInput.groundMeters[i]).toBe(node.heightMeters); }
    const result = await buildHydrologyKernel(actual.kernelInput, {}, { yieldControl: async () => {} });
    expect(result.stats.landNodes).toBe(80);
    for (let i = 0; i < result.receiver.length; i++) {
      const x = 26 + i % 16, receiver = result.receiver[i];
      if (x >= 29 && x <= 34) { expect(result.drainageStatus[i]).toBe(HYDROLOGY_STATUS.excluded); continue; }
      // The observed terminal is real ocean, but each basin touches this
      // cropped window: all dependent samples remain unresolved by contract.
      expect(result.drainageStatus[i]).toBe(HYDROLOGY_STATUS.unresolved);
      expect(result.basins.terminalKind[result.basinId[i]]).toBe(HYDROLOGY_STATUS.ocean);
      expect(result.basins.partial[result.basinId[i]]).toBe(1);
      if (receiver >= 0) expect((26 + receiver % 16 < 29)).toBe(x < 29);
      const outlet = result.basins.coastXQ[result.basinId[i]] / 256; expect(outlet).toBe(x < 29 ? 57 : 69);
      expect(result.lakeWaterSurfaceMeters[i]).toBe(NO_WATER);
    }
    expect(session.head).toEqual(head);
  });

  it('uses persisted coarse-height semantics only for uniform land and omitted sea, including unique owners on seams', async () => {
    const { session } = await setup(), coarse = await extractDetailCoastBase(fixture, fast);
    const field = { tiles: fixture.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(coarse.size, coarse.centersQ, coarse.elevationsMeters) };
    for (const originColumn of [62, 95]) {
      const rectangle = { originColumn, originRow: 10, columns: 6, rows: 3 }, actual = await extractOwnedHydrologySnapshot(session, request(session, rectangle), fast);
      expect(actual.stats.baseSamplerPrepared).toBe(true);
      for (let i = 0; i < 18; i++) { const node = sampleDetailCoastNode(field, originColumn + i % 6, 10 + Math.floor(i / 6)); expect(actual.kernelInput.coverageQ[i]).toBe(node.coverageQ); expect(actual.kernelInput.groundMeters[i]).toBe(node.heightMeters); }
      if (originColumn === 62) { expect(actual.stats.explicitFineNodes).toBe(9); expect(actual.stats.uniformLandNodes).toBe(9); expect(actual.kernelInput.groundMeters[2]).toBeGreaterThan(600); expect(actual.kernelInput.groundMeters[3]).toBeLessThan(300); }
      else { expect(actual.stats.uniformLandNodes).toBe(6); expect(actual.stats.implicitSeaNodes).toBe(12); expect(actual.kernelInput.coverageQ[2]).toBe(-32767); expect(actual.kernelInput.groundMeters[2]).toBe(-1); }
    }
  });

  it('reports true crop/world edges without inventing an outlet beyond the world', async () => {
    const { session } = await setup(), actual = await extractOwnedHydrologySnapshot(session, request(session, { originColumn: 2046, originRow: 2046, columns: 3, rows: 3 }), fast);
    expect(actual.boundary).toEqual({ west: 'crop', north: 'crop', east: 'world', south: 'world', hydrologyBoundaryPolicy: 'unresolved-land-edge' });
    expect([...actual.kernelInput.coverageQ]).toEqual(Array(9).fill(-32767));
    const result = await buildHydrologyKernel(actual.kernelInput, {}, { yieldControl: async () => {} }); expect(result.stats.basinCount).toBe(0);
  });

  it('rejects wrong identities, malformed/accessor requests and over-budget ranges before source copying', async () => {
    const { session } = await setup(), spy = vi.spyOn(session, 'snapshotAsync');
    for (const rectangle of [{ ...patch, columns: 513 }, { ...patch, originColumn: 2048 }, { ...patch, rows: 1 }, { ...patch, originRow: -1 }]) await expect(extractOwnedHydrologySnapshot(session, request(session, rectangle), fast)).rejects.toThrow();
    for (const part of [{ draftId: 'wrong' }, { revision: 1 }, { manifestDigest: 'b'.repeat(64) }, { rootDigest: 'b'.repeat(64) }]) { const req = request(session); Object.assign(req.expected, part); await expect(extractOwnedHydrologySnapshot(session, req, fast)).rejects.toThrow('来源会话已变化'); }
    const req = request(session), getter = vi.fn(() => patch); Object.defineProperty(req, 'rectangle', { get: getter, enumerable: true });
    await expect(extractOwnedHydrologySnapshot(session, req, fast)).rejects.toThrow('请求身份'); expect(getter).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
  });

  it('rejects legacy geography rather than treating coarse cells as fine hydrology nodes', async () => {
    const legacy = await createGenerationDraft({ size: 128, name: '旧版隔离', seed: 'old' }, fast, 3), session = await OwnedAtlasSession.open(legacy, root, fast);
    await expect(extractOwnedHydrologySnapshot(session, request(session), fast)).rejects.toThrow('第四版');
  });

  it('isolates caller documents, captured requests, returned arrays and lock references across callbacks', async () => {
    const { session, input } = await setup(), req = request(session), head = session.head; let changed = false;
    const actual = await extractOwnedHydrologySnapshot(session, req, { ...fast, onProgress: () => { if (changed) return; changed = true; sampled(input).elevationMeters.fill(0); input.blocks.clear(); input.locks.clear(); req.rectangle.columns = 2; req.expected.revision = 99; } });
    expect(actual.kernelInput.columns).toBe(16); expect(actual.source.revision).toBe(0); expect(actual.kernelInput.groundMeters[0]).toBe(640);
    actual.kernelInput.coverageQ.fill(-512); actual.kernelInput.groundMeters.fill(-200); actual.locks.refs[0].hash = '0'.repeat(64);
    const again = await extractOwnedHydrologySnapshot(session, request(session), fast); expect(again.kernelInput.groundMeters[0]).toBe(640); expect(again.kernelInput.coverageQ[0]).toBe(512);
    expect(again.locks.refs).toEqual(fixture.manifest.constraints.lockRefs); expect(session.head).toEqual(head);
  });

  it.each(['复制生成草稿分层与锁', '水文抽取：读取实际节点所有者', '水文抽取：采样权威细地形'])('cancels at %s without changing the private source', async stage => {
    const { session } = await setup(), head = session.head, controller = new AbortController(); let reached = false;
    await expect(extractOwnedHydrologySnapshot(session, request(session), { ...fast, signal: controller.signal, onProgress: progress => { if (progress.stage === stage) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(session.head).toEqual(head); expect(await hashAtlasManifest((await session.snapshotAsync(fast)).manifest)).toBe(head.manifestDigest);
  });

  it('propagates callback/scheduler failure and rejects a corrupted copied tile hash', async () => {
    const { session } = await setup(), head = session.head, failure = new Error('deliberate scheduler failure');
    await expect(extractOwnedHydrologySnapshot(session, request(session), { yieldTask: async () => { throw failure; } })).rejects.toBe(failure);
    await expect(extractOwnedHydrologySnapshot(session, request(session), { ...fast, onProgress: p => { if (p.stage.startsWith('水文抽取')) throw failure; } })).rejects.toBe(failure);
    const original = DetailCodec.cloneDetailCoastTile;
    vi.spyOn(DetailCodec, 'cloneDetailCoastTile').mockImplementation(tile => { const copy = original(tile); if (copy.mode === 'samples') copy.elevationMeters[0]++; return copy; });
    await expect(extractOwnedHydrologySnapshot(session, request(session), fast)).rejects.toThrow('完整摘要不符'); vi.restoreAllMocks();
    expect(session.head).toEqual(head); expect(await session.snapshotAsync(fast)).toEqual(fixture);
  });

  it('rejects an actual source publication after snapshot export and during sampling', async () => {
    const { session } = await setup(), next = structuredClone(fixture); next.manifest.revision++;
    const prepared = await session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '水文来源变化测试', fast); let published = false;
    await expect(extractOwnedHydrologySnapshot(session, request(session), { ...fast, onProgress: p => {
      if (p.stage !== '水文抽取：采样权威细地形' || published) return; published = true;
      session.publishReplacement(prepared.candidateId, { draftId: fixture.manifest.draftId, commandId: prepared.commandId, revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest: 'b'.repeat(64) });
    } })).rejects.toThrow('水文来源会话已变化');
    expect(published).toBe(true); expect(session.head.revision).toBe(1); expect(await session.snapshotAsync(fast)).toEqual(next);
  });
});
