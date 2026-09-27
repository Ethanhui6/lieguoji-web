import { describe, expect, it } from 'vitest';
import { makeProtectionRequest, protectionRectangle, protectionSelectionStep } from './region-protection-controls';
import type { AtlasGridSpec } from '../world/model';

const spec: AtlasGridSpec = { kind: 'shared-quad-grid-v1', columns: 256, rows: 256, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 };
describe('region protection controls without storage writes', () => {
  it('allows any picked cell including sea without requiring a relief land pick', () => {
    expect(protectionSelectionStep(null, 0, spec)).toEqual({ kind: 'anchor', anchor: 0 });
    expect(protectionSelectionStep(0, 0, spec)).toEqual({ kind: 'complete', rectangle: { column: 0, row: 0, columns: 1, rows: 1 } });
  });
  it('normalizes reversed corners including world edges without shifting the chosen range', () => {
    expect(protectionRectangle(65535, 0, spec)).toEqual({ column: 0, row: 0, columns: 256, rows: 256 });
    expect(protectionRectangle(50 * 256 + 20, 40 * 256 + 40, spec)).toEqual({ column: 20, row: 40, columns: 21, rows: 11 });
  });
  it('rejects stale, fractional and invalid corner identities', () => {
    for (const id of [-1, 65536, 1.5, NaN]) {
      expect(() => protectionSelectionStep(null, id, spec)).toThrow('当前地图');
      expect(() => protectionRectangle(id, 0, spec)).toThrow('当前地图');
    }
  });
  it('preserves the requested mask/action for the real Worker and takes an independent rectangle', () => {
    const rectangle = { column: 8, row: 9, columns: 4, rows: 5 };
    for (const mask of [1, 2, 3]) for (const action of ['set', 'clear']) {
      const request = makeProtectionRequest(rectangle, mask, action, spec);
      expect(request).toEqual({ rectangle, mask, action });
      request.rectangle.column = 30; expect(rectangle.column).toBe(8);
    }
  });
  it('rejects invalid controls without changing scope or silently choosing a different mask', () => {
    const rectangle = { column: 0, row: 0, columns: 1, rows: 1 };
    for (const mask of [0, 4, NaN, 1.5]) expect(() => makeProtectionRequest(rectangle, mask, 'set', spec)).toThrow('保护内容');
    expect(() => makeProtectionRequest(rectangle, 1, 'toggle', spec)).toThrow('锁定操作');
    for (const invalid of [{ ...rectangle, column: 256 }, { ...rectangle, rows: 0 }, { ...rectangle, columns: 2.5 }]) expect(() => makeProtectionRequest(invalid, 3, 'clear', spec)).toThrow('范围');
  });
});
