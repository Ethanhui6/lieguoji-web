import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// The game handles pinch and pan itself. Stop the browser's own page zoom and
// pinch gestures (iOS Safari would otherwise zoom out to the tab overview).
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// iOS Safari ignores user-scalable=no for double tap: a second tap within 300 ms is not a zoom.
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const now = performance.now(); if (now - lastTouchEnd < 300 && e.cancelable) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// Long press shows no copy / save menu (text inputs keep theirs).
document.addEventListener('contextmenu', e => { const t = e.target as HTMLElement | null; if (!t?.closest('input,textarea,[contenteditable]')) e.preventDefault(); });
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
