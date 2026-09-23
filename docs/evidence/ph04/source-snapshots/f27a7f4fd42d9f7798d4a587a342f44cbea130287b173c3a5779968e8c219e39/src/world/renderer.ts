import { Application, Container, Graphics } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { AtlasDraftData, BlockKey } from './model';
import { getCellLayerSlot } from './model';
import { cellBlock, cellVertexIds, getCellQuad } from './topology';
import { SpatialIndex } from './spatial-index';

export type AtlasRenderDelta = { dirtyKeys: BlockKey[]; changedVertexIds: number[]; affectedCellIds: number[] };
export type AtlasCamera = { x: number; y: number; scale: number };
type Callbacks = {
  onPick: (cellId: number) => void; onCamera?: (camera: AtlasCamera) => void; onFatal: (error: Error) => void;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
};
type Tile = { bx: number; by: number; terrain: Graphics; grid: Graphics; gridReady: boolean };
const ocean = 0x133c50;
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
  private readonly tiles = new Map<BlockKey, Tile>();
  private index?: SpatialIndex;
  private data?: AtlasDraftData;
  private selected: number | null = null;
  private previewCells: number[] = [];
  private previewVertices = new Map<number, { x: number; y: number }>();
  private camera: AtlasCamera = { x: 0, y: 0, scale: 1 };
  private fitScale = 1;
  private readonly listeners = new AbortController();
  private observer?: ResizeObserver;
  private destroyed = false;
  private initialized = false;
  private failure?: Error;
  private frame = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private suppressTap = false;
  private measured = { repaintBlocks: 0, visibleBlocks: 0, acceptedRevision: -1, correctFrameAt: 0 };
  constructor(private host: HTMLElement, private callbacks: Callbacks) {}

  async init() {
    await this.app.init({ width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: false, autoStart: false, background: ocean, preference: 'webgl' });
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    this.initialized = true;
    const canvas = this.app.canvas;
    canvas.setAttribute('aria-label', '大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块');
    canvas.setAttribute('data-testid', 'atlas-canvas'); canvas.tabIndex = 0; canvas.style.touchAction = 'none';
    this.host.appendChild(canvas); this.app.stage.addChild(this.scene);
    this.scene.addChild(this.outline, this.selection, this.preview);
    this.attachInput();
    this.observer = new ResizeObserver(() => {
      if (this.destroyed || this.failure) return;
      try {
        const before = { width: this.app.screen.width, height: this.app.screen.height };
        this.app.renderer.resize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
        this.camera.x += (this.app.screen.width - before.width) / 2; this.camera.y += (this.app.screen.height - before.height) / 2;
        if (this.data) this.fitScale = Math.min(this.app.screen.width / 4096, this.app.screen.height / 4096) * .9;
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
    if (!this.failure) { this.failure = error instanceof Error ? error : new Error(String(error)); this.callbacks.onFatal(this.failure); }
    return this.failure;
  }
  private guarded<T>(action: () => T): T { try { this.assertReady(); return action(); } catch (error) { throw this.fail(error); } }
  private geometryKey(bx: number, by: number): BlockKey { return `geometry:${bx}:${by}`; }
  private paint(tile: Tile) {
    if (!this.data) return;
    const spec = this.data.manifest.spec, groups = new Map<number, number[]>();
    for (let row = tile.by * 32; row < (tile.by + 1) * 32; row++) for (let col = tile.bx * 32; col < (tile.bx + 1) * 32; col++) {
      const id = row * spec.columns + col, elevation = getCellLayerSlot(this.data, 'elevation', id), color = elevationColor(elevation.block.values[elevation.slot]);
      const cells = groups.get(color) ?? []; cells.push(id); groups.set(color, cells);
    }
    tile.terrain.clear();
    for (const [color, cells] of groups) {
      for (const id of cells) tile.terrain.poly(getCellQuad(this.data, id).flatMap(point => [point.x, point.y]));
      tile.terrain.fill({ color });
    }
    tile.grid.clear(); tile.gridReady = false;
  }
  private paintGrid(tile: Tile) {
    if (!this.data || tile.gridReady) return;
    for (let row = tile.by * 32; row < (tile.by + 1) * 32; row++) for (let col = tile.bx * 32; col < (tile.bx + 1) * 32; col++) {
      const quad = getCellQuad(this.data, row * this.data.manifest.spec.columns + col);
      tile.grid.poly(quad.flatMap(point => [point.x, point.y]));
    }
    tile.grid.stroke({ color: 0xc1d8d3, width: .28, alpha: .25 }); tile.gridReady = true;
  }
  /** Returns only after submitting the committed state and a frame opportunity. */
  async accept(data: AtlasDraftData, delta?: AtlasRenderDelta) {
    this.assertReady();
    try {
      const fresh = !this.data || this.data.manifest.draftId !== data.manifest.draftId || this.data.manifest.atlasId !== data.manifest.atlasId;
      const fullRepaint = fresh || !delta;
      const dirty = new Set<BlockKey>();
      if (fullRepaint) {
        this.index = new SpatialIndex(data);
        for (const tile of this.tiles.values()) { tile.terrain.destroy(); tile.grid.destroy(); } this.tiles.clear();
        this.data = data; this.selected = null; this.previewCells = []; this.previewVertices.clear();
        const across = data.manifest.spec.columns / 32;
        for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
          const terrain = new Graphics(), grid = new Graphics(), key = this.geometryKey(bx, by);
          this.scene.addChildAt(terrain, 0); this.scene.addChildAt(grid, 1);
          this.tiles.set(key, { bx, by, terrain, grid, gridReady: false }); dirty.add(key);
        }
        this.fit();
      } else {
        if (data.manifest.revision !== this.data!.manifest.revision + 1) throw new Error('地图增量修订不连续，请恢复已保存草稿。');
        const update = this.index!.updateGeometry(data, delta.changedVertexIds);
        for (const key of update.affectedDisplayBlocks) dirty.add(key);
        for (const key of delta.dirtyKeys) if (key.startsWith('elevation:')) { const [, x, y] = key.split(':'); dirty.add(this.geometryKey(Number(x), Number(y))); }
        // The committed affected cell list includes all shared-vertex incident quads.
        for (const id of delta.affectedCellIds) { const block = cellBlock(data.manifest.spec, id); dirty.add(this.geometryKey(block.bx, block.by)); }
        this.data = data;
      }
      let completed = 0;
      for (const key of dirty) {
        const tile = this.tiles.get(key); if (!tile) throw new Error('地图增量引用缺失显示块。'); this.paint(tile); completed++;
        if (fullRepaint && (completed % 8 === 0 || completed === dirty.size)) {
          // Submit this batch now so Pixi does not defer all geometry work to
          // one final render; progress follows an actual drawing submission.
          this.draw();
          this.callbacks.onProgress?.({ stage: '绘制已核验地理块', completed, total: dirty.size });
          if (completed < dirty.size) { await new Promise<void>(resolve => setTimeout(resolve, 0)); this.assertReady(); }
        }
      }
      this.measured.repaintBlocks = dirty.size; this.measured.acceptedRevision = data.manifest.revision;
      this.previewCells = []; this.previewVertices.clear(); this.draw();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      this.assertReady(); this.draw(); this.measured.correctFrameAt = performance.now();
      return this.metrics();
    } catch (error) { throw this.fail(error); }
  }
  metrics() { return { ...this.measured, camera: { ...this.camera }, viewport: { width: this.app.screen?.width ?? 0, height: this.app.screen?.height ?? 0 }, fatal: !!this.failure }; }
  select(cellId: number | null) { this.guarded(() => { if (cellId !== null && this.data) getCellQuad(this.data, cellId); this.selected = cellId; this.draw(); }); }
  showPreview(cellIds: number[], vertices?: { ids: Uint32Array; xyQ: Int32Array }) {
    this.guarded(() => {
      this.previewCells = [...cellIds]; this.previewVertices.clear();
      if (vertices) for (let i = 0; i < vertices.ids.length; i++) this.previewVertices.set(vertices.ids[i], { x: vertices.xyQ[i * 2] / 256, y: vertices.xyQ[i * 2 + 1] / 256 });
      this.draw();
    });
  }
  focusCell(cellId: number, zoom = true) {
    this.guarded(() => { if (!this.data) return;
    const quad = getCellQuad(this.data, cellId), x = quad.reduce((sum, p) => sum + p.x, 0) / 4, y = quad.reduce((sum, p) => sum + p.y, 0) / 4;
    if (zoom) this.camera.scale = Math.max(this.camera.scale, this.fitScale * 8);
    this.camera.x = this.app.screen.width * .42 - x * this.camera.scale; this.camera.y = this.app.screen.height * .35 - y * this.camera.scale;
    this.selected = cellId; this.draw(); });
  }
  fit() {
    this.guarded(() => { this.fitScale = Math.min(this.app.screen.width / 4096, this.app.screen.height / 4096) * .9;
      this.camera = { x: (this.app.screen.width - 4096 * this.fitScale) / 2, y: (this.app.screen.height - 4096 * this.fitScale) / 2, scale: this.fitScale }; this.draw(); });
  }
  zoom(factor: number, point = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }) {
    this.guarded(() => { const before = this.camera.scale, after = Math.max(this.fitScale * .5, Math.min(this.fitScale * 80, before * factor));
    this.camera.x = point.x - (point.x - this.camera.x) * after / before; this.camera.y = point.y - (point.y - this.camera.y) * after / before; this.camera.scale = after; this.requestDraw();
    });
  }
  private draw() {
    if (!this.initialized || this.destroyed || this.failure) return;
    this.scene.position.set(this.camera.x, this.camera.y); this.scene.scale.set(this.camera.scale);
    if (this.index && this.data) {
      const bounds = { minX: -this.camera.x / this.camera.scale, minY: -this.camera.y / this.camera.scale, maxX: (this.app.screen.width - this.camera.x) / this.camera.scale, maxY: (this.app.screen.height - this.camera.y) / this.camera.scale };
      const visible = new Set(this.index.queryBlocks(bounds).blockKeys), showGrid = this.camera.scale * (4096 / this.data.manifest.spec.columns) >= 18;
      for (const [key, tile] of this.tiles) { tile.terrain.visible = visible.has(key); tile.grid.visible = visible.has(key) && showGrid; if (tile.grid.visible) this.paintGrid(tile); }
      this.measured.visibleBlocks = visible.size;
      this.outline.clear().rect(0, 0, 4096, 4096).stroke({ color: 0xa9c6c5, width: 1 / this.camera.scale, alpha: .7 });
      this.selection.clear();
      if (this.selected !== null) this.selection.poly(getCellQuad(this.data, this.selected).flatMap(p => [p.x, p.y])).fill({ color: 0xe7ca8b, alpha: .25 }).stroke({ color: 0xf1d79c, width: 2 / this.camera.scale });
      this.preview.clear();
      for (const id of this.previewCells) {
        const ids = cellVertexIds(this.data.manifest.spec, id), ordered = [ids[0], ids[1], ids[3], ids[2]];
        this.preview.poly(getCellQuad(this.data, id).flatMap((point, index) => { const p = this.previewVertices.get(ordered[index]) ?? point; return [p.x, p.y]; }));
      }
      if (this.previewCells.length) this.preview.fill({ color: 0xf2d49b, alpha: .24 }).stroke({ color: 0xffd88c, width: 1 / this.camera.scale });
    }
    this.app.renderer.render(this.app.stage); this.callbacks.onCamera?.({ ...this.camera });
  }
  private requestDraw() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; try { this.draw(); } catch (error) { this.fail(error); } }); }
  private attachInput() {
    const canvas = this.app.canvas, signal = this.listeners.signal;
    const local = (event: PointerEvent) => { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; };
    canvas.addEventListener('pointerdown', event => {
      if (this.failure || event.button !== 0) return;
      const point = local(event); this.pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y });
      if (this.pointers.size > 1) this.suppressTap = true; canvas.setPointerCapture(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer || this.failure) return;
      const point = local(event), before = [...this.pointers.values()].map(p => ({ x: p.x, y: p.y }));
      const dx = point.x - pointer.x, dy = point.y - pointer.y; pointer.x = point.x; pointer.y = point.y;
      if (Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 6) this.suppressTap = true;
      if (this.pointers.size === 1) { this.camera.x += dx; this.camera.y += dy; }
      else if (before.length === 2) {
        const after = [...this.pointers.values()], oldMid = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 }, newMid = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
        const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y), distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
        if (oldDistance > 1) this.zoom(distance / oldDistance, oldMid);
        this.camera.x += newMid.x - oldMid.x; this.camera.y += newMid.y - oldMid.y;
      }
      this.requestDraw();
    }, { signal });
    const end = (event: PointerEvent, cancelled: boolean) => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer) return;
      if (!cancelled && !this.failure && !this.suppressTap && this.pointers.size === 1 && this.index) {
        const point = local(event), result = this.index.pick({ x: (point.x - this.camera.x) / this.camera.scale, y: (point.y - this.camera.y) / this.camera.scale });
        if (result.cellId !== null) { this.select(result.cellId); this.callbacks.onPick(result.cellId); }
      }
      this.pointers.delete(event.pointerId); if (!this.pointers.size) this.suppressTap = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerup', event => end(event, false), { signal }); canvas.addEventListener('pointercancel', event => end(event, true), { signal });
    canvas.addEventListener('wheel', event => { if (this.failure) return; event.preventDefault(); const bounds = canvas.getBoundingClientRect(); this.zoom(Math.exp(-event.deltaY * .0015), { x: event.clientX - bounds.left, y: event.clientY - bounds.top }); }, { signal, passive: false });
    canvas.addEventListener('keydown', event => {
      if (this.failure) return;
      if (event.key === '+' || event.key === '=') this.zoom(1.25); else if (event.key === '-') this.zoom(.8);
      else if (event.key.startsWith('Arrow')) { this.camera.x += event.key === 'ArrowLeft' ? 48 : event.key === 'ArrowRight' ? -48 : 0; this.camera.y += event.key === 'ArrowUp' ? 48 : event.key === 'ArrowDown' ? -48 : 0; this.requestDraw(); }
      else return; event.preventDefault();
    }, { signal });
  }
  destroy() { this.destroyed = true; this.listeners.abort(); this.observer?.disconnect(); if (this.frame) cancelAnimationFrame(this.frame); if (this.initialized) this.app.destroy(true, { children: true }); }
}
