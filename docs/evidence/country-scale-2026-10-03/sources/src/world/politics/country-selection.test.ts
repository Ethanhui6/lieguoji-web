import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import type { CountrySource } from './geography';

// This synthetic regular-grid adapter tests selection scale and contracts. It
// is deliberately not a generated-world performance or real-terrain claim.
const fixture = vi.hoisted(() => ({ side: 8, seaModulo: 0, source: {
  draftId: 'atlas-00000000-0000-0000-0000-000000000001', revision: 0,
  rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 as const,
} }));
vi.mock('./geography', async importOriginal => {
  const actual = await importOriginal<typeof import('./geography')>();
  return { ...actual,
    countryGeographySource: vi.fn(() => ({ ...fixture.source })),
    readCountryCellGeometryPage: vi.fn(async (_data: AtlasDocument, cursor: number, limit: number, control?: AtlasControl) => {
      control?.signal?.throwIfAborted(); await control?.yieldTask?.(); control?.signal?.throwIfAborted();
      const totalCells = fixture.side ** 2, end = Math.min(cursor + limit, totalCells), quadsQ = new Int32Array((end - cursor) * 8), step = 4096 * 256 / fixture.side;
      for (let id = cursor; id < end; id++) { const x = id % fixture.side * step, y = Math.floor(id / fixture.side) * step;
        quadsQ.set([x, y, x + step, y, x + step, y + step, x, y + step], (id - cursor) * 8); }
      return { source: { ...fixture.source }, cursor, totalCells, nextCursor: end === totalCells ? null : end, quadsQ };
    }),
    countryClaimCells: vi.fn(async (_data: AtlasDocument, ids: readonly number[], control?: AtlasControl) => {
      control?.signal?.throwIfAborted(); await control?.yieldTask?.(); control?.signal?.throwIfAborted();
      return ids.filter(id => !fixture.seaModulo || id % fixture.seaModulo !== 0);
    }),
  };
});
import { countryClaimCells, readCountryCellGeometryPage } from './geography';
import { COUNTRY_SELECTION_LIMITS, selectCountryPolygon, validateCountryPolygonOutline, type CountryPolygonPoint } from './country-selection';

const data = {} as AtlasDocument, fast = { yieldTask: async () => {} };
const outline = (points: number[][]): CountryPolygonPoint[] => points.map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
const wholeWorld = () => outline([[0, 0], [4096, 0], [4096, 4096], [0, 4096]]);
beforeEach(() => { fixture.side = 8; fixture.seaModulo = 0; vi.clearAllMocks(); });

