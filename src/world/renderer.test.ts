import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AtlasRenderer } from './renderer';
import { cloneAtlasDraft, createAtlasDraft, encodeBlock, encodeManifest, getCellLayerSlot, getVertexSlot, hashBlock, type AtlasDraftData } from './model';
import { cellVertexIds, getCellQuad, getVertexPositionQ, incidentCellIds, vertexIdAt } from './topology';
import { AtlasTextureCache, type AtlasTextureSpec } from './atlas-texture-cache';
import { cloneGenerationDocument, createGenerationDraft, encodeGenerationManifest } from './generation-format';
import { hashAtlasManifest, type AtlasGenerationDocument } from './atlas-format';

// Only the browser/GPU boundary is replaced. The source, shared geometry and
// spatial index are the production 128² atlas, never a benchmark fixture.
const pixi = vi.hoisted(() => ({ init: vi.fn(), render: vi.fn(), resize: vi.fn(), destroy: vi.fn(), fill: vi.fn(), preview: vi.fn(), overlay: vi.fn(), overlayClear: vi.fn(), textureCreate: vi.fn(), textureDestroy: vi.fn(), spriteDestroy: vi.fn(), cropCreate: vi.fn(), cropDestroy: vi.fn(), targetDraw: vi.fn() }));
const labelBoundary = vi.hoisted(() => ({ update: vi.fn(), hide: vi.fn(), destroy: vi.fn() }));
vi.mock('./atlas-label-layer', () => {
  const emptyAtlasLabelMetrics = () => ({ visibleCount: 0, visibleIds: [], boxes: [], examinedCells: 0, candidateCount: 0, latticeStride: null, visibleNodes: 0, probeNodes: 0, measurementCacheEntries: 0 });
  class AtlasLabelLayer {
    update(input: unknown) { labelBoundary.update(input); }
    hide() { labelBoundary.hide(); }
    metrics() { return emptyAtlasLabelMetrics(); }
    destroy() { labelBoundary.destroy(); }
  }
  return { AtlasLabelLayer, emptyAtlasLabelMetrics };
});
vi.mock('pixi.js/unsafe-eval', () => ({}));
vi.mock('pixi.js', () => {
  class Container {
    position = { set() {} };
    scale = { set() {} };
    addChild() {}
    addChildAt() {}
  }
  class Graphics extends Container {
    visible = true;
    colors = new Set<number>();
    private paths = 0;
    private polygons: number[][] = [];
    private overlayColor?: number;
    clear() { this.paths = 0; this.polygons = []; if (this.overlayColor !== undefined) pixi.overlayClear(this.overlayColor); return this; }
    rect() { return this; }
    poly(points: number[], close = true) { void close; this.paths++; this.polygons.push(points); return this; }
    fill(options?: { color: number }) { if (options) this.colors.add(options.color); if (options?.color === 0xf2d49b) pixi.preview(this.paths); pixi.fill(this.paths); this.paths = 0; return this; }
    stroke(options?: { color: number; width: number }) {
      if (options && [0xa9c6c5, 0xf1d79c, 0xffd88c, 0xe5f5dc].includes(options.color)) {
        this.overlayColor = options.color; pixi.overlay({ ...options, polygons: this.polygons.map(points => [...points]) });
      }
      return this;
    }
    destroy() {}
  }
  class Application {
    stage = new Container();
    screen = { width: 800, height: 600 };
    captures = new Set<number>();
    canvas = Object.assign(new EventTarget(), { setAttribute() {}, style: { touchAction: '' }, tabIndex: -1,
      getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: (id: number) => this.captures.add(id), hasPointerCapture: (id: number) => this.captures.has(id), releasePointerCapture: (id: number) => this.captures.delete(id) });
    renderer = {
      resolution: 1,
      render: (input: { target?: unknown; container?: Graphics; transform?: unknown }) => {
        if (input.target) pixi.targetDraw({ colors: [...input.container!.colors], transform: input.transform });
        pixi.render(pixi.fill.mock.calls.reduce((sum, [count]) => sum + Number(count), 0));
      },
      resize: (width: number, height: number) => { pixi.resize(width, height); this.screen = { width, height }; },
    };
    init() { return pixi.init(); }
    destroy() { pixi.destroy(); }
  }
  class RenderTexture {
    source: { pixelWidth: number; pixelHeight: number };
    constructor(width: number, height: number) { this.source = { pixelWidth: width, pixelHeight: height }; }
    static create(options: { width: number; height: number }) { pixi.textureCreate(options); return new RenderTexture(options.width, options.height); }
    destroy(source: boolean) { pixi.textureDestroy(source); }
  }
  class Texture { destroyed = false; constructor(options: unknown) { pixi.cropCreate(options); } destroy(source: boolean) { pixi.cropDestroy(source); this.destroyed = true; } }
  class Rectangle { constructor(public x: number, public y: number, public width: number, public height: number) {} }
  class Sprite extends Container { visible = true; destroyed = false; constructor(texture: unknown) { super(); void texture; } destroy(options: unknown) { pixi.spriteDestroy(options); this.destroyed = true; } }
  class Matrix { constructor(public a: number, public b: number, public c: number, public d: number, public tx: number, public ty: number) {} }
  return { Application, Container, Graphics, RenderTexture, Sprite, Matrix, Texture, Rectangle };
});

const canvasOf = (harness: Harness) => harness.host.appendChild.mock.calls[0][0] as HTMLCanvasElement;
const dispatch = (target: EventTarget, type: string, fields: object = {}) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
async function flushFrames() { for (let i = 0; i < 5; i++) { await vi.runAllTimersAsync(); tick(); await Promise.resolve(); } }

