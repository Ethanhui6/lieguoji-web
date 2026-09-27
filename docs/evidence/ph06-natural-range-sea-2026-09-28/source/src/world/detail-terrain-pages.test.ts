import { describe, expect, it, vi } from 'vitest';
import { detailCoastKey, detailCoastOwnerLayout, type DetailCoastField, type DetailCoastSampleTile } from './detail-coast-types';
import { copyDetailTerrainChunkToPage, detailTerrainIndexAddress, detailTerrainNodeAddress, detailTerrainPageLayout, detailTerrainSourceLedger,
  packDetailTerrainNodeRange, readDetailTerrainSample, writeDetailTerrainSample } from './detail-terrain-pages';

describe('v4 derived node-page byte contract (CPU, not GPU acceptance)', () => {
  it('counts four full pages and the exact five-row tail, including all physical padding', () => {
    const ledger = detailTerrainSourceLedger();
    expect(ledger).toMatchObject({ nodeCount: 4198401, nodeBytes: 16793604, pixels: 4199424, byteLength: 16797696, paddingPixels: 1023 });
    expect(ledger.pages.map(page => [page.width, page.height])).toEqual([[1024, 1024], [1024, 1024], [1024, 1024], [1024, 1024], [1024, 5]]);
    expect(ledger.pages.reduce((sum, page) => sum + page.byteLength, 0)).toBe(ledger.byteLength);
    expect(ledger.pages.reduce((sum, page) => sum + page.nodeCount, 0)).toBe(2049 ** 2);
    expect(ledger.pages[4]).toMatchObject({ startNode: 4194304, nodeCount: 4097, pixels: 5120, byteLength: 20480 });
    expect(ledger.pixels + 2 * 1201 * 33).toBe(4278690);
    expect(Math.floor(32 * 1024 * 1024 * .75) - ledger.pixels - 2 * 1201 * 33).toBe(20887134);
  });

  it('uses row-major 2049 nodes, including the shared outer world boundary and every page transition', () => {
    expect(detailTerrainNodeAddress(0, 0)).toEqual({ nodeIndex: 0, page: 0, texel: 0, x: 0, y: 0, byteOffset: 0 });
    expect(detailTerrainNodeAddress(2048, 0)).toMatchObject({ nodeIndex: 2048, page: 0, x: 0, y: 2 });
    expect(detailTerrainNodeAddress(0, 1)).toMatchObject({ nodeIndex: 2049, page: 0, x: 1, y: 2 });
    for (let page = 1; page < 5; page++) {
      const start = page * 1048576;
      expect(detailTerrainIndexAddress(start - 1)).toMatchObject({ page: page - 1, x: 1023, y: 1023, byteOffset: 4194300 });
      expect(detailTerrainIndexAddress(start)).toMatchObject({ page, x: 0, y: 0, byteOffset: 0 });
      expect(detailTerrainNodeAddress(start % 2049, Math.floor(start / 2049))).toEqual(detailTerrainIndexAddress(start));
    }
    expect(detailTerrainNodeAddress(2048, 2048)).toEqual({ nodeIndex: 4198400, page: 4, texel: 4096, x: 0, y: 4, byteOffset: 16384 });
    expect(() => detailTerrainIndexAddress(4198401)).toThrow(); expect(() => detailTerrainNodeAddress(2049, 0)).toThrow();
    expect(() => detailTerrainNodeAddress(.5, 0)).toThrow(); expect(() => detailTerrainPageLayout(5)).toThrow();
  });

  it.each([
    [{ coverageQ: -32767, heightMeters: -12000 }, [1, 128, 32, 209]],
    [{ coverageQ: -1, heightMeters: -1 }, [255, 255, 255, 255]],
    [{ coverageQ: 0, heightMeters: 0 }, [0, 0, 0, 0]],
    [{ coverageQ: 1, heightMeters: 12000 }, [1, 0, 224, 46]],
    [{ coverageQ: 32767, heightMeters: 0 }, [255, 127, 0, 0]],
  ] as const)('keeps the signed 16-bit sample %j as lossless RGBA data bytes', (sample, expected) => {
    const target = new Uint8Array(12).fill(37); writeDetailTerrainSample(target, 4, sample);
    expect([...target.subarray(4, 8)]).toEqual(expected); expect([...target.subarray(0, 4)]).toEqual([37, 37, 37, 37]);
    expect([...target.subarray(8)]).toEqual([37, 37, 37, 37]); expect(readDetailTerrainSample(target, 4)).toEqual(sample);
  });

  it('rejects reserved coverage, out-of-range/noninteger heights and mismatched land/sea data', () => {
    for (const sample of [{ coverageQ: -32768, heightMeters: -1 }, { coverageQ: 32768, heightMeters: 1 }, { coverageQ: 1, heightMeters: 12001 },
      { coverageQ: 1, heightMeters: -1 }, { coverageQ: -1, heightMeters: 0 }, { coverageQ: 0, heightMeters: 1 }, { coverageQ: 1, heightMeters: .5 }]) {
      expect(() => writeDetailTerrainSample(new Uint8Array(4), 0, sample)).toThrow();
    }
    expect(() => readDetailTerrainSample(new Uint8Array([0, 128, 255, 255]))).toThrow();
    expect(() => readDetailTerrainSample(new Uint8Array(3))).toThrow();
    expect(() => writeDetailTerrainSample(new Uint8Array(4), 1, { coverageQ: 0, heightMeters: 0 })).toThrow();
  });

  it('packs unique-owner boundary values and uses the actual coarse sampler only for missing nodes', () => {
    const layout = detailCoastOwnerLayout(0, 0), tile: DetailCoastSampleTile = { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'samples', bx: 0, by: 0,
      coverageQ: new Int16Array(layout.count).fill(128), elevationMeters: new Int16Array(layout.count).fill(20) };
    const sampleBaseElevation = vi.fn(() => -15), field: DetailCoastField = { tiles: new Map([[detailCoastKey(0, 0), tile]]), sampleBaseElevation };
    const result = packDetailTerrainNodeRange(field, 16 * 2049 + 32, 2);
    expect(readDetailTerrainSample(result.bytes)).toEqual({ coverageQ: 128, heightMeters: 20 });
    expect(readDetailTerrainSample(result.bytes, 4)).toEqual({ coverageQ: -32767, heightMeters: -15 });
    expect(sampleBaseElevation).toHaveBeenCalledTimes(1); expect(sampleBaseElevation).toHaveBeenCalledWith(33 * 512, 16 * 512);
    result.bytes.fill(0); expect(tile.coverageQ[0]).toBe(128); expect(tile.elevationMeters[0]).toBe(20);
    expect(() => packDetailTerrainNodeRange(field, 0, 4097)).toThrow(); expect(() => packDetailTerrainNodeRange(field, 4198400, 2)).toThrow();
  });

  it('assembles a page-crossing chunk once per real node and never writes into the tail padding', () => {
    const field: DetailCoastField = { tiles: new Map(), sampleBaseElevation: () => -17 }, chunk = packDetailTerrainNodeRange(field, 4194302, 4);
    const fourth = new Uint8Array(detailTerrainPageLayout(3).byteLength), fifth = new Uint8Array(detailTerrainPageLayout(4).byteLength).fill(71);
    expect(copyDetailTerrainChunkToPage(3, fourth, chunk)).toBe(2); expect(copyDetailTerrainChunkToPage(4, fifth, chunk)).toBe(2);
    expect(readDetailTerrainSample(fourth, fourth.length - 4)).toEqual({ coverageQ: -32767, heightMeters: -17 });
    expect(readDetailTerrainSample(fifth)).toEqual({ coverageQ: -32767, heightMeters: -17 });
    const last = packDetailTerrainNodeRange(field, 4198400, 1); expect(copyDetailTerrainChunkToPage(4, fifth, last)).toBe(1);
    expect(readDetailTerrainSample(fifth, 16384)).toEqual({ coverageQ: -32767, heightMeters: -17 });
    expect(fifth.subarray(16388).every(value => value === 71)).toBe(true);
    expect(copyDetailTerrainChunkToPage(3, fourth, last)).toBe(0);
    expect(() => copyDetailTerrainChunkToPage(4, fifth, { ...chunk, nodeCount: 5 })).toThrow();
    expect(() => copyDetailTerrainChunkToPage(4, fifth.subarray(4), last)).toThrow();
  });
});
