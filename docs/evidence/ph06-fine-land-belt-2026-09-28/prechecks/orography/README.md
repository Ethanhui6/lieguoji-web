# Isolated orography visual correction

This directory owns only the natural-relief / orography source mirrors and the corresponding narrow tests and evidence runner. Production remains unchanged. The source starting point is preview17, including the root's `let scale: number` correction. Initial work began at HEAD `a909afd76dbbd05755a12ed8922c09cf5fec1bf7`; immediately before the numerical precheck HEAD was `05f566ea90f22ae5aa3e7421cfa221a53b7acec9`. The two production source hashes were unchanged across those commits.

## Current result — numerical PASS, visual not accepted

`checks/continuous-belt-first/verification.json` records 21/21 passed, no retry, unchanged before/after source hashes, verified candidate module loads, and a verified import from the production `detail-shape-natural.ts` to the staged `detail-natural-relief.ts`. This is an isolated numerical precheck, not production, full type/lint/build, browser, real device, performance or visual acceptance.

The actual 256 / 16-world Hbase image is in that same directory. Both the author and root must judge the actual image before promotion. The author observed that the three small beads became a curved band with two broad high areas and visible descending branches, but the high areas remain too rounded. No visual pass is claimed. This round uses the existing preview17 writer and sampler; the independently proposed fine-height writer is not included.

Original sources and tests:

| Target | Production SHA256 at capture |
| --- | --- |
| `src/world/generation/detail-natural-relief.ts` | `9afed003612e843b9df90960375b9a732dbba90ad803f9a182b7174ddc183d5e` |
| `src/world/generation/detail-orography.ts` | `3bf9c9063359a350a3308c9590f9b2cc1028a33552d292eb53129158f7da4c1c` |
| `src/world/generation/detail-orography.test.ts` | `67bd0da80a3a0df01180a51ddff74efe4d97a03309f5185fe5bd6935cdd26861` |
| `src/world/generation/detail-natural-visual-repair.test.ts` | `20925e333cb3d6248d7e664f8ee96231d68186d789fde178ba2bd1545c8be48d` |

## Changes and limits

- Replace three separate compact peak events with a continuous, nonperiodic physical peak–saddle profile. Peak count scales from one to four with actual curve length. Profile positions and widths are deterministic and strictly ordered. The true run endpoint still fades to zero.
- Add several broad nonuniform trunk turns, then snap to private real land and probe the accepted Hermite curves. Branch anchor candidates are selected near peaks of the same envelope; the helper still binds branch height to the actual accepted parent support field and gate, never to a diagnostic peak value alone.
- Expand broad regional shoulders through a C1 function of physical width. Small widths retain the original narrow crest / low foothill relationship. The original width128 fixture still checks `h0 > 3*h32`, `h70 > 50`, `h150 == 0` at the same physical offsets.
- Preserve world/local input, the optional sixth background-metre argument, old sea/shelf/coast taper, bounded sampling/index/probe work, cancellation, private source capture, actual land rejection, parent-only monotone L64 union and its uplift cap. No schema, save, locks, shader, coastline or old sampler changes.
- No erosion or drainage simulation is claimed. No display noise is added.

## Tests

The original five `detail-natural-visual-repair` tests are preserved byte-for-byte after normalizing line endings and substituting only the evidence output directory; `run.mjs` verifies this before execution. Product peak/saddle/width/channel thresholds are unchanged.

The own helper test that formerly asserted exactly three separated event objects now reads continuous profile points, because those events no longer define the height field. It still measures real sampled heights, requiring at least three prominent peaks for the 1600-world fixture, more than 1500 Q peak-to-valley range and unequal measured peak intervals by more than 20 world units. Peak-based sections now use the second actual profile peak; physical 32/70/150-world section offsets and their thresholds are unchanged. The finite-slope test now samples the actual support's side-width saturation position rather than an obsolete constant 128/4 width. Its slope and convergence thresholds are unchanged. The independent all-support oracle uses the stored physical foothill fraction and side-valley position; the spatial-index path remains independent.

One additional test checks adaptive physical peak count and broad shoulders using explicit bilinear interpolation of actual 16-world grid samples, so detail existing only between coarse nodes is insufficient. This test is numerical evidence only and does not replace judging the real same-input continent image.

## First-round observed area, not an acceptance target

Read from the existing raw JSON sample arrays, same 29,207 land samples in both images:

| Metres | Preview17 land fraction | Isolated continuous-belt-first |
| --- | ---: | ---: |
| >=300 | 24.878% | 43.832% |
| >=600 | 8.700% | 27.206% |
| >=900 | 3.883% | 19.471% |
| >=1200 | 2.006% | 12.788% |
| >=1800 | 0.116% | 4.632% |

Maximum height changed from 1911 m to 2157 m. This verifies that widening changed real data, but the large expansion of the high-elevation area supports the visual concern: widening the crest alone can turn thin beads into rounded high masses. No numerical target was adjusted to make that appearance acceptable.

`checks/continuous-belt-first/candidate-snapshot/` preserves the six source/config/runner files copied after the run, verified against the unchanged before/after recorded hashes. Future modifications must use a new evidence label and must preserve this round.
