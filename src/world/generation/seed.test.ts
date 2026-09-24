import { describe, expect, it } from 'vitest';
import { hashAt, integerSqrt, noiseQ12, roundRatio, seedHash, warpedWorldQ } from './seed';

describe('macro integer streams and continuous world fields', () => {
  it('preserves literal UTF-8 seed text and isolates tagged streams', () => {
    expect(seedHash('山海')).toBe(seedHash('山海'));
    expect(new Set(['山海', ' 山海', '山海 ', 'e\u0301', '\u00e9'].map(seedHash)).size).toBe(5);
    expect(hashAt(seedHash('seed'), 11, -1, 0)).not.toBe(hashAt(seedHash('seed'), 12, -1, 0));
    expect(hashAt(seedHash('seed'), 11, -1, 0)).not.toBe(hashAt(seedHash('seed'), 11, 0, -1));
  });
  it('has explicit negative rounding and exact integer distances', () => {
    expect([-5, -3, -1, 1, 3, 5].map(n => roundRatio(n, 2))).toEqual([-2, -1, 0, 1, 2, 3]);
    for (const value of [0, 1, 2, 3, 4, 15, 16, 17, 2 ** 41, Number.MAX_SAFE_INTEGER]) {
      const root = integerSqrt(value); expect(root * root).toBeLessThanOrEqual(value); expect((root + 1) * (root + 1)).toBeGreaterThan(value);
    }
    expect(() => integerSqrt(1.5)).toThrow(); expect(() => integerSqrt(-1)).toThrow();
  });
  it('samples smooth absolute coordinates instead of assigning independent random cells', () => {
    const seed = seedHash('continuous-coasts'); let peakDifference = 0;
    for (let x = -256; x < 4096; x++) {
      const a = noiseQ12(seed, 11, x * 256, 456 * 256, 128 * 256), b = noiseQ12(seed, 11, (x + 1) * 256, 456 * 256, 128 * 256);
      expect(a).toBeGreaterThanOrEqual(-4096); expect(a).toBeLessThanOrEqual(4096); peakDifference = Math.max(peakDifference, Math.abs(a - b));
    }
    expect(peakDifference).toBeGreaterThan(0); expect(peakDifference).toBeLessThan(100);
  });
  it('keeps every warped boundary sample on the world boundary and interior samples inside', () => {
    const world = 4096 * 256;
    for (const text of ['one', 'two', 'three']) for (let p = 0; p <= world; p += world / 32) {
      for (const [x, y] of [[p, 0], [p, world], [0, p], [world, p]]) {
        const result = warpedWorldQ(seedHash(text), x, y); expect(result.some(v => v === 0 || v === world)).toBe(true);
        expect(result.every(v => v >= 0 && v <= world)).toBe(true);
      }
      const result = warpedWorldQ(seedHash(text), p, world / 2); expect(result.every(v => v >= 0 && v <= world)).toBe(true);
    }
  });
});