describe('bounded whole-cell polygon selection (synthetic scale fixtures)', () => {
  it('selects all 65,536 fixture cells in bounded pages without treating it as real-world performance evidence', async () => {
    fixture.side = 256; const progress: { stage: string; completed: number; total: number }[] = [];
    const result = await selectCountryPolygon(data, { source: { ...fixture.source }, pointsQ: wholeWorld() }, { ...fast, onProgress: p => progress.push(p) });
    expect(result).toEqual({ source: fixture.source, rule: 'cell-center-land-v1', cellIds: Array.from({ length: 65536 }, (_, i) => i), scannedCells: 65536, polygonMatchedCells: 65536, seaRejectedCells: 0 });
    expect(readCountryCellGeometryPage).toHaveBeenCalledTimes(64); expect(countryClaimCells).toHaveBeenCalledTimes(64);
    expect(vi.mocked(countryClaimCells).mock.calls.every(call => call[1].length <= 1024)).toBe(true);
    expect(vi.mocked(readCountryCellGeometryPage).mock.calls.every(call => call[2] === 1024)).toBe(true);
    expect(progress.at(-1)).toEqual({ stage: '核验圈地实际陆地', completed: 65536, total: 65536 });
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(512 * 1024 - 4096);
  });

  it('uses concave outlines, accepts both windings and includes exact diagonal-boundary centers', async () => {
    const lShape = outline([[0, 0], [4096, 0], [4096, 1024], [1024, 1024], [1024, 4096], [0, 4096]]);
    const expected = Array.from({ length: 64 }, (_, i) => i).filter(i => Math.floor(i / 8) < 2 || i % 8 < 2);
    expect((await selectCountryPolygon(data, { source: fixture.source, pointsQ: lShape }, fast)).cellIds).toEqual(expected);
    expect((await selectCountryPolygon(data, { source: fixture.source, pointsQ: [...lShape].reverse() }, fast)).cellIds).toEqual(expected);
    const triangle = outline([[0, 0], [4096, 0], [0, 4096]]);
    expect((await selectCountryPolygon(data, { source: fixture.source, pointsQ: triangle }, fast)).cellIds)
      .toEqual(Array.from({ length: 64 }, (_, i) => i).filter(i => Math.floor(i / 8) + i % 8 <= 7));
  });

  it('filters sea through bounded land queries and rejects overflow without returning truncated claims', async () => {
    fixture.seaModulo = 3;
    const selected = await selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, fast);
    expect(selected.cellIds).toEqual(Array.from({ length: 64 }, (_, i) => i).filter(i => i % 3 !== 0));
    expect(selected.polygonMatchedCells).toBe(64); expect(selected.seaRejectedCells).toBe(22);
    fixture.side = 512; fixture.seaModulo = 0; vi.clearAllMocks();
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, fast)).rejects.toThrow('65,536');
    expect(countryClaimCells).toHaveBeenCalledTimes(65);
  });

  it('strictly rejects invalid simple rings before geometry reads and allows forward collinear vertices', async () => {
    const invalid = [[], outline([[0, 0], [20, 20]]), outline([[0, 0], [20, 20], [0, 20], [20, 0]]),
      outline([[0, 0], [20, 0], [10, 0], [10, 20], [0, 20]]), outline([[0, 0], [10, 0], [20, 0]]),
      outline([[0, 0], [20, 0], [20, 20], [0, 0]]), outline([[0, 0], [20, 0], [20, 20], [10, 0], [0, 20]]),
      outline([[0, 0], [4097, 0], [0, 20]]), [{ xQ: .5, yQ: 0 }, { xQ: 256, yQ: 0 }, { xQ: 0, yQ: 256 }],
      Array.from({ length: COUNTRY_SELECTION_LIMITS.vertices + 1 }, (_, i) => ({ xQ: i, yQ: i }))];
    for (const pointsQ of invalid) { expect(validateCountryPolygonOutline(pointsQ)).toBe(false);
      await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ }, fast)).rejects.toThrow(); }
    const getter = vi.fn(() => 0), point = { xQ: 0, yQ: 0 }; Object.defineProperty(point, 'xQ', { enumerable: true, get: getter });
    expect(validateCountryPolygonOutline([point, { xQ: 20, yQ: 0 }, { xQ: 0, yQ: 20 }])).toBe(false); expect(getter).not.toHaveBeenCalled();
    expect(readCountryCellGeometryPage).not.toHaveBeenCalled();
    expect(validateCountryPolygonOutline(outline([[0, 0], [10, 0], [20, 0], [20, 20], [0, 20]]))).toBe(true);
  });

  it('captures source/outline before yields, rejects source mismatches and does not expose cancelled partial selections', async () => {
    const source: CountrySource = { ...fixture.source }, pointsQ = wholeWorld(); let changed = false;
    const result = await selectCountryPolygon(data, { source, pointsQ }, { yieldTask: async () => {
      if (!changed) { changed = true; source.rootDigest = 'f'.repeat(64); pointsQ[0].xQ = 12345; pointsQ.pop(); }
    } });
    expect(changed).toBe(true); expect(result.source).toEqual(fixture.source); expect(result.cellIds).toHaveLength(64);
    vi.clearAllMocks(); await expect(selectCountryPolygon(data, { source, pointsQ: wholeWorld() }, fast)).rejects.toThrow('来源身份');
    expect(readCountryCellGeometryPage).not.toHaveBeenCalled();
    const aborted = new AbortController(); aborted.abort();
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, { signal: aborted.signal })).rejects.toThrow();
    expect(readCountryCellGeometryPage).not.toHaveBeenCalled();
    const running = new AbortController(); fixture.side = 256;
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, { ...fast, signal: running.signal,
      onProgress: p => { if (p.stage === '按地理单元中心圈地' && p.completed === 128) running.abort(); } })).rejects.toThrow();
    expect(countryClaimCells).not.toHaveBeenCalled();
    vi.clearAllMocks(); const afterFirstPage = new AbortController();
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, { ...fast, signal: afterFirstPage.signal,
      onProgress: p => { if (p.stage === '核验圈地实际陆地' && p.completed === 1024) afterFirstPage.abort(); } })).rejects.toThrow();
    expect(countryClaimCells).toHaveBeenCalledTimes(1); expect(readCountryCellGeometryPage).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed geometry page or land response without accepting foreign IDs', async () => {
    vi.mocked(readCountryCellGeometryPage).mockResolvedValueOnce({ source: fixture.source, cursor: 0, totalCells: 64, nextCursor: null, quadsQ: new Int32Array(8) });
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, fast)).rejects.toThrow('分页不完整');
    vi.mocked(countryClaimCells).mockResolvedValueOnce([0, 0]);
    await expect(selectCountryPolygon(data, { source: fixture.source, pointsQ: wholeWorld() }, fast)).rejects.toThrow('无效地块');
  });
});
