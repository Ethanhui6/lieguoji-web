/** An independent additive kernel. The caller is the verified v4 adapter, not
 * an untrusted save decoder. Existing first-contour semantics stay unchanged. */
import { buildDetailCoastSurface, detailCellsIntersectingQuad } from '../detail-coast-geometry';
import { assertDetailCoastCellProtection } from '../detail-coast-locks';
import { sampleDetailCoastCoverage, sampleDetailCoastNode } from '../detail-coast-field';
import { detailCoastAffectedDisplayTiles, detailCoastKey, detailCoastOwnerLayout, type DetailCoastCellSurface, type DetailCoastField, type DetailCoastKey, type DetailCoastTile, type DetailCoastTiles } from '../detail-coast-types';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { generateDetailShape, type DetailShapeControl, type DetailShapeRecipe, type DetailShapeSummary } from './detail-shape';

const WORLD_Q = 4096 * 256, STEP_Q = 512, CELLS = 2048, TILE_Q = 64 * 256;
const CELL_AREA_2 = 2 * STEP_Q ** 2, WORLD_AREA_2 = 2 * WORLD_Q ** 2;
export interface DetailShapeAddBase {
  format: 'lieguoji-detail-shape-add-base'; version: 1; size: 128 | 256 | 512;
  centersQ: ArrayBuffer; elevationsMeters: ArrayBuffer; detailCoast: DetailCoastTiles;
  /** Complete locks derived from the verified document; row-major cell ids in
   * strictly increasing order. Native Uint32 ids, Uint8 flags, Int32 quad x/y.
   * An empty caller-provided list is NOT evidence that a document has no locks. */
  locks: { cellIds: ArrayBuffer; flags: ArrayBuffer; quadsQ: ArrayBuffer };
}
export interface DetailShapeAddSummary {
  beforeLandAreaTwiceQ2: number; landAreaTwiceQ2: number; seaAreaTwiceQ2: number;
  totalAreaTwiceQ2: number; addedLandAreaTwiceQ2: number;
  changedCoarseSamples: number; changedOwnerTiles: number; materializedOwnerTiles: number;
  auditedFineCells: number; protectedFineCellsCompared: number; sourceBytesCopied: number;
  generated: DetailShapeSummary;
  /** Coverage is inherited or sampled against the new component's target.
   * It is not a globally reinitialized distance to the final union shoreline. */
  coverageSemantics: 'preserved-components-with-audited-disjoint-splice';
}
export interface DetailShapeAddOutput {
  detailCoast: Map<DetailCoastKey, DetailCoastTile>; coarseElevations: Int32Array;
  sampleBaseElevation: (xQ: number, yQ: number) => number;
  changedCoarseIds: Uint32Array; changedOwnerKeys: DetailCoastKey[];
  affectedDisplayTiles: DetailCoastKey[]; summary: DetailShapeAddSummary;
}
function exact(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== names.length) throw new Error('追加大陆输入字段无效。');
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw new Error('追加大陆输入拒绝访问器。'); }
}
function buffer(value: unknown, bytes: number): ArrayBuffer {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || (value as ArrayBuffer).byteLength !== bytes) throw new Error('追加大陆需要精确长度的非共享缓冲区。');
  return ArrayBuffer.prototype.slice.call(value, 0) as ArrayBuffer;
}
function captureRecipe(recipe: DetailShapeRecipe): DetailShapeRecipe {
  exact(recipe, ['seed', 'pointsQ', 'coastRoughnessWorld', 'reliefMeters', 'shelfWidthWorld', 'islandChainCount', 'islandsPerChain']);
  if (!Array.isArray(recipe.pointsQ) || Object.getPrototypeOf(recipe.pointsQ) !== Array.prototype || recipe.pointsQ.length < 3 || recipe.pointsQ.length > 2048 || Reflect.ownKeys(recipe.pointsQ).length !== recipe.pointsQ.length + 1) throw new Error('追加大陆轮廓数组无效。');
  const pointsQ = [];
  for (let index = 0; index < recipe.pointsQ.length; index++) {
    const d = Object.getOwnPropertyDescriptor(recipe.pointsQ, String(index)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw new Error('追加轮廓拒绝空洞或访问器。');
    exact(d.value, ['xQ', 'yQ']); pointsQ.push({ xQ: d.value.xQ as number, yQ: d.value.yQ as number });
  }
  return { seed: recipe.seed, pointsQ, coastRoughnessWorld: recipe.coastRoughnessWorld, reliefMeters: recipe.reliefMeters, shelfWidthWorld: recipe.shelfWidthWorld, islandChainCount: recipe.islandChainCount, islandsPerChain: recipe.islandsPerChain };
}
function captureBase(base: DetailShapeAddBase) {
  exact(base, ['format', 'version', 'size', 'centersQ', 'elevationsMeters', 'detailCoast', 'locks']);
  if (base.format !== 'lieguoji-detail-shape-add-base' || base.version !== 1 || ![128, 256, 512].includes(base.size)) throw new Error('追加大陆只接受第四版已核验地理快照。');
  const total = base.size ** 2, centers = new Int32Array(buffer(base.centersQ, total * 8)), heights = new Int32Array(buffer(base.elevationsMeters, total * 4));
  exact(base.locks, ['cellIds', 'flags', 'quadsQ']);
  if (!base.locks.flags || Object.getPrototypeOf(base.locks.flags) !== ArrayBuffer.prototype || base.locks.flags.byteLength > total) throw new Error('追加大陆锁数量无效。');
  const count = base.locks.flags.byteLength, flags = new Uint8Array(buffer(base.locks.flags, count));
  const ids = new Uint32Array(buffer(base.locks.cellIds, count * 4)), quads = new Int32Array(buffer(base.locks.quadsQ, count * 32));
  const tiles = new Map<DetailCoastKey, DetailCoastTile>(); let bytes = centers.byteLength + heights.byteLength + ids.byteLength + flags.byteLength + quads.byteLength;
  if (!base.detailCoast || Object.getPrototypeOf(base.detailCoast) !== Map.prototype || Reflect.ownKeys(base.detailCoast).length || base.detailCoast.size > 4096) throw new Error('追加大陆细场集合无效。');
  // This verified-adapter boundary copies native bytes before the first await.
  // It deliberately does not enumerate millions of typed-array index keys;
  // the ordinary untrusted tile codec remains responsible for that envelope.
  for (const [key, tile] of Map.prototype.entries.call(base.detailCoast) as IterableIterator<[DetailCoastKey, DetailCoastTile]>) {
    const d = tile && Object.getOwnPropertyDescriptor(tile, 'mode'); if (!d || !Object.hasOwn(d, 'value')) throw new Error('追加细场拒绝 mode 访问器。');
    exact(tile, d.value === 'samples' ? ['format', 'version', 'bx', 'by', 'mode', 'coverageQ', 'elevationMeters'] : ['format', 'version', 'bx', 'by', 'mode']);
    if (tile.format !== 'lieguoji-detail-coast-tile' || tile.version !== 1 || tile.mode !== 'land' && tile.mode !== 'samples' || key !== detailCoastKey(tile.bx, tile.by)) throw new Error('追加细场身份无效。');
    const layout = detailCoastOwnerLayout(tile.bx, tile.by);
    if (tile.mode === 'land') tiles.set(key, { format: tile.format, version: 1, bx: tile.bx, by: tile.by, mode: 'land' });
    else {
      const copied = [tile.coverageQ, tile.elevationMeters].map(array => {
        if (!array || Object.getPrototypeOf(array) !== Int16Array.prototype || Object.getPrototypeOf(array.buffer) !== ArrayBuffer.prototype || array.byteOffset !== 0 || array.length !== layout.count || array.byteLength !== array.buffer.byteLength) throw new Error('追加细场必须是独占 native Int16Array。');
        return new Int16Array(buffer(array.buffer, layout.count * 2));
      });
      bytes += layout.count * 4;
      tiles.set(key, { format: tile.format, version: 1, bx: tile.bx, by: tile.by, mode: 'samples', coverageQ: copied[0], elevationMeters: copied[1] });
    }
  }
  return { size: base.size, total, centers, heights, tiles, flags, ids, quads, bytes };
}
function abort(control?: DetailShapeControl) { if (control?.signal?.aborted) throw new DOMException('追加大陆已取消。', 'AbortError'); }
async function checkpoint(control: DetailShapeControl | undefined, phase: string, done: number, total: number) {
  abort(control); control?.onProgress?.(phase, done, total); abort(control);
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  abort(control);
}
function sourceLand(tiles: DetailCoastTiles, column: number, row: number) {
  return sampleDetailCoastCoverage(tiles, column, row) >= 0 || sampleDetailCoastCoverage(tiles, column + 1, row) >= 0 || sampleDetailCoastCoverage(tiles, column, row + 1) >= 0 || sampleDetailCoastCoverage(tiles, column + 1, row + 1) >= 0;
}
function nearOldLand(tiles: DetailCoastTiles, x: number, y: number) {
  for (let ny = Math.max(0, y - 1); ny <= Math.min(CELLS, y + 1); ny++) for (let nx = Math.max(0, x - 1); nx <= Math.min(CELLS, x + 1); nx++) if (sampleDetailCoastCoverage(tiles, nx, ny) >= 0) return true;
  return false;
}
function nodeFlags(flags: Uint8Array, x: number, y: number) {
  let result = 0;
  for (let row = Math.max(0, y - 1); row <= Math.min(CELLS - 1, y); row++) for (let col = Math.max(0, x - 1); col <= Math.min(CELLS - 1, x); col++) result |= flags[row * CELLS + col];
  return result;
}
function geometry(cell: DetailCoastCellSurface) {
  const triangles = (pieces: DetailCoastCellSurface['land']) => pieces.map(t => t.map(v => [v.xQ, v.yQ]));
  return JSON.stringify([triangles(cell.land), triangles(cell.sea), cell.shore.map(s => [[s.a.xQ, s.a.yQ], [s.b.xQ, s.b.yQ]])]);
}
function elevation(cell: DetailCoastCellSurface) { return JSON.stringify([cell.land, cell.sea].map(pieces => pieces.map(t => t.map(v => [v.xQ, v.yQ, v.heightMeters])))); }
async function signsFor(tiles: DetailCoastTiles, control: DetailShapeControl | undefined) {
  const signs = new Int8Array(4096).fill(-1); let done = 0;
  for (const tile of tiles.values()) {
    if (tile.mode === 'land') signs[tile.by * 64 + tile.bx] = 1;
    else {
      let positive = false, negative = false;
      for (let slot = 0; slot < tile.coverageQ.length; slot++) {
        const c = tile.coverageQ[slot], h = tile.elevationMeters[slot];
        if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h >= 0 || c === 0 && h !== 0) throw new Error('追加细场样本或高度无效。');
        positive ||= c >= 0; negative ||= c < 0;
      }
      signs[tile.by * 64 + tile.bx] = positive && negative ? 0 : positive ? 1 : -1;
    }
    if (++done % 8 === 0) await checkpoint(control, 'classify-owned-tiles', done, tiles.size);
  }
  return signs;
}
function tileSign(signs: Int8Array, bx: number, by: number) {
  const id = by * 64 + bx, value = signs[id];
  return value && (!bx || signs[id - 1] === value) && (!by || signs[id - 64] === value) && (!bx || !by || signs[id - 65] === value) ? value : 0;
}

