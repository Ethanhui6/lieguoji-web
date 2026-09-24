import { Application, Container, Graphics, Matrix } from 'pixi.js';
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

export type AtlasRenderDelta = { dirtyKeys: BlockKey[]; changedVertexIds: number[]; affectedCellIds: number[] };
export type { AtlasCamera } from './camera';
export type AtlasGraphicsState = 'ready' | 'lost' | 'restoring';
type Callbacks = {
  onPick: (cellId: number) => void; onCamera?: (camera: AtlasCamera) => void; onFatal: (error: Error) => void;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  onGraphicsState?: (state: AtlasGraphicsState) => void;
};
const ocean = 0x133c50;
const minimumCacheDensity = 1 / 64;
function elevationColor(meters: number) {
  if (meters < 0) return meters < -1000 ? 0x123448 : meters < -200 ? 0x153d50 : 0x205466;
  if (meters < 200) return 0x89a68a;
  if (meters < 800) return 0x6f9375;
  if (meters < 1800) return 0x647a69;
  if (meters < 3500) return 0x8b8d7e;
  return 0xc0c3b5;
}

/** Production atlas only. Cached logical blocks; no experiment fixture or game rule imports. */
export class AtlasRenderer {
  private readonly app = new Application();
  private readonly scene = new Container();
  private readonly selection = new Graphics();
  private readonly preview = new Graphics();
  private readonly outline = new Graphics();
  private readonly terrainLayer = new Container();
  private readonly gridLayer = new Container();
  private readonly cache = new AtlasTextureCache();
  private readonly terrainGeometry = new AtlasTerrainGeometryCache();
  private refs = new Map<BlockKey, string>();
  // This is world-content invalidation, not a texture-entry flag. It survives
  // eviction, density changes and GPU loss until the core is actually visible.
  private readonly deferredDirtyCores = new Set<BlockKey>();
  private labels?: AtlasLabelLayer;
  private lod?: AtlasLod;
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
  constructor(private host: HTMLElement, private callbacks: Callbacks) {}

