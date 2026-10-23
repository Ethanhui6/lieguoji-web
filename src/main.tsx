import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// The game handles pinch and pan itself. Stop the browser's own page zoom and
// pinch gestures (iOS Safari would otherwise zoom out to the tab overview).
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
