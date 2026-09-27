/** Local fine-height kernel for a verified private format4 adapter. It never
 * writes coarse samples, coverage, geometry, locks or persistence metadata. */
import { detailCoastAffectedDisplayTiles, detailCoastKey, detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastTile, type DetailCoastTiles, type DetailCoastField, type DetailCoastPointQ } from '../detail-coast-types';
import { buildDetailCoastSurface, detailCellsIntersectingQuad, pickDetailCoastSurface, summarizeDetailCoast } from '../detail-coast-geometry';
import { sampleDetailCoastCoverage, sampleDetailCoastNode } from '../detail-coast-field';
import { assertDetailCoastCellProtection } from '../detail-coast-locks';
import type { DetailShapeControl } from './detail-shape';
import { createNaturalRelief, type NaturalReliefSummary } from './detail-natural-relief';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { buildDetailShapeDistanceIndex, DETAIL_DISTANCE_LIMIT_Q, DETAIL_DISTANCE_MAX_SEGMENTS } from './detail-shape-distance';
import { FIELD_Q, roundRatio, seedHash, smoothQ } from './seed';
import { quadMeasure } from './quality';

export interface DetailLocalReliefScope {
  kind: 'cell-rectangle'; column: number; row: number; columns: number; rows: number; transitionCells: number;
}
export interface DetailLocalReliefBase {
  format: 'lieguoji-detail-local-relief-base'; version: 1; size: 128 | 256 | 512;
  centersQ: ArrayBuffer; elevationsMeters: ArrayBuffer;
  /** Complete row-major actual convex coarse quads, 8 native Int32 values per
   * cell, NW NE SE SW. Produced from a verified shared-vertex document, never
   * nominal rectangles. These arrays alone do not authenticate a document. */
  quadsQ: ArrayBuffer; detailCoast: DetailCoastTiles;
  /** ALL locks from that same verified snapshot; strictly increasing native
   * Uint32 cell ids and corresponding native Uint8 flags (1, 2 or 3). */
  locks: { cellIds: ArrayBuffer; flags: ArrayBuffer };
}
export interface DetailLocalReliefSummary {
  changedFineNodeCount: number; raisedFineNodeCount: number; loweredFineNodeCount: number;
  changedFineTileCount: number; materializedOwnerTiles: number; changedCoarseSamples: 0;
  landAreaTwiceQ2: number; seaAreaTwiceQ2: number; totalAreaTwiceQ2: number;
  /** True extrema over changed nodes only; NOT global field extrema. */
  changedMinimumElevationMeters: number; changedMaximumElevationMeters: number;
  selectedFineCells: number; eligibleFineCells: number; protectedFineCells: number;
  auditedFineCells: number; sourceBytesCopied: number; targetCoastSegments: number;
  generated: NaturalReliefSummary;
  coverageSemantics: 'exact-existing-node-coverage';
}
export interface DetailLocalReliefOutput {
  detailCoast: Map<DetailCoastKey, DetailCoastTile>;
  changedOwnerKeys: DetailCoastKey[]; affectedDisplayTiles: DetailCoastKey[];
  summary: DetailLocalReliefSummary;
}
export interface DetailLocalReliefInput {
  base: DetailLocalReliefBase; seed: string; reliefMeters: number; scope: DetailLocalReliefScope;
}
export type DetailLocalReliefControl = DetailShapeControl;

