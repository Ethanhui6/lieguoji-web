# Natural v2 visual repair candidate — staging only

The actual preview.9 screenshot showed two near-octagonal continents, equal-width rounded mountain pipes and a repeated central-spine/two-branch shape. Correctness tests had passed; that did not make the natural appearance acceptable. Source reviewed against `natural-checks/desktop-first/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-desktop-chromium/second-continent-preview.png`.

Only three current natural-v2 files and one new narrow test are candidates. No production, old @1 kernel, manifest/codec, renderer, GPU cache/budget, UI, recipe field or historical registry was modified. Root owns provenance/current fingerprint registration before promotion. Do not treat these file SHA values as a registered generator fingerprint.

## Diagnosis and actual geography changes

The previous relief used `max(peak * smoothstep(1-d/width)^2)` for each segment. Every segment had one peak and one width; distance was clamped to segment endpoints. At `d=0`, smoothstep has zero slope, producing a flat crest and rounded capsule ends. Three fixed anchor groups made the same fork even on unrelated contours.

The candidate keeps the existing maximum of 19 anchors/16 support segments. Group offsets and bends are staggered. Shared anchors now carry a width and peak value; internal peaks alternate with actual saddles, and end anchors descend to foothills. Width changes continuously along the segment. Asymmetric side slopes meet at a pointed `(1-d/w)^2` crest, rather than a smoothstep flat top. Their side coefficient also varies continuously across the ridge axis, including both finite endpoint extensions. A bounded common coordinate warp bends the height supports. Spatial modulation is sampled at wavelengths at least four coarse spacings, with a separate lowland field. All values become real coarse/fine elevations and reconstruct through the existing Hbase sampler. No decorative mountain image, fake river or renderer postprocess is involved.

At size256, inland spacing remains 16 world. The shortest added height wavelength is64 world; at size128 it is128 world. The support radii remain broad enough for coarse samples. Nothing adds sub-grid inland geometry, a new fine inland layer, erosion or drainage. Discrete integer heights and existing Hbase interpolation still limit near-view fidelity; this candidate does not claim to remove that limit.

The previous shoreline cap compared all nonadjacent segment endpoint distances. A same-shore turn whose tangent dot product became negative lost the arc-neighborhood exemption. Closely spaced gesture fragments could therefore shrink the cap even though they were not opposing bay/neck banks. Corner cuts were also limited to one quarter of each tiny input segment. Finally, independently signed periodic knot values could make the structural field weak or mostly one-sided, leaving a rounded version of the same polygon.

The candidate validates the literal source first, then removes only points whose entire original merged run lies within2 Q8 units (1/128 world) of the retained segment. The error is checked against original points, not accumulated across removals. Zero-variation input retains its literal source. Point count/work ceilings and cancellation remain bounded.

Feature comparison now requires opposing local normal cones, or connectors within asin(1/3) of both segment normals so gently tapering banks remain protected. Interior parallel overlap is checked explicitly: endpoint-only normal-cone tests otherwise miss a U-shaped channel. Detected opposing banks retain a quarter-separation cap with Q8 reserve; corner displacement still consumes that same cap. The cap is propagated continuously, derived contour intersection checks remain, and original narrow-bay/neck tests remain unchanged. These conditions are not presented as a theorem that every possible sub-grid channel survives final2-world quantization.

The closed periodic structural field has alternating, unequal bays/capes and a seed-specific phase. Revision2 weights the320-world component3/5 and the768-world component2/5, making actual medium-scale indentation visible without increasing the player's amplitude envelope. Small coastal roughness remains separate. True target-segment distance reconstruction, fixed fine sampling, area audit and old sea/land classification paths remain intact.

## Checks and numerical evidence

All runs used one worker, zero retries, unchanged production source during each run, and the original assertions in `src/world/generation/detail-shape-natural.test.ts`.

| Run | Scope | Result | Actual visual observation |
| --- | --- | --- | --- |
| `checks/first/` | existing10 + new4 unit cases; narrow lint/types |14/14, lint0, types0 | Pipes removed, but peaks looked isolated and the outer coast still resembled a diamond. Insufficient visual improvement. |
| `checks/revision2/` | same14 cases after actual saddle/mid-scale coast adjustment |14/14, lint0, types0 | Low ridges connect peaks and a southwest bay is visible. Peak tops remain rounded at this sampling density. Candidate only; no product visual PASS. |
| `checks/output-guard/` | new4 only after bounding numerical evidence writes |4/4, lint0, types0 | No new terrain change. Explicit output label and no-overwrite writes protect previous evidence. |
| `checks/continuity-first/` | one new finite-endpoint continuity reproduction |1 failed,4 not selected; lint0, types0 | Independent review found side-width switching causes a jump outside segment endpoints; actual difference534 Q12 against unchanged bound2. Failure preserved. |
| `checks/continuity-repair/` | existing10 + new5 after continuous side-coefficient repair |15/15, zero skipped, lint0, types0 | Final candidate numeric map retains the revision2 direction; actual product visual assessment remains pending. |

The final accepted narrow scope is15 unique identities, not the sum of all repeated executions. The original ten assertions were not relaxed. The finite-endpoint regression was first executed against the faulty field and failed; the final complete15 all pass. The first image is retained despite its visual insufficiency. Raw command arrays, exit codes, logs, JSON and production/candidate SHA before/after are stored in each run. Execution durations are records only: root also ran independent correctness checks, so they are not performance comparisons or250/500ms acceptance.

The new five cases verify: positive and negative coast displacement beyond16-world detail roughness on the real native-test eight-corner contour; byte-identical actual fine/coarse output when each straight gesture edge is resampled four times; a12-world opposing-bank cap and source-unchanged cancellation; multiple actual peaks/saddles, foothill endpoints and differing measured cross-section widths; continuous asymmetric side slopes across both finite endpoint extensions without removing the side-to-side difference. Existing tests still verify12-world inlet/neck, distance/codec/area/classification, source ownership, work-batch determinism and cancellation.

`actual-256-height-field.json` records the real generated coarse heights, diagnostic target coast and sampled authoritative heights. The fixture uses actual area centroids from a size256 Atlas draft, the production fixed ocean base and the same `fine-native-additive` seed/native first-contour geometry as the product scenario. ThePNG is an unlit numerical elevation map of the actual fine coast plus Hbase, sampled every4 world. TheSVG uses identical samples with the original outline in white. Its color scale is fixed between runs. It is neither the Pixi product renderer nor a new stored terrain layer. The original source and exact actual browser drawn Q8 points may differ slightly through input coordinate quantization; no claim of screenshot-pixel equivalence is made.

## Promotion boundary

Check all three production baseline SHA values before merging. Add the one new test with no existing target overwrite. The staged configs/runner and numerical artifacts are local evidence, not product modules. The test writes numerical evidence only when an explicit safe `NATURAL_VISUAL_EVIDENCE_LABEL` is supplied; all writes use exclusive-create so old files cannot be overwritten. Ordinary unit execution without that variable creates no image/JSON. Preserve every frozen evidence directory, including the failed continuity round.

The recipe remains natural v2 in this candidate; root must register the actual old preview.9 fingerprint as storage history and derive the new current fingerprint from the complete promoted runtime graph. No stored world may be silently regenerated/relabelled. Actual first/add/confirm/restore browser rendering, user natural-visual acceptance, physical devices and PH06 completion remain pending. Do not extrapolate this one seed/contour into a universal natural-quality claim.
