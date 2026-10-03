/** Display-only placement. Neither this module nor its caller needs to change
 * the saved labelAnchorQ. The resolver must use verified, clipped land geometry. */
export interface CountryLabelPoint { xQ: number; yQ: number }
export interface CountryLabelInput {
  columns: number; rows: number; ownedCellIds: readonly number[];
  /** Full, verified mesh adjacency, including neighbours outside this nation.
   * Boundary sentinels are omitted; isBoundary identifies the world edge. */
  neighbors?: (cellId: number) => readonly number[];
  isBoundary?: (cellId: number) => boolean;
  /** For centre-distance tie breaking only, never a substitute for land. */
  centerQ?: (cellId: number) => CountryLabelPoint;
}
export interface CountryLabelPlacement { cellId: number; pointQ: CountryLabelPoint; depth: number; componentCells: number }
export interface CountryLabelControl { signal?: AbortSignal; yieldTask?: () => Promise<void> }
export type CountryLabelInsidePoint = (cellId: number) => CountryLabelPoint | null | Promise<CountryLabelPoint | null>;

const MAX_CELLS = 65536, WORLD_Q = 4096 * 256;
const validPoint = (point: CountryLabelPoint) => point && Number.isFinite(point.xQ) && Number.isFinite(point.yQ)
  && point.xQ >= 0 && point.yQ >= 0 && point.xQ <= WORLD_Q && point.yQ <= WORLD_Q;
function turnAt(a: CountryLabelPoint, b: CountryLabelPoint, c: CountryLabelPoint) {
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, px = c.xQ - a.xQ, py = c.yQ - a.yQ;
  const productA = dx * py, productB = dy * px;
  // Clipped coordinates can be near 2^20 while their edge deltas are tiny.
  // Include cancellation in those coordinate subtractions, not just products.
  const magnitude = Math.max(1, Math.abs(a.xQ), Math.abs(a.yQ), Math.abs(b.xQ), Math.abs(b.yQ), Math.abs(c.xQ), Math.abs(c.yQ));
  return { value: productA - productB, tolerance: Number.EPSILON * 64 * (Math.abs(productA) + Math.abs(productB) + magnitude * (Math.abs(dx) + Math.abs(dy) + Math.abs(px) + Math.abs(py)) + 1) };
}
const neighbours = (id: number, columns: number, rows: number) => {
  const x = id % columns, y = Math.floor(id / columns);
  return [y > 0 ? id - columns : -1, x > 0 ? id - 1 : -1, x + 1 < columns ? id + 1 : -1, y + 1 < rows ? id + columns : -1];
};

/** Largest connected component (four-way by default), then greatest cell distance from its
 * boundary, then nearest component centre, then smallest stable cell ID.
 * Only the chosen component is eligible: a missing real-land point cannot
 * silently move a country's name to a distant enclave or the open sea.
 * O(n log n) time / O(n) memory; n <= 65,536. Geometry is resolved lazily. */
export async function placeCountryLabel(input: CountryLabelInput, insidePointForCell: CountryLabelInsidePoint, control: CountryLabelControl = {}): Promise<CountryLabelPlacement | null> {
  const check = () => control.signal?.throwIfAborted();
  check();
  const { columns, rows } = input;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns > 512 || rows > 512
    || !Array.isArray(input.ownedCellIds) || input.ownedCellIds.length > MAX_CELLS) throw new Error('国家文字定位的网格或地块数量无效。');
  const ids = [...input.ownedCellIds], count = ids.length;
  if (ids.some(id => !Number.isSafeInteger(id) || id < 0 || id >= columns * rows)) throw new Error('国家文字定位存在越界地块。');
  ids.sort((a, b) => a - b);
  if (ids.some((id, index) => index > 0 && id === ids[index - 1])) throw new Error('国家文字定位存在重复地块。');
  if (!count) return null;
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const seen = new Uint8Array(count), queue = new Uint32Array(count), depths = new Int32Array(count).fill(-1);
  const adjacency: number[][] = [], boundary = new Uint8Array(count), centres = new Float64Array(count * 2);
  let operations = 0;
  const checkpoint = async () => {
    check();
    if (++operations % 1024 === 0) { await (control.yieldTask?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0))); check(); }
  };
  for (let index = 0; index < count; index++) {
    const id = ids[index], fallback = neighbours(id, columns, rows), raw = input.neighbors ? input.neighbors(id) : fallback.filter(next => next >= 0);
    if (!Array.isArray(raw) || raw.length > 32 || raw.some(next => !Number.isSafeInteger(next) || next < 0 || next >= columns * rows || next === id)) throw new Error('国家文字定位的实际邻接无效。');
    const copy = [...raw].sort((a, b) => a - b);
    if (copy.some((next, i) => i > 0 && next === copy[i - 1])) throw new Error('国家文字定位的实际邻接重复。');
    adjacency.push(copy);
    const worldEdge = input.isBoundary ? input.isBoundary(id) : !input.neighbors && fallback.includes(-1);
    if (typeof worldEdge !== 'boolean') throw new Error('国家文字定位的世界边界无效。');
    boundary[index] = worldEdge || copy.some(next => !indexById.has(next)) ? 1 : 0;
    const centre = input.centerQ?.(id);
    if (input.centerQ && !validPoint(centre!)) throw new Error('国家文字定位的地块中心无效。');
    centres[index * 2] = centre?.xQ ?? id % columns; centres[index * 2 + 1] = centre?.yQ ?? Math.floor(id / columns);
    await checkpoint();
  }
  for (let index = 0; index < count; index++) {
    for (const next of adjacency[index]) {
      const neighbourIndex = indexById.get(next);
      if (neighbourIndex !== undefined && !adjacency[neighbourIndex].includes(ids[index])) throw new Error('国家文字定位的实际邻接必须双向一致。');
    }
    await checkpoint();
  }
  let largest: number[] = [], centreX = 0, centreY = 0;
  for (let start = 0; start < count; start++) {
    if (seen[start]) continue;
    let head = 0, tail = 1, sumX = 0, sumY = 0; queue[0] = start; seen[start] = 1;
    const component: number[] = [];
    while (head < tail) {
      const index = queue[head++]; component.push(index); sumX += centres[index * 2]; sumY += centres[index * 2 + 1];
      for (const next of adjacency[index]) {
        const nextIndex = indexById.get(next);
        if (nextIndex !== undefined && !seen[nextIndex]) { seen[nextIndex] = 1; queue[tail++] = nextIndex; }
      }
      await checkpoint();
    }
    // Starts are sorted, so keeping the first equal-sized component fixes ties.
    if (component.length > largest.length) { largest = component; centreX = sumX; centreY = sumY; }
  }
  let head = 0, tail = 0;
  for (const index of largest) {
    if (boundary[index]) { depths[index] = 0; queue[tail++] = index; }
    await checkpoint();
  }
  if (!tail) throw new Error('国家文字定位缺少真实世界边界，未虚构内陆深度。');
  while (head < tail) {
    const index = queue[head++];
    for (const next of adjacency[index]) {
      const nextIndex = indexById.get(next);
      if (nextIndex !== undefined && depths[nextIndex] < 0) { depths[nextIndex] = depths[index] + 1; queue[tail++] = nextIndex; }
    }
    await checkpoint();
  }
  const componentCells = largest.length;
  const centreDistance = (index: number) => {
    const dx = centres[index * 2] - centreX / componentCells, dy = centres[index * 2 + 1] - centreY / componentCells;
    return dx * dx + dy * dy;
  };
  const compareCentre = (a: number, b: number) => {
    const x = centreDistance(a), y = centreDistance(b), difference = x - y;
    return Math.abs(difference) <= Number.EPSILON * 64 * Math.max(1, x, y) ? 0 : difference;
  };
  largest.sort((a, b) => depths[b] - depths[a] || compareCentre(a, b) || ids[a] - ids[b]);
  check();
  for (const index of largest) {
    const point = await insidePointForCell(ids[index]); check();
    if (point !== null) {
      if (!validPoint(point)) throw new Error('国家文字定位没有有效的真实陆地内点。');
      return { cellId: ids[index], pointQ: { xQ: point.xQ, yQ: point.yQ }, depth: depths[index], componentCells };
    }
    await checkpoint();
  }
  return null;
}