const WORLD_Q = 4096 * 256, STEP_Q = 512, CELLS = 2048;
function exact(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== names.length) throw new Error('局部山地输入字段无效。');
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw new Error('局部山地输入拒绝访问器。'); }
}
function buffer(value: unknown, bytes: number): ArrayBuffer {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || (value as ArrayBuffer).byteLength !== bytes) throw new Error('局部山地需要精确长度的非共享缓冲区。');
  return ArrayBuffer.prototype.slice.call(value, 0) as ArrayBuffer;
}
function capture(input: DetailLocalReliefInput) {
  exact(input, ['base', 'seed', 'reliefMeters', 'scope']);
  if (typeof input.seed !== 'string' || !input.seed.trim() || input.seed.length > 120 || !Number.isInteger(input.reliefMeters) || input.reliefMeters < 200 || input.reliefMeters > 6000) throw new Error('局部山地种子或起伏参数无效。');
  const raw = input.base;
  exact(raw, ['format', 'version', 'size', 'centersQ', 'elevationsMeters', 'quadsQ', 'detailCoast', 'locks']);
  if (raw.format !== 'lieguoji-detail-local-relief-base' || raw.version !== 1 || ![128, 256, 512].includes(raw.size)) throw new Error('局部山地只接受第四版已核验地理快照。');
  const scope = input.scope;
  exact(scope, ['kind', 'column', 'row', 'columns', 'rows', 'transitionCells']);
  if (scope.kind !== 'cell-rectangle' || ![scope.column, scope.row, scope.columns, scope.rows, scope.transitionCells].every(Number.isInteger)
    || scope.column < 0 || scope.row < 0 || scope.columns < 3 || scope.rows < 3 || scope.column + scope.columns > raw.size || scope.row + scope.rows > raw.size
    || scope.transitionCells < 1 || scope.transitionCells > Math.min(16, Math.floor((Math.min(scope.columns, scope.rows) - 1) / 2))) throw new Error('局部山地选区或过渡带无效；至少需要三行三列及一格过渡。');
  const total = raw.size ** 2, centers = new Int32Array(buffer(raw.centersQ, total * 8)), heights = new Int32Array(buffer(raw.elevationsMeters, total * 4)), quads = new Int32Array(buffer(raw.quadsQ, total * 32));
  exact(raw.locks, ['cellIds', 'flags']);
  if (!raw.locks.flags || Object.getPrototypeOf(raw.locks.flags) !== ArrayBuffer.prototype || raw.locks.flags.byteLength > total) throw new Error('局部山地锁数量无效。');
  const count = raw.locks.flags.byteLength, ids = new Uint32Array(buffer(raw.locks.cellIds, count * 4)), flags = new Uint8Array(buffer(raw.locks.flags, count));
  for (let i = 0; i < count; i++) if (ids[i] >= total || i > 0 && ids[i] <= ids[i - 1] || flags[i] < 1 || flags[i] > 3) throw new Error('局部山地锁必须完整、唯一有序且仅含已知锁位。');
  const tiles = new Map<DetailCoastKey, DetailCoastTile>();
  let bytes = centers.byteLength + heights.byteLength + quads.byteLength + ids.byteLength + flags.byteLength;
  if (!raw.detailCoast || Object.getPrototypeOf(raw.detailCoast) !== Map.prototype || Reflect.ownKeys(raw.detailCoast).length || raw.detailCoast.size > 4096) throw new Error('局部山地细场集合无效。');
  // Trusted adapter ingress, not the untrusted save codec. Copy every native
  // buffer synchronously: caller mutation at ANY later progress/await is inert.
  for (const [key, tile] of Map.prototype.entries.call(raw.detailCoast) as IterableIterator<[DetailCoastKey, DetailCoastTile]>) {
    const d = tile && Object.getOwnPropertyDescriptor(tile, 'mode'); if (!d || !Object.hasOwn(d, 'value')) throw new Error('局部细场拒绝mode访问器。');
    exact(tile, d.value === 'samples' ? ['format', 'version', 'bx', 'by', 'mode', 'coverageQ', 'elevationMeters'] : ['format', 'version', 'bx', 'by', 'mode']);
    if (tile.format !== 'lieguoji-detail-coast-tile' || tile.version !== 1 || tile.mode !== 'land' && tile.mode !== 'samples' || key !== detailCoastKey(tile.bx, tile.by)) throw new Error('局部细场身份无效。');
    if (tile.mode === 'land') tiles.set(key, { format: tile.format, version: 1, bx: tile.bx, by: tile.by, mode: 'land' });
    else {
      const layout = detailCoastOwnerLayout(tile.bx, tile.by), values = [tile.coverageQ, tile.elevationMeters].map(array => {
        if (!array || Object.getPrototypeOf(array) !== Int16Array.prototype || Object.getPrototypeOf(array.buffer) !== ArrayBuffer.prototype || array.byteOffset !== 0 || array.length !== layout.count || array.byteLength !== array.buffer.byteLength) throw new Error('局部细场需要独占native Int16Array。');
        return new Int16Array(buffer(array.buffer, layout.count * 2));
      });
      bytes += layout.count * 4;
      tiles.set(key, { format: tile.format, version: 1, bx: tile.bx, by: tile.by, mode: 'samples', coverageQ: values[0], elevationMeters: values[1] });
    }
  }
  return { size: raw.size, total, centers, heights, quads, ids, flags, tiles, bytes, scope: { ...scope }, seed: input.seed, relief: input.reliefMeters };
}
type Owned = ReturnType<typeof capture>;
function abort(control?: DetailShapeControl) { if (control?.signal?.aborted) throw new DOMException('局部山地已取消。', 'AbortError'); }
async function checkpoint(control: DetailShapeControl | undefined, phase: string, done: number, total: number) {
  abort(control); control?.onProgress?.(phase, done, total); abort(control);
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  abort(control);
}
function quad(owned: Owned, id: number): DetailCoastPointQ[] {
  return [0, 2, 4, 6].map(offset => ({ xQ: owned.quads[id * 8 + offset], yQ: owned.quads[id * 8 + offset + 1] }));
}
function selected(owned: Owned, id: number) {
  const x = id % owned.size, y = Math.floor(id / owned.size), r = owned.scope;
  return x >= r.column && x < r.column + r.columns && y >= r.row && y < r.row + r.rows;
}
interface Protection {
  left: number; top: number; width: number; height: number;
  eligible: Uint8Array; locks: Uint8Array; distance: Uint16Array;
  selectedCount: number; eligibleCount: number; protectedCount: number;
}
function slotAt(mask: Protection, x: number, y: number) {
  return x >= mask.left && x < mask.left + mask.width && y >= mask.top && y < mask.top + mask.height ? (y - mask.top) * mask.width + x - mask.left : -1;
}
/** Shared nodes may change only when EVERY existing incident fine cell is
 * contained in the conservative actual-quad selection and elevation-unlocked. */