export async function generateDetailShapeAdd(input: { base: DetailShapeAddBase; recipe: DetailShapeRecipe }, control?: DetailShapeControl): Promise<DetailShapeAddOutput> {
  abort(control); exact(input, ['base', 'recipe']); const owned = captureBase(input.base), recipe = captureRecipe(input.recipe);
  const { size, total, centers, heights, tiles: before } = owned, batch = control?.batchWork ?? 256;
  if (!Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('追加大陆批次应为 64—2048。');
  await checkpoint(control, 'takeover-additive-world', owned.bytes, owned.bytes);
  const coarseStep = WORLD_Q / size, scratch = new Int32Array(total), elevationLocked = new Uint8Array(total), fineLocks = new Uint8Array(CELLS * CELLS);
  for (let id = 0; id < total; id++) {
    const x = id % size, y = Math.floor(id / size);
    if (centers[id * 2] <= x * coarseStep || centers[id * 2] >= (x + 1) * coarseStep || centers[id * 2 + 1] <= y * coarseStep || centers[id * 2 + 1] >= (y + 1) * coarseStep || heights[id] < -12000 || heights[id] > 12000) throw new Error('追加大陆粗地理样本无效。');
    scratch[id] = heights[id] < 0 ? heights[id] : -2000;
    if ((id + 1) % batch === 0) await checkpoint(control, 'prepare-new-component', id + 1, total);
  }
  let lockWork = 0;
  for (let index = 0; index < owned.ids.length; index++) {
    const id = owned.ids[index], flags = owned.flags[index];
    if (id >= total || index > 0 && id <= owned.ids[index - 1] || flags < 1 || flags > 3) throw new Error('追加大陆锁身份或顺序无效。');
    const quad = Array.from({ length: 4 }, (_, corner) => ({ xQ: owned.quads[index * 8 + corner * 2], yQ: owned.quads[index * 8 + corner * 2 + 1] }));
    for (const cell of detailCellsIntersectingQuad(quad)) {
      fineLocks[cell] |= flags;
      if (++lockWork % batch === 0) await checkpoint(control, 'cover-true-quad-locks', index, owned.ids.length);
    }
    if (flags & 2) elevationLocked[id] = 1;
  }
  await signsFor(before, control);
  const oldSampler = createDetailShapeBaseSampler(size, centers.buffer as ArrayBuffer, heights.buffer as ArrayBuffer), oldField = { tiles: before, sampleBaseElevation: oldSampler };
  const generated = await generateDetailShape({ base: { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer as ArrayBuffer, elevationsMeters: scratch.buffer as ArrayBuffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false }, recipe }, { ...control, onProgress: (phase, done, all) => control?.onProgress?.(`new-component:${phase}`, done, all) });
  const freshField = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
  const nextHeights = heights.slice(), changedCoarse: number[] = [], owners = new Uint8Array(4096), heightOwners = new Uint8Array(4096);
  for (const tile of generated.detailCoast.values()) owners[tile.by * 64 + tile.bx] = 1;
  for (let id = 0; id < total; id++) {
    if (!elevationLocked[id] && generated.coarseElevations[id] !== scratch[id]) {
      const xQ = centers[id * 2], yQ = centers[id * 2 + 1], x = Math.min(CELLS - 1, Math.floor(xQ / STEP_Q)), y = Math.min(CELLS - 1, Math.floor(yQ / STEP_Q));
      // Existing land (including a coast-containing source cell) keeps its
      // coarse control height too. Fine bytes alone cannot protect Hbase.
      if (!sourceLand(before, x, y) && generated.coarseElevations[id] !== heights[id]) {
        nextHeights[id] = generated.coarseElevations[id]; changedCoarse.push(id);
        const radius = 2.5 * coarseStep;
        // Include the west/north owner of a node exactly on a tile boundary.
        for (let by = Math.max(0, Math.floor((yQ - radius) / TILE_Q) - 1); by <= Math.min(63, Math.floor((yQ + radius) / TILE_Q)); by++) for (let bx = Math.max(0, Math.floor((xQ - radius) / TILE_Q) - 1); bx <= Math.min(63, Math.floor((xQ + radius) / TILE_Q)); bx++) owners[by * 64 + bx] = heightOwners[by * 64 + bx] = 1;
      }
    }
    if ((id + 1) % batch === 0) await checkpoint(control, 'merge-coarse-controls', id + 1, total);
  }
  const nextSampler = createDetailShapeBaseSampler(size, centers.buffer as ArrayBuffer, nextHeights.buffer as ArrayBuffer), next = new Map(before);
  const changedOwnerKeys: DetailCoastKey[] = [], dirtyDisplays = new Uint8Array(4096); let materializedOwnerTiles = 0, nodeWork = 0;
  const nodeTotal = owners.reduce((sum, active, tile) => sum + (active ? detailCoastOwnerLayout(tile % 64, Math.floor(tile / 64)).count : 0), 0);
  for (let tileId = 0; tileId < 4096; tileId++) if (owners[tileId]) {
    const bx = tileId % 64, by = Math.floor(tileId / 64), key = detailCoastKey(bx, by), layout = detailCoastOwnerLayout(bx, by);
    const previous = before.get(key), fresh = generated.detailCoast.get(key), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    let changed = false, materialized = false, allLand = true, allSea = true;
    for (let slot = 0; slot < layout.count; slot++) {
      const x = layout.startX + slot % layout.width, y = layout.startY + Math.floor(slot / layout.width), old = sampleDetailCoastNode(oldField, x, y);
      let coverage = old.coverageQ, height = old.heightMeters;
      if (fresh) {
        const newer = sampleDetailCoastNode(freshField, x, y), protectedLand = nearOldLand(before, x, y), flags = nodeFlags(fineLocks, x, y);
        if (newer.coverageQ >= 0 && protectedLand) throw new Error(`新大陆接触或重叠已有陆地（细节点 ${x},${y}）；请移开轮廓，原地图未改变。`);
        if (!protectedLand && newer.coverageQ > old.coverageQ) {
          coverage = newer.coverageQ;
          if (flags & 2) { if ((coverage >= 0) !== (old.coverageQ >= 0)) throw new Error('新大陆会改变高程锁保护的真实地表；原地图未改变。'); }
          else height = newer.heightMeters;
        }
      }
      const baseHeight = nextSampler(x * STEP_Q, y * STEP_Q), implicitLand = Math.max(0, Math.round(baseHeight)), implicitSea = Math.min(-1, Math.round(baseHeight));
      coverageQ[slot] = coverage; elevationMeters[slot] = height;
      changed ||= coverage !== old.coverageQ || height !== old.heightMeters;
      const oldWasImplicit = previous?.mode !== 'samples', implicitOldModeHeight = previous?.mode === 'land' ? implicitLand : implicitSea;
      if (oldWasImplicit && height !== implicitOldModeHeight) materialized = true;
      allLand &&= coverage === 32767 && height === implicitLand; allSea &&= coverage === -32767 && height === implicitSea;
      if (++nodeWork % batch === 0) await checkpoint(control, 'splice-and-preserve-old-height', nodeWork, nodeTotal);
    }
    if (changed || materialized && heightOwners[tileId]) {
      if (allSea) next.delete(key);
      else if (allLand) next.set(key, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' });
      else next.set(key, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters });
      changedOwnerKeys.push(key); if (!changed && materialized) materializedOwnerTiles++;
      for (const affected of detailCoastAffectedDisplayTiles(bx, by)) { const [, ax, ay] = affected.split(':').map(Number); dirtyDisplays[ay * 64 + ax] = 1; }
    }
  }
  const nextField: DetailCoastField = { tiles: next, sampleBaseElevation: nextSampler }, signs = await signsFor(next, control);
  let landArea = 0, seaArea = 0, addedArea = 0, auditedFineCells = 0, protectedFineCellsCompared = 0;
  for (let tileId = 0; tileId < 4096; tileId++) {
    const bx = tileId % 64, by = Math.floor(tileId / 64), sign = tileSign(signs, bx, by);
    if (sign && !dirtyDisplays[tileId]) { if (sign > 0) landArea += CELL_AREA_2 * 1024; else seaArea += CELL_AREA_2 * 1024; }
    else for (let row = 0; row < 32; row += 4) {
      const rect = { column: bx * 32, row: by * 32 + row, columns: 32, rows: 4 }, result = buildDetailCoastSurface(nextField, rect);
      landArea += result.landAreaTwiceQ2; seaArea += result.seaAreaTwiceQ2; auditedFineCells += 128;
      if (dirtyDisplays[tileId]) {
        const old = buildDetailCoastSurface(oldField, rect), fresh = buildDetailCoastSurface(freshField, rect);
        for (let index = 0; index < result.cells.length; index++) {
          const a = old.cells[index], b = fresh.cells[index], c = result.cells[index], oldLand = sourceLand(before, c.column, c.row), newLand = sourceLand(generated.detailCoast, c.column, c.row), flags = fineLocks[c.cellId];
          if (oldLand && newLand) throw new Error(`新大陆与已有陆地接触同一细格 #${c.cellId}；请移开轮廓，原地图未改变。`);
          if (oldLand && (geometry(a) !== geometry(c) || elevation(a) !== elevation(c))) throw new Error(`追加会改变已有陆地细片 #${c.cellId}；原地图未改变。`);
          if (newLand && geometry(b) !== geometry(c)) throw new Error(`新旧海岸距离带过近，不能保持新大陆细片 #${c.cellId}；请移开轮廓。`);
          if (!oldLand && !newLand && c.landAreaTwiceQ2 !== 0) throw new Error('追加产生了未请求的陆桥；原地图未改变。');
          if (flags) assertDetailCoastCellProtection(a, c, oldField, nextField, flags);
          if (flags) protectedFineCellsCompared++;
          addedArea += c.landAreaTwiceQ2 - a.landAreaTwiceQ2;
        }
      }
      await checkpoint(control, 'audit-additive-real-pieces', tileId * 8 + row / 4 + 1, 4096 * 8);
    }
    if ((tileId + 1) % 64 === 0) await checkpoint(control, 'audit-additive-world-area', tileId + 1, 4096);
  }
  if (landArea + seaArea !== WORLD_AREA_2 || !Number.isSafeInteger(addedArea) || addedArea < 2 * 16 * 256 ** 2) throw new Error('追加未产生足够的新陆地或面积不守恒；原地图未改变。');
  abort(control);
  return { detailCoast: next, coarseElevations: nextHeights, sampleBaseElevation: nextSampler, changedCoarseIds: Uint32Array.from(changedCoarse), changedOwnerKeys, affectedDisplayTiles: Array.from(dirtyDisplays, (value, tile) => value ? detailCoastKey(tile % 64, Math.floor(tile / 64)) : null).filter((key): key is DetailCoastKey => key !== null), summary: { beforeLandAreaTwiceQ2: landArea - addedArea, landAreaTwiceQ2: landArea, seaAreaTwiceQ2: seaArea, totalAreaTwiceQ2: WORLD_AREA_2, addedLandAreaTwiceQ2: addedArea, changedCoarseSamples: changedCoarse.length, changedOwnerTiles: changedOwnerKeys.length, materializedOwnerTiles, auditedFineCells, protectedFineCellsCompared, sourceBytesCopied: owned.bytes, generated: generated.summary, coverageSemantics: 'preserved-components-with-audited-disjoint-splice' } };
}
