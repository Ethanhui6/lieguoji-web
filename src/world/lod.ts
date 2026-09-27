import { cameraWorldBounds, worldToScreen, type AtlasCamera, type CameraPoint, type CameraSize } from './camera';
import { getCellLayerSlot, validateSpec } from './model';
import type { AtlasGeographyView } from './atlas-format';
import { getCellQuad } from './topology';

export type AtlasLod = 'far' | 'medium' | 'near';
export interface AtlasLabelRect extends CameraSize { x: number; y: number }
export interface AtlasLabelCandidate {
  cellId: number;
  elevationMeters: number;
  selected: boolean;
  world: CameraPoint;
  screen: CameraPoint;
  text: string;
}
export interface AtlasPlacedLabel extends AtlasLabelCandidate { box: AtlasLabelRect }
export interface AtlasLabelCandidateOptions {
  /** A verified, synchronously read production view; this is not an import validator. */
  data: AtlasGeographyView;
  camera: AtlasCamera;
  viewport: CameraSize;
  lod: AtlasLod;
  selectedCellId: number | null;
  /** CSS pixels. The renderer may increase this for its actual reading font size. */
  spacingCss?: number;
}
export interface AtlasLabelCandidatePlan {
  candidates: AtlasLabelCandidate[];
  latticeStride: number | null;
  /** Includes selected and rejected ocean/offscreen samples, never more than 256. */
  examinedCells: number;
}
export interface AtlasLabelLayoutOptions {
  candidates: readonly AtlasLabelCandidate[];
  /** Actual DOM-measured CSS dimensions, keyed by stable cell ID. No guessed text widths. */
  measuredSizes: ReadonlyMap<number, CameraSize>;
  viewport: CameraSize;
  occlusionRects: readonly AtlasLabelRect[];
  maxLabels: number;
  paddingCss?: number;
  gapCss?: number;
}
export const ATLAS_LABEL_CANDIDATE_LIMIT = 256;
export const ATLAS_LABEL_DISPLAY_LIMIT = 32;

function validLod(lod: AtlasLod): void {
  if (lod !== 'far' && lod !== 'medium' && lod !== 'near') throw new RangeError('地图显示层次无效。');
}
function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name}必须是有限正数。`);
}
function validSize(value: CameraSize): void {
  if (!value) throw new RangeError('标签尺寸缺失。');
  positive(value.width, '标签或视口宽度'); positive(value.height, '标签或视口高度');
}
function validPoint(value: CameraPoint): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new RangeError('标签坐标必须是有限数。');
}
function onScreen(point: CameraPoint, viewport: CameraSize): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height;
}

/** Semantic detail in CSS pixels; neither palette nor render resolution changes here. */
export function resolveAtlasLod(cellPixels: number, previous?: AtlasLod): AtlasLod {
  if (!Number.isFinite(cellPixels) || cellPixels < 0) throw new RangeError('地块屏幕尺寸必须是有限非负数。');
  if (previous === undefined) return cellPixels < 6 ? 'far' : cellPixels < 24 ? 'medium' : 'near';
  validLod(previous);
  if (previous === 'far') return cellPixels >= 26 ? 'near' : cellPixels >= 7 ? 'medium' : 'far';
  if (previous === 'near') return cellPixels < 5 ? 'far' : cellPixels < 22 ? 'medium' : 'near';
  return cellPixels < 5 ? 'far' : cellPixels >= 26 ? 'near' : 'medium';
}

export function atlasLodPolicy(lod: AtlasLod, viewportWidth: number): { gridVisible: boolean; maxLabels: number } {
  validLod(lod); positive(viewportWidth, '视口宽度');
  return { gridVisible: lod === 'near', maxLabels: lod === 'far' ? 1 : lod === 'medium' ? viewportWidth < 600 ? 4 : 8 : viewportWidth < 600 ? 12 : 32 };
}

function labelText(cellId: number, meters: number, selected: boolean, lod: AtlasLod): string {
  if (selected) return `地块 #${cellId} · ${meters < 0 ? `水深 ${-meters}` : `高程 ${meters}`} 米`;
  return lod === 'near' ? `#${cellId} · ${meters} 米` : `${meters} 米`;
}