  async init() {
    await this.app.init({ width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: false, autoStart: false, background: ocean, preference: 'webgl' });
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    this.initialized = true;
    const canvas = this.app.canvas;
    canvas.setAttribute('aria-label', '大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块');
    canvas.setAttribute('data-testid', 'atlas-canvas'); canvas.tabIndex = 0; canvas.style.touchAction = 'none';
    this.host.appendChild(canvas); this.app.stage.addChild(this.scene);
    this.scene.addChild(this.terrainLayer, this.gridLayer, this.outline, this.selection, this.preview);
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
    if (!this.failure) { this.failure = error instanceof Error ? error : new Error(String(error)); this.labels?.hide(); this.pendingAcceptance?.abort(this.failure); this.pendingPreview?.controller.abort(this.failure); this.restoration?.abort(this.failure); this.recovery?.reject(this.failure); this.recovery = undefined; this.callbacks.onFatal(this.failure); }
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
  private specFor(key: BlockKey, layer: AtlasCacheLayer, density: number): AtlasTextureSpec {
    const [, x, y] = key.split(':'), bx = Number(x), by = Number(y), spec = this.data!.manifest.spec, step = spec.width / spec.columns;
    const span = 32 * step, corePixels = span * density, gutter = 2;
    if (!Number.isSafeInteger(corePixels) || corePixels < 1) throw new Error('地图核心未对齐全局纹理采样格。');
    const worldX = bx * span, worldY = by * span, sampleX = worldX - gutter / density, sampleY = worldY - gutter / density;
    const pixelWidth = corePixels + gutter * 2, pixelHeight = corePixels + gutter * 2;
    // Include every possible cell whose permitted shared geometry can enter
    // the sampling halo. Dependencies are block hashes, not guessed sea colors.
    const minCol = Math.max(0, Math.floor((sampleX - step / 4) / step)), minRow = Math.max(0, Math.floor((sampleY - step / 4) / step));
    const maxCol = Math.min(spec.columns - 1, Math.floor((sampleX + pixelWidth / density + step / 4) / step)), maxRow = Math.min(spec.rows - 1, Math.floor((sampleY + pixelHeight / density + step / 4) / step));
    const dependencies: BlockKey[] = [];
    for (let oy = Math.floor(Math.max(0, minRow - 1) / 32); oy <= Math.floor(maxRow / 32); oy++) for (let ox = Math.floor(Math.max(0, minCol - 1) / 32); ox <= Math.floor(maxCol / 32); ox++) dependencies.push(this.geometryKey(ox, oy));
    if (layer === 'terrain') for (let oy = Math.floor(minRow / 32); oy <= Math.floor(maxRow / 32); oy++) for (let ox = Math.floor(minCol / 32); ox <= Math.floor(maxCol / 32); ox++) dependencies.push(`elevation:${ox}:${oy}`);
    const level = Math.log2(density);
    return { key: `${this.data!.manifest.atlasId}/core-halo-v1/${key}/${layer}/${level}/${dependencies.map(key => this.refs.get(key)).join('/')}`, blockKey: key, layer, level,
      pixelWidth, pixelHeight, worldX, worldY, sampleX, sampleY, density, core: { x: gutter, y: gutter, width: corePixels, height: corePixels }, dependencies };
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
    const grid = atlasLodPolicy(this.lod, this.viewport().width).gridVisible;
    // Raster density is a cache sampling level, not a change to geography or semantic LOD.
    const maximum = 2 ** Math.floor(Math.log2(1020 / (step * 32 + step / 2)));
    let density = Math.min(maximum, 2 ** Math.ceil(Math.log2(Math.max(minimumCacheDensity, this.camera.scale * this.app.renderer.resolution))));
    let specs: AtlasTextureSpec[];
    do {
      specs = keys.flatMap(key => [this.specFor(key, 'terrain', density), ...(grid ? [this.specFor(key, 'grid', density)] : [])]);
      if (specs.reduce((sum, item) => sum + item.pixelWidth * item.pixelHeight, 0) <= this.cache.budgetPixels * .75) break;
      density /= 2;
      if (density < minimumCacheDensity) throw new Error('地图可见缓存无法在最低采样密度内满足预算。');
    } while (density >= minimumCacheDensity);
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
    const entry = this.cache.ensure(spec, target => {
      const bounds = { minX: spec.sampleX, minY: spec.sampleY, maxX: spec.sampleX + spec.pixelWidth / spec.density, maxY: spec.sampleY + spec.pixelHeight / spec.density };
      let scratch: Graphics;
      if (spec.layer === 'terrain') {
        const geometrySpec = { atlasId: this.data!.manifest.atlasId, blockKey: spec.blockKey, bounds, dependencies: spec.dependencies.map(key => ({ key, hash: this.refs.get(key)! })) };
        const retained = this.terrainGeometry.get(geometrySpec, this.refs);
        if (retained) scratch = retained;
        else {
          const ids = this.index!.queryCells(bounds).cellIds;
          scratch = this.terrainGeometry.create(geometrySpec, ids.length, graphics => {
            const groups = new Map<number, number[]>();
            for (const id of ids) {
              const elevation = getCellLayerSlot(this.data!, 'elevation', id), color = elevationColor(elevation.block.values[elevation.slot]);
              const cells = groups.get(color) ?? []; cells.push(id); groups.set(color, cells);
            }
            for (const [color, cells] of groups) { for (const id of cells) graphics.poly(getCellQuad(this.data!, id).flatMap(p => [p.x, p.y])); graphics.fill({ color }); }
          });
        }
      } else scratch = new Graphics();
      try {
        if (spec.layer === 'grid') {
          for (const id of this.index!.queryCells(bounds).cellIds) scratch.poly(getCellQuad(this.data!, id).flatMap(p => [p.x, p.y]));
          scratch.stroke({ color: 0xc1d8d3, width: 1 / spec.density, alpha: .25 });
        }
        // Graphics stay in world coordinates. Only the target matrix changes;
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
      let start = performance.now();
      const epoch = this.contextEpoch, data = this.data, plan = this.visiblePlan(), specs = plan.specs.filter(spec => !this.cache.has(spec.key)), keys = [...new Set(specs.map(spec => spec.blockKey))], protectedKeys = new Set(plan.specs.map(spec => spec.key));
      let interrupted = false, batchPainted = new Set<BlockKey>();
      for (let i = 0; i < specs.length; i++) {
        check();
        if (epoch !== this.contextEpoch || data !== this.data || (!recovering && this.graphicsState !== 'ready')) { interrupted = true; break; }
        this.ensureTexture(specs[i], protectedKeys, repainted); batchPainted.add(specs[i].blockKey);
        if ((i + 1) % 8 === 0 || i === specs.length - 1) {
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
    const pending = new AbortController(); this.pendingAcceptance = pending; this.acceptingData = data; this.acceptanceRepaints = new Set(); this.labels?.hide();
    try {
      const fresh = !this.data || this.data.manifest.draftId !== data.manifest.draftId || this.data.manifest.atlasId !== data.manifest.atlasId;
      const preserveCamera = !fresh && this.displaySource === 'generation-preview';
      const fullRepaint = fresh || !delta;
      if (fullRepaint) {
        const index = await createSpatialIndexAsync(data, {
          signal: pending.signal,
          onProgress: progress => { this.assertAcceptance(pending); this.callbacks.onProgress?.(progress); },
          yieldTask: async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); this.assertAcceptance(pending); },
        });
        this.assertAcceptance(pending); if (this.graphicsState !== 'ready') await this.waitForGraphics(); this.assertAcceptance(pending); this.index = index;
        this.cache.clear(); this.terrainGeometry.clear(); this.deferredDirtyCores.clear();
        this.data = data; this.previewCells = []; this.previewVertices.clear(); this.lod = undefined;
        if (!preserveCamera) { this.selected = null; this.camera = fitCamera(this.worldSize(), this.viewport()); }
      } else {
        if (this.graphicsState !== 'ready') await this.waitForGraphics(); this.assertAcceptance(pending);
        if (data.manifest.revision !== this.data!.manifest.revision + 1) throw new Error('地图增量修订不连续，请恢复已保存草稿。');
        this.index!.updateGeometry(data, delta.changedVertexIds);
        this.data = data;
      }
      this.displaySource = 'committed';
      this.refs = new Map(data.manifest.blockRefs.map(ref => [ref.key, ref.hash]));
      if (delta) {
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
      this.cache.clear(); this.terrainGeometry.clear(); this.deferredDirtyCores.clear(); this.data = data; this.index = index;
      this.refs = new Map(data.manifest.blockRefs.map(ref => [ref.key, ref.hash]));
    }
    this.displaySource = source; this.previewCells = []; this.previewVertices.clear(); this.previewRevision++; this.labels?.hide(); this.clearPointers();
  }
  metrics() { return { ...this.measured, repaintBlockKeys: [...this.measured.repaintBlockKeys], camera: { ...this.camera }, viewport: { width: this.app.screen?.width ?? 0, height: this.app.screen?.height ?? 0, resolution: this.initialized ? this.app.renderer.resolution : 1 }, gpu: { state: this.graphicsState, epoch: this.contextEpoch }, cache: this.cache.stats(), geometryCache: this.terrainGeometry.stats(), selected: this.selected, destroyed: this.destroyed, fatal: !!this.failure,
    displaySource: this.displaySource, displayRevision: this.data?.manifest.revision ?? null, displayVersion: this.data?.manifest.version ?? null,
    committedRevision: this.committed?.data.manifest.revision ?? null, displayCorrectFrameAt: this.displayCorrectFrameAt,
    lod: this.lod ?? 'far', cellPixels: this.data ? this.camera.scale * this.data.manifest.spec.width / this.data.manifest.spec.columns : 0,
    gridVisible: this.lod ? atlasLodPolicy(this.lod, this.app.screen.width).gridVisible : false, labels: this.labels?.metrics() ?? emptyAtlasLabelMetrics() }; }
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
  focusCell(cellId: number, zoom = true) {
    this.guarded(() => { if (!this.data) return;
    const quad = getCellQuad(this.data, cellId), x = quad.reduce((sum, p) => sum + p.x, 0) / 4, y = quad.reduce((sum, p) => sum + p.y, 0) / 4;
    if (this.graphicsState !== 'ready') return;
    if (zoom) this.camera = { ...this.camera, scale: Math.max(this.camera.scale, cameraScaleBounds(this.worldSize(), this.viewport()).fitScale * 8) };
    this.camera = centerCameraAt(this.camera, { x, y }, { x: this.app.screen.width * .42, y: this.app.screen.height * .35 });
    this.selected = cellId; this.draw(); });
  }
  fit() {
    this.guarded(() => { if (this.graphicsState !== 'ready') return; this.camera = fitCamera(this.worldSize(), this.viewport()); this.draw(); });
  }
  zoom(factor: number, point = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }) {
    this.guarded(() => { if (this.graphicsState !== 'ready') return;
      this.camera = zoomCameraAt(this.camera, factor, point, this.worldSize(), this.viewport()); this.requestDraw();
    });
  }
  /** World-space overlays survive translation. Rebuild only their actual
   * inputs, stroke scale or GPU epoch; keep this work inside draw's CPU span. */
  private updateOverlays() {
    if (!this.data) return;
    const data = this.data, scale = this.camera.scale, epoch = this.contextEpoch, world = this.worldSize();
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
    this.scene.position.set(this.camera.x, this.camera.y); this.scene.scale.set(this.camera.scale);
    if (this.index && this.data) {
      const { specs, keys } = this.visiblePlan(), visible = new Set(specs.map(spec => spec.key)), repainted = new Set<BlockKey>();
      if (ensure) { for (const spec of specs) this.ensureTexture(spec, visible, repainted); this.completeVisibleCores({ specs, keys }); this.prefetch(keys, specs, visible, repainted); }
      this.cache.forEach(entry => { entry.sprite.visible = visible.has(entry.spec.key); });
      this.measured.visibleBlocks = keys.length; this.measured.frameRepaintBlocks = repainted.size + batchRepainted;
      this.updateOverlays();
    }
    this.app.renderer.render(this.app.stage);
    if (this.data && this.lod && ensure && (!this.displayBusy() || allowAcceptanceLabels)) this.labels?.update({ data: this.data, camera: this.camera, viewport: this.viewport(), lod: this.lod, selectedCellId: this.selected });
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
            display: { source, manifestDigest: displayManifestDigest, revision: data.manifest.revision, version: data.manifest.version, verifiedBlocks: data.blocks.size } });
        } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
        finally { this.auditing = false; }
      })();
    }, { signal });
  }
  private clearPointers() {
    const ids = [...this.pointers.keys()]; this.pointers.clear(); this.suppressTap = false;
    for (const id of ids) if (this.app.canvas.hasPointerCapture(id)) this.app.canvas.releasePointerCapture(id);
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
      this.cache.clear(); this.terrainGeometry.clear(); this.callbacks.onGraphicsState?.('lost'); this.emitMetrics();
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
    const local = (event: PointerEvent) => { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; };
    canvas.addEventListener('pointerdown', event => {
      if (this.failure || this.graphicsState !== 'ready' || this.displayBusy() || event.button !== 0) return;
      const point = local(event); this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y });
      if (this.pointers.size > 1) this.suppressTap = true;
      try { canvas.setPointerCapture(event.pointerId); } catch { this.clearPointers(); }
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer || this.failure) return;
      const point = local(event), before = [...this.pointers.values()].map(p => ({ x: p.x, y: p.y }));
      const dx = point.x - pointer.x, dy = point.y - pointer.y; pointer.x = point.x; pointer.y = point.y;
      if (Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 6) this.suppressTap = true;
      if (this.pointers.size === 1) this.camera = panCamera(this.camera, { x: dx, y: dy });
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
      const tap = !cancelled && !this.failure && !this.suppressTap && this.pointers.size === 1 && this.graphicsState === 'ready' && !this.displayBusy();
      if (cancelled) { this.clearPointers(); return; }
      this.pointers.delete(event.pointerId); if (!this.pointers.size) this.suppressTap = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (tap && this.index) {
        const point = local(event), result = this.index.pick(screenToWorld(this.camera, point));
        if (result.cellId !== null) { this.select(result.cellId); this.callbacks.onPick(result.cellId); }
      }
    };
    canvas.addEventListener('pointerup', event => end(event, false), { signal }); canvas.addEventListener('pointercancel', event => end(event, true), { signal });
    canvas.addEventListener('lostpointercapture', event => { if (this.pointers.has(event.pointerId)) this.clearPointers(); }, { signal });
    window.addEventListener('blur', () => this.clearPointers(), { signal });
    canvas.addEventListener('wheel', event => { if (this.failure || this.graphicsState !== 'ready' || this.displayBusy()) return; event.preventDefault(); const bounds = canvas.getBoundingClientRect(); this.zoom(Math.exp(Math.max(-2, Math.min(2, -event.deltaY * .0015))), { x: event.clientX - bounds.left, y: event.clientY - bounds.top }); }, { signal, passive: false });
    canvas.addEventListener('keydown', event => {
      if (this.failure || this.graphicsState !== 'ready' || this.displayBusy()) return;
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
      try { this.cache.clear(); } catch (error) { this.fail(error); }
      try { this.terrainGeometry.clear(); } catch (error) { this.fail(error); }
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
