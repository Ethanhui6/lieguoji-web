import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// Select before importing RootApp: the legacy component initializes its world
// and storage even when one of its own screens is hidden.
const Entry = new URLSearchParams(window.location.search).get('fms') === '1'
  ? lazy(() => import('./fms/FmsApp')) : lazy(() => import('./LegacyEntry'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
