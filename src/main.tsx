import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// Only the map owns pinch gestures. Native panel scrolling and control clicks
// must not be cancelled/replayed by a document-wide touchend handler.
// touch-action:none handles Pointer Events; Safari also emits gesture events.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => {
  if (e.target instanceof Element && e.target.closest('.fms-map,.c47-map')) e.preventDefault();
}, { passive: false });
// Long press shows no copy / save menu (text inputs keep theirs).
document.addEventListener('contextmenu', e => { const t = e.target as HTMLElement | null; if (!t?.closest('input,textarea,[contenteditable]')) e.preventDefault(); });
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
