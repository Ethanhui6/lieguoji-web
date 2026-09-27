# Natural v2 integration candidate — staging only

Nothing here has been promoted, tested, built or opened in a product browser. Root owns production and is validating the unchanged preview.8. All scripts in this folder are authoring/provenance tools, not a publish step. Do not rerun `edit-mirrors.mjs` or `write-history-test.mjs`: final manual fixes and the first-only ocean binding supersede their initial output.

The candidate registers `shape-detail-landmass@2` and `add-detail-landmass@2` together. The outer Atlas recipe container stays version 1, Atlas document stays version 4 and LGDC stays version 1. Neither v1 kernel was modified. New history entries are the eight identities actually present in the captured preview.8 build and independently matched to all 30 archived runtime source files. V2 history lookup uses `id@2`; a v1 fingerprint cannot be relabeled v2. `detailNatural` and `detailNaturalAdd` retain `outlineEdgeTests`, separate from v1's `originalEdgeTests`.

First v2 verifies and privately owns a truly empty document, then initializes actual regional sea-floor elevations using fixed `natural-ocean-base-v1`. This is part of first-v2 semantics and its runtime fingerprint, with no user-facing implementation parameter. The new ocean buffer feeds the natural kernel; the persisted result is compared against the original actual -100 m base so all changed block hashes are included. Add v2 never calls the ocean helper. It calls the same natural contour kernel only for a new disjoint continent, retaining old pieces, true-quad locks, old Hbase where required and remote sea. Coverage remains an audited disjoint splice, not a falsely claimed reinitialized global union SDF.

UI changes are guarded incremental substitutions in `ui-patches.json` and `entry-browser-patches.json`. **Never copy `review-only-ui/` over production.** Those snapshots are for reviewing and narrow static checks only; root is fixing unrelated IO/cancel/progress behavior in these same files. Apply unique matching snippets to the latest production source, keep every other change, and rebind final hashes. New empty v4 worlds default to natural v2. Saved v1/v2 controls restore their actual style and parameters. The homepage opens v4; explicit v1/v2/v3 routes keep their current interpretation. Internal progress phases become readable current-step labels; original phase/completed/total remain data attributes without an invented total percentage or ETA.

The two existing native browser cases intentionally cover both generations: `atlas-detail-coast` explicitly selects v1 and proves its original save/reload/GPU path; `atlas-add-detail-coast` uses default v2 and its actual build fingerprints, proves first/add/undo/re-add/reload/overlap rejection, checks stored deep-sea heights and unchanged remote sea, and restores v2 controls. Contours, timeouts, probe tolerances and safety assertions remain unchanged. The new entry case only covers homepage/new style and explicit legacy routes. These edits are not claims that either case passed after integration.

Eight new unit cases are written, not run: three control/identity/boundary cases; two actual session/storage/real-piece cases (including actual -100 m initial sea and v1→explicit-v2 addition); three historical codec/closure/cross-version cases. The natural kernel's 10 tests and ocean helper's tests have independent ownership/evidence; this integration does not relabel them as product acceptance.

Before production checks, archive `evidence/preview8/` byte-for-byte to `docs/evidence/ph06-preview8-generator-history-2026-09-27/`. The test source intentionally already uses the final production path. A duplicate under this staging `docs/` tree makes the exact same relative URL usable for staged tests. Preserve its provenance and build commit metadata; do not call this a new build.

When root releases the CPU window, the bounded commands are:

```powershell
node .autopilot/ph06/v4-natural-integration-staging/typecheck.mjs
npx vitest run --config .autopilot/ph06/v4-natural-integration-staging/vitest.integration.config.ts --reporter=json --outputFile=.autopilot/ph06/v4-natural-integration-staging/checks/tests-first.json
```

Keep first raw output/exit for failures. Owned ESLint and eventual unified production typecheck/build/browser still belong to the coordinated root batch. No CPU/GPU validation command above was run during authoring. Do not infer natural-visual, physical-device, whole-PH or performance acceptance from this ready manifest.
