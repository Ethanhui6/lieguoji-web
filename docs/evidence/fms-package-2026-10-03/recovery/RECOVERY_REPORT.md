# Recovered map generator: bounded local research result

## Outcome

An actual JavaScript map-generation bundle was recovered from the authorized installed game's `resources.assets` TextAsset `main` (path ID 398). This result supersedes the earlier metadata-only audit **for this selected script only**. It does not restore all native C# source or establish full game portability.

- Original extracted wrapper: 496,876 bytes; SHA-256 `805a203a229f64dd992727e1c63ac5e0114984d3fedd74f1d5c475e8a2b381c6`.
- Recovered JavaScript `main.mjs`: 372,646 bytes / 8,054 lines; SHA-256 `df79b44e9a22fb2860ab0b9f8ae48df265594f6cdb2e3f7cd693290de619771d`.
- Selected height-only `terrain-adapter.js`: 75,624 bytes; SHA-256 `420dc9d9dd795406a7334848ec11ee58cb1865d2756ab3b07257a08a9f307c31`.
- Both parse successfully with `node --check`. The original main bundle was not executed. No game executable/DLL/Puerts module was executed.

## Recovery chain

Official Perfare/Il2CppDumper v6.7.46 .NET 6 archive was obtained from https://github.com/Perfare/Il2CppDumper/releases/tag/v6.7.46. Every ZIP entry was checked against absolute paths, parent traversal, duplicate destinations and symlinks before extraction into a new ignored directory; no file was overwritten. Archive SHA-256: `db9bbbc538e33abfb057c7757ae5d6c1f16a05fdc0d13af8a5a67ea31faaba0c`. The release did not advertise an independent digest. RequireAnyKey was disabled in the tool's own local config.

Il2CppDumper exited 0, identified metadata/IL2CPP version 29, CodeRegistration `0x1825F13F0`, MetadataRegistration `0x182A38940`, and generated local dummy/type/address indexes. These generated C# empty bodies are metadata scaffolds, not recovered implementations.

Bounded Capstone 5.0.7 inspection covered the following native loader methods:

| Method | RVA | Observed role |
|---|---|---|
| CustomLoader.GetResourcePath | 0x37B540 | Convert module filename to Resources lookup path. |
| CustomLoader.ReadFile | 0x37B5D0 | Read TextAsset and tail-call the resource decoder. |
| CustomLoader.DecryptString | 0x37B060 | Base64 → AES decrypting stream → UTF-8 reader. |
| HeightMapExternal.Init | 0x38B790 | Create CombinedLoader/JsEnv, load module, resolve generation delegate. |

A local decoder successfully reproduced the resource envelope using the constant referenced exclusively by that loader. Envelope constant values are **not** included in this report, browser adapter or shareable evidence. They are unrelated to account authentication, and no account/SDK configuration was inspected. No BasicMap save decoder was implemented.

## Pure-module extraction and explicit adaptations

`extract-terrain-adapter.cjs` validates the recovered bundle hash and selects 34 declarations, including Alea, numeric helpers, 46 original templates and HeightmapGenerator. `adapter-extraction.json` records source line spans. The unchanged recovered file remains the source of truth.

The adapter removes the unused DOM/image loader and unseeded crypto fallback, replaces observed Unity Boolean reads with explicit inputs, replaces Unity GetCellIndex with a nearest-point search over an explicitly supplied graph, and provides bounded plain-data input/output. Height operations, template commands and seeded PRNG remain selected from the recovered code. Input topology is supplied by the research harness and is **not recovered Unity geometry**.

Interface:

```text
FmsRecoveredTerrain.generate({
  width, height, cellsX, cellsY, cellsDesired,
  seed, template,
  points: [[x,y], ...], neighbors: [[cellIndex,...], ...],
  center: [x,y], sizeFactor,
  isClickToGen?, isMultiContinent?, initialHeights?
}) -> {width, height, seed, template, count, seaLevel:20, heights:[0..100]}

FmsRecoveredTerrain.templates -> 46 available template IDs
```

The browser can load this plain script in an isolated Worker and use `globalThis.FmsRecoveredTerrain`. It has no external dependencies, import, network, filesystem, DOM, Unity or Puerts capability references. Static scan results are saved in the extraction record. The caller must retain a Worker deadline; arbitrary input graphs are not a proven termination domain for every original greedy traversal.

The installed `getLinePower` implementation references an outer cell-data object for the table lookup and therefore falls back to its original default in this adapter. This is preserved, not silently repaired or interpreted as an intended numeric lookup. The original bundle contains additional modules for water/climate/biomes/culture/nations; they are not ported in this adapter.

## Verified scope

`validate-terrain.cjs` runs the selected adapter in separate bounded child processes with Node VM dynamic string/Wasm code generation disabled and no require/process/network bindings. VM limits are 8 seconds and child limits 15 seconds. Four 6,144-point jittered-graph fixtures prove identical seed/template outputs are byte-identical, another seed changes output, another template changes output, and all outputs contain bounded integer heights plus both land and sea.

`validate-lab-templates.cjs` matches the parent research page's exact fixture: 192×128 regular cell centers, 8-neighbor row-major graph, width 1536, height 1024, cellsDesired 20000, seed string `421730`, center `[768,512]`, sizeFactor 1. Every exposed template terminates and produces 24,576 finite integer heights within 0–100, with land (>=20) and sea (<20):

| Template | Land cells | Sea cells | Height range |
|---|---:|---:|---|
| continents | 19082 | 5494 | 0–90 |
| archipelago | 19471 | 5105 | 0–77 |
| highIsland | 11781 | 12795 | 0–100 |
| volcano | 7355 | 17221 | 0–99 |
| pangea | 16200 | 8376 | 0–100 |
| peninsula | 23872 | 704 | 0–100 |
| MoreWorldV8 | 20684 | 3892 | 0–98 |

All seven hashes differ. Archipelago hash `f9f809cf44f96635ba91b92ad041ef3dc0309cd91be0cc0eff275e53dd5406c6` matches the separately observed browser Worker result reported by the parent task. Raw bounded evidence is `bounded-validation.json` and `lab-template-validation.json`; the latter uses 12-second VM / 20-second child limits.

These checks do not claim original native behavior equivalence, original point geometry, visual acceptance, city/administrative simulation, Atlas/save integration, production performance or whole-PH completion. Everything remains ignored local research; no dist, Git push or deployment was changed. Third-party notices and retrieved full licenses are in `THIRD_PARTY_NOTICES.md` and `licenses/`.

## Notice verification correction

The initial source-notice extractor incorrectly matched an overlapping `*/` in the opening banner and wrote an invalid 5-byte file. It has been corrected to search after the opening delimiter. The official Alea source notice is now 1,926 UTF-8 bytes, SHA-256 `41e45411392f1c9b12ce1e067d7b251a60af0b7b6f7e1de51d9456096a421549`; ten checks verify the original MIT and derivative BSD attributions, three redistribution conditions and full disclaimer. `licenses/license-verification.json` records the source and correction. This change does not modify `main.mjs` or `terrain-adapter.js`.
