import { pickFmsCell, type FmsDocument } from '../model';

/** Match the exact Voronoi cell ownership used to paint the original map.
 * Never fall back to triangle provinces on sea or unassigned cells. */
export function pickOriginalProvince(doc: FmsDocument, owners: Int32Array, x: number, y: number): number | null {
  if (owners.length !== doc.points.length) throw Error('地图归属与格网不一致。');
  const cell = pickFmsCell(doc, x, y);
  return cell === null || doc.elevations[cell] < 20 || owners[cell] < 0 ? null : owners[cell];
}
