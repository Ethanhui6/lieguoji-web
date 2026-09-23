import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AtlasRenderer } from './renderer';
import { createAtlasDraft, encodeBlock, encodeManifest, type AtlasDraftData } from './model';
import { cellVertexIds, getVertexPositionQ } from './topology';

// Only the browser/GPU boundary is replaced. The source, shared geometry and
// spatial index are the production 128² atlas, never a benchmark fixture.
const pixi = vi.hoisted(() => ({ init: vi.fn(), render: vi.fn(), resize: vi.fn(), destroy: vi.fn(), fill: vi.fn(), preview: vi.fn() }));
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
    private paths = 0;
    clear() { this.paths = 0; return this; }
    rect() { return this; }
    poly() { this.paths++; return this; }
    fill(options?: { color: number }) { if (options?.color === 0xf2d49b) pixi.preview(this.paths); pixi.fill(this.paths); this.paths = 0; return this; }
    stroke() { return this; }
    destroy() {}
  }
  class Application {
    stage = new Container();
    screen = { width: 800, height: 600 };
    canvas = Object.assign(new EventTarget(), { setAttribute() {}, style: { touchAction: '' }, tabIndex: -1 });
    renderer = {
      render: () => pixi.render(pixi.fill.mock.calls.reduce((sum, [count]) => sum + Number(count), 0)),
      resize: (width: number, height: number) => { pixi.resize(width, height); this.screen = { width, height }; },
    };
    init() { return pixi.init(); }
    destroy() { pixi.destroy(); }
  }
  return { Application, Container, Graphics };
});

class ResizeObserverDouble {
  static instances: ResizeObserverDouble[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: () => void) { ResizeObserverDouble.instances.push(this); }
  notify() { this.callback(); }
}

let source: AtlasDraftData;
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
const tick = () => {
  const callbacks = [...frames.values()]; frames.clear();
  for (const callback of callbacks) callback(performance.now());
};
const newRenderer = () => {
  const host = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() }, fatal = vi.fn(), camera = vi.fn();
  const progress = vi.fn((value: { stage: string; completed: number; total: number }) => ({ ...value, submittedPolygons: pixi.render.mock.calls.at(-1)?.[0] }));
  const renderer = new AtlasRenderer(host as unknown as HTMLElement, { onPick: vi.fn(), onFatal: fatal, onCamera: camera, onProgress: progress });
  renderers.push(renderer);
  return { renderer, host, fatal, camera, progress };
};
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
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const mock of Object.values(pixi)) mock.mockReset();
  frames.clear(); frameId = 0; ResizeObserverDouble.instances = [];
  vi.stubGlobal('window', { devicePixelRatio: 1 });
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
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('atlas renderer failure and lifetime boundaries', () => {
  it('only resolves acceptance after its scheduled correct frame', async () => {
    const { renderer, fatal, progress } = newRenderer(); await renderer.init();
    const published = vi.fn(), result = renderer.accept(source).then(published);
    await Promise.resolve();
    expect(published).not.toHaveBeenCalled(); expect(renderer.metrics().correctFrameAt).toBe(0);
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress.mock.results[0].value).toEqual({ stage: '绘制已核验地理块', completed: 8, total: 16, submittedPolygons: 8 * 1024 });
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    expect(progress.mock.results[1].value).toEqual({ stage: '绘制已核验地理块', completed: 16, total: 16, submittedPolygons: 16 * 1024 });
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
    renderer.destroy(); tick(); await rejection;
    expect(ResizeObserverDouble.instances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(pixi.render).toHaveBeenCalledTimes(renders); expect(published).not.toHaveBeenCalled();
    await expectLocked(renderer, fatal, 0);
  });

  it.each(['destroy', 'resize-error'] as const)('%s during the paint yield prevents remaining blocks and acceptance', async boundary => {
    const { renderer, fatal, progress } = newRenderer(); await renderer.init();
    const published = vi.fn(), result = renderer.accept(source).then(published), rejection = expect(result).rejects.toThrow();
    expect(progress).toHaveBeenCalledTimes(1);
    if (boundary === 'destroy') renderer.destroy();
    else { pixi.resize.mockImplementationOnce(() => { throw new Error('resize failed during paint yield'); }); ResizeObserverDouble.instances[0].notify(); }
    const renders = pixi.render.mock.calls.length;
    await vi.runAllTimersAsync(); tick(); await rejection;
    expect(progress).toHaveBeenCalledTimes(1); expect(pixi.render).toHaveBeenCalledTimes(renders);
    expect(published).not.toHaveBeenCalled();
    await expectLocked(renderer, fatal, 0);
  });

  it('local edits do not insert a paint timer before their correct frame', async () => {
    const { renderer, progress, fatal } = await loadedRenderer(); progress.mockClear();
    const edited: AtlasDraftData = { ...source, manifest: { ...source.manifest, revision: source.manifest.revision + 1 } };
    const result = renderer.accept(edited, { dirtyKeys: ['elevation:0:0'], changedVertexIds: [], affectedCellIds: [0] });
    expect(vi.getTimerCount()).toBe(0); expect(progress).not.toHaveBeenCalled();
    tick(); const accepted = await result;
    expect(accepted.repaintBlocks).toBe(1); expect(fatal).not.toHaveBeenCalled();
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
