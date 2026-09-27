import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';

type Point = { xQ: number; yQ: number };
interface Ridge { a: Point; b: Point; widthQ: number; peakQ: number; group: number }
export interface NaturalReliefSummary {
  profile: 'regional-ridges-lowlands-v2'; ridgeSegments: number; ridgeGroups: number;
  rejectedSeaSegments: number; minimumRidgeWidthWorld: number; maximumRidgeWidthWorld: number;
  minimumShelfWorld: number; maximumShelfWorld: number;
}
export interface NaturalReliefInput {
  seed: number; size: 128 | 256 | 512; centersQ: Int32Array; land: Uint8Array; coastDistanceQ: Uint16Array;
  reliefMeters: number; shelfWidthWorld: number;
  /** Trusted query on the private candidate's actual coverage pieces. */
  isLand: (xQ: number, yQ: number) => boolean;
}
async function checkpoint(control: DetailShapeControl | undefined, phase: string, done: number, total: number) {
  control?.signal?.throwIfAborted(); control?.onProgress?.(phase, done, total); control?.signal?.throwIfAborted();
  if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  control?.signal?.throwIfAborted();
}
const rotated = (x: number, y: number): [number, number] => [roundRatio(3 * x - 4 * y, 5), roundRatio(4 * x + 3 * y, 5)];
const unit = (value: number) => Math.floor((value + FIELD_Q) / 2);
function distanceToSegment(a: Point, b: Point, x: number, y: number) {
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / length2));
  const px = Math.round(a.xQ + dx * t), py = Math.round(a.yQ + dy * t);
  return integerSqrt((x - px) ** 2 + (y - py) ** 2);
}

/** Builds a bounded real height profile. No drainage, erosion or decorative
 * river claim. Only its resulting coarse/fine elevations are persisted.
 * Fixed 19 anchors, at most 16 support segments; no world-sized fine height grid.
 * Source buffers are privately copied before the first yield. */
