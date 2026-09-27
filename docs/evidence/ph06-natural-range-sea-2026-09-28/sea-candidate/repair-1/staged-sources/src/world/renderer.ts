import { Application, Container, Graphics, Matrix, type WebGLRenderer } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { BlockKey } from './model';
import { hashAtlasManifest, verifyAtlasDocument, type AtlasGeographyView } from './atlas-format';
import { getCellLayerSlot } from './model';
import { cellVertexIds, getCellQuad, vertexIdAt, getVertexPositionQ } from './topology';
import { validateCellRectangle, type AtlasCellRectangle } from './generation-contract';
import { createSpatialIndexAsync, type SpatialIndex } from './spatial-index';
import { AtlasTextureCache, type AtlasTextureEntry, type AtlasTextureSpec, type AtlasCacheLayer } from './atlas-texture-cache';
import { AtlasTerrainGeometryCache } from './atlas-terrain-geometry-cache';
import { cameraScaleBounds, cameraWorldBounds, centerCameraAt, fitCamera, panCamera, resizeCamera, screenToWorld, zoomCameraAt, type AtlasCamera } from './camera';
import { atlasLodPolicy, resolveAtlasLod, type AtlasLod } from './lod';
import { AtlasLabelLayer, emptyAtlasLabelMetrics } from './atlas-label-layer';
import { buildTerrainSurface } from './terrain-surface';
import { AtlasTerrainMesh, ensureTerrainMaterials, TERRAIN_LUT_PIXELS } from './terrain-mesh';
import { TERRAIN_MATERIAL_VERSION } from './terrain-material';
import { COASTAL_COORDINATE_SCALE, isCoastalSurface, pickCoastalSurface, type CoastalPick } from './coastal-surface';
import { ATLAS_MINIMUM_CACHE_DENSITY, ATLAS_TEXTURE_GUTTER, planAtlasRaster, type AtlasRasterQuality } from './render-density';
import { DetailTerrainBackend, DETAIL_TERRAIN_SHARED_PIXELS } from './detail-terrain-backend';
import type { HydrologyTrace } from './hydrology-trace';

export type AtlasRenderDelta = { dirtyKeys: BlockKey[]; changedVertexIds: number[]; affectedCellIds: number[] };
export type { AtlasCamera } from './camera';
export type AtlasGraphicsState = 'ready' | 'lost' | 'restoring';
export interface AtlasOutlinePoint { xQ: number; yQ: number }
export type AtlasRendererOptions = {
  onPick: (cellId: number, surface?: CoastalPick) => void; onCamera?: (camera: AtlasCamera) => void; onFatal: (error: Error) => void;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  onGraphicsState?: (state: AtlasGraphicsState) => void;
  onOutline?: (points: AtlasOutlinePoint[]) => void;
  onOutlineCancel?: () => void;
  onPickPoint?: (point: { x: number; y: number }) => void;
};
const ocean = 0x10283f;
const minimumCacheDensity = ATLAS_MINIMUM_CACHE_DENSITY;
const paintBatchBudgetMs = 32;

/** Compare two already independently verified, immutable receiver snapshots.
 * This is a cache dependency check, never a codec/byte verifier or a reason to
 * skip the bridge's full verification. Locks, names and revision do not change
 * geography; every coarse layer and the complete fine contract/directory do. */
export function sameVerifiedDetailGeography(a: AtlasGeographyView, b: AtlasGeographyView): boolean {
  const x = a.manifest, y = b.manifest;
  return x.version === 4 && y.version === 4 && !!a.detailCoast && !!b.detailCoast
    && x.format === y.format && x.kind === y.kind && x.draftId === y.draftId && x.atlasId === y.atlasId
    && JSON.stringify(x.spec) === JSON.stringify(y.spec) && JSON.stringify(x.surface) === JSON.stringify(y.surface)
    && JSON.stringify(x.blockRefs) === JSON.stringify(y.blockRefs) && JSON.stringify(x.detailCoast) === JSON.stringify(y.detailCoast);
}

