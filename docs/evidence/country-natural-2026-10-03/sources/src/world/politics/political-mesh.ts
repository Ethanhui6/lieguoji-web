import { Delaunay, type Voronoi } from 'd3-delaunay';
import type { AtlasDocument, AtlasGeographyView } from '../atlas-format';
import { generationInt } from '../generation-contract';
import { yieldAtlas, type AtlasBlock, type AtlasControl, type BlockKey } from '../model';
import { getCellQuad } from '../topology';

/** Changes to seed placement, topology, clipping or tie rules require a new
 * political geometry rule. This never changes the source Atlas geography. */
export const COUNTRY_POLITICAL_MESH_RULE = 'political-voronoi-v1' as const;
export const COUNTRY_POLITICAL_MESH_LIMITS = Object.freeze({ cells: 262144, scanBatch: 1024 });
export interface CountryPoliticalPoint { xQ: number; yQ: number }
export interface CountryPoliticalMesh {
  readonly rule: typeof COUNTRY_POLITICAL_MESH_RULE;
  readonly cellCount: number; readonly columns: number; readonly rows: number;
  readonly widthQ: number; readonly heightQ: number;
  /** Positive screen-clockwise convex ring, without a repeated closing point.
   * Shared Voronoi vertices retain their double precision Q8 coordinates. */
  cellPolygonQ(cellId: number): CountryPoliticalPoint[];
  /** The fixed integer-Q8 Voronoi seed inside its original geographic quad. */
  centerQ(cellId: number): CountryPoliticalPoint;
  /** One neighbour per polygon edge; -1 denotes the world boundary. */
  sideNeighbors(cellId: number): number[];
  neighbors(cellId: number): number[];
  /** Finite float Q8 accepted. Outside the world is null; boundary ties choose
   * the smallest cell ID, within a machine-precision arithmetic tolerance. */
  pick(point: CountryPoliticalPoint): number | null;
}
const cross = (a: CountryPoliticalPoint, b: CountryPoliticalPoint, c: CountryPoliticalPoint) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const hashWord = (hash: number, word: number) => Math.imul(hash ^ word, 16777619) >>> 0;
let ruleHash = 2166136261;
for (const character of COUNTRY_POLITICAL_MESH_RULE) ruleHash = hashWord(ruleHash, character.charCodeAt(0));
function mix(value: number): number {
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35);
  return (value ^ value >>> 16) >>> 0;
}
function checkedCell(cellId: number, count: number) {
  if (!generationInt(cellId, 0, count - 1)) throw new Error('政治网格单元 ID 超出范围。');
}
function seedInQuad(quad: CountryPoliticalPoint[], dimensionHash: number, cellId: number): CountryPoliticalPoint {
  let hash = hashWord(dimensionHash, cellId);
  for (const point of quad) { hash = hashWord(hash, point.xQ); hash = hashWord(hash, point.yQ); }
  const u = (2000 + mix(hash ^ 0x9e3779b9) % 6001) / 10000;
  const v = (2000 + mix(hash ^ 0x243f6a88) % 6001) / 10000;
  const weights = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
  const point = { xQ: Math.round(quad.reduce((sum, p, i) => sum + p.xQ * weights[i], 0)),
    yQ: Math.round(quad.reduce((sum, p, i) => sum + p.yQ * weights[i], 0)) };
  if (quad.some((a, i) => cross(a, quad[(i + 1) % 4], point) <= 0)) throw new Error('政治网格种子未严格位于来源地理单元内。');
  return point;
}
class PoliticalMesh implements CountryPoliticalMesh {
  readonly rule = COUNTRY_POLITICAL_MESH_RULE;
  readonly cellCount: number;
  readonly #delaunay: Delaunay<CountryPoliticalPoint>;
  readonly #voronoi: Voronoi<CountryPoliticalPoint>;
  constructor(readonly columns: number, readonly rows: number, readonly widthQ: number, readonly heightQ: number,
    delaunay: Delaunay<CountryPoliticalPoint>) {
    this.#delaunay = delaunay;
    this.cellCount = columns * rows;
    this.#voronoi = this.#delaunay.voronoi([0, 0, widthQ, heightQ]);
    Object.freeze(this);
  }
  centerQ(cellId: number): CountryPoliticalPoint {
    checkedCell(cellId, this.cellCount);
    return { xQ: this.#delaunay.points[cellId * 2], yQ: this.#delaunay.points[cellId * 2 + 1] };
  }
  cellPolygonQ(cellId: number): CountryPoliticalPoint[] {
    checkedCell(cellId, this.cellCount);
    const raw = this.#voronoi.cellPolygon(cellId);
    if (!raw || raw.length < 4) throw new Error('政治网格缺少完整 Voronoi 单元。');
    const points: CountryPoliticalPoint[] = [];
    for (let i = 0; i < raw.length - 1; i++) {
      const [xQ, yQ] = raw[i], previous = points.at(-1);
      if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || xQ > this.widthQ || yQ < 0 || yQ > this.heightQ) throw new Error('政治网格顶点越过世界边界。');
      if (!previous || previous.xQ !== xQ || previous.yQ !== yQ) points.push({ xQ, yQ });
    }
    if (points.length > 1 && points[0].xQ === points.at(-1)!.xQ && points[0].yQ === points.at(-1)!.yQ) points.pop();
    let area = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a.xQ * b.yQ - a.yQ * b.xQ; }
    if (points.length < 3 || area === 0) throw new Error('政治网格单元退化。');
    if (area < 0) points.reverse();
    for (let i = 0; i < points.length; i++) if (cross(points[i], points[(i + 1) % points.length], points[(i + 2) % points.length]) < 0) throw new Error('政治网格单元不是凸多边形。');
    // Canonical start affects path ordering only, never shared coordinates.
    let first = 0;
    for (let i = 1; i < points.length; i++) if (points[i].xQ < points[first].xQ || points[i].xQ === points[first].xQ && points[i].yQ < points[first].yQ) first = i;
    return [...points.slice(first), ...points.slice(0, first)];
  }
  sideNeighbors(cellId: number): number[] {
    const polygon = this.cellPolygonQ(cellId), own = this.centerQ(cellId), candidates = [...this.#delaunay.neighbors(cellId)].sort((a, b) => a - b);
    return polygon.map((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      if (a.xQ === b.xQ && (a.xQ === 0 || a.xQ === this.widthQ) || a.yQ === b.yQ && (a.yQ === 0 || a.yQ === this.heightQ)) return -1;
      const neighbor = candidates.find(id => {
        const other = this.centerQ(id), nx = other.xQ - own.xQ, ny = other.yQ - own.yQ, mx = (other.xQ + own.xQ) / 2, my = (other.yQ + own.yQ) / 2;
        return [a, b].every(point => {
          const value = nx * (point.xQ - mx) + ny * (point.yQ - my);
          const tolerance = Number.EPSILON * 64 * (Math.abs(nx) * (Math.abs(point.xQ) + Math.abs(mx)) + Math.abs(ny) * (Math.abs(point.yQ) + Math.abs(my)) + 1);
          return Math.abs(value) <= tolerance;
        });
      });
      if (neighbor === undefined) throw new Error('政治网格共享边没有可核验的邻居。');
      return neighbor;
    });
  }
  neighbors(cellId: number): number[] { return [...new Set(this.sideNeighbors(cellId).filter(id => id >= 0))].sort((a, b) => a - b); }
  pick(point: CountryPoliticalPoint): number | null {
    const { xQ, yQ } = point;
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ)) throw new Error('政治点选需要有限 Q8 坐标。');
    if (xQ < 0 || xQ > this.widthQ || yQ < 0 || yQ > this.heightQ) return null;
    const guess = Math.min(this.rows - 1, Math.floor(yQ / this.heightQ * this.rows)) * this.columns + Math.min(this.columns - 1, Math.floor(xQ / this.widthQ * this.columns));
    const nearest = this.#delaunay.find(xQ, yQ, guess), center = this.centerQ(nearest);
    const dx = xQ - center.xQ, dy = yQ - center.yQ, distance = dx * dx + dy * dy;
    const pending = [nearest], seen = new Set(pending); let chosen = nearest;
    // Delaunay neighbours connect all cells sharing a Voronoi edge or vertex,
    // including co-circular ties. No camera hint or previous pick affects IDs.
    for (let i = 0; i < pending.length; i++) for (const id of this.#delaunay.neighbors(pending[i])) {
      if (seen.has(id)) continue;
      seen.add(id); const other = this.centerQ(id), ex = xQ - other.xQ, ey = yQ - other.yQ, candidate = ex * ex + ey * ey;
      const tolerance = Number.EPSILON * 64 * (distance + candidate + Math.abs(xQ) * (Math.abs(dx) + Math.abs(ex)) + Math.abs(yQ) * (Math.abs(dy) + Math.abs(ey)) + 1);
      if (Math.abs(candidate - distance) <= tolerance) { pending.push(id); chosen = Math.min(chosen, id); }
    }
    return chosen;
  }
}

