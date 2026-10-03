import { detailCoastNodeOwner, type DetailCoastField, type DetailCoastTiles, type DetailCoastVertex } from './detail-coast-types';

/** Omitted owner tiles have known sea coverage. A neighbour never invents or
 * duplicates a shared node: its value always comes from this unique owner. */
export function sampleDetailCoastCoverage(tiles: DetailCoastTiles, nodeX: number, nodeY: number): number {
  const owner = detailCoastNodeOwner(nodeX, nodeY), tile = tiles.get(owner.key);
  return !tile ? -32767 : tile.mode === 'land' ? 32767 : tile.coverageQ[owner.slot];
}
export function sampleDetailCoastNode(field: DetailCoastField, nodeX: number, nodeY: number): DetailCoastVertex {
  const owner = detailCoastNodeOwner(nodeX, nodeY), tile = field.tiles.get(owner.key), xQ = nodeX * 512, yQ = nodeY * 512;
  if (tile?.mode === 'samples') {
    const coverageQ = tile.coverageQ[owner.slot], heightMeters = tile.elevationMeters[owner.slot];
    if (!Number.isInteger(coverageQ) || coverageQ < -32767 || coverageQ > 32767 || !Number.isInteger(heightMeters) || heightMeters < -12000 || heightMeters > 12000 || coverageQ > 0 && heightMeters < 0 || coverageQ < 0 && heightMeters > -1 || coverageQ === 0 && heightMeters !== 0) throw new Error('细海岸节点样本无效。');
    return { xQ, yQ, coverageQ, heightMeters };
  }
  const baseHeight = field.sampleBaseElevation(xQ, yQ);
  if (!Number.isFinite(baseHeight) || baseHeight < -12000 || baseHeight > 12000) throw new Error('细海岸基础高程无效。');
  return tile ? { xQ, yQ, coverageQ: 32767, heightMeters: Math.max(0, Math.round(baseHeight)) } : { xQ, yQ, coverageQ: -32767, heightMeters: Math.min(-1, Math.round(baseHeight)) };
}
