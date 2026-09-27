# Format4 local relief kernel candidate

Owner: compute_audit. Prepared 2026-09-27 for root-controlled integration. **Static candidate only; no test, lint, type, build, browser or performance command was run by this agent for these files.** Production, existing recipes/history and all plan state remain unchanged by this candidate.

## Owned files and API

- `src/world/generation/detail-local-relief.ts`: new pure kernel, including private capture, actual-quad selection/lock projection, incident-node protection, actual-coast distance collection, bounded profile generation, fine tile writes and independent final-piece audit.
- `src/world/generation/detail-local-relief.test.ts`: 10 tests using one generated shared fixture, with explicit cancellation/rejection/determinism cases. These are authored tests, not passed results.
- Existing runtime imports intentionally use production-relative paths. Root will combine these two files with its recipe/adapter/session candidate and run the announced single integrated verification window. No duplicate source tree or copied dependency implementation was created here.

`generateLocalDetailRelief(input: DetailLocalReliefInput, control?: DetailLocalReliefControl): Promise<DetailLocalReliefOutput>`.

Input `base` exactly contains format `lieguoji-detail-local-relief-base`, version1, size128/256/512, full row-major real `centersQ`, `elevationsMeters`, `quadsQ`, complete `detailCoast`, and complete locks `{cellIds,flags}`. Quad order is NW NE SE SW, native Int32 pairs. Locks use native Uint32 ids sorted strictly ascending and native Uint8 known flags. These are derived from a verified private format4 document; this in-process DTO does not authenticate a save or replace the adapter/session/storage verification.

Top-level parameters are seed (nonempty, <=120), reliefMeters (integer200..6000) and cell-rectangle scope. transitionCells is >=1 and <=min(16,floor((min(columns,rows)-1)/2)); no world scope, guessed nominal quad or silent fallback. All caller buffers/maps/scalars are owned before the first await/progress callback. Source buffers are never output for mutation.

Output contains the complete independently owned fine-tile map, unique row-major changed owner keys, actual affected display-tile union and the exact exported `DetailLocalReliefSummary`. It contains **no coarse output, no lock write, no manifest or root mutation**. `changedCoarseSamples` is literal0. Changed-node extrema are explicitly not whole-field extrema. The adapter remains responsible for its chosen clearly described global sample bounds.

## Preservation logic

1. Hbase uses the unchanged actual coarse centers/elevations. All coarse quads are checked for convexity, shared edges and exact centroid agreement; the adapter still verifies the complete original document and identity.
2. Build a fine-cell selection from selected real quads; subtract every touching unselected real quad, then project all locks. A node is editable only if every valid incident fine cell remains selected and has no height lock. This is deliberately conservative at skew edges and shared corners.
3. A two-pass capped Manhattan transform supplies a smooth edit transition. It is never used as coastal distance. At world/selection/lock boundaries, extra unchanged fine rows preserve shared-node authority. The kernel rejects no-editable-interior cases.
4. Actual existing short shoreline segments within the complete capped-distance halo are extracted from canonical pieces; only proven uniform display tiles are skipped. >131072 segments rejects. No nearby segments means capped distance, never a manufactured selection-edge coast.
5. `createNaturalRelief` supplies the current continuous profile. Only real, allowed land centers with enough real coast distance are anchors. At least3 anchors and a measured anchor span of >=4 coarse steps along the long axis, >=2 along the short axis are required; a generated profile must contain an actual nonzero-peak ridge. This leaves the root UI's size128 16×16/transition2 fixture valid in principle, while explicitly rejecting tiny patches. It is not a claim of a new ridge connectivity proof.
6. Only positive-coverage nodes receive land-branch height blended with their old value. Existing sea/zero nodes are never written. Uniform-land owners are materialized by sampling every old node before changing only the allowed slots. All coverage integers retain their old values, including sentinels.
7. Final checks compare every changed owner node, then every affected display cell's actual geometry, zero ties and sea triangles. Protected/nonselected cells compare all heights, too. Unchanged private tiles plus unchanged Hbase close the implicit-field channel. World area is measured from the original exact field and inherited only after proof of identical coverage; the authored test independently measures the final field.

Every algorithm phase checks cancellation and uses the existing real task-yield control. Mask/scan work is partitioned; each built surface is only32×32. The complete coarse quad input is <=8MiB. Fine selection masks use only the selected AABB (at most2048² cells; 1byte eligibility+1byte locks+2byte transition per cell). Source/output fine tile storage is bounded by the existing4096-tile format. No world-sized triangle mesh is retained. These are implementation bounds, not measured latency or memory results.

## Authored checks

- Unique node diff statistics and nonzero real ridges; exact coarse/lock/source bytes unchanged.
- Uniform-land materialization; samples/sea/zero unchanged; changed and untouched slots in a common owner tile.
- Actual skew quad protruding across the nominal selection boundary.
- Real bit2/bit3 fine-cell height protection and bit1 inland height editing.
- Final independently recomputed world area; canonical sea triangles and zero-tie pick.
- Existing fine codec encode/decode and exact persisted pick result recovery.
- Alternate batch64 versus1024 and caller mutation at first progress callback.
- Cancellation in actual quad, partial-write and actual-piece audit phases.
- Sea-only, small and fully height-locked region rejection.
- Zero transition, unknown keys, side-effecting accessors, malformed shared quad and unknown lock bits.

No source widening or migration is authorized by this candidate. Recipe/format fingerprint, exact provenance, durable CAS, undo, refresh, UI and browser verification belong to root's separate integration work. The current static suite primarily uses128 coarse samples; generated256/512 and real-device/visual acceptance are not claimed here.
