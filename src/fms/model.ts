import { Delaunay } from 'd3-delaunay';
import { createTerrainTopology } from '../world/recovered-terrain/topology';
import type { AtlasControl } from '../world/model';
import { applyFmsPlaneBrush } from '../world/fms-native-brush';

export const FMS_SEA_LEVEL = 20;
export const FMS_DEFAULT_LAND_HEIGHT = 45;
export const FMS_MAX_POINTS = 50_000;
const MAX_STAMPS = 4096, MAX_OUTLINE_POINTS = 1024, MAX_SELECTION_VISITS = 2_000_000;
const MAX_HISTORY_CELLS = 250_000, MAX_HISTORY_STEPS = 100;
const EPSILON = 1e-8;
export type FmsPoint = [number, number];
export interface FmsDocument {
  format: 'lieguoji-fms-world'; version: 1; worldId: string; revision: number;
  width: number; height: number; points: FmsPoint[]; triangles: Uint32Array;
  neighbors: number[][]; elevations: Int32Array;
}
export interface FmsCellChange { readonly cell: number; readonly previous: number; readonly next: number }
export interface FmsEditPatch {
  readonly worldId: string; readonly baseRevision: number; readonly label: string;
  readonly changes: readonly FmsCellChange[];
}
export interface FmsBrushStamp { x: number; y: number; radius: number }
export interface FmsBrushEdit { tool: 'land' | 'sea'; stamps: readonly FmsBrushStamp[]; height?: number }
export type FmsModelErrorCode = 'invalid-document' | 'invalid-edit' | 'revision-conflict' | 'self-intersection' | 'outline-too-small' | 'work-limit';
export class FmsModelError extends Error {
  constructor(public readonly code: FmsModelErrorCode, message: string) { super(message); this.name = 'FmsModelError'; }
}
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const int32 = (value: unknown): value is number => integer(value, -2_147_483_648, 2_147_483_647);
const cross = (a: FmsPoint, b: FmsPoint, c: FmsPoint) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Checks explicit data only. Delaunay/Voronoi instances and caches are not save fields. */
export function assertFmsDocument(value: unknown): asserts value is FmsDocument {
  const fail = () => { throw new FmsModelError('invalid-document', '绘图文档无效、版本不兼容或地形数据损坏。'); };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  const doc = value as FmsDocument;
  const keys = ['format', 'version', 'worldId', 'revision', 'width', 'height', 'points', 'triangles', 'neighbors', 'elevations'];
  if (Object.keys(doc).length !== keys.length || Object.keys(doc).some(key => !keys.includes(key))
    || doc.format !== 'lieguoji-fms-world' || doc.version !== 1
    || typeof doc.worldId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc.worldId)
    || !integer(doc.revision, 0, Number.MAX_SAFE_INTEGER - 1) || !finite(doc.width) || doc.width < 1 || doc.width > 8192
    || !finite(doc.height) || doc.height < 1 || doc.height > 8192 || !Array.isArray(doc.points)
    || doc.points.length < 3 || doc.points.length > FMS_MAX_POINTS) fail();
  const count = doc.points.length;
  if (!(doc.elevations instanceof Int32Array) || doc.elevations.length !== count
    || !(doc.triangles instanceof Uint32Array) || doc.triangles.length < 3 || doc.triangles.length % 3 !== 0 || doc.triangles.length > count * 6
    || !Array.isArray(doc.neighbors) || doc.neighbors.length !== count) fail();
  const sites = new Set<string>();
  for (const point of doc.points) {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])
      || point[0] < 0 || point[0] > doc.width || point[1] < 0 || point[1] > doc.height) fail();
    const key = `${point[0]},${point[1]}`;
    if (sites.has(key)) fail();
    sites.add(key);
  }
  const adjacency = Array.from({ length: count }, () => new Set<number>());
  const triangles = new Set<string>();
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const a = doc.triangles[offset], b = doc.triangles[offset + 1], c = doc.triangles[offset + 2];
    if (a >= count || b >= count || c >= count || a === b || b === c || a === c || Math.abs(cross(doc.points[a], doc.points[b], doc.points[c])) <= EPSILON) fail();
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (triangles.has(key)) fail();
    triangles.add(key);
    adjacency[a].add(b).add(c); adjacency[b].add(a).add(c); adjacency[c].add(a).add(b);
  }
  for (let cell = 0; cell < count; cell += 1) {
    const neighbors = doc.neighbors[cell];
    if (!Array.isArray(neighbors) || neighbors.length === 0 || neighbors.length > 128 || neighbors.length !== adjacency[cell].size
      || new Set(neighbors).size !== neighbors.length || neighbors.some(id => !integer(id, 0, count - 1) || !adjacency[cell].has(id))) fail();
  }
}

