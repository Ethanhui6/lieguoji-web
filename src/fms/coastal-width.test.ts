import { describe, expect, it } from 'vitest';
import { coastFixture, compareLinearCoasts } from '../../tests/helpers/fms-coast-metrics';
import { commitFmsEdit, FmsEditHistory, prepareFmsLockEdit } from './model';
import { naturalizeFmsTerrain, type FmsNaturalizationOptions } from './naturalize';
import { prepareFmsTerrainPreview } from './terrain-preview';

describe('explicit inland coastal lowland width', () => {
  it('keeps the omitted default equivalent and repeatable without rewriting the document', () => {
    const doc = coastFixture('asymmetric'), original = structuredClone(doc);
    const omitted = naturalizeFmsTerrain(doc, { seed: 42, strength: 1 });
    const explicit = naturalizeFmsTerrain(doc, { seed: 42, strength: 1, coastalWidth: .035 });
    expect(explicit).toEqual(omitted);
    const second = naturalizeFmsTerrain({ ...doc, elevations: explicit.elevations }, { seed: 42, strength: 1, coastalWidth: .035 });
    expect(second.elevations).toEqual(explicit.elevations); expect(second.stats.changedCells).toBe(0);
    expect(doc).toEqual(original);
  });
  it('widens real lowlands, never raises them, and does not affect terrain beyond the wider band', () => {
    const doc = coastFixture('asymmetric');
    const narrow = naturalizeFmsTerrain(doc, { seed: 42, strength: 1, coastalWidth: .01 });
    const wide = naturalizeFmsTerrain(doc, { seed: 42, strength: 1, coastalWidth: .12 });
    expect(wide.stats.coastalWidthWorld).toBe(48);
    // Independent geometric lower bound: graph distance cannot be shorter
    // than straight-line distance to any classified coast-edge midpoint.
    const midpoints: [number, number][] = [];
    doc.neighbors.forEach((row, i) => { if (doc.elevations[i] >= 20) for (const j of row) if (doc.elevations[j] < 20) midpoints.push([(doc.points[i][0]+doc.points[j][0])/2, (doc.points[i][1]+doc.points[j][1])/2]); });
    let lowered = 0, distant = 0;
    doc.points.forEach(([x,y], i) => {
      expect(wide.elevations[i]).toBeLessThanOrEqual(narrow.elevations[i]);
      if (wide.elevations[i] < narrow.elevations[i]) lowered++;
      if (doc.elevations[i] >= 20 && midpoints.every(([a,b]) => Math.hypot(x-a,y-b) >= 48)) {
        distant++; expect(wide.elevations[i]).toBe(narrow.elevations[i]);
      }
    });
    expect(lowered).toBeGreaterThan(100); expect(distant).toBeGreaterThan(10);
  });
  it.each([.01,.035,.12,.2])('preserves rendered coast, island area, neck section and player locks at width %s', coastalWidth => {
    for (const kind of ['island','neck','asymmetric'] as const) {
      const source = coastFixture(kind), doc = commitFmsEdit(source, prepareFmsLockEdit(source, [{ x:120,y:290,radius:18 }], true));
      for (const seed of [42,9182]) {
        const result = naturalizeFmsTerrain(doc, { seed,strength:1,coastalWidth });
        const measured = compareLinearCoasts(doc, result.elevations, kind==='island'?40:200);
        expect(measured).toMatchObject({maxCrossingDisplacement:0,missingCrossings:0,absoluteAreaChange:0,changedTriangles:0});
        expect(measured.sectionAfter).toEqual(measured.sectionBefore);
        doc.terrainLocks?.forEach((locked,i)=>{ if(locked) expect(result.elevations[i]).toBe(doc.elevations[i]); });
        const history = new FmsEditHistory(doc), preview = prepareFmsTerrainPreview(doc, {worldId:doc.worldId,baseRevision:doc.revision,elevations:result.elevations});
        history.commit(preview.patch);
        expect(history.document.elevations).toEqual(result.elevations);
        if (preview.patch.changes.length) { expect(history.undo().elevations).toEqual(doc.elevations); expect(history.redo().elevations).toEqual(result.elevations); }
      }
    }
  });
  it('keeps zero strength unchanged and all-land boundary fallback finite at both width limits', () => {
    const doc=coastFixture('asymmetric'); doc.elevations.fill(45);
    for (const coastalWidth of [.01,.2]) {
      const unchanged=naturalizeFmsTerrain(doc,{seed:42,strength:0,coastalWidth}); expect(unchanged.elevations).toEqual(doc.elevations);
      const generated=naturalizeFmsTerrain(doc,{seed:42,strength:1,coastalWidth});
      expect(generated.stats).toMatchObject({fallbackBoundaryComponents:1,coastalLandCells:0});
      expect(generated.elevations.every(h=>h>20&&h<=100)).toBe(true);
      expect(Number.isFinite(generated.stats.meanLandHeight)).toBe(true);
    }
  });
  it.each([0,-.01,.2001,NaN,Infinity,undefined,null,'0.1'])('rejects invalid explicit width %s rather than silently defaulting', coastalWidth => {
    const doc=coastFixture('island'), original=structuredClone(doc);
    expect(()=>naturalizeFmsTerrain(doc,{seed:42,strength:1,coastalWidth} as FmsNaturalizationOptions)).toThrow(/自然化参数无效/);
    expect(doc).toEqual(original);
  });
});
