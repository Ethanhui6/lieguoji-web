# PH06 continuous curved relief candidate

Status: static candidate only. No lint, typecheck, unit test, numerical generation, build, browser, performance or visual acceptance was run by this agent. Production files are unchanged by this work.

## Owned files

- `src/world/generation/detail-natural-relief.ts`: mirror of the recorded production baseline, now connected to a bounded physical curved ridge field.
- `src/world/generation/detail-curved-ridge.ts`: continues the existing interrupted helper, retaining shared Hermite tangents and its compact integrated support/index design.
- `src/world/generation/detail-curved-ridge.test.ts`: ten authored tests, not ten passing results.
- `src/world/generation/detail-natural-visual-repair.test.ts`: exact production mirror with only the existing mountain acceptance test's measurement coordinates updated; its four other tests remain unchanged.

## Actual design and integration contract

`createNaturalRelief` accepts optional `scaleMode: 'world' | 'local'`, defaulting to `world`. The same ordered real-land anchors now feed shared C1 cubic tangents. The ordered-axis derivative and tangent length are bounded; actual Q8 curve probes have a pre-rounding maximum step of 1 world, finer than the existing 2-world fine elevation spacing. A span whose observed curved path leaves allowed land is rejected and separates physical runs. This is a sampled path check, not a proof of all continuous coverage between probes.

Height is an integrated compact support field along each real run. Width and peak/saddle profile use physical accumulated arc length. Only actual run endpoints fade; extra collinear curve joins do not reset peak/saddle phase or endpoint fade. Endpoint gates clip support extending beyond the real end tangent planes. Because the natural planner orders anchors along the long axis, its chains cannot be folded into a closed loop by nearest-anchor selection. This is an original terrain approximation, not erosion or hydrology.

The reviewed side-width discontinuity is corrected in this candidate: the signed transverse blend is the bounded odd cubic `1.5z - 0.5z³` for `z` in [-1,1], with saturated ±1 outside. Its derivative reaches zero at both saturation points, preserving C1 width and the existing 1.15 width bound used by the index. The radial compact kernel is C2, while its composed variable-width field claims C1. The separate exhaustive oracle now uses a remapped ordinary smoothstep equivalent, and an additional real-field finite-slope test probes both ±width/4 joins and both lee directions at successively separated 1-world and 1-Q8 offsets. This remains unexecuted static repair, not passed smoothness evidence.

The previous independent finite-segment oracle remains exported for its narrow legacy continuity test, but current `physicalHeight` never calls it. No domain warp is applied after curve land checks. Multiple ridge contributions combine continuously and use continuous high-relief compression instead of per-segment hard maximum and a flat full-relief plateau.

The field caps support nodes at 4096, index references at 262144, per-bucket query candidates at 192, and actual curve probes at 131072. Query gate scratch is private and reused rather than allocating a Map at every fine node. Invalid density/budgets reject; they are not relaxed or silently truncated. These numeric caps are code limits, not performance measurements.

Local mode uses real eligible land span to choose fewer chains (normally one for a 45×30 region), narrows widths against available transverse span and neighboring anchor spacing, and additionally limits widths using measured curve arc distances. The minimum local planning width is 12 world; tiny unusable selections yield no viable chain so the caller's existing rejection remains meaningful. World mode keeps coarse-scale widths and noise wavelengths. No coarse Hbase, sampler, schema, renderer, local kernel or save format is changed here.

`physicalHeight(xQ, yQ, isLandPoint, distanceQ, oldSea, backgroundLandMeters?)` retains its five-argument call. The optional sixth argument accepts finite floating point meters in 0..12000. For land it replaces the newly generated lowland/rolling background, adds only the new ridge component, applies the existing coastline taper and rounds the final actual height into 0..12000 meters. Omitting it uses the world lowland/rolling profile and the requested relief cap. Sea behavior ignores this land background and remains unchanged. This interface is coordinated with the separate local-background candidate; that kernel is not owned or edited here.

`ridges[].peakQ` remains nonzero for a viable span even where an interior peak lies between two faded end diagnostics. `ridges` is compatibility/numerical evidence, not the sampled straight-line production field. New `curves` and `curveStats` are private diagnostic copies, not persistence authority.

## Authored narrow checks

1. Curved path deviates from the straight chord, shares its join tangent and has no internal endpoint fade; actual curve probe spacing is bounded.
2. Both real endpoints and their outside tangent extensions have zero contribution; interior joins stay active.
3. Actual curved paths entering a deliberately excluded area are rejected although their straight chords stay inside.
4. Whole-chain physical peak/saddle sampling is invariant to inserting collinear cubic joins.
5. Spatial-index samples match a separate exhaustive all-support oracle at 384 bucket-edge coordinates and obey candidate/reference bounds.
6. Private copied input/diagnostics, deterministic work-batch results, and abort with untouched source.
7. Continuous relief compression has no hard plateau.
8. Real eligible local fixture reduces chain count/width versus default world and keeps the five-argument API.
9. Actual optional old-land background replaces lowlands, retains coast taper and sea behavior, and rejects invalid background.
10. Finite slopes of the real support converge at both side-width saturation points for both lee directions, while the samples remain inside a nonzero sloping kernel.

## Existing mountain acceptance measurement update

The existing mountain acceptance keeps its seed, size-128 fixture, land region, 2400m relief and generation call. It now measures actual curve positions at 8-world arc intervals. True curve endpoint elevations still must be below `2400 * .2`. A summit still must stand strictly more than 200m above a saddle on **both** sides, and at least two such summits are required. At dense arc stations immediate neighbors describe the slope rather than a saddle, so each summit's two saddles are found by searching toward each side until a higher summit or the true endpoint; flat summit plateaus count once. The greater-than-800m elevation range check remains. No threshold is lowered.

Width sections retain their original count, `-256..256` lateral extent, 8-world step, `>400m` height cutoff, and minimum 32-world width variation. Only their coordinate frame changes: centers are equally spaced along the actual curve arc and cross-sections follow its true interpolated unit normal, instead of crossing the chord between obsolete straight anchors. The at-most-16 planned ridge spans assertion remains. The other four tests and numerical evidence exporter are untouched. This is a necessary coordinate/feature measurement migration because the production field no longer has alternating peaks at a fixed set of straight-span anchors; it is not evidence that the new terrain meets these checks.

## Root follow-up requirements

- Review and promote only after baseline SHA still matches. Freeze the actually built prior generator closures before changing any new build identity; this common helper changes first-continent, append-continent and local-relief runtime closures.
- Promote the included `detail-natural-visual-repair.test.ts` mirror together with the new helper so the mountain-peak/saddle and width acceptance measures the current physical curve. Its unchanged thresholds still need to pass; no outcome is supplied here.
- Run real affected tests, lint/typecheck/build, independent coarse and local height slices/contours, then actual persisted browser before/after. Reject or fix faults; none of these results are supplied here.
- Check endpoint gates, repeated/fragmented ridges, populated elevation locks, very narrow selections and actual visual naturalness. Finite coverage probes do not independently prove footprint confinement, and the local kernel must keep its existing exact allowed-node and locked-piece audit.
- Performance, input/progress/cancel latency, all user visual acceptance, physical devices, PH06 completion and full game completion remain unproven.
