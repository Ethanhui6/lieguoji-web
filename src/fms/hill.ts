import { assertFmsDocument, FmsModelError, pickFmsCell, selectFmsHillCells, type FmsDocument } from './model';
import { fixedFmsCoastVertices } from './coastline';
import { applyFmsHillBrush, generateFmsHillContributions } from '../world/fms-native-brush';
import { createAlea } from '../world/recovered-terrain/alea';

export interface FmsHillOptions { x: number; y: number; radius: number; height: number; decay: number; seed: number }
export interface FmsHillStats {
  algorithm: 'recovered-native-hill-max-web-v1'; seed: number; centerCell: number;
  selectedCells: number; changedCells: number; height: number; decay: number;
}
export const validFmsHillOptions = (raw: unknown): raw is FmsHillOptions => {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as FmsHillOptions, keys = ['x', 'y', 'radius', 'height', 'decay', 'seed'];
  return Object.keys(p).length === keys.length && keys.every(k => Object.hasOwn(p, k))
    && [p.x, p.y, p.radius, p.height, p.decay, p.seed].every(Number.isFinite)
    && p.radius >= .5 && p.radius <= 8192 && Number.isInteger(p.height) && p.height >= 25 && p.height <= 100
    && p.decay >= .8 && p.decay <= .98 && Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff;
};

/** Static-recovered GetHeightMap + Hill Max arithmetic. Web adaptations are
 * explicit: Voronoi circle selection, Alea RNG and coast/player-height masks.
 * Mask AFTER propagation so protected vertices still carry the source wave.
 * No extra noise, no implicit clamp, no mutations and no persistence. */
export function generateFmsHill(doc: FmsDocument, options: FmsHillOptions): { elevations: Int32Array; stats: FmsHillStats } {
  assertFmsDocument(doc);
  if (!validFmsHillOptions(options) || options.radius > Math.max(doc.width, doc.height)
    || doc.elevations.some(h => h < 0 || h > 100)) throw new FmsModelError('invalid-edit', '山丘参数或当前高度超出支持范围。');
  const centerCell = pickFmsCell(doc, options.x, options.y);
  if (centerCell === null || doc.elevations[centerCell] <= 20) throw new FmsModelError('invalid-edit', '请在已有陆地内部放置山丘。');
  const selectedCells = selectFmsHillCells(doc, options), coast = fixedFmsCoastVertices(doc);
  const contributions = generateFmsHillContributions({ selectedCells, centerCell, centerHeight: options.height,
    decayFactor: options.decay, orderedNeighbors: cell => doc.neighbors[cell], randomValue: createAlea(String(options.seed)) });
  const cells = [...selectedCells], combined = applyFmsHillBrush(cells.map(i => doc.elevations[i]), cells.map(i => contributions.get(i) ?? 0), 'max');
  const elevations = doc.elevations.slice(); let changedCells = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (coast[cell] || doc.terrainLocks?.[cell]) continue;
    if (combined[i] < 0 || combined[i] > 100) throw new FmsModelError('invalid-edit', '山丘高度超出地图范围，请降低高度或衰减参数。');
    elevations[cell] = combined[i]; if (elevations[cell] !== doc.elevations[cell]) changedCells++;
  }
  return { elevations, stats: { algorithm: 'recovered-native-hill-max-web-v1', seed: options.seed, centerCell,
    selectedCells: selectedCells.size, changedCells, height: options.height, decay: options.decay } };
}
