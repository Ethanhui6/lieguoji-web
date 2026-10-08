# Real culture playable integration — local slice, 2026-10-08

Source checkpoint: `f12f16e` (verify final Git hash). The user explicitly corrected the priority: real culture was still invisible. This slice puts culture creation and identity interaction before monthly shipbuilding.

## Actual entry and data

The existing drawing editor now opens WorldEntry → CultureWorld47. Creation uses createFoundingForces47; it does not temporarily create old fantasy culture IDs. Twelve real culture profiles, fourteen independent religion choices, six polities, and both culture-generated / historical state-and-city names use the existing civilization47 catalog. People are culturally generated in both modes; no historical biographies are spliced into a fictional family.

Country and city names are actual world fields used by the shared Pixi PlayMap. Current office is derived from current polity/religion/culture; historical accession offices remain immutable. Running edits update upperCombat polity along with the identity and map name. Succession selects an existing family person and keeps their ID, age and relations. Nation religion does not automatically convert the entire population.

## Simulation and persistence

A dedicated Worker calls the actual47 military owner, splits at the 120-tick day boundary and runs settleArmyAutonomyDay47 before publishing a candidate. Army/fleet display positions come from the real travel ledgers, not legacy province/node centers. Inspecting a country does not pause the clock. Existing old-world sessions remain available separately.

The local cultural slice uses an independent `lieguoji-fms-culture47-journal-v1` IndexedDB namespace. It saves deterministic creation inputs plus accepted commands. Creation replays through original validation; every accepted command is executed through the same owner on load. The rule fingerprint covers runtime TS/JSON plus the dependency lock. Changed rules lock old records instead of silently reinterpreting them. Unknown schema locks both slots; recognized corrupt current can recover valid backup. Current revision must equal the global CAS token. The chosen valid previous is preserved on the next save. Late blocked open events are aborted/closed; aborted saves do not later write. Failed/stale commands never enter the journal.

This is not a completed raw-live47 / Store49 migration. It has a documented bound of 1000 days or 20000 accepted commands; replay time grows with the history. It has not been benchmarked at that upper bound. Old v46, its frozen fingerprint and the user's 5254 / 900-day world were not migrated, refreshed or overwritten.

## Checks and limits

80 affected tests passed, including creation/name/family and the new owner/storage tests. Full typecheck and full lint passed. 39 release/plan protection tests passed. Isolated production build contains 44 allowlisted artifacts. Browser evidence uses a fixed synthetic 676-point mainland; it does not assert original map visual equivalence. See browser.json and retained earlier harness failures (wrong status selector; default 5-second expect timeout during real replay). Do not call the 428x926 Chromium viewport an iPhone test.

The local culture mode has not yet connected automatic diplomacy, political split/restoration, religious spread, full war closeout or the pending monthly shipbuilding owner. Real47 movement scale remains uncalibrated; this is not a substitute for the old 900-day game or a claim of full original equivalence. Physical phone and user visual acceptance are pending. No push, upload, Pages/main changes or release-lock changes in this batch.
