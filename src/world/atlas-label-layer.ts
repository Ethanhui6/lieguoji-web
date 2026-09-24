import type { AtlasDraftData } from './model';
import type { AtlasCamera, CameraSize } from './camera';
import { atlasLodPolicy, collectAtlasLabelCandidates, layoutAtlasLabels, type AtlasLabelCandidate, type AtlasLabelRect, type AtlasLod } from './lod';

type Input = { data: AtlasDraftData; camera: AtlasCamera; viewport: CameraSize; lod: AtlasLod; selectedCellId: number | null };
export type AtlasLabelMetrics = {
  visibleCount: number; visibleIds: number[]; boxes: (AtlasLabelRect & { cellId: number })[];
  examinedCells: number; candidateCount: number; latticeStride: number | null;
  visibleNodes: number; probeNodes: number; measurementCacheEntries: number;
};
export const emptyAtlasLabelMetrics = (): AtlasLabelMetrics => ({ visibleCount: 0, visibleIds: [], boxes: [], examinedCells: 0, candidateCount: 0, latticeStride: null, visibleNodes: 0, probeNodes: 0, measurementCacheEntries: 0 });
const occluderSelector = '.atlas-toolbar, .context-inspector, .atlas-status';

/** Bounded DOM text only. The renderer owns when this work happens, including
 * layout reads, font measurement and writes, inside its draw CPU interval. */
export class AtlasLabelLayer {
  private readonly root = document.createElement('div');
  private readonly probesRoot = document.createElement('div');
  private readonly labels: HTMLSpanElement[] = [];
  private readonly probes: HTMLSpanElement[] = [];
  private readonly measurements = new Map<string, CameraSize>();
  private readonly abort = new AbortController();
  private readonly rootObserver: MutationObserver;
  private readonly stageObserver: MutationObserver;
  private readonly ancestorObserver: MutationObserver;
  private readonly occlusionObserver: MutationObserver;
  private readonly resizeObserver: ResizeObserver;
  private readonly stage: HTMLElement;
  private occluders: HTMLElement[] = [];
  private targetsDirty = true;
  private fontDirty = true;
  private fontSignature = '';
  private fontScale = 1;
  private destroyed = false;
  private report = emptyAtlasLabelMetrics();

  constructor(private host: HTMLElement, private onInvalidate: () => void) {
    this.stage = host.parentElement ?? host;
    this.root.className = 'atlas-label-layer'; this.root.dataset.testid = 'atlas-label-layer'; this.root.setAttribute('aria-hidden', 'true');
    this.probesRoot.className = 'atlas-label-measurements'; this.probesRoot.dataset.testid = 'atlas-label-measurements'; this.probesRoot.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.probesRoot); host.appendChild(this.root);
    const invalidate = () => { if (!this.destroyed) this.onInvalidate(); };
    this.rootObserver = new MutationObserver(() => { this.fontDirty = true; invalidate(); });
    this.rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-text-size', 'data-transparency', 'class', 'style'] });
    this.ancestorObserver = new MutationObserver(() => { this.fontDirty = true; invalidate(); });
    for (let node: HTMLElement | null = host; node && node !== document.documentElement; node = node.parentElement) {
      this.ancestorObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    // Observe only siblings/actual occluders, never the label subtree we write.
    this.stageObserver = new MutationObserver(() => { this.targetsDirty = true; invalidate(); });
    this.stageObserver.observe(this.stage, { childList: true });
    this.occlusionObserver = new MutationObserver(invalidate);
    this.resizeObserver = new ResizeObserver(invalidate);
    this.stage.addEventListener('scroll', invalidate, { capture: true, passive: true, signal: this.abort.signal });
    document.fonts?.addEventListener('loadingdone', () => { this.fontDirty = true; invalidate(); }, { signal: this.abort.signal });
  }

