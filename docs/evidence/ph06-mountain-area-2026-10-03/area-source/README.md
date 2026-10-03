# Local integration checkpoint

Root explicitly authorized local game integration to inspect real product rendering; this does not mark natural terrain, PH, or release acceptance. No package/version/history/renderer/docs/plan file was edited by fine_relief.

Candidate `checks/integration-first/` ran the already-written 2 area + 2 gradient cases: 4/4 passed in 2.578 seconds, sourceStable=true. These results apply to that captured candidate version. The production wrapper subsequently added flag-input copying and guide diagnostics; the new production mutation/profile tests and all combined production checks belong to root's unified run, not to that earlier 4/4 evidence. No production test/build/browser/GPU was independently rerun by this agent.

Runtime ownership:

- `fine-range-tree.ts`: explicit `area-v2` flag for new fine generation; guide positions/caps unchanged.
- `detail-orography.ts`: original unflagged body retained, flagged inputs copied before the first await, accepted guide anchors seed the area; internal `guideSample` keeps the original support-index oracle checkable.
- `terrain-massif.ts`: exact gradient-repair-1 physical algorithm, with generation-only valley forest and deterministic bounded physical gradient noise.
- `detail-natural-relief.ts`: summary union uses `mountain-area-valleys-v1` only when the area actually exists; empty planning/unflagged/local paths retain `branching-orography-v4`. Width fields explicitly remain historical guide widths. Returned `massif` is internal diagnostic data; no save/UI contract was added.

New production tests: `terrain-massif.test.ts` **4 cases**, `terrain-gradient-noise.test.ts` **2 cases**. The area cases cover exact frozen22 legacy/fine queries; finite rooted valley forest, physical height beyond a 144-world guide, determinism and seam continuity; real callback mutation/cancellation; and absent-area profile truthfulness. Gradient cases cover deterministic bounded physical variation and value/first-derivative continuity at triangle boundaries/corners.

Updated production tests retain their counts: `detail-fine-world-relief.test.ts` **7**, `detail-natural-ranges.test.ts` **10**, `detail-orography-density.test.ts` **1**, `detail-natural-ranges-writer.test.ts` **1**. Strict small-rectangle seed/geometry, original support count819, 193rd-candidate regression, independent all-support edge/corner±Q8 comparisons, unchanged 192/262144 limits, independent world/local preview18 oracle, sea/coast, and all real writer/codec/source-protection assertions are retained. The all-support oracle now explicitly compares the actual original guide sampler, not the area's intentionally different final elevation. Final area queries still check their own bounded work.

Replaced obsolete assertions and why:

- Fine-world crest width `<60` and peak `>1500` referred to narrow ribbon shape. The new case instead requires physical measurements identical across128/256/512 plus an explicit area profile and broad mountain sources.
- Narrower-than-preview18 ratios and `>1500` crest prominence are no longer the target. Their replacement requires over10 real32-world grid locations outside **all** former guide supports with **over240m actual mountain-only physical elevation**, plus different real2-world heights.
- A 600m floor along every guide center point would disallow newly cut valleys. It is replaced by Q8 physical-height continuity and actual shared parent/root area heights. The separate actual valley test retains its original `.65` depth relationship unchanged.
- The original guide lower-pass `>300`, flank `>100`, parent independent contribution and ULP assertions remain; they explicitly read `guideSample`. This does not claim that these guide events themselves are the new area's final peaks.

All original runtime/test sources before these changes are saved byte-for-byte under `source-before/`, with `source-before.json`. The new independent test-only `test-fixtures/preview22-orography` keeps original22 orography/seed bytes and only its erased control declaration, with source/fixtureSHA manifest. Production tests have no `.autopilot` imports or file-writing effects. Runtime must not import that fixture.

Original budgets unchanged:4096 supports,192 candidate query,262144 index references,131072 combined land probes;5 chains/15 vertices/19 records/14 spans. Extra explicit area budgets:66049 nodes;15 bodies;528392 routing-edge checks;5283920 heap comparisons;1783323 spreading checks;2245666 raw typed working bytes. Query≤31 body/cut terms plus a separately recorded5 noise calls/15 corner kernels. The typed figure excludes JS objects, flagged input copies, guide structures and transient per-sample arrays; it is not a totalheap claim. Valley arrays do not claim persisted rivers, water or lakes.

Visual status remains unresolved: area-v2 first and gradient-repair-1 images are kept; gradient repair reduced rectangular wrinkles but close views still show overly dense small folds and insufficient broad-valley hierarchy. Local integration is for product image review, not visual PASS.
