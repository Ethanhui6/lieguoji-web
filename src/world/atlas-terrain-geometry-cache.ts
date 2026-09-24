import { Graphics } from 'pixi.js';
import type { BlockKey } from './model';
import type { AtlasAabb } from './spatial-index';

export const ATLAS_TERRAIN_GEOMETRY_ENTRY_LIMIT = 128;
export const ATLAS_TERRAIN_GEOMETRY_QUAD_LIMIT = 131072;
export type AtlasTerrainGeometrySpec = {
  atlasId: string;
  blockKey: BlockKey;
  bounds: AtlasAabb;
  dependencies: { key: BlockKey; hash: string }[];
};
type Entry = { spec: AtlasTerrainGeometrySpec; graphics: Graphics; quads: number; used: number };
const contains = (outer: AtlasAabb, inner: AtlasAabb) => outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;

/** Retain only terrain geometry already needed by a real texture render. A
 * higher sampling density may reuse its world-space paths and tessellation,
 * never a lower-density bitmap. Texture pixels have a separate 32 Mi ledger;
 * these entry/quad caps bound retained geometry, not total browser GPU bytes. */
export class AtlasTerrainGeometryCache {
  private readonly entries = new Map<BlockKey, Entry>();
  private clock = 0;
  private liveQuads = 0;
  private reservedQuads = 0;
  private reservedEntries = 0;
  private peakQuads = 0;
  private created = 0;
  private destroyed = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private releaseFailures = 0;
  private failure?: Error;
  constructor(readonly entryLimit = ATLAS_TERRAIN_GEOMETRY_ENTRY_LIMIT, readonly quadLimit = ATLAS_TERRAIN_GEOMETRY_QUAD_LIMIT) {
    if (!Number.isSafeInteger(entryLimit) || entryLimit < 1 || entryLimit > ATLAS_TERRAIN_GEOMETRY_ENTRY_LIMIT
      || !Number.isSafeInteger(quadLimit) || quadLimit < 1 || quadLimit > ATLAS_TERRAIN_GEOMETRY_QUAD_LIMIT) throw new Error('地图地形几何缓存上限无效。');
  }
  stats() {
    return { entries: this.entries.size, quads: this.liveQuads + this.reservedQuads, liveQuads: this.liveQuads, reservedQuads: this.reservedQuads, reservedEntries: this.reservedEntries,
      peakQuads: this.peakQuads, quadLimit: this.quadLimit, entryLimit: this.entryLimit, created: this.created, destroyed: this.destroyed,
      hits: this.hits, misses: this.misses, evictions: this.evictions, releaseFailures: this.releaseFailures };
  }
  get(spec: AtlasTerrainGeometrySpec, refs: ReadonlyMap<BlockKey, string>) {
    if (this.failure) throw this.failure;
    const entry = this.entries.get(spec.blockKey);
    if (entry && entry.spec.atlasId === spec.atlasId && contains(entry.spec.bounds, spec.bounds) && entry.spec.dependencies.every(ref => refs.get(ref.key) === ref.hash)) {
      entry.used = ++this.clock; this.hits++; return entry.graphics;
    }
    this.misses++;
    if (entry) this.release(spec.blockKey, false);
    return undefined;
  }
  private release(key: BlockKey, evicted: boolean) {
    const entry = this.entries.get(key); if (!entry) return;
    try {
      entry.graphics.destroy(); this.entries.delete(key); this.liveQuads -= entry.quads; this.destroyed++;
      if (evicted) this.evictions++;
    } catch (error) {
      // A failed release remains charged. Never reuse unknown GPU ownership.
      this.releaseFailures++; this.failure ??= error instanceof Error ? error : new Error(String(error)); throw this.failure;
    }
  }
  create(spec: AtlasTerrainGeometrySpec, quads: number, build: (graphics: Graphics) => void) {
    if (this.failure) throw this.failure;
    if (this.entries.has(spec.blockKey)) throw new Error('地形几何缓存应先核验已有条目。');
    if (!Number.isSafeInteger(quads) || quads < 1 || quads > this.quadLimit) throw new Error('单块地形几何超过缓存上限。');
    const bounds = spec.bounds;
    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY
      || !spec.dependencies.length || spec.dependencies.some(ref => !ref.hash)) throw new Error('地形几何缓存范围或依赖无效。');
    while (this.entries.size + this.reservedEntries + 1 > this.entryLimit || this.liveQuads + this.reservedQuads + quads > this.quadLimit) {
      let oldest: Entry | undefined;
      for (const entry of this.entries.values()) if (!oldest || entry.used < oldest.used) oldest = entry;
      if (!oldest) throw new Error('地形几何缓存无法在预算内分配。');
      this.release(oldest.spec.blockKey, true);
    }
    this.reservedEntries++; this.reservedQuads += quads; this.peakQuads = Math.max(this.peakQuads, this.liveQuads + this.reservedQuads);
    let graphics: Graphics | undefined;
    try {
      graphics = new Graphics({ autoGarbageCollect: false }); this.created++;
      build(graphics);
      this.entries.set(spec.blockKey, { spec: { atlasId: spec.atlasId, blockKey: spec.blockKey, bounds: { ...bounds }, dependencies: spec.dependencies.map(ref => ({ ...ref })) }, graphics, quads, used: ++this.clock });
      this.liveQuads += quads; this.reservedQuads -= quads; this.reservedEntries--;
      return graphics;
    } catch (error) {
      try { if (graphics) { graphics.destroy(); this.destroyed++; } this.reservedQuads -= quads; this.reservedEntries--; }
      catch (releaseError) { this.releaseFailures++; this.failure = releaseError instanceof Error ? releaseError : new Error(String(releaseError)); }
      throw error;
    }
  }
  invalidateDependencies(changed: ReadonlySet<BlockKey>) {
    this.releaseAll([...this.entries].filter(([, entry]) => entry.spec.dependencies.some(ref => changed.has(ref.key))).map(([key]) => key));
  }
  private releaseAll(keys: BlockKey[]) {
    let failure: unknown;
    for (const key of keys) try { this.release(key, false); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
  clear() { this.releaseAll([...this.entries.keys()]); }
}