function quadCentroid(points: CameraPoint[]): CameraPoint {
  const origin = points[0]; let area = 0, x = 0, y = 0;
  // Triangulate relative to a local origin: the actual area centroid, with no large-coordinate cancellation.
  for (let i = 1; i < points.length - 1; i++) {
    const a = { x: points[i].x - origin.x, y: points[i].y - origin.y }, b = { x: points[i + 1].x - origin.x, y: points[i + 1].y - origin.y };
    const cross = a.x * b.y - a.y * b.x;
    area += cross; x += (a.x + b.x) * cross; y += (a.y + b.y) * cross;
  }
  if (!Number.isFinite(area) || area <= 0) throw new RangeError('标签地块几何无效。');
  return { x: origin.x + x / (3 * area), y: origin.y + y / (3 * area) };
}

/** Samples actual stable cells on a world-anchored lattice, never every visible cell. */
export function collectAtlasLabelCandidates(options: AtlasLabelCandidateOptions): AtlasLabelCandidatePlan {
  const { data, camera, viewport, lod, selectedCellId } = options;
  validLod(lod); validSize(viewport);
  const spacing = options.spacingCss ?? (lod === 'medium' ? 200 : 112); positive(spacing, '标签抽样间距');
  if (!data || !validateSpec(data.manifest?.spec)) throw new RangeError('标签需要已核验的地理规格。');
  const spec = data.manifest.spec, total = spec.columns * spec.rows;
  if (selectedCellId !== null && (!Number.isSafeInteger(selectedCellId) || selectedCellId < 0 || selectedCellId >= total)) throw new RangeError('选中地块 ID 超出当前地图。');
  const bounds = cameraWorldBounds(camera, viewport), candidates: AtlasLabelCandidate[] = [];
  let examinedCells = 0;
  const inspect = (cellId: number, selected: boolean) => {
    examinedCells++;
    const sample = getCellLayerSlot(data, 'elevation', cellId), elevationMeters = sample.block.values[sample.slot];
    if (!Number.isSafeInteger(elevationMeters) || elevationMeters < -12000 || elevationMeters > 12000) throw new RangeError('地块高程不在已核验范围内。');
    if (!selected && elevationMeters < 0) return;
    const world = quadCentroid(getCellQuad(data, cellId));
    const screen = worldToScreen(camera, world);
    if (!onScreen(screen, viewport)) return;
    candidates.push({ cellId, elevationMeters, selected, world, screen, text: (data.manifest.version === 3 ? '采样中心 · ' : '') + labelText(cellId, elevationMeters, selected, lod) });
  };
  // ID zero is a real selection; the reserved sample is counted even when offscreen.
  if (selectedCellId !== null) inspect(selectedCellId, true);
  if (lod === 'far') return { candidates, latticeStride: null, examinedCells };

  const stepX = spec.width / spec.columns, stepY = spec.height / spec.rows;
  // A valid quad, and hence its centroid, stays inside its creation cell plus a quarter-cell halo.
  const minCol = Math.max(0, Math.floor((bounds.minX - stepX / 4) / stepX));
  const maxCol = Math.min(spec.columns - 1, Math.floor((bounds.maxX + stepX / 4) / stepX));
  const minRow = Math.max(0, Math.floor((bounds.minY - stepY / 4) / stepY));
  const maxRow = Math.min(spec.rows - 1, Math.floor((bounds.maxY + stepY / 4) / stepY));
  const maxStride = 2 ** Math.ceil(Math.log2(Math.max(spec.columns, spec.rows)));
  let stride = Math.min(maxStride, 2 ** Math.ceil(Math.log2(Math.max(1, spacing / (camera.scale * Math.min(stepX, stepY))))));
  const range = () => {
    const offset = Math.floor(stride / 2);
    const firstCol = offset + Math.ceil((minCol - offset) / stride) * stride;
    const firstRow = offset + Math.ceil((minRow - offset) / stride) * stride;
    const columns = Math.max(0, Math.floor((maxCol - firstCol) / stride) + 1);
    const rows = Math.max(0, Math.floor((maxRow - firstRow) / stride) + 1);
    return { firstCol, firstRow, count: columns * rows };
  };
  const capacity = ATLAS_LABEL_CANDIDATE_LIMIT - examinedCells;
  let lattice = range();
  while (lattice.count > capacity && stride < maxStride) { stride *= 2; lattice = range(); }
  for (let row = lattice.firstRow; row <= maxRow; row += stride) for (let col = lattice.firstCol; col <= maxCol; col += stride) {
    const cellId = row * spec.columns + col;
    if (cellId !== selectedCellId) inspect(cellId, false);
  }
  return { candidates, latticeStride: stride, examinedCells };
}

