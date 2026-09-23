import { beforeAll, describe, expect, it } from 'vitest';
import { cloneAtlasDraft, createAtlasDraft, getBlock, getCellLayerSlot, getVertexSlot, hashBlock } from './model';
import type { AtlasDraftData, AtlasGridSpec } from './model';
import { affectedGeometryBlocks, affectedGeometryCells, cellBlock, cellEdgeIds, cellIdAt, cellNeighbors, cellVertexIds, edgeIdAt, edgeOwnerBlock, edgeVertexIds, getCellQuad, getGeometryDependencyKey, getVertexPositionQ, incidentCellIds, ownedVertexIds, validateLocalGeometry, vertexIdAt, vertexOwnerBlock } from './topology';

let data: AtlasDraftData, spec: AtlasGridSpec;
beforeAll(async () => {
  data = await createAtlasDraft({ size: 256, seed: 'ph04-topology', name: '共享几何草稿' }, { yieldTask: async () => {} }); spec = data.manifest.spec;
}, 20000);

describe('production shared topology and geometry dependencies', () => {
  it('assigns stable sorted IDs, shared edges and reciprocal non-diagonal adjacency across blocks', () => {
    const a = cellIdAt(spec, 31, 31), right = cellIdAt(spec, 32, 31), below = cellIdAt(spec, 31, 32);
    expect(cellBlock(spec, a)).toEqual({ bx: 0, by: 0 }); expect(cellBlock(spec, right)).toEqual({ bx: 1, by: 0 });
    expect(cellNeighbors(spec, a)).toContain(right); expect(cellNeighbors(spec, right)).toContain(a);
    expect(cellNeighbors(spec, a)).toContain(below); expect(cellNeighbors(spec, a)).not.toContain(cellIdAt(spec, 32, 32));
    expect(cellNeighbors(spec, 0)).toEqual([1, 256]);
    expect(cellNeighbors(spec, 65535)).toEqual([65279, 65534]);
    const shared = cellEdgeIds(spec, a).filter(id => cellEdgeIds(spec, right).includes(id));
    expect(shared).toEqual([edgeIdAt(spec, 'vertical', 32, 31)]);
    expect(edgeVertexIds(spec, shared[0])).toEqual([vertexIdAt(spec, 32, 31), vertexIdAt(spec, 32, 32)]);
    expect(edgeOwnerBlock(spec, shared[0])).toEqual({ bx: 0, by: 0 });
    expect(cellVertexIds(spec, a)).toEqual([...cellVertexIds(spec, a)].sort((x, y) => x - y));
  });

  it('gives each shared vertex exactly one immutable northwest owner, including world corners', () => {
    for (const [x, y, bx, by] of [[0, 0, 0, 0], [32, 32, 0, 0], [33, 32, 1, 0], [32, 33, 0, 1], [256, 256, 7, 7]]) {
      const id = vertexIdAt(spec, x, y); expect(vertexOwnerBlock(spec, id)).toEqual({ bx, by });
      expect([...ownedVertexIds(spec, bx, by)]).toContain(id);
      const { block, slot } = getVertexSlot(data, id); expect(block.vertexIds[slot]).toBe(id);
    }
    expect(incidentCellIds(spec, vertexIdAt(spec, 32, 32))).toEqual([cellIdAt(spec, 31, 31), cellIdAt(spec, 32, 31), cellIdAt(spec, 31, 32), cellIdAt(spec, 32, 32)]);
    expect(incidentCellIds(spec, 0)).toEqual([0]); expect(incidentCellIds(spec, 257 * 257 - 1)).toEqual([65535]);
  });

  it('updates one shared boundary vertex for all four incident quads while preserving IDs and source geometry', () => {
    const copy = cloneAtlasDraft(data), id = vertexIdAt(spec, 32, 32), before = getVertexPositionQ(data, id), target = getVertexSlot(copy, id);
    target.block.xyQ[target.slot * 2] += 128; target.block.xyQ[target.slot * 2 + 1] -= 128;
    expect(() => validateLocalGeometry(copy, [id])).not.toThrow();
    const affected = affectedGeometryCells(spec, [id, id]); expect(affected).toHaveLength(4);
    for (const cell of affected) {
      const point = { x: (before.xQ + 128) / 256, y: (before.yQ - 128) / 256 };
      expect(getCellQuad(copy, cell)).toContainEqual(point);
      expect(cellVertexIds(spec, cell)).toContain(id);
    }
    expect(getVertexPositionQ(data, id)).toEqual(before); expect(vertexOwnerBlock(spec, id)).toEqual({ bx: 0, by: 0 });
    expect(affectedGeometryBlocks(spec, [id])).toEqual({ ownerBlocks: [{ bx: 0, by: 0 }], cellBlocks: [{ bx: 0, by: 0 }, { bx: 1, by: 0 }, { bx: 0, by: 1 }, { bx: 1, by: 1 }], displayBlocks: [{ bx: 0, by: 0 }, { bx: 1, by: 0 }, { bx: 0, by: 1 }, { bx: 1, by: 1 }] });
  });

  it('reports a complete larger owner/display halo instead of truncating it to a four-block promise', () => {
    const ids = [vertexIdAt(spec, 32, 32), vertexIdAt(spec, 96, 32), vertexIdAt(spec, 32, 96), vertexIdAt(spec, 96, 96), vertexIdAt(spec, 64, 64)];
    const affected = affectedGeometryBlocks(spec, ids);
    expect(affected.ownerBlocks.length).toBe(5); expect(affected.displayBlocks.length).toBeGreaterThan(4);
    expect(affected.cellBlocks).toEqual(affected.displayBlocks);
    expect(affected.ownerBlocks).toEqual([...affected.ownerBlocks].sort((a, b) => a.by - b.by || a.bx - b.bx));
  });

  it('binds spatial dependencies only to atlas/spec and geometry hashes, not elevation or either membership', async () => {
    const copy = cloneAtlasDraft(data), before = getGeometryDependencyKey(copy), height = getCellLayerSlot(copy, 'elevation', 0);
    height.block.values[height.slot] = 20; copy.manifest.revision++;
    copy.manifest.blockRefs.find(ref => ref.key === height.key)!.hash = await hashBlock(height.block);
    expect(getGeometryDependencyKey(copy)).toBe(before);
    const admin = getCellLayerSlot(copy, 'admin-membership', 0); admin.block.values[admin.slot] = 123;
    copy.manifest.blockRefs.find(ref => ref.key === admin.key)!.hash = await hashBlock(admin.block);
    expect(getGeometryDependencyKey(copy)).toBe(before);
    const vertex = getVertexSlot(copy, vertexIdAt(spec, 32, 32)); vertex.block.xyQ[vertex.slot * 2]++;
    copy.manifest.blockRefs.find(ref => ref.key === vertex.key)!.hash = await hashBlock(vertex.block);
    expect(getGeometryDependencyKey(copy)).not.toBe(before);
  });

  it('rejects invalid IDs, missing owners, out-of-range vertex moves and degenerate quads without repairing them', () => {
    expect(() => cellIdAt(spec, -1, 0)).toThrow(); expect(() => vertexIdAt(spec, 257, 0)).toThrow();
    expect(() => cellNeighbors(spec, 65536)).toThrow(); expect(() => edgeVertexIds(spec, 999999)).toThrow();
    const copy = cloneAtlasDraft(data), vertex = getVertexSlot(copy, vertexIdAt(spec, 32, 32)), before = vertex.block.xyQ[vertex.slot * 2];
    vertex.block.xyQ[vertex.slot * 2] += 10000;
    expect(() => validateLocalGeometry(copy, [vertex.block.vertexIds[vertex.slot]])).toThrow('有界');
    expect(vertex.block.xyQ[vertex.slot * 2]).toBe(before + 10000);
    const cell = cellIdAt(spec, 20, 20), ids = cellVertexIds(spec, cell), step = 4096 * 256 / spec.columns;
    for (const [id, dx, dy] of [[ids[0], step / 4, step / 4], [ids[1], -step / 4, step / 4], [ids[2], step / 4, -step / 4], [ids[3], -step / 4, -step / 4]]) {
      const current = getVertexSlot(copy, id); current.block.xyQ[current.slot * 2] = (id % 257) * step + dx; current.block.xyQ[current.slot * 2 + 1] = Math.floor(id / 257) * step + dy;
    }
    // Still a legal smaller quad; the explicit bound itself cannot be relaxed by local validation.
    expect(() => validateLocalGeometry(copy, ids)).not.toThrow();
    // Three consecutive corners become collinear while each stays within its
    // permitted quarter-cell bounds: geometric validation must still reject it.
    for (const [id, dx, dy] of [[ids[0], step / 4, -step / 4], [ids[1], -step / 4, step / 4], [ids[3], step / 4, -step / 4]]) {
      const current = getVertexSlot(copy, id); current.block.xyQ[current.slot * 2] = (id % 257) * step + dx; current.block.xyQ[current.slot * 2 + 1] = Math.floor(id / 257) * step + dy;
    }
    expect(() => validateLocalGeometry(copy, ids)).toThrow('退化');
    copy.blocks.delete('geometry:0:0'); expect(() => getCellQuad(copy, 0)).toThrow('所有者');
    expect(() => getBlock(copy, 'geometry:0:0')).toThrow('缺失');
  });
});
