import { assertFmsDocument, commitFmsEdit, FmsModelError, pickFmsCell, type FmsDocument, type FmsEditPatch } from './model';
import { fixedFmsCoastVertices } from './coastline';
import { generateClickHeights, type ClickTemplate, type RecoveredEngineControl } from '../world/recovered-terrain/click-engine';

export interface FmsTemplateOptions { x: number; y: number; template: ClickTemplate; seed: number; preserveCoast: boolean }
export interface FmsTemplateStats extends FmsTemplateOptions {
  algorithm: 'recovered-click-template-max-web-v1'; changedCells: number; newLandCells: number; centerCell: number; sizeFactor: number;
}
export function validFmsTemplateOptions(raw: unknown): raw is FmsTemplateOptions {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as FmsTemplateOptions, keys = ['x', 'y', 'template', 'seed', 'preserveCoast'];
  return Object.keys(p).length === keys.length && keys.every(k => Object.hasOwn(p, k))
    && [p.x, p.y, p.seed].every(Number.isFinite) && p.x >= 0 && p.y >= 0 && ['highIsland', 'pangea'].includes(p.template)
    && Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff && typeof p.preserveCoast === 'boolean';
}

/** Recovered ClickToGenerateMap selects a site, then InitMapGenerationSettings
 * derives scale from its distance to the four world edges, capped at 0.3f.
 * Web nearest-site tie order remains an explicit topology adaptation. */
export function fmsTemplatePlacement(doc: FmsDocument, options: Pick<FmsTemplateOptions, 'x' | 'y'>) {
  const centerCell = pickFmsCell(doc, options.x, options.y);
  if (centerCell === null) throw new FmsModelError('invalid-edit', '请在地图范围内放置地形。');
  const f = Math.fround, [px, py] = doc.points[centerCell], x = f(px), y = f(py), width = f(doc.width), height = f(doc.height);
  const sizeFactor = Math.min(f(.3), f(Math.min(Math.abs(f(x - width)), x) / width), f(Math.min(Math.abs(f(y - height)), y) / height));
  return { centerCell, sizeFactor, center: [x, y] as const };
}

/** Original click branch: generate a fresh height field, then max(old, generated).
 * Coast and player masks are explicit web constraints applied AFTER generation.
 * There is no circular crop: template offsets and graph propagation set its reach. */
export async function generateFmsLocalTemplate(doc: FmsDocument, options: FmsTemplateOptions, control?: RecoveredEngineControl) {
  assertFmsDocument(doc);
  if (!validFmsTemplateOptions(options) || options.x > doc.width || options.y > doc.height || doc.elevations.some(h => h < 0 || h > 100)) {
    throw new FmsModelError('invalid-edit', '局部地形参数或当前高度超出支持范围。');
  }
  const placement = fmsTemplatePlacement(doc, options);
  const generated = await generateClickHeights(doc, String(options.seed), options.template, placement, control);
  const coast = options.preserveCoast ? fixedFmsCoastVertices(doc) : undefined;
  const elevations = doc.elevations.slice(); let changedCells = 0, newLandCells = 0;
  for (let i = 0; i < elevations.length; i++) {
    if (coast?.[i] || doc.terrainLocks?.[i]) continue;
    elevations[i] = Math.max(elevations[i], generated[i]);
    if (elevations[i] !== doc.elevations[i]) changedCells++;
    if (elevations[i] >= 20 && doc.elevations[i] < 20) newLandCells++;
  }
  const stats: FmsTemplateStats = { ...options, algorithm: 'recovered-click-template-max-web-v1', changedCells, newLandCells, centerCell: placement.centerCell, sizeFactor: placement.sizeFactor };
  return { elevations, stats };
}

export function prepareFmsTemplatePreview(doc: FmsDocument, result: {
  worldId: string; baseRevision: number; elevations: Int32Array;
}, options: FmsTemplateOptions): { patch: FmsEditPatch; document: FmsDocument } {
  assertFmsDocument(doc);
  if (!validFmsTemplateOptions(options) || options.x > doc.width || options.y > doc.height) throw new FmsModelError('invalid-edit', '局部地形参数无效。');
  if (result.worldId !== doc.worldId || result.baseRevision !== doc.revision) throw new FmsModelError('revision-conflict', '地图已变化，请重新生成地形预览。');
  if (!(result.elevations instanceof Int32Array) || result.elevations.length !== doc.elevations.length) throw new FmsModelError('invalid-edit', '局部地形预览数据不完整。');
  const coast = options.preserveCoast ? fixedFmsCoastVertices(doc) : undefined, changes = [];
  for (let cell = 0; cell < result.elevations.length; cell++) {
    const previous = doc.elevations[cell], next = result.elevations[cell];
    if (previous < 0 || previous > 100 || next < previous || next > 100 || ((coast?.[cell] || doc.terrainLocks?.[cell]) && next !== previous)) {
      throw new FmsModelError('invalid-edit', '局部地形改变了受保护高度或降低原地形，未应用。');
    }
    if (next !== previous) changes.push(Object.freeze({ cell, previous, next }));
  }
  const patch = Object.freeze({ worldId: doc.worldId, baseRevision: doc.revision, label: '放置原作地形', changes: Object.freeze(changes) });
  return { patch, document: commitFmsEdit(doc, patch) };
}
