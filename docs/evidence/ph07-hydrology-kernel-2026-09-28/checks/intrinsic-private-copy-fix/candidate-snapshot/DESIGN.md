# PH07-T1 pure hydrology kernel — first slice

This is independent engineering preparation permitted by the PH07 entry record. PH06's integration and visual gaps remain open. No production import, Worker command, save format, UI, geography edit or PH completion is created here.

## Input and actual fine seam

The kernel owns a copy of a bounded rectangular lattice of the existing v4 fine nodes: `sampleDetailCoastNode` at integer node coordinates, fixed step 512 Q8 = 2 world units. Width and height are each 2..512, product at most 262,144; origin plus dimensions must fit the actual 2049×2049 node lattice. Inputs are `Int16Array` coverage and integer ground elevation with the current sign/range contract: positive coverage / nonnegative land height; negative coverage / negative sea height; zero coverage / zero height. Shared buffers are rejected.

The future extraction adapter must use a stable, validated snapshot and the node's unique owner; it cannot substitute coarse cell IDs or renderer LOD. Explicit `samples` read their stored heights, while existing uniform land uses the accepted base sampler, exactly as v4 currently defines it. This stage does not implement or promote that production adapter. It allocates no full-world fine field and does not alter the old sampler.

Routing land edges are only cardinal 2-world source edges of the fixed NW–SE triangulation. Coverage is linear along each such source edge, so two nonnegative endpoints cannot conceal an intervening sea interval. A zero–zero edge is traversable only when an adjacent source triangle has nonnegative third coverage; a zero-area line surrounded by sea must not become a land bridge. A zero node incident to a negative source-edge neighbour is already the real coast and may terminate there, including the two NW/SE incident diagonals (no land diagonal route is introduced).

Coast terminals use the same canonical Q8 crossing formula as `detail-coast-geometry.ts`: sorted endpoints, exact endpoint zeros, otherwise rounded integer edge parameter clamped to 1..511. Rivers stop at that crossing, never continue through sea to the other bank. A 12-world sea channel therefore has six fine intervals and cannot be skipped by an edge. This is fine geographic routing, not simulation-region adjacency.

## Deterministic drainage and uncertainty

1. Each land node chooses its lowest strictly lower cardinal neighbour, with world row-major ID as the tie-break. A real sea outlet has sea-level potential 0, preferred over an equal zero-height land destination. A coast zero node terminates immediately.
2. All nodes with known lower/coast receivers seed a row-major FIFO. Equal-height unresolved neighbours attach by minimum hop count; ties use the FIFO's stable seed and cardinal-neighbour order. No height is perturbed to resolve a flat.
3. Remaining equal-height components have no known lower exit. A component wholly inside the input gets its lowest row-major node as the natural depression terminal. If the component touches a cropped boundary, it is re-rooted at its lowest boundary node and explicitly unresolved.
4. A topological pass rejects any accidental cycle, accumulates contributing **sample counts** (not rainfall, volume, area or discharge), and propagates terminal basin IDs upstream. Any basin with a contributing land sample on the crop boundary is marked partial/unresolved for every member, even when an internal coast outlet is known. Closed-basin claims require complete local evidence.
5. For depression basins, all represented adjacent basin edges are measured and the lowest saddle records a candidate spill elevation and edge. This is a local geometric spill candidate, not a complete basin-merging or volume/evaporation model.

Ground is never filled or carved. `lakeWaterSurfaceMeters` is a distinct array initialized to `NO_WATER`; a possible spill ceiling is not actual lake water. Rainfall, storage volume, lake spill/merge, cross-patch portals, runoff-driven river selection, exact river geometry, hand edits, Worker commands and persistence remain subsequent work. The current result cannot be called PH07-T1 complete.

## Budgets and cancellation

All per-node state is typed arrays, no object per cell, no recursive traversal or unbounded heap. The intended worst-case working memory is at most 48 bytes per node plus fixed metadata: 12 MiB at 262,144 nodes. Most basins use less because basin arrays are allocated only after counting real terminals. The code will enforce the exact declared typed-array bound before copying input and before allocating basin arrays. Runtime work is O(N+E), with E at most four land neighbours per node plus bounded coast checks. A hard operation budget, batch progress and AbortSignal checks bound every pass. Source arrays and scalar options are captured before the first callback; failed or cancelled work exposes no partial result and makes no input writes.

## Narrow evidence

Synthetic tests will prove strict downhill / flat acyclic paths; stable flat ties across batching; closed pits and measured saddles without ground mutation; unresolved crop propagation; real 12-world channel separation and canonical integer coast crossing; zero-area shore-line protection; contributing-count conservation; private capture, cancellation and invalid-input/work/memory limits. A medium grid will exercise bounded arrays, not claim whole-world or browser performance. No production geography or user save is used.