export async function createFmsDocument(control?: AtlasControl): Promise<FmsDocument> {
  const topology = await createTerrainTopology('square-v1', control);
  control?.signal?.throwIfAborted();
  const document: FmsDocument = {
    format: 'lieguoji-fms-world', version: 1, worldId: crypto.randomUUID(), revision: 0,
    width: topology.width, height: topology.height, points: topology.points.map(point => [point[0], point[1]]), triangles: topology.triangles,
    neighbors: topology.neighbors.map(neighbors => [...neighbors]), elevations: new Int32Array(topology.points.length),
  };
  assertFmsDocument(document);
  return document;
}

interface GeometryCache {
  width: number; height: number; triangles: Uint32Array; neighbors: number[][];
  delaunay: Delaunay<FmsPoint>; voronoi: ReturnType<Delaunay<FmsPoint>['voronoi']>;
  polygons: Map<number, FmsPoint[]>;
}
// Document geometry is owned immutable data across revisions. Never serialize this cache.
const geometryCaches = new WeakMap<FmsPoint[], GeometryCache>();
function geometryFor(doc: FmsDocument): GeometryCache {
  const cached = geometryCaches.get(doc.points);
  if (cached && cached.width === doc.width && cached.height === doc.height && cached.triangles === doc.triangles && cached.neighbors === doc.neighbors) return cached;
  assertFmsDocument(doc);
  const delaunay = Delaunay.from(doc.points);
  const created = { width: doc.width, height: doc.height, triangles: doc.triangles, neighbors: doc.neighbors, delaunay,
    voronoi: delaunay.voronoi([0, 0, doc.width, doc.height]), polygons: new Map<number, FmsPoint[]>() };
  geometryCaches.set(doc.points, created);
  return created;
}
const insideWorld = (doc: FmsDocument, x: number, y: number) => x >= 0 && x <= doc.width && y >= 0 && y <= doc.height;

/** Web Voronoi nearest-site containment; not an equivalence claim about Unity colliders. */
export function pickFmsCell(doc: FmsDocument, x: number, y: number): number | null {
  if (!finite(x) || !finite(y)) throw new FmsModelError('invalid-edit', '绘图坐标无效。');
  if (!insideWorld(doc, x, y)) return null;
  return geometryFor(doc).delaunay.find(x, y);
}
function squaredSegmentDistance(x: number, y: number, a: FmsPoint, b: FmsPoint): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
  return (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2;
}
function onSegment(a: FmsPoint, b: FmsPoint, point: FmsPoint): boolean {
  return Math.abs(cross(a, b, point)) <= EPSILON && point[0] >= Math.min(a[0], b[0]) - EPSILON && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}
