import { Application, Container, Graphics, Sprite, Text, Texture, type WebGLRenderer } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { cellAt, cellPolygon, elevationAt, nationAt } from './fixture';
import type { ScaleFixture, ScalePoint } from './types';

export type ScaleQuality = 'high' | 'low';
export type ScaleLayer = 'terrain' | 'administration';
export type ScaleCamera = { x: number; y: number; scale: number };
export type ScalePick = { cellId: number; stableId: string; regionId: number | null; nationId: number | null; cityIds: number[]; world: ScalePoint };
export type RepaintHint = { cellIds?: number[]; regionIds?: number[] };
export type ScaleFrameSample = {
  requestedDurationMs: number; elapsedMs: number; frameIntervals: number[]; renderSubmissionMs: number[];
  p95: number; max: number; count: number; mean: number; quality: ScaleQuality; layer: ScaleLayer;
  cancelled: boolean; hiddenDuringSample: boolean; valid: boolean; pathVersion: string;
  viewport: { width: number; height: number; resolution: number };
};
type Chunk = { id: number; col: number; row: number; endCol: number; endRow: number; bounds: { x: number; y: number; width: number; height: number }; canvas: HTMLCanvasElement; texture: Texture; sprite: Sprite };
type CityMarker = { id: number; cellId: number; x: number; y: number; name: string };
const CHUNK_CELLS = 32;
const TEXELS_PER_CELL = 4;
const percentile = (values: number[], ratio: number) => values.length ? [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length * ratio) - 1)] : 0;

/** PH03 candidate only: cached raster tiles from actual shared polygon vertices. */
export class ScaleRenderer {
  private app = new Application();
  private world = new Container();
  private terrain = new Container();
  private markers = new Graphics();
  private selection = new Graphics();
  private labels = new Container();
  private labelPool: Text[] = [];
  private fixture?: ScaleFixture;
  private chunks: Chunk[] = [];
  private regionChunks = new Map<number, Set<number>>();
  private cityChunks = new Map<number, CityMarker[]>();
  private cityCells = new Map<number, number[]>();
  private selected: number | null = null;
  private camera: ScaleCamera = { x: 0, y: 0, scale: 1 };
  private fitScale = 1;
  private quality: ScaleQuality = 'high';
  private layer: ScaleLayer = 'terrain';
  private observer?: ResizeObserver;
  private abort = new AbortController();
  private sampleRunning = false;
  private sampleCancelled = false;
  private destroyed = false;
  private initialized = false;
  private onPick?: (pick: ScalePick | null) => void;
  private drag?: { pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean };
  private timings = { webglInitMs: 0, lastFixtureMs: 0, lastRepaintMs: 0, lastRenderSubmissionMs: 0, lastRepaintChunks: 0, visibleChunks: 0, visibleCityMarkers: 0, visibleLabels: 0 };
  private glInfo: Record<string, string | number | boolean | null> = {};
  constructor(private host: HTMLElement) {}

