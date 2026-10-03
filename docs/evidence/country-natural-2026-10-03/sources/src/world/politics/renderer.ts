import type { AtlasDocument } from '../atlas-format';
import type { AtlasCamera } from '../camera';
import { getCellQuad } from '../topology';
import { countryCellLandPolygons, countryPoliticalMesh, type CountryGeometry } from './geography';
import { countryGeometry, type CountryDocument } from './model';
import { placeCountryLabel, pointInsideCountryLand } from './label-placement';
import { countryChunkVisible, countryExposedSides, countryRenderBounds, countryRenderChunk, expandCountryRenderBounds, type CountryRenderBounds } from './render-chunks';

const NS = 'http://www.w3.org/2000/svg';
const MAX_CACHED_CELLS = 8192, MAX_POLYGONS = 200000, MAX_BORDER_SEGMENTS = 200000;
const MAX_PATH_CHARACTERS = 32 * 1024 * 1024;
const svg = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(NS, tag);
type Point = { x: number; y: number };
type Mark = { element: SVGGElement; text: SVGTextElement; width: number; point: Point; nationId: string; cityId?: string };
type PointQ = { xQ: number; yQ: number };
type CachedLand = { path: string; polygons: number; coast: string; sides: string[]; segments: number; inside: PointQ | null };
type DisplayChunk = { nationId: string; bounds: CountryRenderBounds; fills: string[]; borders: string[]; cells: number };
type RenderedChunk = { land: SVGPathElement; border: SVGPathElement; bounds: CountryRenderBounds; cells: number; visible: boolean };
const segmentPath = (a: PointQ, b: PointQ) => `M${a.xQ / 256},${a.yQ / 256}L${b.xQ / 256},${b.yQ / 256}`;

/** Cancel shared fine-triangle edges before drawing any border. Clip arithmetic
 * may differ in its last floating digit on a reversed edge: keys weld at
 * 1e-6 Q (under 4e-9 world units), while emitted points retain their original
 * coordinates. Coarse-edge fragments stay separate so an adjacent, proven
 * full-land quad never leaves a T-junction seam inside the same country. */
