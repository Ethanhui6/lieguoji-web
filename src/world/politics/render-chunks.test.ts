import { describe, expect, it } from 'vitest';
import { countryChunkVisible, countryExposedSides, countryRenderBounds, countryRenderChunk, expandCountryRenderBounds } from './render-chunks';

describe('political display chunks (synthetic geometry, not device acceptance)', () => {
  it('groups 65,536 owned cells into 1,024 spatial paths and keeps only real outer borders', () => {
    const owners = new Map(Array.from({ length: 65536 }, (_, id) => [id, 'nation-a'] as const)), chunks = new Set<string>();
    let segments = 0;
    for (const id of owners.keys()) { chunks.add(countryRenderChunk(id, 256)); segments += countryExposedSides(id, 256, 256, 'nation-a', owners).filter(Boolean).length; }
    expect(chunks.size).toBe(1024); expect(segments).toBe(1024);
    expect(countryExposedSides(128 * 256 + 128, 256, 256, 'nation-a', owners)).toEqual([false, false, false, false]);
  });
  it('retains boundaries against other nations and does not infer a border from viewport culling', () => {
    const owners = new Map([[0, 'a'], [1, 'a'], [2, 'b'], [3, 'a'], [4, 'a'], [5, 'b']]);
    expect(countryExposedSides(1, 3, 2, 'a', owners)).toEqual([true, true, false, false]);
    expect(countryExposedSides(4, 3, 2, 'a', owners)).toEqual([false, true, true, false]);
  });
  it('culls from actual displaced geometry bounds with a small stroke margin', () => {
    const bounds = countryRenderBounds([{ x: 5, y: 4 }, { x: 26, y: -3 }, { x: 18, y: 22 }]);
    expandCountryRenderBounds(bounds, { left: 0, top: 0, right: 20, bottom: 30 });
    expect(bounds).toEqual({ left: 0, top: -3, right: 26, bottom: 30 });
    expect(countryChunkVisible(bounds, { x: -40, y: 0, scale: 1 }, 20, 20)).toBe(false);
    expect(countryChunkVisible(bounds, { x: -40, y: 0, scale: 2 }, 20, 20)).toBe(true);
  });
});
