# First check and image observation

Authorized root CPU window; actual command:
`node .autopilot/ph06/coast-curves-staging/check.mjs first`.

First run passed without repair. Types 3.000 s; target lint 16.632 s; five behavior
tests 2.150 s; one actual-capture outline comparison 1.007 s. See original
`checks/first/verification.json`; source and named dependency fingerprints were
stable before/after. No production file changed, terrain build or browser run.

Both `output/first/baseline.png` and `candidate.png` were actually opened with
`view_image`. Same original independent 41-point replay, original facing-cap
preparation and frame. White dashes show literal input. Candidate has materially
longer corner transitions; the original angular interruptions recede without
removing the inner sea or pointed peninsulas.

Observed numeric output: longest chord 276.0586 -> 154.0781 world; chords longer
than 80 world 41 -> 8; nodes 464 -> 1085; area 3,798,072.87 -> 3,793,337.41 world²
(about -0.125%). Some long chords remain. The reference contour alone is still
fairly uniformly rounded; natural-continent visual quality has not passed.

This is the rounded reference contour before existing regional SDF features,
coast raster reconstruction, terrain relief and product rendering. It does not
establish final world geometry, gameplay, persistence or device acceptance.
