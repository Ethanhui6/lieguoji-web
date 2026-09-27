import { describe, expect, it } from 'vitest';
import { hydrologyNodeAt, hydrologyRectangle } from './hydrology-controls';

describe('fine drainage selection coordinates', () => {
  it('converts an actual world point independently of 128/256/512 coarse grid size', () => {
    expect(hydrologyNodeAt({ x: 1793.1, y: 2480.8 })).toEqual({ column: 897, row: 1240 });
    expect(hydrologyRectangle({ column: 897, row: 1240 })).toEqual({ originColumn: 641, originRow: 984, columns: 512, rows: 512 });
  });
  it('includes every selected edge node while staying inside the 2049-node world', () => {
    for (const column of [0, 1, 255, 1024, 2047, 2048]) for (const row of [0, 256, 2048]) {
      const r = hydrologyRectangle({ column, row });
      expect(r.originColumn).toBeGreaterThanOrEqual(0); expect(r.originRow).toBeGreaterThanOrEqual(0);
      expect(r.originColumn + r.columns).toBeLessThanOrEqual(2049); expect(r.originRow + r.rows).toBeLessThanOrEqual(2049);
      expect(column).toBeGreaterThanOrEqual(r.originColumn); expect(column).toBeLessThan(r.originColumn + r.columns);
      expect(row).toBeGreaterThanOrEqual(r.originRow); expect(row).toBeLessThan(r.originRow + r.rows);
    }
  });
  it('rejects outside/invalid points instead of clamping them into a different flow source', () => {
    for (const x of [-1, 4097, NaN, Infinity]) expect(() => hydrologyNodeAt({ x, y: 10 })).toThrow();
    for (const column of [-1, .5, 2049, NaN]) expect(() => hydrologyRectangle({ column, row: 0 })).toThrow();
  });
});