  private syncOccluders() {
    if (!this.targetsDirty) return;
    this.targetsDirty = false; this.occlusionObserver.disconnect(); this.resizeObserver.disconnect();
    this.occluders = [...this.stage.querySelectorAll<HTMLElement>(occluderSelector)];
    for (const node of this.occluders) {
      this.resizeObserver.observe(node, { box: 'border-box' });
      // These three CSS boxes are absolutely anchored to the stage: toolbar
      // top/left, status left/bottom, inspector top/right/bottom (or a fixed
      // mobile sheet height). Internal progress text cannot move a box whose
      // size stays equal. Actual text wrapping/added content that changes its
      // border box is delivered by ResizeObserver, including bottom anchoring.
      // Watching every child/text mutation would repaint a 1,024-cell preview
      // on every Worker progress message, even in the fixed-size inspector.
      this.occlusionObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-extent'], subtree: true });
    }
  }
  private probe(index: number) {
    while (this.probes.length <= index) {
      if (this.probes.length >= 256) throw new Error('地图文字测量节点超过有界上限。');
      const node = document.createElement('span'); node.className = 'atlas-label-text atlas-label-probe'; node.hidden = true;
      node.setAttribute('aria-hidden', 'true'); node.dataset.testid = 'atlas-label-probe'; this.probesRoot.appendChild(node); this.probes.push(node);
    }
    return this.probes[index];
  }
  private refreshFont() {
    if (!this.fontDirty) return;
    this.fontDirty = false;
    const node = this.probe(0); node.dataset.selected = 'false';
    const css = getComputedStyle(node);
    this.fontSignature = [css.fontFamily, css.fontSize, css.fontWeight, css.fontStyle, css.lineHeight, css.letterSpacing, css.padding, css.borderWidth].join('|');
    this.fontScale = Math.max(1, parseFloat(css.fontSize) / 13 || 1); this.measurements.clear();
  }
  private measurementKey(candidate: AtlasLabelCandidate) { return `${this.fontSignature}|${candidate.selected}|${candidate.text}`; }
  private measure(candidates: readonly AtlasLabelCandidate[]) {
    const misses = new Map<string, AtlasLabelCandidate>(), hits = new Map<string, CameraSize>();
    for (const candidate of candidates) { const key = this.measurementKey(candidate), hit = this.measurements.get(key); if (hit) hits.set(key, hit); else misses.set(key, candidate); }
    // Batch every write before every layout read. Equal text/style uses one
    // measurement even when many real cells have the same elevation.
    const pending = [...misses];
    for (let i = 0; i < pending.length; i++) {
      const node = this.probe(i), candidate = pending[i][1]; node.hidden = false; node.dataset.selected = String(candidate.selected); node.textContent = candidate.text;
    }
    const sizes = pending.map(([, candidate], i) => {
      const rect = this.probes[i].getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) throw new Error(`地块 ${candidate.cellId} 的文字未能完成实际字体测量。`);
      return { width: rect.width, height: rect.height };
    });
    for (let i = 0; i < pending.length; i++) {
      this.probes[i].hidden = true;
      this.measurements.set(pending[i][0], sizes[i]);
      while (this.measurements.size > 256) this.measurements.delete(this.measurements.keys().next().value!);
    }
    // A frame's candidate set is itself <=256; preserve its measured values
    // even if inserting misses evicted an older cached candidate this frame.
    const fresh = new Map(pending.map(([key], i) => [key, sizes[i]]));
    const result = new Map<number, CameraSize>();
    for (const candidate of candidates) {
      const key = this.measurementKey(candidate), size = fresh.get(key) ?? hits.get(key);
      if (!size) throw new Error('地图文字测量缓存未覆盖当前候选。');
      result.set(candidate.cellId, size);
    }
    return result;
  }
  update(input: Input) {
    if (this.destroyed) return;
    this.syncOccluders(); this.refreshFont();
    const origin = this.host.getBoundingClientRect();
    const occlusionRects = this.occluders.flatMap(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? [{ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }] : [];
    });
    const policy = atlasLodPolicy(input.lod, input.viewport.width);
    const collection = collectAtlasLabelCandidates({ ...input, spacingCss: (input.lod === 'medium' ? 200 : 112) * this.fontScale });
    const measuredSizes = this.measure(collection.candidates);
    const placed = layoutAtlasLabels({ candidates: collection.candidates, measuredSizes, viewport: input.viewport, occlusionRects, maxLabels: policy.maxLabels });
    this.root.dataset.lod = input.lod;
    while (this.labels.length < placed.length) {
      if (this.labels.length >= 32) throw new Error('地图可见文字节点超过上限。');
      const node = document.createElement('span'); node.className = 'atlas-label-text atlas-map-label'; node.dataset.testid = 'atlas-map-label'; node.setAttribute('aria-hidden', 'true');
      this.root.appendChild(node); this.labels.push(node);
    }
    for (let i = 0; i < this.labels.length; i++) {
      const node = this.labels[i], label = placed[i]; node.hidden = !label;
      if (!label) continue;
      node.textContent = label.text; node.dataset.cellId = String(label.cellId); node.dataset.elevationMeters = String(label.elevationMeters); node.dataset.selected = String(label.selected);
      node.style.transform = `translate(${label.box.x}px, ${label.box.y}px)`;
    }
    this.report = { visibleCount: placed.length, visibleIds: placed.map(label => label.cellId), boxes: placed.map(label => ({ cellId: label.cellId, ...label.box })),
      examinedCells: collection.examinedCells, candidateCount: collection.candidates.length, latticeStride: collection.latticeStride,
      visibleNodes: this.labels.length, probeNodes: this.probes.length, measurementCacheEntries: this.measurements.size };
  }
  hide() {
    for (const node of this.labels) node.hidden = true;
    this.report = { ...emptyAtlasLabelMetrics(), visibleNodes: this.labels.length, probeNodes: this.probes.length, measurementCacheEntries: this.measurements.size };
  }
  metrics(): AtlasLabelMetrics { return { ...this.report, visibleIds: [...this.report.visibleIds], boxes: this.report.boxes.map(box => ({ ...box })) }; }
  destroy() {
    if (this.destroyed) return; this.destroyed = true;
    this.abort.abort(); this.rootObserver.disconnect(); this.stageObserver.disconnect(); this.ancestorObserver.disconnect(); this.occlusionObserver.disconnect(); this.resizeObserver.disconnect();
    this.root.remove(); this.labels.length = 0; this.probes.length = 0; this.measurements.clear(); this.occluders = []; this.report = emptyAtlasLabelMetrics();
  }
}