/** Build over the complete original geographic lattice, never a viewport or
 * a selected country's cells. Source geometry is captured before the first
 * yield. The fixed-capacity d3 triangulation is synchronous; scan and validation
 * are cooperative, and cancellation is checked immediately before/after d3. */
export async function createCountryPoliticalMesh(data: AtlasDocument, control?: AtlasControl): Promise<CountryPoliticalMesh> {
  const guarded: AtlasControl = { signal: control?.signal, yieldTask: control?.yieldTask, onProgress: control?.onProgress }; guarded.signal?.throwIfAborted();
  const spec = { ...data.manifest.spec }, { columns, rows } = spec, cellCount = columns * rows, widthQ = spec.width * 256, heightQ = spec.height * 256;
  if (![128, 256, 512].includes(columns) || ![128, 256, 512].includes(rows) || !generationInt(cellCount, 1, COUNTRY_POLITICAL_MESH_LIMITS.cells)
    || spec.coordinateScale !== 256 || spec.blockCells !== 32 || spec.width !== 4096 || spec.height !== 4096) throw new Error('政治网格来源规格或 262,144 单元预算无效。');
  const blocks = new Map<BlockKey, AtlasBlock>();
  for (const [key, block] of data.blocks) if (block.layer === 'geometry') blocks.set(key, structuredClone(block));
  // Preserve the existing manifest discriminant and ancillary view fields;
  // getCellQuad only reads this captured spec and the copied geometry blocks.
  const owned = { ...data, manifest: { ...data.manifest, spec }, blocks } as AtlasGeographyView;
  const coordinates = new Float64Array(cellCount * 2);
  let dimensionHash = ruleHash;
  for (const dimension of [columns, rows, widthQ, heightQ]) dimensionHash = hashWord(dimensionHash, dimension);
  for (let cellId = 0; cellId < cellCount; cellId++) {
    guarded.signal?.throwIfAborted(); const quad = getCellQuad(owned, cellId).map(point => ({ xQ: point.x * 256, yQ: point.y * 256 }));
    for (let i = 0; i < 4; i++) if (!generationInt(quad[i].xQ, 0, widthQ) || !generationInt(quad[i].yQ, 0, heightQ) || cross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]) <= 0) throw new Error('政治网格来源共享四边形无效。');
    const seed = seedInQuad(quad, dimensionHash, cellId); coordinates[cellId * 2] = seed.xQ; coordinates[cellId * 2 + 1] = seed.yQ;
    if ((cellId + 1) % COUNTRY_POLITICAL_MESH_LIMITS.scanBatch === 0 || cellId + 1 === cellCount) await yieldAtlas(guarded, '准备固定政治网格种子', cellId + 1, cellCount);
  }
  await yieldAtlas(guarded, '构建共享政治 Voronoi 网格', 0, cellCount);
  const delaunay = new Delaunay<CountryPoliticalPoint>(coordinates), mesh = new PoliticalMesh(columns, rows, widthQ, heightQ, delaunay);
  guarded.signal?.throwIfAborted();
  for (let cellId = 0; cellId < cellCount; cellId++) {
    if (delaunay.inedges[cellId] < 0) throw new Error('政治网格存在重合或缺失种子。');
    if ((cellId + 1) % COUNTRY_POLITICAL_MESH_LIMITS.scanBatch === 0 || cellId + 1 === cellCount) await yieldAtlas(guarded, '核验共享政治网格身份', cellId + 1, cellCount);
  }
  guarded.signal?.throwIfAborted(); return mesh;
}
