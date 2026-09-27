import type { DetailShapeControl } from './detail-shape';

const FINE_CELLS = 2048, FINE_Q = 512, GRID_NODES = 8, RADIUS_NODES = 16;
const MAX_HEIGHT = 12000, BIN_SHIFT = 8, BIN_SIZE = 1 << BIN_SHIFT;

export interface LocalReliefBackgroundInput {
  /** Inclusive fine-node bounds of the edit's actual quad envelope. */
  left: number; top: number; right: number; bottom: number;
  /** Trusted private old-field query. Null means coverage <= 0, never height 0.
   * Read permission may extend beyond the edit/height locks; it grants no write
   * authority. The caller must hold the same private snapshot for all batches. */
  readLandHeight: (nodeX: number, nodeY: number) => number | null;
}

async function checkpoint(control: DetailShapeControl | undefined, phase: string, done: number, total: number) {
  control?.signal?.throwIfAborted(); control?.onProgress?.(phase, done, total); control?.signal?.throwIfAborted();
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  control?.signal?.throwIfAborted();
}

/** A slowly varying OLD-land background, not another editable surface. Each
 * 16-world grid anchor uses the exact nearest-rank lower quartile of positive-
 * coverage fine nodes in a clipped 64-world square (33 by 33 nodes). This keeps
 * isolated old summits out of the regional base without inventing sea heights.
 *
 * Every source node is read once into an ephemeral signed16 cache; a sliding
 * histogram then evaluates windows. The maximum full-world cache is 2049²
 * signed16 values, plus 257² grid values and 12001 histogram bins. Height-bin
 * search is bounded by 47 groups + 256 bins per anchor. Work cooperatively
 * yields while reading, sliding and reducing; no source buffer is written.
 *
 * Nonnegative cubic B-spline interpolation is C2 and stays in the range of its
 * supporting anchors, without forcing a flat derivative on every grid line.
 * It is used only for new target heights, never to reinterpret
 * persisted Hbase or existing fine samples. Wide old uplands may remain part of
 * the background: this is a local robust estimate, not a geological inversion.
 */
