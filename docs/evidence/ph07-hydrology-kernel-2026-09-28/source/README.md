# PH07-T1 first hydrology kernel candidate

Status: **isolated module typecheck and 16/16 synthetic tests passed after the private-copy correction; ready for source review, not production or PH07-T1 acceptance**. Entry authority and unchanged phase boundaries are recorded in `docs/evidence/2026-09-28-ph07-engineering-entry.md`.

## Files and executed evidence

- `src/hydrology-kernel.ts`: pure async TypeScript kernel, no production imports or writes.
- `src/hydrology-kernel.test.ts`: the original 14 fixtures plus two private-copy regressions; the canonical coast check imports the existing production fine geometry.
- `DESIGN.md`: input seam, algorithm, declared limits and deferred work.
- `checks/intrinsic-private-copy-fix/verification.json`: current exact executions and result.
- `checks/intrinsic-private-copy-fix/source-before.json` / `source-after.json`: own code/config and the four actually imported stable production coast modules are unchanged. Unused production mountain/writer/UI work is intentionally outside this snapshot.
- `checks/intrinsic-private-copy-fix/candidate-snapshot/`: exact corrected sources, test, configuration, design and runner copied before the check.
- `checks/fine-drainage-first/`: unchanged initial 14-test result and source originals. Its prior ready manifest is preserved as `ready-before-private-copy-review.json`; that candidate's private-copy claim was subsequently disproved, as recorded in `PRIVATE_COPY_CORRECTION.md`.

The local typecheck covers this standalone kernel. The correction run tested the single staged test file: 16 passed, zero failed/pending and no retry. No full project checks, build, browser, Worker product flow, actual-world extraction, persistence or performance acceptance ran. Test runner durations are ordinary functional-check timings, not a hydrology performance baseline.

## What the first slice actually produces

It receives 2-world fine nodes, preserves the input ground and coverage, and returns a deterministic acyclic receiver graph, topological order, contributing sample counts and basin IDs. Rivers are not drawn. A receiver terminates at a canonical Q8 coast crossing, a measured local-minimum flat or an unresolved crop boundary. Equal-height nodes resolve through a stable row-major multi-source FIFO without changing elevation.

Every represented land edge is a cardinal source edge; negative coverage terminates flow and cannot become a shortcut to another island. Zero-area coastal lines are not used as land-area bridges. The two NW/SE incident source diagonals are considered only when a zero node already is a coast terminal, not as diagonal land routes.

Every upstream member of a basin inherits unresolved status when any contributing land sample touches the crop boundary. The terminal's physical kind is retained separately: an observed pit can be real while its complete catchment is still unknown. Measured lowest adjacent-basin saddles provide **candidate** spill heights and edge endpoints. Ground is never filled to those heights, and the distinct lake-water array remains `NO_WATER` because no rainfall/storage/evaporation volume has been supplied.

## Hard bounds

- Input dimensions: 2..512 in each direction; at most 262,144 fine nodes, within the actual 2049×2049 lattice. This is a bounded geographic sample patch, not a new simulation-region grid.
- Heights: integer -12000..12000 metres, checked against the existing signed coverage contract; invalid coverage -32768 and shared buffers are rejected.
- Memory: 24N bytes of node/work arrays plus 24B bytes of basin arrays, B <= N. The hard upper bound is **48N bytes / 12 MiB**. This counts all typed arrays, including copied inputs and temporary indegrees; it is not a promise about the host JavaScript runtime's entire heap.
- Work: O(N+E), no recursive walk or priority heap, with a hard operation budget of 64N+1024 and a bounded FIFO. Batch boundaries have progress, AbortSignal checks before/after callbacks and cooperative yields.
- Failure and cancellation return no partial result and do not mutate the caller's arrays. Stable scalar dimensions and each source-array reference are captured once. New budgeted arrays are populated with the captured intrinsic typed-array `set`, without consulting a source instance's `slice`, iterator or subclass species; ownership is established before the first callback.

## Evidence scope

The tests exercise a sloping island, equal-height ties across different batching, closed bowls and real saddle heights, a cropped outlet's full upstream uncertainty, a pit whose catchment reaches the crop, an actual 12-world sea channel, direct comparison with the existing canonical fine coastline clipping, zero-area coastal lines, a zero node's source-diagonal coast contact, private capture and structured cloning, cancellation during actual phases, invalid/budget inputs, a 256×256 mixed land/sea grid and empty sea. The medium grid verifies topological/contributing-count conservation and exact typed-array accounting, without interpreting sample counts as physical runoff.

## Work still required

This does **not** complete PH07-T1. The stable world snapshot extractor, cross-patch portals and complete watershed stitching, Worker command/response identity, runoff and lake water balance, spill/merge behavior, hydrological graph/geometry persistence, invalidation after edits, preview/confirm/cancel and map display are not connected. Exact lake surfaces, real rivers, hand-edited rivers affecting travel, saving/restoring and full product/browser/device evidence remain subsequent work. No schema or original geography is modified, and the frozen PH06 visual candidates remain untouched.
