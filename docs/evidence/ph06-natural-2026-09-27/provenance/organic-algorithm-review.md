# PH06 macro visual revision — local engineering record

The initial production browser run (`browser-first`) completed 9/9 functional tests on the 914-test build. Its six-continent, 650‰ candidate screenshot was **visually rejected**: fixed Voronoi territories, nearly straight internal channels, square outer silhouette, and concentric elevation bands. Functional success does not replace this failure record.

## Changed real generation behavior

- Each seed defines five bounded, connected branch segments and a continuous world-coordinate coastal field. Seed placement accepts the first adequately spaced deterministic candidate rather than always taking the farthest candidate. All choices are reproducible from literal recipe seed bytes.
- There are no pre-cut internal territories. Actual shared-edge frontiers grow from each independent seed, never cross an existing rival land edge, and use a 64–256 world-unit nominal clearance field. The final graph still independently checks all land components from saved elevation samples. The nominal clearance is not claimed as an exact physical width after edited geometry or coarse sampling.
- A cell is queued at most once. Six dynamically sized queues have at most N total lifetime entries, below `2N + 6*64` allocated integer slots; queued cells retain their own immutable priority. Popped candidates recheck rival constraints. Exhausted growth fails explicitly rather than lowering the requested coverage or adding disconnected islands.
- Requested per-continent areas are **soft size preferences**. Field cost and current area pressure choose the next real cell; they do not force a continent into a corner to match a quota. Exact total area remains measured from real Q8 shared quads, with unchanged final bound `abs(1000*Aland - coverage*Aworld) <= 1000*Amax` and exact requested component count.
- The old 700‰ eligible-territory capacity check is inapplicable because there is no eligible-territory mask now. It was not the final area bound. No final area/component gate was relaxed.
- Initial elevations follow branched ridge distance and broad continuous variation, faded to the actual coastline and normalized to the requested relief. Sea depths remain continuous sampled values down to -3000 m. The separate landforms recipe owns authored mountain-range/basin generation; this macro revision does not claim completion of those controls.
- Only elevation blocks are cloned; baseline blocks, manifest, locks, IndexedDB, and URL remain untouched by the algorithm. Cancellation/progress are real cooperative work boundaries. The final quality scan reads final geometry/elevation afresh, independently of frontier ownership.

## Evidence and limits

- `generation/tests-organic-final.log`: 24/24 focused tests, including 1–6 continents, 150/650 coverage endpoints, wavelength and relief endpoints, three real 128/256/512 grids, real edited quad area, independent BFS/shoelaces, scheduling independence, baseline immutability, six cancellation stages and event-loop cancellation, and independent runtime-source fingerprints.
- `generation/lint-organic-final.log`: owned algorithm/fingerprint/Vite/browser-test files passed ESLint.
- `organic-frozen-data-plots/evidence.json`: nine freshly generated 256² outputs from the frozen source fingerprint; rows `山海-72`, `非矩形大陆`, `three-real-scales`, columns 150/400/650‰, each six actual components within the unchanged area bound. Raw integer elevations are retained beside the report.
- `organic-frozen-data-plots/matrix.png`: a direct plot of those real cell elevations with a diagnostic continuous palette. It is **not** a production renderer screenshot, physical-device test, or visual acceptance pass. Earlier matrices remain to document iterations and failures.
- Outer coasts, inlets and ridge orientation are less uniform; high coverage still has some long near-straight outer coast segments and close neighboring landmasses. Actual product screenshots and root/user visual judgement remain necessary. No automatic numeric aesthetic threshold was invented to approve the image.
- Existing browser functional evidence belongs to the old 914 build. It must not be represented as browser evidence for the revised generator. The root will build current source before the next product-browser run.

No cloud writes, publication, or release package was performed.
