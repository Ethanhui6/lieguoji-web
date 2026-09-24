import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasLabelLayer } from './atlas-label-layer';
import { createAtlasDraft, type AtlasDraftData } from './model';

// Replace only browser layout/observer delivery. Candidate collection and
// collision placement use the production atlas data and algorithms. Browser
// acceptance separately verifies the real CSS boxes and text measurements.
let fontSize = 13;
class ElementDouble extends EventTarget {
  parentElement: ElementDouble | null = null;
  children: ElementDouble[] = [];
  className = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  hidden = false;
  textContent = '';
  rect?: { left: number; top: number; width: number; height: number };
  constructor(readonly tag = 'div') { super(); }
  appendChild(node: ElementDouble) { node.parentElement = this; this.children.push(node); return node; }
  setAttribute() {}
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  contains(node: ElementDouble): boolean { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector: string): ElementDouble[] {
    const classes = selector.split(',').map(part => part.trim().slice(1));
    return this.children.flatMap(node => [...(node.className.split(' ').some(value => classes.includes(value)) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  getBoundingClientRect = vi.fn(() => this.rect ?? { left: 0, top: 0, width: this.textContent.length * fontSize * .55 + 12, height: fontSize * 1.35 + 6 });
}
type Change = { type: 'attributes' | 'childList' | 'characterData'; target: ElementDouble; attributeName?: string };
class MutationObserverDouble {
  static instances: MutationObserverDouble[] = [];
  targets = new Map<ElementDouble, MutationObserverInit>();
  constructor(readonly callback: () => void) { MutationObserverDouble.instances.push(this); }
  observe(target: ElementDouble, options: MutationObserverInit) { this.targets.set(target, options); }
  disconnect = vi.fn(() => this.targets.clear());
  static deliver(change: Change) {
    for (const observer of this.instances) {
      const interested = [...observer.targets].some(([node, options]) => {
        if (node !== change.target && !(options.subtree && node.contains(change.target))) return false;
        if (change.type === 'attributes') return options.attributes && (!options.attributeFilter || options.attributeFilter.includes(change.attributeName!));
        return change.type === 'childList' ? options.childList : options.characterData;
      });
      if (interested) observer.callback();
    }
  }
}
class ResizeObserverDouble {
  static instances: ResizeObserverDouble[] = [];
  targets = new Map<ElementDouble, ResizeObserverOptions>();
  constructor(readonly callback: () => void) { ResizeObserverDouble.instances.push(this); }
  observe(target: ElementDouble, options: ResizeObserverOptions) { this.targets.set(target, options); }
  disconnect = vi.fn(() => this.targets.clear());
  static deliver(node: ElementDouble) { for (const observer of this.instances) if (observer.targets.has(node)) observer.callback(); }
}
let data: AtlasDraftData;
const layers: AtlasLabelLayer[] = [];
let html: ElementDouble, body: ElementDouble, main: ElementDouble, stage: ElementDouble, host: ElementDouble, toolbar: ElementDouble, inspector: ElementDouble, fonts: EventTarget;
const input = () => ({ data, camera: { x: 112, y: 12, scale: .14 }, viewport: { width: 800, height: 600 }, lod: 'far' as const, selectedCellId: 8256 });
const createLayer = () => {
  const invalidate = vi.fn(), layer = new AtlasLabelLayer(host as unknown as HTMLElement, invalidate);
  layers.push(layer); layer.update(input()); return { layer, invalidate };
};
const attribute = (target: ElementDouble, attributeName: string) => MutationObserverDouble.deliver({ target, type: 'attributes', attributeName });

beforeAll(async () => { data = await createAtlasDraft({ size: 128, seed: 'label-invalidation', name: '标签观察边界测试' }); });
beforeEach(() => {
  fontSize = 13; MutationObserverDouble.instances = []; ResizeObserverDouble.instances = [];
  html = new ElementDouble(); body = html.appendChild(new ElementDouble()); main = body.appendChild(new ElementDouble());
  stage = main.appendChild(new ElementDouble()); host = stage.appendChild(new ElementDouble());
  host.rect = { left: 20, top: 40, width: 800, height: 600 };
  toolbar = stage.appendChild(new ElementDouble()); toolbar.className = 'context-toolbar atlas-toolbar'; toolbar.rect = { left: 36, top: 56, width: 200, height: 40 };
  inspector = stage.appendChild(new ElementDouble()); inspector.className = 'context-inspector'; inspector.rect = { left: 620, top: 52, width: 188, height: 576 };
  fonts = new EventTarget();
  vi.stubGlobal('document', { documentElement: html, fonts, createElement: (tag: string) => new ElementDouble(tag) });
  vi.stubGlobal('getComputedStyle', () => ({ fontFamily: 'system-ui', fontSize: `${fontSize}px`, fontWeight: '500', fontStyle: 'normal', lineHeight: String(fontSize * 1.35), letterSpacing: '.01em', padding: '2px 5px', borderWidth: '1px' }));
  vi.stubGlobal('MutationObserver', MutationObserverDouble); vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
});
afterEach(() => { for (const layer of layers.splice(0)) layer.destroy(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('atlas label layout invalidation', () => {
  it('ignores fixed-box progress text, while real border-box resize recomputes avoidance', () => {
    const { layer, invalidate } = createLayer(), feedback = inspector.appendChild(new ElementDouble('span'));
    expect(layer.metrics().visibleIds).toEqual([8256]);
    const reads = host.getBoundingClientRect.mock.calls.length + inspector.getBoundingClientRect.mock.calls.length;
    for (let i = 0; i < 9; i++) { feedback.textContent = `检查 ${i}/9`; MutationObserverDouble.deliver({ type: 'characterData', target: feedback }); }
    MutationObserverDouble.deliver({ type: 'childList', target: inspector });
    expect(invalidate).not.toHaveBeenCalled();
    expect(host.getBoundingClientRect.mock.calls.length + inspector.getBoundingClientRect.mock.calls.length).toBe(reads);
    expect(ResizeObserverDouble.instances[0].targets.get(inspector)).toEqual({ box: 'border-box' });
    const before = layer.metrics().boxes[0];
    inspector.rect = { left: host.rect!.left + before.x - 10, top: host.rect!.top + before.y - 10, width: 280, height: 150 };
    ResizeObserverDouble.deliver(inspector); expect(invalidate).toHaveBeenCalledTimes(1);
    layer.update(input());
    expect(layer.metrics().boxes).not.toEqual([before]);
    for (const box of layer.metrics().boxes) {
      const x = inspector.rect.left - host.rect!.left, y = inspector.rect.top - host.rect!.top;
      expect(box.x + box.width <= x || box.x >= x + inspector.rect.width || box.y + box.height <= y || box.y >= y + inspector.rect.height).toBe(true);
    }
  });

  it('keeps extent, position, ancestor/font, scroll and font-load invalidation', () => {
    const { layer, invalidate } = createLayer(), originalWidth = layer.metrics().boxes[0].width;
    for (const name of ['class', 'style', 'hidden', 'data-extent']) { invalidate.mockClear(); attribute(inspector, name); expect(invalidate).toHaveBeenCalledTimes(1); }
    for (const node of [host, stage, main, body]) { invalidate.mockClear(); attribute(node, 'style'); expect(invalidate).toHaveBeenCalledTimes(1); }
    for (const name of ['data-theme', 'data-text-size', 'data-transparency', 'class', 'style']) { invalidate.mockClear(); attribute(html, name); expect(invalidate).toHaveBeenCalledTimes(1); }
    invalidate.mockClear(); stage.dispatchEvent(new Event('scroll')); expect(invalidate).toHaveBeenCalledTimes(1);
    invalidate.mockClear(); fonts.dispatchEvent(new Event('loadingdone')); expect(invalidate).toHaveBeenCalledTimes(1);
    fontSize = 18; layer.update(input()); expect(layer.metrics().boxes[0].width).toBeGreaterThan(originalWidth);
    expect(layer.metrics().measurementCacheEntries).toBe(1);
    invalidate.mockClear(); attribute(main, 'data-atlas-state'); attribute(inspector, 'aria-label'); expect(invalidate).not.toHaveBeenCalled();
  });

  it('tracks added and removed panels and detaches every observer/listener on destruction', () => {
    const { layer, invalidate } = createLayer(), status = stage.appendChild(new ElementDouble());
    status.className = 'atlas-status'; status.rect = { left: 36, top: 580, width: 400, height: 44 };
    MutationObserverDouble.deliver({ target: stage, type: 'childList' }); expect(invalidate).toHaveBeenCalledTimes(1);
    layer.update(input()); expect(ResizeObserverDouble.instances[0].targets.has(status)).toBe(true);
    invalidate.mockClear(); status.remove(); MutationObserverDouble.deliver({ target: stage, type: 'childList' });
    expect(invalidate).toHaveBeenCalledTimes(1); layer.update(input());
    expect(ResizeObserverDouble.instances[0].targets.has(status)).toBe(false);
    invalidate.mockClear(); attribute(status, 'style'); ResizeObserverDouble.deliver(status); expect(invalidate).not.toHaveBeenCalled();
    layer.destroy(); invalidate.mockClear();
    for (const observer of [...MutationObserverDouble.instances, ...ResizeObserverDouble.instances]) { expect(observer.targets.size).toBe(0); observer.callback(); }
    stage.dispatchEvent(new Event('scroll')); fonts.dispatchEvent(new Event('loadingdone'));
    expect(invalidate).not.toHaveBeenCalled(); expect(host.children).toHaveLength(0);
    expect(layer.metrics()).toMatchObject({ visibleCount: 0, visibleNodes: 0, probeNodes: 0, measurementCacheEntries: 0 });
  });
});
