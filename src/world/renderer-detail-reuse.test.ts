import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasRenderer, sameVerifiedDetailGeography } from './renderer';
import { createGenerationDraft, cloneGenerationDocument } from './generation-format';
import { verifyAtlasDocument, type AtlasGenerationDocument, type AtlasGeographyView } from './atlas-format';
import { atlasCellLockFlags, hashAtlasCellLockBlock } from './generation-locks';
import { getCellLayerSlot, hashBlock } from './model';
import { detailCoastOwnerLayout } from './detail-coast-types';
import { hashDetailCoastTile } from './detail-coast-codec';
import { AtlasTextureCache } from './atlas-texture-cache';

// Real 128² source, verification, SpatialIndex and cache ownership. GPU page
// packing/submission is replaced here; actual output and timing need browsers.
const boundary = vi.hoisted(() => ({ prepare: vi.fn(), install: vi.fn(), release: vi.fn(), backend: vi.fn(), target: vi.fn(), label: vi.fn(), destroy: vi.fn() }));
vi.mock('pixi.js/unsafe-eval', () => ({}));
vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = []; destroyed = false; position = { set() {} }; scale = { set() {} };
    addChild(child: Container) { if (!this.children.includes(child)) this.children.push(child); return child; }
    destroy() { this.destroyed = true; }
  }
  class Graphics extends Container { clear() { return this; } rect() { return this; } poly() { return this; } fill() { return this; } stroke() { return this; } }
  class Application {
    stage = new Container(); screen = { width: 800, height: 600 }; captures = new Set<number>();
    canvas = Object.assign(new EventTarget(), { setAttribute() {}, style: {}, tabIndex: 0, getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture: (id: number) => this.captures.add(id), hasPointerCapture: (id: number) => this.captures.has(id), releasePointerCapture: (id: number) => this.captures.delete(id) });
    renderer = { gl: {}, resolution: 1, render: (input: { target?: unknown }) => { if (input.target) boundary.target(input); }, resize: (width: number, height: number) => { this.screen = { width, height }; } };
    async init() {} destroy() { boundary.destroy(); }
  }
  class BufferImageSource {
    pixelWidth: number; pixelHeight: number; resource: Uint8Array;
    constructor(options: { width: number; height: number; resource: Uint8Array }) { this.pixelWidth = options.width; this.pixelHeight = options.height; this.resource = options.resource; }
    destroy() {}
  }
  class Texture {
    destroyed = false; source: BufferImageSource;
    constructor(options: { source: BufferImageSource }) { this.source = options.source; }
    destroy(source: boolean) { if (source) this.source.destroy(); this.destroyed = true; }
  }
  class RenderTexture {
    source: { pixelWidth: number; pixelHeight: number };
    constructor(width: number, height: number) { this.source = { pixelWidth: width, pixelHeight: height }; }
    static create(options: { width: number; height: number }) { return new RenderTexture(options.width, options.height); }
    destroy() {}
  }
  class Sprite extends Container { visible = true; constructor(texture: unknown) { super(); void texture; } }
  class Matrix { constructor(public a: number, public b: number, public c: number, public d: number, public tx: number, public ty: number) {} }
  class Rectangle { constructor(public x: number, public y: number, public width: number, public height: number) {} }
  return { Application, Container, Graphics, BufferImageSource, Texture, RenderTexture, Sprite, Matrix, Rectangle, Mesh: Container, MeshGeometry: Container };
});
vi.mock('./atlas-label-layer', () => {
  const emptyAtlasLabelMetrics = () => ({ visibleCount: 0, visibleIds: [], boxes: [], examinedCells: 0, candidateCount: 0, latticeStride: null, visibleNodes: 0, probeNodes: 0, measurementCacheEntries: 0 });
  class AtlasLabelLayer { update(input: unknown) { boundary.label(input); } hide() {} destroy() {} metrics() { return emptyAtlasLabelMetrics(); } }
  return { AtlasLabelLayer, emptyAtlasLabelMetrics };
});
vi.mock('./detail-terrain-backend', async () => {
  const { Container } = await import('pixi.js');
  const { extractDetailCoastBase } = await import('./detail-coast-base');
  const { createDetailShapeBaseSampler } = await import('./generation/detail-shape-height');
  const { pickDetailCoastSurface } = await import('./detail-coast-geometry');
  class DetailTerrainBackend {
    gpuReady = false; private complete = false; private field?: Parameters<typeof pickDetailCoastSurface>[0];
    constructor(readonly data: AtlasGeographyView) { boundary.backend(data); }
    metrics() { return { complete: this.complete, gpuReady: this.gpuReady }; }
    async prepare(control: { check?: () => void } = {}) {
      control.check?.(); if (this.complete) return; boundary.prepare(this.data);
      const base = await extractDetailCoastBase(this.data, { yieldTask: async () => {} }); control.check?.();
      this.field = { tiles: this.data.detailCoast!, sampleBaseElevation: createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters) }; this.complete = true;
    }
    async installGpu() { if (!this.gpuReady) { boundary.install(this.data); this.gpuReady = true; } }
    setDrawOrigin() {}
    createMesh() { return Object.assign(new Container(), { terrainBuffers: { bytes: 56, vertices: 4, triangles: 2, shoreSegments: 0 } }); }
    pick(point: { x: number; y: number }) { return pickDetailCoastSurface(this.field!, point); }
    releaseGpu() { boundary.release(this.data); this.gpuReady = false; }
    destroy() { this.releaseGpu(); this.complete = false; this.field = undefined; }
  }
  return { DetailTerrainBackend, DETAIL_TERRAIN_SHARED_PIXELS: 4_198_401 + 2 * 1201 * 33 };
});

