import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasTerrainGeometryCache, type AtlasTerrainGeometrySpec } from './atlas-terrain-geometry-cache';
import type { BlockKey } from './model';
import type { AtlasRetainedTerrain } from './atlas-terrain-geometry-cache';

const gpu = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }));
vi.mock('pixi.js', () => ({ Graphics: class {
  constructor(options: unknown) { gpu.create(options); }
  destroy() { gpu.destroy(this); }
} }));
const spec = (id = 0): AtlasTerrainGeometrySpec => ({ atlasId: 'atlas-one', blockKey: `geometry:${id}:0`, bounds: { minX: -8, minY: -8, maxX: 520, maxY: 520 },
  dependencies: [{ key: `geometry:${id}:0`, hash: `geometry-${id}` }, { key: `elevation:${id}:0`, hash: `elevation-${id}` }, { key: 'geometry:0:1', hash: 'shared-north' }, { key: 'elevation:0:1', hash: 'halo-north' }] });
const refs = (value: AtlasTerrainGeometrySpec) => new Map(value.dependencies.map(ref => [ref.key, ref.hash]));
const subset = (value: AtlasTerrainGeometrySpec): AtlasTerrainGeometrySpec => ({ ...value, bounds: { minX: -4, minY: -4, maxX: 516, maxY: 516 }, dependencies: value.dependencies.slice(0, 2) });
beforeEach(() => { gpu.create.mockReset(); gpu.destroy.mockReset(); });

describe('retained terrain Graphics ownership and real coverage', () => {
  it('charges actual surface buffers and bounds both mesh topology and real shore segments', () => {
    const cache = new AtlasTerrainGeometryCache(2, 3), destroy = vi.fn();
    const resource = { destroy, terrainBuffers: { bytes: 128, vertices: 5, triangles: 4, shoreSegments: 2 } } as unknown as AtlasRetainedTerrain;
    cache.create(spec(), 1, () => undefined, () => resource);
    expect(cache.stats()).toMatchObject({ surfaceMeshBufferBytes: 128, liveSurfaceMeshBufferBytes: 128, reservedSurfaceMeshBufferBytes: 0,
      surfaceMeshBufferByteLimit: 384, vertices: 5, triangles: 4, shoreSegments: 2, shoreSegmentLimit: 12 });
    cache.clear(); expect(destroy).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({ surfaceMeshBufferBytes: 0, vertices: 0, triangles: 0, shoreSegments: 0 });
    const oversized = { destroy: vi.fn(), terrainBuffers: { bytes: 129, vertices: 5, triangles: 4, shoreSegments: 0 } } as unknown as AtlasRetainedTerrain;
    expect(() => cache.create(spec(), 1, () => undefined, () => oversized)).toThrow('资源上限');
    expect(oversized.destroy).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({ entries: 0, surfaceMeshBufferBytes: 0, reservedSurfaceMeshBufferBytes: 0 });
  });
  it('reuses actual wider terrain geometry without construction and owns immutable coverage/dependency records', () => {
    const cache = new AtlasTerrainGeometryCache(), initial = spec(), narrower = subset(initial), current = refs(initial), build = vi.fn();
    expect(cache.get(initial, current)).toBeUndefined(); const graphics = cache.create(initial, 1156, build);
    initial.bounds.maxX = 0; initial.dependencies[0].hash = 'caller-mutated';
    expect(cache.get(narrower, current)).toBe(graphics); expect(build).toHaveBeenCalledTimes(1);
    expect(gpu.create).toHaveBeenCalledWith({ autoGarbageCollect: false });
    expect(cache.stats()).toMatchObject({ created: 1, destroyed: 0, entries: 1, quads: 1156, liveQuads: 1156, reservedQuads: 0, reservedEntries: 0, hits: 1, misses: 1 });
    cache.clear(); expect(gpu.destroy).toHaveBeenCalledWith(graphics);
    expect(cache.stats()).toMatchObject({ created: 1, destroyed: 1, entries: 0, quads: 0, peakQuads: 1156, hits: 1 });
  });

  it.each(['wider-halo', 'neighbor-geometry', 'neighbor-elevation', 'different-atlas'])('%s cannot reuse an incompatible retained Graphics', reason => {
    const cache = new AtlasTerrainGeometryCache(), initial = spec(), current = refs(initial), request = subset(initial);
    cache.create(initial, 1156, () => undefined);
    if (reason === 'wider-halo') request.bounds.minX = -16;
    else if (reason === 'neighbor-geometry') current.set('geometry:0:1', 'edited-shared-vertex');
    else if (reason === 'neighbor-elevation') current.set('elevation:0:1', 'edited-halo-color');
    else request.atlasId = 'different-atlas';
    expect(cache.get(request, current)).toBeUndefined();
    expect(cache.stats()).toMatchObject({ entries: 0, quads: 0, created: 1, destroyed: 1, misses: 1 });
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
  });

  it.each([{ entries: 2, quads: 100 }, { entries: 128, quads: 6 }])('enforces both capacity limits and evicts the actually least-recently-used entry: %j', limits => {
    const cache = new AtlasTerrainGeometryCache(limits.entries, limits.quads), first = spec(0), second = spec(1), third = spec(2);
    const a = cache.create(first, 3, () => undefined), b = cache.create(second, 3, () => undefined);
    expect(cache.get(subset(first), refs(first))).toBe(a);
    cache.create(third, 3, () => undefined);
    expect(gpu.destroy).toHaveBeenCalledTimes(1); expect(gpu.destroy.mock.calls[0][0]).toBe(b);
    expect(gpu.destroy.mock.calls.some(([graphics]) => graphics === a)).toBe(false);
    expect(cache.stats()).toMatchObject({ entries: 2, quads: 6, peakQuads: 6, created: 3, destroyed: 1, evictions: 1 });
    cache.invalidateDependencies(new Set<BlockKey>(['geometry:0:1']));
    expect(cache.stats()).toMatchObject({ entries: 0, quads: 0, created: 3, destroyed: 3, evictions: 1 });
    expect(gpu.create).toHaveBeenCalledTimes(3); // Invalidating is release-only, never prewarming.
  });

  it('disposes a failed builder before releasing its reserved capacity', () => {
    const cache = new AtlasTerrainGeometryCache();
    expect(() => cache.create(spec(), 12, () => { throw new Error('path construction failed'); })).toThrow('path construction failed');
    expect(cache.stats()).toMatchObject({ entries: 0, quads: 0, reservedEntries: 0, reservedQuads: 0, created: 1, destroyed: 1, releaseFailures: 0 });
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
  });

  it('failed disposal remains charged and blocks new cache use', () => {
    const cache = new AtlasTerrainGeometryCache(), original = spec(); cache.create(original, 12, () => undefined);
    gpu.destroy.mockImplementationOnce(() => { throw new Error('geometry disposal failed'); });
    expect(() => cache.clear()).toThrow('geometry disposal failed');
    expect(cache.stats()).toMatchObject({ entries: 1, quads: 12, created: 1, destroyed: 0, releaseFailures: 1 });
    expect(() => cache.get(original, refs(original))).toThrow('geometry disposal failed');
    expect(() => cache.create(spec(1), 12, () => undefined)).toThrow('geometry disposal failed');
    cache.clear(); expect(cache.stats()).toMatchObject({ entries: 0, quads: 0, destroyed: 1, releaseFailures: 1 });
  });
});
