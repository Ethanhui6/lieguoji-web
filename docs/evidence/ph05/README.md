# PH05 local technical evidence archive v2

This is local acceptance evidence, not a game release or deployment package.
Every original file under .autopilot/ph05 is mapped in archive-manifest.json;
successful, failed and interrupted evidence is preserved without rewriting.
Original source files were not deleted, moved or changed.
Run logs must be captured outside .autopilot/ph05, otherwise the source changes
while it is being archived. Copy any required PH04 evidence/source snapshots
into the origin first and stop all writers before starting this archive.

Only a complete, validated archive-manifest.json establishes completion.
ARCHIVE_FAILED.json or any extra/unlisted file makes verification fail.
Do not overwrite an existing archive or restore directory to retry.

After reviewing the saved restoration script, run from the exact private
lieguoji-web Git root, using a fresh lowercase label:

    node docs/evidence/ph05/restore-evidence-v2.mjs --out=.autopilot/ph05-restored-review

Restoration writes only this new project-local directory. It reconstructs
.autopilot/ph05 below it, copies exact tools into .archive-tools, and verifies
every compressed object, original block, complete file and restored disk hash.
It does not run evaluators, a browser, simulation, tests, network or deployment.

Objects are independent gzip level 6 streams over at most 8 MiB original chunks.
The manifest retains ordered parts plus each original whole-file SHA256.
Repeated content is shared without losing any original relative file path.
Limits: 4 GiB/file, 32 GiB total original evidence, 100000 source files;
unsupported sizes stop explicitly rather than dropping evidence.

Exact current evaluator and collector bytes are in tool-sources; their original
source paths and hashes are recorded in the manifest. Existing historical tool
snapshots remain among the original files; missing historical versions are not
invented or replaced with the current evaluator.

To re-evaluate, use the restored directory as cwd and the saved exact evaluator
as the Node entrypoint. Pass the original .autopilot/ph05 report paths, and write
the new evaluation outside the restored original-evidence subtree. Keep original
reports/raw/screenshots and historical evaluations unchanged. New evaluatedAt
and absolute rawPath fields differ; compare the complete gates/statistics and
source/dist fingerprints rather than the entire new evaluation JSON hash.

For rendering, use summarize-atlas-rendering.mjs with all four original report
arguments (--headless-dpr1, --headless-dpr2, --headed-dpr1, --headed-dpr2).
For PH04 regression, use summarize-atlas.mjs with its four original report
arguments (--edits, --loads, --transport, --cancel). Neither script is changed.

Byte restoration is not performance acceptance, physical-device acceptance,
visual approval, or permission to push/deploy. All existing release gates apply.