function nodeDistance(mask: Protection, x: number, y: number) {
  let distance = 65535;
  for (let y2 = Math.max(0, y - 1); y2 <= Math.min(CELLS - 1, y); y2++) for (let x2 = Math.max(0, x - 1); x2 <= Math.min(CELLS - 1, x); x2++) {
    const slot = slotAt(mask, x2, y2); if (slot < 0 || !mask.eligible[slot]) return 0;
    distance = Math.min(distance, mask.distance[slot]);
  }
  return Math.max(0, distance - 1);
}
async function protection(owned: Owned, batch: number, control?: DetailShapeControl): Promise<Protection> {
  let minX = WORLD_Q, minY = WORLD_Q, maxX = 0, maxY = 0;
  for (let id = 0; id < owned.total; id++) {
    const points = quad(owned, id), measured = quadMeasure(points.map(p => [p.xQ, p.yQ]));
    if (points.some(p => p.xQ < 0 || p.yQ < 0 || p.xQ > WORLD_Q || p.yQ > WORLD_Q) || measured.xQ !== owned.centers[id * 2] || measured.yQ !== owned.centers[id * 2 + 1]) throw new Error('局部山地必须使用实际凸quad及其真实Q8重心。');
    const index = id * 8, x = id % owned.size, y = Math.floor(id / owned.size);
    if (x > 0 && (owned.quads[index] !== owned.quads[index - 6] || owned.quads[index + 1] !== owned.quads[index - 5] || owned.quads[index + 6] !== owned.quads[index - 4] || owned.quads[index + 7] !== owned.quads[index - 3])) throw new Error('局部山地实际quad未共享东西边。');
    const north = index - owned.size * 8;
    if (y > 0 && (owned.quads[index] !== owned.quads[north + 6] || owned.quads[index + 1] !== owned.quads[north + 7] || owned.quads[index + 2] !== owned.quads[north + 4] || owned.quads[index + 3] !== owned.quads[north + 5])) throw new Error('局部山地实际quad未共享南北边。');
    if (selected(owned, id)) for (const p of points) { minX = Math.min(minX, p.xQ); minY = Math.min(minY, p.yQ); maxX = Math.max(maxX, p.xQ); maxY = Math.max(maxY, p.yQ); }
    if ((id + 1) % batch === 0) await checkpoint(control, 'validate-local-quads', id + 1, owned.total);
  }
  const left = Math.max(0, Math.ceil(minX / STEP_Q) - 1), top = Math.max(0, Math.ceil(minY / STEP_Q) - 1);
  const right = Math.min(CELLS - 1, Math.floor(maxX / STEP_Q)), bottom = Math.min(CELLS - 1, Math.floor(maxY / STEP_Q));
  const width = right - left + 1, height = bottom - top + 1;
  const mask: Protection = { left, top, width, height, eligible: new Uint8Array(width * height), locks: new Uint8Array(width * height), distance: new Uint16Array(width * height), selectedCount: 0, eligibleCount: 0, protectedCount: 0 };
  let work = 0;
  for (let row = owned.scope.row; row < owned.scope.row + owned.scope.rows; row++) for (let col = owned.scope.column; col < owned.scope.column + owned.scope.columns; col++) {
    const covered = detailCellsIntersectingQuad(quad(owned, row * owned.size + col));
    for (const id of covered) { const slot = slotAt(mask, id % CELLS, Math.floor(id / CELLS)); if (slot >= 0 && !mask.eligible[slot]) { mask.eligible[slot] = 1; mask.selectedCount++; } }
    work += covered.length + 1;
    if (work >= batch) { await checkpoint(control, 'cover-actual-selection', row * owned.size + col, owned.total); work = 0; }
  }
  // Subtract every touching UNSELECTED actual quad, not nominal coordinates or
  // a centroid-only test. Thus no selected-edge sliver leaks into its neighbour.
  for (let id = 0; id < owned.total; id++) {
    if (!selected(owned, id)) {
      const points = quad(owned, id);
      if (!points.every(p => p.xQ < left * STEP_Q) && !points.every(p => p.xQ > (right + 1) * STEP_Q) && !points.every(p => p.yQ < top * STEP_Q) && !points.every(p => p.yQ > (bottom + 1) * STEP_Q)) {
        const covered = detailCellsIntersectingQuad(points);
        for (const fine of covered) { const slot = slotAt(mask, fine % CELLS, Math.floor(fine / CELLS)); if (slot >= 0) mask.eligible[slot] = 0; }
        work += covered.length;
      }
    }
    if (++work >= batch) { await checkpoint(control, 'exclude-outside-selection', id + 1, owned.total); work = 0; }
  }
  for (let index = 0; index < owned.ids.length; index++) {
    const points = quad(owned, owned.ids[index]);
    if (!points.every(p => p.xQ < left * STEP_Q) && !points.every(p => p.xQ > (right + 1) * STEP_Q) && !points.every(p => p.yQ < top * STEP_Q) && !points.every(p => p.yQ > (bottom + 1) * STEP_Q)) {
      const covered = detailCellsIntersectingQuad(points);
      for (const fine of covered) { const slot = slotAt(mask, fine % CELLS, Math.floor(fine / CELLS)); if (slot >= 0) { mask.locks[slot] |= owned.flags[index]; if (owned.flags[index] & 2) mask.eligible[slot] = 0; } }
      work += covered.length;
    }
    if (++work >= batch) { await checkpoint(control, 'protect-actual-height-locks', index + 1, owned.ids.length); work = 0; }
  }
  // Exact Manhattan distance to excluded fine cells in this mask. Two raster
  // passes bound memory; this is an edit transition, NEVER a coastal distance.
  const cap = Math.ceil(owned.scope.transitionCells * (4096 / owned.size) / 2) + 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (mask.eligible[i]) { mask.distance[i] = Math.min(cap, x ? mask.distance[i - 1] + 1 : 1, y ? mask.distance[i - width] + 1 : 1); mask.eligibleCount++; }
    if (mask.locks[i]) mask.protectedCount++;
    if ((i + 1) % batch === 0) await checkpoint(control, 'blend-edit-boundary-forward', i + 1, mask.eligible.length);
  }
  for (let i = mask.eligible.length - 1; i >= 0; i--) {
    if (mask.eligible[i]) mask.distance[i] = Math.min(mask.distance[i], i % width < width - 1 ? mask.distance[i + 1] + 1 : 1, i < mask.eligible.length - width ? mask.distance[i + width] + 1 : 1);
    if ((mask.eligible.length - i) % batch === 0) await checkpoint(control, 'blend-edit-boundary-backward', mask.eligible.length - i, mask.eligible.length);
  }
  if (!mask.eligibleCount) throw new Error('选区没有未锁定的可编辑内部区域。');
  return mask;
}

