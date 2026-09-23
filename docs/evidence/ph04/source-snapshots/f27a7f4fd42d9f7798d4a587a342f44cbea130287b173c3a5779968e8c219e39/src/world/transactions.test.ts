import { beforeAll, describe, expect, it } from 'vitest';
import { cloneAtlasDraft, createAtlasDraft, getAdminLeaf, getCellLayerSlot, getSimRegion, getVertexSlot, hashManifest, verifyAtlasDraft, type AtlasDraftData } from './model';
import { cellIdAt, getVertexPositionQ, vertexIdAt } from './topology';
import { createSpatialIndex } from './spatial-index';
import { OwnedAtlasSession, encodeAtlasEditMessage, type AtlasEditCommand, type AtlasPatch, type PreparedAtlasEdit } from './transactions';

const root = 'a'.repeat(64), nextRoot = 'b'.repeat(64), noWait = { yieldTask: async () => {} };
let initial: AtlasDraftData;
beforeAll(async () => { initial = await createAtlasDraft({ size: 128, name: '事务核验草稿', seed: 'ph04-transactions' }, noWait); });
function command(session: OwnedAtlasSession, patch: AtlasPatch): AtlasEditCommand {
  const head = session.head;
  return { format: 'lieguoji-atlas-edit', version: 1, draftId: head.draftId, commandId: `edit-${crypto.randomUUID()}`, expectedRevision: head.revision, expectedRootDigest: head.rootDigest, reason: '跨块编辑', patch };
}
function receipt(session: OwnedAtlasSession, prepared: PreparedAtlasEdit, rootDigest = nextRoot) {
  return { draftId: session.head.draftId, commandId: prepared.commandId, revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest };
}
const elevation = (ids: number[], value = 120): AtlasPatch => ({ elevation: { ids: new Uint32Array(ids), values: new Int32Array(ids.length).fill(value) } });

