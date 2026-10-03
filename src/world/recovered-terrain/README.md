# Reviewed local terrain generator

This directory contains the restricted, typed terrain-generation slice reviewed
on 2026-10-04. The public entry is `../seed-terrain.ts`. It accepts an explicit
seed, one of four built-in templates, and the fixed `square-v1` layout. It returns
deterministic research-v2 JSON bytes for the existing strict terrain importer;
it does not write an Atlas, a save, or a generation-history record itself.

## Sources and permission records

The user authorized adaptation of their installed FantasyMapSimulator on
2026-10-03. Implementation input was the reviewed local `terrain-adapter.js`
extraction, whose source record identifies SHA-256
`df79b44e9a22fb2860ab0b9f8ae48df265594f6cdb2e3f7cd693290de619771d`, together with
the project's independent `terrain-worker.js` research adapter. No raw game
entry point, executable, managed binary, configuration, or SDK is included.

The height-command and template family is derived from Azgaar's Fantasy Map
Generator, with changes in the reviewed installed source. This attribution does
not claim that a particular upstream historical implementation was recovered.
The complete MIT notice for Max Haniyeu (2017–2024) is retained in
`licenses/Azgaar-Fantasy-Map-Generator-MIT.txt`. The reviewed upstream license
record was checked at commit `3d94b809` (full audit record is maintained in
`docs/evidence/fms-direct-generation-2026-10-04/PROVENANCE.md`).

`alea.ts` adapts the numeric core of the reviewed Alea 1.1 derivative: original
Johannes Baagøe 2010 MIT attribution and W. Mac" McMeans 2017–2020 BSD terms.
The complete BSD-3-Clause license and original source notice are preserved in
`licenses/aleaPRNG-LICENSE.txt` and `licenses/aleaPRNG-1.1-source-notice.txt`.
The reviewed upstream license record was checked at commit `e1afc01`.
Only the required seeded draw function is retained; no ambient seed, cycle,
range, restart, or public global is exposed.

`numeric.ts` is project-authored finite-number code for averaging, choosing the
first minimum index, and bounded integer enumeration. These functions replace
the three ambiguous `d3mean`/`d3scan`/`d3range` helper names. They are not copied
from, or attributed to, a particular d3-array release. The real Delaunay
implementation is the existing locked `d3-delaunay` dependency; its package
license, `delaunator`, and `robust-predicates` remain governed by their own
dependency notices. No library is fetched or evaluated dynamically.

## Narrow adaptation and compatibility

- Only `archipelago`, `continents`, `highIsland`, and `pangea` recipes are
  included. Only their Hill, Pit, Range, Trough, Strait, Add, Multiply, Smooth,
  and Mask commands remain. There is no arbitrary command/script input,
  probability-based template selector, or unused game functionality.
- Every call owns its point graph, height buffer, Math facade, Alea state,
  parameters, and budget. No global `Math.random` assignment or shared mutable
  generator state exists. Async yields do not change the draw order.
- Source arithmetic, Uint8 truncation points, FIFO traversal, first-ID nearest
  ties, first-minimum ties, and Delaunay neighbor order are preserved. FIFO head
  cursors replace costly `shift()` while retaining iteration order.
- The reviewed `getLinePower()` ignored its argument and looked up an empty
  outer `cells` object. Its actual result was `0.79`, not the `0.82` associated
  with a 20,000-cell entry. The adaptation explicitly keeps
  `legacyLinePower = 0.79`; blob power remains `0.99`. Correcting that legacy
  behaviour would be a new algorithm version and requires fresh evidence.
- Public `square-v1` uses a 192 × 192 ordered point grid, 1536 × 1536 extent,
  jitter fraction 0.42, and topology seed `0x51f15e3d`. Both random offsets are
  consumed for every boundary site even when the corresponding offset is zero.
  This yields 36,864 nodes and 72,962 triangles and maps into the Atlas square
  without an internal rectangular letterbox sea border.
- Internal `classic-v1` retains the 192 × 128 / 1536 × 1024 research layout only
  for compatibility tests. The public request validator rejects this layout.
  It is a web Delaunay reconstruction, not recovered Unity adjacency or proof
  of original Unity output equivalence.
- Byte output fixes `id = 1` and all timing fields to zero, meaning runtime
  measurements are intentionally absent. Height hashes use Uint8 bytes;
  topology hashes explicitly use Float64 little-endian coordinates followed by
  Uint32 little-endian triangles. Timing, locale, and wall-clock time cannot
  change source bytes.

## Bounds, cancellation, and validation

The public request has exactly three fields. Seed strings must already be
trimmed, contain 1–80 characters and no ASCII control characters. The caller
cannot supply geometry, adjacency, initial heights, command text, dimensions,
random functions, or larger budgets. The engine validates its owned graph and
has a fixed ceiling of 50,000 nodes and 256,000,000 work units. Tests can lower
the budget, never raise it.

Range and Trough keep visited-node termination. Strait, whose recovered greedy
walk lacked a bound, now rejects after eight times the node count. No new random
draw or fallback path is introduced. Exceeding either bound throws and discards
the private candidate instead of publishing partial terrain, retrying a new
seed, or silently choosing another layout.

Topology construction, commands, repeated features, and Strait width passes
yield to the caller; loop work also checks abort signals. The existing importer
still independently verifies exact JSON keys, size ≤12 MiB, numeric digests,
canonical topology, complete coverage, and the final Atlas data. This module
does not bypass those checks or alter historical Atlas/generation fingerprints.

The compatibility baseline is seed `421730` / `archipelago` / `classic-v1`:

- Height SHA-256: `491e2fb4a7242724ee0462b965657f8d43581f67e47a4ef1430a5cbab3eb59a4`
- Topology SHA-256: `ede5a394c6957c7eef5f7fd31061732ec3708491d2015e5061057f395e2072cf`

`../seed-terrain.test.ts` checks this baseline, all four square recipes with two
fixed seeds, strict parsing, deterministic bytes, interleaved-call isolation,
global random isolation, request rejection, budgets, and cancellation. These
numeric checks do not substitute for visual or physical-device acceptance.