async function coastline(owned: Owned, field: DetailCoastField, mask: Protection, batch: number, control?: DetailShapeControl) {
  const classes = new Int8Array(4096).fill(-1); let done = 0;
  for (const tile of owned.tiles.values()) {
    let positive = tile.mode === 'land', negative = false, zero = false;
    if (tile.mode === 'samples') for (let slot = 0; slot < tile.coverageQ.length; slot++) {
      const c = tile.coverageQ[slot], h = tile.elevationMeters[slot];
      if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h > -1 || c === 0 && h !== 0) throw new Error('局部山地原始细样本无效。');
      positive ||= c > 0; negative ||= c < 0; zero ||= c === 0;
    }
    classes[tile.by * 64 + tile.bx] = zero || positive && negative ? 0 : positive ? 1 : -1;
    if (++done % 16 === 0) await checkpoint(control, 'classify-local-coast', done, owned.tiles.size);
  }
  const halo = Math.ceil(DETAIL_DISTANCE_LIMIT_Q / STEP_Q) + 2;
  const left = Math.max(0, Math.floor((mask.left - halo) / 32)), right = Math.min(63, Math.floor((mask.left + mask.width + halo) / 32));
  const top = Math.max(0, Math.floor((mask.top - halo) / 32)), bottom = Math.min(63, Math.floor((mask.top + mask.height + halo) / 32));
  const coordinates: number[] = []; done = 0;
  for (let by = top; by <= bottom; by++) for (let bx = left; bx <= right; bx++) {
    const id = by * 64 + bx, sign = classes[id];
    const uniform = sign !== 0 && (!bx || classes[id - 1] === sign) && (!by || classes[id - 64] === sign) && (!bx || !by || classes[id - 65] === sign);
    if (!uniform) {
      // Only coverage determines shoreline; this avoids needless Hbase queries
      // for sea/land heights that the distance builder never consumes.
      const surface = buildDetailCoastSurface({ tiles: field.tiles, sampleBaseElevation: () => 0 }, { column: bx * 32, row: by * 32, columns: 32, rows: 32 });
      for (const cell of surface.cells) for (const segment of cell.shore) {
        if (coordinates.length / 4 >= DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error('选区附近真实岸线超过局部山地距离预算。');
        coordinates.push(segment.a.xQ, segment.a.yQ, segment.b.xQ, segment.b.yQ);
      }
    }
    await checkpoint(control, 'read-existing-quantized-coast', ++done, (right - left + 1) * (bottom - top + 1));
  }
  const index = await buildDetailShapeDistanceIndex({ coordinates: new Uint32Array(coordinates).buffer, segmentCount: coordinates.length / 4 }, { ...control, batchWork: batch, onProgress: (phase, completed, total) => control?.onProgress?.(`existing-coast:${phase}`, completed, total) });
  return index;
}