export function countryCellOutline(polygons: readonly PointQ[][], quad: readonly PointQ[]) {
  const edges = new Map<string, { a: PointQ; b: PointQ }>();
  const key = (point: PointQ) => `${Math.round(point.xQ * 1e6)},${Math.round(point.yQ * 1e6)}`;
  for (const polygon of polygons) for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length], ka = key(a), kb = key(b);
    if (ka === kb) continue;
    const id = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`;
    if (edges.has(id)) edges.delete(id); else edges.set(id, { a, b });
  }
  const sides = Array<string>(quad.length).fill(''); let coast = '';
  const onLine = (point: PointQ, a: PointQ, b: PointQ) => Math.abs((b.xQ - a.xQ) * (point.yQ - a.yQ) - (b.yQ - a.yQ) * (point.xQ - a.xQ)) <= Math.hypot(b.xQ - a.xQ, b.yQ - a.yQ) * 1e-6;
  for (const { a, b } of edges.values()) {
    const side = quad.findIndex((start, index) => onLine(a, start, quad[(index + 1) % quad.length]) && onLine(b, start, quad[(index + 1) % quad.length]));
    if (side < 0) coast += segmentPath(a, b); else sides[side] += segmentPath(a, b);
  }
  return { coast, sides, segments: edges.size };
}

/** The base AtlasRenderer owns geography, camera and all native gestures.
 * This independent layer has no input handlers. Political revisions build
 * cached, authoritative land fragments once; camera frames only transform
 * existing paths and position the bounded entity labels. */
export class CountryRenderer {
  private readonly element = svg('svg');
  private readonly land = svg('g');
  private readonly borders = svg('g');
  private readonly labels = svg('g');
  private camera: AtlasCamera = { x: 0, y: 0, scale: 1 };
  private geography?: AtlasDocument;
  private document?: CountryDocument;
  private cache = new Map<number, CachedLand>();
  private cachedPolygons = 0;
  private cachedGeometry: CountryGeometry = 'atlas-cell-v1';
  private nationAnchors = new Map<string, PointQ>();
  private nationGroups = new Map<string, SVGGElement>();
  private chunks: RenderedChunk[] = [];
  private marks: Mark[] = [];
  private pending?: AbortController;
  private destroyed = false;
  private selectedNation: string | null = null;
  private selectedCity: string | null = null;
  private isPreview = false;

  constructor(private readonly host: HTMLElement, private readonly onProgress?: (progress: { stage: string; completed: number; total: number }) => void) {
    this.element.setAttribute('class', 'country-overlay');
    this.element.setAttribute('data-testid', 'country-overlay');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('focusable', 'false');
    this.land.setAttribute('class', 'country-territory-layer');
    this.borders.setAttribute('class', 'country-border-layer');
    this.labels.setAttribute('class', 'country-entity-labels');
    this.element.append(this.land, this.borders, this.labels); host.append(this.element);
  }

  async show(geography: AtlasDocument, document: CountryDocument, preview = false): Promise<void> {
    this.pending?.abort(); const pending = new AbortController(); this.pending = pending;
    const check = () => { if (this.destroyed) throw new Error('建国地图显示已关闭。'); pending.signal.throwIfAborted(); };
    // Fine clipping already asks to yield inside each geographic cell. Share
    // one time slice across those calls instead of paying a clamped timer for
    // every tiny cell; cancellation/input still regain the event loop regularly.
    let sliceStart = performance.now();
    const yieldToInput = async () => { check(); if (performance.now() - sliceStart >= 8) { await new Promise<void>(resolve => setTimeout(resolve, 0)); sliceStart = performance.now(); check(); } };
    const geometryRule = countryGeometry(document), sameGeography = this.geography === geography && this.cachedGeometry === geometryRule;
    if (!sameGeography) { this.cache.clear(); this.cachedPolygons = 0; this.geography = geography; this.cachedGeometry = geometryRule; }
    const previous = this.document;
    // Renaming, city edits and capital changes do not invalidate land geometry.
    if (sameGeography && previous && previous.worldId === document.worldId && previous.territories.length === document.territories.length
      && previous.territories.every((t, i) => t.cellId === document.territories[i].cellId && t.controllingNationId === document.territories[i].controllingNationId)
      && previous.nations.length === document.nations.length && previous.nations.every((n, i) => n.id === document.nations[i].id && n.color === document.nations[i].color)) {
      this.document = document; this.isPreview = preview;
      this.element.setAttribute('data-country-revision', String(document.revision)); this.element.setAttribute('data-country-preview', String(preview));
      this.rebuildLabels(); this.setSelection(this.selectedNation, this.selectedCity); this.pending = undefined; return;
    }
    const groups = new Map<string, SVGGElement>(), fragment = window.document.createDocumentFragment();
    const nations = new Map(document.nations.map(nation => [nation.id, nation]));
    const owners = new Map(document.territories.map(territory => [territory.cellId, territory.controllingNationId]));
    const display = new Map<string, DisplayChunk>(), borderFragment = window.document.createDocumentFragment();
    const insidePoints = new Map<number, PointQ | null>(), nationCells = new Map(document.nations.map(n => [n.id, [] as number[]]));
    let polygonCount = 0, borderSegments = 0, processedSegments = 0, characters = 0, completed = 0;
    try {
      this.element.setAttribute('data-render-state', 'loading');
      const mesh = geometryRule === 'political-voronoi-v1' ? await countryPoliticalMesh(geography, { signal: pending.signal, yieldTask: yieldToInput, onProgress: this.onProgress }) : null;
      for (const territory of document.territories) {
        check(); const nation = nations.get(territory.controllingNationId);
        if (!nation) throw new Error('领土的所属国家不存在，未显示错误着色。');
        const quad = mesh ? mesh.cellPolygonQ(territory.cellId).map(p => ({ x: p.xQ / 256, y: p.yQ / 256 })) : getCellQuad(geography, territory.cellId);
        let cached = this.cache.get(territory.cellId);
        if (!cached) {
          const polygons = await countryCellLandPolygons(geography, territory.cellId, { signal: pending.signal, yieldTask: yieldToInput }, geometryRule); check();
          if (!polygons.length) throw new Error('领土缺少真实陆地，未把海域着色。');
          if (polygonCount + polygons.length > MAX_POLYGONS) throw new Error('政治海岸显示超过细片预算，未用粗格替代真实陆地。');
          const outline = countryCellOutline(polygons, quad.map(point => ({ xQ: point.x * 256, yQ: point.y * 256 })));
          cached = { polygons: polygons.length, path: polygons.map(points => points.map((point, index) => `${index ? 'L' : 'M'}${point.xQ / 256},${point.yQ / 256}`).join('') + 'Z').join(''), ...outline, inside: pointInsideCountryLand(polygons) };
          while (this.cache.size && (this.cache.size >= MAX_CACHED_CELLS || this.cachedPolygons + cached.polygons > MAX_POLYGONS)) {
            const first = this.cache.keys().next().value!; this.cachedPolygons -= this.cache.get(first)!.polygons; this.cache.delete(first);
          }
          this.cache.set(territory.cellId, cached); this.cachedPolygons += cached.polygons;
        }
        polygonCount += cached.polygons;
        insidePoints.set(territory.cellId, cached.inside); nationCells.get(nation.id)!.push(territory.cellId);
        if (polygonCount > MAX_POLYGONS) throw new Error('政治海岸显示超过细片预算，未用粗格替代真实陆地。');
        processedSegments += cached.segments;
        const { columns, rows } = geography.manifest.spec, id = territory.cellId;
        const exposed = mesh ? mesh.sideNeighbors(id).map(neighbor => owners.get(neighbor) !== nation.id) : countryExposedSides(id, columns, rows, nation.id, owners);
        let boundary = cached.coast;
        for (let side = 0; side < exposed.length; side++) if (exposed[side]) boundary += cached.sides[side];
        borderSegments += boundary.split('M').length - 1;
        if (borderSegments > MAX_BORDER_SEGMENTS) throw new Error('实际可见国界线超过显示预算，未截断或简化真实海岸。');
        characters += cached.path.length + boundary.length;
        if (characters > MAX_PATH_CHARACTERS) throw new Error('国土精细几何超过本机显示容量，本次候选未确认；已保存世界保留。');
        const key = `${countryRenderChunk(id, columns)}/${nation.id}`, bounds = countryRenderBounds(quad);
        let chunk = display.get(key);
        if (!chunk) { chunk = { nationId: nation.id, bounds, fills: [], borders: [], cells: 0 }; display.set(key, chunk); }
        else expandCountryRenderBounds(chunk.bounds, bounds);
        chunk.fills.push(cached.path); chunk.borders.push(boundary); chunk.cells++;
        if (++completed % 32 === 0) { this.element.setAttribute('data-render-completed', String(completed)); this.onProgress?.({ stage: '绘制国土与国界', completed, total: document.territories.length }); await yieldToInput(); check(); }
      }
      const anchors = new Map<string, PointQ>();
      for (const nation of document.nations) {
        const placed = await placeCountryLabel({ columns: geography.manifest.spec.columns, rows: geography.manifest.spec.rows, ownedCellIds: nationCells.get(nation.id)!,
          ...(mesh ? { neighbors: (id: number) => mesh.neighbors(id), isBoundary: (id: number) => mesh.sideNeighbors(id).some(other => other < 0 || owners.get(other) !== nation.id), centerQ: (id: number) => mesh.centerQ(id) } : {}) },
        id => insidePoints.get(id) ?? null, { signal: pending.signal, yieldTask: yieldToInput });
        check(); if (placed) anchors.set(nation.id, placed.pointQ);
      }
      const chunks: RenderedChunk[] = [];
      for (const [key, chunk] of display) {
        let group = groups.get(chunk.nationId);
        if (!group) { group = svg('g'); group.setAttribute('fill', nations.get(chunk.nationId)!.color); group.setAttribute('data-nation-id', chunk.nationId); groups.set(chunk.nationId, group); fragment.append(group); }
        const land = svg('path'); land.setAttribute('d', chunk.fills.join('')); land.setAttribute('data-territory-chunk', key); group.append(land);
        const border = svg('path'); border.setAttribute('d', chunk.borders.join('')); border.setAttribute('fill', 'none'); border.setAttribute('stroke', nations.get(chunk.nationId)!.color);
        border.setAttribute('stroke-width', '1.2'); border.setAttribute('stroke-linejoin', 'round'); border.setAttribute('stroke-linecap', 'round');
        border.setAttribute('vector-effect', 'non-scaling-stroke'); border.setAttribute('opacity', '.85'); border.setAttribute('data-nation-border', chunk.nationId); borderFragment.append(border);
        chunks.push({ land, border, bounds: chunk.bounds, cells: chunk.cells, visible: true });
      }
      check(); this.chunks = chunks; this.document = document; this.isPreview = preview; this.nationGroups = groups; this.nationAnchors = anchors; this.land.replaceChildren(fragment);
      this.borders.replaceChildren(borderFragment);
      this.element.setAttribute('data-country-world-id', document.worldId); this.element.setAttribute('data-country-revision', String(document.revision));
      this.element.setAttribute('data-country-preview', String(preview)); this.element.setAttribute('data-land-polygons', String(polygonCount));
      this.element.setAttribute('data-land-cells', String(document.territories.length));
      this.element.setAttribute('data-border-segments', String(borderSegments));
      this.element.setAttribute('data-processed-segments', String(processedSegments));
      this.element.setAttribute('data-render-chunks', String(chunks.length));
      this.element.setAttribute('data-path-characters', String(characters));
      this.element.setAttribute('data-render-state', 'ready');
      this.element.setAttribute('data-political-geometry', geometryRule); this.element.setAttribute('data-render-completed', String(document.territories.length));
      this.onProgress?.({ stage: '绘制国土与国界', completed: document.territories.length, total: document.territories.length });
      this.rebuildLabels(); this.setSelection(this.selectedNation, this.selectedCity); this.setCamera(this.camera);
    } catch (failure) {
      if (this.pending === pending && !pending.signal.aborted && !this.destroyed) {
        this.land.replaceChildren(); this.borders.replaceChildren(); this.labels.replaceChildren(); this.marks = []; this.chunks = []; this.nationGroups.clear(); this.document = undefined;
        this.element.setAttribute('data-render-state', 'error');
      }
      throw failure;
    } finally { if (this.pending === pending) this.pending = undefined; }
  }

  private rebuildLabels() {
    this.labels.replaceChildren(); this.marks = []; const document = this.document!;
    for (const nation of document.nations) {
      const anchor = this.nationAnchors.get(nation.id); if (!anchor) continue;
      const group = svg('g'), text = svg('text'); text.textContent = nation.name;
      text.setAttribute('class', 'country-map-nation-name'); text.setAttribute('text-anchor', 'middle'); group.append(text);
      group.setAttribute('data-nation-label', nation.id); group.setAttribute('data-anchor-xq', String(anchor.xQ)); group.setAttribute('data-anchor-yq', String(anchor.yQ)); this.labels.append(group);
      this.marks.push({ element: group, text, width: nation.name.length * 17 + 8, point: { x: anchor.xQ / 256, y: anchor.yQ / 256 }, nationId: nation.id });
    }
    for (const city of document.cities) {
      const nation = document.nations.find(nation => nation.id === city.nationId); if (!nation) continue;
      const capital = nation.capitalCityId === city.id, group = svg('g'), halo = svg('circle'), symbol = capital ? svg('path') : svg('circle'), text = svg('text');
      group.setAttribute('data-city-id', city.id); group.setAttribute('data-capital', String(capital));
      halo.setAttribute('r', '12'); halo.setAttribute('class', 'country-city-halo');
      if (capital) symbol.setAttribute('d', 'M0,-9L2.6,-3L9,-2.8L4,1.4L5.4,8L0,4.5L-5.4,8L-4,1.4L-9,-2.8L-2.6,-3Z');
      else symbol.setAttribute('r', '5');
      symbol.setAttribute('fill', capital ? nation.color : '#ffffff'); symbol.setAttribute('stroke', nation.color); symbol.setAttribute('stroke-width', '2');
      text.textContent = city.name; text.setAttribute('x', '13'); text.setAttribute('y', '-9'); text.setAttribute('class', 'country-map-city-name');
      group.append(halo, symbol, text); this.labels.append(group);
      this.marks.push({ element: group, text, width: city.name.length * 14 + 8, point: { x: city.positionQ.xQ / 256, y: city.positionQ.yQ / 256 }, nationId: nation.id, cityId: city.id });
    }
  }

  setSelection(nationId: string | null, cityId: string | null) {
    this.selectedNation = nationId; this.selectedCity = cityId;
    for (const [id, group] of this.nationGroups) group.setAttribute('opacity', String(this.isPreview ? .24 : id === nationId ? .28 : .17));
    for (const mark of this.marks) mark.element.setAttribute('data-selected', String(mark.cityId ? mark.cityId === cityId : mark.nationId === nationId));
    this.setCamera(this.camera);
  }

  setCamera(camera: AtlasCamera) {
    if (this.destroyed) return;
    this.camera = { ...camera }; const width = this.host.clientWidth, height = this.host.clientHeight;
    this.element.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
    this.land.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    this.borders.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    let visibleChunks = 0, visibleCells = 0;
    for (const chunk of this.chunks) {
      const visible = countryChunkVisible(chunk.bounds, camera, width, height);
      if (visible !== chunk.visible) { chunk.land.style.display = visible ? '' : 'none'; chunk.border.style.display = visible ? '' : 'none'; chunk.visible = visible; }
      if (visible) { visibleChunks++; visibleCells += chunk.cells; }
    }
    this.element.setAttribute('data-visible-chunks', String(visibleChunks)); this.element.setAttribute('data-visible-cells', String(visibleCells));
    const visible: { mark: Mark; x: number; y: number }[] = [];
    for (const mark of this.marks) {
      const x = camera.x + mark.point.x * camera.scale, y = camera.y + mark.point.y * camera.scale;
      mark.element.setAttribute('transform', `translate(${x} ${y})`);
      const offscreen = x < -100 || y < -30 || x > width + 100 || y > height + 30;
      mark.element.setAttribute('visibility', offscreen ? 'hidden' : 'visible');
      if (offscreen) mark.text.setAttribute('visibility', 'hidden');
      if (!offscreen) visible.push({ mark, x, y });
    }
    const preferNations = camera.scale < 0.3;
    const priority = (mark: Mark) => mark.cityId === this.selectedCity ? 0 : !mark.cityId && mark.nationId === this.selectedNation ? 1 :
      preferNations ? (mark.cityId ? 3 : 2) : (mark.cityId ? 2 : 3);
    visible.sort((a, b) => priority(a.mark) - priority(b.mark));
    const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const { mark, x, y } of visible) {
      const left = x + (mark.cityId ? 13 : -mark.width / 2), top = y + (mark.cityId ? -24 : -18);
      const box = { left, right: left + mark.width, top, bottom: top + 22 };
      const overlaps = occupied.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      mark.text.setAttribute('visibility', overlaps ? 'hidden' : 'visible');
      if (!overlaps) occupied.push(box);
    }
  }

  pickCity(point: Point): string | null {
    let distance = 22 / this.camera.scale, found: string | null = null;
    for (const mark of this.marks) if (mark.cityId) {
      const next = Math.hypot(point.x - mark.point.x, point.y - mark.point.y);
      if (next < distance) { distance = next; found = mark.cityId; }
    }
    return found;
  }

  getNationAnchorQ(nationId: string): PointQ | null { const point = this.nationAnchors.get(nationId); return point ? { ...point } : null; }

  cancelPending() { this.pending?.abort(new DOMException('已取消国土绘制；请核对当前已保存状态。', 'AbortError')); }

  destroy() { this.destroyed = true; this.pending?.abort(); this.element.remove(); this.cache.clear(); this.cachedPolygons = 0; this.marks = []; this.chunks = []; this.nationGroups.clear(); }
}