describe('production camera, cache and GPU lifecycle', () => {
  it('uses visible 8-cell texture cores for near detail while retaining logical geometry and both budgets', async () => {
    const h = await loadedRenderer(); pixi.textureCreate.mockClear(); pixi.cropCreate.mockClear(); pixi.targetDraw.mockClear();
    h.renderer.zoom(16); tick();
    const view = h.renderer.metrics();
    expect(pixi.targetDraw.mock.calls.some(([draw]) => draw.transform.a === 2)).toBe(true);
    expect(pixi.textureCreate.mock.calls.every(([options]) => options.width <= 1024 && options.height <= 1024)).toBe(true);
    expect(pixi.cropCreate.mock.calls.some(([options]) => options.frame.width === 512)).toBe(true);
    expect(view.cache.peakPixels).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(view.geometryCache.peakQuads).toBeLessThanOrEqual(131072); expect(view.geometryCache.entries).toBeLessThanOrEqual(128);
    expect(view.geometryCache.created - view.geometryCache.destroyed).toBe(view.geometryCache.entries);
    expect(view.visibleBlocks).toBeLessThan(16); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('draws one genuine Q8 closed outline without panning or selecting and caps retained samples', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), camera = h.renderer.metrics().camera;
    h.renderer.setOutlineMode(true);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, pointerType: 'pen', clientX: 500, clientY: 300 });
    for (let i = 1; i <= 700; i++) {
      const angle = Math.PI * 4 * i / 700;
      dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 400 + Math.cos(angle) * 100, clientY: 300 + Math.sin(angle) * 100 });
    }
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 500, clientY: 300 }); tick();
    expect(h.outline).toHaveBeenCalledTimes(1); expect(h.outlineCancel).not.toHaveBeenCalled(); expect(h.pick).not.toHaveBeenCalled();
    const points = h.outline.mock.calls[0][0] as { xQ: number; yQ: number }[];
    expect(points.length).toBeGreaterThan(100); expect(points.length).toBeLessThanOrEqual(256);
    expect(points[0]).toEqual({ xQ: Math.round((500 - camera.x) / camera.scale * 256), yQ: Math.round((300 - camera.y) / camera.scale * 256) });
    expect(points.every(point => Number.isSafeInteger(point.xQ) && Number.isSafeInteger(point.yQ))).toBe(true);
    expect(h.renderer.metrics().camera).toEqual(camera); expect(canvas.hasPointerCapture(1)).toBe(false);
    const rendered = pixi.overlay.mock.calls.map(([draw]) => draw).filter(draw => draw.color === 0xe5f5dc).at(-1);
    expect(rendered.polygons[0].length).toBe(points.length * 2);
  });

  it('a second pointer cancels an outline, preserves pinch and never starts a remnant stroke', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h); h.renderer.setOutlineMode(true);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 350, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 390, clientY: 260 });
    dispatch(canvas, 'pointerdown', { pointerId: 2, button: 0, clientX: 450, clientY: 300 });
    const scale = h.renderer.metrics().camera.scale;
    dispatch(canvas, 'pointermove', { pointerId: 2, clientX: 500, clientY: 300 }); tick();
    expect(h.renderer.metrics().camera.scale).toBeGreaterThan(scale); expect(h.outlineCancel).toHaveBeenCalledTimes(1);
    dispatch(canvas, 'pointerup', { pointerId: 2, clientX: 500, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 420, clientY: 360 });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 450, clientY: 260 }); tick();
    expect(h.outline).not.toHaveBeenCalled(); expect(h.pick).not.toHaveBeenCalled();
    dispatch(canvas, 'pointerdown', { pointerId: 3, button: 0, clientX: 350, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 3, clientX: 400, clientY: 250 });
    dispatch(canvas, 'pointerup', { pointerId: 3, clientX: 450, clientY: 300 });
    expect(h.outline).toHaveBeenCalledTimes(1);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'disable', 'gpu', 'destroy', 'busy', 'zoom', 'fit', 'focus'] as const)('%s cannot finish a stale hand-drawn outline', async boundary => {
    const h = await loadedRenderer(), canvas = canvasOf(h); h.renderer.setOutlineMode(true);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 350, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 400, clientY: 250 });
    let acceptance: Promise<unknown> | undefined;
    if (boundary === 'disable') h.renderer.setOutlineMode(false);
    else if (boundary === 'gpu') dispatch(canvas, 'webglcontextlost');
    else if (boundary === 'destroy') h.renderer.destroy();
    else if (boundary === 'busy') acceptance = h.renderer.accept(source);
    else if (boundary === 'zoom') h.renderer.zoom(2);
    else if (boundary === 'fit') h.renderer.fit();
    else if (boundary === 'focus') h.renderer.focusCell(8256);
    else dispatch(boundary === 'blur' ? window : canvas, boundary, { pointerId: 1 });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 450, clientY: 300 });
    if (acceptance) { await flushFrames(); await acceptance; }
    expect(h.outline).not.toHaveBeenCalled(); expect(h.pick).not.toHaveBeenCalled(); expect(canvas.hasPointerCapture(1)).toBe(false);
  });

  it('copies explicit outline points and scales their own overlay without touching selection or region', async () => {
    const h = await loadedRenderer(), points = [{ xQ: 256000, yQ: 256000 }, { xQ: 512000, yQ: 256000 }, { xQ: 256000, yQ: 512000 }];
    h.renderer.select(8256); h.renderer.showRegion({ column: 32, row: 32, columns: 16, rows: 16 }); h.renderer.showOutline(points); tick();
    points[0].xQ = 0; pixi.overlay.mockClear(); h.renderer.zoom(2); tick();
    const rendered = pixi.overlay.mock.calls.map(([draw]) => draw).find(draw => draw.color === 0xe5f5dc);
    expect(rendered.polygons).toEqual([[1000, 1000, 2000, 1000, 1000, 2000]]); expect(h.renderer.metrics().selected).toBe(8256);
  });

  it('a real viewport resize cancels the outline before its camera transform changes', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h); h.renderer.setOutlineMode(true);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 350, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 400, clientY: 250 });
    const camera = h.renderer.metrics().camera;
    h.host.clientWidth = 640; h.host.clientHeight = 480; ResizeObserverDouble.instances[0].notify(); tick();
    expect(h.renderer.metrics().camera).not.toEqual(camera);
    expect(h.outlineCancel).toHaveBeenCalledTimes(1); expect(canvas.hasPointerCapture(1)).toBe(false);
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 430, clientY: 280 });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 450, clientY: 300 }); tick();
    expect(h.outline).not.toHaveBeenCalled(); expect(h.pick).not.toHaveBeenCalled(); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('a same-size ResizeObserver notification preserves an in-progress outline', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h); h.renderer.setOutlineMode(true);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 350, clientY: 300 });
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 400, clientY: 250 });
    const camera = h.renderer.metrics().camera;
    ResizeObserverDouble.instances[0].notify(); tick();
    expect(h.renderer.metrics().camera).toEqual(camera); expect(h.outlineCancel).not.toHaveBeenCalled(); expect(canvas.hasPointerCapture(1)).toBe(true);
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 450, clientY: 300 }); tick();
    expect(h.outline).toHaveBeenCalledTimes(1); expect(h.outline.mock.calls[0][0]).toHaveLength(3);
    expect(h.outlineCancel).not.toHaveBeenCalled(); expect(h.pick).not.toHaveBeenCalled(); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('reuses already drawn terrain Graphics at higher texture density, but rebuilds a genuinely wider halo', async () => {
    const h = await loadedRenderer(), before = h.renderer.metrics();
    expect(before.geometryCache.entries).toBe(16);
    h.renderer.zoom(2); tick(); const sharper = h.renderer.metrics();
    expect(sharper.cache.created).toBeGreaterThan(before.cache.created);
    expect(sharper.geometryCache.created).toBe(before.geometryCache.created);
    expect(sharper.geometryCache.hits).toBeGreaterThan(before.geometryCache.hits);
    expect(sharper.geometryCache.quads).toBe(before.geometryCache.quads);
    h.renderer.fit(); h.renderer.zoom(.5); tick(); const wider = h.renderer.metrics();
    expect(wider.geometryCache.created).toBeGreaterThan(sharper.geometryCache.created);
    expect(wider.geometryCache.destroyed).toBeGreaterThan(sharper.geometryCache.destroyed);
    expect(wider.geometryCache.created - wider.geometryCache.destroyed).toBe(wider.geometryCache.entries);
    expect(wider.geometryCache.peakQuads).toBeLessThanOrEqual(131072); expect(wider.geometryCache.entries).toBeLessThanOrEqual(128);
    expect(wider.cache.peakPixels).toBeLessThanOrEqual(32 * 1024 * 1024);
  });

  it('keeps a 1,024-cell preview, selection and outline geometry during pure pan and identical inputs', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), ids = Array.from({ length: 1024 }, (_, i) => (48 + Math.floor(i / 32)) * 128 + 48 + i % 32);
    h.renderer.select(8256); h.renderer.showPreview(ids);
    expect(pixi.preview).toHaveBeenLastCalledWith(1024);
    const renders = pixi.render.mock.calls.length;
    pixi.overlay.mockClear(); pixi.overlayClear.mockClear(); pixi.preview.mockClear();
    h.renderer.select(8256); h.renderer.showPreview([...ids]);
    for (let i = 0; i < 4; i++) { dispatch(canvas, 'keydown', { key: 'ArrowRight' }); tick(); }
    ResizeObserverDouble.instances[0].notify(); tick();
    expect(pixi.render.mock.calls.length).toBeGreaterThan(renders);
    expect(pixi.overlay).not.toHaveBeenCalled(); expect(pixi.overlayClear).not.toHaveBeenCalled(); expect(pixi.preview).not.toHaveBeenCalled();
  });

  it('rebuilds scaled strokes and changed proposed vertices once, including after GPU recovery', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), id = 8256, vertex = cellVertexIds(source.manifest.spec, id)[0], point = getVertexPositionQ(source, vertex);
    const proposal = (dx: number) => ({ ids: new Uint32Array([vertex]), xyQ: new Int32Array([point.xQ + dx, point.yQ]) });
    h.renderer.select(id); h.renderer.showPreview([id], proposal(64));
    const width = (color: number) => pixi.overlay.mock.calls.map(([draw]) => draw).filter(draw => draw.color === color).at(-1).width;
    const oldWidths = [0xa9c6c5, 0xf1d79c, 0xffd88c].map(width); pixi.overlay.mockClear();
    h.renderer.zoom(2); tick();
    expect(pixi.overlay).toHaveBeenCalledTimes(3);
    for (const [i, color] of [0xa9c6c5, 0xf1d79c, 0xffd88c].entries()) expect(width(color)).toBe(oldWidths[i] / 2);
    pixi.overlay.mockClear(); h.renderer.showPreview([id], proposal(128));
    expect(pixi.overlay).toHaveBeenCalledTimes(1); expect(pixi.overlay.mock.calls[0][0].color).toBe(0xffd88c);
    const expectedPreview = pixi.overlay.mock.calls[0][0].polygons;
    expect(expectedPreview[0].slice(0, 2)).toEqual([(point.xQ + 128) / 256, point.yQ / 256]);
    pixi.overlay.mockClear();
    dispatch(canvas, 'webglcontextlost'); dispatch(canvas, 'webglcontextrestored'); await flushFrames();
    expect(pixi.overlay).toHaveBeenCalledTimes(3);
    expect(pixi.overlay.mock.calls.map(([draw]) => draw).find(draw => draw.color === 0xffd88c).polygons).toEqual(expectedPreview);
    pixi.overlay.mockClear(); pixi.overlayClear.mockClear(); h.renderer.showPreview([]);
    expect(pixi.overlayClear).toHaveBeenCalledWith(0xffd88c); expect(pixi.overlay).not.toHaveBeenCalled();
    pixi.overlayClear.mockClear(); dispatch(canvas, 'keydown', { key: 'ArrowLeft' }); tick();
    expect(pixi.overlayClear).not.toHaveBeenCalled();
  });

  it('a committed shared vertex replaces cached selection geometry and clears the proposed overlay', async () => {
    const h = await loadedRenderer(), id = 8256, vertex = cellVertexIds(source.manifest.spec, id)[0], point = getVertexPositionQ(source, vertex), edited = cloneAtlasDraft(source), slot = getVertexSlot(edited, vertex);
    h.renderer.select(id); h.renderer.showPreview([id], { ids: new Uint32Array([vertex]), xyQ: new Int32Array([point.xQ + 128, point.yQ]) });
    slot.block.xyQ[slot.slot * 2] += 256; edited.manifest.revision++;
    edited.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block);
    pixi.overlay.mockClear(); pixi.overlayClear.mockClear(); pixi.preview.mockClear();
    const accepted = h.renderer.accept(edited, { dirtyKeys: [slot.key], changedVertexIds: [vertex], affectedCellIds: incidentCellIds(edited.manifest.spec, vertex) });
    await vi.runAllTimersAsync(); tick(); await accepted;
    const selections = pixi.overlay.mock.calls.map(([draw]) => draw).filter(draw => draw.color === 0xf1d79c);
    expect(selections).toHaveLength(1); expect(selections[0].polygons).toEqual([getCellQuad(edited, id).flatMap(p => [p.x, p.y])]);
    expect(pixi.overlayClear).toHaveBeenCalledWith(0xffd88c); expect(pixi.preview).not.toHaveBeenCalled();
    pixi.overlay.mockClear(); h.renderer.select(id); expect(pixi.overlay).not.toHaveBeenCalled();
  });

  it('uses CSS cell size with hysteresis for grid detail and passes the unchanged world to DOM labels', async () => {
    const h = await loadedRenderer(); h.renderer.select(42);
    const toPixels = (pixels: number) => { h.renderer.zoom(pixels / h.renderer.metrics().cellPixels); tick(); };
    expect(h.renderer.metrics()).toMatchObject({ lod: 'far', gridVisible: false });
    toPixels(6.5); expect(h.renderer.metrics()).toMatchObject({ lod: 'far', gridVisible: false });
    toPixels(7.5); expect(h.renderer.metrics()).toMatchObject({ lod: 'medium', gridVisible: false });
    toPixels(26.5); expect(h.renderer.metrics()).toMatchObject({ lod: 'near', gridVisible: true });
    toPixels(24); expect(h.renderer.metrics()).toMatchObject({ lod: 'near', gridVisible: true });
    toPixels(21.5); expect(h.renderer.metrics()).toMatchObject({ lod: 'medium', gridVisible: false });
    toPixels(4.5); expect(h.renderer.metrics()).toMatchObject({ lod: 'far', gridVisible: false });
    const last = labelBoundary.update.mock.calls.at(-1)![0];
    expect(last.data).toBe(source); expect(last.selectedCellId).toBe(42); expect(last.lod).toBe('far');
  });

  it('hides old DOM labels throughout pending acceptance and destroys the layer without a late update', async () => {
    const h = await loadedRenderer(); labelBoundary.update.mockClear(); labelBoundary.hide.mockClear();
    const accepted = h.renderer.accept(largeSource), rejected = expect(accepted).rejects.toThrow();
    expect(labelBoundary.hide).toHaveBeenCalled(); expect(labelBoundary.update).not.toHaveBeenCalled();
    h.renderer.destroy(); await vi.runAllTimersAsync(); await rejected;
    expect(labelBoundary.destroy).toHaveBeenCalledTimes(1); expect(labelBoundary.update).not.toHaveBeenCalled();
  });

  it('a DOM label layout error follows the same fatal boundary as the map frame', async () => {
    const h = await loadedRenderer(), before = h.renderer.metrics().correctFrameAt;
    labelBoundary.update.mockImplementationOnce(() => { throw new Error('synthetic DOM label layout failure'); });
    expect(() => h.renderer.select(42)).toThrow('DOM label layout failure');
    await expectLocked(h.renderer, h.fatal, before);
  });

  it('reuses warm textures while camera/input leave all source bytes unchanged', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), before = h.renderer.metrics();
    dispatch(canvas, 'keydown', { key: 'ArrowRight' }); tick();
    expect(h.renderer.metrics().camera.x).toBe(before.camera.x - 48);
    expect(h.renderer.metrics().cache.created).toBe(before.cache.created);
    expect(h.renderer.metrics().cache.hits).toBeGreaterThan(before.cache.hits);
    expect(h.renderer.metrics().cache.peakPixels).toBeLessThanOrEqual(32 * 1024 * 1024);
    const sources = pixi.textureCreate.mock.calls.map(([options]) => options);
    expect(sources.every(o => o.resolution === 1 && o.antialias === false && o.autoGenerateMipmaps === false && o.mipLevelCount === 1 && o.autoGarbageCollect === false)).toBe(true);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur'])('%s terminates a gesture without picking or residual motion', async type => {
    const h = await loadedRenderer(), canvas = canvasOf(h);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    dispatch(type === 'blur' ? window : canvas, type, { pointerId: 1 });
    const camera = h.renderer.metrics().camera;
    dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 500, clientY: 310 });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 500, clientY: 310 }); tick();
    expect(h.pick).not.toHaveBeenCalled(); expect(h.renderer.metrics().camera).toEqual(camera);
    expect(canvas.hasPointerCapture(1)).toBe(false);
  });

  it('pinch then one remaining pointer never becomes a click', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h);
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
    dispatch(canvas, 'pointerdown', { pointerId: 2, button: 0, clientX: 500, clientY: 300 });
    const before = h.renderer.metrics().camera.scale;
    dispatch(canvas, 'pointermove', { pointerId: 2, clientX: 540, clientY: 300 });
    dispatch(canvas, 'pointerup', { pointerId: 2, clientX: 540, clientY: 300 });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX: 300, clientY: 300 }); tick();
    expect(h.renderer.metrics().camera.scale).toBeGreaterThan(before); expect(h.pick).not.toHaveBeenCalled();
    dispatch(canvas, 'pointerdown', { pointerId: 3, button: 0, clientX: 400, clientY: 300 });
    dispatch(canvas, 'pointerup', { pointerId: 3, clientX: 400, clientY: 300 });
    expect(h.pick).toHaveBeenCalledTimes(1);
  });

  it('a committed offscreen edit stays dirty until visible, without a cache allocation during acceptance', async () => {
    const h = await loadedRenderer(); h.renderer.focusCell(128 ** 2 - 1);
    const before = h.renderer.metrics(), edited = cloneAtlasDraft(source), cell = getCellLayerSlot(edited, 'elevation', 0);
    cell.block.values[cell.slot] = 100; edited.manifest.revision++;
    edited.manifest.blockRefs.find(ref => ref.key === cell.key)!.hash = await hashBlock(cell.block);
    const accepted = h.renderer.accept(edited, { dirtyKeys: [cell.key], changedVertexIds: [], affectedCellIds: [0] });
    await Promise.resolve(); tick(); const result = await accepted;
    expect(result.repaintBlocks).toBe(0); expect(result.cache.created).toBe(before.cache.created);
    h.renderer.focusCell(0); expect(h.renderer.metrics().cache.created).toBeGreaterThan(result.cache.created);
  });

  it('selection, density changes and GPU cache loss cannot prefetch deferred dirty cores', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), edited = cloneAtlasDraft(source), id = 48 * 128 + 48;
    // At this camera only the rightmost core column intersects the viewport.
    // Its left neighbors are outside the viewport but inside prefetch reach.
    for (let i = 0; i < 12; i++) { dispatch(canvas, 'keydown', { key: 'ArrowRight' }); tick(); }
    const cell = getCellLayerSlot(edited, 'elevation', id); cell.block.values[cell.slot] = 100; edited.manifest.revision++;
    edited.manifest.blockRefs.find(ref => ref.key === cell.key)!.hash = await hashBlock(cell.block);
    const before = h.renderer.metrics().cache.created;
    const accepted = h.renderer.accept(edited, { dirtyKeys: [cell.key], changedVertexIds: [], affectedCellIds: [id] });
    await Promise.resolve(); tick(); expect((await accepted).repaintBlocks).toBe(0);
    h.renderer.select(id); h.renderer.showPreview([]);
    expect(h.renderer.metrics().cache.created).toBe(before);

    const drawnCores = () => pixi.targetDraw.mock.calls.map(([draw]) => {
      const { a, d, tx, ty } = draw.transform;
      return `${Math.round((-tx + 2) / a / 1024)}:${Math.round((-ty + 2) / d / 1024)}`;
    });
    const expectOnlyVisibleOrCleanNeighbor = () => {
      const cores = drawnCores(); expect(cores.length).toBeGreaterThan(0);
      expect(cores.every(key => key.startsWith('3:') || key === '2:3')).toBe(true);
    };
    // Higher sampling density has no existing entries for these neighbors.
    // The same world-content dirty marker must still prevent their prefetch.
    pixi.targetDraw.mockClear(); h.renderer.zoom(2, { x: 0, y: 300 }); tick();
    expectOnlyVisibleOrCleanNeighbor();

    // A real renderer cache rebuild keeps the offscreen content marker even
    // though none of its old texture entries survive the context loss.
    dispatch(canvas, 'webglcontextlost'); dispatch(canvas, 'webglcontextrestored'); await flushFrames();
    pixi.targetDraw.mockClear(); h.renderer.select(id);
    expect(drawnCores()).toEqual(['2:3']); // Ordinary clean prefetch still works.

    const created = h.renderer.metrics().cache.created; pixi.targetDraw.mockClear();
    h.renderer.focusCell(id);
    expect(h.renderer.metrics().cache.created).toBeGreaterThan(created);
    expect(drawnCores()).toContain('1:1');
    expect(pixi.targetDraw.mock.calls.some(([draw]) => draw.colors.includes(0xa4b07d))).toBe(true);
  });

  it('a shared vertex change invalidates incident cores and every sampled neighboring halo', async () => {
    const h = await loadedRenderer(), edited = cloneAtlasDraft(source), vertex = vertexIdAt(source.manifest.spec, 64, 64), slot = getVertexSlot(edited, vertex);
    slot.block.xyQ[slot.slot * 2]++; edited.manifest.revision++;
    edited.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block);
    const before = h.renderer.metrics().cache.created;
    const accepted = h.renderer.accept(edited, { dirtyKeys: [slot.key], changedVertexIds: [vertex], affectedCellIds: incidentCellIds(edited.manifest.spec, vertex) });
    await vi.runAllTimersAsync(); tick(); const result = await accepted;
    expect(result.repaintBlockKeys.sort()).toEqual([0, 1, 2].flatMap(x => [0, 1, 2].map(y => `geometry:${x}:${y}`)).sort());
    expect(result.repaintBlocks).toBe(result.repaintBlockKeys.length); expect(result.cache.created - before).toBe(9);
  });

  it('neighboring elevation changes redraw real halo colors and each crop shares one accounted source', async () => {
    const h = await loadedRenderer(), edited = cloneAtlasDraft(source), cell = getCellLayerSlot(edited, 'elevation', 31);
    cell.block.values[cell.slot] = 100; edited.manifest.revision++;
    edited.manifest.blockRefs.find(ref => ref.key === cell.key)!.hash = await hashBlock(cell.block);
    pixi.targetDraw.mockClear();
    const accepted = h.renderer.accept(edited, { dirtyKeys: [cell.key], changedVertexIds: [], affectedCellIds: [31] });
    await Promise.resolve(); tick(); const result = await accepted;
    // Core 1,0 contains no edited cell. Its sampling halo includes actual land
    // from cell 31, and must therefore contain both real land and sea colors.
    const neighbor = pixi.targetDraw.mock.calls.map(([draw]) => draw).find(draw => draw.transform.tx === -254 && draw.transform.ty === 2);
    // The real land/sea cliff also shades its true adjacent cells. These are
    // independently fixed material references, including flat sea and the
    // north/west-facing slope at this top-row fixture.
    expect(neighbor.colors.sort()).toEqual([0x4c97a8, 0x4a92a3, 0x9fab79].sort());
    expect(result.repaintBlockKeys.sort()).toEqual(['geometry:0:0', 'geometry:0:1', 'geometry:1:0', 'geometry:1:1']);
    for (const [crop] of pixi.cropCreate.mock.calls) {
      expect(crop.frame).toMatchObject({ x: 2, y: 2 });
      expect(crop.frame.width + 4).toBe(crop.source.pixelWidth); expect(crop.frame.height + 4).toBe(crop.source.pixelHeight);
    }
    expect(result.cache.pixels).toBeGreaterThan(0); expect(result.cache.created - result.cache.destroyed).toBe(result.cache.entries);
  });

  it('a four-owner elevation batch reports all sixteen visible halo-dependent cores', async () => {
    const h = await loadedRenderer(), edited = cloneAtlasDraft(source), cells: number[] = [], dirty = new Set<`elevation:${number}:${number}`>();
    for (let row = 48; row < 80; row++) for (let col = 48; col < 80; col++) {
      const id = row * 128 + col, slot = getCellLayerSlot(edited, 'elevation', id); slot.block.values[slot.slot] = 100; cells.push(id); dirty.add(slot.key as `elevation:${number}:${number}`);
    }
    edited.manifest.revision++;
    for (const key of dirty) edited.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(edited.blocks.get(key)!);
    expect(dirty.size).toBe(4);
    const accepted = h.renderer.accept(edited, { dirtyKeys: [...dirty], changedVertexIds: [], affectedCellIds: cells });
    await vi.runAllTimersAsync(); tick(); const result = await accepted;
    expect(result.repaintBlockKeys.sort()).toEqual([0, 1, 2, 3].flatMap(x => [0, 1, 2, 3].map(y => `geometry:${x}:${y}`)).sort());
    expect(result.repaintBlocks).toBe(16); result.repaintBlockKeys.length = 0;
    expect(h.renderer.metrics().repaintBlockKeys).toHaveLength(16);
  });

  it('two context losses rebuild the same view and selection without a fatal or source change', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h); h.renderer.focusCell(8256); const original = h.renderer.metrics();
    for (let i = 0; i < 2; i++) {
      dispatch(canvas, 'webglcontextlost'); expect(h.renderer.metrics().gpu.state).toBe('lost'); expect(h.renderer.metrics().cache.pixels).toBe(0);
      expect(h.renderer.metrics().geometryCache).toMatchObject({ entries: 0, quads: 0, reservedEntries: 0, reservedQuads: 0 });
      h.renderer.zoom(2); expect(h.renderer.metrics().camera).toEqual(original.camera);
      dispatch(canvas, 'webglcontextrestored'); await flushFrames();
      expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'ready', epoch: i + 1 }, camera: original.camera, selected: 8256, acceptedRevision: original.acceptedRevision, fatal: false });
      const geometry = h.renderer.metrics().geometryCache;
      expect(geometry.entries).toBeGreaterThan(0); expect(geometry.created - geometry.destroyed).toBe(geometry.entries);
    }
    expect(h.fatal).not.toHaveBeenCalled();
  });

  it('loss during new-draft acceptance cannot resolve with an old or partial frame', async () => {
    let lose = false;
    const h = newRenderer(value => { if (lose && value.stage === '绘制已核验地理块' && value.completed === 8) { lose = false; dispatch(canvasOf(h), 'webglcontextlost'); } });
    await h.renderer.init(); const first = h.renderer.accept(source); await flushFrames(); await first;
    lose = true; const published = vi.fn(), pending = h.renderer.accept(largeSource).then(published);
    await vi.runAllTimersAsync(); expect(h.renderer.metrics().gpu.state).toBe('lost'); expect(published).not.toHaveBeenCalled();
    dispatch(canvasOf(h), 'webglcontextrestored'); await flushFrames(); await pending;
    expect(published).toHaveBeenCalledTimes(1); expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'ready' }, fatal: false, visibleBlocks: 256 });
    expect(encodedDigest(largeSource)).toBe(largeSourceDigest);
  });

  it('destroy during context recovery never publishes a recovered or accepted frame', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h); dispatch(canvas, 'webglcontextlost'); dispatch(canvas, 'webglcontextrestored');
    const draws = pixi.render.mock.calls.length; h.renderer.destroy(); await Promise.resolve(); await Promise.resolve();
    expect(frames.size).toBe(0);
    expect(pixi.render).toHaveBeenCalledTimes(draws); expect(h.gpu.mock.calls.at(-1)?.[0]).toBe('restoring');
    expect(h.renderer.metrics()).toMatchObject({ destroyed: true, cache: { pixels: 0, entries: 0 } });
  });

  it('context reconstruction failure locks the renderer only after the failed recovery', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h), before = h.renderer.metrics().correctFrameAt;
    dispatch(canvas, 'webglcontextlost'); expect(h.fatal).not.toHaveBeenCalled(); dispatch(canvas, 'webglcontextrestored');
    pixi.render.mockImplementationOnce(() => { throw new Error('restore allocation draw failed'); }); await flushFrames();
    await expectLocked(h.renderer, h.fatal, before);
  });

  it('read-only events return a fully verified manifest and final destruction balances resources', async () => {
    const h = await loadedRenderer(), canvas = canvasOf(h);
    // Full production verification deliberately yields with real timers.
    vi.useRealTimers();
    const audit = new Promise<CustomEvent>(resolve => canvas.addEventListener('atlas-audit-response', event => resolve(event as CustomEvent), { once: true }));
    canvas.dispatchEvent(new CustomEvent('atlas-audit-request', { detail: { requestId: 'unit-audit' } }));
    expect((await audit).detail).toMatchObject({ requestId: 'unit-audit', ok: true, verifiedBlocks: source.blocks.size, draftId: source.manifest.draftId });
    const metrics = vi.fn(); canvas.addEventListener('atlas-render-metrics', event => metrics((event as CustomEvent).detail));
    h.renderer.destroy(); const final = metrics.mock.calls.at(-1)![0];
    expect(final).toMatchObject({ destroyed: true, cache: { entries: 0, pixels: 0, reservedPixels: 0 } }); expect(final.cache.created).toBe(final.cache.destroyed);
    expect(final.geometryCache).toMatchObject({ entries: 0, quads: 0, reservedEntries: 0, reservedQuads: 0, releaseFailures: 0 });
    expect(final.geometryCache.created).toBe(final.geometryCache.destroyed);
    expect(pixi.textureDestroy.mock.calls.every(([source]) => source === true)).toBe(true);
    expect(pixi.cropDestroy.mock.calls.every(([source]) => source === false)).toBe(true);
    expect(pixi.spriteDestroy.mock.calls.every(([options]) => options.texture === false && options.textureSource === false)).toBe(true);
  });
});

