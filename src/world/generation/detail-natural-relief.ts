import { FIELD_Q, hashAt, integerSqrt, noiseQ12, roundRatio, smoothQ } from './seed';
import type { DetailShapeControl } from './detail-shape';
import { boundCurvedRelief } from './detail-curved-ridge';
import { createOrographyField, planOrographyProfile, type OrographyAnchor, type OrographyChain } from './detail-orography';
import { planFineRangeTree } from './fine-range-tree';

type Point = { xQ: number; yQ: number };
/** New world relief is written to actual 2-world fine elevations. These are
 * physical planning scales, independent of the coarse simulation cell count.
 * Local editing and legacy coarse-only samplers keep their existing contract. */
export const FINE_WORLD_RELIEF_SCALE = Object.freeze({ sampleStepWorld: 2, minimumTrunkWidthWorld: 24, minimumBranchWidthWorld: 16,
  maximumShoulderWidthWorld: 160, rollingFeatureWorld: 32, minimumInteriorWorld: 48, branchSpanWorld: 192 } as const);
export interface NaturalRidge { a: Point; b: Point; widthQ: number; peakQ: number; group: number; widthAQ: number; widthBQ: number; peakAQ: number; peakBQ: number; leeQ: number }
export interface NaturalReliefSummary {
  profile: 'branching-orography-v4' | 'mountain-area-valleys-v1'; ridgeSegments: number; ridgeGroups: number;
  rejectedSeaSegments: number;
  /** Historical guide-ribbon widths, not the footprint of an area mountain. */
  minimumRidgeWidthWorld: number; maximumRidgeWidthWorld: number;
  minimumShelfWorld: number; maximumShelfWorld: number;
  scaleMode: 'world' | 'local'; curveRuns: number; supportNodes: number; maximumBucketCandidates: number;
}
export interface NaturalReliefInput {
  seed: number; size: 128 | 256 | 512; centersQ: Int32Array; land: Uint8Array; coastDistanceQ: Uint16Array;
  reliefMeters: number; shelfWidthWorld: number;
  /** Internal height-planning scale; never a storage format reinterpretation. */
  scaleMode?: 'world' | 'local';
  /** Explicit only at new-world entry points that persist all fine elevations. */
  heightPlanning?: 'fine-world';
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

/** Builds a bounded real height profile. Fine worlds use a temporary valley
 * forest to cut physical heights; no persisted river or water contract.
 * Legacy/local: at most 17 anchors, one trunk and two attached branches.
 * Fine-world tree: explicit independent 15-vertex / 19-record / 14-edge caps.
 * Source buffers are privately copied before the first yield. */
export async function createNaturalRelief(input: NaturalReliefInput, batch: number, control?: DetailShapeControl) {
  if (![128, 256, 512].includes(input.size) || input.centersQ.length !== input.size ** 2 * 2 || input.land.length !== input.size ** 2 || input.coastDistanceQ.length !== input.size ** 2
    || !Number.isInteger(batch) || batch < 64 || batch > 2048 || !Number.isInteger(input.reliefMeters) || input.reliefMeters < 200 || input.reliefMeters > 6000
    || !Number.isInteger(input.shelfWidthWorld) || input.shelfWidthWorld < 16 || input.shelfWidthWorld > 128
    || input.scaleMode !== undefined && input.scaleMode !== 'world' && input.scaleMode !== 'local') throw new Error('自然地貌私有输入规格无效。');
  if (input.heightPlanning !== undefined && input.heightPlanning !== 'fine-world' || input.heightPlanning === 'fine-world' && input.scaleMode === 'local') throw new Error('世界细高程规划模式无效。');
  const fineWorld = input.heightPlanning === 'fine-world';
  const centers = input.centersQ.slice(), land = input.land.slice(), coastDistance = input.coastDistanceQ.slice();
  const size = input.size, seed = input.seed, relief = input.reliefMeters, shelf = input.shelfWidthWorld, isLand = input.isLand, stepQ = 4096 * 256 / size, scaleMode = input.scaleMode ?? 'world';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; const eligible: number[] = [];
  for (let id = 0; id < land.length; id++) {
    if (land[id] && coastDistance[id] >= (fineWorld ? FINE_WORLD_RELIEF_SCALE.minimumInteriorWorld * 256 : Math.min(48 * 256, stepQ * 2))) { const x = centers[id * 2], y = centers[id * 2 + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); eligible.push(id); }
    if ((id + 1) % batch === 0) await checkpoint(control, 'plan-natural-highlands', id + 1, land.length);
  }
  const finePlan = fineWorld ? await planFineRangeTree({ seed, isLand }, batch, control) : undefined;
  const chains: OrographyChain[] = finePlan?.chains ?? [];
  if (!fineWorld && eligible.length >= 3) {
    const horizontal = maxX - minX >= maxY - minY, longMin = horizontal ? minX : minY, longSpan = horizontal ? maxX - minX : maxY - minY;
    const shortMin = horizontal ? minY : minX, shortSpan = horizontal ? maxY - minY : maxX - minX;
    const local = scaleMode === 'local';
    const minimumWidth = local ? 12 * 256 : fineWorld ? FINE_WORLD_RELIEF_SCALE.minimumTrunkWidthWorld * 256 : 4 * stepQ;
    const count = local ? Math.max(3, Math.min(9, Math.floor(longSpan / Math.max(96 * 256, 4 * stepQ)) + 1)) : 9;
    const footprint = local ? Math.min(shortSpan * .18, longSpan / (count - 1) * .55, 80 * 256) : fineWorld ? Math.min(shortSpan * .25, longSpan / (count - 1) * .65, FINE_WORLD_RELIEF_SCALE.maximumShoulderWidthWorld * 256) : Math.min(shortSpan * .45, 256 * 256);
    type Target = OrographyAnchor & { point?: Point; score: number };
    let work = 0;
    const snap = async (targets: Target[]) => {
      // At most 15 target searches over the finite private eligible list.
      for (const id of eligible) {
        const point = { xQ: centers[id * 2], yQ: centers[id * 2 + 1] };
        for (const target of targets) {
          const distance = (point.xQ - target.xQ) ** 2 + (point.yQ - target.yQ) ** 2;
          if (distance < target.score) { target.score = distance; target.point = point; }
          if (++work % batch === 0) await checkpoint(control, 'anchor-branching-orography', work, eligible.length * 15);
        }
      }
    };
    // Tiny/narrow eligible patches deliberately retain only the lowland base.
    if (footprint >= minimumWidth && longSpan >= minimumWidth * 4 && shortSpan >= minimumWidth * 2) {
      const targets: Target[] = [];
      // A few broad, unequally spaced turns define real geography. They are
      // land-probed below, not a post-sampling warp or display texture.
      const bendSign = hashAt(seed, 7200, 0, 0) % 2 ? 1 : -1;
      const bendKnots = [
        { at: 0, value: ((hashAt(seed, 7201, 0, 0) % 501) / 1000 - .25) * bendSign },
        { at: .25 + (hashAt(seed, 7201, 1, 0) % 101) / 1000, value: (.75 + (hashAt(seed, 7202, 1, 0) % 251) / 1000) * bendSign },
        { at: .64 + (hashAt(seed, 7201, 2, 0) % 121) / 1000, value: -(.6 + (hashAt(seed, 7202, 2, 0) % 301) / 1000) * bendSign },
        { at: 1, value: ((hashAt(seed, 7201, 3, 0) % 501) / 1000 - .25) * bendSign },
      ];
      for (let j = 0; j < count; j++) {
        const fraction = j / (count - 1), along = .045 + .91 * fraction;
        let bendIndex = 1; while (bendIndex + 1 < bendKnots.length && bendKnots[bendIndex].at < fraction) bendIndex++;
        const a = bendKnots[bendIndex - 1], b = bendKnots[bendIndex], t = (fraction - a.at) / (b.at - a.at);
        const bend = a.value + (b.value - a.value) * t * t * (3 - 2 * t);
        const longitudinal = Math.round(longMin + longSpan * along), transverse = Math.round(shortMin + shortSpan / 2 + shortSpan * .2 * bend);
        const widthQ = Math.round(Math.max(minimumWidth, footprint * (.78 + (hashAt(seed, 7210, 0, j) % 221) / 1000)));
        targets.push({ ...(horizontal ? { xQ: longitudinal, yQ: transverse } : { xQ: transverse, yQ: longitudinal }), widthQ, peakQ: FIELD_Q, score: Infinity });
      }
      await snap(targets);
      const trunk: OrographyAnchor[] = []; let previous = -Infinity;
      for (const target of targets) {
        if (!target.point || target.score > Math.max(2 * stepQ, footprint) ** 2) continue;
        const along = horizontal ? target.point.xQ : target.point.yQ;
        if (along <= previous) continue;
        trunk.push({ ...target.point, widthQ: target.widthQ, peakQ: target.peakQ }); previous = along;
      }
      if (local) for (let i = 0; i < trunk.length; i++) {
        const p = trunk[i], before = trunk[Math.max(0, i - 1)], after = trunk[Math.min(trunk.length - 1, i + 1)];
        const gap = Math.min(i ? Math.hypot(p.xQ - before.xQ, p.yQ - before.yQ) : Infinity, i + 1 < trunk.length ? Math.hypot(after.xQ - p.xQ, after.yQ - p.yQ) : Infinity);
        p.widthQ = Math.round(Math.min(p.widthQ, gap * .42));
      }
      const sampleStepQ = local ? 512 : fineWorld ? FINE_WORLD_RELIEF_SCALE.sampleStepWorld * 256 : stepQ, leeQ = hashAt(seed, 7213, 0, 0) % 2 ? 1 : -1;
      if (trunk.length >= 3 && trunk.every(p => p.widthQ >= minimumWidth)) chains.push({ group: 0, leeQ, seed, sampleStepQ, ...(fineWorld ? { crossSection: 'fine-world' as const } : {}), anchors: trunk });
      const allowBranches = local ? longSpan >= 1024 * 256 && shortSpan >= 512 * 256 : (fineWorld ? shortSpan >= FINE_WORLD_RELIEF_SCALE.branchSpanWorld * 256 : shortSpan >= 8 * stepQ);
      if (chains.length && allowBranches && trunk.length >= 5) {
        // Attach near strong sections of the same physical envelope. A fixed
        // fraction could hit a deep saddle and make both spurs barely visible.
        // Chord lengths only choose candidate anchors: the helper establishes
        // actual parent height on the fully land-checked Hermite curve.
        const arcs = [0]; for (let i = 1; i < trunk.length; i++) arcs.push(arcs[i - 1] + Math.hypot(trunk[i].xQ - trunk[i - 1].xQ, trunk[i].yQ - trunk[i - 1].yQ));
        const peaks = planOrographyProfile(seed, arcs.at(-1)!).filter(p => p.kind === 'peak'), usedRoots = new Set<number>();
        for (let branch = 0; branch < 2; branch++) {
          const peak = peaks[branch ? peaks.length - 1 : 0]; let rootIndex = -1, rootDistance = Infinity;
          for (let i = 1; i + 1 < trunk.length; i++) if (!usedRoots.has(i) && Math.abs(arcs[i] - peak.arcQ) < rootDistance) { rootDistance = Math.abs(arcs[i] - peak.arcQ); rootIndex = i; }
          if (rootIndex < 0) continue; usedRoots.add(rootIndex);
          const root = trunk[rootIndex], transverseRoot = horizontal ? root.yQ : root.xQ;
          const side = transverseRoot < shortMin + shortSpan / 2 ? 1 : -1, forward = branch ? -1 : 1;
          const branchTargets: Target[] = [], extent = shortSpan * (.32 + (hashAt(seed, 7260, branch, 0) % 61) / 1000);
          const drift = longSpan * (.14 + (hashAt(seed, 7261, branch, 0) % 71) / 1000) * forward;
          const branchMinimum = local ? 12 * 256 : fineWorld ? FINE_WORLD_RELIEF_SCALE.minimumBranchWidthWorld * 256 : 2 * stepQ;
          for (let j = 1; j <= 3; j++) {
            const fraction = j / 3, longitudinal = drift * fraction * (.7 + .3 * fraction), transverse = side * extent * fraction;
            branchTargets.push({ xQ: Math.round(root.xQ + (horizontal ? longitudinal : transverse)), yQ: Math.round(root.yQ + (horizontal ? transverse : longitudinal)),
              widthQ: Math.round(Math.max(branchMinimum, root.widthQ * (.9 - .36 * fraction))), peakQ: FIELD_Q, score: Infinity });
          }
          await snap(branchTargets);
          const selected: OrographyAnchor[] = [{ ...root, widthQ: Math.round(Math.max(branchMinimum, root.widthQ * .9)) }];
          const targetEnd = branchTargets.at(-1)!, dx = targetEnd.xQ - root.xQ, dy = targetEnd.yQ - root.yQ; let previousAlong = 0;
          for (const target of branchTargets) {
            if (!target.point || target.score > Math.max(2 * stepQ, target.widthQ) ** 2) break;
            const along = (target.point.xQ - root.xQ) * dx + (target.point.yQ - root.yQ) * dy;
            if (along <= previousAlong) break;
            selected.push({ ...target.point, widthQ: target.widthQ, peakQ: target.peakQ }); previousAlong = along;
          }
          if (selected.length === 4) chains.push({ group: chains.length, leeQ: side, seed, sampleStepQ, ...(fineWorld ? { crossSection: 'fine-world' as const } : {}), anchors: selected });
        }
      }
    }
  }
  const curved = await createOrographyField(chains, isLand, batch, control), ridges = curved.spans;
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
    // New world elevations and local detail both reach actual 2-world nodes.
    // Their height scales no longer depend on the coarse simulation grid.
    // Existing immutable Hbase sampling is not reinterpreted.
    if (backgroundLandMeters !== undefined && (!Number.isFinite(backgroundLandMeters) || backgroundLandMeters < 0 || backgroundLandMeters > 12000)) throw new Error('局部山地旧地形背景无效。');
    const featureQ = scaleMode === 'local' ? 32 * 256 : fineWorld ? FINE_WORLD_RELIEF_SCALE.rollingFeatureWorld * 256 : Math.max(64 * 256, 4 * stepQ);
    const rolling = roundRatio(123 * unit(noiseQ12(seed, 7231, u, v, featureQ)), FIELD_Q);
    // Actual relief uses the land-probed guide and, for new fine worlds, its
    // area field. The caller's authoritative land/coast gate remains above.
    const highland = curved.sample(xQ, yQ).massQ;
    const rise = smoothQ(roundRatio(distanceQ * FIELD_Q, coastRiseAt(xQ, yQ) * 256));
    const meters = backgroundLandMeters === undefined ? relief * boundCurvedRelief(lowland + rolling + highland) / FIELD_Q
      : backgroundLandMeters + relief * boundCurvedRelief(highland) / FIELD_Q;
    return Math.max(0, Math.min(backgroundLandMeters === undefined ? relief : 12000, Math.round(meters * rise / FIELD_Q)));
  };
  const massif = 'massif' in curved ? curved.massif : undefined;
  const summary: NaturalReliefSummary = { profile: massif?.profile ?? 'branching-orography-v4', ridgeSegments: ridges.length, ridgeGroups: new Set(ridges.map(r => r.group)).size,
    scaleMode, curveRuns: curved.stats.curveRuns, supportNodes: curved.stats.supportNodes, maximumBucketCandidates: curved.stats.maximumBucketCandidates,
    rejectedSeaSegments: curved.stats.rejectedSpans, minimumRidgeWidthWorld: ridges.length ? Math.min(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 3482 / FIELD_Q / 256 : 0,
    maximumRidgeWidthWorld: ridges.length ? Math.max(...ridges.flatMap(r => [r.widthAQ, r.widthBQ])) * 4710 / FIELD_Q / 256 : 0, minimumShelfWorld: Math.max(16, Math.round(shelfBase * 1434 / FIELD_Q)), maximumShelfWorld: shelfBase };
  return { physicalHeight, shelfWidthAt, coastRiseAt, summary,
    /** Copies for numerical evidence; changing them cannot alter the sampler. */
    ridges: ridges.map(r => ({ ...r, a: { ...r.a }, b: { ...r.b } })),
    curves: curved.curves, curveStats: curved.stats,
    ...(massif ? { massif } : {}),
    ...(finePlan ? { rangeTree: { graph: finePlan.graph, stats: finePlan.stats } } : {}) };
}