export async function createLocalReliefBackground(input: LocalReliefBackgroundInput, batch: number, control?: DetailShapeControl) {
  control?.signal?.throwIfAborted();
  const { left, top, right, bottom, readLandHeight } = input;
  if (![left, top, right, bottom].every(Number.isInteger) || left < 0 || top < 0 || right > FINE_CELLS || bottom > FINE_CELLS || right < left || bottom < top
    || typeof readLandHeight !== 'function' || !Number.isInteger(batch) || batch < 64 || batch > 2048) throw new Error('局部旧地背景范围或批次无效。');
  // One extra grid anchor beyond each query edge supplies the cubic's full
  // support. Only world boundaries duplicate endpoint anchors.
  const gridLeft = Math.max(0, (Math.floor(left / GRID_NODES) - 1) * GRID_NODES), gridTop = Math.max(0, (Math.floor(top / GRID_NODES) - 1) * GRID_NODES);
  const gridRight = Math.min(FINE_CELLS, (Math.ceil(right / GRID_NODES) + 1) * GRID_NODES), gridBottom = Math.min(FINE_CELLS, (Math.ceil(bottom / GRID_NODES) + 1) * GRID_NODES);
  const columns = (gridRight - gridLeft) / GRID_NODES + 1, rows = (gridBottom - gridTop) / GRID_NODES + 1;
  const sourceLeft = Math.max(0, gridLeft - RADIUS_NODES), sourceTop = Math.max(0, gridTop - RADIUS_NODES);
  const sourceRight = Math.min(FINE_CELLS, gridRight + RADIUS_NODES), sourceBottom = Math.min(FINE_CELLS, gridBottom + RADIUS_NODES);
  const sourceWidth = sourceRight - sourceLeft + 1, sourceHeight = sourceBottom - sourceTop + 1;
  const source = new Int16Array(sourceWidth * sourceHeight), grid = new Int16Array(columns * rows).fill(-1);
  let read = 0, landRead = 0;
  for (let y = sourceTop; y <= sourceBottom; y++) for (let x = sourceLeft; x <= sourceRight; x++) {
    const height = readLandHeight(x, y);
    if (height !== null && (!Number.isInteger(height) || height < 0 || height > MAX_HEIGHT)) throw new Error('局部背景只接受真实旧陆地的有效整米高程。');
    source[read++] = height === null ? -1 : height;
    if (height !== null) landRead++;
    if (read % batch === 0) await checkpoint(control, 'read-local-old-land-background', read, source.length);
  }
  await checkpoint(control, 'read-local-old-land-background', read, source.length);

  const bins = new Int32Array(MAX_HEIGHT + 1), groups = new Int32Array(Math.ceil((MAX_HEIGHT + 1) / BIN_SIZE));
  let work = 0, totalLand = 0, validAnchors = 0;
  // Each source window contains <=1089 values. The upper bound counts all
  // initial windows, each outgoing/incoming strip, and histogram rank visits.
  const workBound = rows * ((2 * RADIUS_NODES + 1) ** 2 + (columns - 1) * 2 * GRID_NODES * (2 * RADIUS_NODES + 1) + columns * (groups.length + BIN_SIZE));
  const add = (x: number, y: number, sign: number) => {
    const height = source[(y - sourceTop) * sourceWidth + x - sourceLeft];
    if (height >= 0) { bins[height] += sign; groups[height >> BIN_SHIFT] += sign; totalLand += sign; }
  };
  for (let row = 0; row < rows; row++) {
    bins.fill(0); groups.fill(0); totalLand = 0;
    const cy = gridTop + row * GRID_NODES, lowY = Math.max(0, cy - RADIUS_NODES), highY = Math.min(FINE_CELLS, cy + RADIUS_NODES);
    let lowX = Math.max(0, gridLeft - RADIUS_NODES), highX = Math.min(FINE_CELLS, gridLeft + RADIUS_NODES);
    for (let y = lowY; y <= highY; y++) for (let x = lowX; x <= highX; x++) {
      add(x, y, 1);
      if (++work % batch === 0) await checkpoint(control, 'reduce-local-old-land-background', work, workBound);
    }
    for (let col = 0; col < columns; col++) {
      if (col) {
        const cx = gridLeft + col * GRID_NODES, nextLow = Math.max(0, cx - RADIUS_NODES), nextHigh = Math.min(FINE_CELLS, cx + RADIUS_NODES);
        for (let y = lowY; y <= highY; y++) {
          for (let x = lowX; x < nextLow; x++) {
            add(x, y, -1);
            if (++work % batch === 0) await checkpoint(control, 'reduce-local-old-land-background', work, workBound);
          }
          for (let x = highX + 1; x <= nextHigh; x++) {
            add(x, y, 1);
            if (++work % batch === 0) await checkpoint(control, 'reduce-local-old-land-background', work, workBound);
          }
        }
        lowX = nextLow; highX = nextHigh;
      }
      if (totalLand) {
        let rank = Math.ceil(totalLand / 4), group = 0;
        for (; group < groups.length; group++) {
          if (++work % batch === 0) await checkpoint(control, 'reduce-local-old-land-background', work, workBound);
          if (rank <= groups[group]) break;
          rank -= groups[group];
        }
        if (group === groups.length) throw new Error('局部背景窗口统计无效。');
        for (let height = group * BIN_SIZE; height <= Math.min(MAX_HEIGHT, (group + 1) * BIN_SIZE - 1); height++) {
          if (++work % batch === 0) await checkpoint(control, 'reduce-local-old-land-background', work, workBound);
          if (rank <= bins[height]) { grid[row * columns + col] = height; validAnchors++; break; }
          rank -= bins[height];
        }
      }
    }
  }
  await checkpoint(control, 'reduce-local-old-land-background', work, workBound);

  const weights = (t: number) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const sample = (xQ: number, yQ: number): number | undefined => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < left * FINE_Q || xQ > right * FINE_Q || yQ < top * FINE_Q || yQ > bottom * FINE_Q) throw new Error('局部背景查询超出已建立范围。');
    const gx = (xQ / FINE_Q - gridLeft) / GRID_NODES, gy = (yQ / FINE_Q - gridTop) / GRID_NODES;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), wx = weights(gx - x0), wy = weights(gy - y0);
    let value = 0, weight = 0;
    for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 4; ix++) {
      const x = Math.max(0, Math.min(columns - 1, x0 + ix - 1)), y = Math.max(0, Math.min(rows - 1, y0 + iy - 1));
      const height = grid[y * columns + x], w = wx[ix] * wy[iy];
      if (height >= 0) { value += height * w; weight += w; }
    }
    // On a real positive fine node all sixteen supporting windows include that
    // node, hence all are populated. Empty sea-only queries have no fake base.
    return weight ? value / weight : undefined;
  };
  return { sample, summary: { profile: 'old-land-lower-quartile-64-cubic16-v1' as const, sourceNodesRead: read, landNodesRead: landRead,
    gridAnchors: grid.length, validGridAnchors: validAnchors, reductionWork: work, reductionWorkBound: workBound, temporaryBytes: source.byteLength + grid.byteLength + bins.byteLength + groups.byteLength } };
}
