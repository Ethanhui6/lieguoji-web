import { Delaunay } from 'd3-delaunay';
import { describe, expect, it } from 'vitest';
import {
  assertFmsDocument, commitFmsEdit, createFmsDocument, FmsEditHistory, pickFmsCell,
  prepareFmsBrushEdit, prepareFmsOutlineEdit,
} from './model';
import type { FmsDocument, FmsEditPatch, FmsPoint } from './model';

function fixture(size = 3): FmsDocument {
  const points: FmsPoint[] = [];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) points.push([x * 5, y * 5]);
  const delaunay = Delaunay.from(points);
  return {
    format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 0,
    width: (size - 1) * 5, height: (size - 1) * 5, points, triangles: Uint32Array.from(delaunay.triangles),
    neighbors: points.map((_, cell) => [...delaunay.neighbors(cell)]), elevations: new Int32Array(points.length),
  };
}
const brush = (doc: FmsDocument, tool: 'land' | 'sea', x = 5, y = 5, radius = 1) => prepareFmsBrushEdit(doc, { tool, stamps: [{ x, y, radius }] });

describe('the isolated FMS editable world', () => {
  it('creates a real square-v1 point mesh and an empty sea without old save data', async () => {
    const doc = await createFmsDocument({ yieldTask: async () => {} });
    expect(doc).toMatchObject({ format: 'lieguoji-fms-world', version: 1, revision: 0, width: 1536, height: 1536 });
    expect(doc.points).toHaveLength(192 * 192);
    expect(doc.triangles).toHaveLength(72_962 * 3);
    expect(doc.elevations.every(value => value === 0)).toBe(true);
    expect(() => assertFmsDocument(doc)).not.toThrow();
  }, 10000);

  it('honors cancellation while generating the point mesh', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(createFmsDocument({ signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates typed dimensions, topology, references, and the independent save version', () => {
    const doc = fixture(); expect(() => assertFmsDocument(doc)).not.toThrow();
    const bad: unknown[] = [null, { ...doc, version: 2 }, { ...doc, format: 'lieguoji-atlas-draft' }, { ...doc, revision: -1 },
      { ...doc, width: Infinity }, { ...doc, width: 9000 }, { ...doc, points: [] }, { ...doc, elevations: [0] },
      { ...doc, elevations: new Int32Array(2) }, { ...doc, triangles: Uint32Array.of(0, 0, 1) },
      { ...doc, neighbors: doc.neighbors.map(() => []) }, { ...doc, cache: {} },
      { ...doc, points: doc.points.map((point, id) => id === 1 ? doc.points[0] : point) }];
    for (const invalid of bad) expect(() => assertFmsDocument(invalid)).toThrow('文档无效');
  });

  it('selects intersecting Voronoi polygons rather than only point centers and ignores outside-world stamps', () => {
    const doc = fixture();
    expect(pickFmsCell(doc, 2.4, 5)).toBe(3);
    const patch = brush(doc, 'land', 2.4, 5, 0.6);
    expect(patch.changes.map(change => change.cell)).toEqual([3, 4]);
    expect(Math.hypot(doc.points[4][0] - 2.4, doc.points[4][1] - 5)).toBeGreaterThan(0.6);
    expect(brush(doc, 'land', -0.1, 5, 3).changes).toHaveLength(0);
    expect(pickFmsCell(doc, -0.1, 5)).toBeNull();
    expect(() => pickFmsCell(doc, NaN, 5)).toThrow('坐标无效');
  });

  it('prepares cancelable previews and applies a full stroke only once to the same height data', () => {
    const doc = fixture(); doc.elevations[4] = 80;
    const before = doc.elevations.slice();
    const stamps = [{ x: 5, y: 5, radius: 3 }, { x: 5, y: 5, radius: 3 }];
    const patch = prepareFmsBrushEdit(doc, { tool: 'land', stamps });
    expect(doc.elevations).toEqual(before);
    expect(doc.revision).toBe(0);
    expect(patch.changes.every(change => change.next === 45)).toBe(true);
    const next = commitFmsEdit(doc, patch);
    expect(next.elevations[4]).toBe(80);
    expect(next.elevations).not.toBe(doc.elevations);
    expect(next.points).toBe(doc.points);
    expect(doc.elevations).toEqual(before);
    expect(prepareFmsBrushEdit(next, { tool: 'land', stamps }).changes).toHaveLength(0);
  });

  it('joins overlapping outlines with a continuous brush and cuts the same land back into sea', () => {
    const doc = fixture(5);
    const left: FmsPoint[] = [[0, 0], [6, 0], [6, 20], [0, 20]];
    const right: FmsPoint[] = [[14, 0], [20, 0], [20, 20], [14, 20]];
    const a = commitFmsEdit(doc, prepareFmsOutlineEdit(doc, left));
    const b = commitFmsEdit(a, prepareFmsOutlineEdit(a, right));
    expect(b.elevations[12]).toBe(0);
    const connected = commitFmsEdit(b, prepareFmsBrushEdit(b, { tool: 'land', stamps: [{ x: 5, y: 10, radius: 1 }, { x: 15, y: 10, radius: 1 }] }));
    expect([11, 12, 13].map(cell => connected.elevations[cell])).toEqual([45, 45, 45]);
    const cut = commitFmsEdit(connected, brush(connected, 'sea', 10, 10, 1));
    expect([11, 12, 13].map(cell => cut.elevations[cell])).toEqual([45, 0, 45]);
    expect(connected.elevations[12]).toBe(45);
  });

  it('accepts explicitly closed contours and reports self-crossing or degenerate shapes in Chinese', () => {
    const doc = fixture();
    expect(prepareFmsOutlineEdit(doc, [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]).changes).toHaveLength(9);
    expect(() => prepareFmsOutlineEdit(doc, [[0, 0], [10, 10], [0, 10], [10, 0]])).toThrow('轮廓发生交叉');
    expect(() => prepareFmsOutlineEdit(doc, [[0, 0], [5, 5], [10, 10]])).toThrow('没有围成陆地');
    expect(() => prepareFmsOutlineEdit(doc, [[-1, 0], [5, 0], [5, 5]])).toThrow('地图范围内');
    expect(() => prepareFmsOutlineEdit(doc, [[1, 1], [1.1, 1], [1, 1.1]])).toThrow('尚未覆盖地形点');
    expect(doc.elevations.every(value => value === 0)).toBe(true);
  });

  it('rejects invalid parameters and bounded-work exhaustion without leaving a partial edit', () => {
    const doc = fixture();
    expect(() => brush(doc, 'land', 5, 5, 0)).toThrow('半径无效');
    expect(() => brush(doc, 'land', 5, 5, Infinity)).toThrow('半径无效');
    expect(() => prepareFmsBrushEdit(doc, { tool: 'land', height: 101, stamps: [] })).toThrow('陆地高度');
    expect(() => prepareFmsBrushEdit(doc, { tool: 'land', stamps: new Array(4097) })).toThrow('笔划长度');
    expect(doc.elevations.every(value => value === 0)).toBe(true);
  });

  it('checks world, revision, old values, and the entire patch before committing', () => {
    const doc = fixture(), patch = brush(doc, 'land');
    const next = commitFmsEdit(doc, patch);
    expect(() => commitFmsEdit(next, patch)).toThrow('预览已过期');
    expect(() => commitFmsEdit({ ...doc, worldId: '00000000-0000-4000-8000-000000000002' }, patch)).toThrow('预览已过期');
    const duplicate: FmsEditPatch = { ...patch, changes: [patch.changes[0], patch.changes[0]] };
    expect(() => commitFmsEdit(doc, duplicate)).toThrow('无效地形点');
    expect(() => commitFmsEdit(doc, { ...patch, changes: [...patch.changes, { cell: 0, previous: 0, next: Infinity }] })).toThrow('无效地形点');
    expect(() => commitFmsEdit(doc, { ...patch, changes: [{ cell: 4, previous: 7, next: 45 }] })).toThrow('地图已改变');
    expect(doc.elevations.every(value => value === 0)).toBe(true);
  });

  it('undoes and redoes whole strokes with monotonic revisions and stale-preview rejection', () => {
    const doc = fixture(), history = new FmsEditHistory(doc);
    expect(history.undo()).toBe(doc); expect(history.redo()).toBe(doc);
    const patch = brush(doc, 'land');
    const land = history.commit(patch);
    expect(history.canUndo).toBe(true); expect(history.canRedo).toBe(false);
    const sea = history.undo();
    expect(sea.elevations).toEqual(doc.elevations); expect(sea.revision).toBe(2);
    expect(history.canRedo).toBe(true);
    expect(() => history.commit(patch)).toThrow('预览已过期');
    history.commit(brush(sea, 'sea')); // A no-op does not consume history or a revision.
    expect(history.document).toBe(sea); expect(history.canRedo).toBe(true);
    const redone = history.redo(); expect(redone.elevations).toEqual(land.elevations); expect(redone.revision).toBe(3);
    history.undo();
    history.commit(brush(history.document, 'land', 0, 0, 1));
    expect(history.canRedo).toBe(false);
    expect(doc.elevations.every(value => value === 0)).toBe(true);
  });
});
