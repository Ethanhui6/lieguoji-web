import { assertFmsDocument, commitFmsEdit, FMS_SEA_LEVEL, FmsModelError, type FmsDocument, type FmsEditPatch } from './model';
import { generateTerrainResearch, validSeedTerrainRequest, type SeedTerrainTemplate } from '../world/seed-terrain';
import { createTerrainTopology } from '../world/recovered-terrain/topology';
import type { AtlasControl } from '../world/model';
import { generateRecoveredHeights } from '../world/recovered-terrain/engine';
import { originalGridFor, originalGridIdOf } from './original/original-document';

/** square-v1: the reviewed research grid. original-grid: the original's own
 * BasicMap sites with the same recovered templates (see original/). */
export type FmsFullMapAlgorithm = 'recovered-height-square-v1' | 'recovered-height-original-grid-v1';
export async function fmsFullMapAlgorithm(doc: Pick<FmsDocument, 'width' | 'height' | 'points'>): Promise<FmsFullMapAlgorithm> {
  return await originalGridIdOf(doc) ? 'recovered-height-original-grid-v1' : 'recovered-height-square-v1';
}
export interface FmsFullMapOptions { seed: string; template: SeedTerrainTemplate }
export interface FmsFullMapStats extends FmsFullMapOptions {
  algorithm: FmsFullMapAlgorithm; changedCells: number; landCells: number; seaCells: number;
}

export function validFmsFullMapOptions(raw: unknown): raw is FmsFullMapOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const options = raw as Record<string, unknown>;
  return Object.keys(options).length === 2 && Object.hasOwn(options, 'seed') && Object.hasOwn(options, 'template')
    && validSeedTerrainRequest({ seed: options.seed, template: options.template, layout: 'square-v1' });
}

/** Full-map generation is only safe on the untouched FMS square-v1 sea.
 * A visually similar rebuilt mesh is not the same ordered graph used by the
 * recovered height algorithm; its stored triangles and neighbor order matter. */
export async function assertFmsFullMapSource(doc: FmsDocument, control?: AtlasControl): Promise<void> {
  assertFmsDocument(doc);
  if (doc.elevations.some(height => height !== 0) || doc.terrainLocks?.some(Boolean)) {
    throw new FmsModelError('invalid-edit', '整图生成只适用于尚未绘制或保护的空白海洋；已有地形请用局部模板。');
  }
  if (await originalGridIdOf(doc)) { control?.signal?.throwIfAborted(); return; }
  const canonical = await createTerrainTopology('square-v1', control);
  control?.signal?.throwIfAborted();
  if (doc.width !== canonical.width || doc.height !== canonical.height || doc.points.length !== canonical.points.length
    || doc.triangles.length !== canonical.triangles.length || doc.neighbors.length !== canonical.neighbors.length) {
    throw new FmsModelError('invalid-edit', '整图生成需要原始正方形点网；当前地图的几何结构不能替换。');
  }
  for (let i = 0; i < doc.points.length; i++) {
    if (doc.points[i][0] !== canonical.points[i][0] || doc.points[i][1] !== canonical.points[i][1]) {
      throw new FmsModelError('invalid-edit', '当前地图的顶点与整图模板点网不一致。');
    }
    const actual = doc.neighbors[i], expected = canonical.neighbors[i];
    if (actual.length !== expected.length || actual.some((id, position) => id !== expected[position])) {
      throw new FmsModelError('invalid-edit', '当前地图的邻接顺序与整图模板点网不一致。');
    }
  }
  for (let i = 0; i < doc.triangles.length; i++) if (doc.triangles[i] !== canonical.triangles[i]) {
    throw new FmsModelError('invalid-edit', '当前地图的三角面与整图模板点网不一致。');
  }
  control?.signal?.throwIfAborted();
}

/** Reuses the reviewed full-map research generator. It returns a candidate
 * elevation array only; neither the source document nor IndexedDB is touched. */
