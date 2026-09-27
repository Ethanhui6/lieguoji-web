import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';

type Point = { xQ: number; yQ: number };
export interface NaturalRidge { a: Point; b: Point; widthQ: number; peakQ: number; group: number; widthAQ: number; widthBQ: number; peakAQ: number; peakBQ: number; leeQ: number }
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
function projectSegment(a: Point, b: Point, x: number, y: number) {
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / length2));
  const px = Math.round(a.xQ + dx * t), py = Math.round(a.yQ + dy * t);
  return { distance: integerSqrt((x - px) ** 2 + (y - py) ** 2), tQ: Math.round(t * FIELD_Q), perpendicularQ: roundRatio(dx * (y - a.yQ) - dy * (x - a.xQ), integerSqrt(length2)) };
}

/** Real height support, separately testable at finite segment endpoints. */
export function naturalRidgeContribution(ridge: NaturalRidge, xQ: number, yQ: number, stepQ: number): number {
  const projected = projectSegment(ridge.a, ridge.b, xQ, yQ), t = smoothQ(projected.tQ);
  let width = ridge.widthAQ + roundRatio((ridge.widthBQ - ridge.widthAQ) * t, FIELD_Q);
  // A binary side switch is continuous on the interior crest (d=0), but NOT
  // beyond a finite segment endpoint where d>0. Blend the side coefficient
  // through signed transverse distance so both endpoint extensions stay C0.
  const lean = Math.max(-FIELD_Q, Math.min(FIELD_Q, roundRatio(projected.perpendicularQ * FIELD_Q, Math.max(stepQ, width / 4))));
  width = roundRatio(width * (FIELD_Q + roundRatio(614 * ridge.leeQ * lean, FIELD_Q)), FIELD_Q);
  if (projected.distance >= width) return 0;
  const peak = ridge.peakAQ + roundRatio((ridge.peakBQ - ridge.peakAQ) * t, FIELD_Q);
  const slope = FIELD_Q - roundRatio(projected.distance * FIELD_Q, width);
  return roundRatio(peak * slope * slope, FIELD_Q * FIELD_Q);
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
  const ridges: NaturalRidge[] = []; let rejectedSeaSegments = 0;
  if (eligible >= 3) {
    const horizontal = maxX - minX >= maxY - minY, longMin = horizontal ? minX : minY, longSpan = horizontal ? maxX - minX : maxY - minY;
    const shortMin = horizontal ? minY : minX, shortSpan = horizontal ? maxY - minY : maxX - minX;
    const anchors: { target: Point; point?: Point; score: number; group: number; order: number; widthQ: number; peakQ: number }[] = [];
    // Staggered mountain groups: their ends are foothills, alternating interior
    // anchors are peaks and saddles, and width is shared at each join. No
    // constant-height capsule or fixed symmetric fork is present in the field.
    for (let group = 0; group < 3; group++) {
      const count = group === 0 ? 9 : 5, side = group === 1 ? -1 : 1;
      for (let j = 0; j < count; j++) {
        const tQ = roundRatio(j * FIELD_Q, count - 1);
        const start = group === 0 ? 328 : group === 1 ? 164 : 1638, span = group === 0 ? 3440 : group === 1 ? 2294 : 2130;
        const alongQ = start + roundRatio(tQ * span, FIELD_Q);
        const bend = noiseQ12(seed, 7200 + group, roundRatio(tQ * 1408 * 256, FIELD_Q), 0, 512 * 256);
        const branch = group === 0 ? 0 : roundRatio(side * shortSpan * (1229 + roundRatio((FIELD_Q - tQ) * 410, FIELD_Q)), FIELD_Q * 4);
        const longitudinal = longMin + roundRatio(longSpan * alongQ, FIELD_Q), transverse = shortMin + Math.floor(shortSpan / 2) + branch + roundRatio(shortSpan * bend, 4 * FIELD_Q);
        const widthQ = Math.max(4 * stepQ, (group === 0 ? 88 : 60) * 256 + (hashAt(seed, 7210, group, j) % 113) * 256);
        const peakQ = j === 0 || j === count - 1 ? 0 : j % 2 === 1
          ? (group === 0 ? 3686 : 2130) + hashAt(seed, 7211, group, j) % 410
          : (group === 0 ? 1720 : 819) + hashAt(seed, 7212, group, j) % 492;
        anchors.push({ target: horizontal ? { xQ: longitudinal, yQ: transverse } : { xQ: transverse, yQ: longitudinal }, score: Infinity, group, order: j, widthQ, peakQ });
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
      ridges.push({ a: { ...a.point }, b: { ...b.point }, widthQ: Math.max(a.widthQ, b.widthQ), peakQ: Math.max(a.peakQ, b.peakQ), group: b.group,
        widthAQ: a.widthQ, widthBQ: b.widthQ, peakAQ: a.peakQ, peakBQ: b.peakQ, leeQ: hashAt(seed, 7213, b.group, 0) % 2 ? 1 : -1 });
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
    // Every added wavelength is >= four real coarse sample spacings. These
    // variations survive persisted Hbase reconstruction instead of aliasing
    // sub-sample fake detail into the inland surface.
    const featureQ = Math.max(64 * 256, 4 * stepQ);
    const rolling = roundRatio(123 * unit(noiseQ12(seed, 7231, u, v, featureQ)), FIELD_Q);
    const warpQ = Math.min(24 * 256, stepQ);
    const wx = xQ + roundRatio(warpQ * noiseQ12(seed, 7232, u, v, Math.max(224 * 256, 8 * stepQ)), FIELD_Q);
    const wy = yQ + roundRatio(warpQ * noiseQ12(seed, 7233, u, v, Math.max(224 * 256, 8 * stepQ)), FIELD_Q);
    const weather = 2867 + roundRatio(1229 * unit(noiseQ12(seed, 7234, u, v, featureQ)), FIELD_Q);
    let highland = 0;
    for (const ridge of ridges) {
      // (1-d/w)^2 has a finite one-sided slope at d=0. Smoothstep there
      // previously created broad, level pipe tops along every entire segment.
      const mass = naturalRidgeContribution(ridge, wx, wy, stepQ);
      highland = Math.max(highland, roundRatio(mass * weather, FIELD_Q));
    }
    const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, coastRiseAt(xQ, yQ) * 256));
    const profile = Math.min(FIELD_Q, lowland + rolling + highland);
    return Math.max(0, Math.min(relief, roundRatio(relief * profile * rise, FIELD_Q * FIELD_Q)));
  };
  const summary: NaturalReliefSummary = { profile: 'regional-ridges-lowlands-v2', ridgeSegments: ridges.length, ridgeGroups: new Set(ridges.map(r => r.group)).size,
    rejectedSeaSegments, minimumRidgeWidthWorld: ridges.length ? Math.min(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 3482 / FIELD_Q / 256 : 0,
    maximumRidgeWidthWorld: ridges.length ? Math.max(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 4710 / FIELD_Q / 256 : 0, minimumShelfWorld: Math.max(16, Math.round(shelfBase * 1434 / FIELD_Q)), maximumShelfWorld: shelfBase };
  return { physicalHeight, shelfWidthAt, coastRiseAt, summary,
    /** Copies for numerical evidence; changing them cannot alter the sampler. */
    ridges: ridges.map(r => ({ ...r, a: { ...r.a }, b: { ...r.b } })) };
}