export async function generateLocalDetailRelief(input: DetailLocalReliefInput, control?: DetailLocalReliefControl): Promise<DetailLocalReliefOutput> {
  abort(control); const owned = capture(input), batch = control?.batchWork ?? 1024;
  if (!Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('局部山地批次应为64—2048个实际工作单元。');
  await checkpoint(control, 'takeover-local-relief', owned.bytes, owned.bytes);
  const sampleBaseElevation = createDetailShapeBaseSampler(owned.size, owned.centers.buffer as ArrayBuffer, owned.heights.buffer as ArrayBuffer);
  const before: DetailCoastField = { tiles: owned.tiles, sampleBaseElevation }, mask = await protection(owned, batch, control);
  const distance = await coastline(owned, before, mask, batch, control);
  const land = new Uint8Array(owned.total), coastDistanceQ = new Uint16Array(owned.total);
  const pointAllowed = (xQ: number, yQ: number) => {
    if (!Number.isInteger(xQ) || !Number.isInteger(yQ) || xQ < 0 || yQ < 0 || xQ > WORLD_Q || yQ > WORLD_Q) return false;
    const x = Math.min(CELLS - 1, Math.floor(xQ / STEP_Q)), y = Math.min(CELLS - 1, Math.floor(yQ / STEP_Q)), slot = slotAt(mask, x, y);
    return slot >= 0 && mask.eligible[slot] === 1 && mask.distance[slot] > 1 && pickDetailCoastSurface(before, { x: xQ / 256, y: yQ / 256 })?.land === true;
  };
  let anchorCount = 0, minAnchorX = WORLD_Q, minAnchorY = WORLD_Q, maxAnchorX = 0, maxAnchorY = 0;
  for (let id = 0; id < owned.total; id++) {
    const xQ = owned.centers[id * 2], yQ = owned.centers[id * 2 + 1];
    if (selected(owned, id) && pointAllowed(xQ, yQ)) {
      land[id] = 1; coastDistanceQ[id] = distance.sample(xQ, yQ, 1).distanceQ;
      if (coastDistanceQ[id] >= Math.min(48 * 256, 2 * WORLD_Q / owned.size)) {
        anchorCount++; minAnchorX = Math.min(minAnchorX, xQ); minAnchorY = Math.min(minAnchorY, yQ); maxAnchorX = Math.max(maxAnchorX, xQ); maxAnchorY = Math.max(maxAnchorY, yQ);
      }
    }
    if ((id + 1) % batch === 0) await checkpoint(control, 'select-real-land-anchors', id + 1, owned.total);
  }
  const spanX = maxAnchorX - minAnchorX, spanY = maxAnchorY - minAnchorY, coarseStep = WORLD_Q / owned.size;
  // The reused profile has a four-coarse-step minimum ridge width. Do not
  // squeeze that profile into a tiny patch and call a lowland speck a mountain.
  if (anchorCount < 3 || Math.max(spanX, spanY) < 4 * coarseStep || Math.min(spanX, spanY) < 2 * coarseStep) throw new Error('可编辑内陆过窄或被锁分割，真实山脉锚点范围不足。');
  const relief = await createNaturalRelief({ seed: seedHash(owned.seed), size: owned.size, centersQ: owned.centers, land, coastDistanceQ,
    reliefMeters: owned.relief, shelfWidthWorld: 64, isLand: pointAllowed }, batch, control);
  if (!relief.ridges.some(ridge => ridge.peakQ > 0)) throw new Error('可编辑内陆过窄或被锁分割，无法形成真实山脉；请扩大选区或调整保护区。');
  const result = new Map(owned.tiles), changedOwnerKeys: DetailCoastKey[] = [], affected = new Set<DetailCoastKey>();
  let changed = 0, raised = 0, lowered = 0, materialized = 0, minChanged = 12000, maxChanged = -12000, evaluated = 0;
  const transition = owned.scope.transitionCells * (4096 / owned.size) / 2;
  const bx0 = Math.max(0, Math.floor((mask.left - 1) / 32)), bx1 = Math.min(63, Math.floor((mask.left + mask.width) / 32));
  const by0 = Math.max(0, Math.floor((mask.top - 1) / 32)), by1 = Math.min(63, Math.floor((mask.top + mask.height) / 32));
  let totalNodes = 0;
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) totalNodes += detailCoastOwnerLayout(bx, by).count;
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    const key = detailCoastKey(bx, by), original = owned.tiles.get(key), layout = detailCoastOwnerLayout(bx, by);
    let next: Extract<DetailCoastTile, { mode: 'samples' }> | undefined;
    for (let slot = 0; slot < layout.count; slot++) {
      const x = layout.startX + slot % layout.width, y = layout.startY + Math.floor(slot / layout.width), edgeDistance = nodeDistance(mask, x, y);
      if (edgeDistance && sampleDetailCoastCoverage(owned.tiles, x, y) > 0) {
        const old = sampleDetailCoastNode(before, x, y), target = relief.physicalHeight(old.xQ, old.yQ, true, distance.sample(old.xQ, old.yQ, 1).distanceQ, old.heightMeters);
        const weight = smoothQ(Math.min(FIELD_Q, roundRatio(edgeDistance * FIELD_Q, transition)));
        const height = Math.max(0, Math.min(12000, old.heightMeters + roundRatio((target - old.heightMeters) * weight, FIELD_Q)));
        if (height !== old.heightMeters) {
          if (!next) {
            const coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
            for (let index = 0; index < layout.count; index++) { const node = sampleDetailCoastNode(before, layout.startX + index % layout.width, layout.startY + Math.floor(index / layout.width)); coverageQ[index] = node.coverageQ; elevationMeters[index] = node.heightMeters; }
            next = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters };
            if (original?.mode === 'land') materialized++;
          }
          next.elevationMeters[slot] = height; changed++; if (height > old.heightMeters) raised++; else lowered++;
          minChanged = Math.min(minChanged, height); maxChanged = Math.max(maxChanged, height);
        }
      }
      if (++evaluated % batch === 0) await checkpoint(control, 'write-local-fine-height', evaluated, totalNodes);
    }
    if (next) { result.set(key, next); changedOwnerKeys.push(key); for (const display of detailCoastAffectedDisplayTiles(bx, by)) affected.add(display); }
  }
  await checkpoint(control, 'write-local-fine-height', evaluated, totalNodes);
  if (!changed) throw new Error('选区没有可改变的未锁定陆地高程，原图保持不变。');
  const after: DetailCoastField = { tiles: result, sampleBaseElevation }; let audited = 0;
  // Exact source-node comparison includes unchanged slots in materialized tiles.
  // Unchanged owner tiles retain private captured bytes; Hbase never changes.
  for (const key of changedOwnerKeys) {
    const tile = result.get(key)!, layout = detailCoastOwnerLayout(tile.bx, tile.by);
    for (let slot = 0; slot < layout.count; slot++) {
      const x = layout.startX + slot % layout.width, y = layout.startY + Math.floor(slot / layout.width), a = sampleDetailCoastNode(before, x, y), b = sampleDetailCoastNode(after, x, y);
      if (a.coverageQ !== b.coverageQ || a.heightMeters !== b.heightMeters && (a.coverageQ <= 0 || !nodeDistance(mask, x, y))) throw new Error('局部山地候选改变了覆盖、海岸零点、海床、非选区或保护节点。');
    }
    await checkpoint(control, 'audit-local-owner-nodes', ++audited, changedOwnerKeys.length);
  }
  const affectedDisplayTiles = [...affected].sort((a, b) => { const [, ax, ay] = a.split(':').map(Number), [, bx, by] = b.split(':').map(Number); return ay - by || ax - bx; }); audited = 0;
  const seaSignature = (cells: ReturnType<typeof buildDetailCoastSurface>['cells'][number]) => JSON.stringify(cells.sea.map(tri => tri.map(v => [v.xQ, v.yQ, v.heightMeters])));
  for (const key of affectedDisplayTiles) {
    const [, bx, by] = key.split(':').map(Number), rectangle = { column: bx * 32, row: by * 32, columns: 32, rows: 32 };
    const a = buildDetailCoastSurface(before, rectangle), b = buildDetailCoastSurface(after, rectangle);
    for (let slot = 0; slot < a.cells.length; slot++) {
      const old = a.cells[slot], next = b.cells[slot], index = slotAt(mask, old.column, old.row), flags = index < 0 || !mask.eligible[index] ? 3 : 1 | mask.locks[index];
      assertDetailCoastCellProtection(old, next, before, after, flags);
      if (seaSignature(old) !== seaSignature(next)) throw new Error('局部山地改变了真实海床片高度。');
      audited++;
    }
    await checkpoint(control, 'audit-local-real-pieces', audited, affectedDisplayTiles.length * 1024);
  }
  const areas = await summarizeDetailCoast(owned.tiles, { signal: control?.signal, yieldControl: control?.yieldControl, onProgress: (done, total) => control?.onProgress?.('measure-preserved-world-area', done, total) });
  abort(control);
  return { detailCoast: result, changedOwnerKeys, affectedDisplayTiles, summary: {
    changedFineNodeCount: changed, raisedFineNodeCount: raised, loweredFineNodeCount: lowered, changedFineTileCount: changedOwnerKeys.length,
    materializedOwnerTiles: materialized, changedCoarseSamples: 0, landAreaTwiceQ2: areas.landAreaTwiceQ2, seaAreaTwiceQ2: areas.seaAreaTwiceQ2, totalAreaTwiceQ2: areas.totalAreaTwiceQ2,
    changedMinimumElevationMeters: minChanged, changedMaximumElevationMeters: maxChanged,
    selectedFineCells: mask.selectedCount, eligibleFineCells: mask.eligibleCount, protectedFineCells: mask.protectedCount, auditedFineCells: audited,
    sourceBytesCopied: owned.bytes, targetCoastSegments: distance.segmentCount, generated: relief.summary, coverageSemantics: 'exact-existing-node-coverage',
  } };
}