function validRect(rect: AtlasLabelRect): void {
  validPoint(rect);
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 0 || rect.height < 0
    || !Number.isFinite(rect.x + rect.width) || !Number.isFinite(rect.y + rect.height)) throw new RangeError('标签遮挡矩形无效。');
}
function pointCovered(point: CameraPoint, rect: AtlasLabelRect): boolean {
  return rect.width > 0 && rect.height > 0 && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}
function intersects(a: AtlasLabelRect, b: AtlasLabelRect, gap: number): boolean {
  return b.width > 0 && b.height > 0 && a.x < b.x + b.width + gap && a.x + a.width > b.x - gap && a.y < b.y + b.height + gap && a.y + a.height > b.y - gap;
}

/** Pure placement using real measured text boxes; no clamping to a false map location. */
export function layoutAtlasLabels(options: AtlasLabelLayoutOptions): AtlasPlacedLabel[] {
  const { candidates, measuredSizes, viewport, occlusionRects, maxLabels } = options;
  validSize(viewport);
  if (!Number.isSafeInteger(maxLabels) || maxLabels < 0 || maxLabels > ATLAS_LABEL_DISPLAY_LIMIT) throw new RangeError('地图标签显示上限无效。');
  if (!Array.isArray(candidates) || candidates.length > ATLAS_LABEL_CANDIDATE_LIMIT || !Array.isArray(occlusionRects)
    || !measuredSizes || typeof measuredSizes.get !== 'function') throw new RangeError('地图标签计划或实测尺寸无效。');
  const padding = options.paddingCss ?? 8, gap = options.gapCss ?? 4;
  if (![padding, gap].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('标签留白必须是有限非负数。');
  occlusionRects.forEach(validRect);
  const ids = new Set<number>(); let selections = 0;
  for (const candidate of candidates) {
    if (!candidate || !Number.isSafeInteger(candidate.cellId) || candidate.cellId < 0 || candidate.cellId > 0xffffffff || ids.has(candidate.cellId)
      || !Number.isSafeInteger(candidate.elevationMeters) || candidate.elevationMeters < -12000 || candidate.elevationMeters > 12000
      || !candidate.selected && candidate.elevationMeters < 0
      || typeof candidate.selected !== 'boolean' || typeof candidate.text !== 'string' || !candidate.text.length || candidate.text.length > 128) throw new RangeError('地块标签内容或身份无效。');
    ids.add(candidate.cellId); if (candidate.selected) selections++;
    validPoint(candidate.world); validPoint(candidate.screen);
    const measured = measuredSizes.get(candidate.cellId); if (!measured) throw new RangeError('地块标签缺少真实文字尺寸。'); validSize(measured);
  }
  if (selections > 1) throw new RangeError('地图标签只能有一个选中地块。');
  const denominator = Math.max(viewport.width, viewport.height);
  const distance = (candidate: AtlasLabelCandidate) => (candidate.screen.x / denominator - viewport.width / denominator / 2) ** 2 + (candidate.screen.y / denominator - viewport.height / denominator / 2) ** 2;
  const ordered = candidates.filter(candidate => onScreen(candidate.screen, viewport)
    && !occlusionRects.some(rect => pointCovered(candidate.screen, rect)))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || distance(a) - distance(b) || a.cellId - b.cellId);
  const placed: AtlasPlacedLabel[] = [], offset = Math.max(6, gap * 2);
  for (const candidate of ordered) {
    if (placed.length >= maxLabels) break;
    const { width, height } = measuredSizes.get(candidate.cellId)!, { x, y } = candidate.screen;
    const choices: AtlasLabelRect[] = [
      { x: x - width / 2, y: y - height - offset, width, height },
      { x: x - width / 2, y: y + offset, width, height },
      { x: x + offset, y: y - height / 2, width, height },
      { x: x - width - offset, y: y - height / 2, width, height },
    ];
    const box = choices.find(rect => rect.x >= padding && rect.y >= padding && rect.x + rect.width <= viewport.width - padding && rect.y + rect.height <= viewport.height - padding
      && !occlusionRects.some(blocker => intersects(rect, blocker, gap)) && !placed.some(label => intersects(rect, label.box, gap)));
    if (box) placed.push({ ...candidate, world: { ...candidate.world }, screen: { ...candidate.screen }, box });
  }
  return placed;
}