/** Production atlas only. Cached logical blocks; no experiment fixture or game rule imports. */
export class AtlasRenderer {
  private readonly app = new Application();
  private readonly scene = new Container();
  private readonly selection = new Graphics();
  private readonly preview = new Graphics();
  private readonly outline = new Graphics();
  private readonly freehand = new Graphics();
  private readonly drainage = new Graphics();
  private drainageTrace: HydrologyTrace | null = null;
  private drainageRevision = 0;
  private drawnDrainage?: { revision: number; scale: number; epoch: number; visible: boolean };
  private readonly terrainLayer = new Container();
  private readonly gridLayer = new Container();
  private readonly cache = new AtlasTextureCache();
  private readonly terrainGeometry = new AtlasTerrainGeometryCache();
  private detail?: DetailTerrainBackend;
  // The immutable backend may retain an older equivalent geographic snapshot;
  // this private binding records which verified metadata view is displayed.
  private detailDisplayData?: AtlasGeographyView;
  private refs = new Map<BlockKey, string>();
  // This is world-content invalidation, not a texture-entry flag. It survives
  // eviction, density changes and GPU loss until the core is actually visible.
  private readonly deferredDirtyCores = new Set<BlockKey>();
  private labels?: AtlasLabelLayer;
  private lod?: AtlasLod;
  private gridRequested = false;
  private rasterQuality?: AtlasRasterQuality;
  private index?: SpatialIndex;
  private data?: AtlasGeographyView;
  private committed?: { data: AtlasGeographyView; index: SpatialIndex };
  private displaySource: 'committed' | 'generation-preview' = 'committed';
  private displayCorrectFrameAt = 0;
  private selected: number | null = null;
  private previewCells: number[] = [];
  private region: (AtlasCellRectangle & { transitionCells: number }) | null = null;
  private previewVertices = new Map<number, { x: number; y: number }>();
  private previewRevision = 0;
  private drawnOutline?: { width: number; height: number; scale: number; epoch: number };
  private drawnSelection?: { data: AtlasGeographyView; selected: number | null; scale: number; epoch: number };
  private drawnPreview?: { data: AtlasGeographyView; revision: number; scale: number; epoch: number };
  private outlineMode = false;
  private outlinePoints: AtlasOutlinePoint[] = [];
  private activeOutline?: { pointerId: number; points: AtlasOutlinePoint[]; minimumDistanceQ: number };
  private outlineGestureBlocked = false;
  private outlineRevision = 0;
  private drawnFreehand?: { revision: number; scale: number; epoch: number };
  private camera: AtlasCamera = { x: 0, y: 0, scale: 1 };
  private graphicsState: AtlasGraphicsState = 'ready';
  private contextEpoch = 0;
  private restoration?: AbortController;
  private recovery?: { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
  private auditing = false;
  private readonly listeners = new AbortController();
  private observer?: ResizeObserver;
  private destroyed = false;
  private initialized = false;
  private failure?: Error;
  private pendingAcceptance?: AbortController;
  private acceptingData?: AtlasGeographyView;
  private pendingPreview?: { controller: AbortController; promise: Promise<void> };
  private clearingPreview?: Promise<void>;
  private acceptanceRepaints?: Set<BlockKey>;
  private frame = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private suppressTap = false;
  private measured = { repaintBlocks: 0, repaintBlockKeys: [] as BlockKey[], frameRepaintBlocks: 0, visibleBlocks: 0, acceptedRevision: -1, correctFrameAt: 0, frameSequence: 0, completedFrameSequence: 0, completedDrawCpuMs: 0 };
  constructor(private host: HTMLElement, private callbacks: AtlasRendererOptions) {}

  async init() {
    await this.app.init({ width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: false, autoStart: false, background: ocean, preference: 'webgl' });
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    this.initialized = true;
    const canvas = this.app.canvas;
    canvas.setAttribute('aria-label', '大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块');
    canvas.setAttribute('data-testid', 'atlas-canvas'); canvas.tabIndex = 0; canvas.style.touchAction = 'none';
    this.host.appendChild(canvas); this.app.stage.addChild(this.scene);
    this.scene.addChild(this.terrainLayer, this.gridLayer, this.outline, this.selection, this.preview, this.drainage, this.freehand);
    this.labels = new AtlasLabelLayer(this.host, () => { if (!this.destroyed && !this.failure) this.requestDraw(); });
    this.attachInput();
    this.attachDiagnostics();
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.loseContext(); }, { signal: this.listeners.signal });
    canvas.addEventListener('webglcontextrestored', () => { void this.restoreContext(); }, { signal: this.listeners.signal });
    this.observer = new ResizeObserver(() => {
      if (this.destroyed || this.failure) return;
      try {
        if (this.host.clientWidth <= 0 || this.host.clientHeight <= 0) return;
        const before = { width: this.app.screen.width, height: this.app.screen.height };
        // A stroke is sampled through one camera transform. Real viewport
        // changes must end that gesture before resizeCamera moves its origin;
        // repeated observer notifications with identical dimensions are inert.
        if (before.width !== this.host.clientWidth || before.height !== this.host.clientHeight) this.clearPointers();
        this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
        this.camera = resizeCamera(this.camera, before, this.viewport(), this.worldSize());
        this.requestDraw();
      } catch (error) { this.fail(error); }
    });
    this.observer.observe(this.host); this.draw();
  }
  private assertReady() {
    if (this.destroyed) throw new Error('地图显示已关闭。');
    if (this.failure) throw this.failure;
    if (!this.initialized) throw new Error('地图显示仍在初始化。');
  }
  private fail(error: unknown) {
    if (!this.failure) { this.failure = error instanceof Error ? error : new Error(String(error)); this.cancelOutline(); this.labels?.hide(); this.pendingAcceptance?.abort(this.failure); this.pendingPreview?.controller.abort(this.failure); this.restoration?.abort(this.failure); this.recovery?.reject(this.failure); this.recovery = undefined; this.callbacks.onFatal(this.failure); }
    return this.failure;
  }
  private assertAcceptance(pending: AbortController) { this.assertReady(); pending.signal.throwIfAborted(); }
  private displayBusy() { return !!(this.pendingAcceptance || this.pendingPreview || this.clearingPreview); }
  /** The durable draft already exists. Cancelling display must lock editing,
   * never reactivate a stale view or imply that its storage commit rolled back. */
  cancelPendingAcceptance() {
    if (!this.pendingAcceptance || this.pendingAcceptance.signal.aborted) return false;
    const error = new Error('已停止接收地图画面；草稿已保存，未回滚。请刷新并恢复已保存草稿。'); error.name = 'AbortError';
    this.fail(error); return true;
  }
  private guarded<T>(action: () => T): T { try { this.assertReady(); return action(); } catch (error) { throw this.fail(error); } }
  private geometryKey(bx: number, by: number): BlockKey { return `geometry:${bx}:${by}`; }
  private viewport() { return { width: this.app.screen.width, height: this.app.screen.height }; }
  private worldSize() { return { width: this.data?.manifest.spec.width ?? 4096, height: this.data?.manifest.spec.height ?? 4096 }; }
  private specFor(key: BlockKey, layer: AtlasCacheLayer, density: number, tile?: { x: number; y: number; subdivisions: number }): AtlasTextureSpec {
    const [, x, y] = key.split(':'), bx = Number(x), by = Number(y), spec = this.data!.manifest.spec, step = spec.width / spec.columns;
    const span = 32 * step, corePixels = span * density, gutter = ATLAS_TEXTURE_GUTTER;
    if (!Number.isSafeInteger(corePixels) || corePixels < 1) throw new Error('地图核心未对齐全局纹理采样格。');
    const worldX = bx * span, worldY = by * span, sampleX = worldX - gutter / density, sampleY = worldY - gutter / density;
    const pixelWidth = corePixels + gutter * 2, pixelHeight = corePixels + gutter * 2;
    // Include every possible cell whose permitted shared geometry can enter
    // the sampling halo. Dependencies are block hashes, not guessed sea colors.
    const minCol = Math.max(0, Math.floor((sampleX - step / 4) / step)), minRow = Math.max(0, Math.floor((sampleY - step / 4) / step));
    const maxCol = Math.min(spec.columns - 1, Math.floor((sampleX + pixelWidth / density + step / 4) / step)), maxRow = Math.min(spec.rows - 1, Math.floor((sampleY + pixelHeight / density + step / 4) / step));
    const dependencies: BlockKey[] = [];
    const materialRing = layer === 'terrain' ? 2 : 0;
    // Shared corner samples read incident cells, whose light in turn reads
    // their true four-neighbour centroids. Geometry owners include the extra
    // north/west owner of those cells' shared vertices.
    for (let oy = Math.floor(Math.max(0, minRow - materialRing - 1) / 32); oy <= Math.floor(Math.min(spec.rows - 1, maxRow + materialRing) / 32); oy++) for (let ox = Math.floor(Math.max(0, minCol - materialRing - 1) / 32); ox <= Math.floor(Math.min(spec.columns - 1, maxCol + materialRing) / 32); ox++) dependencies.push(this.geometryKey(ox, oy));
    if (layer === 'terrain') for (let oy = Math.floor(Math.max(0, minRow - 2) / 32); oy <= Math.floor(Math.min(spec.rows - 1, maxRow + 2) / 32); oy++) for (let ox = Math.floor(Math.max(0, minCol - 2) / 32); ox <= Math.floor(Math.min(spec.columns - 1, maxCol + 2) / 32); ox++) dependencies.push(`elevation:${ox}:${oy}`);
    const level = Math.log2(density);
    const surfaceIdentity = this.data!.manifest.version === 4 ? `detail-final-q8-v1/${this.detail?.data.manifest.revision ?? this.data!.manifest.revision}` : 'terrain-surface-v1';
    const materialIdentity = layer === 'terrain' ? `${TERRAIN_MATERIAL_VERSION}/` : '';
    const whole: AtlasTextureSpec = { key: `${this.data!.manifest.atlasId}/${surfaceIdentity}/${materialIdentity}${key}/${layer}/${level}/${dependencies.map(key => this.refs.get(key)).join('/')}`, blockKey: key, layer, level,
      pixelWidth, pixelHeight, worldX, worldY, sampleX, sampleY, density, core: { x: gutter, y: gutter, width: corePixels, height: corePixels }, dependencies };
    if (!tile) return whole;
    const tileSpan = span / tile.subdivisions, tilePixels = corePixels / tile.subdivisions, tileX = worldX + tile.x * tileSpan, tileY = worldY + tile.y * tileSpan;
    if (!Number.isSafeInteger(tilePixels) || tilePixels < 1) throw new Error('地图近景子核心未对齐全局采样格。');
    // Display tiles do not become geographical blocks. They share the logical
    // core's real geometry/material dependencies, while each cropped pixel is
    // displayed exactly once and charged to the same texture budget.
    return { ...whole, key: `${whole.key}/tile/${tile.subdivisions}/${tile.x}/${tile.y}`, worldX: tileX, worldY: tileY, sampleX: tileX - gutter / density, sampleY: tileY - gutter / density,
      pixelWidth: tilePixels + gutter * 2, pixelHeight: tilePixels + gutter * 2, core: { x: gutter, y: gutter, width: tilePixels, height: tilePixels } };
  }
  private visiblePlan() {
    if (!this.data || !this.index) return { specs: [] as AtlasTextureSpec[], keys: [] as BlockKey[] };
    // Fixed display cores partition world space. Shared quads may extend beyond
    // their logical cell block, so their AABBs cannot cull these cropped cores.
    const bounds = cameraWorldBounds(this.camera, this.viewport()), spec = this.data.manifest.spec, span = spec.width / spec.columns * 32, keys: BlockKey[] = [];
    if (bounds.maxX >= 0 && bounds.maxY >= 0 && bounds.minX <= spec.width && bounds.minY <= spec.height) {
      for (let by = Math.max(0, Math.floor(bounds.minY / span)); by <= Math.min(spec.rows / 32 - 1, Math.floor(bounds.maxY / span)); by++)
        for (let bx = Math.max(0, Math.floor(bounds.minX / span)); bx <= Math.min(spec.columns / 32 - 1, Math.floor(bounds.maxX / span)); bx++) keys.push(this.geometryKey(bx, by));
    }
    const step = this.data.manifest.spec.width / this.data.manifest.spec.columns;
    this.lod = resolveAtlasLod(this.camera.scale * step, this.lod);
    const grid = this.gridRequested && atlasLodPolicy(this.lod, this.viewport().width).gridVisible;
    const plan = planAtlasRaster({ logicalSpan: span, scale: this.camera.scale, resolution: this.app.renderer.resolution, bounds,
      cores: keys.map(key => { const [, bx, by] = key.split(':'); return { bx: Number(bx), by: Number(by) }; }),
      layers: grid ? 2 : 1, budgetPixels: this.cache.budgetPixels, sharedPixels: this.data.manifest.version === 4 ? DETAIL_TERRAIN_SHARED_PIXELS : TERRAIN_LUT_PIXELS });
    const { ranges, ...quality } = plan; this.rasterQuality = quality;
    const specs: AtlasTextureSpec[] = [];
    for (const range of ranges) for (let y = range.firstY; y <= range.lastY; y++) for (let x = range.firstX; x <= range.lastX; x++) {
      const key = this.geometryKey(range.bx, range.by), tile = plan.subdivisions === 1 ? undefined : { x, y, subdivisions: plan.subdivisions };
      specs.push(this.specFor(key, 'terrain', plan.density, tile));
      if (grid) specs.push(this.specFor(key, 'grid', plan.density, tile));
    }
    return { specs, keys };
  }
  private deferDirtyDependencies(changed: ReadonlySet<BlockKey>) {
    const across = this.data!.manifest.spec.columns / 32;
    // The minimum density has the widest real sampling halo. Enumerating the
    // bounded 16/64/256 cores also covers entries that were never cached or
    // were evicted; cache membership is not evidence that content is clean.
    for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
      const key = this.geometryKey(bx, by);
      if (this.specFor(key, 'terrain', minimumCacheDensity).dependencies.some(dependency => changed.has(dependency))) this.deferredDirtyCores.add(key);
    }
  }
  private completeVisibleCores(plan: { specs: AtlasTextureSpec[]; keys: BlockKey[] }) {
    const complete = new Set(plan.keys);
    for (const spec of plan.specs) if (!this.cache.has(spec.key)) complete.delete(spec.blockKey);
    for (const key of complete) this.deferredDirtyCores.delete(key);
  }
  private ensureTexture(spec: AtlasTextureSpec, protectedKeys: ReadonlySet<string>, repainted: Set<BlockKey>): AtlasTextureEntry {
    const existing = this.cache.get(spec.key); if (existing) return existing;
    const materials = spec.layer === 'terrain' ? ensureTerrainMaterials(this.cache) : undefined;
    const entry = this.cache.ensure(spec, target => {
      const bounds = { minX: spec.sampleX, minY: spec.sampleY, maxX: spec.sampleX + spec.pixelWidth / spec.density, maxY: spec.sampleY + spec.pixelHeight / spec.density };
      let scratch: Container;
      if (spec.layer === 'terrain' && this.data!.manifest.version === 4) {
        if (!this.detail?.gpuReady) throw new Error('真实细地表后端尚未准备完整。');
        const logical = this.specFor(spec.blockKey, 'terrain', spec.density);
        const geometryBounds = { minX: logical.sampleX, minY: logical.sampleY, maxX: logical.sampleX + logical.pixelWidth / logical.density, maxY: logical.sampleY + logical.pixelHeight / logical.density };
        const geometrySpec = { atlasId: this.data!.manifest.atlasId, blockKey: spec.blockKey, bounds: geometryBounds, dependencies: spec.dependencies.map(key => ({ key, hash: this.refs.get(key)! })) };
        const origin = { xQ: logical.worldX * 256, yQ: logical.worldY * 256 };
        scratch = this.terrainGeometry.get(geometrySpec, this.refs) ?? this.terrainGeometry.create(geometrySpec, 1, () => undefined, () => this.detail!.createMesh(geometryBounds, origin));
        // One real cell-reconstruction shader is shared across sequential RT
        // submissions. Its origin belongs to this mesh's local position buffer.
        this.detail.setDrawOrigin(origin);
      } else if (spec.layer === 'terrain') {
        const logical = this.specFor(spec.blockKey, 'terrain', spec.density);
        const geometryBounds = { minX: logical.sampleX, minY: logical.sampleY, maxX: logical.sampleX + logical.pixelWidth / logical.density, maxY: logical.sampleY + logical.pixelHeight / logical.density };
        const geometrySpec = { atlasId: this.data!.manifest.atlasId, blockKey: spec.blockKey, bounds: geometryBounds, dependencies: spec.dependencies.map(key => ({ key, hash: this.refs.get(key)! })), coastal: isCoastalSurface(this.data!) };
        const retained = this.terrainGeometry.get(geometrySpec, this.refs);
        if (retained) scratch = retained;
        else {
          const ids = this.index!.queryCells(geometryBounds).cellIds;
          scratch = this.terrainGeometry.create(geometrySpec, ids.length, surface => {
            const sampled = buildTerrainSurface(this.data!, ids);
            surface.addSurface(sampled.sea, 'sea', materials!.sea); surface.addSurface(sampled.land, 'land', materials!.land);
            const graphics = new Graphics({ autoGarbageCollect: false }); surface.addChild(graphics);
            const columns = this.data!.manifest.spec.columns, step = this.data!.manifest.spec.width / columns;
            const heights = new Map<number, number>();
            const height = (id: number) => { const known = heights.get(id); if (known !== undefined) return known; const slot = getCellLayerSlot(this.data!, 'elevation', id), value = slot.block.values[slot.slot]; heights.set(id, value); return value; };
            // Only actual sea/land shared edges receive a shore line. The
            // world rectangle is never treated as an invented coastline.
            let shores = 0;
            if (sampled.coastal) {
              for (const cell of sampled.coastal.cells) for (const segment of cell.shore) if (segment.ownerCellId === cell.cellId) {
                graphics.poly([segment.a.xQ6 / COASTAL_COORDINATE_SCALE, segment.a.yQ6 / COASTAL_COORDINATE_SCALE, segment.b.xQ6 / COASTAL_COORDINATE_SCALE, segment.b.yQ6 / COASTAL_COORDINATE_SCALE], false); shores++;
              }
            } else for (const id of ids) {
              if (height(id) < 0) continue;
              const x = id % columns, y = Math.floor(id / columns);
              let quad: ReturnType<typeof getCellQuad> | undefined;
              for (const [neighbor, a, b] of [[y > 0 ? id - columns : -1, 0, 1], [x < columns - 1 ? id + 1 : -1, 1, 2], [y < columns - 1 ? id + columns : -1, 2, 3], [x > 0 ? id - 1 : -1, 3, 0]]) {
                if (neighbor < 0 || height(neighbor) >= 0) continue;
                quad ??= getCellQuad(this.data!, id);
                graphics.poly([quad[a].x, quad[a].y, quad[b].x, quad[b].y], false); shores++;
              }
            }
            if (shores) graphics.stroke({ color: 0xc5dcc7, width: step / 24, alpha: .7 });
            surface.terrainBuffers.shoreSegments = shores;
          }, () => new AtlasTerrainMesh());
        }
      } else scratch = new Graphics();
      try {
        if (spec.layer === 'grid') {
          const grid = scratch as Graphics;
          for (const id of this.index!.queryCells(bounds).cellIds) grid.poly(getCellQuad(this.data!, id).flatMap(p => [p.x, p.y]));
          grid.stroke({ color: 0xc1d8d3, width: 1 / spec.density, alpha: .25 });
        }
        // Meshes/Graphics stay in world coordinates. Only the target matrix changes;
        // a reused wider real halo is clipped by this target, never resampled.
        // Grid strokes depend on density and remain a separate one-shot path.
        this.app.renderer.render({ container: scratch, target, transform: new Matrix(spec.density, 0, 0, spec.density, -spec.sampleX * spec.density, -spec.sampleY * spec.density), clear: true, clearColor: [0, 0, 0, 0] });
      } finally { if (spec.layer === 'grid') scratch.destroy(); }
    }, protectedKeys);
    (spec.layer === 'terrain' ? this.terrainLayer : this.gridLayer).addChild(entry.sprite); repainted.add(spec.blockKey);
    if (this.data === this.acceptingData) this.acceptanceRepaints?.add(spec.blockKey);
    return entry;
  }
  private prefetch(keys: BlockKey[], specs: AtlasTextureSpec[], protectedKeys: Set<string>, repainted: Set<BlockKey>) {
    if (!this.data || !specs.length || this.displayBusy() || this.graphicsState !== 'ready') return;
    // High-density subcores are only retained when actually visible. A
    // whole-core prefetch at their density would defeat the size/viewport cap.
    if (specs[0].key.includes('/tile/')) return;
    const visible = new Set(keys), across = this.data.manifest.spec.columns / 32; let remaining = 2;
    for (const key of keys) {
      const [, x, y] = key.split(':'), bx = Number(x), by = Number(y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (bx + dx < 0 || by + dy < 0 || bx + dx >= across || by + dy >= across) continue;
        const neighbor = this.geometryKey(bx + dx, by + dy); if (visible.has(neighbor) || this.deferredDirtyCores.has(neighbor)) continue;
        const spec = this.specFor(neighbor, 'terrain', specs[0].density);
        if (this.cache.has(spec.key)) continue;
        if (!this.cache.canReserve(spec.pixelWidth * spec.pixelHeight, protectedKeys)) return;
        this.ensureTexture(spec, protectedKeys, repainted); if (--remaining === 0) return;
      }
    }
  }
  private async warmVisible(check: () => void, recovering = false, report = true, signal?: AbortSignal) {
    const repainted = new Set<BlockKey>();
    for (;;) {
      check(); if (!recovering && this.graphicsState !== 'ready') await this.waitForGraphics(signal); check();
      const preparationEpoch = this.contextEpoch, preparationData = this.data;
      if (this.data?.manifest.version === 4) {
        try {
          const data = this.data;
          if (!this.detail) { this.detail = new DetailTerrainBackend(data); this.detailDisplayData = data; }
          const detail = this.detail;
          if (this.detailDisplayData !== data) throw new Error('细地表快照与当前显示不一致。');
          const control = { signal, check, onProgress: (progress: { stage: string; completed: number; total: number }) => { check(); this.callbacks.onProgress?.(progress); } };
          await detail.prepare(control); check();
          if (preparationEpoch !== this.contextEpoch || preparationData !== this.data || (!recovering && this.graphicsState !== 'ready')) continue;
          if (!('gl' in this.app.renderer)) throw new Error('第四版真实细地表需要 WebGL2 后端。');
          await detail.installGpu(this.app.renderer as WebGLRenderer, this.cache, { ...control, check: () => { check(); if (preparationEpoch !== this.contextEpoch || preparationData !== this.data) throw new DOMException('细地表上下文或快照已变化。', 'AbortError'); } });
          check();
        } catch (error) { check(); if (preparationEpoch === this.contextEpoch && preparationData === this.data) throw error; }
        if (preparationEpoch !== this.contextEpoch) { if (recovering) throw new Error('图形恢复已被更新的上下文取代。'); continue; }
        if (preparationData !== this.data) continue;
      }
      let start = performance.now();
      const epoch = this.contextEpoch, data = this.data, plan = this.visiblePlan(), specs = plan.specs.filter(spec => !this.cache.has(spec.key)), keys = [...new Set(specs.map(spec => spec.blockKey))], protectedKeys = new Set(plan.specs.map(spec => spec.key));
      let interrupted = false, batchPainted = new Set<BlockKey>();
      for (let i = 0; i < specs.length; i++) {
        check();
        if (epoch !== this.contextEpoch || data !== this.data || (!recovering && this.graphicsState !== 'ready')) { interrupted = true; break; }
        this.ensureTexture(specs[i], protectedKeys, repainted); batchPainted.add(specs[i].blockKey);
        // A target includes real geometry preparation and GPU submission. Slow
        // targets must yield before the eight-target ceiling, after drawing
        // the completed work; the next iteration rechecks cancellation/epoch.
        if ((i + 1) % 8 === 0 || performance.now() - start >= paintBatchBudgetMs || i === specs.length - 1) {
          this.draw(false, recovering, start, batchPainted.size); batchPainted = new Set();
          if (report) this.callbacks.onProgress?.({ stage: '绘制已核验地理块', completed: new Set(specs.slice(0, i + 1).map(spec => spec.blockKey)).size, total: keys.length });
          if (i < specs.length - 1) { await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); start = performance.now(); }
        }
      }
      if (!interrupted && epoch === this.contextEpoch && data === this.data) { this.completeVisibleCores(plan); return repainted; }
      if (recovering && epoch !== this.contextEpoch) throw new Error('图形恢复已被更新的上下文取代。');
    }
  }
  /** Returns only after submitting the committed state and a frame opportunity. */
  async accept(data: AtlasGeographyView, delta?: AtlasRenderDelta) {
    this.assertReady();
    if (this.displayBusy()) throw new Error('地图画面仍在接收，请等待本次结果。');
    if (delta && this.displaySource === 'generation-preview') throw new Error('生成预览只能通过完整持久结果确认，请先确认或取消预览。');
    const previous = this.committed?.data.manifest ?? this.data?.manifest, candidate = data.manifest;
    const surfaceKey = (manifest: AtlasGeographyView['manifest']) => manifest.surface === undefined ? '' : JSON.stringify(manifest.surface);
    if (previous?.draftId === candidate.draftId && (previous.version !== candidate.version || surfaceKey(previous) !== surfaceKey(candidate))) {
      // Check before touching the live view or cache. The same immutable
      // blocks may have a different coast meaning only in an explicit new draft.
      throw new Error('同一草稿不能更换格式或权威地表合同，请打开显式创建的独立副本。');
    }
    const pending = new AbortController(); this.pendingAcceptance = pending; this.clearPointers(); this.acceptingData = data; this.acceptanceRepaints = new Set(); this.labels?.hide();
    try {
      const fresh = !this.data || this.data.manifest.draftId !== data.manifest.draftId || this.data.manifest.atlasId !== data.manifest.atlasId;
      const preserveCamera = !fresh && (this.displaySource === 'generation-preview' || data.manifest.version === 4);
      // A lock preview only updates the UI overlay, so lock confirmation and
      // lock undo enter here from committed display. They can retain complete
      // geography only when the existing private cache is ready and every
      // verified geographic dependency is equal. No generation-preview shortcut.
      const reuseDetail = !fresh && this.displaySource === 'committed' && !!this.committed && this.committed.data === this.data
        && !!this.index && this.committed.index === this.index && this.graphicsState === 'ready'
        && !!this.detail?.gpuReady && this.detail.metrics().complete && this.detailDisplayData === this.data
        && this.cache.stats().entries > 0 && this.terrainGeometry.stats().entries > 0
        && sameVerifiedDetailGeography(this.detail.data, data);
      // Fine changes and Hbase changes still require one coherent new source
      // set. A coarse-only delta is never proof of unchanged fine nodes.
      const fullRepaint = !reuseDetail && (fresh || !delta || data.manifest.version === 4);
      if (!fresh && delta && data.manifest.revision !== this.data!.manifest.revision + 1) throw new Error('地图增量修订不连续，请恢复已保存草稿。');
      if (reuseDetail) {
        // No yield occurs between the complete dependency/epoch readiness check
        // and this binding. SpatialIndex's old geometry remains immutable and
        // identical; metadata authority, labels and locks use the new data.
        this.data = data; this.detailDisplayData = data;
      } else if (fullRepaint) {
        const index = await createSpatialIndexAsync(data, {
          signal: pending.signal,
          onProgress: progress => { this.assertAcceptance(pending); this.callbacks.onProgress?.(progress); },
          yieldTask: async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); this.assertAcceptance(pending); },
        });
        this.assertAcceptance(pending); if (this.graphicsState !== 'ready') await this.waitForGraphics(); this.assertAcceptance(pending); this.index = index;
        this.releaseDisplayResources(); this.deferredDirtyCores.clear();
        this.data = data; this.previewCells = []; this.previewVertices.clear(); this.lod = undefined;
        if (!preserveCamera) { this.selected = null; this.camera = fitCamera(this.worldSize(), this.viewport()); }
      } else {
        if (this.graphicsState !== 'ready') await this.waitForGraphics(); this.assertAcceptance(pending);
        if (!delta) throw new Error('地图局部显示缺少增量，未复用未知地理。');
        if (data.manifest.revision !== this.data!.manifest.revision + 1) throw new Error('地图增量修订不连续，请恢复已保存草稿。');
        this.index!.updateGeometry(data, delta.changedVertexIds);
        this.data = data;
      }
      this.displaySource = 'committed';
      this.refs = new Map(data.manifest.blockRefs.map(ref => [ref.key, ref.hash]));
      if (delta && data.manifest.version !== 4) {
        const changed = new Set(delta.dirtyKeys); this.deferDirtyDependencies(changed); this.cache.invalidateDependencies(changed); this.terrainGeometry.invalidateDependencies(changed);
      }
      this.previewCells = []; this.previewVertices.clear(); this.previewRevision++;
      await this.warmVisible(() => this.assertAcceptance(pending), false, fullRepaint);
      this.assertAcceptance(pending);
      await this.waitFrame(pending.signal);
      this.assertAcceptance(pending); if (this.graphicsState !== 'ready') await this.waitForGraphics(); this.assertAcceptance(pending);
      this.draw(true, false, performance.now(), 0, true); this.measured.repaintBlockKeys = [...this.acceptanceRepaints]; this.measured.repaintBlocks = this.measured.repaintBlockKeys.length;
      this.measured.acceptedRevision = data.manifest.revision; this.measured.correctFrameAt = performance.now();
      this.committed = { data, index: this.index! }; this.displayCorrectFrameAt = this.measured.correctFrameAt;
      return this.metrics();
    } catch (error) { throw this.fail(error); }
    finally { if (this.pendingAcceptance === pending) { this.pendingAcceptance = undefined; this.acceptingData = undefined; this.acceptanceRepaints = undefined; } }
  }
  /** Display a verified owned candidate without changing the durable baseline.
   * The bridge/Worker still own recipe, lock, root and confirmation validation. */
  async showGenerationPreview(data: AtlasGeographyView) {
    this.assertReady();
    if (this.displayBusy()) throw new Error('地图画面仍在接收，请等待本次结果。');
    const committed = this.committed;
    if (!committed) throw new Error('生成预览需要先接收已保存的草稿。');
    const baseline = committed.data.manifest, candidate = data.manifest;
    if (baseline.draftId !== candidate.draftId || baseline.atlasId !== candidate.atlasId || baseline.version !== candidate.version
      || (Object.keys(baseline.spec) as (keyof typeof baseline.spec)[]).some(key => baseline.spec[key] !== candidate.spec[key])) throw new Error('生成候选与已保存地图的身份或规格不一致。');
    const controller = new AbortController(); let finish!: () => void;
    const pending = { controller, promise: new Promise<void>(resolve => { finish = resolve; }) };
    this.pendingPreview = pending; this.labels?.hide(); this.clearPointers(); let swapped = false;
    const check = () => { this.assertReady(); controller.signal.throwIfAborted(); if (this.committed !== committed) throw new Error('生成预览的持久基线已变化。'); };
    try {
      const index = await createSpatialIndexAsync(data, { signal: controller.signal,
        onProgress: progress => { check(); this.callbacks.onProgress?.(progress); },
        yieldTask: async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); } });
      // From here onward failures concern live GPU resources, even if cache
      // release throws before the new source can be assigned.
      check(); swapped = true; this.switchDisplayedData(data, index, 'generation-preview');
      await this.warmVisible(check, false, true, controller.signal); check();
      await this.waitFrame(controller.signal); check(); await this.waitForGraphics(controller.signal); check();
      this.draw(true, false, performance.now(), 0, true); this.displayCorrectFrameAt = performance.now();
      return this.metrics();
    } catch (error) {
      if (!controller.signal.aborted && swapped) throw this.fail(error);
      if (!this.destroyed && !this.failure && !swapped && this.graphicsState === 'ready') this.guarded(() => this.draw(true, false, performance.now(), 0, true));
      throw error;
    } finally { if (this.pendingPreview === pending) this.pendingPreview = undefined; finish(); }
  }
  /** Discard is a display operation, never a durable accept or rollback. It
   * aborts an unfinished candidate and restores the original committed index. */
  async clearGenerationPreview() {
    this.assertReady();
    if (this.pendingAcceptance) throw new Error('持久地图画面仍在接收，请等待确认结果。');
    if (this.clearingPreview) { await this.clearingPreview; this.assertReady(); return this.metrics(); }
    const pending = this.pendingPreview;
    if (!pending && this.displaySource !== 'generation-preview') return this.metrics();
    const cancelled = new Error('已取消未保存的生成预览。'); cancelled.name = 'AbortError'; pending?.controller.abort(cancelled);
    let finish!: () => void;
    const clearing = new Promise<void>(resolve => { finish = resolve; }); this.clearingPreview = clearing;
    try {
      await pending?.promise; this.assertReady();
      if (!this.committed) throw new Error('生成预览缺少可恢复的持久基线。');
      this.switchDisplayedData(this.committed.data, this.committed.index, 'committed');
      const check = () => { this.assertReady(); this.listeners.signal.throwIfAborted(); };
      await this.warmVisible(check, false, true, this.listeners.signal); check();
      await this.waitFrame(this.listeners.signal); check(); await this.waitForGraphics(this.listeners.signal); check();
      this.draw(true, false, performance.now(), 0, true); this.displayCorrectFrameAt = performance.now();
      return this.metrics();
    } catch (error) { throw this.fail(error); }
    finally { if (this.clearingPreview === clearing) this.clearingPreview = undefined; finish(); }
  }
  private switchDisplayedData(data: AtlasGeographyView, index: SpatialIndex, source: 'committed' | 'generation-preview') {
    if (this.data !== data || this.index !== index) {
      this.releaseDisplayResources(); this.deferredDirtyCores.clear(); this.data = data; this.index = index;
      this.refs = new Map(data.manifest.blockRefs.map(ref => [ref.key, ref.hash]));
    }
    this.displaySource = source; this.previewCells = []; this.previewVertices.clear(); this.previewRevision++; this.labels?.hide(); this.clearPointers();
  }
  /** Drop borrowing meshes before their shader and source owners. On context
   * loss only the complete derived CPU pages remain, with their own byte ledger. */
  private releaseDisplayResources(preserveDetailCpu = false) {
    let failure: unknown;
    try { this.terrainGeometry.clear(); } catch (error) { failure = error; }
    try { if (preserveDetailCpu) this.detail?.releaseGpu(); else this.detail?.destroy(); } catch (error) { failure ??= error; }
    if (!preserveDetailCpu) { this.detail = undefined; this.detailDisplayData = undefined; }
    try { this.cache.clear(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
  metrics() { return { ...this.measured, repaintBlockKeys: [...this.measured.repaintBlockKeys], camera: { ...this.camera }, viewport: { width: this.app.screen?.width ?? 0, height: this.app.screen?.height ?? 0, resolution: this.initialized ? this.app.renderer.resolution : 1 }, gpu: { state: this.graphicsState, epoch: this.contextEpoch }, cache: this.cache.stats(), geometryCache: this.terrainGeometry.stats(), selected: this.selected, destroyed: this.destroyed, fatal: !!this.failure,
    detailSurface: this.detail?.metrics() ?? null,
    displaySource: this.displaySource, displayRevision: this.data?.manifest.revision ?? null, displayVersion: this.data?.manifest.version ?? null,
    committedRevision: this.committed?.data.manifest.revision ?? null, displayCorrectFrameAt: this.displayCorrectFrameAt,
    lod: this.lod ?? 'far', cellPixels: this.data ? this.camera.scale * this.data.manifest.spec.width / this.data.manifest.spec.columns : 0,
    raster: this.rasterQuality ? { ...this.rasterQuality } : null,
    gridRequested: this.gridRequested, gridVisible: this.gridRequested && this.lod ? atlasLodPolicy(this.lod, this.app.screen.width).gridVisible : false, labels: this.labels?.metrics() ?? emptyAtlasLabelMetrics() }; }
  setGridVisible(visible: boolean): void { this.guarded(() => { if (this.gridRequested !== visible) { this.gridRequested = visible; this.draw(); } }); }
  select(cellId: number | null) { this.guarded(() => { if (cellId !== null && this.data) getCellQuad(this.data, cellId); this.selected = cellId; this.draw(); }); }
  showPreview(cellIds: number[], vertices?: { ids: Uint32Array; xyQ: Int32Array }) {
    if (this.displaySource === 'generation-preview' && (cellIds.length || vertices?.ids.length)) throw new Error('请先确认或取消生成预览，再编辑地理。');
    this.guarded(() => {
      const nextVertices = new Map<number, { x: number; y: number }>();
      if (vertices) for (let i = 0; i < vertices.ids.length; i++) nextVertices.set(vertices.ids[i], { x: vertices.xyQ[i * 2] / 256, y: vertices.xyQ[i * 2 + 1] / 256 });
      const same = cellIds.length === this.previewCells.length && cellIds.every((id, index) => id === this.previewCells[index])
        && nextVertices.size === this.previewVertices.size && [...nextVertices].every(([id, point]) => { const before = this.previewVertices.get(id); return before?.x === point.x && before.y === point.y; });
      if (!same) { this.previewCells = [...cellIds]; this.previewVertices = nextVertices; this.previewRevision++; }
      this.draw();
    });
  }
  showRegion(rectangle: AtlasCellRectangle | null, transitionCells = 0) {
    if (rectangle && (!this.data || !validateCellRectangle(rectangle, this.data.manifest.spec) || !Number.isInteger(transitionCells) || transitionCells < 0 || transitionCells * 2 >= Math.min(rectangle.columns, rectangle.rows))) throw new Error('地图选区或过渡带无效。');
    this.guarded(() => {
      const next = rectangle ? { ...rectangle, transitionCells } : null;
      if (JSON.stringify(next) !== JSON.stringify(this.region)) { this.region = next; this.previewRevision++; }
      this.draw();
    });
  }
  setOutlineMode(enabled: boolean) {
    this.guarded(() => {
      if (this.outlineMode === enabled) return;
      this.clearPointers(); this.outlineMode = enabled;
      this.app.canvas.style.cursor = enabled ? 'crosshair' : '';
      this.app.canvas.setAttribute('aria-label', enabled ? '手绘大陆轮廓，单指或鼠标绘制，双指缩放平移' : '大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块');
      if (!enabled) { this.outlinePoints = []; this.outlineRevision++; }
      this.requestDraw();
    });
  }
  /** Read-only, bridge-validated flow trace. No terrain or simulation state is changed. */
  showHydrologyTrace(trace: HydrologyTrace | null) {
    if (trace && (this.displaySource !== 'committed' || this.data?.manifest.version !== 4
      || trace.source.draftId !== this.data.manifest.draftId || trace.source.atlasId !== this.data.manifest.atlasId
      || trace.source.revision !== this.data.manifest.revision)) throw new Error('地形已经变化，请重新查看流向。');
    this.guarded(() => {
      this.drainageTrace = trace ? structuredClone(trace) : null;
      if (trace) {
        const points = trace.path.map(p => ({ x: p.column * 2, y: p.row * 2 }));
        if (trace.coastPointQ) points.push({ x: trace.coastPointQ.xQ / 256, y: trace.coastPointQ.yQ / 256 });
        const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
        const viewport = this.viewport(), marginX = Math.min(48, viewport.width * .12);
        // Leave space for the map tools above and the result controls below,
        // including the two-row toolbar on a phone. Never enlarge a tiny path.
        const top = Math.min(144, viewport.height * .25), bottom = Math.min(144, viewport.height * .25);
        const availableHeight = viewport.height - top - bottom;
        const { minScale, maxScale } = cameraScaleBounds(this.worldSize(), viewport);
        const scale = Math.max(minScale, Math.min(this.camera.scale, maxScale,
          (viewport.width - marginX * 2) / Math.max(2, maxX - minX), availableHeight / Math.max(2, maxY - minY)));
        this.camera = centerCameraAt({ ...this.camera, scale }, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          { x: viewport.width / 2, y: top + availableHeight / 2 });
      }
      this.drainageRevision++; this.draw();
    });
  }
  showOutline(points: readonly AtlasOutlinePoint[]) {
    this.guarded(() => {
      const world = this.worldSize();
      if (points.length > 256 || points.some(point => !Number.isSafeInteger(point.xQ) || !Number.isSafeInteger(point.yQ) || point.xQ < 0 || point.yQ < 0 || point.xQ > world.width * 256 || point.yQ > world.height * 256)) throw new Error('手绘轮廓坐标超出世界范围。');
      this.outlinePoints = points.map(point => ({ ...point })); this.outlineRevision++; this.requestDraw();
    });
  }
  focusCell(cellId: number, zoom = true) {
    this.guarded(() => { if (!this.data) return;
    const quad = getCellQuad(this.data, cellId), x = quad.reduce((sum, p) => sum + p.x, 0) / 4, y = quad.reduce((sum, p) => sum + p.y, 0) / 4;
    if (this.graphicsState !== 'ready') return;
    this.cancelOutline(); if (this.pointers.size) this.outlineGestureBlocked = true;
    if (zoom) this.camera = { ...this.camera, scale: Math.max(this.camera.scale, cameraScaleBounds(this.worldSize(), this.viewport()).fitScale * 8) };
    this.camera = centerCameraAt(this.camera, { x, y }, { x: this.app.screen.width * .42, y: this.app.screen.height * .35 });
    this.selected = cellId; this.draw(); });
  }
  fit() {
    this.guarded(() => { if (this.graphicsState !== 'ready') return; this.cancelOutline(); if (this.pointers.size) this.outlineGestureBlocked = true; this.camera = fitCamera(this.worldSize(), this.viewport()); this.draw(); });
  }
  zoom(factor: number, point = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }) {
    this.guarded(() => { if (this.graphicsState !== 'ready') return;
      this.cancelOutline(); if (this.pointers.size) this.outlineGestureBlocked = true;
      this.camera = zoomCameraAt(this.camera, factor, point, this.worldSize(), this.viewport()); this.requestDraw();
    });
  }
  /** World-space overlays survive translation. Rebuild only their actual
   * inputs, stroke scale or GPU epoch; keep this work inside draw's CPU span. */
  private updateOverlays() {
    if (!this.data) return;
    const data = this.data, scale = this.camera.scale, epoch = this.contextEpoch, world = this.worldSize();
    const trace = this.drainageTrace;
    const drainageVisible = !!trace && this.displaySource === 'committed' && data.manifest.version === 4
      && trace.source.draftId === data.manifest.draftId && trace.source.atlasId === data.manifest.atlasId && trace.source.revision === data.manifest.revision;
    const drainage = this.drawnDrainage;
    if (!drainage || drainage.revision !== this.drainageRevision || drainage.scale !== scale || drainage.epoch !== epoch || drainage.visible !== drainageVisible) {
      this.drainage.clear();
      if (trace && drainageVisible) {
        const r = trace.rectangle;
        this.drainage.rect(r.originColumn * 2, r.originRow * 2, (r.columns - 1) * 2, (r.rows - 1) * 2).stroke({ color: 0xa5d3ed, width: 1 / scale, alpha: .5 });
        const points = trace.path.flatMap(p => [p.column * 2, p.row * 2]);
        if (trace.coastPointQ) points.push(trace.coastPointQ.xQ / 256, trace.coastPointQ.yQ / 256);
        if (points.length >= 4) this.drainage.poly(points, false).stroke({ color: 0x143851, width: 5 / scale, alpha: .85 });
        if (points.length >= 4) this.drainage.poly(points, false).stroke({ color: 0x9fe4ff, width: 2.5 / scale });
        const x = trace.sourceNode.column * 2, y = trace.sourceNode.row * 2, radius = 4 / scale;
        this.drainage.rect(x - radius, y - radius, radius * 2, radius * 2).fill({ color: 0xffffff }).stroke({ color: 0x143851, width: 1.5 / scale });
      }
      this.drawnDrainage = { revision: this.drainageRevision, scale, epoch, visible: drainageVisible };
    }
    const freehand = this.drawnFreehand;
    if (!freehand || freehand.revision !== this.outlineRevision || freehand.scale !== scale || freehand.epoch !== epoch) {
      this.freehand.clear();
      const points = this.activeOutline?.points ?? this.outlinePoints;
      if (points.length > 1) {
        this.freehand.poly(points.flatMap(point => [point.xQ / 256, point.yQ / 256]), !this.activeOutline);
        if (!this.activeOutline && points.length > 2) this.freehand.fill({ color: 0xb8e3d0, alpha: .16 });
        this.freehand.stroke({ color: 0xe5f5dc, width: 2 / scale, alpha: .95 });
      }
      this.drawnFreehand = { revision: this.outlineRevision, scale, epoch };
    }
    const outline = this.drawnOutline;
    if (!outline || outline.width !== world.width || outline.height !== world.height || outline.scale !== scale || outline.epoch !== epoch) {
      this.outline.clear().rect(0, 0, world.width, world.height).stroke({ color: 0xa9c6c5, width: 1 / scale, alpha: .7 });
      this.drawnOutline = { ...world, scale, epoch };
    }
    const selection = this.drawnSelection;
    if (!selection || selection.data !== data || selection.selected !== this.selected || selection.scale !== scale || selection.epoch !== epoch) {
      this.selection.clear();
      if (this.selected !== null) this.selection.poly(getCellQuad(data, this.selected).flatMap(p => [p.x, p.y])).fill({ color: 0xe7ca8b, alpha: .25 }).stroke({ color: 0xf1d79c, width: 2 / scale });
      this.drawnSelection = { data, selected: this.selected, scale, epoch };
    }
    const preview = this.drawnPreview;
    if (!preview || preview.data !== data || preview.revision !== this.previewRevision || preview.scale !== scale || preview.epoch !== epoch) {
      this.preview.clear();
      for (const id of this.previewCells) {
        const ids = cellVertexIds(data.manifest.spec, id), ordered = [ids[0], ids[1], ids[3], ids[2]];
        this.preview.poly(getCellQuad(data, id).flatMap((point, index) => { const p = this.previewVertices.get(ordered[index]) ?? point; return [p.x, p.y]; }));
      }
        if (this.previewCells.length) this.preview.fill({ color: 0xf2d49b, alpha: .24 }).stroke({ color: 0xffd88c, width: 1 / scale });
        if (this.region && validateCellRectangle(this.region && { column: this.region.column, row: this.region.row, columns: this.region.columns, rows: this.region.rows }, data.manifest.spec)) {
          const outline = (inset: number) => {
            const r = this.region!, x0 = r.column + inset, y0 = r.row + inset, x1 = r.column + r.columns - inset, y1 = r.row + r.rows - inset, points: number[] = [];
            const point = (x: number, y: number) => { const p = getVertexPositionQ(data, vertexIdAt(data.manifest.spec, x, y)); points.push(p.xQ / 256, p.yQ / 256); };
            for (let x = x0; x < x1; x++) point(x, y0);
            for (let y = y0; y < y1; y++) point(x1, y);
            for (let x = x1; x > x0; x--) point(x, y1);
            for (let y = y1; y > y0; y--) point(x0, y);
            this.preview.poly(points).stroke({ color: inset ? 0xc9efff : 0x72c8f2, width: (inset ? 1 : 2) / scale });
          };
          outline(0); if (this.region.transitionCells) outline(this.region.transitionCells);
        }
      this.drawnPreview = { data, revision: this.previewRevision, scale, epoch };
    }
  }
  private draw(ensure = true, recovering = false, started = performance.now(), batchRepainted = 0, allowAcceptanceLabels = false) {
    if (!this.initialized || this.destroyed || this.failure || (this.graphicsState !== 'ready' && !recovering)) return;
    // Resize/camera callbacks can arrive during cooperative preparation. Never
    // render an incomplete fine snapshot or substitute legacy geometry.
    if (this.data?.manifest.version === 4 && !this.detail?.gpuReady) ensure = false;
    this.scene.position.set(this.camera.x, this.camera.y); this.scene.scale.set(this.camera.scale);
    if (this.index && this.data) {
      const { specs, keys } = this.visiblePlan(), visible = new Set(specs.map(spec => spec.key)), repainted = new Set<BlockKey>();
      if (ensure) { for (const spec of specs) this.ensureTexture(spec, visible, repainted); this.completeVisibleCores({ specs, keys }); this.prefetch(keys, specs, visible, repainted); }
      this.cache.forEach(entry => { entry.sprite.visible = visible.has(entry.spec.key); });
      this.measured.visibleBlocks = keys.length; this.measured.frameRepaintBlocks = repainted.size + batchRepainted;
      this.updateOverlays();
    }
    this.app.renderer.render(this.app.stage);
    // Natural-coast worlds show sampling labels only with their explicit
    // geography grid. Legacy worlds keep the original PH05 label behavior.
    const showSamplingLabels = this.data && ((!isCoastalSurface(this.data) && this.data.manifest.version !== 4) || this.gridRequested);
    if (this.data && this.lod && showSamplingLabels && ensure && (!this.displayBusy() || allowAcceptanceLabels)) this.labels?.update({ data: this.data, camera: this.camera, viewport: this.viewport(), lod: this.lod, selectedCellId: this.selected });
    else this.labels?.hide();
    this.callbacks.onCamera?.({ ...this.camera });
    this.measured.frameSequence++;
    // The event reports the previous complete draw: this draw's listener cost
    // is only known once dispatch returns. A request retrieves the latest slot.
    this.emitMetrics();
    this.measured.completedFrameSequence = this.measured.frameSequence;
    this.measured.completedDrawCpuMs = performance.now() - started;
  }
  private requestDraw() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; try { this.draw(); } catch (error) { this.fail(error); } }); }
  private waitFrame(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      let frame = 0;
      const abort = () => { cancelAnimationFrame(frame); signal.removeEventListener('abort', abort); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      frame = requestAnimationFrame(() => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(signal.reason); else resolve(); });
    });
  }
  private emitMetrics() { this.app.canvas.dispatchEvent(new CustomEvent('atlas-render-metrics', { detail: this.metrics() })); }
  private attachDiagnostics() {
    const canvas = this.app.canvas, signal = this.listeners.signal;
    const id = (event: Event) => { const value: unknown = (event as CustomEvent).detail?.requestId; return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null; };
    canvas.addEventListener('atlas-metrics-request', event => {
      const requestId = id(event); if (requestId) canvas.dispatchEvent(new CustomEvent('atlas-metrics-response', { detail: { requestId, metrics: this.metrics() } }));
    }, { signal });
    canvas.addEventListener('atlas-audit-request', event => {
      const requestId = id(event); if (!requestId) return;
      const reply = (detail: object) => { if (!this.destroyed) canvas.dispatchEvent(new CustomEvent('atlas-audit-response', { detail: { requestId, ...detail } })); };
      if (this.failure) { reply({ ok: false, error: '地图显示已锁定，请恢复已保存草稿后再核验。' }); return; }
      if (this.auditing || this.displayBusy() || !this.data || !this.committed) { reply({ ok: false, error: '地图仍在接收或核验，请等待后重试。' }); return; }
      this.auditing = true; const data = this.data, committed = this.committed, source = this.displaySource;
      void (async () => {
        try {
          await verifyAtlasDocument(data, { signal: this.listeners.signal }); const displayManifestDigest = await hashAtlasManifest(data.manifest);
          if (committed.data !== data) await verifyAtlasDocument(committed.data, { signal: this.listeners.signal });
          const manifestDigest = committed.data === data ? displayManifestDigest : await hashAtlasManifest(committed.data.manifest);
          if (this.data !== data || this.committed !== committed || this.displaySource !== source || this.displayBusy()) throw new Error('核验期间地图已经切换，请重试。');
          reply({ ok: true, manifestDigest, draftId: committed.data.manifest.draftId, atlasId: committed.data.manifest.atlasId, revision: committed.data.manifest.revision, verifiedBlocks: committed.data.blocks.size,
            hydrologyTrace: source === 'committed' && this.drainageTrace?.source.manifestDigest === manifestDigest ? structuredClone(this.drainageTrace) : null,
            display: { source, manifestDigest: displayManifestDigest, revision: data.manifest.revision, version: data.manifest.version, verifiedBlocks: data.blocks.size } });
        } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
        finally { this.auditing = false; }
      })();
    }, { signal });
  }
  private clearPointers() {
    this.cancelOutline(); this.outlineGestureBlocked = false;
    const ids = [...this.pointers.keys()]; this.pointers.clear(); this.suppressTap = false;
    for (const id of ids) if (this.app.canvas.hasPointerCapture(id)) this.app.canvas.releasePointerCapture(id);
  }
  private cancelOutline() {
    if (!this.activeOutline) return;
    this.activeOutline = undefined; this.outlinePoints = []; this.outlineRevision++;
    if (!this.destroyed && !this.failure) this.callbacks.onOutlineCancel?.();
    if (this.initialized && !this.destroyed && !this.failure) this.requestDraw();
  }
  private appendOutline(screen: { x: number; y: number }, force = false) {
    const active = this.activeOutline; if (!active) return;
    const world = this.worldSize(), position = screenToWorld(this.camera, screen);
    const point = { xQ: Math.round(Math.max(0, Math.min(world.width, position.x)) * 256), yQ: Math.round(Math.max(0, Math.min(world.height, position.y)) * 256) };
    const last = active.points.at(-1), distance = last ? Math.hypot(point.xQ - last.xQ, point.yQ - last.yQ) : Infinity;
    if (distance < (force ? 1 : active.minimumDistanceQ)) return;
    active.points.push(point);
    if (active.points.length > 256) {
      // Remove only the least significant local bend, retaining both ends and
      // actual input samples. No invented smoothing or coordinates enter data.
      let remove = 1, error = Infinity;
      for (let i = 1; i < active.points.length - 1; i++) {
        const a = active.points[i - 1], b = active.points[i], c = active.points[i + 1], dx = c.xQ - a.xQ, dy = c.yQ - a.yQ;
        const t = Math.max(0, Math.min(1, ((b.xQ - a.xQ) * dx + (b.yQ - a.yQ) * dy) / Math.max(1, dx * dx + dy * dy)));
        const deviation = Math.hypot(b.xQ - a.xQ - t * dx, b.yQ - a.yQ - t * dy);
        if (deviation < error) { error = deviation; remove = i; }
      }
      active.points.splice(remove, 1);
    }
    this.outlineRevision++; this.requestDraw();
  }
  private loseContext() {
    if (this.destroyed || this.failure) return;
    try {
      this.contextEpoch++; this.restoration?.abort(new Error('图形上下文已再次变化。')); this.graphicsState = 'lost'; this.labels?.hide(); this.clearPointers();
      if (!this.recovery) {
        let resolve!: () => void, reject!: (error: Error) => void;
        const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
        void promise.catch(() => undefined); this.recovery = { promise, resolve, reject };
      }
      this.releaseDisplayResources(true); this.callbacks.onGraphicsState?.('lost'); this.emitMetrics();
    } catch (error) { this.fail(error); }
  }
  private async waitForGraphics(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.graphicsState !== 'ready' && this.recovery) {
      if (!signal) await this.recovery.promise;
      else await new Promise<void>((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        this.recovery!.promise.then(() => { signal.removeEventListener('abort', abort); resolve(); }, error => { signal.removeEventListener('abort', abort); reject(error); });
      });
    }
    signal?.throwIfAborted(); this.assertReady();
  }
  private async restoreContext() {
    if (this.destroyed || this.failure || this.graphicsState !== 'lost') return;
    const epoch = this.contextEpoch, restoration = new AbortController(); this.restoration = restoration; this.graphicsState = 'restoring';
    const check = () => { this.assertReady(); if (epoch !== this.contextEpoch) throw new Error('图形上下文已再次变化。'); };
    try {
      this.callbacks.onGraphicsState?.('restoring');
      // Pixi's contextChange handlers run first; old GPU content is discarded.
      await this.waitFrame(restoration.signal); check();
      await this.warmVisible(check, true); check(); this.draw(true, true);
      this.graphicsState = 'ready'; this.callbacks.onGraphicsState?.('ready');
      this.recovery?.resolve(); this.recovery = undefined; this.emitMetrics();
    } catch (error) { if (!this.destroyed && epoch === this.contextEpoch) this.fail(error); }
    finally { if (this.restoration === restoration) this.restoration = undefined; }
  }
  private attachInput() {
    const canvas = this.app.canvas, signal = this.listeners.signal;
    // This surface owns pan, pinch and drawing through Pointer Events. Also
    // consume the corresponding native touch gesture: Chromium can otherwise
    // retain a fling after a captured stroke and swallow the next UI tap as
    // fling cancellation, even with touch-action:none. Scope this to the canvas;
    // inspector scrolling and normal button clicks remain browser-owned.
    const consumeTouch = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    canvas.addEventListener('touchstart', consumeTouch, { passive: false, signal });
    canvas.addEventListener('touchmove', consumeTouch, { passive: false, signal });
    const local = (event: PointerEvent) => { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; };
    canvas.addEventListener('pointerdown', event => {
      if (this.failure || this.graphicsState !== 'ready' || this.displayBusy() || event.button !== 0) return;
      const point = local(event); this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y });
      if (this.pointers.size > 1) { this.suppressTap = true; this.outlineGestureBlocked = true; this.cancelOutline(); }
      else if (this.outlineMode && !this.outlineGestureBlocked && this.data) {
        this.outlinePoints = []; this.activeOutline = { pointerId: event.pointerId, points: [], minimumDistanceQ: Math.max(1, 2 / this.camera.scale * 256) };
        this.appendOutline(point);
      }
      try { canvas.setPointerCapture(event.pointerId); } catch { this.clearPointers(); }
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer || this.failure) return;
      if (this.graphicsState !== 'ready' || this.displayBusy()) { this.clearPointers(); return; }
      const point = local(event), before = [...this.pointers.values()].map(p => ({ x: p.x, y: p.y }));
      const dx = point.x - pointer.x, dy = point.y - pointer.y; pointer.x = point.x; pointer.y = point.y;
      if (Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 6) this.suppressTap = true;
      if (this.pointers.size === 1) {
        if (this.outlineMode) { if (!this.outlineGestureBlocked) this.appendOutline(point); }
        else this.camera = panCamera(this.camera, { x: dx, y: dy });
      }
      else if (before.length === 2) {
        const after = [...this.pointers.values()], oldMid = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 }, newMid = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
        const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y), distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
        if (oldDistance > 1 && distance > 0) this.camera = zoomCameraAt(this.camera, distance / oldDistance, oldMid, this.worldSize(), this.viewport());
        this.camera = panCamera(this.camera, { x: newMid.x - oldMid.x, y: newMid.y - oldMid.y });
      }
      this.requestDraw();
    }, { signal });
    const end = (event: PointerEvent, cancelled: boolean) => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer) return;
      const available = !cancelled && !this.failure && this.pointers.size === 1 && this.graphicsState === 'ready' && !this.displayBusy();
      const tap = available && !this.outlineMode && !this.suppressTap;
      if (cancelled) { this.clearPointers(); return; }
      let completed: AtlasOutlinePoint[] | undefined;
      if (this.activeOutline?.pointerId === event.pointerId) {
        if (available && !this.outlineGestureBlocked && this.outlineMode) {
          this.appendOutline(local(event), true);
          const points = this.activeOutline.points.map(point => ({ ...point }));
          if (points.length > 1 && points[0].xQ === points.at(-1)!.xQ && points[0].yQ === points.at(-1)!.yQ) points.pop();
          if (points.length >= 3) { completed = points; this.outlinePoints = points.map(point => ({ ...point })); this.activeOutline = undefined; this.outlineRevision++; }
          else this.cancelOutline();
        } else this.cancelOutline();
      }
      this.pointers.delete(event.pointerId); if (!this.pointers.size) this.suppressTap = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!this.pointers.size) this.outlineGestureBlocked = false;
      if (completed) { this.requestDraw(); this.callbacks.onOutline?.(completed); }
      if (tap && this.index) {
        const point = screenToWorld(this.camera, local(event)), result = this.index.pick(point);
        if (result.cellId !== null) {
          const fine = this.data?.manifest.version === 4 ? this.detail!.pick(point) : undefined;
          const surface = fine ? { cellId: result.cellId, land: fine.land, height: fine.height, fineCellId: fine.fineCellId }
            : this.data && isCoastalSurface(this.data) ? pickCoastalSurface(this.data, result.cellId, point) : fine === null ? null : undefined;
          if (surface === null) throw new Error('权威海岸拾取未覆盖真实地块。');
          this.select(result.cellId);
          this.callbacks.onPickPoint?.(point);
          if (surface) this.callbacks.onPick(result.cellId, surface); else this.callbacks.onPick(result.cellId);
        }
      }
    };
    canvas.addEventListener('pointerup', event => end(event, false), { signal }); canvas.addEventListener('pointercancel', event => end(event, true), { signal });
    canvas.addEventListener('lostpointercapture', event => { if (this.pointers.has(event.pointerId)) this.clearPointers(); }, { signal });
    window.addEventListener('blur', () => this.clearPointers(), { signal });
    canvas.addEventListener('wheel', event => { if (this.failure || this.graphicsState !== 'ready' || this.displayBusy()) return; event.preventDefault(); this.cancelOutline(); if (this.pointers.size) this.outlineGestureBlocked = true; const bounds = canvas.getBoundingClientRect(); this.zoom(Math.exp(Math.max(-2, Math.min(2, -event.deltaY * .0015))), { x: event.clientX - bounds.left, y: event.clientY - bounds.top }); }, { signal, passive: false });
    canvas.addEventListener('keydown', event => {
      if (this.failure || this.graphicsState !== 'ready' || this.displayBusy()) return;
      if (event.key === 'Escape' && this.activeOutline) { this.clearPointers(); event.preventDefault(); return; }
      if (this.activeOutline && ['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { this.cancelOutline(); this.outlineGestureBlocked = true; }
      if (event.key === '+' || event.key === '=') this.zoom(1.25); else if (event.key === '-') this.zoom(.8);
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { this.camera = panCamera(this.camera, { x: event.key === 'ArrowLeft' ? 48 : event.key === 'ArrowRight' ? -48 : 0, y: event.key === 'ArrowUp' ? 48 : event.key === 'ArrowDown' ? -48 : 0 }); this.requestDraw(); }
      else return; event.preventDefault();
    }, { signal });
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; const error = new Error('地图显示已关闭。'); this.pendingAcceptance?.abort(error); this.pendingPreview?.controller.abort(error); this.restoration?.abort(error); this.recovery?.reject(error); this.recovery = undefined;
    this.listeners.abort(); this.observer?.disconnect(); this.labels?.destroy(); if (this.frame) cancelAnimationFrame(this.frame);
    this.drawnOutline = undefined; this.drawnSelection = undefined; this.drawnPreview = undefined;
    if (this.initialized) {
      this.clearPointers();
      try { this.releaseDisplayResources(); } catch (error) { this.fail(error); }
      finally {
        try { this.emitMetrics(); this.app.destroy(true, { children: true }); }
        finally {
          this.data = undefined; this.committed = undefined; this.index = undefined; this.refs.clear();
          this.previewCells = []; this.previewVertices.clear(); this.deferredDirtyCores.clear();
        }
      }
    }
  }
}