export async function generateFmsFullMap(doc: FmsDocument, options: FmsFullMapOptions, control?: AtlasControl): Promise<{ elevations: Int32Array; stats: FmsFullMapStats }> {
  if (!validFmsFullMapOptions(options)) throw new FmsModelError('invalid-edit', '整图模板或种子无效。');
  await assertFmsFullMapSource(doc, control);
  const original = await originalGridFor(doc);
  if (original) {
    const heights = await generateRecoveredHeights(original, options.seed, options.template, control);
    control?.signal?.throwIfAborted();
    return summarize(Array.from(heights), options, 'recovered-height-original-grid-v1');
  }
  const bytes = await generateTerrainResearch({ ...options, layout: 'square-v1' }, control);
  control?.signal?.throwIfAborted();
  const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('整图生成数据无效。');
  const result = raw as Record<string, unknown>;
  if (result.format !== 'fms-terrain-research' || result.version !== 2 || result.seed !== options.seed
    || result.template !== options.template || result.width !== doc.width || result.height !== doc.height
    || result.count !== doc.points.length || !Array.isArray(result.heights) || result.heights.length !== doc.points.length) {
    throw new Error('整图生成数据与当前地图不一致。');
  }
  return summarize(result.heights, options, 'recovered-height-square-v1');
}

function summarize(heights: unknown[], options: FmsFullMapOptions, algorithm: FmsFullMapAlgorithm): { elevations: Int32Array; stats: FmsFullMapStats } {
  const elevations = new Int32Array(heights.length);
  let changedCells = 0, landCells = 0;
  for (let i = 0; i < elevations.length; i++) {
    const height = heights[i];
    if (typeof height !== 'number' || !Number.isInteger(height) || height < 0 || height > 100) throw new Error('整图高度越界。');
    elevations[i] = height;
    if (height !== 0) changedCells++;
    if (height >= FMS_SEA_LEVEL) landCells++;
  }
  if (landCells === 0) throw new Error('整图模板未生成陆地。');
  return { elevations, stats: { ...options, algorithm, changedCells, landCells, seaCells: elevations.length - landCells } };
}

/** Repeat eligibility and revision checks when preparing the preview. Undo/redo and
 * persistence remain owned by the caller's existing FmsEditHistory flow. */
export async function prepareFmsFullMapPreview(doc: FmsDocument, candidate: {
  worldId: string; baseRevision: number; elevations: Int32Array; stats: FmsFullMapStats;
}, options: FmsFullMapOptions): Promise<{ patch: FmsEditPatch; document: FmsDocument }> {
  if (!validFmsFullMapOptions(options)) throw new FmsModelError('invalid-edit', '整图模板或种子无效。');
  if (candidate.worldId !== doc.worldId || candidate.baseRevision !== doc.revision) {
    throw new FmsModelError('revision-conflict', '地图已变化，请重新生成整图预览。');
  }
  await assertFmsFullMapSource(doc);
  if (!(candidate.elevations instanceof Int32Array) || candidate.elevations.length !== doc.elevations.length
    || !candidate.stats || candidate.stats.algorithm !== await fmsFullMapAlgorithm(doc) || candidate.stats.seed !== options.seed
    || candidate.stats.template !== options.template) throw new FmsModelError('invalid-edit', '整图预览与种子或地图不一致。');
  const changes: { cell: number; previous: number; next: number }[] = [];
  let landCells = 0;
  for (let i = 0; i < candidate.elevations.length; i++) {
    const next = candidate.elevations[i];
    if (next < 0 || next > 100) throw new FmsModelError('invalid-edit', '整图高度越界。');
    if (next !== 0) changes.push(Object.freeze({ cell: i, previous: 0, next }));
    if (next >= FMS_SEA_LEVEL) landCells++;
  }
  if (landCells === 0 || candidate.stats.landCells !== landCells || candidate.stats.seaCells !== doc.points.length - landCells
    || candidate.stats.changedCells !== changes.length) throw new FmsModelError('invalid-edit', '整图预览统计与地图数据不一致。');
  const patch = Object.freeze({ worldId: doc.worldId, baseRevision: doc.revision, label: '生成整幅世界', changes: Object.freeze(changes) });
  return { patch, document: commitFmsEdit(doc, patch) };
}
