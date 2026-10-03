import { describe, expect, it } from 'vitest';
import { coastFixture, compareLinearCoasts } from '../../tests/helpers/fms-coast-metrics';
import { naturalizeFmsTerrain } from './naturalize';
import { createFmsDocument } from './model';

describe('rendered linear sea-level contour contract', () => {
  it('detects the reported counterexample despite identical point masks', () => {
    const doc = coastFixture('island'), bad = Int32Array.from(doc.elevations, height => height === 45 ? 22 : height);
    const measured = compareLinearCoasts(doc, bad, 40);
    expect((20 / 22) - (20 / 45)).toBeCloseTo(.464646464646);
    expect(Array.from(bad, h => h >= 20)).toEqual(Array.from(doc.elevations, h => h >= 20));
    expect(measured.maxCrossingDisplacement).toBeGreaterThan(4.6);
    expect(measured.landAreaAfter / measured.landAreaBefore).toBeLessThan(.03);
    expect(measured.sectionAfter).not.toEqual(measured.sectionBefore);
  });
  it.each(['island', 'neck', 'asymmetric'] as const)('preserves every contour crossing and triangle land area for %s', kind => {
    const doc = coastFixture(kind), before = doc.elevations.slice();
    for (const seed of [0, 42, 1337, 0xffffffff]) for (const strength of [.2, .5, 1]) {
      const result = naturalizeFmsTerrain(doc, { seed, strength }), metric = compareLinearCoasts(doc, result.elevations, kind === 'island' ? 40 : 200);
      expect(metric.crossingCount).toBeGreaterThan(0);
      expect(metric).toMatchObject({ missingCrossings: 0, maxCrossingDisplacement: 0, changedTriangles: 0, absoluteAreaChange: 0 });
      expect(metric.candidateCrossingCount).toBe(metric.crossingCount);
      expect(metric.landAreaAfter).toBe(metric.landAreaBefore);
      expect(metric.sectionAfter).toEqual(metric.sectionBefore);
      if (kind !== 'island') expect(result.stats.changedCells).toBeGreaterThan(0);
      else expect(result.stats.changedCells).toBe(0); // Do not shrink tiny islands to force a result.
    }
    expect(doc.elevations).toEqual(before);
  });
  it('handles nonzero sea, unequal coast heights, and exact-level vertices/plateaus', () => {
    const doc = coastFixture('asymmetric');
    doc.elevations = Int32Array.from(doc.elevations, (h, id) => h < 20 ? id % 20 : [20, 21, 45, 100][id % 4]);
    for (const seed of [42, 1337]) {
      const result = naturalizeFmsTerrain(doc, { seed, strength: 1 });
      expect(compareLinearCoasts(doc, result.elevations)).toMatchObject({ missingCrossings: 0, maxCrossingDisplacement: 0, changedTriangles: 0, absoluteAreaChange: 0 });
      doc.elevations.forEach((height, id) => { if (height <= 20) expect(result.elevations[id]).toBe(height); });
    }
    doc.elevations.fill(20);
    expect(naturalizeFmsTerrain(doc, { seed: 42, strength: 1 }).elevations).toEqual(doc.elevations);
  });
  it('preserves the actual 36864-point render mesh contour while changing interior relief', async () => {
    const doc = await createFmsDocument({ yieldTask: async () => {} });
    doc.points.forEach(([x, y], id) => { if (x > 220 && x < 1300 && y > 200 && y < 1300 && !(x < 650 && y > 600 && y < 800)) doc.elevations[id] = 45; });
    const result = naturalizeFmsTerrain(doc, { seed: 1337, strength: 1 }), metric = compareLinearCoasts(doc, result.elevations);
    expect(result.stats.changedCells).toBeGreaterThan(1000);
    expect(metric.crossingCount).toBeGreaterThan(100);
    expect(metric).toMatchObject({ missingCrossings: 0, maxCrossingDisplacement: 0, changedTriangles: 0, absoluteAreaChange: 0 });
  });
});