function insidePolygon(point: FmsPoint, polygon: readonly FmsPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function circleIntersectsPolygon(stamp: FmsBrushStamp, polygon: readonly FmsPoint[]): boolean {
  if (insidePolygon([stamp.x, stamp.y], polygon)) return true;
  for (let i = 0; i < polygon.length; i += 1) {
    if (squaredSegmentDistance(stamp.x, stamp.y, polygon[i], polygon[(i + 1) % polygon.length]) <= stamp.radius ** 2 + EPSILON) return true;
  }
  return false;
}
function stampSelection(doc: FmsDocument, stamp: FmsBrushStamp, selected: Set<number>, budget: { visits: number }): void {
  if (!insideWorld(doc, stamp.x, stamp.y)) return;
  const geometry = geometryFor(doc), center = geometry.delaunay.find(stamp.x, stamp.y);
  const queue = [center], seen = new Set(queue);
  for (let head = 0; head < queue.length; head += 1) {
    if (++budget.visits > MAX_SELECTION_VISITS) throw new FmsModelError('work-limit', '这笔绘制范围过大，请分成几笔再试。');
    const cell = queue[head];
    let polygon = geometry.polygons.get(cell);
    if (!polygon) { polygon = geometry.voronoi.cellPolygon(cell) ?? []; geometry.polygons.set(cell, polygon); }
    if (!circleIntersectsPolygon(stamp, polygon)) continue;
    selected.add(cell);
    // Use the same web Delaunay geometry that defines the Voronoi selection.
    for (const neighbor of geometry.delaunay.neighbors(cell)) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
  }
}
function targetHeight(height: number): number {
  if (!integer(height, FMS_SEA_LEVEL, 100)) throw new FmsModelError('invalid-edit', '陆地高度须为20至100之间的整数。');
  return height;
}
function prepareSelection(doc: FmsDocument, selected: Set<number>, tool: 'land' | 'sea', height: number, label: string): FmsEditPatch {
  const cells = [...selected].sort((a, b) => a - b), previous = cells.map(cell => doc.elevations[cell]);
  const next = applyFmsPlaneBrush(previous, height, tool === 'land' ? 'max' : 'erase');
  const changes = cells.flatMap((cell, index) => previous[index] === next[index] ? [] : [Object.freeze({ cell, previous: previous[index], next: next[index] })]);
  return Object.freeze({ worldId: doc.worldId, baseRevision: doc.revision, label, changes: Object.freeze(changes) });
}

/** A stroke unions its stamps before arithmetic. Repeated coverage never stacks strength. */
export function prepareFmsBrushEdit(doc: FmsDocument, edit: FmsBrushEdit): FmsEditPatch {
  if (!edit || !['land', 'sea'].includes(edit.tool) || !Array.isArray(edit.stamps) || edit.stamps.length > MAX_STAMPS) throw new FmsModelError('invalid-edit', '笔刷参数或笔划长度无效。');
  const height = targetHeight(edit.height ?? FMS_DEFAULT_LAND_HEIGHT);
  for (const stamp of edit.stamps) {
    if (!stamp || !finite(stamp.x) || !finite(stamp.y) || !finite(stamp.radius) || stamp.radius < 0.5 || stamp.radius > Math.max(doc.width, doc.height)) throw new FmsModelError('invalid-edit', '笔刷位置或半径无效。');
  }
  const selected = new Set<number>(), seen = new Set<string>(), budget = { visits: 0 };
  let interpolatedCount = 0;
  const add = (stamp: FmsBrushStamp) => {
    if (++interpolatedCount > MAX_STAMPS) throw new FmsModelError('work-limit', '这笔路径过长，请分成几笔再试。');
    const key = `${stamp.x},${stamp.y},${stamp.radius}`;
    if (seen.has(key) || selected.size === doc.points.length) return;
    seen.add(key); stampSelection(doc, stamp, selected, budget);
  };
  for (let i = 0; i < edit.stamps.length; i += 1) {
    const current = edit.stamps[i], previous = edit.stamps[i - 1];
    if (previous && insideWorld(doc, previous.x, previous.y) && insideWorld(doc, current.x, current.y)) {
      const steps = Math.ceil(Math.hypot(current.x - previous.x, current.y - previous.y) / (Math.min(previous.radius, current.radius) * 0.5));
      if (steps > MAX_STAMPS - interpolatedCount) throw new FmsModelError('work-limit', '这笔路径过长，请分成几笔再试。');
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        add({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t, radius: previous.radius + (current.radius - previous.radius) * t });
      }
    }
    add(current);
  }
  return prepareSelection(doc, selected, edit.tool, height, edit.tool === 'land' ? '绘制陆地' : '擦除为海洋');
}
function intersects(a: FmsPoint, b: FmsPoint, c: FmsPoint, d: FmsPoint): boolean {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  return (ac * ad < 0 && ca * cb < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Closed outlines select enclosed web sites, preserving one editable height array. */
export function prepareFmsOutlineEdit(doc: FmsDocument, input: readonly FmsPoint[], height = FMS_DEFAULT_LAND_HEIGHT): FmsEditPatch {
  targetHeight(height);
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_OUTLINE_POINTS) throw new FmsModelError('invalid-edit', '轮廓至少需要三个点，且不能超过1024个点。');
  const points: FmsPoint[] = [];
  for (const point of input) {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1]) || !insideWorld(doc, point[0], point[1])) throw new FmsModelError('invalid-edit', '请在地图范围内绘制完整轮廓。');
    const last = points[points.length - 1];
    if (!last || point[0] !== last[0] || point[1] !== last[1]) points.push([point[0], point[1]]);
  }
  if (points.length > 1 && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1]) points.pop();
  if (points.length < 3) throw new FmsModelError('outline-too-small', '轮廓没有围成陆地，请画出更完整的形状。');
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
    if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
    if (intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) throw new FmsModelError('self-intersection', '轮廓发生交叉，请撤回交叉线段后重新闭合。');
  }
  const area = Math.abs(points.reduce((sum, point, i) => sum + point[0] * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * point[1], 0)) / 2;
  if (area <= EPSILON) throw new FmsModelError('outline-too-small', '轮廓没有围成陆地，请画出更完整的形状。');
  geometryFor(doc);
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
  const selected = new Set<number>();
  doc.points.forEach((point, cell) => {
    if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY && insidePolygon(point, points)) selected.add(cell);
  });
  if (selected.size === 0) throw new FmsModelError('outline-too-small', '轮廓太小，尚未覆盖地形点，请稍微扩大。');
  return prepareSelection(doc, selected, 'land', height, '闭合大陆轮廓');
}

