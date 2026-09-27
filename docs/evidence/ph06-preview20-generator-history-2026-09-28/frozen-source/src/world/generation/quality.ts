import { validateSpec, yieldAtlas } from '../model';
import type { AtlasBlock, AtlasControl, AtlasGridSpec, BlockKey } from '../model';
import { cellNeighbors, cellVertexIds, validateVertexPositionQ, vertexSlotLocation } from '../topology';
import { roundRatio } from './seed';

export interface GenerationGeography {
  manifest: { spec: AtlasGridSpec };
  blocks: ReadonlyMap<BlockKey, AtlasBlock>;
}
export interface GenerationControl extends AtlasControl { batchCells?: number }
export function batchSize(control?: GenerationControl): number {
  const size = control?.batchCells ?? 2048;
  if (!Number.isSafeInteger(size) || size < 64 || size > 8192) throw new Error('生成批次必须为 64—8192 个实际工作单元。');
  return size;
}
export function quadQ(data: GenerationGeography, cell: number): [number, number][] {
  const spec = data.manifest.spec, ids = cellVertexIds(spec, cell);
  return [ids[0], ids[1], ids[3], ids[2]].map(id => {
    const { key, slot } = vertexSlotLocation(spec, id), block = data.blocks.get(key);
    if (!block || block.layer !== 'geometry' || block.vertexIds[slot] !== id) throw new Error('生成地理缺少真实共享顶点。');
    const x = block.xyQ[2 * slot], y = block.xyQ[2 * slot + 1];
    validateVertexPositionQ(spec, id, x, y); return [x, y];
  });
}
/** Real twice-area in Q8 squared units and the area centroid; not nominal cells. */
export function quadMeasure(points: [number, number][]): { areaQ2: number; xQ: number; yQ: number } {
  const [ox, oy] = points[0]; let area = 0, numeratorX = 0, numeratorY = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) throw new Error('生成地理的 quad 退化、反向或不凸。');
    const ax = a[0] - ox, ay = a[1] - oy, bx = b[0] - ox, by = b[1] - oy, cross = ax * by - ay * bx;
    area += cross; numeratorX += (ax + bx) * cross; numeratorY += (ay + by) * cross;
  }
  if (![area, numeratorX, numeratorY].every(Number.isSafeInteger) || area <= 0) throw new Error('地理面积或重心超出安全整数范围。');
  return { areaQ2: area, xQ: ox + roundRatio(numeratorX, 3 * area), yQ: oy + roundRatio(numeratorY, 3 * area) };
}
export function elevationAt(data: GenerationGeography, cell: number): number {
  const size = data.manifest.spec.columns, col = cell % size, row = Math.floor(cell / size);
  const block = data.blocks.get(`elevation:${Math.floor(col / 32)}:${Math.floor(row / 32)}`);
  if (!block || block.layer !== 'elevation' || !(block.values instanceof Int32Array) || block.values.length !== 1024) throw new Error('生成地理缺少真实高程块。');
  const value = block.values[row % 32 * 32 + col % 32];
  if (!Number.isSafeInteger(value) || value < -12000 || value > 12000) throw new Error('生成高程越界。');
  return value;
}
export interface GeographyMeasurements {
  areaQ2: Float64Array; xyQ: Int32Array; elevation: Int32Array; worldAreaQ2: number; maxCellAreaQ2: number;
}
export async function measureGeography(data: GenerationGeography, control?: GenerationControl, stage = '读取真实共享地理'): Promise<GeographyMeasurements> {
  control?.signal?.throwIfAborted();
  const spec = data.manifest.spec;
  if (!validateSpec(spec) || data.blocks.size !== 4 * (spec.columns / 32) ** 2) throw new Error('生成输入的共享地理规格或块数不完整。');
  const total = spec.columns * spec.rows, batch = batchSize(control);
  const areaQ2 = new Float64Array(total), xyQ = new Int32Array(total * 2), elevation = new Int32Array(total);
  let worldAreaQ2 = 0, maxCellAreaQ2 = 0;
  for (let start = 0; start < total; start += batch) {
    const end = Math.min(total, start + batch);
    for (let id = start; id < end; id++) {
      const measured = quadMeasure(quadQ(data, id)); areaQ2[id] = measured.areaQ2;
      xyQ[2 * id] = measured.xQ; xyQ[2 * id + 1] = measured.yQ; elevation[id] = elevationAt(data, id);
      worldAreaQ2 += measured.areaQ2; maxCellAreaQ2 = Math.max(maxCellAreaQ2, measured.areaQ2);
    }
    await yieldAtlas(control, stage, end, total);
  }
  if (!Number.isSafeInteger(worldAreaQ2 * 1000)) throw new Error('全图面积超出确定性计算上限。');
  return { areaQ2, xyQ, elevation, worldAreaQ2, maxCellAreaQ2 };
}
export interface GenerationQuality {
  landAreaQ2: number; worldAreaQ2: number; maxCellAreaQ2: number; areaErrorNumerator: number;
  majorComponentCount: number; componentAreasQ2: number[]; componentCells: number[];
  minElevationMeters: number; maxElevationMeters: number; maxAdjacentElevationDifference: number;
}
/** Independent final-data audit. No territory, seed count or growth mask enters
 * this function: final elevation and actual shared-quad edges define the answer. */