describe('production owned atlas edits', () => {
  it('copies external state and rejects malformed or tampered inputs before trusting them', async () => {
    const raw = cloneAtlasDraft(initial), promise = OwnedAtlasSession.open(raw, root);
    getCellLayerSlot(raw, 'elevation', 0).block.values[0] = 900;
    const session = await promise;
    expect(getCellLayerSlot(session.snapshot(), 'elevation', 0).block.values[0]).toBe(-100);
    await expect(OwnedAtlasSession.open(raw, root)).rejects.toThrow();
    await expect(OwnedAtlasSession.open({ ...initial, futureDomain: 2 } as AtlasDraftData, root)).rejects.toThrow();
    const copy = session.snapshot(); getCellLayerSlot(copy, 'elevation', 0).block.values[0] = 400;
    expect(getCellLayerSlot(session.snapshot(), 'elevation', 0).block.values[0]).toBe(-100);
  });
  it('cancels full initialization before or during verified block loading without changing input', async () => {
    const before = initial.manifest.blockRefs.map(ref => ({ ...ref }));
    const already = new AbortController(); already.abort();
    await expect(OwnedAtlasSession.open(initial, root, { signal: already.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const during = new AbortController(); let progressCount = 0;
    await expect(OwnedAtlasSession.open(initial, root, { signal: during.signal, onProgress: () => { progressCount++; }, yieldTask: async () => during.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progressCount).toBe(1); expect(initial.manifest.blockRefs).toEqual(before);
  });
  it('prepares four actual data blocks without publishing; detached candidate exports cannot mutate the pending edit', async () => {
    const session = await OwnedAtlasSession.open(initial, root), spec = initial.manifest.spec;
    const ids = [cellIdAt(spec, 31, 31), cellIdAt(spec, 32, 31), cellIdAt(spec, 31, 32), cellIdAt(spec, 32, 32)];
    const edit = command(session, elevation(ids)), pending = session.prepare(edit, noWait);
    edit.patch.elevation!.values.fill(800); // After the first await, ingress was already copied.
    const prepared = await pending;
    expect(prepared.writeKeys).toHaveLength(4); expect(prepared.localBudgetEligible).toBe(true);
    expect(prepared.affectedCellCount).toBe(4); expect(session.head.revision).toBe(0);
    const exported = session.candidateBlocks(prepared.candidateId);
    for (const block of exported) if (block.layer === 'elevation') block.values.fill(777);
    const manifest = session.candidateManifest(prepared.candidateId); manifest.name = '外部篡改';
    expect(session.candidateManifest(prepared.candidateId).name).toBe(initial.manifest.name);
    expect(session.snapshot().manifest.revision).toBe(0);
    expect(() => session.publish(prepared.candidateId, { ...receipt(session, prepared), manifestDigest: 'c'.repeat(64) })).toThrow();
    const delta = session.publish(prepared.candidateId, receipt(session, prepared));
    expect(delta.rootDigest).toBe(nextRoot); expect(delta.baseRootDigest).toBe(root); expect(delta.baseRevision).toBe(0);
    expect(encodeAtlasEditMessage(delta).byteLength).toBe(prepared.responseBytes);
    const result = session.snapshot();
    for (const id of ids) { const target = getCellLayerSlot(result, 'elevation', id); expect(target.block.values[target.slot]).toBe(120); }
    expect(result.manifest.revision).toBe(1); await verifyAtlasDraft(result);
    expect(() => session.publish(prepared.candidateId, receipt(session, prepared))).toThrow();
    expect(await hashManifest(initial.manifest)).not.toBe(prepared.manifestDigest);
  });
  it('changes a shared corner once, includes all four display blocks, and undoes as a new revision', async () => {
    const session = await OwnedAtlasSession.open(initial, root), spec = initial.manifest.spec;
    const vertex = vertexIdAt(spec, 32, 32), old = getVertexPositionQ(initial, vertex);
    const p = await session.prepare(command(session, { vertices: { ids: new Uint32Array([vertex]), xyQ: new Int32Array([old.xQ + 96, old.yQ - 64]) } }), noWait);
    expect(p.writeKeys).toEqual(['geometry:0:0']); expect(p.displayBlocks).toEqual(['0:0', '0:1', '1:0', '1:1']);
    expect(p.affectedCellIds).toHaveLength(4); expect(p.geometryVertexIds).toEqual([vertex]);
    session.publish(p.candidateId, receipt(session, p));
    expect(getVertexPositionQ(session.snapshot(), vertex)).toEqual({ xQ: old.xQ + 96, yQ: old.yQ - 64 });
    const undo = await session.prepareUndo(`edit-${crypto.randomUUID()}`, noWait);
    expect(session.head.undoCount).toBe(1); session.publish(undo.candidateId, receipt(session, undo, 'c'.repeat(64)));
    expect(session.head.revision).toBe(2); expect(session.head.undoCount).toBe(0);
    expect(getVertexPositionQ(session.snapshot(), vertex)).toEqual(old);
    expect(session.snapshot().manifest.blockRefs).toEqual(initial.manifest.blockRefs);
    await verifyAtlasDraft(session.snapshot());
  });
  it('keeps simulation regions and administrative leaves independent through edits and recovery verification', async () => {
    const data = cloneAtlasDraft(initial);
    data.manifest.catalogs = { simRegions: [{ id: 1, name: '北部经济区' }, { id: 2, name: '南部经济区' }], administration: [{ id: 4, name: '总区', parentId: null, kind: 'branch' }, { id: 5, name: '甲县', parentId: 4, kind: 'leaf' }, { id: 6, name: '乙县', parentId: 4, kind: 'leaf' }] };
    const session = await OwnedAtlasSession.open(data, root);
    const first = await session.prepare(command(session, { simMembership: { ids: new Uint32Array([33, 34, 35]), values: new Uint32Array([1, 1, 2]) }, adminMembership: { ids: new Uint32Array([33, 34, 35]), values: new Uint32Array([5, 6, 5]) } }), noWait);
    session.publish(first.candidateId, receipt(session, first));
    const before = session.snapshot(), sims = before.manifest.blockRefs.filter(r => r.key.startsWith('sim-membership:'));
    expect([33, 34, 35].map(id => getSimRegion(before, id))).toEqual([1, 1, 2]);
    expect([33, 34, 35].map(id => getAdminLeaf(before, id))).toEqual([5, 6, 5]);
    const second = await session.prepare(command(session, { adminMembership: { ids: new Uint32Array([33]), values: new Uint32Array([6]) } }), noWait);
    session.publish(second.candidateId, receipt(session, second, 'c'.repeat(64)));
    expect(session.snapshot().manifest.blockRefs.filter(r => r.key.startsWith('sim-membership:'))).toEqual(sims);
    await verifyAtlasDraft(session.snapshot());
    await expect(session.prepare(command(session, { adminMembership: { ids: new Uint32Array([33]), values: new Uint32Array([4]) } }), noWait)).rejects.toThrow(/行政叶/);
  });
  it('rejects invalid geometry, height, IDs, future fields and stale baselines without changing the source', async () => {
    const session = await OwnedAtlasSession.open(initial, root), before = session.head;
    const vertex = vertexIdAt(initial.manifest.spec, 32, 32), p = getVertexPositionQ(initial, vertex);
    for (const patch of [elevation([0], 12001), elevation([initial.manifest.spec.columns ** 2]), { vertices: { ids: new Uint32Array([vertex]), xyQ: new Int32Array([p.xQ + 9000, p.yQ]) } }]) await expect(session.prepare(command(session, patch), noWait)).rejects.toThrow();
    await expect(session.prepare({ ...command(session, elevation([0])), expectedRootDigest: 'd'.repeat(64) }, noWait)).rejects.toThrow(/版本/);
    await expect(session.prepare({ ...command(session, elevation([0])), future: 1 } as AtlasEditCommand, noWait)).rejects.toThrow();
    expect(session.head).toEqual(before); await verifyAtlasDraft(session.snapshot());
  });
  it('cancels between dirty blocks without a candidate, source mutation or undo entry', async () => {
    const session = await OwnedAtlasSession.open(initial, root), controller = new AbortController();
    await expect(session.prepare(command(session, elevation([31, 32])), { signal: controller.signal, yieldTask: async () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(session.head).toMatchObject({ revision: 0, rootDigest: root, undoCount: 0 });
    expect(session.snapshot().manifest.blockRefs).toEqual(initial.manifest.blockRefs);
    const p = await session.prepare(command(session, elevation([0])), noWait); session.discard(p.candidateId);
    expect(() => session.candidateManifest(p.candidateId)).toThrow();
    expect(session.head.revision).toBe(0);
  });
  it('serializes preparation, rejects a second pending operation and retains undo after a discarded undo candidate', async () => {
    const session = await OwnedAtlasSession.open(initial, root), first = session.prepare(command(session, elevation([0])), noWait);
    await expect(session.prepare(command(session, elevation([1])), noWait)).rejects.toThrow(/已有一笔/);
    const p = await first;
    await expect(session.prepare(command(session, elevation([1])), noWait)).rejects.toThrow(/已有一笔/);
    session.publish(p.candidateId, receipt(session, p));
    const undo = await session.prepareUndo(`edit-${crypto.randomUUID()}`, noWait); session.discard(undo.candidateId);
    expect(session.head.undoCount).toBe(1); expect(session.head.revision).toBe(1);
  });
  it('counts layer blocks rather than only shared coordinates and classifies broader geometric influence separately', async () => {
    const data = cloneAtlasDraft(initial); data.manifest.catalogs = { simRegions: [{ id: 1, name: '模拟区' }], administration: [{ id: 1, name: '行政叶', parentId: null, kind: 'leaf' }] };
    const session = await OwnedAtlasSession.open(data, root), spec = data.manifest.spec, vertex = vertexIdAt(spec, 32, 32), point = getVertexPositionQ(data, vertex);
    const p = await session.prepare(command(session, { ...elevation([31 * 128 + 31, 32 * 128 + 32]), vertices: { ids: new Uint32Array([vertex]), xyQ: new Int32Array([point.xQ + 32, point.yQ]) }, simMembership: { ids: new Uint32Array([31 * 128 + 31]), values: new Uint32Array([1]) }, adminMembership: { ids: new Uint32Array([31 * 128 + 31]), values: new Uint32Array([1]) } }), noWait);
    expect(p.writeKeys).toHaveLength(5); expect(p.ownerCoordinates).toHaveLength(2); expect(p.localBudgetEligible).toBe(false);
    session.discard(p.candidateId);
    expect(getVertexSlot(session.snapshot(), vertex).block.xyQ).toEqual(getVertexSlot(data, vertex).block.xyQ);
  });
  it('updates the real geometry index only after publication and restores the same selected identity through undo', async () => {
    const session = await OwnedAtlasSession.open(initial, root), index = createSpatialIndex(session.snapshot());
    const spec = initial.manifest.spec, cell = cellIdAt(spec, 31, 31), vertex = vertexIdAt(spec, 32, 32);
    const old = getVertexPositionQ(initial, vertex), initialBox = index.cellAabb(cell);
    const point = { x: (31.5 * 4096) / 128, y: (31.5 * 4096) / 128 };
    expect(index.pick(point).cellId).toBe(cell);
    const p = await session.prepare(command(session, { vertices: { ids: new Uint32Array([vertex]), xyQ: new Int32Array([old.xQ + 512, old.yQ + 512]) } }), noWait);
    expect(index.cellAabb(cell)).toEqual(initialBox);
    session.publish(p.candidateId, receipt(session, p));
    const changed = index.updateGeometry(session.snapshot(), p.geometryVertexIds);
    expect(changed.stats.cellsReindexed).toBe(4); expect(changed.affectedDisplayBlocks).toHaveLength(4);
    expect(index.pick(point).cellId).toBe(cell);
    const undo = await session.prepareUndo(`edit-${crypto.randomUUID()}`, noWait);
    session.publish(undo.candidateId, receipt(session, undo, 'c'.repeat(64))); index.updateGeometry(session.snapshot(), undo.geometryVertexIds);
    expect(index.cellAabb(cell)).toEqual(initialBox); expect(index.pick(point).cellId).toBe(cell);
  });
  it('keeps the same four-block edit payload bounded across all three real geography sizes', async () => {
    const sizes = [128, 256, 512] as const, measurements: { request: number; response: number }[] = [];
    for (const size of sizes) {
      const data = size === 128 ? initial : await createAtlasDraft({ size, name: initial.manifest.name, seed: initial.manifest.seed, draftId: initial.manifest.draftId, atlasId: initial.manifest.atlasId }, noWait);
      const session = await OwnedAtlasSession.open(data, root), spec = data.manifest.spec;
      const ids = [cellIdAt(spec, 31, 31), cellIdAt(spec, 32, 31), cellIdAt(spec, 31, 32), cellIdAt(spec, 32, 32)];
      const p = await session.prepare(command(session, elevation(ids)), noWait);
      expect(p.writeKeys).toHaveLength(4); expect(p.localBudgetEligible).toBe(true);
      expect(p.requestBytes).toBeLessThanOrEqual(128 * 1024); expect(p.responseBytes).toBeLessThanOrEqual(128 * 1024);
      measurements.push({ request: p.requestBytes, response: p.responseBytes }); session.discard(p.candidateId);
    }
    expect(measurements[1]).toEqual(measurements[0]); expect(measurements[2]).toEqual(measurements[0]);
  }, 20_000);
});