describe('explicit texture ledger', () => {
  const spec = (key: string): AtlasTextureSpec => ({ key, blockKey: 'geometry:0:0', layer: 'terrain', level: 0, pixelWidth: 10, pixelHeight: 10, worldX: 0, worldY: 0, sampleX: -2, sampleY: -2, density: 1, core: { x: 2, y: 2, width: 6, height: 6 }, dependencies: ['geometry:0:0', 'elevation:1:0'] });
  it('reserves new and old resources together and evicts only unprotected entries', () => {
    const cache = new AtlasTextureCache(300), draw = vi.fn();
    for (const key of ['a', 'b', 'c']) cache.ensure(spec(key), draw, new Set());
    cache.ensure(spec('d'), draw, new Set(['a', 'b']));
    expect(cache.has('c')).toBe(false); expect(cache.has('a')).toBe(true); expect(cache.has('b')).toBe(true);
    expect(cache.stats()).toMatchObject({ pixels: 300, peakPixels: 300, created: 4, destroyed: 1, evictions: 1 });
    expect(() => cache.ensure(spec('e'), draw, new Set(['a', 'b', 'd']))).toThrow('预算');
    expect(pixi.textureCreate).toHaveBeenCalledTimes(4); cache.clear(); expect(cache.stats().pixels).toBe(0);
  });
  it('failed target drawing destroys its source and releases the reservation', () => {
    const cache = new AtlasTextureCache(100); expect(() => cache.ensure(spec('a'), () => { throw new Error('draw'); }, new Set())).toThrow('draw');
    expect(cache.stats()).toMatchObject({ pixels: 0, reservedPixels: 0, created: 1, destroyed: 1 });
  });
  it('elevation dependency invalidation leaves the independent grid layer cached', () => {
    const cache = new AtlasTextureCache(300);
    cache.ensure(spec('terrain'), () => undefined, new Set());
    cache.ensure({ ...spec('grid'), layer: 'grid', dependencies: ['geometry:0:0'] }, () => undefined, new Set());
    cache.invalidateDependencies(new Set(['elevation:1:0']));
    expect(cache.has('terrain')).toBe(false); expect(cache.has('grid')).toBe(true);
    expect(cache.stats()).toMatchObject({ pixels: 100, entries: 1, created: 2, destroyed: 1 }); cache.clear();
  });
  it('a source destruction error attempts other releases, retains unknown pixels and prohibits allocation', () => {
    const cache = new AtlasTextureCache(300); for (const key of ['a', 'b', 'c']) cache.ensure(spec(key), () => undefined, new Set());
    pixi.textureDestroy.mockImplementationOnce(() => { throw new Error('source release failed'); });
    expect(() => cache.clear()).toThrow('source release failed');
    expect(pixi.textureDestroy).toHaveBeenCalledTimes(3);
    expect(cache.stats()).toMatchObject({ pixels: 100, entries: 1, created: 3, destroyed: 2, releaseFailures: 1 });
    expect(() => cache.ensure(spec('d'), () => undefined, new Set())).toThrow('source release failed');
    cache.clear(); expect(cache.stats()).toMatchObject({ pixels: 0, created: 3, destroyed: 3 });
  });
});

