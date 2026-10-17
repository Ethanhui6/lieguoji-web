import { generateFmsClimateGrid } from '../climate';
import type { FmsDocument } from '../model';
import type { OriginalGrid } from './original-grid';

export interface OriginalPortCity { id: string; position: { x: number; y: number }; capital: boolean }

/** Which cities the original draws as ports (ProvinceCityType.Port):
 * - main.mjs reMarkFeatures/defineHaven: haven = closest adjacent water cell,
 *   harbor = number of adjacent water cells; water bodies are connected
 *   water cells, a body touching the map border is an "ocean", else a "lake";
 * - specifyBurgs: with temperature > 0, port if the haven's body has more
 *   than one cell and (capital with any harbor, or harbor === 1); a port that
 *   is the only one on a non-border body is cleared;
 * - PortRuleUtility.IsBurgPortQualified 0x496E30: the city cell is land and
 *   the body is not a lake and has at least c_MinPortSeaFeatureCells = 20.
 * Cities sit at the grid cell nearest their position (map units). */
export function originalPortCities(grid: OriginalGrid, doc: FmsDocument, cities: readonly OriginalPortCity[], scale: number): Set<string> {
  const h = doc.elevations, n = h.length, body = new Int32Array(n).fill(-1), sizes: number[] = [], border: boolean[] = [];
  // cells.b: a cell whose clipped Voronoi polygon reaches the map frame.
  const edge = (cell: number) => { const ring = grid.polygons[cell]; for (let i = 0; i < ring.length; i += 2) if (ring[i] <= 0 || ring[i + 1] <= 0 || ring[i] >= grid.width || ring[i + 1] >= grid.height) return true; return false; };
  for (let start = 0; start < n; start++) {
    if (h[start] >= 20 || body[start] >= 0) continue;
    const id = sizes.length, stack = [start]; body[start] = id; let size = 0, touches = false;
    while (stack.length) { const cell = stack.pop()!; size++; if (edge(cell)) touches = true; for (const j of grid.neighbors[cell]) if (h[j] < 20 && body[j] < 0) { body[j] = id; stack.push(j); } }
    sizes.push(size); border.push(touches);
  }
  const { temperature } = generateFmsClimateGrid(Uint8Array.from(h, v => Math.min(100, Math.max(0, v))), grid.cellsX, grid.cellsY);
  const nearest = ({ x, y }: { x: number; y: number }) => {
    let best = 0, d = Infinity;
    for (let cell = 0; cell < n; cell++) { const [px, py] = grid.points[cell], e = (px - x) ** 2 + (py - y) ** 2; if (e < d) { d = e; best = cell; } }
    return best;
  };
  const candidates: { id: string; body: number }[] = [];
  for (const city of cities) {
    const cell = nearest({ x: city.position.x / scale, y: city.position.y / scale });
    if (h[cell] < 20 || temperature[cell] <= 0) continue;
    const water = grid.neighbors[cell].filter(j => h[j] < 20);
    if (!water.length) continue;
    const [cx, cy] = grid.points[cell];
    const haven = water.reduce((a, b) => ((grid.points[b][0] - cx) ** 2 + (grid.points[b][1] - cy) ** 2 < (grid.points[a][0] - cx) ** 2 + (grid.points[a][1] - cy) ** 2 ? b : a));
    const f = body[haven];
    if (sizes[f] > 1 && ((city.capital && water.length > 0) || water.length === 1)) candidates.push({ id: city.id, body: f });
  }
  const perBody = new Map<number, number>();
  for (const c of candidates) perBody.set(c.body, (perBody.get(c.body) ?? 0) + 1);
  return new Set(candidates.filter(c => !(perBody.get(c.body) === 1 && !border[c.body]) && border[c.body] && sizes[c.body] >= 20).map(c => c.id));
}