  async init() {
    const start = performance.now();
    await this.app.init({ width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: false, autoStart: false, preference: 'webgl', background: '#102b38' });
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    this.initialized = true;
    this.timings.webglInitMs = performance.now() - start;
    this.app.canvas.setAttribute('aria-label', 'PH03 真实规模样本地图，拖动平移，滚轮缩放，点击选择地理样本');
    this.app.canvas.setAttribute('data-testid', 'scale-canvas');
    this.host.appendChild(this.app.canvas);
    this.world.addChild(this.terrain, this.markers, this.labels, this.selection);
    this.app.stage.addChild(this.world);
    const gl = (this.app.renderer as WebGLRenderer).gl;
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      this.glInfo = {
        version: String(gl.getParameter(gl.VERSION)), shadingLanguage: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
        vendor: String(gl.getParameter(gl.VENDOR)), renderer: String(gl.getParameter(gl.RENDERER)),
        maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
        unmaskedVendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
        unmaskedRenderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
        debugInfoAvailable: !!debug,
      };
    }
    this.observer = new ResizeObserver(() => {
      if (this.destroyed) return;
      this.app.renderer.resize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight), this.resolution());
      if (this.fixture) this.fitScale = Math.min(this.host.clientWidth / this.fixture.atlas.width, this.host.clientHeight / this.fixture.atlas.height) * .94;
      this.draw();
    });
    this.observer.observe(this.host);
    this.attachInput();
    this.draw();
  }
  private resolution() { return this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1; }
  private attachInput() {
    const signal = this.abort.signal;
    this.host.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.sampleRunning) return;
      this.host.setPointerCapture(event.pointerId);
      this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: this.camera.x, originY: this.camera.y, moved: false };
    }, { signal });
    this.host.addEventListener('pointermove', event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      this.setCamera({ x: this.drag.originX + dx, y: this.drag.originY + dy, scale: this.camera.scale });
    }, { signal });
    const finish = (event: PointerEvent) => {
      const drag = this.drag;
      this.drag = undefined;
      if (!drag || drag.pointerId !== event.pointerId || event.type !== 'pointerup' || drag.moved) return;
      const rect = this.host.getBoundingClientRect();
      const pick = this.pick(event.clientX - rect.left, event.clientY - rect.top);
      this.select(pick?.cellId ?? null); this.onPick?.(pick);
    };
    this.host.addEventListener('pointerup', finish, { signal });
    this.host.addEventListener('pointercancel', finish, { signal });
    this.host.addEventListener('wheel', event => {
      event.preventDefault();
      if (this.sampleRunning) return;
      const rect = this.host.getBoundingClientRect();
      this.zoomBy(Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }, { signal, passive: false });
  }
  setPickHandler(handler: (pick: ScalePick | null) => void) { this.onPick = handler; }
  getCamera() { return { ...this.camera }; }
  viewport() { return { width: this.app.screen.width, height: this.app.screen.height, resolution: this.app.renderer.resolution }; }
  screenToWorld(x: number, y: number) { return { x: (x - this.camera.x) / this.camera.scale, y: (y - this.camera.y) / this.camera.scale }; }
  worldToScreen(x: number, y: number) { return { x: x * this.camera.scale + this.camera.x, y: y * this.camera.scale + this.camera.y }; }
  setCamera(camera: ScaleCamera) {
    if (![camera.x, camera.y, camera.scale].every(Number.isFinite) || camera.scale <= 0) throw new Error('相机参数必须为有限坐标与正缩放。');
    this.camera = { ...camera, scale: Math.max(this.fitScale * .35, Math.min(camera.scale, this.fitScale * 40)) };
    return this.draw();
  }
  fit() {
    if (!this.fixture) return;
    const { width, height } = this.fixture.atlas;
    this.fitScale = Math.min(this.app.screen.width / width, this.app.screen.height / height) * .94;
    this.setCamera({ x: (this.app.screen.width - width * this.fitScale) / 2, y: (this.app.screen.height - height * this.fitScale) / 2, scale: this.fitScale });
  }
  zoomBy(factor: number, anchor = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }) {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('缩放倍率无效。');
    const point = this.screenToWorld(anchor.x, anchor.y);
    const scale = Math.max(this.fitScale * .35, Math.min(this.camera.scale * factor, this.fitScale * 40));
    return this.setCamera({ scale, x: anchor.x - point.x * scale, y: anchor.y - point.y * scale });
  }
  pick(x: number, y: number): ScalePick | null {
    if (!this.fixture || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const world = this.screenToWorld(x, y), cellId = cellAt(this.fixture, world);
    if (cellId === undefined) return null;
    const region = this.fixture.atlas.regionByCell[cellId];
    return { cellId, stableId: 'cell:' + cellId, regionId: region === 0xffffffff ? null : region, nationId: nationAt(this.fixture, cellId) ?? null, cityIds: [...(this.cityCells.get(cellId) ?? [])], world };
  }
  select(cellId: number | null) {
    if (cellId !== null && (!this.fixture || !Number.isInteger(cellId) || cellId < 0 || cellId >= this.fixture.atlas.land.length)) throw new Error('地理样本编号无效。');
    this.selected = cellId; this.draw();
  }
  async setQuality(quality: ScaleQuality) {
    if (quality !== 'high' && quality !== 'low') throw new Error('画质档无效。');
    this.quality = quality;
    this.app.renderer.resize(this.app.screen.width, this.app.screen.height, this.resolution());
    // Resolution, boundary detail and label count only; fixture and pick never change.
    return this.draw();
  }
  setLayer(layer: ScaleLayer) {
    if (layer !== 'terrain' && layer !== 'administration') throw new Error('图层无效。');
    if (layer === this.layer) return this.metrics();
    this.layer = layer;
    const start = performance.now();
    for (const chunk of this.chunks) this.paintChunk(chunk);
    this.draw();
    this.timings.lastRepaintMs = performance.now() - start;
    this.timings.lastRepaintChunks = this.chunks.length;
    return this.metrics();
  }
  setFixture(fixture: ScaleFixture, hint?: RepaintHint) {
    const start = performance.now();
    const sameAtlas = this.fixture && this.fixture.options.seed === fixture.options.seed && this.fixture.options.scenario === fixture.options.scenario && this.fixture.atlas.columns === fixture.atlas.columns && this.fixture.atlas.rows === fixture.atlas.rows;
    this.fixture = fixture;
    if (!sameAtlas || !hint || this.chunks.length === 0) {
      this.destroyChunks(); this.regionChunks.clear(); this.cityChunks.clear(); this.cityCells.clear();
      this.makeChunks(); this.indexEntities();
      this.timings.lastRepaintChunks = this.chunks.length;
    } else {
      const changed = new Set<number>();
      for (const cellId of hint.cellIds ?? []) changed.add(this.chunkForCell(cellId));
      for (const regionId of hint.regionIds ?? []) for (const id of this.regionChunks.get(regionId) ?? []) changed.add(id);
      for (const id of changed) if (this.chunks[id]) this.paintChunk(this.chunks[id]);
      this.timings.lastRepaintChunks = changed.size;
    }
    if (!sameAtlas) { this.selected = null; this.fit(); } else this.draw();
    this.timings.lastFixtureMs = performance.now() - start;
    this.timings.lastRepaintMs = this.timings.lastFixtureMs;
    return this.metrics();
  }
  private chunkForCell(cellId: number) {
    const atlas = this.fixture!.atlas;
    return Math.floor(Math.floor(cellId / atlas.columns) / CHUNK_CELLS) * Math.ceil(atlas.columns / CHUNK_CELLS) + Math.floor((cellId % atlas.columns) / CHUNK_CELLS);
  }
  private makeChunks() {
    const fixture = this.fixture!, atlas = fixture.atlas;
    for (let row = 0; row < atlas.rows; row += CHUNK_CELLS) for (let col = 0; col < atlas.columns; col += CHUNK_CELLS) {
      const endCol = Math.min(col + CHUNK_CELLS, atlas.columns), endRow = Math.min(row + CHUNK_CELLS, atlas.rows);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let y = row; y <= endRow; y++) for (let x = col; x <= endCol; x++) {
        const v = y * (atlas.columns + 1) + x;
        minX = Math.min(minX, atlas.vertexX[v]); minY = Math.min(minY, atlas.vertexY[v]);
        maxX = Math.max(maxX, atlas.vertexX[v]); maxY = Math.max(maxY, atlas.vertexY[v]);
      }
      const padding = Math.max(atlas.width / atlas.columns, atlas.height / atlas.rows) / TEXELS_PER_CELL;
      const bounds = { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(bounds.width / (atlas.width / atlas.columns) * TEXELS_PER_CELL);
      canvas.height = Math.ceil(bounds.height / (atlas.height / atlas.rows) * TEXELS_PER_CELL);
      const texture = Texture.from(canvas);
      texture.source.scaleMode = 'linear';
      const sprite = new Sprite(texture);
      sprite.position.set(bounds.x, bounds.y); sprite.width = bounds.width; sprite.height = bounds.height;
      const chunk = { id: this.chunks.length, col, row, endCol, endRow, bounds, canvas, texture, sprite };
      this.chunks.push(chunk); this.terrain.addChild(sprite);
      for (let y = row; y < endRow; y++) for (let x = col; x < endCol; x++) {
        const region = atlas.regionByCell[y * atlas.columns + x];
        if (region === 0xffffffff) continue;
        const list = this.regionChunks.get(region) ?? new Set<number>(); list.add(chunk.id); this.regionChunks.set(region, list);
      }
      this.paintChunk(chunk);
    }
  }
  private paintChunk(chunk: Chunk) {
    const fixture = this.fixture!, context = chunk.canvas.getContext('2d');
    if (!context) throw new Error('分块纹理的二维绘制上下文不可用。');
    context.clearRect(0, 0, chunk.canvas.width, chunk.canvas.height);
    const sx = chunk.canvas.width / chunk.bounds.width, sy = chunk.canvas.height / chunk.bounds.height;
    for (let row = chunk.row; row < chunk.endRow; row++) for (let col = chunk.col; col < chunk.endCol; col++) {
      const id = row * fixture.atlas.columns + col, polygon = cellPolygon(fixture, id);
      const height = elevationAt(fixture, id), moisture = fixture.atlas.moisture[id];
      let red: number, green: number, blue: number;
      if (!fixture.atlas.land[id]) { red = 14; green = 43 + Math.round((height + 1) * 10); blue = 57 + Math.round((height + 1) * 10); }
      else if (this.layer === 'administration') {
        const nation = nationAt(fixture, id), color = nation === undefined ? 0x90968a : fixture.entities.nations[nation].color;
        const shade = .75 + height * .25;
        red = Math.round((color >> 16 & 255) * shade); green = Math.round((color >> 8 & 255) * shade); blue = Math.round((color & 255) * shade);
      } else {
        red = Math.round(92 + height * 95 - moisture * 25); green = Math.round(116 + height * 63 + moisture * 18); blue = Math.round(77 + height * 91 - moisture * 9);
      }
      context.beginPath();
      polygon.forEach((point, index) => { const x = (point.x - chunk.bounds.x) * sx, y = (point.y - chunk.bounds.y) * sy; if (index) context.lineTo(x, y); else context.moveTo(x, y); });
      context.closePath(); context.fillStyle = 'rgb(' + red + ',' + green + ',' + blue + ')'; context.fill();
    }
    chunk.texture.source.update();
  }
  private indexEntities() {
    const fixture = this.fixture!;
    for (const city of fixture.entities.cities) {
      const polygon = cellPolygon(fixture, city.cellId);
      const marker = { id: city.id, cellId: city.cellId, x: polygon.reduce((sum,p) => sum+p.x,0) / polygon.length, y: polygon.reduce((sum,p) => sum+p.y,0) / polygon.length, name: city.name };
      const chunkId = this.chunkForCell(city.cellId);
      const bucket = this.cityChunks.get(chunkId) ?? []; bucket.push(marker); this.cityChunks.set(chunkId, bucket);
      const cells = this.cityCells.get(city.cellId) ?? []; cells.push(city.id); this.cityCells.set(city.cellId, cells);
    }
  }
  draw() {
    if (!this.initialized || this.destroyed) return 0;
    const start = performance.now(), view = this.camera, viewport = this.app.screen;
    this.world.position.set(view.x, view.y); this.world.scale.set(view.scale);
    const left = -view.x / view.scale, top = -view.y / view.scale, right = (viewport.width - view.x) / view.scale, bottom = (viewport.height - view.y) / view.scale;
    let visible = 0, cityCount = 0, labelCount = 0;
    const labelLimit = this.quality === 'high' ? 80 : 20;
    this.markers.clear(); this.selection.clear();
    for (const label of this.labelPool) label.visible = false;
    for (const chunk of this.chunks) {
      const bounds = chunk.bounds;
      chunk.sprite.visible = bounds.x <= right && bounds.x + bounds.width >= left && bounds.y <= bottom && bounds.y + bounds.height >= top;
      if (!chunk.sprite.visible) continue;
      visible++;
      for (const city of this.cityChunks.get(chunk.id) ?? []) {
        if (city.x < left || city.x > right || city.y < top || city.y > bottom) continue;
        cityCount++;
        this.markers.circle(city.x, city.y, 2.5 / view.scale).fill(0xf2d99f);
        if (this.quality === 'high') this.markers.circle(city.x, city.y, 2.5 / view.scale).stroke({ color: 0x20383f, width: 1 / view.scale });
        if (labelCount >= labelLimit || view.scale < this.fitScale * 2) continue;
        let label = this.labelPool[labelCount];
        if (!label) { label = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: 0xf6f4e8, stroke: { color: 0x102b38, width: 3 } } }); this.labels.addChild(label); this.labelPool.push(label); }
        if (label.text !== city.name) label.text = city.name;
        label.position.set(city.x + 5 / view.scale, city.y - 8 / view.scale); label.scale.set(1 / view.scale); label.visible = true; labelCount++;
      }
    }
    if (this.fixture && this.selected !== null) {
      const polygon = cellPolygon(this.fixture, this.selected).flatMap(point => [point.x, point.y]);
      this.selection.poly(polygon).stroke({ color: 0xffffff, width: 3 / view.scale }).stroke({ color: 0x423316, width: 1 / view.scale });
    }
    this.app.render();
    const elapsed = performance.now() - start;
    this.timings.visibleChunks = visible; this.timings.visibleCityMarkers = cityCount; this.timings.visibleLabels = labelCount; this.timings.lastRenderSubmissionMs = elapsed;
    return elapsed;
  }
  metrics() {
    return { rendererVersion: 'ph03-polygon-raster-tiles-v1', quality: this.quality, layer: this.layer, camera: this.getCamera(), viewport: this.viewport(), chunks: this.chunks.length, chunkCells: CHUNK_CELLS, cachedTexturePixels: this.chunks.reduce((sum,c) => sum+c.canvas.width*c.canvas.height,0), webgl: { ...this.glInfo }, ...this.timings };
  }
  async sampleCameraPath(options: { durationMs?: number; quality?: ScaleQuality } = {}): Promise<ScaleFrameSample> {
    if (!this.fixture) throw new Error('请先生成规模样本。');
    if (this.sampleRunning) throw new Error('已有镜头采样在执行。');
    const durationMs = options.durationMs ?? 60_000;
    if (!Number.isFinite(durationMs) || durationMs < 16 || durationMs > 120_000) throw new Error('采样时长须为16至120000毫秒。');
    if (options.quality) await this.setQuality(options.quality);
    this.sampleRunning = true; this.sampleCancelled = false;
    const before = this.getCamera(), atlas = this.fixture.atlas, intervals: number[] = [], drawTimes: number[] = [];
    let first = 0, previous = 0, elapsed = 0, hidden = document.visibilityState !== 'visible';
    const onVisibility = () => { if (document.visibilityState !== 'visible') hidden = true; };
    document.addEventListener('visibilitychange', onVisibility);
    try {
      await new Promise<void>(resolve => {
        const frame = (time: number) => {
          if (!first) first = time;
          if (previous) intervals.push(time - previous);
          previous = time; elapsed = time - first;
          const fraction = Math.min(1, elapsed / durationMs), angle = fraction * Math.PI * 2;
          const scale = this.fitScale * (1.4 + 5.6 * Math.pow(Math.sin(angle / 2), 2));
          const centerX = atlas.width * (.5 + .24 * Math.sin(angle)), centerY = atlas.height * (.5 + .24 * Math.sin(angle * 2));
          if (!this.destroyed) drawTimes.push(this.setCamera({ x: this.app.screen.width / 2 - centerX * scale, y: this.app.screen.height / 2 - centerY * scale, scale }));
          if (elapsed >= durationMs || this.sampleCancelled || this.destroyed) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    } finally {
      document.removeEventListener('visibilitychange', onVisibility);
      this.sampleRunning = false;
      if (!this.destroyed) this.setCamera(before);
    }
    return { requestedDurationMs: durationMs, elapsedMs: elapsed, frameIntervals: intervals, renderSubmissionMs: drawTimes, p95: percentile(intervals,.95), max: intervals.length ? Math.max(...intervals) : 0, count: intervals.length, mean: intervals.length ? intervals.reduce((sum,value) => sum+value,0)/intervals.length : 0, quality: this.quality, layer: this.layer, cancelled: this.sampleCancelled || this.destroyed, hiddenDuringSample: hidden, valid: !hidden && !this.sampleCancelled && !this.destroyed && elapsed >= durationMs, pathVersion: 'ph03-camera-figure-eight-v1', viewport: this.viewport() };
  }
  cancelCameraPath() { this.sampleCancelled = true; }
  private destroyChunks() {
    for (const chunk of this.chunks) { chunk.sprite.destroy(); chunk.texture.destroy(true); chunk.canvas.width = 0; chunk.canvas.height = 0; }
    this.chunks = [];
  }
  destroy() {
    this.destroyed = true; this.sampleCancelled = true; this.abort.abort(); this.observer?.disconnect();
    if (this.initialized) { this.destroyChunks(); this.app.destroy(true, { children: true }); }
  }
}
