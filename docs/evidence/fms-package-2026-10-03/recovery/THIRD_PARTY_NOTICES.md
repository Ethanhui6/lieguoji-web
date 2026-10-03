# Third-party notices for the local recovered terrain research adapter

This notice accompanies the **local-only** `terrain-adapter.js` extracted from the user's authorized FantasyMapSimulator installation. The complete recovered `main.mjs` remains unchanged. This is not a declaration that all components of the original Unity installation have the same license.

## Alea PRNG 1.1

The recovered file, lines 1–3, explicitly identifies:

- Original work: copyright © 2010 Johannes Baagøe, MIT license.
- Derivative: copyright © 2017–2020 W. “Mac” McMeans, BSD license.
- Source URL: https://github.com/macmcmeans/aleaPRNG/blob/master/aleaPRNG-1.1.js

The official repository's full BSD 3-Clause license is retained in `licenses/aleaPRNG-LICENSE.txt`. Its original source notice, including the Johannes Baagøe MIT credit and derivative's BSD conditions, is retained in `licenses/aleaPRNG-1.1-source-notice.txt`. Both were read from the official repository at commit `e1afc01b16c076fadb79837157c19bff9671a110`.

The source notice was verified as 1,926 UTF-8 bytes, SHA-256 `41e45411392f1c9b12ce1e067d7b251a60af0b7b6f7e1de51d9456096a421549`. It includes both authorship/license statements, all three BSD conditions and the full disclaimer. The earlier overlapping-comment delimiter extraction was invalid and has been replaced; `licenses/license-verification.json` records the correction.

- Official license: https://github.com/macmcmeans/aleaPRNG/blob/e1afc01b16c076fadb79837157c19bff9671a110/LICENSE
- Source notice: https://github.com/macmcmeans/aleaPRNG/blob/e1afc01b16c076fadb79837157c19bff9671a110/aleaPRNG-1.1.js

The adapter retains these authorship credits. It disables only Alea's unseeded browser-crypto fallback so this research interface always requires an explicit seed. The seeded PRNG algorithm is preserved.

## Azgaar / Fantasy Map Generator lineage

The recovered source explicitly credits “real-world bases by Azgaar” at line 4690 (those name bases are not included in this height-only adapter). The recovered terrain module also shares the named Hill/Pit/Range/Trough/Strait/Mask operations, helper names and specific template sequences with the official Fantasy Map Generator project. A bounded comparison against official commit `3d94b809dcde4747fa3bb8a7fe727508da2d5e5b` confirms eight generator identifiers and the volcano/highIsland template opening sequences; see `licenses/upstream-comparison.json`.

The official project is MIT licensed; copyright 2017–2024 Max Haniyeu (Azgaar). The full official license is retained in `licenses/Azgaar-Fantasy-Map-Generator-MIT.txt`.

- License: https://github.com/Azgaar/Fantasy-Map-Generator/blob/3d94b809dcde4747fa3bb8a7fe727508da2d5e5b/LICENSE
- Generator comparison: https://github.com/Azgaar/Fantasy-Map-Generator/blob/3d94b809dcde4747fa3bb8a7fe727508da2d5e5b/src/generators/heightmap-generator.ts
- Template comparison: https://github.com/Azgaar/Fantasy-Map-Generator/blob/3d94b809dcde4747fa3bb8a7fe727508da2d5e5b/src/data/heightmap-templates.ts

This comparison supports attribution to the upstream family, not an assertion that the installed bundle is byte-identical to this upstream commit or a complete license audit of the installation. The installed custom template variants and Unity adaptations are preserved as recovered. D3-named helper functions are selected from the owner's recovered bundle; no separately downloaded D3 package is included, and their exact historical upstream revision has not been established.

## Scope and distribution

The complete installation, native DLLs, Puerts/Steam/SDK/crash components, private dump and resource-envelope constants are excluded from the browser adapter. No account credential or SDK configuration was read. No cloud release is authorized by this research work. If a selected recovered module is later shipped, preserve this notice and corresponding full licenses with that module and finish the selected-module provenance review.
