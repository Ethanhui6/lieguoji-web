import type { AtlasDocument } from '../atlas-format';
import { generationArray, generationExact, generationInt } from '../generation-contract';
import { yieldAtlas, type AtlasControl } from '../model';
import { countryClaimCells, countryGeographySource, readCountryCellGeometryPage, validateCountrySource, type CountrySource } from './geography';

export interface CountryPolygonPoint { xQ: number; yQ: number }
export interface CountryPolygonSelectionRequest { source: CountrySource; pointsQ: readonly CountryPolygonPoint[] }
export interface CountryPolygonSelection {
  source: CountrySource; rule: 'cell-center-land-v1'; cellIds: number[];
  scannedCells: number; polygonMatchedCells: number; seaRejectedCells: number;
}
export const COUNTRY_SELECTION_LIMITS = Object.freeze({ vertices: 256, scannedCells: 512 * 512, selectedCells: 65536, pageCells: 1024 });
const WORLD_Q = 4096 * 256;
const sameSource = (a: CountrySource, b: CountrySource) => a.draftId === b.draftId && a.revision === b.revision && a.rootDigest === b.rootDigest && a.manifestDigest === b.manifestDigest && a.atlasFormat === b.atlasFormat;
const cross = (a: CountryPolygonPoint, b: CountryPolygonPoint, c: CountryPolygonPoint) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const onSegment = (a: CountryPolygonPoint, b: CountryPolygonPoint, p: CountryPolygonPoint) => cross(a, b, p) === 0
  && p.xQ >= Math.min(a.xQ, b.xQ) && p.xQ <= Math.max(a.xQ, b.xQ) && p.yQ >= Math.min(a.yQ, b.yQ) && p.yQ <= Math.max(a.yQ, b.yQ);
function intersects(a: CountryPolygonPoint, b: CountryPolygonPoint, c: CountryPolygonPoint, d: CountryPolygonPoint): boolean {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  return ac === 0 && onSegment(a, b, c) || ad === 0 && onSegment(a, b, d) || ca === 0 && onSegment(c, d, a) || cb === 0 && onSegment(c, d, b)
    || (ac > 0 && ad < 0 || ac < 0 && ad > 0) && (ca > 0 && cb < 0 || ca < 0 && cb > 0);
}
function ownOutline(raw: unknown): CountryPolygonPoint[] {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > COUNTRY_SELECTION_LIMITS.vertices || !generationArray(raw)) throw new Error('圈地轮廓需要 3 至 256 个顶点，末点无需重复首点。');
  const points: CountryPolygonPoint[] = [], seen = new Set<string>();
  for (const point of raw) {
    if (!generationExact(point, ['xQ', 'yQ']) || !generationInt(point.xQ, 0, WORLD_Q) || !generationInt(point.yQ, 0, WORLD_Q)) throw new Error('圈地顶点需要世界范围内的整数 Q8 坐标。');
    const key = `${point.xQ}:${point.yQ}`;
    if (seen.has(key)) throw new Error('圈地轮廓不能包含重复顶点或零长度边，末点无需重复首点。');
    seen.add(key); points.push({ xQ: point.xQ, yQ: point.yQ });
  }
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    twiceArea += a.xQ * b.yQ - a.yQ * b.xQ;
    if (cross(a, b, c) === 0 && (b.xQ - a.xQ) * (c.xQ - b.xQ) + (b.yQ - a.yQ) * (c.yQ - b.yQ) < 0) throw new Error('圈地轮廓不能折返或重叠已有边。');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) throw new Error('圈地轮廓不能自交或让不相邻的边接触。');
    }
  }
  if (twiceArea === 0) throw new Error('圈地轮廓退化，没有实际面积。');
  return points;
}
/** Bounded pure validation; both the model and authoritative selection use
 * this same rule. Adjacent forward collinear edges are valid. */
export function validateCountryPolygonOutline(raw: unknown): raw is CountryPolygonPoint[] {
  try { ownOutline(raw); return true; } catch { return false; }
}
/** Coordinates are scaled by four, retaining exact integer cell-center means.
 * A center on the outline is included. A simple ring uses half-open winding. */
function containsCenter(points4: readonly CountryPolygonPoint[], xQ: number, yQ: number): boolean {
  const p = { xQ, yQ }; let winding = 0;
  for (let i = 0; i < points4.length; i++) {
    const a = points4[i], b = points4[(i + 1) % points4.length];
    if (onSegment(a, b, p)) return true;
    if (a.yQ <= yQ) { if (b.yQ > yQ && cross(a, b, p) > 0) winding++; }
    else if (b.yQ <= yQ && cross(a, b, p) < 0) winding--;
  }
  return winding !== 0;
}
/** A polygon chooses whole geographic cells by their actual shared-quad
 * centers. It is not a persistent vector border. Selected coastal cells are
 * checked against real fine land and displayed by the existing land clipper.
 * No partial selection escapes cancellation or the 65,536-cell limit. */
