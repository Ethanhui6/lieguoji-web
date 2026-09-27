# Owned snapshot probe resume audit

Observed read-only at 2026-09-28 00:50–00:51 Asia/Hong_Kong. No fixture, test, benchmark, browser, or build was executed by this audit. No production or frozen candidate file was changed.

## Current evidence

- `checks/first/verification.json` is terminal and records the actual `__MACRO_GENERATOR_FINGERPRINT__ is not defined` Worker startup error. Its time window is `2026-09-27T12:40:15.026Z`–`2026-09-27T12:40:16.731Z`; `setup` is null, no cases ran, and `sourceStable` is true. This is a harness startup failure, not a performance result. Preserve this round.
- The current `run.mjs` really contains `snapshot-metrics.worker.ts?worker_file&type=module` at line 107 and loads genuine `vite.config.ts` definitions. SHA256: `ef4307173c64fbfe622f3028e95d2360657b16a4dede34ff0dcc044780f073ae`. The correction is on disk, not merely proposed.
- Current `ready-manifest.json` was created `2026-09-27T12:41:16.497Z`; SHA256 `08a115d7e772c2b958d1182c43da0f2f2482dc7f40c09edcd26c4f7ba334651a`. All **62** bound files currently match an explicitly allowed SHA. The frozen transactions candidate is still `5ee973e9d66697b4be0dc27c521d38e37d74f81ea68e13cbc8213ce9f21838dc`.
- `checks/worker-entry-fixed/source-before.json` exists (8,870 bytes, local timestamp 2026-09-27 20:41:17); all of its recorded source hashes still match current bytes.
- `checks/worker-entry-fixed/setup.json` exists (776 bytes, local timestamp 20:41:22). It records a real Worker `ready`: 512 coarse size, 1,024 coarse blocks, **4,096 sampled fine tiles**, **4,198,401 owned fine nodes**, 16,793,604 fine-array bytes, `scheduler.postTask(background)`, fixture 1,961.300 ms and public session open 1,890 ms. The fixture is explicitly synthetic and all-sea. Thus the fixed Worker entry got through initialization; setup timing is not snapshot acceptance.
- That round contains **only those two files**. There is no `private-full.raw.json`, other case result, `partial.json`, `source-after.json`, or `verification.json`. No terminal pass/fail or 250/500 ms result is established. `ready-manifest.json`'s `prepared-not-run` flag is preparation metadata and does not negate the actual setup evidence.
- Two read-only process observations found **zero** node/PowerShell processes whose command lines match the owned snapshot metrics probe or `run.mjs ... worker-entry-fixed`. No probe process was killed or restarted. The original tool session ID is unavailable to this auditor. The filesystem alone cannot explain why finalization did not run; do not invent a timeout, crash, cancellation, or test outcome.

## Narrow static observations

The runner writes setup before starting `private-full`; per-case raw and partial files are written only after each case returns. Consequently the retained files place the interruption after initialization and before the first case result was persisted, without proving that case completed. The script already has 120-second setup and case watchdogs and writes final verification in `finally`. Their absence from evidence is an interrupted/unfinalized round, not a reason to increase those deadlines or the 250 ms progress / 500 ms cancellation gates.

Static reading of the Worker/runner did not establish an additional reproducible code defect. This audit does not substitute for running the next controlled measurement.

## Next smallest executable action for root

1. Finish the currently allocated mobile/browser window and recheck no owned-probe process is live immediately before execution. If root recovers the original live tool handle, poll that handle first; an observation timeout alone is not permission to restart it.
2. With the observed missing process and no recovered live handle, retain both existing rounds and execute the unchanged, currently bound runner under a **fresh** label, e.g.:

   ```powershell
   node .autopilot/ph06/v4-owned-snapshot-metrics-staging/run.mjs resume-worker-entry-fixed --execute
   ```

   Do not reuse `first` or `worker-entry-fixed`; the runner correctly refuses existing output directories. No source rebind is currently necessary because all 62 bindings match. Preserve a returned session handle and poll it to a terminal result. Preserve the actual command output / terminal exit status.
3. Read all five actual cases plus final verification. Keep the public raw diagnostic distinct from the private snapshot gate, and keep both distinct from real product UI progress/cancel, natural visual, physical device, or whole PH06 acceptance. If the fresh round exposes a failure, retain it and repair the specific observed cause; do not rerun for a favorable timing sample.

The audit itself did not execute the suggested command and does not claim any new acceptance.
