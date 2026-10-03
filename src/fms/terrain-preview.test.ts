import { describe, expect, it } from 'vitest';
import { FmsEditHistory, type FmsDocument } from './model';
import { prepareFmsTerrainPreview } from './terrain-preview';

function fixture(): FmsDocument {
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 0,
    width: 10, height: 10, points: [[0, 0], [10, 0], [0, 10]], triangles: new Uint32Array([0, 1, 2]),
    neighbors: [[1, 2], [0, 2], [0, 1]], elevations: new Int32Array([0, 45, 45]) };
}
describe('candidate terrain transaction', () => {
  it('preview is isolated; confirm is one undoable operation and candidate mutation cannot alter it', () => {
    const original = fixture(); original.elevations.fill(45);
    const history = new FmsEditHistory(original);
    const buffer = new Int32Array([45, 28, 80]);
    const preview = prepareFmsTerrainPreview(original, { worldId: original.worldId, baseRevision: 0, elevations: buffer });
    expect(history.document).toBe(original); expect(history.canUndo).toBe(false);
    buffer[1] = 99; expect(preview.document.elevations[1]).toBe(28);
    expect(history.commit(preview.patch).elevations).toEqual(new Int32Array([45, 28, 80]));
    expect(history.undo().elevations).toEqual(original.elevations);
    expect(history.redo().elevations).toEqual(preview.document.elevations);
  });
  it('rejects stale identity/revision, incomplete buffers and loss of a narrow land cell', () => {
    const doc = fixture(), request = { worldId: doc.worldId, baseRevision: 0, elevations: new Int32Array([0, 30, 80]) };
    expect(() => prepareFmsTerrainPreview(doc, { ...request, worldId: 'other' })).toThrow(/地图已变化/);
    expect(() => prepareFmsTerrainPreview(doc, { ...request, baseRevision: 1 })).toThrow(/地图已变化/);
    expect(() => prepareFmsTerrainPreview(doc, { ...request, elevations: new Int32Array([0]) })).toThrow(/不完整/);
    expect(() => prepareFmsTerrainPreview(doc, { ...request, elevations: new Int32Array([0, 19, 80]) })).toThrow(/轮廓/);
    expect(() => prepareFmsTerrainPreview(doc, { ...request, elevations: new Int32Array([0, 30, 101]) })).toThrow(/轮廓/);
    expect(doc.elevations).toEqual(new Int32Array([0, 45, 45]));
  });
  it('a no-op candidate does not create a revision or an undo entry', () => {
    const doc = fixture(), history = new FmsEditHistory(doc);
    const result = prepareFmsTerrainPreview(doc, { worldId: doc.worldId, baseRevision: 0, elevations: doc.elevations.slice() });
    expect(history.commit(result.patch)).toBe(doc); expect(history.canUndo).toBe(false);
  });
  it('rejects a mask-preserving coastline shift or sea-depth change before making a patch', () => {
    const doc = fixture();
    for (const heights of [[0, 22, 45], [19, 45, 45]]) {
      expect(() => prepareFmsTerrainPreview(doc, { worldId: doc.worldId, baseRevision: 0, elevations: Int32Array.from(heights) })).toThrow(/轮廓/);
    }
    expect(doc.elevations).toEqual(Int32Array.of(0, 45, 45));
    doc.elevations.fill(45);
    expect(() => prepareFmsTerrainPreview(doc, { worldId: doc.worldId, baseRevision: 0, elevations: Int32Array.of(45, 20, 45) })).toThrow(/轮廓/);
  });
});
