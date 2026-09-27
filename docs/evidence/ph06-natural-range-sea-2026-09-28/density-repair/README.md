# Natural range / regional coast density repair

Production source is frozen. This directory records a runtime index correction and its evidence; it is not a production build, visual acceptance, or an overall passed check run. Root owns the next complete formal-config check and build.

## Original failure and diagnosis

The unchanged combined first run had 305 items: 302 passed and 3 pending after `regional-coast-field.test.ts` failed in `beforeAll` with `山系局部密度超出有界查询预算。`. The copied original evidence is `first-unit.json`, `first-unit.log`, and `first-verification.json`. `before/` and `before-manifest.json` preserve the original runtime/fixture sources. `diagnostic.json` records the expected-refusal diagnostic; its instrumented copy only records the cluster before the original throw.

The exact existing `regional-protect-channel-and-neck` recipe generates 819 supports and 5 curves. Its 32-world bucket (41, 43) reached 193 axis-aligned-box candidates. The complete saved field would have 31,271 AABB references. The excess comes from empty corners of rotated ribbon bounding boxes, not a need to remove real supports. In 289 observations at a 2-world spacing inside the failed bucket, the largest observed number of nonzero contributions was 73; this is a sampled maximum, not a continuous global maximum. See `cluster-analysis.json` and `actual-contributions.json`. `cluster-before.json` is the unchanged full captured cluster and should be archived by bytes/hash, not printed wholesale.

## Runtime correction and invariants

Only `src/world/generation/detail-orography.ts` changed. For a support with a fine-tree `section`, two conservative rotated-axis projection tests remove buckets that cannot intersect its full left/crest/right support rectangle. Touching buckets remain included, with an 8 × Number.EPSILON scale-relative floating-point margin. Existing axis-aligned bounds remain the initial search range. Legacy/local and earlier fine supports without a section take their exact original index path.

The correction preserves all 819 actual supports, all 5 curves, their geometry, their physical contribution formula, and support accumulation order. It retains 32-world buckets and the limits of 192 candidates/query, 262,144 index references, and 4,096 supports. No additional bucket arrays are allocated. The captured-field conservative reindex has 19,441 references and at most 116 candidates, rather than 31,271 references / 193 candidates. `fine-range-tree.ts` was not edited.

## New regression

`src/world/generation/detail-orography-density.test.ts` adds one case. It runs the actual unchanged coast recipe through `generateDetailShapeNatural`, captures the call-through runtime field, requires the same 819 supports / 5 curves / zero rejected branches, and compares indexed output against an independent exhaustive sum over every support. It checks 1,089 bucket-edge/corner points around the original failure with independent ±1 Q8 offsets, plus 9,828 rotated support-corner / ±1 Q8 points: 10,917 queries total. It retains the 192 / 262,144 / 4,096 limits and a positive-query guard. The original coast shape, seed, channel/neck protection assertions, old world/local oracle, and writer lock assertions were not changed.

## Check evidence and harness failure

- `targeted-after.json`: 38 executed test cases passed; zero failed cases and zero pending cases. The run as a whole **failed** (`success:false`, process exit 1), because `detail-natural-writer.test.ts` could not load: `__MACRO_GENERATOR_FINGERPRINT__ is not defined`. Its six cases did not execute. Do not describe this as 44 passed or overall success.
- `targeted-first-config.ts` preserves that run's isolated configuration, which omitted the formal Vite build defines. The 38 executed cases include the original regional coast 3, the new density 1, orography 16, fine-world 7, natural range 10, and range writer 1.
- `vitest.targeted.config.ts` was subsequently changed only to merge the formal Vite configuration. The retry targeting `targeted-harness-repair.json` started before root's stop message arrived. On receipt, session 62520 was interrupted with Ctrl-C and ended exit 1; no retry result JSON was produced. The exact owned command-line process was then absent. This interrupted retry is not additional pass evidence.
- No further target rerun will be made. Root's complete formal-config run of 306 items, including these 44, supplies the next combined validation. This agent ran no build, GPU/browser check, cloud action, or commit.

## Frozen production identity

`source-manifest.json` records the same hashes below. These are actual current file bytes after the repair, not the previous ready snapshot's identities.

| File | SHA-256 |
| --- | --- |
| `src/world/generation/detail-orography.ts` | `79f9a369d50010da020d7212b86b8e8f6b16842568e89cbfe4c617bedd160260` |
| `src/world/generation/detail-orography-density.test.ts` | `3fc9ff0a9fef56527aece86c6dffaedb575a690fefadf2909af864c0229bea04` |
| `src/world/generation/fine-range-tree.ts` (unchanged) | `8f04da2222e4eef1bf7d139e5db36e17d7b32fe5e43e4778095208030b11f089` |