let source: AtlasGenerationDocument<4>;
let sourceSnapshot: AtlasGenerationDocument<4>;
const frames = new Map<number, FrameRequestCallback>(), renderers: AtlasRenderer[] = [];
let frameId = 0;
const tick = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(performance.now()); };
async function flush() { for (let i = 0; i < 8; i++) { await vi.runAllTimersAsync(); tick(); await Promise.resolve(); } }
const dispatch = (target: EventTarget, type: string, fields: object = {}) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
async function opened() {
  const host = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() }, fatal = vi.fn(), pick = vi.fn(), progress = vi.fn();
  const renderer = new AtlasRenderer(host as unknown as HTMLElement, { onFatal: fatal, onPick: pick, onProgress: progress }); renderers.push(renderer);
  await renderer.init(); const pending = renderer.accept(source); await flush(); await pending;
  const canvas = host.appendChild.mock.calls[0][0] as HTMLCanvasElement;
  return { renderer, canvas, fatal, pick, progress };
}
async function locked(revision = 1, mask = 3) {
  const next = cloneGenerationDocument(source), flags = new Uint8Array(1024); flags[33] = mask;
  const block = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 1, by: 1, flags };
  next.locks.set('lock:1:1', block); next.manifest.constraints.lockRefs = [{ bx: 1, by: 1, hash: await hashAtlasCellLockBlock(block) }];
  next.manifest.revision = revision; next.manifest.name = '已保护的大陆';
  await verifyAtlasDocument(next, { yieldTask: async () => {} }); return next;
}
beforeAll(async () => {
  source = await createGenerationDraft({ size: 128, seed: 'v4-render-metadata-reuse', name: '真实细地图复用' }, { yieldTask: async () => {} }, 4);
  const layout = detailCoastOwnerLayout(16, 16), tile = { format: 'lieguoji-detail-coast-tile' as const, version: 1 as const, bx: 16, by: 16, mode: 'samples' as const,
    coverageQ: new Int16Array(layout.count).fill(32767), elevationMeters: new Int16Array(layout.count).fill(260) };
  source.detailCoast.set('coast:16:16', tile); source.manifest.detailCoast.refs = [{ bx: 16, by: 16, hash: await hashDetailCoastTile(tile) }];
  await verifyAtlasDocument(source, { yieldTask: async () => {} }); sourceSnapshot = cloneGenerationDocument(source);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); for (const mock of Object.values(boundary)) mock.mockReset(); frames.clear(); frameId = 0;
  vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy(); expect(source).toEqual(sourceSnapshot);
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('verified v4 lock-only display replacement', () => {
  it('reuses real geography and caches on lock confirm/undo while publishing new lock metadata only after a correct frame', async () => {
    const h = await opened(); h.renderer.focusCell(4257); h.renderer.setGridVisible(true); tick();
    const before = h.renderer.metrics(), next = await locked(); h.progress.mockClear(); boundary.target.mockClear(); boundary.label.mockClear();
    const published = vi.fn(), accepting = h.renderer.accept(next).then(published);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(published).not.toHaveBeenCalled(); expect(h.renderer.metrics().acceptedRevision).toBe(0);
    await flush(); await accepting;
    const after = h.renderer.metrics(); expect(after).toMatchObject({ acceptedRevision: 1, displayRevision: 1, committedRevision: 1, selected: 4257, camera: before.camera, repaintBlocks: 0 });
    expect(after.cache.created).toBe(before.cache.created); expect(after.geometryCache.created).toBe(before.geometryCache.created);
    expect(boundary.prepare).toHaveBeenCalledTimes(1); expect(boundary.backend).toHaveBeenCalledTimes(1); expect(boundary.target).not.toHaveBeenCalled();
    expect(h.progress.mock.calls.some(([p]) => p.stage.includes('空间索引'))).toBe(false);
    const labeled = boundary.label.mock.calls.at(-1)![0].data as AtlasGenerationDocument<4>;
    expect(labeled).toBe(next); expect(atlasCellLockFlags(labeled, 4257)).toBe(3); expect(labeled.manifest.name).toBe('已保护的大陆');
    const camera = after.camera, clientX = camera.x + 1057 * camera.scale, clientY = camera.y + 1057 * camera.scale;
    dispatch(h.canvas, 'pointerdown', { pointerId: 1, button: 0, clientX, clientY }); dispatch(h.canvas, 'pointerup', { pointerId: 1, clientX, clientY });
    expect(h.pick.mock.calls.at(-1)![1]).toMatchObject({ land: true, height: 260 });
    const undo = cloneGenerationDocument(source); undo.manifest.revision = 2; await verifyAtlasDocument(undo, { yieldTask: async () => {} });
    const undone = h.renderer.accept(undo); await flush(); await undone;
    expect(h.renderer.metrics()).toMatchObject({ acceptedRevision: 2, repaintBlocks: 0 }); expect(boundary.prepare).toHaveBeenCalledTimes(1);
    expect(atlasCellLockFlags(boundary.label.mock.calls.at(-1)![0].data, 4257)).toBe(0); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('rejects reuse for any changed geographic identity or coarse/fine reference', () => {
    const altered = (change: (data: AtlasGenerationDocument<4>) => void) => { const data = cloneGenerationDocument(source); change(data); return data; };
    const hash = 'f'.repeat(64);
    const cases = [altered(d => { d.manifest.draftId = `atlas-${crypto.randomUUID()}`; }), altered(d => { d.manifest.atlasId = `atlas-${crypto.randomUUID()}`; }),
      altered(d => { d.manifest.spec.columns = 256; d.manifest.spec.rows = 256; }),
      ...(['geometry:', 'elevation:', 'sim-membership:', 'admin-membership:'] as const).map(prefix => altered(d => { d.manifest.blockRefs.find(ref => ref.key.startsWith(prefix))!.hash = hash; })),
      altered(d => { d.manifest.detailCoast.refs[0].hash = hash; }), altered(d => { d.manifest.detailCoast.refs = []; }),
      { ...source, manifest: { ...source.manifest, surface: { ...source.manifest.surface, stepWorld: 4 } } } as unknown as AtlasGeographyView,
      { ...source, manifest: { ...source.manifest, version: 3 } } as unknown as AtlasGeographyView];
    for (const candidate of cases) expect(sameVerifiedDetailGeography(source, candidate)).toBe(false);
  });

  it.each(['coarse', 'fine'] as const)('fully rebuilds after a verified %s height change even with empty delta hints', async layer => {
    const h = await opened(), next = await locked();
    if (layer === 'coarse') { const slot = getCellLayerSlot(next, 'elevation', 4257); slot.block.values[slot.slot] -= 10; next.manifest.blockRefs.find(ref => ref.key === slot.key)!.hash = await hashBlock(slot.block); }
    else { const tile = next.detailCoast.get('coast:16:16')!; if (tile.mode !== 'samples') throw new Error('fixture'); tile.elevationMeters[400] = 620; next.manifest.detailCoast.refs[0].hash = await hashDetailCoastTile(tile); }
    await verifyAtlasDocument(next, { yieldTask: async () => {} }); h.progress.mockClear();
    const accepted = h.renderer.accept(next, { dirtyKeys: [], changedVertexIds: [], affectedCellIds: [] }); await flush(); await accepted;
    expect(boundary.backend).toHaveBeenCalledTimes(2); expect(boundary.prepare).toHaveBeenCalledTimes(2);
    expect(h.progress.mock.calls.some(([p]) => p.stage.includes('空间索引'))).toBe(true); expect(h.renderer.metrics().repaintBlocks).toBeGreaterThan(0); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('does not use the shortcut without retained texture cache', async () => {
    const h = await opened(), next = await locked();
    const absent = vi.spyOn(AtlasTextureCache.prototype, 'stats');
    absent.mockReturnValueOnce({ ...h.renderer.metrics().cache, entries: 0 });
    const accepted = h.renderer.accept(next); await flush(); await accepted;
    expect(boundary.prepare).toHaveBeenCalledTimes(2); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('keeps generation-preview confirmation on the full replacement path even when geography matches', async () => {
    const h = await opened(), next = await locked();
    const preview = h.renderer.showGenerationPreview(next); await flush(); await preview;
    expect(h.renderer.metrics()).toMatchObject({ displaySource: 'generation-preview', acceptedRevision: 0 });
    const confirmed = h.renderer.accept(next); await flush(); await confirmed;
    expect(boundary.prepare).toHaveBeenCalledTimes(3); expect(h.renderer.metrics()).toMatchObject({ displaySource: 'committed', acceptedRevision: 1 });
    expect(h.fatal).not.toHaveBeenCalled();
  });

  it('rebuilds when acceptance starts during GPU loss and keeps context recovery authoritative', async () => {
    const h = await opened(), next = await locked(); dispatch(h.canvas, 'webglcontextlost');
    const accepted = h.renderer.accept(next), published = vi.fn(); void accepted.then(published);
    await vi.runAllTimersAsync(); expect(published).not.toHaveBeenCalled(); dispatch(h.canvas, 'webglcontextrestored');
    await flush(); await accepted;
    expect(boundary.prepare).toHaveBeenCalledTimes(2); expect(h.renderer.metrics()).toMatchObject({ gpu: { state: 'ready' }, acceptedRevision: 1 }); expect(h.fatal).not.toHaveBeenCalled();
  });

  it('cancelled metadata acceptance cannot publish a revision or pretend the durable save rolled back', async () => {
    const h = await opened(), next = await locked(), before = h.renderer.metrics();
    const accepted = h.renderer.accept(next), rejection = expect(accepted).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.renderer.cancelPendingAcceptance()).toBe(true); await flush(); await rejection;
    expect(h.renderer.metrics()).toMatchObject({ fatal: true, acceptedRevision: before.acceptedRevision, correctFrameAt: before.correctFrameAt });
    expect(h.fatal.mock.calls[0][0].message).toContain('草稿已保存，未回滚'); expect(atlasCellLockFlags(next, 4257)).toBe(3);
  });
});