class ResizeObserverDouble {
  static instances: ResizeObserverDouble[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: () => void) { ResizeObserverDouble.instances.push(this); }
  notify() { this.callback(); }
}

let source: AtlasDraftData;
let generationSource: AtlasGenerationDocument;
let generationSourceDigest: string;
let largeSource: AtlasDraftData;
let largeSourceDigest: string;
let originalManifest: Uint8Array;
let originalBlocks: Map<string, Uint8Array>;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const renderers: AtlasRenderer[] = [];
const encodedDigest = (data: AtlasDraftData) => {
  const digest = createHash('sha256').update(encodeManifest(data.manifest));
  for (const [key, block] of data.blocks) digest.update(key).update(encodeBlock(block));
  return digest.digest('hex');
};
const generationDigest = (data: AtlasGenerationDocument) => {
  const digest = createHash('sha256').update(encodeGenerationManifest(data.manifest));
  for (const [key, block] of data.blocks) digest.update(key).update(encodeBlock(block));
  return digest.digest('hex');
};
async function generationCandidate() {
  const candidate = cloneGenerationDocument(generationSource), slot = getCellLayerSlot(candidate, 'elevation', 8256);
  slot.block.values[slot.slot] = 650; candidate.manifest.revision++;
  candidate.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block);
  return candidate;
}
async function generationRenderer(onProgress?: Parameters<typeof newRenderer>[0]) {
  const h = newRenderer(onProgress); await h.renderer.init();
  const accepted = h.renderer.accept(generationSource); await flushFrames(); await accepted;
  expect(h.fatal).not.toHaveBeenCalled(); return h;
}
const tick = () => {
  const callbacks = [...frames.values()]; frames.clear();
  for (const callback of callbacks) callback(performance.now());
};
const newRenderer = (onProgress?: (value: { stage: string; completed: number; total: number }) => void) => {
  const host = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() }, fatal = vi.fn(), camera = vi.fn(), pick = vi.fn(), gpu = vi.fn(), outline = vi.fn(), outlineCancel = vi.fn();
  const progress = vi.fn((value: { stage: string; completed: number; total: number }) => { onProgress?.(value); return { ...value, submittedPolygons: pixi.render.mock.calls.at(-1)?.[0] }; });
  const renderer = new AtlasRenderer(host as unknown as HTMLElement, { onPick: pick, onFatal: fatal, onCamera: camera, onProgress: progress, onGraphicsState: gpu, onOutline: outline, onOutlineCancel: outlineCancel });
  renderers.push(renderer);
  return { renderer, host, fatal, camera, progress, pick, gpu, outline, outlineCancel };
};
type Harness = ReturnType<typeof newRenderer>;
const paintProgress = (progress: Harness['progress']) => progress.mock.results.filter(item => item.value.stage === '绘制已核验地理块');
async function loadedRenderer() {
  const harness = newRenderer(); await harness.renderer.init();
  const accepted = harness.renderer.accept(source);
  await vi.runAllTimersAsync();
  tick(); await accepted;
  expect(harness.fatal).not.toHaveBeenCalled();
  return harness;
}
async function expectLocked(renderer: AtlasRenderer, fatal: ReturnType<typeof vi.fn>, frameAt: number) {
  const renders = pixi.render.mock.calls.length;
  for (const action of [() => renderer.select(0), () => renderer.showPreview([0]), () => renderer.fit(), () => renderer.zoom(1.2), () => renderer.focusCell(0)]) expect(action).toThrow();
  await expect(renderer.accept(source)).rejects.toThrow();
  ResizeObserverDouble.instances.at(-1)?.notify(); tick();
  expect(pixi.render).toHaveBeenCalledTimes(renders);
  expect(renderer.metrics()).toMatchObject({ fatal: true, correctFrameAt: frameAt });
  expect(fatal).toHaveBeenCalledTimes(1);
}

