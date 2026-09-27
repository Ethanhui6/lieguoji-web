/** Staged for src/world/generation/detail-shape-height.ts.
 * Fixed v4 reconstruction from persisted coarse centroids and heights only. */
export const DETAIL_SHAPE_BASE_SAMPLER = 'centroid-compact-idw-v1' as const;
const WORLD_Q = 4096 * 256;
function copyBuffer(value: ArrayBuffer, length: number): Int32Array {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || value.byteLength !== length * 4) throw new Error('基础高程需要精确非共享缓冲区。');
  return new Int32Array(ArrayBuffer.prototype.slice.call(value, 0) as ArrayBuffer);
}
/** Compact support vanishes at radius 2.5 nominal steps. All potentially
 * contributing real centroids are included when crossing a nominal bucket;
 * the bucket is a search accelerator, not a discontinuous interpolation cell.
 * Exact centroid values are reproduced. Inputs are copied and never retained
 * by alias. Rebuild with these same persisted inputs after refresh. */
export function createDetailShapeBaseSampler(size: 128 | 256 | 512, centersQ: ArrayBuffer, elevationsMeters: ArrayBuffer) {
  if (![128, 256, 512].includes(size)) throw new Error('基础高程粗采样规格无效。');
  const centers = copyBuffer(centersQ, size * size * 2), heights = copyBuffer(elevationsMeters, size * size), step = WORLD_Q / size, radius2 = (2.5 * step) ** 2;
  for (let id = 0; id < heights.length; id++) {
    const x = id % size, y = Math.floor(id / size);
    if (centers[id * 2] <= x * step || centers[id * 2] >= (x + 1) * step || centers[id * 2 + 1] <= y * step || centers[id * 2 + 1] >= (y + 1) * step || heights[id] < -12000 || heights[id] > 12000) throw new Error('基础高程真实重心或高度越界。');
  }
  return (xQ: number, yQ: number): number => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || yQ < 0 || xQ > WORLD_Q || yQ > WORLD_Q) throw new Error('基础高程位置越界。');
    const column = Math.min(size - 1, Math.floor(xQ / step)), row = Math.min(size - 1, Math.floor(yQ / step)); let sum = 0, weighted = 0;
    for (let y = Math.max(0, row - 3); y <= Math.min(size - 1, row + 3); y++) for (let x = Math.max(0, column - 3); x <= Math.min(size - 1, column + 3); x++) {
      const id = y * size + x, distance2 = (centers[id * 2] - xQ) ** 2 + (centers[id * 2 + 1] - yQ) ** 2;
      if (distance2 === 0) return heights[id]; if (distance2 >= radius2) continue;
      const support = 1 - distance2 / radius2, weight = support * support / distance2; sum += weight; weighted += weight * heights[id];
    }
    if (!(sum > 0)) throw new Error('基础高程缺少实际重心支持。'); return weighted / sum;
  };
}
