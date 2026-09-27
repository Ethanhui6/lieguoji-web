import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';
import { boundCurvedRelief, createCurvedRidgeField } from './detail-curved-ridge';
import type { RidgeChain } from './detail-curved-ridge';

type Point = { xQ: number; yQ: number };
export interface NaturalRidge { a: Point; b: Point; widthQ: number; peakQ: number; group: number; widthAQ: number; widthBQ: number; peakAQ: number; peakBQ: number; leeQ: number }
export interface NaturalReliefSummary {
  profile: 'continuous-arclength-ridges-v3'; ridgeSegments: number; ridgeGroups: number;
  rejectedSeaSegments: number; minimumRidgeWidthWorld: number; maximumRidgeWidthWorld: number;
  minimumShelfWorld: number; maximumShelfWorld: number;
  scaleMode: 'world' | 'local'; curveRuns: number; supportNodes: number; maximumBucketCandidates: number;
}
export interface NaturalReliefInput {
  seed: number; size: 128 | 256 | 512; centersQ: Int32Array; land: Uint8Array; coastDistanceQ: Uint16Array;
  reliefMeters: number; shelfWidthWorld: number;
  /** Internal height-planning scale; never a storage format reinterpretation. */
  scaleMode?: 'world' | 'local';
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

/** Legacy segment oracle retained for its existing narrow continuity test.
 * The current generated height field below no longer samples straight spans. */
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
 * At most 19 planning anchors; bounded curve supports and spatial queries.
 * Source buffers are privately copied before the first yield. */
export async function createNaturalRelief(input: NaturalReliefInput, batch: number, control?: DetailShapeControl) {
  if (![128, 256, 512].includes(input.size) || input.centersQ.length !== input.size ** 2 * 2 || input.land.length !== input.size ** 2 || input.coastDistanceQ.length !== input.size ** 2
    || !Number.isInteger(batch) || batch < 64 || batch > 2048 || !Number.isInteger(input.reliefMeters) || input.reliefMeters < 200 || input.reliefMeters > 6000
    || !Number.isInteger(input.shelfWidthWorld) || input.shelfWidthWorld < 16 || input.shelfWidthWorld > 128
    || input.scaleMode !== undefined && input.scaleMode !== 'world' && input.scaleMode !== 'local') throw new Error('自然地貌私有输入规格无效。');
  const centers = input.centersQ.slice(), land = input.land.slice(), coastDistance = input.coastDistanceQ.slice();
  const size = input.size, seed = input.seed, relief = input.reliefMeters, shelf = input.shelfWidthWorld, isLand = input.isLand, stepQ = 4096 * 256 / size, scaleMode = input.scaleMode ?? 'world';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, eligible = 0;
  for (let id = 0; id < land.length; id++) {
    if (land[id] && coastDistance[id] >= Math.min(48 * 256, stepQ * 2)) { const x = centers[id * 2], y = centers[id * 2 + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); eligible++; }
    if ((id + 1) % batch === 0) await checkpoint(control, 'plan-natural-highlands', id + 1, land.length);
  }
  const chains: RidgeChain[] = [];
  if (eligible >= 3) {
    const horizontal = maxX - minX >= maxY - minY, longMin = horizontal ? minX : minY, longSpan = horizontal ? maxX - minX : maxY - minY;
    const shortMin = horizontal ? minY : minX, shortSpan = horizontal ? maxY - minY : maxX - minX;
    const anchors: { target: Point; point?: Point; score: number; group: number; widthQ: number; peakQ: number }[] = [];
    const local = scaleMode === 'local';
    // A local range is sampled at real 2-world fine nodes. Its width and chain
    // count come from eligible land, rather than squeezing three world ridges
    // into every small selection. Very narrow input yields no mountain chain.
    const minimumWidth = local ? 12 * 256 : 4 * stepQ;
    const groups = local ? (longSpan >= 1024 * 256 && shortSpan >= 512 * 256 ? 2 : 1) : (shortSpan >= 8 * stepQ ? 3 : 1);
    for (let group = 0; group < groups; group++) {
      const count = local ? Math.max(3, Math.min(group ? 5 : 7, Math.floor(longSpan / Math.max(96 * 256, 4 * stepQ)) + 1)) : group === 0 ? 9 : 5, side = group === 1 ? -1 : 1;
      const localWidth = Math.min(shortSpan * (group ? .11 : .16), longSpan / (count - 1) * .42, 80 * 256);
      if (local && localWidth < minimumWidth) continue;
      for (let j = 0; j < count; j++) {
        const tQ = roundRatio(j * FIELD_Q, count - 1);
        const start = group === 0 ? 328 : group === 1 ? 164 : 1638, span = group === 0 ? 3440 : group === 1 ? 2294 : 2130;
        const alongQ = start + roundRatio(tQ * span, FIELD_Q);
        const bend = noiseQ12(seed, 7200 + group, roundRatio(tQ * 1408 * 256, FIELD_Q), 0, 512 * 256);
        const branch = group === 0 ? 0 : roundRatio(side * shortSpan * (1229 + roundRatio((FIELD_Q - tQ) * 410, FIELD_Q)), FIELD_Q * 4);
        const longitudinal = longMin + roundRatio(longSpan * alongQ, FIELD_Q), transverse = shortMin + Math.floor(shortSpan / 2) + branch + roundRatio(shortSpan * bend, 4 * FIELD_Q);
        const widthQ = local ? Math.round(Math.max(minimumWidth, localWidth * (.72 + (hashAt(seed, 7210, group, j) % 281) / 1000)))
          : Math.max(minimumWidth, (group === 0 ? 88 : 60) * 256 + (hashAt(seed, 7210, group, j) % 113) * 256);
        const peakQ = (group === 0 ? 3686 : 2130) + hashAt(seed, 7211, group, j) % 410;
        anchors.push({ target: horizontal ? { xQ: longitudinal, yQ: transverse } : { xQ: transverse, yQ: longitudinal }, score: Infinity, group, widthQ, peakQ });
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
    for (let group = 0; group < groups; group++) {
      const selected: RidgeChain['anchors'][number][] = []; let previousAlong = -Infinity;
      for (const anchor of anchors.filter(a => a.group === group)) {
        if (!anchor.point) continue;
        const along = horizontal ? anchor.point.xQ : anchor.point.yQ;
        // Nearest-land snapping must not fold the ordered chain back on itself.
        if (along <= previousAlong) continue;
        selected.push({ ...anchor.point, widthQ: anchor.widthQ, peakQ: anchor.peakQ }); previousAlong = along;
      }
      if (local) for (let i = 0; i < selected.length; i++) {
        const p = selected[i], before = selected[Math.max(0, i - 1)], after = selected[Math.min(selected.length - 1, i + 1)];
        const spacing = Math.min(i ? Math.hypot(p.xQ - before.xQ, p.yQ - before.yQ) : Infinity, i + 1 < selected.length ? Math.hypot(after.xQ - p.xQ, after.yQ - p.yQ) : Infinity);
        p.widthQ = Math.round(Math.min(p.widthQ, spacing * .42));
      }
      // Do not silently widen a ridge across a narrow allowed patch.
      if (selected.length >= 3 && selected.every(p => p.widthQ >= minimumWidth)) chains.push({ group, leeQ: hashAt(seed, 7213, group, 0) % 2 ? 1 : -1, profileSeed: seed, fitArcWidth: local, anchors: selected });
    }
  }
  const curved = await createCurvedRidgeField(chains, isLand, batch, control), ridges = curved.spans;
  const shelfBase = Math.min(112, shelf);
  const shelfWidthAt = (xQ: number, yQ: number) => {
    const [u, v] = rotated(xQ, yQ), region = unit(noiseQ12(seed, 7220, u, v, 512 * 256));
    return Math.max(16, roundRatio(shelfBase * (1434 + roundRatio(2662 * region, FIELD_Q)), FIELD_Q));
  };
  const coastRiseAt = (xQ: number, yQ: number) => {
    const [u, v] = rotated(xQ, yQ); return 6 + roundRatio(30 * unit(noiseQ12(seed, 7221, u, v, 384 * 256)), FIELD_Q);
  };
  const physicalHeight = (xQ: number, yQ: number, isLandPoint: boolean, distanceQ: number, oldSea: number, backgroundLandMeters?: number) => {
    if (!isLandPoint) {
      const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, shelfWidthAt(xQ, yQ) * 256));
      return Math.max(-12000, Math.min(-1, roundRatio(oldSea * rise, FIELD_Q)));
    }
    const [u, v] = rotated(xQ, yQ), lowland = 61 + roundRatio(246 * unit(noiseQ12(seed, 7230, u, v, 640 * 256)), FIELD_Q);
    // World variations span >= four real coarse sample spacings. Local detail
    // instead uses the existing 2-world fine elevation nodes and does not
    // reinterpret the immutable coarse Hbase of an existing world.
    if (backgroundLandMeters !== undefined && (!Number.isFinite(backgroundLandMeters) || backgroundLandMeters < 0 || backgroundLandMeters > 12000)) throw new Error('局部山地旧地形背景无效。');
    const featureQ = scaleMode === 'local' ? 32 * 256 : Math.max(64 * 256, 4 * stepQ);
    const rolling = roundRatio(123 * unit(noiseQ12(seed, 7231, u, v, featureQ)), FIELD_Q);
    const weather = 2867 + roundRatio(1229 * unit(noiseQ12(seed, 7234, u, v, featureQ)), FIELD_Q);
    // The real height query follows the same curves that were land-probed;
    // no later domain warp can move the ridge skeleton across that boundary.
    const highland = curved.sample(xQ, yQ).massQ * weather / FIELD_Q;
    const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, coastRiseAt(xQ, yQ) * 256));
    const meters = backgroundLandMeters === undefined ? relief * boundCurvedRelief(lowland + rolling + highland) / FIELD_Q
      : backgroundLandMeters + relief * boundCurvedRelief(highland) / FIELD_Q;
    return Math.max(0, Math.min(backgroundLandMeters === undefined ? relief : 12000, Math.round(meters * rise / FIELD_Q)));
  };
  const summary: NaturalReliefSummary = { profile: 'continuous-arclength-ridges-v3', ridgeSegments: ridges.length, ridgeGroups: new Set(ridges.map(r => r.group)).size,
    scaleMode, curveRuns: curved.stats.curveRuns, supportNodes: curved.stats.supportNodes, maximumBucketCandidates: curved.stats.maximumBucketCandidates,
    rejectedSeaSegments: curved.stats.rejectedSpans, minimumRidgeWidthWorld: ridges.length ? Math.min(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 3482 / FIELD_Q / 256 : 0,
    maximumRidgeWidthWorld: ridges.length ? Math.max(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 4710 / FIELD_Q / 256 : 0, minimumShelfWorld: Math.max(16, Math.round(shelfBase * 1434 / FIELD_Q)), maximumShelfWorld: shelfBase };
  return { physicalHeight, shelfWidthAt, coastRiseAt, summary,
    /** Copies for numerical evidence; changing them cannot alter the sampler. */
    ridges: ridges.map(r => ({ ...r, a: { ...r.a }, b: { ...r.b } })),
    curves: curved.curves, curveStats: curved.stats };
}