export async function selectCountryPolygon(data: AtlasDocument, raw: CountryPolygonSelectionRequest, control?: AtlasControl): Promise<CountryPolygonSelection> {
  const guarded: AtlasControl = { signal: control?.signal, onProgress: control?.onProgress, yieldTask: control?.yieldTask };
  guarded.signal?.throwIfAborted();
  if (!generationExact(raw, ['source', 'pointsQ']) || !validateCountrySource(raw.source)) throw new Error('圈地请求或地理来源身份无效。');
  const source = { ...raw.source }, outline = ownOutline(raw.pointsQ), actual = countryGeographySource(data);
  if (!sameSource(source, actual)) throw new Error('圈地轮廓与已验证地理来源身份不一致。');
  const points4 = outline.map(point => ({ xQ: point.xQ * 4, yQ: point.yQ * 4 }));
  const minX = Math.min(...points4.map(p => p.xQ)), maxX = Math.max(...points4.map(p => p.xQ));
  const minY = Math.min(...points4.map(p => p.yQ)), maxY = Math.max(...points4.map(p => p.yQ));
  const cellIds: number[] = []; let cursor = 0, totalCells: number | null = null, polygonMatchedCells = 0, seaRejectedCells = 0;
  const nestedControl: AtlasControl = { signal: guarded.signal, yieldTask: guarded.yieldTask,
    onProgress: progress => { guarded.signal?.throwIfAborted(); guarded.onProgress?.({ ...progress, stage: `圈地：${progress.stage}` }); guarded.signal?.throwIfAborted(); } };
  do {
    guarded.signal?.throwIfAborted();
    const page = await readCountryCellGeometryPage(data, cursor, COUNTRY_SELECTION_LIMITS.pageCells, nestedControl);
    guarded.signal?.throwIfAborted();
    if (!sameSource(page.source, source) || !generationInt(page.totalCells, 1, COUNTRY_SELECTION_LIMITS.scannedCells)
      || totalCells !== null && page.totalCells !== totalCells || page.cursor !== cursor) throw new Error('圈地地理分页来源或范围不一致。');
    totalCells = page.totalCells; const count = Math.min(COUNTRY_SELECTION_LIMITS.pageCells, totalCells - cursor), end = cursor + count;
    if (count < 1 || !(page.quadsQ instanceof Int32Array) || page.quadsQ.length !== count * 8 || page.nextCursor !== (end === totalCells ? null : end)) throw new Error('圈地地理分页不完整。');
    const matched: number[] = [];
    for (let i = 0; i < count; i++) {
      guarded.signal?.throwIfAborted(); const offset = i * 8;
      const x4 = page.quadsQ[offset] + page.quadsQ[offset + 2] + page.quadsQ[offset + 4] + page.quadsQ[offset + 6];
      const y4 = page.quadsQ[offset + 1] + page.quadsQ[offset + 3] + page.quadsQ[offset + 5] + page.quadsQ[offset + 7];
      if (x4 >= minX && x4 <= maxX && y4 >= minY && y4 <= maxY && containsCenter(points4, x4, y4)) matched.push(cursor + i);
      if ((i + 1) % 128 === 0) await yieldAtlas(guarded, '按地理单元中心圈地', cursor + i + 1, totalCells);
    }
    polygonMatchedCells += matched.length;
    if (matched.length) {
      const land = await countryClaimCells(data, matched, nestedControl); guarded.signal?.throwIfAborted();
      const allowed = new Set(matched); let previous = cursor - 1;
      for (const id of land) { if (!generationInt(id, cursor, end - 1) || id <= previous || !allowed.has(id)) throw new Error('圈地真实陆地返回了无效地块。'); previous = id; }
      if (cellIds.length + land.length > COUNTRY_SELECTION_LIMITS.selectedCells) throw new Error('圈地真实陆地超过 65,536 个地理单元；请缩小轮廓，本次未提交任何地块。');
      cellIds.push(...land); seaRejectedCells += matched.length - land.length;
    }
    cursor = end;
    await yieldAtlas(guarded, '核验圈地实际陆地', cursor, totalCells);
  } while (cursor < totalCells!);
  guarded.signal?.throwIfAborted();
  return { source, rule: 'cell-center-land-v1', cellIds, scannedCells: cursor, polygonMatchedCells, seaRejectedCells };
}
