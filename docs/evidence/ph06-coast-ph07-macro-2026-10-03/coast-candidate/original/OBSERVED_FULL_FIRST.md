# Complete-generation first comparison

Actual command: `node .autopilot/ph06/coast-curves-staging/full-check.mjs first`.
The root kept generation, engine, history and dist unchanged for this window.
Types 3.345 s, target lint 1.686 s, actual baseline generation 25.075 s and
candidate generation 25.132 s all passed on the first run. Source hashes stayed
stable. Original five outline cases were reused rather than rerun.

Baseline is bound to actual `0.5.0-preview.23` build JSON SHA256
`6be150d0e278ea1d6b67f27fe2c2e50599adca77c6f647d9cbe6c8d5f9277f1f`,
original embedded build commit `2f2348d8147b567a2837f689025dced949d52183`.
The runtime closure has 29 files; its fingerprint is
`120162f551b525adf6c57ef6cf35e2122febd2b26ff58c4ac5e030f655141a90`.
Replacing only `detail-natural-outline.ts` yields candidate closure fingerprint
`227276262d201e5aeb3c1d0958fe977cddc947817c8adbb76aeda61639792ff5`.
These are algorithm comparison identities, not registered production versions.

Both runs used the identical original 41-point independent UI capture, verified
native 256-world centroid blocks and natural-ocean transformation. Capture,
centroid, generated ocean input and all four views have identical hashes between
runs. Land samples came from actual persisted two-world owner fields.

| Actual check | Baseline23 | Candidate |
|---|---:|---:|
| Fine sample packets codec round-tripped and saved | 1,427 | 1,417 |
| Actual fine owner nodes in those packets | 1,461,248 | 1,451,008 |
| Uniform-land/Hbase fallback nodes in view sampling | 0 | 0 |
| Fine-node reads across physical and coverage images | 1,568,590 | 1,579,918 |
| Omitted-sea reads using the actual natural Hbase | 530,612 | 519,284 |
| Requested/placed islands | 3 / 1 | 3 / 2 |
| Target coast segments | 11,446 | 10,962 |
| Actual audited fine cells | 407,552 | 392,192 |
| Source maximum envelope | 112 world | 112 world |

Both keep `mountain-area-valleys-v1`, exact total land+sea area conservation,
original source caps, nonnegative remaining caps, explicit skipped-island
reasons, and zero uniform land tiles. Every actual fine packet was encoded,
decoded and reencoded byte-identically. Its raw packet and hash are retained in
each variant's `fine/` directory. This is a codec check, not browser save/load.
The island position/count and mountain placement can change because their
unchanged algorithms consume the modified shoreline; this is not a rendering-only
change and old accepted worlds must retain their old generator identity/data.

Eight images were actually opened with `view_image`: both variants' full and
inner-sea physical images and coverage images. The previous straight, angular
bay mouth and triangular peninsula tip now have longer curved transitions.
The pure coverage images confirm these are real land/sea changes. Both still
show a comparatively smooth and limited-detail coast. Natural-continent visual
quality remains unaccepted. No product browser, renderer or storage acceptance
was performed in this isolated comparison.

Evidence: `full-checks/first/verification.json`, SHA256
`ab2ec5bcdde2f6ea3f01a979a9151c234ec34b8a82458df2f19b9bd9284844ff`.
Image roots: `full-output/first/baseline/` and `full-output/first/candidate/`.
