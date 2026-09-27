# PH06 nonuniform bay/cape candidate

Status: authored static candidate only. No test, typecheck, lint, build, numerical generation, browser or visual review has been executed for this candidate. Production source was not edited. Root owns promotion after preview14 finishes, prior actual generator identity capture, and integrated evidence.

## Narrow change

The current helper `naturalArcField` places equally spaced alternating positive/negative knots in two harmonically related layers. Their fixed 2:3 mixture can cancel the important features. The new `createNaturalCoastArcPlan` prepares a private bounded event plan once, after the actual rounded source outline and before the fine SDF sampling closure.

Only the structure component is replaced. The original corner round-off, remaining cap interpolation, `naturalFacingSeparation` quarter-distance protection, 48/12-world small roughness, island planning, source validation, 2-world design triangles, target extraction, true distance coverage, saved heights, append protections and audit flow remain in place. Recipe/schema/renderer/sampler/fingerprint constants are unchanged. The legacy `naturalArcField` export remains solely for its existing historical numerical oracle.

`detail-shape-natural.ts` has only three production wiring edits in its mirror: import the planner, await its one-time construction from privately captured seed/perimeter/structure, and query its structure sample instead of the two old harmonic calls. No hidden global seed cache or per-fine-node plan construction is used.

## Profile design and limits

- Broad regional events and smaller shoulder events occupy separate non-overlapping, unequal physical arc intervals. Seeded widths, offset centers, amplitude and left/right shoulder shape vary independently. Both directions exist where the perimeter permits them; signs do not mechanically alternate, and there are intentional quiet gaps.
- Each event is C1 at both ends and its biased peak. Circular arc wrap uses the same private plan, including a feature crossing the origin. Regional crests and local shapes combine as `r + l*(1-r²)` in normalized units, with `|l| <= 0.321`; this remains in [-1,1] without clipping into a flat plateau. A main crest at >=0.85 retains >=0.76 strength even against the strongest opposite shoulder.
- There are at most 48 planned events, 128 fixed arc bins, 1024 bin references and 8 candidates per query. The implementation rejects budget overflow instead of truncating or lowering resolution. The planner reports/can cancel at entry, between its two bounded layers and while indexing. These are code bounds, not measured performance claims.
- Fewer events are used for shorter perimeters. Events under 16-world width are suppressed; amplitude shrinks when physical event width cannot support the requested reach. A perimeter below 96 world receives no structural events. `structureWorld=0` returns an exact zero structure layer. The generator's legal 0..160 structure range remains unchanged.
- The caller still applies real non-adjacent shoreline caps and the single structure+roughness budget. The original total displacement acceptance remains `structure + roughness + 2 world`. A default 96+16 setting cannot create a 500-world peninsula; this batch does not silently expand that contract.

## Files

1. `detail-natural-outline.ts`: original helper mirror plus the new private-plan implementation; original outline and legacy oracle untouched.
2. `detail-shape-natural.ts`: the three thin wiring edits described above.
3. `detail-natural-coast-plan.test.ts`: eight new authored tests.
4. `detail-shape-natural.test.ts`: original ten tests retained, two real-target checks added, existing narrow inlet coverage checks strengthened along its full center path and both land banks. This mirror adds no extra full generation for the two target checks; they reuse the suite's actual generated world.

## Authored checks, all unexecuted

The eight new tests cover unequal broad widths/shoulders, both signed reaches, lack of quarter-perimeter repetition, an independent exhaustive event oracle at 384 bin-edge queries, exact bounds, actual first-derivative continuity, seed/batch reproducibility and private copies, source resampling invariance, exact disabled structure, tiny perimeter behavior, a real tiny island through the actual generation pipeline, and cancellation at the actual new generation entry. The two additional existing-suite tests inspect actual extracted Q8 shore segments, not only planner metadata.

The real shore topology check requires no zero-length or duplicate segments, degree two at every shore vertex, and exactly one closed component for the existing no-islands rectangle fixture. It is a scoped numerical requirement, not a general theorem that arbitrary signed-field edits never touch or split. Any failure must be investigated instead of relaxing the check.

The real bay/cape width measurement independently projects unique extracted target endpoints onto the original user polygon. It computes signed Euclidean offset using source parity, bins by original physical arc at 16-world intervals, groups adjacent positive/negative structural offset runs exceeding the existing 24-world threshold, and excludes only runs shorter than 32 world. Both bays and capes must exist and measured feature widths must differ by at least 32 world. These thresholds identify actual unequal features; they do not establish user visual acceptance or imply a naturalness score.

Existing actual generator tests remain required: source-dense target/coverage/height byte invariance, deterministic batches and first-yield capture, real target distance and saturated Hbase joins, persisted codec recovery, narrow 12-world land neck, rejection of self-contact/input-envelope violations, exact area and coastline pickup, and append/session safety. The inlet mirror adds a 2-world-spaced open sea path from its mouth to its tip region and corresponding land samples on both banks. No previous threshold or deadline is lowered.

## Required actual before/after evidence

Use the existing `detail-natural-visual-repair.test.ts` exporter on the original eight-point `fine-native-additive` input with structure96/roughness16 and no islands. Its unchanged exporter supplies actual 256-coarse persisted height/coverage samples, target coordinates, PNG and SVG with the source outline. Compare that same seed/parameters against the existing `continuous-type-guard-fix` evidence; do not change the recipe to make the comparison look stronger. The parent can apply the above target endpoint/arc-run measurement to that non-rectangular source too.

Then inspect the actual saved browser world at full extent and near the shore: major bays should differ in width and depth, smaller shoulder features should coexist with calmer stretches, and the original narrow channels must remain geographic data. A changed event list, test pass, convex-hull ratio or recolored terrain alone is insufficient. No screenshot, actual generation or user visual approval is supplied by this candidate.

## References and limits

This uses only the existing observations in `docs/REFERENCE_GAME_RESEARCH.md` and the current static audit `.autopilot/ph06/natural-coast-next-review.md`; no new web/video observation or copied game code/art is claimed. It implements original coast morphology within the existing physical data contract. Rivers, erosion, administrative geography and playable nations remain separate planned work.