export async function createNaturalRelief(input: NaturalReliefInput, batch: number, control?: DetailShapeControl) {
  if (![128, 256, 512].includes(input.size) || input.centersQ.length !== input.size ** 2 * 2 || input.land.length !== input.size ** 2 || input.coastDistanceQ.length !== input.size ** 2
    || !Number.isInteger(batch) || batch < 64 || batch > 2048 || !Number.isInteger(input.reliefMeters) || input.reliefMeters < 200 || input.reliefMeters > 6000
    || !Number.isInteger(input.shelfWidthWorld) || input.shelfWidthWorld < 16 || input.shelfWidthWorld > 128) throw new Error('自然地貌私有输入规格无效。');
  const centers = input.centersQ.slice(), land = input.land.slice(), coastDistance = input.coastDistanceQ.slice();
  const size = input.size, seed = input.seed, relief = input.reliefMeters, shelf = input.shelfWidthWorld, isLand = input.isLand, stepQ = 4096 * 256 / size;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, eligible = 0;
  for (let id = 0; id < land.length; id++) {
    if (land[id] && coastDistance[id] >= Math.min(48 * 256, stepQ * 2)) { const x = centers[id * 2], y = centers[id * 2 + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); eligible++; }
    if ((id + 1) % batch === 0) await checkpoint(control, 'plan-natural-highlands', id + 1, land.length);
  }
  const ridges: Ridge[] = []; let rejectedSeaSegments = 0;
  if (eligible >= 3) {
    const horizontal = maxX - minX >= maxY - minY, longMin = horizontal ? minX : minY, longSpan = horizontal ? maxX - minX : maxY - minY;
    const shortMin = horizontal ? minY : minX, shortSpan = horizontal ? maxY - minY : maxX - minX;
    const anchors: { target: Point; point?: Point; score: number; group: number; order: number }[] = [];
    // A long central spine and two shorter, off-axis chains. Their seed-stable
    // bend is specified in world coordinates, not aligned to sample rows.
    for (let group = 0; group < 3; group++) {
      const count = group === 0 ? 9 : 5, side = group === 1 ? -1 : 1;
      for (let j = 0; j < count; j++) {
        const tQ = roundRatio(j * FIELD_Q, count - 1), alongQ = group === 0 ? 410 + roundRatio(tQ * 3276, FIELD_Q) : 1024 + roundRatio(tQ * 2048, FIELD_Q);
        const bend = noiseQ12(seed, 7200 + group, roundRatio(tQ * 1024 * 256, FIELD_Q), 0, 512 * 256);
        const branch = group === 0 ? 0 : roundRatio(side * shortSpan * (FIELD_Q - tQ), 3 * FIELD_Q);
        const longitudinal = longMin + roundRatio(longSpan * alongQ, FIELD_Q), transverse = shortMin + Math.floor(shortSpan / 2) + branch + roundRatio(shortSpan * bend, 7 * FIELD_Q);
        anchors.push({ target: horizontal ? { xQ: longitudinal, yQ: transverse } : { xQ: transverse, yQ: longitudinal }, score: Infinity, group, order: j });
      }
    }
    let work = 0;
    for (let id = 0; id < land.length; id++) {
      if (land[id] && coastDistance[id] >= Math.min(48 * 256, stepQ * 2)) {
        const point = { xQ: centers[id * 2], yQ: centers[id * 2 + 1] };
        for (const anchor of anchors) {
          const score = (point.xQ - anchor.target.xQ) ** 2 + (point.yQ - anchor.target.yQ) ** 2;
          if (score < anchor.score) { anchor.score = score; anchor.point = point; }
          if (++work % batch === 0) await checkpoint(control, 'anchor-natural-ridges', work, land.length + eligible * anchors.length);
        }
      }
      if (++work % batch === 0) await checkpoint(control, 'anchor-natural-ridges', work, land.length + eligible * anchors.length);
    }
    for (let index = 1; index < anchors.length; index++) {
      const a = anchors[index - 1], b = anchors[index]; if (a.group !== b.group || !a.point || !b.point || a.point.xQ === b.point.xQ && a.point.yQ === b.point.yQ) continue;
      const dx = b.point.xQ - a.point.xQ, dy = b.point.yQ - a.point.yQ, steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 256));
      let clear = true;
      // Bounded coverage probes reject observed sea crossings. This is not a
      // hydrological or path-connectivity proof; relief never edits coverage.
      for (let j = 0; j <= steps; j++) {
        if (!isLand(a.point.xQ + roundRatio(dx * j, steps), a.point.yQ + roundRatio(dy * j, steps))) { clear = false; break; }
        if (++work % batch === 0) await checkpoint(control, 'check-natural-ridges', index, anchors.length);
      }
      if (!clear) { rejectedSeaSegments++; continue; }
      const widthQ = Math.max(4 * stepQ, (b.group === 0 ? 100 : 64) * 256 + (hashAt(seed, 7210, b.group, b.order) % 65) * 256);
      const peakQ = b.group === 0 ? 2458 + hashAt(seed, 7211, b.group, b.order) % 1229 : 1229 + hashAt(seed, 7212, b.group, b.order) % 820;
      ridges.push({ a: { ...a.point }, b: { ...b.point }, widthQ, peakQ, group: b.group });
    }
  }
  await checkpoint(control, 'check-natural-ridges', ridges.length, ridges.length);
  const shelfBase = Math.min(112, shelf);
  const shelfWidthAt = (xQ: number, yQ: number) => {
    const [u, v] = rotated(xQ, yQ), region = unit(noiseQ12(seed, 7220, u, v, 512 * 256));
    return Math.max(16, roundRatio(shelfBase * (1434 + roundRatio(2662 * region, FIELD_Q)), FIELD_Q));
  };
  const coastRiseAt = (xQ: number, yQ: number) => {
    const [u, v] = rotated(xQ, yQ); return 6 + roundRatio(30 * unit(noiseQ12(seed, 7221, u, v, 384 * 256)), FIELD_Q);
  };
  const physicalHeight = (xQ: number, yQ: number, isLandPoint: boolean, distanceQ: number, oldSea: number) => {
    if (!isLandPoint) {
      const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, shelfWidthAt(xQ, yQ) * 256));
      return Math.max(-12000, Math.min(-1, roundRatio(oldSea * rise, FIELD_Q)));
    }
    const [u, v] = rotated(xQ, yQ), lowland = 61 + roundRatio(246 * unit(noiseQ12(seed, 7230, u, v, 640 * 256)), FIELD_Q);
    const rolling = roundRatio(82 * unit(noiseQ12(seed, 7231, u, v, Math.max(96 * 256, 4 * stepQ))), FIELD_Q);
    let highland = 0;
    for (const ridge of ridges) {
      const d = distanceToSegment(ridge.a, ridge.b, xQ, yQ); if (d >= ridge.widthQ) continue;
      const profile = smoothQ(FIELD_Q - roundRatio(d * FIELD_Q, ridge.widthQ));
      highland = Math.max(highland, roundRatio(ridge.peakQ * profile * profile, FIELD_Q * FIELD_Q));
    }
    const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, coastRiseAt(xQ, yQ) * 256));
    const profile = Math.min(FIELD_Q, lowland + rolling + highland);
    return Math.max(0, Math.min(relief, roundRatio(relief * profile * rise, FIELD_Q * FIELD_Q)));
  };
  const summary: NaturalReliefSummary = { profile: 'regional-ridges-lowlands-v2', ridgeSegments: ridges.length, ridgeGroups: new Set(ridges.map(r => r.group)).size,
    rejectedSeaSegments, minimumRidgeWidthWorld: ridges.length ? Math.min(...ridges.map(r => r.widthQ)) / 256 : 0,
    maximumRidgeWidthWorld: ridges.length ? Math.max(...ridges.map(r => r.widthQ)) / 256 : 0, minimumShelfWorld: Math.max(16, Math.round(shelfBase * 1434 / FIELD_Q)), maximumShelfWorld: shelfBase };
  return { physicalHeight, shelfWidthAt, coastRiseAt, summary,
    /** Copies for numerical evidence; changing them cannot alter the sampler. */
    ridges: ridges.map(r => ({ ...r, a: { ...r.a }, b: { ...r.b } })) };
}