export async function inspectGeneration(data: GenerationGeography, expected: { majorContinents: number; landCoveragePermille: number }, control?: GenerationControl): Promise<GenerationQuality> {
  const measured = await measureGeography(data, control, '独立核验实际面积与高程');
  const { elevation, areaQ2, worldAreaQ2, maxCellAreaQ2 } = measured, total = elevation.length, batch = batchSize(control);
  const seen = new Uint8Array(total), queue = new Uint32Array(total), componentAreasQ2: number[] = [], componentCells: number[] = [];
  let landAreaQ2 = 0, minElevationMeters = 12000, maxElevationMeters = -12000, maxAdjacentElevationDifference = 0, visited = 0;
  for (let first = 0; first < total; first++) {
    const value = elevation[first]; minElevationMeters = Math.min(minElevationMeters, value); maxElevationMeters = Math.max(maxElevationMeters, value);
    for (const next of cellNeighbors(data.manifest.spec, first)) maxAdjacentElevationDifference = Math.max(maxAdjacentElevationDifference, Math.abs(value - elevation[next]));
    if (value >= 0) landAreaQ2 += areaQ2[first];
    if (value >= 0 && !seen[first]) {
      let head = 0, tail = 1, area = 0; queue[0] = first; seen[first] = 1;
      while (head < tail) {
        const id = queue[head++]; area += areaQ2[id]; visited++;
        for (const next of cellNeighbors(data.manifest.spec, id)) if (elevation[next] >= 0 && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
        if (visited % batch === 0) await yieldAtlas(control, '独立遍历陆地共享边连通', visited, total);
      }
      componentAreasQ2.push(area); componentCells.push(tail);
    }
    if ((first + 1) % batch === 0 || first + 1 === total) await yieldAtlas(control, '独立核验全部海陆采样', first + 1, total);
  }
  const areaErrorNumerator = Math.abs(1000 * landAreaQ2 - expected.landCoveragePermille * worldAreaQ2);
  if (componentAreasQ2.length !== expected.majorContinents) throw new Error(`真实陆地连通分量为 ${componentAreasQ2.length}，不能满足 ${expected.majorContinents} 块大陆。`);
  if (!Number.isSafeInteger(areaErrorNumerator) || areaErrorNumerator > 1000 * maxCellAreaQ2) throw new Error('真实陆地面积误差超过一个最大地块，候选已拒绝。');
  return { landAreaQ2, worldAreaQ2, maxCellAreaQ2, areaErrorNumerator, majorComponentCount: componentAreasQ2.length,
    componentAreasQ2, componentCells, minElevationMeters, maxElevationMeters, maxAdjacentElevationDifference };
}
