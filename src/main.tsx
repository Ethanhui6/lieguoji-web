import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// Select before importing RootApp: the legacy component initializes its world
// and storage even when one of its own screens is hidden.
const query = new URLSearchParams(window.location.search);
// ?original=1 is the side-by-side reconstruction of the original map frame.
const Entry = query.get('original') === '1' ? lazy(() => import('./fms/original/OriginalMapView'))
  : query.get('fms') === '1' ? lazy(() => import('./fms/FmsApp')) : lazy(() => import('./LegacyEntry'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
