# PH07 mobile native confirmation — failure preserved and canvas gesture fix verified narrowly

2026-09-28. This records local diagnostic observations, not a mobile flow PASS. No retries or DOM click/handler invocation were used to save. Root owns final validation and release gates.

The real mobile flow failed first at a premature saved-terrain read, and again after waiting for the actual revision: `flow-browser/mobile-first` and `mobile-save-repair` remain failed. A ready preview is not a durable commit. The second failure stayed at revision 0 for the original 120-second commit wait.

Scope correction for the earlier preview 18 evidence: `tests/atlas-add-detail-coast.spec.ts` used `.click()` for toolbar/save buttons and touch for drawing and picking. Its mobile result is not evidence that confirmation/save already passed with native touchscreen input. The native `.tap()` confirmation added for PH07 exposed an unverified interaction boundary rather than establishing a regression from a previously proven all-touch save.

| Preserved diagnostic directory | Actual observation |
| --- | --- |
| `touch-confirm-diagnostic` | One standard `locator.tap()` hit the same enabled confirmation button. Pointer/touch down/up were trusted and not prevented, but there was no compatibility mouse/click event; revision 0. Initial preview-server startup failure is retained separately. |
| `touch-scroll-settled-diagnostic` | Actual scrollend plus two stable animation frames before the sole tap did not restore click; revision 0. Window-bubble and after-dispatch defaultPrevented remained false. |
| `touch-capability-diagnostic` | Pure local button/canvas HTML: before and after the same CDP contour gesture, click count 1→2 whether its CDP session was detached or retained. Not product acceptance. |
| `touch-capture-scroll-diagnostic` | Pure HTML with actual canvas pointer capture/release, window capture pointerup and scrollable body: count 1→2. Extra canvas pointerdown preventDefault control also clicked normally; that prevention is not present in the actual renderer's pointerdown. |
| `touch-held-confirm-diagnostic` | Fresh actual page, one native contact held about 86ms: no compatibility mouse/click event, revision 0. Longer input duration is not a demonstrated fix. |
| `touch-footer-confirm-diagnostic` | Candidate moves confirmation/cancel into the existing fixed inspector footer. Types and local build succeeded. Original single `locator.tap()` still produced no click; real revision-1 wait timed out. `events.json.durableFailure` contains the failure. The observational test runner completed; this is explicitly **not** a successful save. |
| `touch-dom-clone-diagnostic` | Inspector MutationObserver found 0 mutations during the failed native tap. Static clone substep was not added because a preparation replacement did not match source newlines; this round must not be claimed as a clone test. Frozen source records exactly what ran. |
| `touch-dom-clone-second-diagnostic` | Corrected clone substep: actual running page again had 0 click / 0 inspector mutation / revision 0. Exact static DOM + CSS, with application scripts removed and the same H2 focused, produced mousedown→mouseup→click from one native tap. Static DOM/CSS alone does not reproduce the failure. |

At the end of this worker's static-clone investigation the cause was **not yet identified**. Those observations did not prove a React/Pixi defect or exclude previous input-state effects. This worker ran no more causal matrices after the static clone result. Root's subsequent diagnosis and narrow fix verification are recorded below. No touchend-save handler, fabricated click, duplicate tap or relaxed terrain threshold was added.

Actual input configuration: Playwright 1.63.0, bundled Chromium **153.0.8010.12**, Pixel 7 / Android 14 UA, viewport 412×839, screen 412×915, scale 2.625, `isMobile:true`, `hasTouch:true`. Standard call: `page.getByRole('button', { name: '确认生成并保存', exact: true }).tap()`.

Passive product observation uses document capture/bubble plus window bubble and a queued after-dispatch read; all listeners are passive. It records target identity, hit-tested element, rectangle, focus, scroll, defaultPrevented and real revision/state. MutationObserver observes only the test page's inspector. Browser context and IndexedDB belong only to each newly created test draft.

The footer candidate changes only `AtlasStudio.tsx`, `DetailCoastPanel.tsx`, `atlas-studio.css` and the viewport regression in `atlas-hydrology.spec.ts`. Standard onClick and existing run(confirm/discardTerrain) callbacks remain. Long feedback scrolls independently; mobile sheets retain a minimum action space. Candidate source copies, exact hashes and all dist-file hashes are in `touch-footer-confirm-diagnostic`. `dist/build.json` alone is unchanged by these UI edits and must not be used as the sole bundle identity.

Raw traces are preserved as ZIPs. The first configurations placed JSON reporter output beneath `.autopilot/ph07/.autopilot/ph07`; their actual JSON bytes were copied into the corresponding evidence directories without rewriting content. Original raw files remain. The archive script records diagnostics separately from successful/failed full flow rounds and has not been executed by this worker.

## Root follow-up: browser fling suppression and a canvas-scoped fix

Root's `touch-runtime-diagnostic` records the full input sequence from page start and wraps `Event.prototype.preventDefault` to record calls/stacks while still invoking its original implementation. The actual `all-input.json` contains no preventDefault call. The first confirmation tap had pointer/touch events but no click; one later normal map-tool tap did produce compatibility mouse/click events, so the entire page had not permanently lost clicking. `end.json` preserves revision 0 after this diagnosis.

The actual Chromium input trace in `touch-chrome-input-trace/chrome-input.json` locates the first confirmation's GestureTapDown / GestureShowPress / GestureTap in **FilteredForFling / FilterTapSuppression**. This identifies the missing click at Chromium's gesture filtering stage after the preceding captured canvas stroke. It is more specific evidence than the earlier DOM-level observations, and does not turn those failed rounds into passes. The raw roughly 3 MB trace, complete input log, terminal state, frozen diagnostic source/config, Playwright result and original trace ZIP remain available.

Root then added non-passive `touchstart` / `touchmove` consumption only on the canvas in `renderer.ts`. Existing Pointer Events still perform drawing, panning and pinch input. The handlers consume the browser's default gesture only when cancelable; inspector scrolling and normal buttons are outside that handler scope. This is not a touchend-save handler and does not directly call a button callback.

The subsequent **`touch-consumed-confirm`** used a fresh actual page and one original native confirmation tap. Its recorded event chain includes **mousedown → mouseup → click**, its actual final revision is **1**, and `durableFailure` is **null**. The complete diagnostic run took **33,155.345 ms** (one expected, zero unexpected/skipped/flaky). `source-before.json` binds the tested renderer to SHA `7999dc1076f85aaadf64073d009325ee676bf18734dcdd20eb22aaad0d7e000a` and separately lists the retained footer candidate and formal browser test hashes.

This verifies the narrow native confirmation/save correction on the recorded emulated device. It is not the complete hydrology flow, final three-device browser acceptance, a physical-device result, or a whole-PH pass. Root is running the final affected checks and will schedule the three full browser flows separately. All preceding failures and unsuccessful layout/input hypotheses are retained in the archive plan; the worker has not executed the archive.