beforeAll(async () => {
  source = await createAtlasDraft({ size: 128, seed: 'renderer-lifecycle', name: '渲染边界合成草稿' });
  originalManifest = encodeManifest(source.manifest);
  originalBlocks = new Map([...source.blocks].map(([key, block]) => [key, encodeBlock(block)]));
  largeSource = await createAtlasDraft({ size: 512, seed: 'renderer-switch-large', name: '大地图切换合成草稿' });
  largeSourceDigest = encodedDigest(largeSource);
  generationSource = await createGenerationDraft({ size: 128, seed: 'renderer-generation', name: '生成显示边界合成草稿' });
  generationSourceDigest = generationDigest(generationSource);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const mock of Object.values(pixi)) mock.mockReset();
  for (const mock of Object.values(labelBoundary)) mock.mockReset();
  frames.clear(); frameId = 0; ResizeObserverDouble.instances = [];
  vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
});
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  // Renderer input is a receive-side view: it must not mutate even one field
  // or typed byte. Durable/CAS behavior is covered by storage/bridge tests.
  expect(encodeManifest(source.manifest)).toEqual(originalManifest);
  expect([...source.blocks.keys()]).toEqual([...originalBlocks.keys()]);
  for (const [key, block] of source.blocks) expect(encodeBlock(block)).toEqual(originalBlocks.get(key));
  expect(generationDigest(generationSource)).toBe(generationSourceDigest);
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('generation candidate display lifecycle', () => {
  it('renders actual v2 candidate terrain, permits inspection and discards without accepting a revision', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate(), digest = generationDigest(candidate), canvas = canvasOf(h);
    h.renderer.focusCell(8256); const baseline = h.renderer.metrics(); pixi.targetDraw.mockClear();
    const showing = h.renderer.showGenerationPreview(candidate); await flushFrames(); const displayed = await showing;
    expect(displayed).toMatchObject({ displaySource: 'generation-preview', displayRevision: 1, displayVersion: 2, committedRevision: 0,
      acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt, selected: 8256, camera: baseline.camera });
    expect(displayed.displayCorrectFrameAt).toBeGreaterThanOrEqual(baseline.correctFrameAt);
    expect(pixi.targetDraw.mock.calls.some(([draw]) => draw.colors.includes(0x8ba370))).toBe(true);
    expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(candidate);
    expect(() => h.renderer.showPreview([8256])).toThrow('确认或取消'); expect(h.fatal).not.toHaveBeenCalled();
    dispatch(canvas, 'keydown', { key: 'ArrowLeft' }); tick();
    dispatch(canvas, 'wheel', { deltaY: -80, clientX: 336, clientY: 210 }); tick();
    const camera = h.renderer.metrics().camera;
    expect(camera.x).not.toBe(baseline.camera.x); expect(camera.scale).toBeGreaterThan(baseline.camera.scale);
    const quad = getCellQuad(candidate, 8256), clientX = quad.reduce((sum, point) => sum + point.x, 0) / 4 * camera.scale + camera.x,
      clientY = quad.reduce((sum, point) => sum + point.y, 0) / 4 * camera.scale + camera.y;
    dispatch(canvas, 'pointerdown', { pointerId: 1, button: 0, clientX, clientY });
    dispatch(canvas, 'pointerup', { pointerId: 1, clientX, clientY }); expect(h.pick).toHaveBeenLastCalledWith(8256);
    pixi.targetDraw.mockClear(); const clearing = h.renderer.clearGenerationPreview(); await flushFrames(); const cleared = await clearing;
    expect(cleared).toMatchObject({ displaySource: 'committed', displayRevision: 0, committedRevision: 0, selected: 8256, camera,
      acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt });
    expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(generationSource);
    expect(pixi.targetDraw.mock.calls.length).toBeGreaterThan(0);
    expect(pixi.targetDraw.mock.calls.every(([draw]) => !draw.colors.includes(0x8ba370))).toBe(true);
    expect(generationDigest(candidate)).toBe(digest); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('restores a completed candidate through repeated GPU loss and restores committed geography when discarded while lost', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate(), canvas = canvasOf(h), baseline = h.renderer.metrics();
    const showing = h.renderer.showGenerationPreview(candidate); await flushFrames(); await showing;
    for (let epoch = 1; epoch <= 2; epoch++) {
      dispatch(canvas, 'webglcontextlost');
      expect(h.renderer.metrics()).toMatchObject({ displaySource: 'generation-preview', cache: { entries: 0 }, geometryCache: { entries: 0 } });
      pixi.targetDraw.mockClear(); dispatch(canvas, 'webglcontextrestored'); await flushFrames();
      expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'ready', epoch }, displayRevision: 1, displaySource: 'generation-preview', acceptedRevision: 0, correctFrameAt: baseline.correctFrameAt });
      expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(candidate);
      expect(pixi.targetDraw.mock.calls.some(([draw]) => draw.colors.includes(0x8ba370))).toBe(true);
    }
    dispatch(canvas, 'webglcontextlost'); const clearing = h.renderer.clearGenerationPreview(); await Promise.resolve();
    expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'lost' }, displaySource: 'committed', displayRevision: 0 });
    pixi.targetDraw.mockClear(); dispatch(canvas, 'webglcontextrestored'); await flushFrames(); await clearing;
    expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(generationSource);
    expect(pixi.targetDraw.mock.calls.every(([draw]) => !draw.colors.includes(0x8ba370))).toBe(true);
    expect(h.fatal).not.toHaveBeenCalled();
  });

  it('cancels private index construction without publishing the candidate or locking subsequent previews', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate(), baseline = h.renderer.metrics();
    labelBoundary.update.mockClear(); pixi.targetDraw.mockClear();
    const showing = h.renderer.showGenerationPreview(candidate), rejected = expect(showing).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await expect(h.renderer.accept(candidate)).rejects.toThrow('仍在接收');
    const clearing = h.renderer.clearGenerationPreview(); await flushFrames(); await rejected; await clearing;
    expect(h.renderer.metrics()).toMatchObject({ displaySource: 'committed', acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt, fatal: false });
    expect(labelBoundary.update.mock.calls.every(([input]) => input.data === generationSource)).toBe(true);
    expect(pixi.targetDraw.mock.calls.every(([draw]) => !draw.colors.includes(0x8ba370))).toBe(true);
    const retry = h.renderer.showGenerationPreview(candidate); await flushFrames(); await retry;
    expect(h.renderer.metrics().displaySource).toBe('generation-preview'); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('cancels partial candidate painting after GPU loss and waits for a committed correct frame', async () => {
    let interrupt = false;
    const h = await generationRenderer(progress => {
      if (interrupt && progress.stage === '绘制已核验地理块' && progress.completed === 8) { interrupt = false; dispatch(canvasOf(h), 'webglcontextlost'); }
    });
    const candidate = await generationCandidate(), baseline = h.renderer.metrics(); interrupt = true;
    const showing = h.renderer.showGenerationPreview(candidate), rejected = expect(showing).rejects.toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync(); expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'lost' }, displaySource: 'generation-preview' });
    const published = vi.fn(), clearing = h.renderer.clearGenerationPreview().then(published);
    await flushFrames(); await rejected;
    expect(published).not.toHaveBeenCalled(); expect(h.renderer.metrics().displaySource).toBe('committed');
    dispatch(canvasOf(h), 'webglcontextrestored'); await flushFrames(); await clearing;
    expect(published).toHaveBeenCalledTimes(1); expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(generationSource);
    expect(h.renderer.metrics()).toMatchObject({ acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt, fatal: false });
  });

  it('full durable acceptance confirms the candidate and discard cannot roll it back', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate();
    const showing = h.renderer.showGenerationPreview(candidate); await flushFrames(); await showing;
    h.renderer.focusCell(8256); const camera = h.renderer.metrics().camera;
    await expect(h.renderer.accept(candidate, { dirtyKeys: [], changedVertexIds: [], affectedCellIds: [] })).rejects.toThrow('完整持久结果');
    const committing = h.renderer.accept(candidate); await flushFrames(); const result = await committing;
    expect(result).toMatchObject({ displaySource: 'committed', displayRevision: 1, acceptedRevision: 1, committedRevision: 1, camera, selected: 8256 });
    const renders = pixi.render.mock.calls.length; expect(await h.renderer.clearGenerationPreview()).toEqual(result);
    expect(pixi.render).toHaveBeenCalledTimes(renders); expect(labelBoundary.update.mock.calls.at(-1)![0].data).toBe(candidate);
    expect(h.fatal).not.toHaveBeenCalled();
  });

  it('diagnostics verify both real v2 sources and keep the top-level digest committed', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate();
    const showing = h.renderer.showGenerationPreview(candidate); await flushFrames(); await showing;
    vi.useRealTimers(); const canvas = canvasOf(h), baselineDigest = await hashAtlasManifest(generationSource.manifest), previewDigest = await hashAtlasManifest(candidate.manifest);
    const reply = new Promise<CustomEvent>(resolve => canvas.addEventListener('atlas-audit-response', event => resolve(event as CustomEvent), { once: true }));
    canvas.dispatchEvent(new CustomEvent('atlas-audit-request', { detail: { requestId: 'preview-audit' } }));
    expect((await reply).detail).toMatchObject({ ok: true, manifestDigest: baselineDigest, revision: 0,
      display: { source: 'generation-preview', manifestDigest: previewDigest, revision: 1, version: 2, verifiedBlocks: candidate.blocks.size } });
    expect(previewDigest).not.toBe(baselineDigest);
  });

  it('rejects an unrelated candidate without damaging the accepted map', async () => {
    const h = await generationRenderer(), unrelated = await generationCandidate(), baseline = h.renderer.metrics();
    unrelated.manifest.draftId = source.manifest.draftId;
    await expect(h.renderer.showGenerationPreview(unrelated)).rejects.toThrow('身份或规格');
    expect(h.renderer.metrics()).toEqual(baseline); expect(h.fatal).not.toHaveBeenCalled();
  });

  it.each(['candidate cache release', 'durable correct frame'])('%s failure locks rendering and cannot advertise a stale committed audit', async boundary => {
    const h = await generationRenderer(), candidate = await generationCandidate(), baseline = h.renderer.metrics();
    if (boundary === 'durable correct frame') {
      const preview = h.renderer.showGenerationPreview(candidate); await flushFrames(); await preview;
      labelBoundary.update.mockImplementationOnce(() => { throw new Error('synthetic confirmation frame failure'); });
    } else pixi.textureDestroy.mockImplementationOnce(() => { throw new Error('synthetic candidate release failure'); });
    const pending = boundary === 'durable correct frame' ? h.renderer.accept(candidate) : h.renderer.showGenerationPreview(candidate);
    const rejected = expect(pending).rejects.toThrow('synthetic'); await flushFrames(); await rejected;
    expect(h.renderer.metrics()).toMatchObject({ fatal: true, acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt });
    expect(h.fatal).toHaveBeenCalledTimes(1);
    const replies = vi.fn(), canvas = canvasOf(h); canvas.addEventListener('atlas-audit-response', event => replies((event as CustomEvent).detail));
    canvas.dispatchEvent(new CustomEvent('atlas-audit-request', { detail: { requestId: 'failed-audit' } }));
    expect(replies).toHaveBeenCalledWith({ requestId: 'failed-audit', ok: false, error: expect.stringContaining('锁定') });
  });

  it('destroy aborts a pending candidate and releases both GPU caches without a late frame', async () => {
    const h = await generationRenderer(), candidate = await generationCandidate(), baseline = h.renderer.metrics();
    const showing = h.renderer.showGenerationPreview(candidate), rejected = expect(showing).rejects.toThrow('关闭');
    h.renderer.destroy(); const renders = pixi.render.mock.calls.length; await flushFrames(); await rejected;
    expect(pixi.render).toHaveBeenCalledTimes(renders);
    expect(h.renderer.metrics()).toMatchObject({ destroyed: true, acceptedRevision: baseline.acceptedRevision, correctFrameAt: baseline.correctFrameAt,
      cache: { entries: 0, pixels: 0, reservedPixels: 0 }, geometryCache: { entries: 0, quads: 0, reservedEntries: 0, reservedQuads: 0 } });
    expect(h.renderer.metrics().geometryCache.created).toBe(h.renderer.metrics().geometryCache.destroyed);
    expect(h.fatal).not.toHaveBeenCalled();
  });
});

