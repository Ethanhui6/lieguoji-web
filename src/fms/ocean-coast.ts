import { FMS_SEA_LEVEL, type FmsDocument } from './model';

export type FmsCoastSegment = readonly [number, number, number, number];
type Surface = Pick<FmsDocument, 'points' | 'triangles' | 'elevations' | 'width' | 'height'>;

/** Web adapter: contour of the actual float32 render triangles, not a point mask
 * or Voronoi coastline. Exact-level edges and isolated exact-level points count;
 * an all-level plateau creates no invented coastline in its interior. */
export function extractFmsOceanCoast(doc: Surface): FmsCoastSegment[] {
  const segments: FmsCoastSegment[] = [];
  const crossing = (ia: number, ib: number): readonly [number, number] => {
    // Canonical endpoint order gives shared-edge intersections identical values.
    const a = Math.min(ia, ib), b = Math.max(ia, ib), pa = doc.points[a], pb = doc.points[b];
    const ha = Math.fround(doc.elevations[a]), hb = Math.fround(doc.elevations[b]);
    const t = (FMS_SEA_LEVEL - ha) / (hb - ha);
    const ax = Math.fround(pa[0]), ay = Math.fround(pa[1]);
    return [ax + (Math.fround(pb[0]) - ax) * t, ay + (Math.fround(pb[1]) - ay) * t];
  };
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const ids = [doc.triangles[offset], doc.triangles[offset + 1], doc.triangles[offset + 2]];
    const cuts: (readonly [number, number])[] = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge], b = ids[(edge + 1) % 3];
      if ((doc.elevations[a] < FMS_SEA_LEVEL) !== (doc.elevations[b] < FMS_SEA_LEVEL)) cuts.push(crossing(a, b));
    }
    if (cuts.length === 2) {
      const [a, b, c] = ids.map(id => doc.points[id].map(Math.fround));
      // A valid double-precision triangle can collapse during Float32 upload.
      // The GPU draws no area for it, so it must not invent a near-water band.
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) === 0) continue;
      segments.push([cuts[0][0], cuts[0][1], cuts[1][0], cuts[1][1]]);
    }
  }
  return segments;
}

interface Node { minX: number; minY: number; maxX: number; maxY: number; start: number; end: number; left: number; right: number }

/** Exact Euclidean segment distance at sample positions. A bounded BVH avoids
 * scanning every coastline for every texel. This is not Unity's raster/JFA. */
export function createFmsCoastDistance(segments: readonly FmsCoastSegment[], cap: number): (x: number, y: number) => number {
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('海岸距离范围无效。');
  const ordered = [...segments], nodes: Node[] = [];
  const build = (start: number, end: number): number => {
    const node: Node = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, start, end, left: -1, right: -1 };
    for (let i = start; i < end; i++) {
      const [ax, ay, bx, by] = ordered[i];
      node.minX = Math.min(node.minX, ax, bx); node.minY = Math.min(node.minY, ay, by);
      node.maxX = Math.max(node.maxX, ax, bx); node.maxY = Math.max(node.maxY, ay, by);
    }
    const id = nodes.length; nodes.push(node);
    if (end - start > 8) {
      const axis = node.maxX - node.minX >= node.maxY - node.minY ? 0 : 1;
      const sorted = ordered.slice(start, end).sort((a, b) => a[axis] + a[axis + 2] - b[axis] - b[axis + 2]);
      for (let i = 0; i < sorted.length; i++) ordered[start + i] = sorted[i];
      const middle = (start + end) >>> 1;
      node.left = build(start, middle); node.right = build(middle, end);
    }
    return id;
  };
  if (!ordered.length) return () => cap;
  build(0, ordered.length);
  const stack = new Int32Array(64); // Balanced tree depth < 20 at the 50k-point document limit.
  return (x, y) => {
    let best = cap * cap, length = 1; stack[0] = 0;
    const lowerBound = (id: number) => {
      const n = nodes[id], dx = Math.max(n.minX - x, 0, x - n.maxX), dy = Math.max(n.minY - y, 0, y - n.maxY);
      return dx * dx + dy * dy;
    };
    while (length) {
      const id = stack[--length], node = nodes[id];
      if (lowerBound(id) >= best) continue;
      if (node.left !== -1) {
        const left = lowerBound(node.left), right = lowerBound(node.right);
        // Visit nearer child first so most remote branches are pruned.
        if (left < right) { if (right < best) stack[length++] = node.right; if (left < best) stack[length++] = node.left; }
        else { if (left < best) stack[length++] = node.left; if (right < best) stack[length++] = node.right; }
      } else for (let i = node.start; i < node.end; i++) {
        const [ax, ay, bx, by] = ordered[i], dx = bx - ax, dy = by - ay, squared = dx * dx + dy * dy;
        const t = squared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / squared)) : 0;
        const ex = x - ax - t * dx, ey = y - ay - t * dy;
        best = Math.min(best, ex * ex + ey * ey);
      }
    }
    return Math.sqrt(best);
  };
}

export interface FmsOceanField {
  readonly pixels: Uint8Array; readonly width: number; readonly height: number;
  readonly segmentCount: number; readonly distanceCap: number; readonly maxSampleError: number;
  /** Rendered h20 contour segments the distance source was derived from. */
  readonly contourSegments?: number;
}

/** RG stores a linear 16-bit distance ratio, B=0/A=255. Decoding after bilinear
 * filtering is linear too, including byte carries; no float-texture extension.
 * Distance is visual-only: vHeight still decides every sea/land fragment. */
/** `bandHalfWidth` measures distance from the edge of a stroked source band
 * instead of its centerline; 0 keeps the plain contour distance. */
export function deriveFmsOceanField(doc: Surface, distanceCap: number, resolution = 512, segments: readonly FmsCoastSegment[] = extractFmsOceanCoast(doc), bandHalfWidth = 0): FmsOceanField {
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 1024) throw new Error('海洋纹理尺寸无效。');
  const maxSize = Math.max(doc.width, doc.height);
  const width = Math.max(2, Math.round(resolution * doc.width / maxSize)), height = Math.max(2, Math.round(resolution * doc.height / maxSize));
  const centerline = createFmsCoastDistance(segments, distanceCap + bandHalfWidth), distance = (x: number, y: number) => Math.min(distanceCap, Math.max(0, centerline(x, y) - bandHalfWidth));
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = Math.round(distance((x + .5) * doc.width / width, (y + .5) * doc.height / height) / distanceCap * 65535), offset = (y * width + x) * 4;
    pixels[offset] = value >>> 8; pixels[offset + 1] = value & 255; pixels[offset + 3] = 255;
  }
  // Conservative Lipschitz bound (one texel diagonal + quantization); border
  // clamp is within half a texel. Not a bound on the original camera/JFA path.
  return { pixels, width, height, segmentCount: segments.length, distanceCap,
    maxSampleError: Math.hypot(doc.width / width, doc.height / height) + distanceCap / 131070 };
}
