# New natural-land explicit fine-height writer candidate

Status: isolated correctness precheck passed; not promoted. No production source,
dist, browser, full suite, release, visual or performance acceptance is included.
The preceding `../REPORT.md` proves a synthetic IDW plane-reconstruction mechanism;
it still does not establish the cause of the real screenshot's visible pattern.

## Exact promotion boundary

`ready-manifest.json` records original and candidate SHA-256 and the actual loaded
dependency hashes. There are two possible production targets:

1. `src/world/generation/detail-shape-natural.ts`: candidate under this stage's
   matching `src/` path, SHA
   `b2c0052cbfe690785c75acb588a13ad0ab78c86bbf1b5e2d7dbaf0a1ba3fc5f5`.
   Its production baseline SHA is
   `11259248bec27fbed7aa13eafb6d1950817dbee1314a61fd36be7371b69b6e63`.
2. New `src/world/generation/detail-natural-writer.test.ts`: candidate is in
   `regression/src/world/generation/detail-natural-writer.test.ts`, SHA
   `bf9e7d6ad8b7975dec76707e875410d460849c8efc4693bc1758133b370dd048`.
   It has six tests, normal relative imports, and no staging output paths or
   virtual baseline module. It needs no production Vite configuration change.

The separate `src/world/generation/detail-natural-writer.test.ts` in this stage
is **audit only**: seven old/new comparison tests, one special `baseline-natural`
resolver, and evidence output. Do not promote that version or the staging configs.
No new runtime helper is needed. Neither orography nor natural-relief is edited.

## Writer contract

The existing `generateDetailShapeNatural` input/output API remains intact. Its
final `write-continuous-heights` pass now visits every generated owner tile.
Previously implicit new `land` owners become existing v4 `samples`, with positive
saturated coverage 32767 and independent Int16 elevation buffers. Existing samples
keep their coverage. Every positive node stores the actual value returned by
`relief.physicalHeight(xQ, yQ, true, coverageQ, -1)`, without blending it into IDW.

Coverage is the already computed distance to actual extracted, quantized coast
segments, with the existing 32767 Q8 cap. The unchanged physical profile's coast
rise saturates by at most 36 world units; 32767/256 is 127.99609375 world units.
Thus the distance cap cannot turn a near-coast node into an inland height. A
uniform land owner is already outside this band. The profile applies its real
coastal rise; a zero coverage node remains exactly zero. Existing shared coast
clipping continues to project shore intersections to zero height. No sampler or
coast-geometry algorithm changes, and no artificial noise is introduced.

Negative samples retain the old shelf/IDW blend with exactly the same arithmetic;
the only cleanup is removing branches whose `land` condition is now always false.
Coarse references are produced before this pass and remain identical to the old
writer. Progress total now includes the newly materialized owner nodes; actual
checkpoints and abort checks still occur at the existing `batchWork` bound.

`generateNaturalDetailShapeAdd` already consumes this function's `freshField` and
needs no edit. Its complete private capture, coarse dependency halo, lock raster,
old-land height materialization and final independent geometry/elevation guards
remain in force. Newly generated positive node values flow through its existing
splice. No old data, generation history or implicit sampler rule is reinterpreted.

An old implicit tile close enough to new coarse influence may still need the
**existing** add wrapper's explicit materialization to preserve its old physical
height. It is therefore wrong to promise every such old tile keeps its encoded
reference in all layouts. The original stored source remains untouched. This
precheck specifically proves exact old encoded hashes for unaffected old implicit
and explicit owners, and their old coarse controls and full surface after append.
The existing near-support materialization protection is retained, not replaced by
a claim that content addresses never change.

## Actual cost and checks

The synthetic 640×512-world contour (128 coarse grid) produced 218 owners:

- 82,429 positive nodes all matched the actual physicalHeight closure.
- 140,729 negative nodes and 74 zero nodes were identical to the old writer.
- 69,579 positive heights differed from old reconstructed values.
- Eight implicit owners became samples. Encoded bytes changed from 863,648 to
  896,416, an actual increase of 32,768 bytes. All coverage, actual target coast,
  total land/sea areas and coarse elevation buffers matched the old writer.

A regular implicit owner changes from 16 encoded bytes to 4,112; boundary owner
sizes are 1,056 nodes (4,240 bytes) or 1,089 nodes (4,372 bytes). The all-owner
upper bound is 4,198,401 distinct owned nodes and 16,859,140 encoded bytes. This is
an exact representation bound, **not** a measured dense-generation result.
Existing document, retained-undo, capacity, storage and cancellation gates are
unchanged. Fine work grows with actual newly persisted land nodes, so its dense
latency still needs measurement before making a performance claim.

Evidence, preserved in order:

- `checks/first/`: failed before test discovery (0 tests) because this isolated
  config lacked the real production fingerprint defines. No implementation test
  passed in this attempt. The corrected config reuses the existing real defines;
  it neither manufactures a fingerprint nor creates a candidate recipe.
- `checks/defines-fixed/`: 7/7 old/new comparisons pass, 12.99s Vitest total.
  Tests cover real per-node height, independent coast distance, old sea/zero/coarse
  equality, existing codec, deterministic batches/source ownership, actual fine
  pass cancellation, additive old implicit+explicit protection, and locked sea
  rejection. `writer-cost.json` and `old-land-refs.json` contain numeric evidence.
- `checks/regression/`: 6/6 normal-import permanent tests pass. Actual loader
  evidence proves the candidate writer was loaded, the old baseline writer was
  not loaded, and the real additive wrapper resolved to this candidate.
- Both successful runs recorded source hashes before/after and actual module
  transforms. The tested writer/dependencies did not drift during either run.

Old retained owner hashes in the additive fixture:

- Implicit `coast:4:4`: `126e87676e1c8bb90a88a1136f3b9742a53ab3b73322f785977aab7fbda76d98`.
- Explicit `coast:5:4`: `649057d6e05fea8995849f1998ec566c7a118ec18b774dcb6b3f7e4e5af1ff16`.

These are real codec hashes from a synthetic kernel fixture, not a claim that an
IndexedDB transaction, full manifest CAS, browser save/restore or player save was
tested in this isolated task. Both real lock kinds are represented by mask 3 in
the retained old land and rejected new-land-in-locked-sea cases.

## Combination and downstream work

The actual tested natural-relief SHA was
`9afed003612e843b9df90960375b9a732dbba90ad803f9a182b7174ddc183d5e`, and orography
SHA was `3bf9c9063359a350a3308c9590f9b2cc1028a33552d292eb53129158f7da4c1c`.
They are the current production pair, not the parallel curved-relief candidates.
`createNaturalRelief(...).physicalHeight` has the same interface in that candidate,
but this does not substitute for the root's planned combined numerical/image run.

The unchanged authoritative sampler SHA remains
`90c432089810b0a5f2a07e2eb6e1f7e716bd8f23fc2132fe5a88781e5904623d`.
The v4 surface kind, sampler, reader, codec, old recipe history, locks, storage and
capacity APIs remain unchanged. Existing files continue to read their old values;
only a new generation operation writes the extra explicit samples.

Before promotion, the existing natural writer test's positive saturated-Hbase
join expectation must change to the new exact physical-height contract. Keep its
negative saturated sea-Hbase join expectation and real-distance assertions.
Also correct the separate numerical evidence caption that currently says inland
resolution remains coarse-only. These are acknowledged downstream changes, not
edits made here; no threshold or visual assertion was relaxed for this candidate.
The real generator fingerprint must continue to come from the promoted runtime
closure. No new PH completion or release readiness is asserted here.