describe('atlas renderer failure and lifetime boundaries', () => {
  it('only resolves acceptance after its scheduled correct frame', async () => {
    const { renderer, fatal, progress } = newRenderer(); await renderer.init();
    const published = vi.fn(), result = renderer.accept(source).then(published);
    await Promise.resolve();
    expect(published).not.toHaveBeenCalled(); expect(renderer.metrics().correctFrameAt).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    expect(paintProgress(progress)).toHaveLength(2);
    expect(paintProgress(progress)[0].value).toMatchObject({ stage: '绘制已核验地理块', completed: 8, total: 16 });
    expect(paintProgress(progress)[1].value).toMatchObject({ stage: '绘制已核验地理块', completed: 16, total: 16 });
    expect(paintProgress(progress)[0].value.submittedPolygons).toBeGreaterThan(8 * 1024);
    expect(paintProgress(progress)[1].value.submittedPolygons).toBeGreaterThan(16 * 1024);
    expect(published).not.toHaveBeenCalled();
    tick(); await result;
    expect(published).toHaveBeenCalledTimes(1); expect(renderer.metrics().correctFrameAt).toBeGreaterThan(0);
    expect(fatal).not.toHaveBeenCalled();
  });

  it.each(['select', 'showPreview', 'fit', 'zoom', 'focusCell'] as const)('%s render failure locks every later rendering entry', async operation => {
    const { renderer, fatal } = await loadedRenderer(), before = renderer.metrics().correctFrameAt;
    const failure = new Error(`synthetic ${operation} draw failure`);
    pixi.render.mockImplementationOnce(() => { throw failure; });
    const action = () => {
      if (operation === 'select') renderer.select(5);
      else if (operation === 'showPreview') renderer.showPreview([5]);
      else if (operation === 'fit') renderer.fit();
      else if (operation === 'zoom') renderer.zoom(1.2);
      else renderer.focusCell(5);
    };
    if (operation === 'zoom') { action(); tick(); } else expect(action).toThrow(failure);
    expect(fatal).toHaveBeenCalledWith(failure);
    await expectLocked(renderer, fatal, before);
  });

  it.each(['resize', 'render'] as const)('ResizeObserver %s failure cannot leave an editable renderer', async boundary => {
    const { renderer, fatal } = await loadedRenderer(), before = renderer.metrics().correctFrameAt;
    const failure = new Error(`synthetic observer ${boundary} failure`);
    pixi[boundary].mockImplementationOnce(() => { throw failure; });
    ResizeObserverDouble.instances[0].notify(); tick();
    expect(fatal).toHaveBeenCalledWith(failure);
    await expectLocked(renderer, fatal, before);
  });

  it('a failed final frame rejects acceptance instead of publishing success', async () => {
    const { renderer, fatal } = newRenderer(); await renderer.init();
    const published = vi.fn(), failure = new Error('synthetic final frame failure');
    const result = renderer.accept(source).then(published), rejection = expect(result).rejects.toThrow(failure);
    await vi.runAllTimersAsync();
    // accept has submitted its initial picture but is still awaiting a frame.
    pixi.render.mockImplementationOnce(() => { throw failure; });
    tick(); await rejection;
    expect(published).not.toHaveBeenCalled();
    await expectLocked(renderer, fatal, 0);
  });

  it('destroy while acceptance awaits a frame rejects without a late render or accepted frame', async () => {
    const { renderer, fatal } = newRenderer(); await renderer.init();
    const published = vi.fn(), result = renderer.accept(source).then(published);
    const rejection = expect(result).rejects.toThrow('地图显示已关闭');
    await vi.runAllTimersAsync();
    const renders = pixi.render.mock.calls.length;
    renderer.destroy(); await rejection;
    expect(frames.size).toBe(0);
    expect(ResizeObserverDouble.instances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(pixi.render).toHaveBeenCalledTimes(renders); expect(published).not.toHaveBeenCalled();
    await expectLocked(renderer, fatal, 0);
  });

  it.each(['destroy', 'resize-error'] as const)('%s during the paint yield prevents remaining blocks and acceptance', async boundary => {
    let renders = 0;
    const { renderer, fatal, progress } = newRenderer(value => {
      if (value.stage !== '绘制已核验地理块' || value.completed !== 8) return;
      queueMicrotask(() => {
        if (boundary === 'destroy') renderer.destroy();
        else { pixi.resize.mockImplementationOnce(() => { throw new Error('resize failed during paint yield'); }); ResizeObserverDouble.instances[0].notify(); }
        renders = pixi.render.mock.calls.length;
      });
    }); await renderer.init();
    const published = vi.fn(), result = renderer.accept(source).then(published), rejection = expect(result).rejects.toThrow();
    await vi.runAllTimersAsync(); tick(); await rejection;
    expect(paintProgress(progress)).toHaveLength(1); expect(pixi.render).toHaveBeenCalledTimes(renders);
    expect(published).not.toHaveBeenCalled();
    await expectLocked(renderer, fatal, 0);
  });

  it.each(['destroy', 'cancel', 'resize-error'] as const)('%s during private index construction never publishes that candidate', async boundary => {
    const { renderer, fatal, progress } = await loadedRenderer(), before = renderer.metrics(); progress.mockClear();
    const published = vi.fn(), result = renderer.accept(largeSource).then(published), rejection = expect(result).rejects.toThrow();
    expect(progress.mock.results[0].value).toMatchObject({ stage: '建立地块空间索引', completed: 4096, total: 512 ** 2 });
    expect(paintProgress(progress)).toHaveLength(0);
    if (boundary === 'destroy') renderer.destroy();
    else if (boundary === 'cancel') {
      expect(renderer.cancelPendingAcceptance()).toBe(true);
      expect(fatal.mock.calls[0][0].message).toContain('草稿已保存，未回滚');
    } else { pixi.resize.mockImplementationOnce(() => { throw new Error('resize failed during index build'); }); ResizeObserverDouble.instances[0].notify(); }
    const renders = pixi.render.mock.calls.length;
    await vi.runAllTimersAsync(); tick(); await rejection;
    expect(progress).toHaveBeenCalledTimes(1); expect(pixi.render).toHaveBeenCalledTimes(renders); expect(published).not.toHaveBeenCalled();
    expect(renderer.metrics()).toMatchObject({ repaintBlocks: before.repaintBlocks, acceptedRevision: before.acceptedRevision });
    await expectLocked(renderer, fatal, before.correctFrameAt);
    expect(encodedDigest(largeSource)).toBe(largeSourceDigest);
  });

  it('cancelling after acceptance completes is inert and the renderer remains usable', async () => {
    const { renderer, fatal } = await loadedRenderer();
    expect(renderer.cancelPendingAcceptance()).toBe(false);
    renderer.select(42); renderer.showPreview([42]);
    expect(fatal).not.toHaveBeenCalled(); expect(renderer.metrics().fatal).toBe(false);
  });

  it('local edits do not insert a paint timer before their correct frame', async () => {
    const { renderer, progress, fatal } = await loadedRenderer(); progress.mockClear();
    const edited: AtlasDraftData = { ...source, manifest: { ...source.manifest, revision: source.manifest.revision + 1 } };
    const result = renderer.accept(edited, { dirtyKeys: ['elevation:0:0'], changedVertexIds: [], affectedCellIds: [0] });
    expect(vi.getTimerCount()).toBe(0); expect(progress).not.toHaveBeenCalled();
    await Promise.resolve(); tick(); const accepted = await result;
    expect(accepted.repaintBlocks).toBe(4); expect(fatal).not.toHaveBeenCalled();
  });

  it('switching a real 512² high-ID preview to 128² clears the old overlay before any drawing', async () => {
    const { renderer, fatal } = newRenderer(); await renderer.init();
    const largeAccepted = renderer.accept(largeSource); await vi.runAllTimersAsync(); tick(); await largeAccepted;
    const id = 510 * 512 + 510, vertex = cellVertexIds(largeSource.manifest.spec, id)[0], position = getVertexPositionQ(largeSource, vertex);
    renderer.select(id);
    renderer.showPreview([id], { ids: new Uint32Array([vertex]), xyQ: new Int32Array([position.xQ + 64, position.yQ + 64]) });
    expect(pixi.preview).toHaveBeenCalled(); pixi.preview.mockClear();
    const smallAccepted = renderer.accept(source); await vi.runAllTimersAsync(); tick(); await smallAccepted;
    expect(pixi.preview).not.toHaveBeenCalled(); expect(fatal).not.toHaveBeenCalled();
    expect(renderer.metrics()).toMatchObject({ repaintBlocks: 16, acceptedRevision: source.manifest.revision, fatal: false });
    expect(encodedDigest(largeSource)).toBe(largeSourceDigest);
  });

  it('restoring a same-draft backup clears both pending cells and proposed shared vertices', async () => {
    const { renderer, fatal } = newRenderer(); await renderer.init();
    const newer: AtlasDraftData = { ...source, manifest: { ...source.manifest, revision: source.manifest.revision + 1 } };
    const accepted = renderer.accept(newer); await vi.runAllTimersAsync(); tick(); await accepted;
    const id = 64 * 128 + 64, vertex = cellVertexIds(source.manifest.spec, id)[0], position = getVertexPositionQ(source, vertex);
    renderer.showPreview([id], { ids: new Uint32Array([vertex]), xyQ: new Int32Array([position.xQ + 256, position.yQ]) });
    expect(pixi.preview).toHaveBeenCalled(); pixi.preview.mockClear();
    // A backup uses the same identity and older revision, with no edit delta.
    const restored = renderer.accept(source); await vi.runAllTimersAsync(); tick(); await restored;
    expect(pixi.preview).not.toHaveBeenCalled(); expect(fatal).not.toHaveBeenCalled();
    expect(renderer.metrics()).toMatchObject({ acceptedRevision: source.manifest.revision, fatal: false });
  });

  it('destroy before async initialization completes never attaches an obsolete canvas', async () => {
    let release!: () => void;
    pixi.init.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    const { renderer, host, fatal } = newRenderer(), initialization = renderer.init();
    renderer.destroy(); release(); await initialization;
    expect(host.appendChild).not.toHaveBeenCalled(); expect(pixi.render).not.toHaveBeenCalled();
    expect(ResizeObserverDouble.instances).toHaveLength(0); expect(frames.size).toBe(0);
    expect(pixi.destroy).toHaveBeenCalledTimes(1); expect(fatal).not.toHaveBeenCalled();
    await expect(renderer.accept(source)).rejects.toThrow('地图显示已关闭');
  });
});