/** Applies an already prepared patch atomically. Preparing/discarding it changes nothing. */
export function commitFmsEdit(doc: FmsDocument, patch: FmsEditPatch): FmsDocument {
  if (!patch || patch.worldId !== doc.worldId || patch.baseRevision !== doc.revision) throw new FmsModelError('revision-conflict', '这笔预览已过期，请在当前地图上重新绘制。');
  if (!integer(doc.revision, 0, Number.MAX_SAFE_INTEGER - 2) || !Array.isArray(patch.changes) || patch.changes.length > doc.points.length || typeof patch.label !== 'string' || patch.label.length > 100) throw new FmsModelError('invalid-edit', '绘图变更无效。');
  const seen = new Set<number>();
  for (const change of patch.changes) {
    if (!change || !integer(change.cell, 0, doc.points.length - 1) || seen.has(change.cell) || !int32(change.previous) || !int32(change.next)) throw new FmsModelError('invalid-edit', '绘图变更包含无效地形点。');
    if (doc.elevations[change.cell] !== change.previous) throw new FmsModelError('revision-conflict', '地图已改变，这笔预览不能覆盖较新的修改。');
    seen.add(change.cell);
  }
  if (patch.changes.length === 0) return doc;
  const elevations = doc.elevations.slice();
  for (const { cell, next } of patch.changes) elevations[cell] = next;
  return { ...doc, revision: doc.revision + 1, elevations };
}

/** Per-session history only; document persistence is independently managed. */
export class FmsEditHistory {
  private current: FmsDocument;
  private past: FmsEditPatch[] = [];
  private future: FmsEditPatch[] = [];
  constructor(document: FmsDocument) { assertFmsDocument(document); this.current = document; }
  get document(): FmsDocument { return this.current; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  commit(patch: FmsEditPatch): FmsDocument {
    const next = commitFmsEdit(this.current, patch);
    if (next === this.current) return this.current;
    const owned = { ...patch, changes: patch.changes.map(change => ({ ...change })) };
    this.past.push(owned); this.future = []; this.current = next;
    let cells = this.past.reduce((total, entry) => total + entry.changes.length, 0);
    while (this.past.length > MAX_HISTORY_STEPS || cells > MAX_HISTORY_CELLS) cells -= this.past.shift()!.changes.length;
    return this.current;
  }
  undo(): FmsDocument {
    const patch = this.past.at(-1);
    if (!patch) return this.current;
    const next = commitFmsEdit(this.current, { ...patch, baseRevision: this.current.revision, changes: patch.changes.map(change => ({ cell: change.cell, previous: change.next, next: change.previous })) });
    this.past.pop(); this.future.push(patch); this.current = next;
    return next;
  }
  redo(): FmsDocument {
    const patch = this.future.at(-1);
    if (!patch) return this.current;
    const next = commitFmsEdit(this.current, { ...patch, baseRevision: this.current.revision });
    this.future.pop(); this.past.push(patch); this.current = next;
    return next;
  }
}
