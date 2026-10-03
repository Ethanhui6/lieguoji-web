import { describe, expect, it } from 'vitest';
import { coastFixture, compareLinearCoasts } from '../../tests/helpers/fms-coast-metrics';
import { assertFmsDocument, commitFmsEdit, FmsEditHistory, prepareFmsBrushEdit, prepareFmsLockEdit, prepareFmsOutlineEdit } from './model';
import { naturalizeFmsTerrain } from './naturalize';
import { prepareFmsTerrainPreview } from './terrain-preview';

const stamps = [{ x: 120, y: 290, radius: 18 }];
const protectedDoc = () => { const doc = coastFixture('asymmetric'); return commitFmsEdit(doc, prepareFmsLockEdit(doc, stamps, true)); };

describe('player terrain protection', () => {
  it('protects the actual face under a brush on a non-Delaunay stored mesh',()=>{
    const doc={...coastFixture('island'),width:80,height:80,points:[[0,0],[80,0],[80,80],[0,20]] as [number,number][],
      triangles:new Uint32Array([0,1,2,0,2,3]),neighbors:[[1,2,3],[0,2],[0,1,3],[0,2]],elevations:new Int32Array([45,45,45,0])};
    assertFmsDocument(doc);
    const locked=commitFmsEdit(doc,prepareFmsLockEdit(doc,[{x:30,y:28,radius:8}],true));
    // Old nearest-site selection found only D (id3), leaving B under this brush unlocked.
    expect([0,1,2].every(i=>locked.terrainLocks![i]===1)).toBe(true);
    const unlocked=commitFmsEdit(locked,prepareFmsLockEdit(locked,[{x:30,y:28,radius:8}],false));
    expect(unlocked.terrainLocks!.some(Boolean)).toBe(false);
  });
  it('requires an actual lock edit for v2; preparing/cancelling/empty unlock keeps v1 untouched', () => {
    const doc = coastFixture('asymmetric'), original = structuredClone(doc), patch = prepareFmsLockEdit(doc, stamps, true);
    expect(patch.lockChanges!.length).toBeGreaterThan(0); expect(doc).toEqual(original);
    expect(commitFmsEdit(doc, prepareFmsLockEdit(doc, [], true))).toBe(doc);
    expect(commitFmsEdit(doc, prepareFmsLockEdit(doc, stamps, false))).toBe(doc);
    const locked = commitFmsEdit(doc, patch);
    expect(locked.version).toBe(2); expect(locked.revision).toBe(1); expect(locked.elevations).toBe(doc.elevations);
    expect(locked.terrainLocks).toBeInstanceOf(Uint8Array); expect(() => assertFmsDocument(locked)).not.toThrow();
    expect(doc).toEqual(original);
  });
  it('rejects absent/wrong/invalid lock arrays and unversioned protection', () => {
    const doc = protectedDoc();
    for (const terrainLocks of [undefined, [], new Uint8Array(1), new Uint8Array(doc.points.length).fill(2), new Int32Array(doc.points.length)]) {
      expect(() => assertFmsDocument({ ...doc, terrainLocks })).toThrow();
    }
    expect(() => assertFmsDocument({ ...doc, version: 1 })).toThrow();
  });
  it('keeps every locked elevation across seeds while unlocked interior and water remain real', () => {
    const doc = protectedDoc(), before = doc.elevations.slice();
    for (const seed of [42, 1337, 99]) {
      const generated = naturalizeFmsTerrain(doc, { seed, strength: 1 });
      expect(generated.stats.changedCells).toBeGreaterThan(100);
      doc.terrainLocks!.forEach((locked, id) => { if (locked) expect(generated.elevations[id]).toBe(before[id]); });
      expect(compareLinearCoasts(doc, generated.elevations)).toMatchObject({ maxCrossingDisplacement: 0, absoluteAreaChange: 0 });
      const preview = prepareFmsTerrainPreview(doc, { worldId: doc.worldId, baseRevision: doc.revision, elevations: generated.elevations });
      expect(preview.document.terrainLocks).toEqual(doc.terrainLocks);
    }
  });
  it('brushes and outlines skip locked terrain, and the commit boundary rejects forged bypasses', () => {
    const doc = protectedDoc(), ids = [...doc.terrainLocks!.keys()].filter(id => doc.terrainLocks![id]);
    for (const patch of [prepareFmsBrushEdit(doc, { tool: 'sea', stamps }), prepareFmsOutlineEdit(doc, [[0, 0], [400, 0], [400, 400], [0, 400]], 99)]) {
      const edited = commitFmsEdit(doc, patch); ids.forEach(id => expect(edited.elevations[id]).toBe(doc.elevations[id]));
    }
    const id = ids[0], change = { cell: id, previous: doc.elevations[id], next: 99 };
    const patch = { worldId: doc.worldId, baseRevision: doc.revision, label: 'forged', changes: [change] };
    expect(() => commitFmsEdit(doc, patch)).toThrow(/受保护/);
    expect(() => commitFmsEdit(doc, { ...patch, lockChanges: [{ cell: id, previous: 1, next: 0 }] })).toThrow(/分别提交/);
    const candidate = doc.elevations.slice(); candidate[id] = 99;
    expect(() => prepareFmsTerrainPreview(doc, { ...patch, elevations: candidate })).toThrow();
  });
  it('undoes protection and height edits in order without downgrading the opted-in format', () => {
    const doc = coastFixture('asymmetric'), history = new FmsEditHistory(doc);
    history.commit(prepareFmsBrushEdit(history.document, { tool: 'land', height: 75, stamps }));
    const raised = history.document.elevations.slice();
    const lock = prepareFmsLockEdit(history.document, stamps, true); history.commit(lock);
    expect(history.document.terrainLocks!.some(Boolean)).toBe(true);
    const unlocked = history.undo(); expect(unlocked.version).toBe(2); expect(unlocked.terrainLocks!.some(Boolean)).toBe(false);
    expect(history.undo().elevations).toEqual(doc.elevations);
    expect(history.redo().elevations).toEqual(raised);
    const relocked = history.redo(); expect(relocked.terrainLocks!.some(Boolean)).toBe(true);
    history.commit(prepareFmsLockEdit(relocked, stamps, false));
    expect(history.document.terrainLocks!.some(Boolean)).toBe(false);
    expect(history.undo().terrainLocks).toEqual(relocked.terrainLocks);
  });
  it('rejects stale generation after a lock-only revision and owns the history lock patch', () => {
    const doc = coastFixture('asymmetric'), history = new FmsEditHistory(doc), generated = naturalizeFmsTerrain(doc, { seed: 42, strength: 1 });
    const originalPatch = structuredClone(prepareFmsLockEdit(doc, stamps, true));
    history.commit(originalPatch);
    (originalPatch.lockChanges![0] as { next: number }).next = 0;
    expect(() => prepareFmsTerrainPreview(history.document, { worldId: doc.worldId, baseRevision: 0, elevations: generated.elevations })).toThrow(/已变化/);
    history.undo(); expect(history.redo().terrainLocks!.some(Boolean)).toBe(true);
  });
  it('bounds lock-only history and validates all lock changes before mutation', () => {
    const history = new FmsEditHistory(coastFixture('asymmetric'));
    for (let i = 0; i < 110; i++) history.commit(prepareFmsLockEdit(history.document, stamps, i % 2 === 0));
    let undoCount = 0; while (history.canUndo) { history.undo(); undoCount++; }
    expect(undoCount).toBe(100);
    const doc = protectedDoc(), patch = { worldId: doc.worldId, baseRevision: doc.revision, label: 'bad lock', changes: [] };
    for (const lockChanges of [[{ cell: 0, previous: 0, next: 2 }], [{ cell: 0, previous: 0, next: 1 }, { cell: 0, previous: 0, next: 1 }]]) {
      expect(() => commitFmsEdit(doc, { ...patch, lockChanges })).toThrow();
    }
    expect(() => prepareFmsLockEdit(doc, stamps, 1 as unknown as boolean)).toThrow();
  });
  it('retains locks after a complete terrain-confirm/undo/redo sequence', () => {
    const doc = protectedDoc(), history = new FmsEditHistory(doc), result = naturalizeFmsTerrain(doc, { seed: 42, strength: 1 });
    const preview = prepareFmsTerrainPreview(doc, { worldId: doc.worldId, baseRevision: doc.revision, elevations: result.elevations });
    const next = history.commit(preview.patch); expect(next.terrainLocks).toEqual(doc.terrainLocks);
    expect(history.undo().elevations).toEqual(doc.elevations); expect(history.redo().elevations).toEqual(next.elevations);
    expect(history.document.terrainLocks).toEqual(doc.terrainLocks);
  });
});