/** Select a point strictly inside a real convex clipped-land fragment. The
 * vertex mean of a nondegenerate convex polygon lies inside that polygon;
 * unlike a union centroid it cannot fall in a bay or between separate islands.
 * Prefer the largest fragment; equal areas prefer the land bounds' centre.
 * Only the display point is derived. Polygon vertices are never quantized or
 * mutated. This accepts the convex output of countryCellLandPolygons. */
export function pointInsideCountryLand(polygons: readonly (readonly CountryLabelPoint[])[]): CountryLabelPoint | null {
  if (!Array.isArray(polygons) || polygons.length > 16384) throw new Error('国家文字定位的陆地裁片超过预算。');
  const candidates: { point: CountryLabelPoint; area: number }[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 64 || polygon.some(point => !validPoint(point))) throw new Error('国家文字定位的陆地裁片无效。');
    const points = polygon.filter((point, index) => point.xQ !== polygon[(index + 1) % polygon.length].xQ || point.yQ !== polygon[(index + 1) % polygon.length].yQ);
    if (points.length < 3) continue;
    const origin = points[0]; let area2 = 0, direction = 0;
    for (let index = 0; index < points.length; index++) {
      const a = points[index], b = points[(index + 1) % points.length], c = points[(index + 2) % points.length];
      const turn = turnAt(a, b, c);
      if (Math.abs(turn.value) > turn.tolerance) { if (direction && Math.sign(turn.value) !== direction) throw new Error('国家文字定位需要真实凸陆地裁片。'); direction = Math.sign(turn.value); }
      area2 += (a.xQ - origin.xQ) * (b.yQ - origin.yQ) - (b.xQ - origin.xQ) * (a.yQ - origin.yQ);
    }
    if (!area2) continue;
    for (let index = 0; index < points.length; index++) {
      const a = points[index], b = points[(index + 1) % points.length];
      for (const vertex of points) {
        const turn = turnAt(a, b, vertex);
        if (turn.value * Math.sign(area2) < -turn.tolerance) throw new Error('国家文字定位需要真实凸陆地裁片。');
      }
    }
    const point = { xQ: points.reduce((sum, value) => sum + value.xQ, 0) / points.length, yQ: points.reduce((sum, value) => sum + value.yQ, 0) / points.length };
    candidates.push({ point, area: Math.abs(area2) });
    for (const vertex of points) { minX = Math.min(minX, vertex.xQ); minY = Math.min(minY, vertex.yQ); maxX = Math.max(maxX, vertex.xQ); maxY = Math.max(maxY, vertex.yQ); }
  }
  if (!candidates.length) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const distance = (point: CountryLabelPoint) => (point.xQ - cx) ** 2 + (point.yQ - cy) ** 2;
  candidates.sort((a, b) => b.area - a.area || distance(a.point) - distance(b.point) || a.point.xQ - b.point.xQ || a.point.yQ - b.point.yQ);
  return { ...candidates[0].point };
}
