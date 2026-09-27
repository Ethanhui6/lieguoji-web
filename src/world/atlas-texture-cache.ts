import { Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { BlockKey } from './model';

export const ATLAS_CACHE_PIXEL_LIMIT = 32 * 1024 * 1024;
export type AtlasCacheLayer = 'terrain' | 'grid';
export interface AtlasTextureSpec {
  key: string; blockKey: BlockKey; layer: AtlasCacheLayer; level: number;
  pixelWidth: number; pixelHeight: number;
  worldX: number; worldY: number; density: number;
  sampleX: number; sampleY: number;
  core: { x: number; y: number; width: number; height: number };
  dependencies: readonly BlockKey[];
}
export interface AtlasTextureEntry {
  readonly spec: AtlasTextureSpec;
  readonly texture: RenderTexture;
  readonly crop: Texture;
  readonly sprite: Sprite;
  readonly pixels: number;
  used: number;
}

/** Sole owner of all cache sprites, render textures and texture sources.
 * Every allocation is reserved before creation; old and new sources both count.
 * No Pixi texture pool, implicit mipmap, MSAA or GC allocation is used here. */
export class AtlasTextureCache {
  private readonly entries = new Map<string, AtlasTextureEntry>();
  private readonly shared = new Map<string, { texture: Texture; pixels: number }>();
  private sharedCreated = 0;
  private sharedDestroyed = 0;
  private pixels = 0;
  private reserved = 0;
  private clock = 0;
  private peakPixels = 0;
  private created = 0;
  private destroyed = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private releaseFailures = 0;
  private failure?: Error;
  constructor(readonly budgetPixels = ATLAS_CACHE_PIXEL_LIMIT) {
    if (!Number.isSafeInteger(budgetPixels) || budgetPixels <= 0 || budgetPixels > ATLAS_CACHE_PIXEL_LIMIT) throw new Error('地图缓存像素预算无效。');
  }
  stats() {
    return { pixels: this.pixels + this.reserved, livePixels: this.pixels, reservedPixels: this.reserved, peakPixels: this.peakPixels,
      sharedPixels: [...new Set(this.shared.values())].reduce((sum, entry) => sum + entry.pixels, 0), sharedEntries: new Set(this.shared.values()).size, sharedBindings: this.shared.size, sharedCreated: this.sharedCreated, sharedDestroyed: this.sharedDestroyed,
      budgetPixels: this.budgetPixels, entries: this.entries.size, created: this.created, destroyed: this.destroyed, hits: this.hits, misses: this.misses, evictions: this.evictions, releaseFailures: this.releaseFailures };
  }
  has(key: string) { return this.entries.has(key); }
  canReserve(pixels: number, protectedKeys: ReadonlySet<string>) {
    const retained = [...this.entries.values()].filter(entry => protectedKeys.has(entry.spec.key)).reduce((sum, entry) => sum + entry.pixels, 0);
    const shared = [...new Set(this.shared.values())].reduce((sum, entry) => sum + entry.pixels, 0);
    return Number.isSafeInteger(pixels) && pixels > 0 && retained + shared + this.reserved + pixels <= this.budgetPixels;
  }
  /** Small material tables are pinned while any retained mesh can reference them.
   * Their sources use the same total pixel ledger as render targets. */
  ensureShared(key: string, width: number, height: number, create: () => Texture, protectedKeys = new Set(this.entries.keys())): Texture {
    if (this.failure) throw this.failure;
    const existing = this.shared.get(key); if (existing) return existing.texture;
    if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('共享材质纹理尺寸无效。');
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels)) throw new Error('共享材质纹理像素数量溢出。');
    this.reserve(pixels, protectedKeys);
    let texture: Texture | undefined, ownsSource = true, borrowedWrapper = false;
    try {
      texture = create();
      const alias = [...this.shared.values()].find(entry => entry.texture.source === texture!.source);
      const targetAlias = [...this.entries.values()].some(entry => entry.texture.source === texture!.source);
      ownsSource = !alias && !targetAlias;
      borrowedWrapper = texture === alias?.texture;
      if (ownsSource) this.sharedCreated++;
      if (texture.source.pixelWidth !== width || texture.source.pixelHeight !== height || targetAlias) throw new Error('共享材质纹理尺寸或所有权与像素账不一致。');
      if (alias) {
        // A second Texture wrapper is not a second GPU source. Keep one owner
        // and return its canonical wrapper; never release that source twice.
        if (texture !== alias.texture) texture.destroy(false);
        this.shared.set(key, alias); this.reserved -= pixels; return alias.texture;
      }
      this.shared.set(key, { texture, pixels }); this.reserved -= pixels; this.pixels += pixels;
      return texture;
    } catch (error) {
      try { if (texture && !borrowedWrapper) { texture.destroy(ownsSource); if (ownsSource) this.sharedDestroyed++; } this.reserved -= pixels; }
      catch (releaseError) { this.releaseFailures++; this.failure = releaseError instanceof Error ? releaseError : new Error(String(releaseError)); }
      throw error;
    }
  }
  /** Caller must destroy every borrowing mesh/shader before dropping its key.
   * Multiple keys for one source share a single charge and release owner. */
  releaseShared(key: string): void {
    const entry = this.shared.get(key); if (!entry) return;
    if ([...this.shared].some(([other, value]) => other !== key && value === entry)) { this.shared.delete(key); return; }
    try { entry.texture.destroy(true); this.shared.delete(key); this.pixels -= entry.pixels; this.sharedDestroyed++; }
    catch (error) { this.releaseFailures++; this.failure ??= error instanceof Error ? error : new Error(String(error)); throw this.failure; }
  }
  get(key: string) { const entry = this.entries.get(key); if (entry) { entry.used = ++this.clock; this.hits++; } return entry; }
  forEach(visit: (entry: AtlasTextureEntry) => void) { this.entries.forEach(visit); }
  private release(key: string, evicted: boolean) {
    const entry = this.entries.get(key); if (!entry) return;
    // The sprite does not own the source: release it exactly once below.
    let failure: unknown;
    try { if (!entry.sprite.destroyed) entry.sprite.destroy({ texture: false, textureSource: false }); } catch (error) { failure = error; }
    try { if (!entry.crop.destroyed) entry.crop.destroy(false); } catch (error) { failure ??= error; }
    try {
      entry.texture.destroy(true); this.entries.delete(key); this.pixels -= entry.pixels; this.destroyed++; if (evicted) this.evictions++;
    } catch (error) { failure ??= error; this.releaseFailures++; }
    if (failure) { this.failure ??= failure instanceof Error ? failure : new Error(String(failure)); throw this.failure; }
  }
  private reserve(pixels: number, protectedKeys: ReadonlySet<string>) {
    if (pixels > this.budgetPixels) throw new Error('单个地图缓存超过像素预算。');
    while (this.pixels + this.reserved + pixels > this.budgetPixels) {
      let oldest: AtlasTextureEntry | undefined;
      for (const entry of this.entries.values()) if (!protectedKeys.has(entry.spec.key) && (!oldest || entry.used < oldest.used)) oldest = entry;
      if (!oldest) throw new Error('可见地图缓存无法在像素预算内分配。');
      this.release(oldest.spec.key, true);
    }
    this.reserved += pixels; this.peakPixels = Math.max(this.peakPixels, this.pixels + this.reserved);
  }
  ensure(spec: AtlasTextureSpec, draw: (target: RenderTexture) => void, protectedKeys: ReadonlySet<string>): AtlasTextureEntry {
    if (this.failure) throw this.failure;
    const hit = this.get(spec.key); if (hit) return hit;
    if (![spec.pixelWidth, spec.pixelHeight].every(value => Number.isSafeInteger(value) && value > 0)
      || ![spec.worldX, spec.worldY, spec.sampleX, spec.sampleY, spec.density].every(Number.isFinite) || spec.density <= 0
      || ![spec.core.x, spec.core.y].every(value => Number.isSafeInteger(value) && value >= 0)
      || ![spec.core.width, spec.core.height].every(value => Number.isSafeInteger(value) && value > 0)
      || spec.core.x + spec.core.width > spec.pixelWidth || spec.core.y + spec.core.height > spec.pixelHeight) throw new Error('地图缓存尺寸或坐标无效。');
    this.misses++;
    const pixels = spec.pixelWidth * spec.pixelHeight;
    if (!Number.isSafeInteger(pixels)) throw new Error('地图缓存像素数量溢出。');
    this.reserve(pixels, protectedKeys);
    let texture: RenderTexture | undefined, crop: Texture | undefined, sprite: Sprite | undefined;
    try {
      // DPR and density are already included in the integer pixel dimensions.
      texture = RenderTexture.create({ width: spec.pixelWidth, height: spec.pixelHeight, resolution: 1,
        antialias: false, autoGenerateMipmaps: false, mipLevelCount: 1, autoGarbageCollect: false });
      this.created++;
      if (texture.source.pixelWidth * texture.source.pixelHeight !== pixels) throw new Error('地图纹理实际像素与预留账本不一致。');
      draw(texture);
      if (texture.source.pixelWidth * texture.source.pixelHeight !== pixels) throw new Error('地图纹理绘制后尺寸意外变化。');
      // The cropped view owns no extra source. Halo pixels participate in
      // filtering, while each opaque rectangular core is displayed once.
      crop = new Texture({ source: texture.source, frame: new Rectangle(spec.core.x, spec.core.y, spec.core.width, spec.core.height) });
      sprite = new Sprite(crop); sprite.position.set(spec.worldX, spec.worldY); sprite.scale.set(1 / spec.density); sprite.visible = false;
      const entry: AtlasTextureEntry = { spec: { ...spec, core: { ...spec.core }, dependencies: [...spec.dependencies] }, texture, crop, sprite, pixels, used: ++this.clock };
      this.entries.set(spec.key, entry); this.reserved -= pixels; this.pixels += pixels;
      return entry;
    } catch (error) {
      try { sprite?.destroy({ texture: false, textureSource: false }); } catch { /* Preserve original allocation/draw failure. */ }
      try { crop?.destroy(false); } catch { /* The source remains owned below. */ }
      try { if (texture) { texture.destroy(true); this.destroyed++; } this.reserved -= pixels; }
      catch (releaseError) {
        // Unknown release outcome stays reserved: never report zero or allocate
        // over it. The renderer locks on the original error and tears down Pixi.
        this.releaseFailures++; this.failure = releaseError instanceof Error ? releaseError : new Error(String(releaseError));
      }
      throw error;
    }
  }
  invalidateBlocks(blockKeys: ReadonlySet<BlockKey>) {
    this.releaseAll([...this.entries].filter(([, entry]) => blockKeys.has(entry.spec.blockKey)).map(([key]) => key));
  }
  invalidateDependencies(keys: ReadonlySet<BlockKey>) {
    this.releaseAll([...this.entries].filter(([, entry]) => entry.spec.dependencies.some(key => keys.has(key))).map(([key]) => key));
  }
  private releaseAll(keys: string[]) {
    let failure: unknown;
    for (const key of keys) try { this.release(key, false); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
  clear() {
    let failure: unknown;
    try { this.releaseAll([...this.entries.keys()]); } catch (error) { failure = error; }
    for (const key of [...this.shared.keys()]) try { this.releaseShared(key); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
}
