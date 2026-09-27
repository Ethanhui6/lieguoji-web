# Natural v2 integration — bounded read-only review

Date: 2026-09-27. Reviewer: shape_generator. Candidate: `.autopilot/ph06/v4-natural-integration-staging/ready-manifest.json`, frozen `2026-09-27T10:20:14.031Z`.

**No concrete reproducible blocking defect was identified in this static integration review.** This is not a candidate test/build/browser result and does not authorize production promotion or visual acceptance by itself.

The review covered the 8 mirrors, 9 new files, two guarded patch sets affecting 5 files, the already checked four natural-kernel files, and the two ocean-helper files. It inspected existing production interfaces only as needed to understand their call boundaries. No candidate, production, test, registry, plan, prior review or archive was edited. No typecheck, lint, unit, benchmark, build or browser command was run in this review.

## Identity and format boundaries

- The captured preview.8 `build.json` SHA is `30b9e2a558e0bf922bf54a75e08d2a3f200db57005e3143614698a6c7d9f58da`; it still matches the actual current `dist/build.json`. All 30 archived source bytes match their recorded SHA. The captured provenance records eight closures matched against that real build. This review did not rerun the closure calculation; the candidate history test independently does so when subsequently executed.
- `generation-history.ts` adds exactly the captured eight prior v1 identities to storage compatibility. V2 validators query `shape-detail-landmass@2` / `add-detail-landmass@2`, while old v1 history remains under the existing id-only keys. A v1 digest cannot be relabeled as v2. The old first/add kernel source remains a separate implementation.
- The two new generators use their own runtime-closure roots and hash domains. Vite injects both new fingerprints and includes their closures in build metadata and development invalidation. The first adapter's runtime import includes the fixed ocean helper; the new ocean semantics therefore participate in its fingerprint.
- Atlas recipe envelope remains version 1, document remains version 4, and fine codec remains version 1. Exact validators require generator version 2 and the complete `coastStructureWorld` parameter alongside all previous parameters. Storage and session both restrict fine recipes to v4, and world-only scope remains enforced. Legacy document envelopes and explicit URL formats are not widened.

## First continent and actual sea-floor persistence

- `detail-shape-natural-adapter.ts` first validates the document/recipe boundary and takes a verified private copy. It rejects existing fine refs/content, generation history, lock refs/content, catalogs, non-UNASSIGNED membership and any nonnegative coarse elevation before invoking `createNaturalOceanBase`.
- The ocean helper receives actual extracted area centroids. Its fixed seed domain and bounded coarse negative heights are input to the natural kernel, not a display texture. It privately owns the centroid buffer before awaiting and has progress/abort checks in both work passes.
- Crucially, the adapter does **not** replace the copied Atlas elevations with the ocean buffer before comparing output. Final elevations are compared against each actual original block slot; changed blocks are written and hashed. Therefore a newly created `-100 m` world's distant sea-floor changes enter the persisted candidate and summary rather than being mistakenly omitted as unchanged.
- Fine tiles and refs are registered from the complete output, hashed, and bound by the existing session provenance/Owned preparation/confirmation/CAS path. Abort before publication only discards private candidate data.

## Addition, old land, locks and distant sea

- `detail-shape-natural-add.ts` changes the new-component kernel call to natural v2 and preserves the prior audited disjoint-splice logic. It does not import or call the first-only ocean helper. Scratch elevations retain existing negative samples, and unchanged generated coarse values do not replace actual prior values.
- The merger retains old land-containing coarse control heights, materializes old implicit heights where changed Hbase support requires it, freezes old land/zero neighborhoods, compares actual final pieces against old land and new geometry, and rejects contact/overlap. Coverage is explicitly described as preserved-component disjoint splice, not a newly exact global union distance field.
- The adapter derives complete lock flags and true quads from the verified private document and invokes `assertAtlasReplacementLocksPreserved` again on the final next document. Existing session/storage guards remain in the publication path. No caller-provided presence flag or skip-validation option was added.
- No new path was found that regenerates remote sea on addition. Distant sea preservation still depends on the unchanged compact Hbase support/materialization logic; this review does not replace its prior correctness evidence or the new actual save/reload/addition tests.

## UI and incremental promotion

- New v4 draft acceptance restores the actual default tuple through `restoreDetailCoastControls(null, seed)`: v2, structure 96, roughness 16, shelf 72, relief 2400, one chain, three islands per chain. It is not left at the component's older transient initialization values once the new draft becomes ready.
- Opening a saved v1/v2 draft restores the stored style, seed and all seven terrain parameter controls, including `islandsPerChain`. Ordinary confirmation/undo intentionally does not overwrite unsaved control choices. Selecting the new style is explicit for an existing v1 landscape; stored fingerprints are not rewritten by displaying controls.
- The frontend recipe builder uses the selected version's actual current fingerprint and matching margin, and copies points. Worker/session validation remains authoritative. The homepage patch changes only new-world entry to v4; explicit legacy formats retain their parsing.
- Existing native v1 tests explicitly select the old style. The additive native scenario is changed to v2 build identities/defaults and adds deep/distant-sea assertions while retaining the original contour, timeout, tolerances and protection assertions. The new entry case is routing/default coverage, not a generation success claim.
- Review-only UI snapshots are not promotion targets. The provided unique-occurrence patches must be applied to current production files so concurrent IO/cancellation/progress edits remain intact. The history evidence must be copied byte-for-byte to its declared tracked target before running the promoted history test. Both requirements are already explicit in the ready manifest; they are not newly discovered defects.

## Evidence and unexecuted scope

- Read-only SHA comparison found no mismatch among all 17 candidate files, 6 declared source dependencies and their dependency copies, 5 review-only incremental snapshots, or both patch JSON files. All 30 archived history sources also match their recorded bytes.
- The separate natural-kernel first check at `.autopilot/ph06/v4-natural-staging/checks/first/` passed 10/10 unit cases and its narrow lint/types. That result is reused only for those four frozen files, not relabeled as integration acceptance.
- The integration's 8 new unit cases (3 controls, 2 actual session/storage, 3 history), its browser cases/patches, and the ocean helper's 3 tests are written but were not executed by this review. The new full first/add/save/restore/undo path and visual result still require the root's coordinated candidate checks.
- The prior natural review's distinction between distance to quantized target segments and the final reclipped shoreline remains applicable. No exact global final-union SDF, hydrology, physical-device, whole-phase, or 250/500 ms performance claim is made here.
