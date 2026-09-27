# Preview18 relief test oracle

This fixture belongs only to `detail-fine-world-relief.test.ts`. Production modules must not import it. Vite's application entry graph does not include it; do not re-export it from a runtime barrel.

The original implementation comes from local commit `d742a6e917c723bf22f31768efa00b268f48d5b0` (`0.5.0-preview.18`). `detail-natural-relief.ts` and `detail-orography.ts` are byte-for-byte copies of that commit and match the previously frozen candidate baseline hashes. They are not copied from whatever happens to be current production code.

The old algorithm is independent of mutable production helpers. Only its required declarations are included: the fixed-point seed helpers, `boundCurvedRelief`, and the erased `DetailShapeControl` interface. Those declarations are copied unchanged from the same commit; their source ranges and SHA256 values are recorded in `SOURCE_MANIFEST.json`. The helper files add only provenance comments and the local `FIELD_Q` import needed by `boundCurvedRelief`. No coast generator, storage, renderer, Worker, or unrelated old module graph is copied.

`SOURCE_MANIFEST.json` records the original full-file SHA256 values, selected declaration hashes, fixture hashes, and the promoted six-test source. Keep these fixtures frozen. A future baseline needs a separate versioned fixture and explicit provenance; do not refresh this directory from current source to obtain passing tests.

Promotion itself ran no tests or build. The main task owns the combined type/lint/unit/build and browser verification. The test has no `afterAll`, filesystem writes, or dependency on `.autopilot` staging files.
